import assert from'node:assert/strict';
import fs from'node:fs';
await import('../assets/js/research-quality.js');
await import('../assets/js/research-workflow.js');
const W=globalThis.TPTResearchWorkflow;
const Q=globalThis.TPTResearchQuality;
let passed=0;
function test(name,fn){try{fn();console.log('PASS '+name);passed++;}catch(error){console.error('FAIL '+name+': '+error.message);throw error;}}
const source={url:'https://tfl.gov.uk/bus/timetable/1/',title:'Route 1 timetable',publisher:'Transport for London',retrievalDate:'2026-07-23'};
const railSource={url:'https://www.nationalrail.co.uk/stations/abc/',title:'ABC station information',publisher:'National Rail',retrievalDate:'2026-07-23'};
const field=(value,extra={})=>({value,status:'verified',source:railSource.url,sourceTitle:railSource.title,publisher:railSource.publisher,retrievalDate:railSource.retrievalDate,...extra});
function rail(code='ABC'){
  const fields={manager:field('Example Rail'),operators:field(['Example Rail']),lines:field(['Main line']),frequencyTotal:field('Approximately 4 trains per hour',{numericTph:4,timetablePeriod:'May to December 2026',methodology:'Counted typical weekday daytime departures in the current official timetable.'}),frequencyByDestination:field([{destination:'Central',direction:'southbound',tph:2,line:'Main line',direct:true},{destination:'North',direction:'northbound',tph:2,line:'Main line',direct:true}]),servicePattern:field('Four trains per hour in the typical weekday daytime period.'),frequency:field('4 tph'),destinations:field(['Central','North']),journeyOpportunities:field('Direct journeys to Central and North.'),cycleParking:field('20 sheltered spaces'),stepFree:field('Step-free to all platforms'),ticketing:field('Ticket office and machines'),waiting:field('Waiting rooms'),toilets:field('Toilets available'),carParking:field('100 spaces'),notes:field('Current official sources checked.')};
  return{name:'Station '+code,canonicalName:'Station '+code,mode:'National Rail',identifiers:{crs:code},coordinates:{lat:51.5,lon:-0.1},fields,verificationStatus:'verified'};
}
function stop(id='STOP-A'){return{naptanCode:id,stopName:'Example Stop '+id,locality:'Example Town',direction:'Northbound',indicator:'Stop A',pairedStopGroup:'PAIR-A',coordinates:{latitude:51.5,longitude:-0.1},routesServed:['1'],sources:[source],retrievalDate:'2026-07-23',verificationStatus:'verified'};}
function route(number='1',origin='Alpha',destination='Beta',context='London'){
  return{routeNumber:number,transportAuthority:'Transport for London',operator:'Example Operator',routeOrigin:origin,routeDestination:destination,geographicContext:context,principalLocationsServed:['Central'],mondayFridayOperatingPeriod:'05:00–00:30',saturdayOperatingPeriod:'05:30–00:30',sundayOperatingPeriod:'06:00–00:00',servicePattern:'Every 10 minutes in the typical daytime period.',serviceQualifications:{evening:'Every 15 minutes after 20:00',night:'No night service, confirmed by timetable',schoolDay:'Not school-day only',irregularOrLimited:'None'},sources:[source],retrievalDate:'2026-07-23',verificationStatus:'verified'};
}
function relationship(stopId,record){
  return{naptanCode:stopId,routeNumber:record.routeNumber,canonicalRouteKey:W.routeKey(record),compositeRouteKey:W.routeKey(record),operator:record.operator,routeOrigin:record.routeOrigin,routeDestination:record.routeDestination,geographicContext:record.geographicContext,directionFromStop:'Northbound',stopSpecificDestination:record.routeDestination,mondayFridayOperatingPeriod:'05:10–00:20',saturdayOperatingPeriod:'05:40–00:20',sundayOperatingPeriod:'06:10–23:50',typicalWeekdayBusesPerHour:6,saturdayBusesPerHour:6,sundayBusesPerHour:4,servicePattern:'Every 10 minutes in the typical weekday daytime period.',serviceQualifications:{evening:'Every 15 minutes',night:'No night service, confirmed by timetable',schoolDay:'Not school-day only',irregularOrLimited:'None'},journeyOpportunities:'Direct journeys to Beta and Central.',transportStatementParagraph:'Route 1 provides a frequent direct service to Beta and Central.',sources:[source],retrievalDate:'2026-07-23',verificationStatus:'verified'};
}
const emptyLibrary={rail:[],stops:[],routes:[],stopRoutes:[]};
test('ordinary combined three-Rail, stop-pair, five-Route scenario is one upload',()=>{
  const rails=['A01','A02','A03'].map(code=>({name:'Station '+code,mode:'National Rail',identifiers:{crs:code},coordinates:{lat:51.5,lon:-.1}})),stops=[stop('STOP-A'),stop('STOP-B')].map(value=>({...value,sources:[],verificationStatus:'needs_review'})),routes=Array.from({length:5},(_,index)=>route(String(index+1),'Origin '+index,'Destination '+index)),relationships=routes.flatMap(record=>stops.map(item=>relationship(item.naptanCode,record)));
  const plan=W.siteResearchPlan({site:{name:'Ordinary site'},rail:rails,stops,routes,relationships,library:emptyLibrary});
  assert.equal(plan.uploadCount,1);assert.equal(plan.summary.railTasks,3);assert.equal(plan.summary.busRouteTasks,5);assert.equal(plan.summary.relationshipTasks,10);
  const request=W.siteResearchRequest(plan,plan.packs[0],{toolkit:'TPT-2.7.0'});assert.equal(request.schema,'tpt-site-research-request-v1');assert.equal(request.researchContract.output.includes('JSON only'),true);assert.equal(JSON.stringify(request).match(/Immediately research every assigned task/g).length,1);
});
test('new Bus stop pair and five new Routes is one compact Bus pack',()=>{
  const stops=[stop('STOP-C'),stop('STOP-D')].map(value=>({...value,sources:[],verificationStatus:'needs_review'})),routes=Array.from({length:5},(_,index)=>route(String(index+21),'Origin '+index,'Destination '+index)),relationships=routes.flatMap(record=>stops.map(item=>relationship(item.naptanCode,record))),plan=W.siteResearchPlan({stops,routes,relationships,library:emptyLibrary});
  assert.equal(plan.uploadCount,1);assert.equal(plan.packs[0].kind,'bus');assert.equal(plan.summary.busRouteTasks,5);assert.equal(plan.summary.relationshipTasks,10);
});
test('reuse-heavy selection creates zero uploads',()=>{
  const rails=['A01','A02','A03'].map(rail),stops=[stop('STOP-A'),stop('STOP-B')],routes=Array.from({length:5},(_,index)=>route(String(index+1),'Origin '+index,'Destination '+index)),relationships=routes.flatMap(record=>stops.map(item=>relationship(item.naptanCode,record))),plan=W.siteResearchPlan({rail:rails,stops,routes,relationships,library:{rail:rails,stops,routes,stopRoutes:relationships}});
  assert.equal(plan.uploadCount,0);assert.equal(plan.summary.reusedRecords,rails.length+stops.length+routes.length+relationships.length);
});
test('complete local proposal wins over an incomplete same-key shared record',()=>{
  const complete=rail('OVR'),incomplete={...complete,fields:{...complete.fields,frequencyTotal:{value:'',status:'needs_review'},frequencyByDestination:{value:[],status:'needs_review'}}},plan=W.siteResearchPlan({rail:[complete],library:{...emptyLibrary,rail:[incomplete,complete]}});
  assert.equal(plan.uploadCount,0);assert.equal(plan.summary.reusedRecords,1);
});
test('existing complete Route at a new stop creates Relationship-only research',()=>{
  const knownRoute=route('241','Here East','Royal Wharf'),knownStop=stop('NEW-STOP'),desired=relationship('NEW-STOP',knownRoute),plan=W.siteResearchPlan({stops:[knownStop],routes:[knownRoute],relationships:[desired],library:{rail:[],stops:[knownStop],routes:[knownRoute],stopRoutes:[]}});
  assert.equal(plan.summary.busRouteTasks,0);assert.equal(plan.summary.relationshipTasks,1);assert.equal(plan.uploadCount,1);
});
test('exact complete Stop–Route Relationship creates zero research',()=>{
  const knownRoute=route('241','Here East','Royal Wharf'),knownStop=stop('KNOWN-STOP'),desired=relationship('KNOWN-STOP',knownRoute),plan=W.siteResearchPlan({stops:[knownStop],routes:[knownRoute],relationships:[desired],library:{rail:[],stops:[knownStop],routes:[knownRoute],stopRoutes:[desired]}});
  assert.equal(plan.uploadCount,0);
});
test('Rail missing only TPH requests only frequency refresh',()=>{
  const incomplete=rail('TPH');incomplete.fields.frequencyTotal={value:'',status:'missing'};incomplete.fields.frequencyByDestination={value:[],status:'missing'};const plan=W.siteResearchPlan({rail:[incomplete],library:{...emptyLibrary,rail:[incomplete]}});
  assert.deepEqual(plan.tasks.rail[0].missingFields.sort(),['frequencyByDestination','frequencyTotal']);
});
test('large assessment uses fewest adaptive packs and never one Route per pack',()=>{
  const routes=Array.from({length:13},(_,index)=>route(String(index+1),'Origin '+index,'Destination '+index)),plan=W.siteResearchPlan({routes,library:emptyLibrary});
  assert.deepEqual(plan.packs.map(pack=>pack.tasks.length),[6,6,1]);assert.ok(plan.packs.slice(0,2).every(pack=>pack.tasks.length===6));
});
test('canonical Route identity ignores operator/context wording and endpoint order',()=>{
  const a=route('73','Alpha','Beta','East London wording A'),b={...a,operator:'Example Operator Ltd.',routeOrigin:'Beta',routeDestination:'Alpha',geographicContext:'Different descriptive prose'};assert.equal(W.routeKey(a),W.routeKey(b));assert.notEqual(W.routeKey(a),W.routeKey(route('73','Alpha','Gamma','East London')));
});
test('partial Site Research import retains passing tasks and isolates failure',()=>{
  const selections=[{name:'Station P01',mode:'National Rail',identifiers:{crs:'P01'}},{name:'Station P02',mode:'National Rail',identifiers:{crs:'P02'}}],plan=W.siteResearchPlan({rail:selections,library:emptyLibrary}),request=W.siteResearchRequest(plan,plan.packs[0],{toolkit:'TPT-2.7.0'}),completed={schema:'tpt-site-research-completed-v1',version:1,requestGroupId:request.requestGroupId,packId:request.packId,packSequence:request.packSequence,totalPackCount:request.totalPackCount,railResults:[{taskId:request.tasks[0].taskId,record:rail('P01')}],busStopResults:[],busRouteResults:[],relationshipResults:[],unresolvedResults:[]},result=W.validateSiteCompleted(request,completed);
  assert.equal(result.accepted.rail.length,1);assert.equal(result.failed.length,1);assert.equal(result.packComplete,false);
});
test('professional Bus completeness blocks blank day, generic evidence and missing direction',()=>{
  const blankDay=route('91');blankDay.saturdayOperatingPeriod='';assert.ok(W.routeMissingFields(blankDay).includes('saturdayOperatingPeriod'));const generic=route('92');generic.sources=[{...source,url:'https://example.com/routes'}];assert.ok(W.routeMissingFields(generic).includes('direct route-specific evidence'));const rel=relationship('STOP-A',route('93'));rel.directionFromStop='';assert.ok(W.relationshipMissingFields(rel).includes('directionFromStop'));
});
test('production migration merged only duplicate wording and sanitized project fields',()=>{
  const routes=JSON.parse(fs.readFileSync(new URL('../data/knowledge/bus-route-library.json',import.meta.url))).records,stops=JSON.parse(fs.readFileSync(new URL('../data/knowledge/bus-stop-library.json',import.meta.url))).records,relationships=JSON.parse(fs.readFileSync(new URL('../data/knowledge/bus-stop-route-library.json',import.meta.url))).records,report=JSON.parse(fs.readFileSync(new URL('../docs/BUS_ROUTE_CANONICAL_MIGRATION_2026-07-23.json',import.meta.url)));
  assert.equal(routes.length,16);assert.deepEqual(report.mergedCandidates.map(item=>item.routeNumber),['262','473']);assert.ok(routes.filter(record=>['262','473'].includes(record.routeNumber)).every(record=>record.previousRevisions.length===1&&record.sources.length>=4));assert.equal(stops.some(record=>['walking','cycling','existingSavedRecord'].some(key=>key in record)),false);assert.equal(relationships.every(record=>routes.some(route=>W.routeIdentityMatches(route,record.compositeRouteKey))),true);
});
test('Planner/Admin and Library Explorer controls are present',()=>{
  const dashboard=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),railHtml=fs.readFileSync(new URL('../modules/railway/index.html',import.meta.url),'utf8'),busHtml=fs.readFileSync(new URL('../modules/bus/index.html',import.meta.url),'utf8'),manager=fs.readFileSync(new URL('../modules/library-manager/assets/library-manager.js',import.meta.url),'utf8');
  assert.match(dashboard,/showAdminTools/);assert.match(dashboard,/mode=explorer/);assert.match(dashboard,/modules\/site-research/);assert.match(railHtml,/admin-only/);assert.match(busHtml,/admin-only/);assert.match(manager,/EXPLORER/);
});
test('EAS component foundation is limited to affected screens',()=>{
  const theme=fs.readFileSync(new URL('../assets/css/eas-theme.css',import.meta.url),'utf8'),dashboard=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),accessibility=fs.readFileSync(new URL('../modules/accessibility/index.html',import.meta.url),'utf8'),stats19=fs.readFileSync(new URL('../modules/stats19/index.html',import.meta.url),'utf8');
  assert.match(theme,/#002060/);assert.match(theme,/#8cfc2b/);assert.match(dashboard,/eas-white\.png/);assert.doesNotMatch(accessibility,/eas-theme|eas-white/);assert.doesNotMatch(stats19,/eas-theme|eas-white/);
});
test('Shared Bus Stop publication sanitizer preserves reusable identity',()=>{
  const shared=fs.readFileSync(new URL('../assets/js/shared-library.js',import.meta.url),'utf8');assert.match(shared,/function sanitizeBusStop/);assert.match(shared,/existingSavedRecord/);assert.match(shared,/sanitize\(path,records\)/);
});
console.log(`\n${passed} Sprint 1C acceptance tests passed.`);
