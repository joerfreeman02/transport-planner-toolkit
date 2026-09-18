import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createTransientGitAuth, publicRemote } from './publish-snapshot.mjs';

const execFileAsync = promisify(execFile);
export const DEFAULT_REPOSITORY_SIZE_LIMIT_BYTES = 3_000_000_000;
export const SITE_HEALTH_MARKER_FILE = 'atlas-publication-site.json';
export const SITE_HEALTH_MARKER_SCHEMA = 'atlas-publication-site-v1';
const REPOSITORY_CONTRACT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function repositoryRemote(repository) { return publicRemote(`https://github.com/${repository}.git`); }
function unique(values) { return new Set(values).size === values.length; }
function normaliseUrl(value, label) {
  let url;
  try { url = new URL(String(value)); } catch { throw new Error(`${label} must be a valid HTTPS URL.`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${label} must be HTTPS without embedded credentials.`);
  return url;
}
function normaliseSiteUrl(value) { const url = new URL(String(value)); return url.href.endsWith('/') ? url.href : `${url.href}/`; }

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

export async function readDeployedConfiguration(configPath, fsImpl = fs) {
  try {
    const text = await fsImpl.readFile(path.resolve(configPath), 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Deployed ATLAS data-source configuration is present but malformed or unreadable: ${error.message}`);
  }
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

async function githubMetadata(repository, token, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'atlas-publication-preflight' } });
  if (!response.ok) throw new Error(`GitHub repository metadata returned HTTP ${response.status}.`);
  return response.json();
}

export async function checkRepositoryPermission({ repository, token, fetchImpl = globalThis.fetch }) {
  const metadata = await githubMetadata(repository, token, fetchImpl);
  if (metadata.permissions?.push !== true) throw new Error('authenticated token does not report push permission.');
  return { push: true, metadata };
}

export async function checkSiteHealthMarker({ siteUrl, fetchImpl = globalThis.fetch }) {
  const markerUrl = new URL(SITE_HEALTH_MARKER_FILE, normaliseSiteUrl(siteUrl));
  const response = await fetchImpl(markerUrl, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`site-health marker returned HTTP ${response.status}.`);
  let marker;
  try { marker = JSON.parse(await response.text()); } catch { throw new Error('site-health marker was not valid JSON.'); }
  if (marker?.schema !== SITE_HEALTH_MARKER_SCHEMA) throw new Error(`site-health marker schema was ${marker?.schema ?? '<missing>'}, expected ${SITE_HEALTH_MARKER_SCHEMA}.`);
  return { ok: true, markerUrl: markerUrl.href, schema: marker.schema };
}

export async function checkRemoteStorageHealth({ remote, token, metadata = null, sizeLimitBytes = DEFAULT_REPOSITORY_SIZE_LIMIT_BYTES, exec = execFileAsync, fetchImpl = globalThis.fetch }) {
  let target = remote;
  try { if (remote.startsWith('file://')) target = new URL(remote); } catch {}
  const localTarget = target instanceof URL ? target.pathname : target;
  if (typeof localTarget === 'string' && !/^(?:https?|ssh|git):\/\//i.test(localTarget)) {
    try {
      const result = await exec('git', ['--git-dir', localTarget, 'count-objects', '-v'], { maxBuffer: 1024 * 1024 });
      const values = Object.fromEntries(result.stdout.split(/\r?\n/).map(line => line.split(': ')).filter(pair => pair.length === 2));
      const sizeBytes = (Number(values.size ?? 0) + Number(values['size-pack'] ?? 0)) * 1024;
      if (sizeBytes > sizeLimitBytes) throw new Error(`Publication repository ${remote} reports ${sizeBytes} bytes of Git object storage, exceeding the conservative ${sizeLimitBytes}-byte health threshold.`);
      return { status: 'measured', source: 'git-count-objects', remote, sizeBytes, sizeLimitBytes, warning: null };
    } catch (error) {
      if (error.message.includes('health threshold')) throw error;
      return { status: 'unavailable', remote, sizeLimitBytes, warning: `Publication repository size could not be measured for ${remote}; record hosting-provider size during the first live cycle.` };
    }
  }
  const repository = remote.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i)?.[1];
  if (repository) {
    const reportedSizeBytes = Number(metadata?.size) * 1024;
    if (Number.isFinite(reportedSizeBytes) && reportedSizeBytes >= 0) {
      if (reportedSizeBytes > sizeLimitBytes) throw new Error(`GitHub repository ${repository} reports ${reportedSizeBytes} bytes, exceeding the conservative ${sizeLimitBytes}-byte health threshold.`);
      return { status: 'measured', source: 'github-repository-metadata', repository, reportedSizeKilobytes: Number(metadata.size), sizeBytes: reportedSizeBytes, sizeLimitBytes, warning: null };
    }
    if (!metadata) {
      try {
        const freshMetadata = await githubMetadata(repository, token, fetchImpl);
        return checkRemoteStorageHealth({ remote, token, metadata: freshMetadata, sizeLimitBytes, exec, fetchImpl });
      } catch (error) {
        return { status: 'unavailable', source: 'github-repository-metadata', repository, sizeLimitBytes, warning: `GitHub repository size is unavailable for ${repository}; threshold enforcement is not claimed until hosting-provider metadata is available (${error.message}).` };
      }
    }
    return { status: 'unavailable', source: 'github-repository-metadata', repository, sizeLimitBytes, warning: `GitHub repository size is unavailable for ${repository}; threshold enforcement is not claimed until hosting-provider metadata is available.` };
  }
  return { status: 'unavailable', remote, sizeLimitBytes, warning: 'Remote physical Git object size is unavailable for this remote; threshold enforcement is not claimed.' };
}

