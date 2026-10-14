import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const top = fs.readFileSync(path.join(root, '.github/workflows/atlas-bus-data-refresh.yml'), 'utf8');
const source = fs.readFileSync(path.join(root, '.github/workflows/atlas-reference-data-source.yml'), 'utf8');
const diagnostic = fs.readFileSync(path.join(root, '.github/workflows/atlas-reference-data-diagnostic.yml'), 'utf8');
const refresh = fs.readFileSync(path.join(root, 'tools/atlas-bus-data/refresh_bus_data.py'), 'utf8');
const snapshotTool = fs.readFileSync(path.join(root, 'tools/atlas-bus-data/source_snapshot.py'), 'utf8');
const integrity = fs.readFileSync(path.join(root, 'tests/atlas/prepared-bus-data-integrity.test.mjs'), 'utf8');

assert.match(top, /uses: \.\/\.github\/workflows\/atlas-reference-data-source\.yml/);
assert.match(top, /uses: \.\/\.github\/workflows\/atlas-reference-data-diagnostic\.yml/);
assert.match(top, /v2_source_snapshot_run_id:/);
assert.match(top, /source_snapshot_artifact: \$\{\{ needs\.reference-source\.outputs\.snapshot_artifact \}\}/);
assert.match(top, /source_snapshot_artifact_id: \$\{\{ needs\.reference-source\.outputs\.snapshot_artifact_id \}\}/);
assert.match(top, /source_snapshot_run_id: \$\{\{ needs\.reference-source\.outputs\.producer_run_id \}\}/);
assert.match(top, /producer_run_id: \$\{\{ needs\.reference-source\.outputs\.producer_run_id \}\}/);
assert.match(top, /expected_snapshot_id: \$\{\{ needs\.reference-source\.outputs\.snapshot_id \}\}/);
assert.match(top, /expected_source_count: \$\{\{ needs\.reference-source\.outputs\.source_count \}\}/);
assert.match(top, /expected_total_bytes: \$\{\{ needs\.reference-source\.outputs\.total_bytes \}\}/);
assert.match(top, /default: ''\s+type: string/);
assert.doesNotMatch(top, /default: cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde/);
assert.match(top, /expected_snapshot_id: \$\{\{ inputs\.v2_source_snapshot_run_id != '' && inputs\.v2_expected_snapshot_id \|\| '' \}\}/);
assert.match(top, /expected_source_count: \$\{\{ inputs\.v2_source_snapshot_run_id != '' && inputs\.v2_expected_source_count \|\| '' \}\}/);
assert.match(top, /expected_total_bytes: \$\{\{ inputs\.v2_source_snapshot_run_id != '' && inputs\.v2_expected_total_bytes \|\| '' \}\}/);
assert.match(top, /secrets: inherit/);
assert.match(top, /if: inputs\.prepared_schema != 'v2' && needs\.freshness\.result == 'success'/);

