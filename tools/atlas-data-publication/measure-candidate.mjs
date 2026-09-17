import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureCandidateDatasets } from './publication.mjs';

async function main() {
  const candidateIndex = process.argv.indexOf('--candidate-site');
  if (candidateIndex < 0 || !process.argv[candidateIndex + 1]) throw new Error('Missing --candidate-site');
  const outputIndex = process.argv.indexOf('--output');
  const result = await measureCandidateDatasets(path.resolve(process.argv[candidateIndex + 1]));
  if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
    const output = path.resolve(process.argv[outputIndex + 1]);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Candidate measurement failed: ${error.message}`); process.exitCode = 1; });
}
