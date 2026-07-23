import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const patchSource=fs.readFileSync(new URL('../modules/bus/assets/js/bus-emergency-hotfix.js',import.meta.url),'utf8');

function loadContext(overrides={}){
  const storage=new Map();
  const context={console,setInterval:()=>1,clearInterval:()=>{},queueMicrotask,URL,location:{href:'https://example.test/modules/bus/'},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},...overrides};
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(patchSource,context);
  return{context,storage,hotfix:context.TPTBusEmergencyHotfix};
}

{
  const {hotfix}=loadContext();
  assert.equal(hotfix.exactStopKey({naptanCode:'210021309340'}),'naptan:210021309340');
  assert.equal(hotfix.duplicateIdentities([{naptanCode:'A',stopName:'West'},{naptanCode:'B',stopName:'East'},{naptanCode:'A',stopName:'Duplicate'}]).length,1);
  const discovered={naptanCode:'WEST-1',fallbackIdentity:'',stopName:'Abbotts Court',direction:'W-bound',pairedStopGroup:'abbotts court',coordinates:{latitude:51.1,longitude:0.1},routesServed:[],retrievalDate:'2026-07-23'};
  const library={stops:[{naptanCode:'EAST-2',stopName:'Abbotts Court',direction:'E-bound',routesServed:['99']},{naptanCode:'WEST-1',stopName:'Abbotts Court',direction:'W-bound',routesServed:['33']}],routes:[{routeNumber:'33',canonicalRouteKey:'route:33'}],stopRoutes:[{naptanCode:'WEST-1',routeNumber:'33',canonicalRouteKey:'route:33'}]};
  const {hotfix:H}=loadContext({TPTResearchWorkflow:{routeKey:r=>r.canonicalRouteKey,linkRouteKey:l=>l.canonicalRouteKey,routeIdentityMatches:(r,k)=>r.canonicalRouteKey===k}});
  const result=H.enrichStop(discovered,library);
  assert.equal(result.naptanCode,'WEST-1');
  assert.equal(result.direction,'W-bound');
  assert.deepEqual(Array.from(result.routesServed),['33']);
  assert.equal(result.routesServed.includes('99'),false);
}

function makeRow({code,name,direction,pair,lat,lon,checked=true}){
  const small={textContent:`NaPTAN/ATCO: ${code} · NaPTAN identity via mapped stop data · Stanstead Abbotts`};
  const focus={textContent:name};
  const link={href:`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`};
  const checkbox={checked};
  return{dataset:{stopId:`naptan:${code}`},children:[{}, {}, {textContent:`${direction} · Pair ${pair}`},{textContent:'123 m'},{textContent:'241 m · 3 min · routed'},{textContent:'200 m · 1 min · routed'}],querySelector(sel){if(sel==='small')return small;if(sel==='.stop-focus')return focus;if(sel==='a[href*="google.com/maps"]')return link;if(sel==='input[type="checkbox"]')return checkbox;return null;}};
}

{
  const rows=[makeRow({code:'210021309340',name:'Abbotts Court',direction:'W-bound',pair:'abbotts court',lat:51.7888,lon:0.0068}),makeRow({code:'210021303480',name:'Abbotts Court',direction:'E-bound',pair:'abbotts court',lat:51.78859,lon:0.00702}),makeRow({code:'210021303500',name:'Abbotts Rise',direction:'adj',pair:'abbotts rise',lat:51.7868,lon:0.0110}),makeRow({code:'210021309320',name:'Abbotts Rise',direction:'opp',pair:'abbotts rise',lat:51.78689,lon:0.01128})];
  const elements={busImportProgress:{dataset:{},textContent:''},siteLat:{value:'51.787875'},siteLon:{value:'0.008841'},projectName:{value:'Test'},siteAddress:{value:'Stanstead Abbotts'}};
  const location={href:'https://example.test/modules/bus/'};
  const {context,storage,hotfix}=loadContext({location,document:{querySelectorAll:sel=>sel==='#stopRows tr[data-stop-id]'?rows:[],getElementById:id=>elements[id]||null,querySelector:()=>null},TPTSharedLibrary:{loadAll:async()=>({busStops:{records:[]},busRoutes:{records:[]},busStopRoutes:{records:[]}})},TPTResearchWorkflow:{routeKey:r=>r.canonicalRouteKey||'',linkRouteKey:l=>l.canonicalRouteKey||'',routeIdentityMatches:()=>false}});
  await hotfix.openBusOnlyResearch();
  const saved=JSON.parse(storage.get('tpt.site-research.bus-selection.v1'));
  assert.equal(saved.stops.length,4);
  assert.deepEqual(saved.stops.map(s=>s.naptanCode),['210021309340','210021303480','210021303500','210021309320']);
  assert.deepEqual(saved.stops.map(s=>s.direction),['W-bound','E-bound','adj','opp']);
  assert.equal(context.location.href,'../site-research/');
  rows[1]=makeRow({code:'210021309340',name:'Duplicate',direction:'E-bound',pair:'abbotts court',lat:51.78859,lon:0.00702});
  storage.delete('tpt.site-research.bus-selection.v1');
  context.location.href='https://example.test/modules/bus/';
  await hotfix.openBusOnlyResearch();
  assert.equal(storage.has('tpt.site-research.bus-selection.v1'),false);
  assert.match(elements.busImportProgress.textContent,/same Bus Stop identity/i);
}

console.log('Emergency Bus exact-identity tests passed.');