assert.match(source, /workflow_call:/);
assert.match(source, /v2_source_snapshot_run_id:/);
assert.match(source, /snapshot_artifact: \$\{\{ steps\.snapshot-name\.outputs\.name \}\}/);
assert.match(source, /snapshot_artifact_id: \$\{\{ steps\.upload\.outputs\.artifact-id \}\}/);
assert.match(source, /snapshot_id: \$\{\{ steps\.verify\.outputs\.snapshot_id \}\}/);
assert.match(source, /source_count: \$\{\{ steps\.verify\.outputs\.source_count \}\}/);
assert.match(source, /total_bytes: \$\{\{ steps\.verify\.outputs\.total_bytes \}\}/);
assert.match(source, /producer_run_id: \$\{\{ github\.run_id \}\}/);
assert.match(source, /value: \$\{\{ jobs\.acquire\.outputs\.snapshot_artifact \}\}/);
assert.match(source, /value: \$\{\{ jobs\.acquire\.outputs\.snapshot_artifact_id \}\}/);
assert.match(source, /value: \$\{\{ jobs\.acquire\.outputs\.snapshot_id \}\}/);
assert.match(source, /value: \$\{\{ jobs\.acquire\.outputs\.source_count \}\}/);
assert.match(source, /value: \$\{\{ jobs\.acquire\.outputs\.total_bytes \}\}/);
assert.match(source, /value: \$\{\{ jobs\.acquire\.outputs\.producer_run_id \}\}/);
assert.ok(source.indexOf('Verify source snapshot provenance and hashes') < source.indexOf('Upload immutable source snapshot'));
assert.match(source, /verified-source-manifest\.json/);
assert.match(source, /manifest\['snapshotId'\]/);
assert.match(source, /len\(sources\)/);
assert.match(source, /sum\(int\(source\['bytes'\]\) for source in sources\)/);
assert.match(source, /overwrite: false/);
assert.match(source, /run-id: \$\{\{ inputs\.v2_source_snapshot_run_id \}\}/);
assert.match(source, /github-token: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
assert.match(source, /--mark-frozen-reuse/);
assert.match(snapshotTool, /currentSourceFreshnessClaimed"] = False/);
assert.match(snapshotTool, /frozenReuseSourceRunId"] = str\(source_run_id\)/);
assert.match(snapshotTool, /manifest = load_and_verify\(source_root\)/);
assert.match(snapshotTool, /shutil\.copytree\(source_root, destination_root\)/);
assert.match(source, /--acquire --output source-snapshot/);
assert.match(source, /inputs\.v2_source_snapshot_run_id == ''/);
assert.match(source, /--mark-frozen-reuse/);
assert.match(source, /EXPECTED_SNAPSHOT_ID/);
assert.match(source, /EXPECTED_SOURCE_COUNT/);
assert.match(source, /EXPECTED_TOTAL_BYTES/);
assert.doesNotMatch(source, /(?:artifact|snapshot)[^\r\n]*latest|latest[^\r\n]*(?:artifact|snapshot)/i);
assert.match(source, /actions: read/);

assert.match(diagnostic, /workflow_call:/);
assert.match(diagnostic, /source_snapshot_run_id:/);
assert.match(diagnostic, /source_snapshot_artifact_id:/);
assert.match(diagnostic, /producer_run_id:/);
assert.match(diagnostic, /actions\/artifacts\/\$SOURCE_ARTIFACT_ID/);
assert.match(diagnostic, /workflow_run/);
assert.match(diagnostic, /artifact-ids: \$\{\{ inputs\.source_snapshot_artifact_id \}\}/);
assert.match(diagnostic, /run-id: \$\{\{ inputs\.source_snapshot_run_id \}\}/);
assert.match(diagnostic, /--acquisition-disabled/);
assert.match(diagnostic, /steps\.verify-producer-artifact\.outcome == 'success'.*steps\.verify-snapshot\.outcome == 'success'/);
assert.match(diagnostic, /EXPECTED_SNAPSHOT_ID/);
assert.match(diagnostic, /EXPECTED_SOURCE_COUNT/);
assert.match(diagnostic, /EXPECTED_TOTAL_BYTES/);
assert.doesNotMatch(diagnostic, /source-input\/source-snapshot\/(sources|.*\.zip)/);
assert.match(diagnostic, /Require a pristine Git checkout for deterministic ATLAS checks/);
assert.match(diagnostic, /git status --porcelain/);
assert.match(diagnostic, /RUNNER_TEMP\/atlas-deterministic-tests\.log/);
assert.match(diagnostic, /TNDS_USERNAME: \$\{\{ secrets\.TNDS_USERNAME \}\}/);
assert.match(diagnostic, /TNDS_PASSWORD: \$\{\{ secrets\.TNDS_PASSWORD \}\}/);
assert.ok(diagnostic.indexOf('Run deterministic ATLAS checks from pristine checkout') < diagnostic.indexOf('Restore supplied source snapshot'));
assert.ok(diagnostic.indexOf('Restore supplied source snapshot') < diagnostic.indexOf('Restore last-known-good diagnostic comparison state'));
assert.match(diagnostic, /Stage and verify diagnostic release metadata/);
assert.match(diagnostic, /cp atlas\/config\/atlas-release\.json pages-site\/atlas\/config\/atlas-release\.json/);
assert.match(diagnostic, /json\.loads\(path\.read_text\(encoding='utf-8'\)\)/);
assert.match(diagnostic, /version.*build.*must be non-empty/);
assert.ok(diagnostic.indexOf('Stage and verify diagnostic release metadata') < diagnostic.indexOf('Prepare Bus v2 with acquisition disabled'));
assert.match(diagnostic, /--previous-root last-known-good/);
assert.match(diagnostic, /--acquisition-disabled/);
assert.match(diagnostic, /steps\.prepare-v2\.outcome/);
assert.match(diagnostic, /steps\.release-metadata\.outcome/);
assert.match(diagnostic, /if: always\(\) &&/);
assert.match(diagnostic, /Copy deterministic test log into evidence workspace/);
assert.ok(diagnostic.indexOf('Restore last-known-good diagnostic comparison state') < diagnostic.indexOf('Run aggregate structural scan'));
assert.ok(diagnostic.indexOf('Run aggregate structural scan') < diagnostic.indexOf('Run hard candidate validation'));
assert.ok(diagnostic.indexOf('Run hard candidate validation') < diagnostic.indexOf('Probe TNDS metadata'));
assert.ok(diagnostic.indexOf('Probe TNDS metadata') < diagnostic.indexOf('Measure diagnostic candidate capacity'));
assert.doesNotMatch(diagnostic, /Run same-source-window parity|national_v2_diagnostic\.py/);
assert.match(top, /Legacy v1 shadow parity is deferred: no exact same-window frozen NaPTAN CSV is available/);
assert.match(diagnostic, /verified-snapshot-manifest\.json/);
assert.match(diagnostic, /atlas-reference-diagnostic-\$\{\{ github\.run_id \}\}/);

// Fresh acquisition passes producer-measured metadata without applying optional
// frozen-reuse expectations; no automatic latest-artifact lookup exists.
assert.match(top, /expected_snapshot_id: \$\{\{ needs\.reference-source\.outputs\.snapshot_id \}\}/);
assert.match(source, /inputs\.v2_source_snapshot_run_id != ''/);
assert.doesNotMatch(source, /actions\/download-artifact@v4[\s\S]{0,160}pattern:/);
assert.match(source, /reuse:|--mark-frozen-reuse/);

// The diagnostic reusable workflow has read-only permissions and the V2 path is
// excluded from the existing production build, Pages upload, and deployment jobs.
assert.match(diagnostic, /permissions:\s+actions: read\s+contents: read/);
assert.match(top, /if: inputs\.prepared_schema != 'v2' && needs\.freshness\.result == 'success'/);
assert.match(top, /if: inputs\.prepared_schema != 'v2' && needs\.freshness\.outputs\.refresh_required == 'true'.*github\.ref == 'refs\/heads\/main' && inputs\.measure_only != true/);
assert.match(top, /deploy:[\s\S]*?if: inputs\.prepared_schema != 'v2'[\s\S]*?github\.ref == 'refs\/heads\/main' && inputs\.measure_only != true/);
assert.doesNotMatch(diagnostic, /configure-pages|upload-pages-artifact|deploy-pages|publish-snapshot\.mjs/);
assert.match(top, /needs\.reference-source\.result == 'success'/);

// Ubuntu paths and artifact boundaries remain portable; raw source archives stay
// outside the bounded Pages artifact and the deployed client consumes sharded data.
assert.match(source, /runs-on: ubuntu-latest/);
assert.match(diagnostic, /runs-on: ubuntu-latest/);
assert.doesNotMatch(`${top}\n${source}\n${diagnostic}`, /[A-Za-z]:\\\\Users\\/);
assert.match(diagnostic, /atlas\/data\/bus\/manifest\.json/);
assert.doesNotMatch(diagnostic.slice(diagnostic.indexOf('Upload evidence-safe diagnostic artifact')), /source-input\/source-snapshot/);
assert.match(integrity, /referenced\.length > 700/);
assert.match(integrity, /shard/);
assert.match(top, /uses: actions\/upload-pages-artifact@v3[\s\S]*?path: pages-site/);
assert.match(top, /rsync -a --exclude='.git' --exclude='pages-site' --exclude='atlas\/data\/bus' --exclude='atlas\/data\/bus-tnds' \.\/ pages-site\//);
assert.match(refresh, /--acquisition-disabled requires --source-snapshot/);
assert.match(refresh, /materialise_for_preparation\(snapshot_root, staging\)/);
assert.match(snapshotTool, /TNDS raw archives are not permitted in a Bus source snapshot/);

console.log('PASS REMOTE-1 source/diagnostic contract: verified producer metadata, exact artifact identity, fresh/frozen handoff, fail-closed preparation, no publication, and bounded artifact scope.');
