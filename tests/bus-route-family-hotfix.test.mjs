import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(
  new URL('../modules/site-research/bus-route-family-hotfix.js',import.meta.url),
  'utf8'
);

const normal=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

function routeKey(route){
  if(route.canonicalRouteKey)return route.canonicalRouteKey;
  const ends=[normal(route.routeOrigin),normal(route.routeDestination)].sort().join('~');
  return `route:${normal(route.transportAuthority)}:${normal(route.routeNumber)}:${ends}:`;
}

function linkRouteKey(link){
  return link.canonicalRouteKey||link.compositeRouteKey||link.routeIdentifier||routeKey(link);
}

function routeIdentityMatches(route,value){
  return normal(routeKey(route))===normal(value)||
    (route.legacyRouteKeys||[]).some(alias=>normal(alias)===normal(value));
}

function stopKey(stop){
  return normal(stop.naptanCode||stop.fallbackIdentity);
}

function missingRelationship(record){
  const required=[
    'directionFromStop','stopSpecificDestination','mondayFridayOperatingPeriod',
    'saturdayOperatingPeriod','sundayOperatingPeriod','servicePattern'
  ];
  return required.filter(key=>!String(record[key]??'').trim());
}

let captured;
const workflow={
  routeKey,
  linkRouteKey,
  routeIdentityMatches,
  stopKey,
  missingRelationship,
  siteResearchPlan(input){
    captured=input;
    return input;
  }
};

const context={globalThis:{TPTResearchWorkflow:workflow}};
vm.runInNewContext(source,context);

const route35Group={
  transportAuthority:'hertfordshire-intalink',
  routeNumber:'35/35B/35C',
  operator:'Central Connect',
  routeOrigin:'Hertford',
  routeDestination:"Bishop's Stortford",
  principalLocationsServed:['Ware','Stanstead Abbotts','Hunsdon'],
  sources:[{url:'https://www.intalink.org.uk/services/grouped-route'}],
  verificationStatus:'verified'
};
const route35={
  transportAuthority:'hertfordshire-intalink',
  routeNumber:'35',
  operator:'Central Connect',
  routeOrigin:'Hertford',
  routeDestination:"Bishop's Stortford"
};
const route35c={
  transportAuthority:'hertfordshire-intalink',
  routeNumber:'35C',
  operator:'Central Connect',
  routeOrigin:'Hertford',
  routeDestination:"Bishop's Stortford"
};
const route25Preferred={
  transportAuthority:'hertfordshire-intalink',
  routeNumber:'25/25B',
  operator:'Central Connect',
  routeOrigin:'Harlow Town Centre',
  routeDestination:'Cheshunt / Brookfield Centre or Broxbourne',
  principalLocationsServed:['Harlow','Stanstead Abbotts','Hoddesdon','Cheshunt'],
  sources:[{url:'https://www.intalink.org.uk/services/preferred-25'}],
  verificationStatus:'verified'
};
const route25Duplicate={
  transportAuthority:'hertfordshire-intalink',
  routeNumber:'25/25B',
  operator:'Central Connect',
  routeOrigin:'Harlow',
  routeDestination:'Cheshunt, Brookfield Centre'
};
const route33={
  transportAuthority:'hertfordshire-intalink',
  routeNumber:'33',
  operator:'Central Connect',
  routeOrigin:'Hoddesdon',
  routeDestination:"Bishop's Stortford"
};

const complete25={
  naptanCode:'210021303480',
  canonicalRouteKey:routeKey(route25Duplicate),
  routeNumber:'25/25B',
  directionFromStop:'Eastbound',
  stopSpecificDestination:'Cheshunt',
  mondayFridayOperatingPeriod:'06:00-20:00',
  saturdayOperatingPeriod:'07:00-19:00',
  sundayOperatingPeriod:'No service',
  servicePattern:'Hourly'
};
const incomplete25={
  naptanCode:'210021303480',
  canonicalRouteKey:routeKey(route25Preferred),
  routeNumber:'25/25B'
};

const input={
  stops:[
    {naptanCode:'210021309340',direction:'Westbound'},
    {naptanCode:'210021303480',direction:'Eastbound'},
    {naptanCode:'210021303500',direction:'adj'},
    {naptanCode:'210021309320',direction:'opp'}
  ],
  routes:[route35Group,route35,route35c,route25Preferred,route25Duplicate,route33],
  relationships:[
    complete25,
    incomplete25,
    {
      naptanCode:'210021303500',
      canonicalRouteKey:routeKey(route35),
      routeNumber:'35',
      directionFromStop:'Northbound'
    },
    {
      naptanCode:'210021303500',
      canonicalRouteKey:routeKey(route35c),
      routeNumber:'35C',
      directionFromStop:'Northbound'
    },
    {
      naptanCode:'210021309340',
      canonicalRouteKey:routeKey(route33),
      routeNumber:'33',
      directionFromStop:'Northbound'
    }
  ]
};

context.globalThis.TPTResearchWorkflow.siteResearchPlan(input);

assert.equal(captured.routes.length,3,'Duplicate route-family records should consolidate to 3');
assert.equal(
  JSON.stringify(Array.from(captured.routes,route=>route.routeNumber).sort()),
  JSON.stringify(['25/25B','33','35/35B/35C'].sort())
);

assert.equal(
  captured.relationships.filter(link=>link.naptanCode==='210021303480').length,
  1,
  'Duplicate 25/25B relationships at one stop should consolidate'
);
assert.equal(
  captured.relationships.find(link=>link.naptanCode==='210021303480').servicePattern,
  'Hourly',
  'The more complete relationship must be preserved'
);

const route35Links=captured.relationships.filter(link=>link.naptanCode==='210021303500');
assert.equal(route35Links.length,1,'35 and 35C relationships should consolidate by family');
assert.equal(route35Links[0].routeNumber,'35/35B/35C');
assert.equal(route35Links[0].canonicalRouteKey,routeKey(route35Group));

assert.equal(
  JSON.stringify(input.stops.map(stop=>stop.naptanCode)),
  JSON.stringify(['210021309340','210021303480','210021303500','210021309320']),
  'Exact Bus Stop identities must remain untouched'
);

assert.equal(workflow.__busRouteFamilyRestoreInstalled,true);
assert.equal(
  workflow.busRouteFamilyRestoreBuild,
  'BUS-ROUTE-FAMILY-RESTORE-1.0.0-20260723'
);

console.log('PASS Bus route-family consolidation and exact-stop preservation');
