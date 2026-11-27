import { preflightPublication } from './preflight-publication.mjs';
import { createHash } from 'node:crypto';

const REGIONS = ['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y'];
const LIVE_CONFIG_URL = 'https://joerfreeman02.github.io/transport-planner-toolkit/atlas/config/atlas-data-sources.json';
const PROPOSED_A = [
  { id: 'A1', regions: ['SW'] },
  { id: 'A2', regions: ['SE'] },
  { id: 'A3', regions: ['EA', 'NW'] },
  { id: 'A4', regions: ['NE', 'WM'] },
  { id: 'A5', regions: ['EM', 'Y'] }
].map(root => ({
  ...root,
  repository: `joerfreeman02/atlas-tnds-${root.id.toLowerCase()}`,
  siteUrl: `https://joerfreeman02.github.io/atlas-tnds-${root.id.toLowerCase()}/`
}));

function repoFromRoot(root) {
  if (typeof root.repository === 'string' && root.repository.includes('/')) return root.repository;
  const value = root.baseUrl ?? root.siteUrl;
  const url = new URL(String(value));
  const owner = url.hostname.endsWith('.github.io') ? url.hostname.slice(0, -'.github.io'.length) : null;
  const repository = url.pathname.split('/').filter(Boolean)[0];
  if (!owner || !repository) throw new Error(`Cannot determine GitHub project repository from active root ${root.id ?? '<missing>'}.`);
  return `${owner}/${repository}`;
}

function validateRegions(bank) {
  const regions = bank.roots.flatMap(root => root.regions.map(region => String(region).toUpperCase()));
  if (regions.length !== REGIONS.length || new Set(regions).size !== REGIONS.length || REGIONS.some(region => !regions.includes(region))) {
    throw new Error(`Bank ${bank.id} must assign EA, EM, NE, NW, SE, SW, WM, and Y exactly once.`);
  }
}

const token = process.env.ATLAS_REFERENCE_DATA_TOKEN;
if (!token) throw new Error('ATLAS_REFERENCE_DATA_TOKEN is required for the real read-only preflight.');
if (!process.env.ATLAS_BUS_DATA_REPOSITORY || !process.env.ATLAS_BUS_DATA_SITE_URL) {
  throw new Error('The existing Bus data repository/site variables are required for the read-only preflight.');
}

const response = await fetch(LIVE_CONFIG_URL, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
if (!response.ok) throw new Error(`Live deployed data-source configuration returned HTTP ${response.status}.`);
const liveConfigBytes = Buffer.from(await response.arrayBuffer());
const activeConfig = JSON.parse(liveConfigBytes.toString('utf8'));
const liveTnds = activeConfig?.datasets?.tnds;
if (liveTnds?.activeBank !== 'B') throw new Error(`Expected deployed Bank B to remain active; found ${liveTnds?.activeBank ?? '<missing>'}.`);
const activeRoots = liveTnds.activeRoots ?? liveTnds.roots;
if (!Array.isArray(activeRoots) || activeRoots.length !== 5) throw new Error(`Expected five deployed active Bank B roots; found ${activeRoots?.length ?? 0}.`);

const bankB = {
  id: 'B',
  roots: activeRoots.map(root => ({
    id: String(root.id),
    repository: repoFromRoot(root),
    siteUrl: root.baseUrl ?? root.siteUrl,
    regions: root.regions
  }))
};
const banks = [{ id: 'A', roots: PROPOSED_A }, bankB];
validateRegions(banks[0]);
validateRegions(bankB);
const expectedB = [
  ['B1', ['SW']], ['B2', ['SE']], ['B3', ['EA', 'NW']], ['B4', ['NE', 'WM']], ['B5', ['EM', 'Y']]
];
for (const [id, regions] of expectedB) {
  const root = bankB.roots.find(item => item.id === id);
  if (!root || JSON.stringify([...root.regions].map(value => String(value).toUpperCase()).sort()) !== JSON.stringify([...regions].sort())) {
    throw new Error(`Deployed Bank B differs from the retained allocation at ${id}; refusing to probe a changed live topology.`);
  }
}

const result = await preflightPublication({
  busRepository: process.env.ATLAS_BUS_DATA_REPOSITORY,
  busSiteUrl: process.env.ATLAS_BUS_DATA_SITE_URL,
  banksJson: JSON.stringify(banks),
  activeConfig,
  token,
  branch: process.env.ATLAS_REFERENCE_DATA_BRANCH || 'pages-publish',
  toolkitRepository: process.env.GITHUB_REPOSITORY || 'joerfreeman02/transport-planner-toolkit'
});

console.log(JSON.stringify({
  schema: 'atlas-au3-readonly-preflight-v1',
  ok: result.ok,
  activeBank: result.activeBank,
  candidateBank: result.candidateBank,
  activeConfigSha256: createHash('sha256').update(liveConfigBytes).digest('hex'),
  proposedBanks: banks,
  repositories: result.repositories.map(item => ({
    label: item.label,
    repository: item.repository,
    branchPresent: item.branchPresent,
    writePermission: item.writePermission,
    siteHealth: item.siteHealth,
    health: item.health
  })),
  warnings: result.warnings
}, null, 2));
