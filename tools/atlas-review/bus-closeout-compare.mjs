import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { reviewItemTaxonomy } from '../../src/atlas/domain/review-item-taxonomy.mjs';

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

function comparable(control) {
  return stable({
    stopCount: control.stopCount,
    stopDetails: control.stopDetails,
    routePopulation: control.routePopulation,
    serviceSummaryCount: control.serviceSummaryCount,
    plannerRowCount: control.plannerRowCount,
    plannerRoutes: control.plannerRoutes,
    plannerSemanticRows: control.plannerSemanticRows,
    plannerDirectionRows444: control.plannerDirectionRows444,
    reviewItemCount: control.reviewItemCount,
    reviewItemTypes: control.reviewItemTypes,
    reviewItemCategories: [...new Set((control.reviewItemTypes ?? []).map(code => reviewItemTaxonomy(code).category))].sort(),
    tflTimetableRequestIdentities: control.tflTimetableRequestIdentities,
    unresolvedRequestIdentities: control.unresolvedRequestIdentities,
    nationalSourcePublicationVersion: control.nationalSourcePublicationVersion,
    sourceServiceIdentities: control.sourceServiceIdentities,
    status: control.status,
    word: {
      serviceTableRowCount: control.word?.serviceTableRowCount
    }
  });
}

const basePath = argumentValue('--base');
const branchPath = argumentValue('--branch');
if (!basePath || !branchPath) throw new Error('Usage: node bus-closeout-compare.mjs --base BASE.json --branch BRANCH.json');
const [base, branch] = await Promise.all([basePath, branchPath].map(async path => JSON.parse(await readFile(path, 'utf8'))));
assert.equal(base.worktreeClean, true, 'Base control register was not generated from a clean worktree.');
assert.equal(branch.worktreeClean, true, 'Branch control register was not generated from a clean worktree.');
assert.match(base.executedCodeSha, /^[0-9a-f]{40}$/i);
assert.match(branch.executedCodeSha, /^[0-9a-f]{40}$/i);
assert.equal(base.productionPublicationVersion, branch.productionPublicationVersion, 'Base and branch used different production publication versions.');
assert.deepEqual(base.busManifest, branch.busManifest, 'Base and branch used different Bus publication manifests.');
assert.deepEqual(base.tnds, branch.tnds, 'Base and branch used different TNDS publication manifests.');
const baseControls = new Map(base.controls.map(control => [control.id, control]));
const branchControls = new Map(branch.controls.map(control => [control.id, control]));
assert.deepEqual([...baseControls.keys()].sort(), [...branchControls.keys()].sort(), 'Base and branch selected different controls.');
const comparisons = [];
for (const id of [...baseControls.keys()].sort()) {
  const baseControl = baseControls.get(id);
  const branchControl = branchControls.get(id);
  assert.deepEqual(comparable(baseControl), comparable(branchControl), `Non-approved semantic difference in ${id}.`);
  comparisons.push({ id, semanticParity: true, approvedDifferences: ['calendar wording', 'Word review qualification wording/count'] });
}
const output = { ok: true, baseExecutedCodeSha: base.executedCodeSha, branchExecutedCodeSha: branch.executedCodeSha, productionPublicationVersion: base.productionPublicationVersion, comparisons };
console.log(JSON.stringify(output, null, 2));
