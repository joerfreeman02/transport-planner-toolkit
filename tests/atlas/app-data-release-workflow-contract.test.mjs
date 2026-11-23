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
assert.match(frozen, /retired-workflow-guard/);
assert.match(frozen, /if: false/);
console.log('Application/data release workflow contract passed.');
