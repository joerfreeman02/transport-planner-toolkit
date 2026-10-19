import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dispatcher = fs.readFileSync(path.join(root, '.github/workflows/atlas-bus-data-refresh.yml'), 'utf8').replace(/\r\n/g, '\n');
const candidate = fs.readFileSync(path.join(root, '.github/workflows/atlas-bus-beta-candidate.yml'), 'utf8').replace(/\r\n/g, '\n');

const steps = candidate.split(/(?=^      - name: )/m).filter((block) => block.startsWith('      - name: '));
const step = (name) => {
  const found = steps.find((block) => block.startsWith(`      - name: ${name}\n`));
  assert.ok(found, `workflow step exists: ${name}`);
  return found;
};
const position = (name) => candidate.indexOf(`      - name: ${name}\n`);

const apiSteps = steps.filter((block) => /\bgh\s+api\b/.test(block));
assert.equal(apiSteps.length, 3, 'all raw and candidate artifact API metadata calls are covered');
for (const apiStep of apiSteps) {
  assert.match(apiStep.split('\n')[0], /^      - name: (Verify exact primary restore artifact metadata|Verify exact TNDS restore artifact metadata|Verify exact candidate restore artifact metadata)$/);
  assert.match(apiStep, /^          GH_TOKEN: \$\{\{ github\.token \}\}$/m, `${apiStep.split('\n')[0]} has its own GitHub CLI token binding`);
}
assert.match(step('Verify exact primary restore artifact metadata'), /ARTIFACT_DIGEST: \$\{\{ inputs\.primary_artifact_digest \}\}/);
assert.match(step('Verify exact TNDS restore artifact metadata'), /ARTIFACT_DIGEST: \$\{\{ inputs\.tnds_artifact_digest \}\}/);
assert.match(step('Verify exact candidate restore artifact metadata'), /ARTIFACT_DIGEST: \$\{\{ inputs\.candidate_artifact_digest \}\}/);

const permissionBlock = candidate.slice(candidate.indexOf('\npermissions:\n'), candidate.indexOf('\nconcurrency:\n'));
assert.match(permissionBlock, /^  actions: read\n  contents: read$/m);
assert.doesNotMatch(permissionBlock, /write|admin/);

assert.ok(position('Verify exact primary restore artifact metadata') < position('Verify exact TNDS restore artifact metadata'));
assert.ok(position('Verify exact TNDS restore artifact metadata') < position('Restore exact primary raw snapshot'));
assert.ok(position('Verify exact TNDS restore artifact metadata') < position('Restore exact raw TNDS artifact'));
assert.ok(position('Restore exact primary raw snapshot') < position('Verify explicit primary snapshot or acquire fresh eleven-source snapshot'));
assert.ok(position('Verify explicit primary snapshot or acquire fresh eleven-source snapshot') < position('Preserve verified primary snapshot before preparation'));
assert.ok(position('Preserve verified primary snapshot before preparation') < position('Restore exact raw TNDS artifact'));
assert.ok(position('Restore exact raw TNDS artifact') < position('Acquire fresh TNDS raw snapshot or verify exact restored snapshot'));
assert.ok(position('Acquire fresh TNDS raw snapshot or verify exact restored snapshot') < position('Check TNDS central-directory expansion and runner capacity'));
assert.ok(position('Check TNDS central-directory expansion and runner capacity') < position('Seed isolated candidate from the checked-out Alpha.15 site and baseline'));

for (const name of [
  'Verify exact primary restore artifact metadata',
  'Verify exact TNDS restore artifact metadata',
  'Restore exact primary raw snapshot',
  'Verify explicit primary snapshot or acquire fresh eleven-source snapshot',
  'Restore exact raw TNDS artifact',
  'Acquire fresh TNDS raw snapshot or verify exact restored snapshot',
]) {
  assert.doesNotMatch(step(name), /TNDS_USERNAME|TNDS_PASSWORD|secrets\.TNDS/,
    `${name} does not receive TNDS FTP credentials`);
}

