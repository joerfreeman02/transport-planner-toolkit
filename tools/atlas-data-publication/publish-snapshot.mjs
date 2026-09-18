import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

async function git(repository, args, environment = process.env) {
  const result = await execFileAsync('git', ['-C', repository, ...args], { env: environment, maxBuffer: 10 * 1024 * 1024 });
  return result.stdout.trim();
}

export function publicRemote(remote) {
  const value = String(remote ?? '');
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.username || url.password) { url.username = ''; url.password = ''; }
    return url.toString();
  } catch {
    return value;
  }
}

export function isGithubHttpsRemote(remote) {
  try {
    const url = new URL(publicRemote(remote));
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'github.com';
  } catch {
    return false;
  }
}

export async function createTransientGitAuth({ remote, token, baseEnvironment = process.env }) {
  if (!isGithubHttpsRemote(remote)) return { environment: baseEnvironment, temporaryDirectory: null, askpassPath: null, cleanup: async () => {} };
  if (!token) throw new Error('GitHub HTTPS publication requires ATLAS_REFERENCE_DATA_TOKEN; no credential was supplied to publishSnapshot.');
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-publication-askpass-'));
  const askpassPath = path.join(temporaryDirectory, 'askpass.sh');
  await fs.writeFile(askpassPath, '#!/bin/sh\ncase "$1" in\n  *[Uu]sername*) printf "%s\\n" "x-access-token" ;;\n  *) printf "%s\\n" "$ATLAS_GIT_TOKEN" ;;\nesac\n', { mode: 0o700 });
  return {
    environment: { ...baseEnvironment, GIT_ASKPASS: askpassPath, GIT_TERMINAL_PROMPT: '0', ATLAS_GIT_TOKEN: token },
    temporaryDirectory,
    askpassPath,
    cleanup: async () => fs.rm(temporaryDirectory, { recursive: true, force: true })
  };
}

async function copySnapshot(repository, snapshot) {
  for (const entry of await fs.readdir(repository)) {
    if (entry === '.git') continue;
    await fs.cp(path.join(repository, entry), path.join(snapshot, entry), { recursive: true });
  }
}

export async function publishSnapshot({ repository, branch = 'pages-publish', message = 'Publish ATLAS reference-data snapshot', token = process.env.ATLAS_REFERENCE_DATA_TOKEN }) {
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes('..')) throw new Error(`Unsafe publication branch: ${branch}`);
  const remote = await git(repository, ['config', '--get', 'remote.origin.url']);
  if (!remote) throw new Error(`Publication repository ${repository} has no origin remote.`);
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-publication-snapshot-'));
  try {
    await copySnapshot(repository, temporaryRoot);
    await git(temporaryRoot, ['init', '--quiet']);
    await git(temporaryRoot, ['config', 'user.name', 'github-actions[bot]']);
    await git(temporaryRoot, ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
    await git(temporaryRoot, ['add', '-A']);
    await git(temporaryRoot, ['commit', '--quiet', '-m', message]);
    const commit = await git(temporaryRoot, ['rev-parse', 'HEAD']);
    const authentication = await createTransientGitAuth({ remote, token });
    try {
      const safeRemote = publicRemote(remote);
      const expected = (await git(temporaryRoot, ['ls-remote', safeRemote, `refs/heads/${branch}`], authentication.environment)).split(/\s+/)[0] || '';
      await git(temporaryRoot, ['push', `--force-with-lease=refs/heads/${branch}:${expected}`, safeRemote, `HEAD:${branch}`], authentication.environment);
    } finally {
      await authentication.cleanup();
    }
    // Never return the Git remote: actions/checkout may have embedded a token
    // in it, and callers serialise this result into workflow output.
    return { branch, commit, repository: path.basename(path.resolve(repository)) };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  const option = name => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
  };
  const repository = option('--repository');
  const branch = option('--branch') || 'pages-publish';
  const message = option('--message') || 'Publish ATLAS reference-data snapshot';
  if (!repository) throw new Error('Missing --repository');
  console.log(JSON.stringify(await publishSnapshot({ repository: path.resolve(repository), branch, message }), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Reference-data snapshot publication failed: ${error.message}`); process.exitCode = 1; });
}
