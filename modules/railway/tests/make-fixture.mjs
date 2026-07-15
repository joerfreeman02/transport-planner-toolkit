import fs from 'node:fs';
import {buildResearchRequest,makeRecord} from '../assets/js/rail-knowledge.js';
const mk=(s)=>({...s,walk:{distance:900,duration:720,status:'routed',geometry:{type:'LineString',coordinates:[[0,0],[1,1]]}},cycle:{distance:1100,duration:300,status:'estimated',geometry:null},record:makeRecord(s)});
const stations=[mk({name:'Example Central',mode:'National Rail',lat:51.5001,lon:-0.1201,osmId:'node/1001',source:'https://www.openstreetmap.org/node/1001',crs:'EXC'}),mk({name:'Example Underground',mode:'London Underground',lat:51.501,lon:-0.121,osmId:'node/1002',source:'https://www.openstreetmap.org/node/1002',naptan:'940GZZLUEXU',tfl:'EXU'})];
const out=buildResearchRequest(stations,'RAIL-4.0.1-20260715');out.fixture=true;out.fixtureNotice='Test fixture only. Do not import into a production knowledge library.';
fs.writeFileSync(new URL('./fixtures/sample-research-request.json',import.meta.url),JSON.stringify(out,null,2));
