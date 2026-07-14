import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const required = [
  'index.html',
  'assets/css/shell.css',
  'assets/js/shell.js',
  'modules/accessibility/index.html',
  'modules/stats19/index.html',
  'modules/railway/index.html',
  'modules/bus/index.html',
  'config/modules.json'
];
let failures = 0;
for (const rel of required) {
  const ok = fs.existsSync(path.join(root, rel));
  console.log(`${ok ? 'PASS' : 'FAIL'} required file: ${rel}`);
  if (!ok) failures++;
}
const rail = fs.readFileSync(path.join(root, 'modules/railway/index.html'), 'utf8');
for (const marker of ['Railway Assessment', 'Find and route stations', 'Rail Knowledge Library']) {
  const ok = rail.includes(marker);
  console.log(`${ok ? 'PASS' : 'FAIL'} railway marker: ${marker}`);
  if (!ok) failures++;
}
const access = fs.readFileSync(path.join(root, 'modules/accessibility/index.html'), 'utf8');
for (const marker of ['Accessibility Assessment', 'Find nearest facilities']) {
  const ok = access.includes(marker);
  console.log(`${ok ? 'PASS' : 'FAIL'} accessibility marker: ${marker}`);
  if (!ok) failures++;
}
const stats = fs.readFileSync(path.join(root, 'modules/stats19/index.html'), 'utf8');
for (const marker of ['Collision Record Cards', 'fileinput']) {
  const ok = stats.includes(marker);
  console.log(`${ok ? 'PASS' : 'FAIL'} STATS19 marker: ${marker}`);
  if (!ok) failures++;
}
if (failures) process.exit(1);
console.log('\nAll foundation regression checks passed.');
