import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureCandidateDatasets, measurePublicationTree, selectOppositeTndsBank } from './publication.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const candidateSiteArg = option('--candidate-site');
  if (!candidateSiteArg) throw new Error('Missing --candidate-site');
  const outputArg = option('--output');
  const candidateSite = path.resolve(candidateSiteArg);
  const busOnly = process.argv.includes('--bus-only');
  const rootIdsJson = option('--root-ids-json');
  let result;
  if (busOnly) result = { diagnosticSchema: 'atlas-bus-only-capacity-diagnostic-v1', diagnosticOnly: true, productionEligible: false, bus: await measurePublicationTree(path.join(candidateSite, 'atlas', 'data', 'bus')), tnds: null };
  else if (rootIdsJson) {
    const rootIds = JSON.parse(rootIdsJson);
    if (!Array.isArray(rootIds) || !rootIds.length || rootIds.some(value => typeof value !== 'string' || !value.trim())) throw new Error('--root-ids-json must be a non-empty JSON array of root IDs.');
    result = await measureCandidateDatasets(candidateSite, { rootIds });
  }
  else {
    const configArg = option('--config');
    const banksArg = option('--banks-json');
    if (!configArg || !banksArg) throw new Error('Full candidate measurement requires --config and --banks-json to measure the actual inactive TNDS bank.');
    const activeConfig = JSON.parse(await fs.readFile(path.resolve(configArg), 'utf8'));
    const banks = JSON.parse(banksArg);
    if (!Array.isArray(banks)) throw new Error('Configured TNDS banks must be a JSON array.');
    const candidateBank = selectOppositeTndsBank(activeConfig.datasets?.tnds?.activeBank ?? null, banks);
    if (!candidateBank?.id || !Array.isArray(candidateBank.roots) || !candidateBank.roots.length) throw new Error('The inactive TNDS bank does not have configured roots for capacity measurement.');
    result = await measureCandidateDatasets(candidateSite, { rootIds: candidateBank.roots.map(root => String(root.id)), rootRegionAssignments: candidateBank.roots });
    result.tnds.candidateBankId = String(candidateBank.id);
  }
  if (outputArg) {
    const output = path.resolve(outputArg);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Candidate measurement failed: ${error.message}`); process.exitCode = 1; });
}
