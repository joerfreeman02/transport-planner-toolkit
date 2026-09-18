import fs from 'node:fs/promises';
import path from 'node:path';
import { publishSnapshot } from './publish-snapshot.mjs';
function option(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }
const planPath = option('--plan');
const branch = option('--branch') || 'pages-publish';
if (!planPath) throw new Error('Usage: node publish-bank.mjs --plan <plan.json> [--branch pages-publish]');
const plan = JSON.parse(await fs.readFile(path.resolve(planPath), 'utf8'));
const bank = plan.banks.find(item => item.id === plan.candidateBankId);
if (!bank) throw new Error(`Candidate bank ${plan.candidateBankId} is absent from the plan.`);
const published = [];
for (const root of bank.roots) published.push(await publishSnapshot({ repository: path.resolve(root.repository), branch, message: `Publish ATLAS TNDS bank ${bank.id} root ${root.id}` }));
console.log(JSON.stringify({ bank: bank.id, roots: published }, null, 2));
