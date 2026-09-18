import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
function option(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }
const planPath = option('--plan');
const token = option('--token');
const branch = option('--branch') || 'pages-publish';
if (!planPath || !token) throw new Error('Usage: node checkout-bank.mjs --plan <plan.json> --token <token> [--branch pages-publish]');
const plan = JSON.parse(await fs.readFile(path.resolve(planPath), 'utf8'));
const bank = plan.banks.find(item => item.id === plan.candidateBankId);
if (!bank) throw new Error(`Candidate bank ${plan.candidateBankId} is absent from the plan.`);
const askpassDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-git-askpass-'));
const askpass = path.join(askpassDirectory, 'askpass.sh');
await fs.writeFile(askpass, '#!/bin/sh\ncase "$1" in\n  *[Uu]sername*) printf "%s\\n" "x-access-token" ;;\n  *) printf "%s\\n" "$ATLAS_GIT_TOKEN" ;;\nesac\n', { mode: 0o700 });
try {
  for (const root of bank.roots) {
    const remoteRepository = root.remoteRepository ?? root.repository;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(remoteRepository)) throw new Error(`Unsafe publication repository contract for ${root.id}.`);
    const target = path.resolve(root.repository);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const remote = `https://github.com/${remoteRepository}.git`;
    await execFileAsync('git', ['clone', '--depth', '1', '--branch', branch, remote, target], { env: { ...process.env, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: '0', ATLAS_GIT_TOKEN: token }, maxBuffer: 10 * 1024 * 1024 });
  }
} finally {
  await fs.rm(askpassDirectory, { recursive: true, force: true });
}
console.log(JSON.stringify({ bank: bank.id, roots: bank.roots.map(root => root.id) }, null, 2));
