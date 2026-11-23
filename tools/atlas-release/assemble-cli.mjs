import fs from 'node:fs/promises';
import path from 'node:path';
import { assembleAppOnlyArtifact } from './release-identity.mjs';

const [appRoot, snapshotRoot, outputRoot, inputPath] = process.argv.slice(2);
if (!appRoot || !snapshotRoot || !outputRoot || !inputPath) throw new Error('Usage: node assemble-cli.mjs <app-root> <snapshot-root> <output-root> <identity-input.json>');
const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const identity = await assembleAppOnlyArtifact({ appRoot, snapshotRoot, outputRoot, ...input });
console.log(JSON.stringify({ result: 'assembled', identity }, null, 2));
