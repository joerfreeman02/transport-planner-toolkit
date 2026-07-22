import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await import('../assets/js/research-quality.js');
await import('../modules/bus/assets/js/bus-import.js');
const {hasRailEvidence}=await import('../modules/railway/assets/js/rail-knowledge.js');

assert.equal(hasRailEvidence({public_transport:'station',bus:'yes',amenity:'bus_station'}),false,'bus-only station must be excluded');
for(const name of ['Hertford Bus Station','Waltham Cross Bus Station','Chingford Bus Station','Vauxhall Bus Station'])assert.equal(hasRailEvidence({name,public_transport:'station',station:'bus',bus:'yes',amenity:'bus_station'}),false,name+' must be excluded');
assert.equal(hasRailEvidence({public_transport:'station',bus:'yes',railway:'station',train:'yes'}),true,'mixed rail/bus station must remain');
assert.equal(hasRailEvidence({station:'subway',public_transport:'station'}),true,'Underground station must remain');
for(const name of ['Hertford North','Waltham Cross','Chingford','Vauxhall'])assert.equal(hasRailEvidence({name,public_transport:'station',railway:'station',train:'yes'}),true,name+' railway station must remain');
const railwaySource=fs.readFileSync(path.join(root,'modules/railway/assets/js/railway.js'),'utf8');
assert(!railwaySource.includes('nwr["public_transport"="station"](around:'),'Rail query must not request every public-transport station without rail evidence');
assert(railwaySource.includes('data-rail-publish-key')&&railwaySource.includes('Rail publication preview'),'Rail publication must provide record selection and grouped preview');
const busSource=fs.readFileSync(path.join(root,'modules/bus/assets/js/bus-core.js'),'utf8');
assert(busSource.includes("bus-import-report-")&&busSource.includes(".txt"),'Bus import report must be readable text rather than ordinary JSON');
assert(busSource.includes('Download recovery backup')&&busSource.includes('No automatic file was downloaded'),'Bus import must keep recovery download explicit');

const collision={schema:'tpt.bus-research',schemaVersion:'1.0.0',stopRecords:[{naptanCode:'STOP-A',stopName:'Test',verificationStatus:'requires_professional_review'}],routeRecords:[
  {routeNumber:'10',operator:'Alpha',routeOrigin:'North',routeDestination:'South',geographicContext:'Town A',verificationStatus:'requires_professional_review'},
  {routeNumber:'10',operator:'Beta',routeOrigin:'East',routeDestination:'West',geographicContext:'Town B',verificationStatus:'requires_professional_review'}
],stopRouteRecords:[{naptanCode:'STOP-A',routeNumber:'10',compositeRouteKey:'10|alpha|north|south|town a',directionFromStop:'Southbound',stopSpecificDestination:'South',verificationStatus:'requires_professional_review'}]};
const collisionReport=globalThis.TPTBusImport.preflight(structuredClone(collision),new Set(['STOP-A']));
assert.equal(collisionReport.importable.stopRoutes.length,1,'explicit composite relationship should import');
assert.equal(collisionReport.importable.stopRoutes[0].operator,'Alpha','identical route number must resolve only to the explicit geography');

const placeholder=globalThis.TPTResearchQuality.analyseField('Test','servicePattern',{value:'Check operator website',status:'verified',source:'https://example.com/routes/10',retrievalDate:'2026-07-22'});
assert.equal(placeholder.state,'rejected','lazy placeholder wording must be rejected');
assert.equal(globalThis.TPTResearchQuality.statusClass('verified_operator_timetable'),'verified','verified-* statuses must normalize as verified');

function patchClone(record,pathName,value){const copy=structuredClone(record),parts=pathName.split('.');let target=copy;for(const key of parts.slice(0,-1))target=target[key];target[parts.at(-1)]=value;return copy;}
function roundTrip(file,pathName,value){const document=JSON.parse(fs.readFileSync(path.join(root,file),'utf8')),original=structuredClone(document.records[0]);original.__unknown={nested:{preserve:true}};const edited=patchClone(original,pathName,value);assert.deepEqual(edited.__unknown,original.__unknown,file+' unknown property was lost');const before=structuredClone(original),after=structuredClone(edited);let b=before,a=after;for(const key of pathName.split('.').slice(0,-1)){b=b[key];a=a[key];}delete b[pathName.split('.').at(-1)];delete a[pathName.split('.').at(-1)];assert.deepEqual(after,before,file+' lost or changed an unrelated property');return true;}
assert.equal(roundTrip('data/knowledge/rail-library.json','fields.notes.value','Harmless round-trip test'),true);
assert.equal(roundTrip('data/knowledge/bus-stop-library.json','locality','Harmless round-trip test'),true);
assert.equal(roundTrip('data/knowledge/bus-route-library.json','servicePattern','Harmless round-trip test'),true);

if(process.env.TPT_BUS_COMPLETED_FIXTURE){const fixture=JSON.parse(fs.readFileSync(process.env.TPT_BUS_COMPLETED_FIXTURE,'utf8')),allowed=new Set(fixture.stopRecords.map(globalThis.TPTBusImport.stopKey));const report=globalThis.TPTBusImport.preflight(fixture,allowed);assert(report.importable.stops.length>0,'real fixture stops should import');assert(report.importable.routes.length>0,'real fixture must retain usable routes');assert(report.review.length>0,'real fixture must retain review drafts');assert(report.quarantined.length>0,'real fixture incomplete records must quarantine');console.log('real fixture:',report.counts);}
if(process.env.TPT_BUS_BACKUP_FIXTURE){const backup=JSON.parse(fs.readFileSync(process.env.TPT_BUS_BACKUP_FIXTURE,'utf8'));assert.equal(backup.schema,'tpt.bus-knowledge');assert(backup.library&&Array.isArray(backup.library.stops)&&Array.isArray(backup.library.routes)&&Array.isArray(backup.library.stopRoutes),'pre-import backup must remain a valid recovery snapshot');console.log('backup fixture:',{stops:backup.library.stops.length,routes:backup.library.routes.length,stopRoutes:backup.library.stopRoutes.length});}

console.log('Emergency Sprint 1A tests passed.');
