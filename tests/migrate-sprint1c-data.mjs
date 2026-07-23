import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const routePath=path.join(root,'data/knowledge/bus-route-library.json');
const stopPath=path.join(root,'data/knowledge/bus-stop-library.json');
const relationshipPath=path.join(root,'data/knowledge/bus-stop-route-library.json');
const reportPath=path.join(root,'docs/BUS_ROUTE_CANONICAL_MIGRATION_2026-07-23.json');
const stamp='2026-07-23T09:00:00.000Z';
const normal=value=>String(value??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const legacyKey=route=>[route.routeNumber,route.operator,route.routeOrigin,route.routeDestination,route.geographicContext].map(normal).join('|');
const sources=record=>Array.isArray(record.sources)?record.sources:[];
function authority(route){
  const explicit=route.transportAuthority||route.authority||route.regionalIdentifier||route.regionIdentifier||route.network;
  if(explicit)return normal(explicit).replaceAll(' ','-');
  const urls=sources(route).map(source=>normal(source.url)).join(' ');
  const context=normal(route.geographicContext);
  if(/tfl gov uk/.test(urls)||/\b(?:east|north|south|west|central) london\b/.test(context))return'transport-for-london';
  if(/intalink org uk|central connect co uk/.test(urls))return'hertfordshire-intalink';
  return'region-unresolved';
}
function canonicalKey(route){
  const terminals=[normal(route.routeOrigin),normal(route.routeDestination)].filter(Boolean).sort();
  const variant=normal(route.branch||route.variant||route.routeVariant);
  return['route',authority(route),normal(route.routeNumber),terminals.join('~'),variant].join(':');
}
const baselineRef=process.env.TPT_MIGRATION_BASELINE||'';
function readDocument(filePath,repositoryPath){
  if(!baselineRef)return JSON.parse(fs.readFileSync(filePath,'utf8'));
  const git=process.env.TPT_GIT||'git';
  return JSON.parse(execFileSync(git,['show',baselineRef+':'+repositoryPath],{encoding:'utf8'}));
}
const routeDocument=readDocument(routePath,'data/knowledge/bus-route-library.json');
const stopDocument=readDocument(stopPath,'data/knowledge/bus-stop-library.json');
const relationshipDocument=readDocument(relationshipPath,'data/knowledge/bus-stop-route-library.json');
const before={routes:routeDocument.records.length,stops:stopDocument.records.length,relationships:relationshipDocument.records.length};
const groups=new Map();
routeDocument.records.forEach((route,index)=>{
  const key=canonicalKey(route);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({route,index});
});
const mergedCandidates=[];
const leftSeparate=[];
const migratedRoutes=[];
const aliasMap=new Map();
for(const [key,items] of groups){
  const first=structuredClone(items[0].route);
  const legacyKeys=Array.from(new Set(items.flatMap(item=>[legacyKey(item.route),...(item.route.legacyRouteKeys||[])]).filter(Boolean)));
  const sourceMap=new Map();
  items.flatMap(item=>sources(item.route)).forEach(source=>sourceMap.set(normal(source.url||source.title),source));
  first.transportAuthority=authority(first);
  first.canonicalRouteKey=key;
  first.legacyRouteKeys=legacyKeys;
  first.sources=Array.from(sourceMap.values());
  const retainedRevisions=items.flatMap((item,index)=>{
    const revisions=Array.isArray(item.route.previousRevisions)?item.route.previousRevisions:item.route.previousRevision?[item.route.previousRevision]:[];
    return revisions.concat(index?item.route:[]);
  });
  first.previousRevisions=Array.from(new Set(retainedRevisions.map(value=>JSON.stringify(value)))).map(value=>JSON.parse(value));
  if(items.length>1){
    const removed=items.slice(1).map(item=>legacyKey(item.route));
    first.migrationHistory=[...(first.migrationHistory||[]),{at:stamp,build:'SHARED-LIB-1.6.0-20260723',action:'canonical-route-merge',canonicalRouteKey:key,mergedLegacyKeys:removed,reason:'Same route number, regional authority and normalized terminal pair; geographic-context wording did not represent a distinct route.'}];
    mergedCandidates.push({routeNumber:first.routeNumber,canonicalRouteKey:key,canonicalRecord:legacyKey(first),mergedLegacyKeys:removed,preservedFields:Object.keys(first).sort(),conflicts:[]});
  }
  migratedRoutes.push(first);
  items.forEach(item=>{
    aliasMap.set(normal(legacyKey(item.route)),key);
    (item.route.legacyRouteKeys||[]).forEach(alias=>aliasMap.set(normal(alias),key));
  });
  aliasMap.set(normal(key),key);
}
const numberGroups=new Map();
routeDocument.records.forEach(route=>{
  const number=normal(route.routeNumber);
  if(!numberGroups.has(number))numberGroups.set(number,new Set());
  numberGroups.get(number).add(canonicalKey(route));
});
for(const [number,keys] of numberGroups){
  if(keys.size>1)leftSeparate.push({routeNumber:number,canonicalRouteKeys:Array.from(keys),reason:'Different authority, terminal pair or explicit variant.'});
}
const migratedRelationships=relationshipDocument.records.map(record=>{
  const next=structuredClone(record);
  const resolved=aliasMap.get(normal(record.canonicalRouteKey||record.compositeRouteKey||record.routeIdentifier));
  if(resolved){
    next.legacyRouteKey=record.compositeRouteKey||record.routeIdentifier||'';
    next.canonicalRouteKey=resolved;
    next.compositeRouteKey=resolved;
  }
  return next;
});
const sanitation=[];
const migratedStops=stopDocument.records.map(record=>{
  const next=structuredClone(record);
  const removed=[];
  for(const name of Object.keys(next)){
    if(/^(?:walking|cycling|existingSavedRecord|currentSite|site(?:Distance|Duration|Routing|Record)|assessment(?:Source|Routing)|savedRecord)/i.test(name)){
      removed.push(name);
      delete next[name];
    }
  }
  if(removed.length)sanitation.push({stopIdentity:next.naptanCode||next.fallbackIdentity,stopName:next.stopName,removedFields:removed.sort(),preservedFields:Object.keys(next).sort()});
  return next;
});
routeDocument.records=migratedRoutes;
routeDocument.libraryBuild='SHARED-LIB-1.6.0-20260723';
routeDocument.updatedAt=stamp;
relationshipDocument.records=migratedRelationships;
relationshipDocument.libraryBuild='SHARED-LIB-1.6.0-20260723';
relationshipDocument.updatedAt=stamp;
stopDocument.records=migratedStops;
stopDocument.libraryBuild='SHARED-LIB-1.6.0-20260723';
stopDocument.updatedAt=stamp;
const report={
  schema:'tpt.bus-route-canonical-migration-report',
  version:1,
  generatedAt:stamp,
  build:'SHARED-LIB-1.6.0-20260723',
  before,
  after:{routes:migratedRoutes.length,stops:migratedStops.length,relationships:migratedRelationships.length},
  canonicalRule:['transport authority or defensible regional identifier','route number','normalized unordered terminal pair','explicit branch or variant'],
  mergedCandidates,
  deliberatelyNotMerged:leftSeparate,
  relationshipReferencesUpdated:migratedRelationships.filter(record=>record.legacyRouteKey&&record.compositeRouteKey!==record.legacyRouteKey).length,
  busStopSanitation:{recordsChanged:sanitation.length,fieldsRemoved:sanitation.reduce((total,item)=>total+item.removedFields.length,0),records:sanitation}
};
fs.writeFileSync(routePath,JSON.stringify(routeDocument,null,2)+'\n');
fs.writeFileSync(stopPath,JSON.stringify(stopDocument,null,2)+'\n');
fs.writeFileSync(relationshipPath,JSON.stringify(relationshipDocument,null,2)+'\n');
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
