import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'atlas/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'atlas/assets/js/app.mjs'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/atlas-bus-data-refresh.yml'), 'utf8');
const refresh = fs.readFileSync(path.join(root, 'tools/atlas-bus-data/refresh_bus_data.py'), 'utf8');

assert.match(html, /2\.0\.0-alpha\.7/);
assert.match(html, /ATLAS-2\.0\.0-alpha\.7-20260907/);
assert.match(html, /id="updateBusData"[^>]*hidden/);
assert.match(app, /localMaintenance/);
assert.match(app, /Bus data updates automatically/);
assert.match(app, /data\/status\/manifest\.json/);
assert.match(workflow, /workflow_dispatch/);
assert.match(workflow, /cron: '17 6 \* \* 5'/);
assert.match(workflow, /needs: build-validate/);
assert.match(workflow, /if: needs\.build-validate\.result == 'success'/);
assert.match(refresh, /TNDS_USERNAME/);
assert.match(refresh, /TNDS_PASSWORD/);
assert.match(refresh, /set\(TNDS_REGIONS\)/);
assert.match(refresh, /atlas-bus-refresh-staging/);
assert.doesNotMatch(refresh, /print\([^\n]*(username|password)/i);
console.log('PASS automated refresh contract, version and Pages safety checks.');
