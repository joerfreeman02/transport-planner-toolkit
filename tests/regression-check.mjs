import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const required = [
  'index.html',
  'assets/css/shell.css',
  'assets/js/shell.js',
  'assets/js/word-export.js',
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
for (const marker of ['Railway Assessment', 'Find and route stations', 'Rail Knowledge Library', 'Copy Word tables', 'Download Word tables']) {
  const ok = rail.includes(marker);
  console.log(`${ok ? 'PASS' : 'FAIL'} railway marker: ${marker}`);
  if (!ok) failures++;
}
const access = fs.readFileSync(path.join(root, 'modules/accessibility/index.html'), 'utf8');
for (const marker of ['Accessibility Assessment', 'Find nearest facilities', 'Copy Word table', 'Download Word table']) {
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
const bus = fs.readFileSync(path.join(root, 'modules/bus/index.html'), 'utf8');
for (const marker of ['Bus Assessment', 'Find nearby stops', 'Search radius', 'Walking', 'Cycling', 'BUS-1.5.0', 'Bus Route and Service Review']) {
  const ok = bus.includes(marker);
  console.log(`${ok ? 'PASS' : 'FAIL'} Bus marker: ${marker}`);
  if (!ok) failures++;
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config/modules.json'), 'utf8'));
for (const [label,actual,expected] of [['Dashboard',manifest.modules.dashboard.version,'1.3.0'],['Accessibility',manifest.modules.accessibility.version,'1.5.0'],['Railway',manifest.modules.railway.version,'4.8.0'],['STATS19',manifest.modules.stats19.version,'1.0.0']]) {
  const ok = actual === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'} frozen identity: ${label} ${actual}`);
  if (!ok) failures++;
}
const accessJs = fs.readFileSync(path.join(root, 'modules/accessibility/assets/js/app.js'), 'utf8');
const railJs = fs.readFileSync(path.join(root, 'modules/railway/assets/js/railway.js'), 'utf8');
for (const [moduleName, source] of [['Accessibility', accessJs], ['Railway', railJs]]) {
  const ok = source.includes('../../../../assets/js/word-export.js');
  console.log(`${ok ? 'PASS' : 'FAIL'} ${moduleName} shared export import resolves from repository root`);
  if (!ok) failures++;
}
if (failures) process.exit(1);
console.log('\nAll foundation regression checks passed.');
