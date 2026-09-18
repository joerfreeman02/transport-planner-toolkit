import fs from 'node:fs/promises';
import path from 'node:path';
import { selectOppositeTndsBank } from './publication.mjs';

function option(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }
const configPath = option('--config');
const banksJson = option('--banks-json');
const output = option('--output');
const repositoryRoot = option('--repository-root') || 'reference-data/tnds';
if (!configPath || !banksJson || !output) throw new Error('Usage: node select-bank.mjs --config <config.json> --banks-json <json> --output <plan.json>');
const previousConfig = JSON.parse(await fs.readFile(path.resolve(configPath), 'utf8').catch(() => '{}'));
const banks = JSON.parse(banksJson).map(bank => ({ id: String(bank.id), roots: (bank.roots ?? []).map(root => ({ ...root, id: String(root.id) })) }));
const activeBankId = previousConfig.datasets?.tnds?.activeBank ?? null;
const candidate = selectOppositeTndsBank(activeBankId, banks);
const selectedBanks = banks.map(bank => ({ ...bank, roots: bank.roots.map(root => bank.id === candidate.id ? { ...root, remoteRepository: root.repository, repository: path.join(repositoryRoot, bank.id, root.id) } : root) }));
const plan = { schema: 'atlas-tnds-dual-bank-plan-v1', activeBankId, candidateBankId: candidate.id, banks: selectedBanks, previousConfig: previousConfig.datasets ? previousConfig : null };
await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.writeFile(path.resolve(output), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ activeBankId, candidateBankId: candidate.id, roots: candidate.roots.map(root => root.id) }, null, 2));
