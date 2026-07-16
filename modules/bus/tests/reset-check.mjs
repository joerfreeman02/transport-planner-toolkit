import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../assets/js/bus-core.js',import.meta.url),'utf8');
const request=JSON.parse(fs.readFileSync(new URL('./fixtures/sample-research-request.json',import.meta.url),'utf8'));
const completed=JSON.parse(fs.readFileSync(new URL('./fixtures/sample-completed-research.json',import.meta.url),'utf8'));
const checks=[
 ['seven-stage interface',...[1,2,3,4,5,6,7].map(x=>html.includes('step">'+x))],
 ['manual service form removed',!html.includes('manual directional service')&&!html.includes('source URL')],
 ['self-instructing task',/research every selected bus stop/i.test(request.task)&&/do not ask/i.test(request.task)&&/do not return only prose/i.test(request.task)],
 ['sample completed schema',completed.schema==='tpt.bus-research'&&completed.stopRecords.length===1&&completed.routeRecords.length===1&&completed.stopRouteRecords.length===1],
 ['linked knowledge entities',js.includes('stopRouteRecords')&&js.includes('state.library.stopRoutes')],
 ['NaPTAN-first matching',js.includes("return x.naptanCode?'naptan:'")],
 ['backup before import',js.includes("downloadBackup('pre-import')")],
 ['accepted Word formatter',js.includes("assets/js/word-export.js")],
 ['Word and CSV outputs',js.includes('downloadWordDocument')&&js.includes("'.csv'")]
];
let failed=0;for(const [name,...values] of checks){const ok=values.every(Boolean);console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failed++;}if(failed)process.exit(1);console.log('\n'+checks.length+' Bus reset checks passed.');
