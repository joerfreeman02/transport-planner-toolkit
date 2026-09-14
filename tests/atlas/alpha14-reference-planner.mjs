import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ALPHA14_REFERENCE_SOURCE_SHA = '0efdaf4f33b5db5d1e057f43ddfd16d0e15477ba';
export const ALPHA14_REFERENCE_SNAPSHOT_SHA256 = '844fac50eb5ef2d6ae36319ad83b096dd85bdb8e6790e7785d29d97f2a976dcf';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const snapshotPath = new URL('./fixtures/alpha14-bus-planner-summary.mjs', import.meta.url);

export async function loadAlpha14Planner() {
  const snapshot = fs.readFileSync(snapshotPath);
  const snapshotSha256 = crypto.createHash('sha256').update(snapshot).digest('hex');
  if (snapshotSha256 !== ALPHA14_REFERENCE_SNAPSHOT_SHA256) {
    throw new Error(`Alpha14 reference snapshot digest mismatch: ${snapshotSha256}`);
  }
  let source = snapshot.toString('utf8');
  const assessmentUrl = pathToFileURL(path.join(repositoryRoot, 'src/atlas/domain/bus-service-assessment.mjs')).href;
  const calendarUrl = pathToFileURL(path.join(repositoryRoot, 'src/atlas/domain/service-calendar.mjs')).href;
  source = source
    .replaceAll("from './bus-service-assessment.mjs'", `from '${assessmentUrl}'`)
    .replaceAll("from './service-calendar.mjs'", `from '${calendarUrl}'`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return {
    sourceSha: ALPHA14_REFERENCE_SOURCE_SHA,
    snapshotSha256,
    buildPlannerBusServiceSummaries: module.buildPlannerBusServiceSummaries,
    buildPlannerSummaryAudit: module.buildPlannerSummaryAudit
  };
}
