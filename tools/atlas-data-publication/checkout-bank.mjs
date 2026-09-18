import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { publicRemote } from './publish-snapshot.mjs';

const execFileAsync = promisify(execFile);

function option(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }

async function git(repository, args, environment = process.env) {
  return (await execFileAsync('git', ['-C', repository, ...args], { env: environment, maxBuffer: 10 * 1024 * 1024 })).stdout.trim();
}

async function clearWorkingTree(target) {
  for (const entry of await fs.readdir(target)) if (entry !== '.git') await fs.rm(path.join(target, entry), { recursive: true, force: true });
}

export async function preparePublicationRepository({ root, branch = 'pages-publish', token = process.env.ATLAS_REFERENCE_DATA_TOKEN }) {
  if (!token) throw new Error(`ATLAS_REFERENCE_DATA_TOKEN is required to prepare publication repository ${root.id}.`);
  const remoteRepository = root.remoteRepository ?? root.repository;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(remoteRepository)) throw new Error(`Unsafe publication repository contract for ${root.id}.`);
  const target = path.resolve(root.repository);
  const remote = publicRemote(`https://github.com/${remoteRepository}.git`);
  await fs.mkdir(target, { recursive: true });
  await clearWorkingTree(target);
  await git(target, ['init', '--quiet']);
  try { await git(target, ['remote', 'remove', 'origin']); } catch {}
  await git(target, ['remote', 'add', 'origin', remote]);
  return { id: root.id, repository: target, remote, branch, preparedWithoutFetch: true };
}

export async function prepareBankRepositories({ plan, branch = 'pages-publish', token = process.env.ATLAS_REFERENCE_DATA_TOKEN }) {
  const bank = plan?.banks?.find(item => item.id === plan.candidateBankId);
  if (!bank) throw new Error(`Candidate bank ${plan?.candidateBankId ?? '<missing>'} is absent from the plan.`);
  const roots = [];
  for (const root of bank.roots) roots.push(await preparePublicationRepository({ root, branch, token }));
  return { bank: bank.id, roots };
}

async function main() {
  const planPath = option('--plan');
  const branch = option('--branch') || 'pages-publish';
  if (!planPath) throw new Error('Usage: node checkout-bank.mjs --plan <plan.json> [--branch pages-publish]');
  const plan = JSON.parse(await fs.readFile(path.resolve(planPath), 'utf8'));
  console.log(JSON.stringify(await prepareBankRepositories({ plan, branch }), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`TNDS publication repository preparation failed: ${error.message}`); process.exitCode = 1; });
