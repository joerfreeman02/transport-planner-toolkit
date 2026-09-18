import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createTransientGitAuth, publicRemote } from './publish-snapshot.mjs';

const execFileAsync = promisify(execFile);
export const DEFAULT_REPOSITORY_SIZE_LIMIT_BYTES = 3_000_000_000;
const REPOSITORY_CONTRACT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function repositoryRemote(repository) { return publicRemote(`https://github.com/${repository}.git`); }
function unique(values) { return new Set(values).size === values.length; }
function normaliseUrl(value, label) {
  let url;
  try { url = new URL(String(value)); } catch { throw new Error(`${label} must be a valid HTTPS URL.`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${label} must be HTTPS without embedded credentials.`);
  return url;
}

function validatePagesContract(siteUrl, repository, label) {
  const url = normaliseUrl(siteUrl, label);
  if (url.hostname.endsWith('.github.io')) {
    const owner = url.hostname.slice(0, -'.github.io'.length).toLowerCase();
    const [repositoryOwner, repositoryName] = repository.toLowerCase().split('/');
    const firstPath = url.pathname.split('/').filter(Boolean)[0] ?? '';
    if (owner !== repositoryOwner || firstPath !== repositoryName) throw new Error(`${label} must match GitHub Pages project-site contract https://${repositoryOwner}.github.io/${repositoryName}/.`);
  }
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

export function parsePublicationBanks(value) {
  let parsed;
  try { parsed = typeof value === 'string' ? JSON.parse(value) : value; } catch { throw new Error('ATLAS_TNDS_BANKS_JSON is not valid JSON.'); }
  if (!Array.isArray(parsed)) throw new Error('ATLAS_TNDS_BANKS_JSON must be a JSON array of exactly two banks.');
  return parsed;
}

function synchronousContractChecks({ busRepository, busSiteUrl, banks, activeConfig, toolkitRepository }) {
  const errors = [];
  if (!REPOSITORY_CONTRACT.test(String(busRepository ?? ''))) errors.push('ATLAS_BUS_DATA_REPOSITORY must use the owner/repository contract.');
  if (String(busRepository).toLowerCase() === String(toolkitRepository).toLowerCase()) errors.push('ATLAS_BUS_DATA_REPOSITORY must not point to transport-planner-toolkit itself.');
  try { validatePagesContract(busSiteUrl, busRepository, 'ATLAS_BUS_DATA_SITE_URL'); } catch (error) { errors.push(error.message); }
  if (banks.length !== 2) errors.push(`ATLAS_TNDS_BANKS_JSON must configure exactly two banks; found ${banks.length}.`);
  const bankIds = banks.map(bank => String(bank?.id ?? ''));
  if (bankIds.some(id => !id)) errors.push('Every TNDS bank must have a non-empty id.');
  if (!unique(bankIds)) errors.push('TNDS bank IDs must be unique.');
  const rootIds = [];
  const repositories = [String(busRepository ?? '').toLowerCase()];
  const sites = [];
  try { sites.push(validatePagesContract(busSiteUrl, busRepository, 'ATLAS_BUS_DATA_SITE_URL')); } catch {}
  for (const bank of banks) {
    const roots = Array.isArray(bank?.roots) ? bank.roots : [];
    if (roots.length !== 3) errors.push(`TNDS bank ${bank?.id ?? '<missing>'} must contain exactly three roots.`);
    for (const root of roots) {
      const rootId = String(root?.id ?? '');
      const repository = String(root?.repository ?? '');
      rootIds.push(rootId);
      if (!rootId) errors.push(`TNDS bank ${bank?.id ?? '<missing>'} contains a root without an id.`);
      if (!REPOSITORY_CONTRACT.test(repository)) errors.push(`TNDS root ${rootId || '<missing>'} must use the owner/repository contract.`);
      if (repository.toLowerCase() === String(toolkitRepository).toLowerCase()) errors.push(`TNDS root ${rootId || '<missing>'} must not point to transport-planner-toolkit itself.`);
      repositories.push(repository.toLowerCase());
      try { sites.push(validatePagesContract(root?.siteUrl ?? root?.baseUrl, repository, `TNDS ${bank?.id ?? '<missing>'}/${rootId || '<missing>'} site URL`)); } catch (error) { errors.push(error.message); }
    }
  }
  if (!unique(rootIds)) errors.push('TNDS root IDs must be unique across both banks.');
  if (!unique(repositories)) errors.push('Publication repository identities must be unique, including the Bus repository.');
  if (!unique(sites)) errors.push('Public publication site URLs must be unique.');
  const activeBank = activeConfig?.datasets?.tnds?.activeBank ?? null;
  if (activeBank !== null && !bankIds.includes(String(activeBank))) errors.push(`Currently deployed active TNDS bank ${activeBank} is absent from ATLAS_TNDS_BANKS_JSON.`);
  const candidateBank = activeBank === null ? banks[0] : banks.find(bank => String(bank.id) !== String(activeBank));
  if (!candidateBank) errors.push('The inactive/candidate TNDS bank is not unambiguous.');
  const activeSites = new Set((activeConfig?.datasets?.tnds?.activeRoots ?? activeConfig?.datasets?.tnds?.roots ?? []).map(root => String(root.baseUrl ?? '').replace(/\/$/, '').toLowerCase()));
  const activeRootIds = new Set((activeConfig?.datasets?.tnds?.activeRoots ?? activeConfig?.datasets?.tnds?.roots ?? []).map(root => String(root.id ?? '')));
  for (const root of candidateBank?.roots ?? []) {
    if (activeRootIds.has(String(root.id))) errors.push(`Candidate TNDS root ${root.id} is the currently active root.`);
    if (activeSites.has(String(root.siteUrl ?? root.baseUrl ?? '').replace(/\/$/, '').toLowerCase())) errors.push(`Candidate TNDS root ${root.id} is the currently active publication site.`);
  }
  return { errors, activeBank: activeBank === null ? null : String(activeBank), candidateBank: candidateBank?.id ? String(candidateBank.id) : null, bootstrap: activeBank === null };
}

async function defaultProbe({ remote, branch, token }) {
  const authentication = await createTransientGitAuth({ remote, token });
  try {
    const result = await execFileAsync('git', ['ls-remote', remote, `refs/heads/${branch}`], { env: authentication.environment, maxBuffer: 2 * 1024 * 1024 });
    return { branchPresent: Boolean(result.stdout.trim()) };
  } finally { await authentication.cleanup(); }
}

export async function checkRemoteStorageHealth({ remote, sizeLimitBytes = DEFAULT_REPOSITORY_SIZE_LIMIT_BYTES, exec = execFileAsync }) {
  let target = remote;
  try { if (remote.startsWith('file://')) target = new URL(remote); } catch {}
  const localTarget = target instanceof URL ? target.pathname : target;
  if (typeof localTarget !== 'string' || /^(?:https?|ssh|git):\/\//i.test(localTarget)) return { status: 'unavailable', remote, warning: 'Remote physical Git object size is not exposed by authenticated git ls-remote; record repository size from the hosting provider during the first live cycle.' };
  try {
    const result = await exec('git', ['--git-dir', localTarget, 'count-objects', '-v'], { maxBuffer: 1024 * 1024 });
    const values = Object.fromEntries(result.stdout.split(/\r?\n/).map(line => line.split(': ')).filter(pair => pair.length === 2));
    const sizeBytes = (Number(values.size ?? 0) + Number(values['size-pack'] ?? 0)) * 1024;
    if (sizeBytes > sizeLimitBytes) throw new Error(`Publication repository ${remote} reports ${sizeBytes} bytes of Git object storage, exceeding the conservative ${sizeLimitBytes}-byte health threshold.`);
    return { status: 'measured', remote, sizeBytes, sizeLimitBytes, warning: null };
  } catch (error) {
    if (error.message.includes('health threshold')) throw error;
    return { status: 'unavailable', remote, warning: `Publication repository size could not be measured for ${remote}; record hosting-provider size during the first live cycle.` };
  }
}

export async function preflightPublication({ busRepository, busSiteUrl, banksJson, activeConfig = null, token, branch = 'pages-publish', toolkitRepository = 'joerfreeman02/transport-planner-toolkit', probe = defaultProbe, healthCheck = checkRemoteStorageHealth, sizeLimitBytes = DEFAULT_REPOSITORY_SIZE_LIMIT_BYTES }) {
  const banks = parsePublicationBanks(banksJson);
  const contract = synchronousContractChecks({ busRepository, busSiteUrl, banks, activeConfig, toolkitRepository });
  const errors = [...contract.errors];
  if (!token) errors.push('ATLAS_REFERENCE_DATA_TOKEN is required for production publication preflight.');
  if (errors.length) throw new Error(`Production publication preflight failed before acquisition:\n- ${errors.join('\n- ')}`);
  const repositories = [{ identity: busRepository, label: 'Bus' }, ...banks.flatMap(bank => bank.roots.map(root => ({ identity: root.repository, label: `TNDS ${bank.id}/${root.id}` })))];
  const probes = [];
  for (const repository of repositories) {
    const remote = repositoryRemote(repository.identity);
    try {
      const result = await probe({ remote, branch, token });
      const health = await healthCheck({ remote, sizeLimitBytes });
      probes.push({ label: repository.label, repository: repository.identity, branchPresent: result.branchPresent, bootstrapAllowed: !result.branchPresent, health: { status: health.status, sizeBytes: health.sizeBytes ?? null, warning: health.warning ?? null } });
    } catch (error) {
      errors.push(`${repository.label} (${repository.identity}) is not reachable with authenticated git ls-remote: ${error.message}`);
    }
  }
  if (errors.length) throw new Error(`Production publication preflight failed before acquisition:\n- ${errors.join('\n- ')}`);
  return { ok: true, branch, activeBank: contract.activeBank, candidateBank: contract.candidateBank, bootstrap: contract.bootstrap, repositories: probes, warnings: probes.map(item => item.health.warning).filter(Boolean) };
}

async function main() {
  const option = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; };
  const configPath = option('--config');
  const activeConfig = configPath ? JSON.parse(await fs.readFile(path.resolve(configPath), 'utf8')) : null;
  const result = await preflightPublication({ busRepository: process.env.ATLAS_BUS_DATA_REPOSITORY, busSiteUrl: process.env.ATLAS_BUS_DATA_SITE_URL, banksJson: process.env.ATLAS_TNDS_BANKS_JSON, activeConfig, token: process.env.ATLAS_REFERENCE_DATA_TOKEN, branch: process.env.ATLAS_REFERENCE_DATA_BRANCH || 'pages-publish', toolkitRepository: process.env.GITHUB_REPOSITORY || 'joerfreeman02/transport-planner-toolkit', sizeLimitBytes: Number(process.env.ATLAS_PUBLICATION_REPOSITORY_SIZE_LIMIT_BYTES || DEFAULT_REPOSITORY_SIZE_LIMIT_BYTES) });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
