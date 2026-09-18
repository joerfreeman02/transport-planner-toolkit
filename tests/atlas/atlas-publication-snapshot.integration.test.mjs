import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { publishSnapshot } from '../../tools/atlas-data-publication/publish-snapshot.mjs';
import { stageBoundedPublication } from '../../tools/atlas-data-publication/publication.mjs';

const execFileAsync = promisify(execFile);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-publication-git-integration-'));
const candidate = path.join(temp, 'candidate');
const repository = path.join(temp, 'publication-repository');
const remote = path.join(temp, 'publication-remote.git');
const run = async (cwd, args) => (await execFileAsync('git', ['-C', cwd, ...args], { maxBuffer: 10 * 1024 * 1024 })).stdout.trim();
const bareRun = async args => (await execFileAsync('git', ['--git-dir', remote, ...args], { maxBuffer: 10 * 1024 * 1024 })).stdout.trim();

await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus', 'services'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services'), { recursive: true });
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-data-v1', generatedAt: '2026-09-17T00:00:00Z' }));
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'services', '100-se.json.gz'), 'bus publication 1');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v1', generatedAt: '2026-09-17T00:00:00Z', expectedRegions: ['SE'] }));
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services', '100-se.json'), 'tnds publication 1');

await run(temp, ['init', '--bare', 'publication-remote.git']);
await run(temp, ['init', '--quiet', 'publication-repository']);
await run(repository, ['remote', 'add', 'origin', remote]);

const first = await stageBoundedPublication({ candidateSite: candidate, repository, dataset: 'bus', activeSlot: null, publicationVersion: 'publication-1', generatedAt: '2026-09-17T00:00:00Z' });
assert.equal(first.candidateSlot, 'slot-a');
const firstPublished = await publishSnapshot({ repository, branch: 'pages-publish', message: 'Publication 1' });
assert.equal('remote' in firstPublished, false);
assert.doesNotMatch(JSON.stringify(firstPublished), /INJECTED_TEST_TOKEN/);
assert.equal(await bareRun(['rev-list', '--count', 'pages-publish']), '1');

await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'services', '100-se.json.gz'), 'bus publication 2');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services', '100-se.json'), 'tnds publication 2');
const second = await stageBoundedPublication({ candidateSite: candidate, repository, dataset: 'bus', activeSlot: 'slot-a', publicationVersion: 'publication-2', generatedAt: '2026-09-18T00:00:00Z' });
assert.equal(second.activeSlot, 'slot-a');
assert.equal(second.candidateSlot, 'slot-b');
await publishSnapshot({ repository, branch: 'pages-publish', message: 'Publication 2' });

const tree = await bareRun(['ls-tree', '-r', '--name-only', 'pages-publish']);
assert.match(tree, /slot-a\/services\/100-se\.json\.gz/);
assert.match(tree, /slot-b\/services\/100-se\.json\.gz/);
assert.match(tree, /audit\/current\.json/);
assert.match(tree, /audit\/previous\.json/);
assert.doesNotMatch(tree, /releases\//);
assert.doesNotMatch(tree, /slot-c/);
assert.equal(await bareRun(['rev-list', '--count', 'pages-publish']), '1');
const currentAudit = JSON.parse(await fs.readFile(path.join(repository, 'audit', 'current.json'), 'utf8'));
const previousAudit = JSON.parse(await fs.readFile(path.join(repository, 'audit', 'previous.json'), 'utf8'));
assert.equal(currentAudit.publicationVersion, 'publication-2');
assert.equal(previousAudit.publicationVersion, 'publication-1');
const workingTree = await run(repository, ['status', '--porcelain']);
assert.match(workingTree, /slot-b\//);
assert.doesNotMatch(workingTree, /^(DD|UU|AA|DU|UD|AU|UA)/m);
console.log('PASS real two-publication Git snapshot integration: bounded history, rollback slot, audit records and no orphan-switch failure.');