export async function preflightPublication({ busRepository, busSiteUrl, banksJson, activeConfig = null, token, branch = 'pages-publish', toolkitRepository = 'joerfreeman02/transport-planner-toolkit', probe = defaultProbe, permissionProbe = checkRepositoryPermission, siteHealthProbe = checkSiteHealthMarker, healthCheck = checkRemoteStorageHealth, sizeLimitBytes = DEFAULT_REPOSITORY_SIZE_LIMIT_BYTES, fetchImpl = globalThis.fetch }) {
  const banks = parsePublicationBanks(banksJson);
  const contract = synchronousContractChecks({ busRepository, busSiteUrl, banks, activeConfig, toolkitRepository });
  const errors = [...contract.errors];
  if (!token) errors.push('ATLAS_REFERENCE_DATA_TOKEN is required for production publication preflight.');
  if (errors.length) throw new Error(`Production publication preflight failed before acquisition:\n- ${errors.join('\n- ')}`);
  const repositories = [{ identity: busRepository, siteUrl: busSiteUrl, label: 'Bus' }, ...banks.flatMap(bank => bank.roots.map(root => ({ identity: root.repository, siteUrl: root.siteUrl ?? root.baseUrl, label: `TNDS ${bank.id}/${root.id}` })))];
  const probes = [];
  for (const repository of repositories) {
    const remote = repositoryRemote(repository.identity);
    try {
      const branchResult = await probe({ remote, branch, token });
      if (!branchResult.branchPresent) throw new Error(`required ${branch} branch is absent; seed it with the approved site-health marker before production.`);
      const permission = await permissionProbe({ repository: repository.identity, token, fetchImpl });
      if (permission?.push !== true) throw new Error('authenticated token does not report push permission.');
      const marker = await siteHealthProbe({ siteUrl: repository.siteUrl, fetchImpl });
      const health = await healthCheck({ remote, token, metadata: permission.metadata ?? null, sizeLimitBytes, fetchImpl });
      probes.push({ label: repository.label, repository: repository.identity, branchPresent: true, writePermission: true, siteHealth: { ok: marker.ok, markerUrl: marker.markerUrl }, health: { status: health.status, source: health.source ?? null, sizeBytes: health.sizeBytes ?? null, reportedSizeKilobytes: health.reportedSizeKilobytes ?? null, sizeLimitBytes, warning: health.warning ?? null } });
    } catch (error) {
      errors.push(`${repository.label} (${repository.identity}) preflight failed: ${error.message}`);
    }
  }
  if (errors.length) throw new Error(`Production publication preflight failed before acquisition:\n- ${errors.join('\n- ')}`);
  return { ok: true, branch, activeBank: contract.activeBank, candidateBank: contract.candidateBank, bootstrap: contract.bootstrap, repositories: probes, warnings: probes.map(item => item.health.warning).filter(Boolean) };
}

function fixtureDependencies(fixture) {
  return {
    probe: async () => ({ branchPresent: fixture.branchPresent !== false }),
    permissionProbe: async () => ({ push: fixture.push !== false, metadata: { size: fixture.sizeKilobytes ?? 1 } }),
    siteHealthProbe: async ({ siteUrl }) => { if (fixture.marker === false) throw new Error(`site-health marker unavailable at ${siteUrl}.`); return { ok: true, markerUrl: `${normaliseSiteUrl(siteUrl)}${SITE_HEALTH_MARKER_FILE}` }; },
    healthCheck: async ({ remote, sizeLimitBytes }) => { const sizeBytes = (fixture.sizeKilobytes ?? 1) * 1024; if (sizeBytes > sizeLimitBytes) throw new Error(`GitHub repository ${remote} exceeds the configured health threshold.`); return { status: 'measured', source: 'fixture', sizeBytes, sizeLimitBytes, warning: null }; }
  };
}

async function main() {
  const option = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; };
  const configPath = option('--config');
  const fixturePath = option('--fixture');
  const activeConfig = configPath ? await readDeployedConfiguration(configPath) : null;
  const fixture = fixturePath ? JSON.parse(await fs.readFile(path.resolve(fixturePath), 'utf8')) : null;
  const dependencies = fixture ? fixtureDependencies(fixture) : {};
  const result = await preflightPublication({ busRepository: process.env.ATLAS_BUS_DATA_REPOSITORY, busSiteUrl: process.env.ATLAS_BUS_DATA_SITE_URL, banksJson: process.env.ATLAS_TNDS_BANKS_JSON, activeConfig, token: process.env.ATLAS_REFERENCE_DATA_TOKEN, branch: process.env.ATLAS_REFERENCE_DATA_BRANCH || 'pages-publish', toolkitRepository: process.env.GITHUB_REPOSITORY || 'joerfreeman02/transport-planner-toolkit', sizeLimitBytes: Number(process.env.ATLAS_PUBLICATION_REPOSITORY_SIZE_LIMIT_BYTES || DEFAULT_REPOSITORY_SIZE_LIMIT_BYTES), ...dependencies });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
