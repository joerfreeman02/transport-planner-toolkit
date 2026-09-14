import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const alpha14SourceSha = '0efdaf4f33b5db5d1e057f43ddfd16d0e15477ba';

export async function loadAlpha14Planner() {
  let source = execFileSync('git', ['show', `${alpha14SourceSha}:src/atlas/domain/bus-planner-summary.mjs`], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  });
  const assessmentUrl = pathToFileURL(path.join(repositoryRoot, 'src/atlas/domain/bus-service-assessment.mjs')).href;
  const calendarUrl = pathToFileURL(path.join(repositoryRoot, 'src/atlas/domain/service-calendar.mjs')).href;
  source = source
    .replaceAll("from './bus-service-assessment.mjs'", `from '${assessmentUrl}'`)
    .replaceAll("from './service-calendar.mjs'", `from '${calendarUrl}'`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return {
    sourceSha: alpha14SourceSha,
    buildPlannerBusServiceSummaries: module.buildPlannerBusServiceSummaries,
    buildPlannerSummaryAudit: module.buildPlannerSummaryAudit
  };
}
