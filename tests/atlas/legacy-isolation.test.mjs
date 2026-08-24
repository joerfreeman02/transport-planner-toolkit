import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const baseline = '551b7cbf6646e72f21842bf77b93633373a9cac2';
const expected = Object.freeze({
  'index.html': 'c3e25ee699a6ec637af99a6634ba84d410b51a09ae6b864aa83098d89043eb1d',
  config: '0b214c0ecf95295cb0be16f0c588bf40099db27fab780c0443dae068d4fb7c9d',
  'assets/js': '7fbfa5cda5eadb671988989c5f756db5dc491754c9d8f0501cc6a4f667570e2c',
  'assets/css': '967575386ab07c8ec04ff8a34ecb76c2aedae370f32a7909bf2267b44aa423e8',
  'data/knowledge': 'a93cd8af7c8d7ea15d580aaa0c0288716cf65eaa242d799f5f23bda4fc59745a',
  'modules/accessibility': 'fa98a130a0fcbe9b0bd10488ada955e9f68f6c5101ce1b5e52cd2b83b9e9e817',
  'modules/bus': '8e0f58bb518c51aa43c965433b2d47da103df7887334fa0ac97eae85687afbb9',
  'modules/railway': 'bd0b956da9a5bb01fd34ef75c6543fad0305596064249b96c3f2dc82e69ac31e',
  'modules/stats19': '2ac3da3caa66e45329638ecd32c1b746ded3c8642adab1764effff2524830abb',
  'modules/site-research': 'deaab200af131ddc5ca6f972a858bab08406aedd5c3f0ffae072b66acf8a3f47',
  'modules/library-manager': '9656278cc26454bdabdac69638a66694373caaee4238b29d972c20bef222ed8c',
  'modules/drawing-generator': '53115618e6a91e5156747a9eda1c86eedd49a1b1c96fd2d90a7ca48464e62f0e'
});

function files(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target).flatMap(name => files(path.join(target, name)));
}

function digest(target) {
  const manifest = files(target).sort().map(file => {
    const relative = path.relative('.', file).replaceAll('\\', '/');
    const content = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    return `${relative}\0${content}`;
  }).join('\n');
  return crypto.createHash('sha256').update(manifest).digest('hex');
}

for (const [target, hash] of Object.entries(expected)) assert.equal(digest(target), hash, `${target} differs from protected baseline ${baseline}.`);
console.log(`PASS Legacy isolation — ${Object.keys(expected).length} protected path groups match baseline ${baseline.slice(0, 7)}.`);
