import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = file => fs.readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const [appRelease, refresh, frozen] = await Promise.all([
  read('.github/workflows/atlas-app-only-release.yml'),
  read('.github/workflows/atlas-bus-data-refresh.yml'),
  read('.github/workflows/atlas-bus-frozen-beta-publish.yml')
]);
assert.match(appRelease, /group: atlas-bus-pages/);
assert.match(appRelease, /authorize_publication == true/);
assert.match(appRelease, /application_commit_sha/);
assert.match(appRelease, /working-directory: application/);
assert.match(appRelease, /assertReviewedFileScope/);
assert.match(appRelease, /approved_live_data_identity_sha256/);
assert.match(appRelease, /assertApprovedLiveDataIdentity/);
assert.match(appRelease, /Tested application SHA and assembled artifact SHA/);
assert.match(appRelease, /rm -rf \"\$CANDIDATE_SITE\/atlas\/data\/tfl-ibus\"\s+cp -a last-known-good\/atlas\/data\/tfl-ibus/);
assert.match(appRelease, /atlas-release-identity\.json/);
assert.match(appRelease, /actions\/upload-pages-artifact@v3/);
assert.match(appRelease, /CANDIDATE_ARTIFACT_DIGEST/);
assert.match(appRelease, /1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f/);
assert.doesNotMatch(appRelease, /source_snapshot\.py --acquire|refresh_bus_data\.py|publish-bank\.mjs|publish-snapshot\.mjs/);
assert.match(refresh, /group: atlas-bus-pages/);
assert.match(refresh, /application-pin/);
assert.match(refresh, /merge-base.*is-ancestor/);
assert.match(refresh, /git archive.*APP_SHA/);
assert.match(refresh, /refresh-identity-cli\.mjs/);
assert.match(await read('.github/workflows/atlas-beta2-release-validation.yml'), /Fail closed when the hosted TfL replay is not supplied/);
assert.match(await read('.github/workflows/atlas-beta2-release-validation.yml'), /Original Run #75 artifact identity retained/);
assert.match(frozen, /retired-workflow-guard/);
assert.match(frozen, /if: false/);
console.log('Application/data release workflow contract passed.');