const c4Selector = dispatcher.slice(
  dispatcher.indexOf('      - name: Resolve S2B-C4 exact offline preflight or Run #53 compose selector'),
  dispatcher.indexOf('      - name: Resolve exact-branch TRUST browser selector'),
);
assert.match(c4Selector, /if: github\.ref == 'refs\/heads\/codex\/atlas-bus-beta-s2b-c4-restore-auth-closeout'/);
assert.match(c4Selector, /CANDIDATE_MODE" == 'disabled'/);
assert.match(c4Selector, /SCHEMA" != 'v2'.*MEASURE_ONLY" != 'true'.*FORCE_REFRESH" != 'true'.*EXPECTED_SNAPSHOT_ID" != 'TNDS-TRUST-PREFLIGHT-C1B'/);
assert.match(c4Selector, /CANDIDATE_MODE" == 'compose'/);
assert.match(c4Selector, /PRIMARY_RUN" != '39217550518'/);
assert.match(c4Selector, /PRIMARY_ID" != '12169814614'/);
assert.match(c4Selector, /PRIMARY_DIGEST" != 'sha256:2d6e925559a90f261d3c4f02490be271356c6fd57c6730a90aa2a1424b194ceb'/);
assert.match(c4Selector, /TNDS_RUN" != '39217550518'/);
assert.match(c4Selector, /TNDS_ID" != '12171771295'/);
assert.match(c4Selector, /TNDS_DIGEST" != 'sha256:cd4e3b83a969eab66529ca59cbacb8a3f02ec9fd8e558b8edd7da2044e9ef7a1'/);
assert.match(c4Selector, /-n "\$CANDIDATE_RUN\$CANDIDATE_ID\$CANDIDATE_DIGEST"/);
assert.match(c4Selector, /accepts only disabled offline preflight or exact Run #53 compose; restore_candidate is not enabled/);
assert.match(dispatcher, /steps\.s2b-c4-selector\.outputs\.trust_mode/);
assert.match(dispatcher, /steps\.s2b-c4-selector\.outputs\.review_candidate_mode/);
assert.match(dispatcher, /refs\/heads\/codex\/atlas-bus-beta-s2b-c4-restore-auth-closeout' \|\| github\.ref == 'refs\/heads\/codex\/atlas-bus-beta-s2c-1-national-runtime-scale'\) && needs\.main-guard\.result == 'success' && needs\.main-guard\.outputs\.trust_mode == 'offline_preflight'/);
assert.match(dispatcher, /refs\/heads\/codex\/atlas-bus-beta-s2b-c4-restore-auth-closeout'\) && needs\.main-guard\.result == 'success' && needs\.main-guard\.outputs\.trust_mode == 'review_candidate'/);

const s2c1Selector = dispatcher.slice(
  dispatcher.indexOf('      - name: Resolve S2C-1 exact zero-download offline preflight selector'),
  dispatcher.indexOf('      - name: Resolve exact-branch TRUST browser selector'),
);
assert.match(s2c1Selector, /if: github\.ref == 'refs\/heads\/codex\/atlas-bus-beta-s2c-1-national-runtime-scale'/);
assert.match(s2c1Selector, /PREPARED_SCHEMA" != 'v2'.*MEASURE_ONLY" != 'true'.*FORCE_REFRESH" != 'true'.*EXPECTED_SNAPSHOT_ID" != 'TNDS-TRUST-PREFLIGHT-C1B'/);
assert.match(s2c1Selector, /-n "\$SOURCE_RUN_ID\$EXPECTED_SOURCE_COUNT\$EXPECTED_TOTAL_BYTES\$PRIMARY_RUN\$PRIMARY_ID\$PRIMARY_DIGEST\$TNDS_RUN\$TNDS_ID\$TNDS_DIGEST\$CANDIDATE_RUN\$CANDIDATE_ID\$CANDIDATE_DIGEST"/);
assert.match(s2c1Selector, /trust_mode=offline_preflight/);
assert.doesNotMatch(s2c1Selector, /trust_mode=review_candidate/);
assert.match(dispatcher, /steps\.s2c-1-selector\.outputs\.trust_mode/);
const offlinePreflight = dispatcher.slice(dispatcher.indexOf('  tnds-trust-browser-offline-preflight:'), dispatcher.indexOf('  tnds-trust-browser-live:'));
assert.match(offlinePreflight, /refs\/heads\/codex\/atlas-bus-beta-s2c-1-national-runtime-scale/);
assert.doesNotMatch(dispatcher.slice(dispatcher.indexOf('  tnds-trust-browser-live:'), dispatcher.indexOf('\n  c3-primary-source:')), /atlas-bus-beta-s2c-1-national-runtime-scale/);
assert.doesNotMatch(dispatcher.slice(dispatcher.indexOf('\n  s2a-c1-review-candidate:\n')), /atlas-bus-beta-s2c-1-national-runtime-scale/);

const primaryVerify = step('Verify explicit primary snapshot or acquire fresh eleven-source snapshot');
assert.match(primaryVerify, /PRIMARY_RUN: \$\{\{ inputs\.primary_source_run_id \|\| github\.run_id \}\}/);
assert.match(primaryVerify, /PRIMARY_RUN_INPUT: \$\{\{ inputs\.primary_source_run_id \}\}/);
assert.match(primaryVerify, /if \[\[ -n "\$PRIMARY_RUN_INPUT" \]\]; then[\s\S]*?--mark-frozen-reuse[\s\S]*?else[\s\S]*?--acquire/);
assert.match(step('Acquire fresh TNDS raw snapshot or verify exact restored snapshot'), /if \[\[ -n "\$TNDS_RUN" \]\]; then/);
assert.match(step('Run metadata-only TNDS authentication and archive gate'), /if: inputs\.mode == 'compose' && inputs\.tnds_source_run_id == ''/);
assert.match(step('Acquire and verify the fresh eight-region raw TNDS snapshot'), /if: inputs\.mode == 'compose' && inputs\.tnds_source_run_id == ''/);
assert.match(step('Build complete review-only Bus and TNDS candidate with production builders'), /--review-only --acquisition-disabled/);
assert.doesNotMatch(candidate, /actions\/deploy-pages|pages: write|id-token: write/);
const deploy = dispatcher.slice(dispatcher.indexOf('  deploy:'), dispatcher.indexOf('  freshness-no-op:'));
assert.match(deploy, /github\.ref == 'refs\/heads\/main'/);
assert.match(deploy, /needs\.main-guard\.outputs\.trust_mode == ''/);

console.log('Review-candidate workflow contract suite passed.');
