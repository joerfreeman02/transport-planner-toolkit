import {APP_VERSION,MAX_ROUTE_CONCURRENCY} from './config.js';
import {CATEGORIES,GROUPS} from './categories.js';
import {geocodeAddress,fetchFacilities,routeBetween,fallbackRoute} from './services.js';
import {normaliseElements,classifyNearest,mergeMissing} from './engine.js';
import {initMap,setSite,drawCatchments,clearResults,addFacility,addRoute,toggleRoutes,fitResults} from './map.js';
import {fmtDistance,fmtTime,escapeHtml,runPool,downloadText} from './utils.js';

const $=id=>document.getElementById(id);const state={site:null,siteConfirmed:false,address:'',results:[],sourceEndpoints:[],started:0};
initMap((lat,lon)=>updateSite(lat,lon,'Pin adjusted — confirm again.'));

function radii(){return {walk:Number($('walkRadius').value)||2000,cycle:Number($('cycleRadius').value)||5000};}
function updateSite(lat,lon,message){state.site={lat:Number(lat),lon:Number(lon)};state.siteConfirmed=false;$('latInput').value=state.site.lat.toFixed(6);$('lonInput').value=state.site.lon.toFixed(6);setSite(state.site.lat,state.site.lon,radii(),(a,b)=>updateSite(a,b,'Pin adjusted — confirm again.'));$('siteMessage').textContent=message;$('siteState').className='status warn';$('siteState').textContent='Confirm pin';$('confirmSiteBtn').disabled=false;$('runBtn').disabled=true;}
$('walkRadius').addEventListener('change',()=>state.site&&drawCatchments(state.site.lat,state.site.lon,radii()));$('cycleRadius').addEventListener('change',()=>state.site&&drawCatchments(state.site.lat,state.site.lon,radii()));
$('locateBtn').onclick=async()=>{const q=$('addressInput').value.trim();if(!q)return alert('Enter an address or postcode.');setButton($('locateBtn'),true,'Locating…');try{const data=await geocodeAddress(q);if(!data.length)throw new Error('No address match found.');const best=data[0];state.address=best.display_name;updateSite(best.lat,best.lon,`Located: ${best.display_name}. Check and confirm the pin.`);}catch(e){setSiteStatus('bad','Location failed');$('siteMessage').textContent=e.message;}finally{setButton($('locateBtn'),false,'Locate');}};
$('useCoordsBtn').onclick=()=>{const lat=Number($('latInput').value),lon=Number($('lonInput').value);if(!Number.isFinite(lat)||!Number.isFinite(lon))return alert('Enter valid latitude and longitude.');state.address=`${lat.toFixed(6)}, ${lon.toFixed(6)}`;updateSite(lat,lon,'Coordinates loaded. Check and confirm the pin.');};
$('confirmSiteBtn').onclick=()=>{state.siteConfirmed=true;setSiteStatus('good','Site confirmed');$('siteMessage').textContent=`Confirmed at ${state.site.lat.toFixed(6)}, ${state.site.lon.toFixed(6)}.`;$('runBtn').disabled=false;$('confirmSiteBtn').disabled=true;};
function setSiteStatus(kind,text){$('siteState').className=`status ${kind}`;$('siteState').textContent=text;}
function setButton(btn,busy,text){btn.disabled=busy;btn.textContent=text;}
function progress(frac,text){$('progressWrap').hidden=false;$('progressBar').style.width=`${Math.min(100,Math.max(0,frac*100))}%`;$('progressText').textContent=text;}
function runStatus(kind,text){$('runState').className=`status ${kind}`;$('runState').textContent=text;}

$('runBtn').onclick=async()=>{
  if(!state.siteConfirmed)return alert('Confirm the site pin first.');state.started=performance.now();state.results=[];state.sourceEndpoints=[];clearResults();$('resultsCard').hidden=true;$('diagnostics').hidden=true;setButton($('runBtn'),true,'Searching…');runStatus('warn','Running');
  try{
    const {walk,cycle}=radii();progress(.06,`Downloading mapped facilities within ${(walk/1000).toFixed(1)} km…`);
    const primary=await fetchFacilities(state.site.lat,state.site.lon,walk);state.sourceEndpoints.push(primary.endpoint);const primaryElements=normaliseElements(primary.elements);
    progress(.26,`Classifying ${primaryElements.length.toLocaleString()} mapped features locally…`);
    let nearest=classifyNearest(primaryElements,state.site,walk);
    const missingWide=CATEGORIES.filter(c=>c.wide&&!nearest.has(c.key));
    if(cycle>walk&&missingWide.length){progress(.34,`Extending ${missingWide.length} wider-catchment categories to ${(cycle/1000).toFixed(1)} km…`);try{const ext=await fetchFacilities(state.site.lat,state.site.lon,cycle,{extension:true});state.sourceEndpoints.push(ext.endpoint);const extElements=normaliseElements(ext.elements);const extra=classifyNearest(extElements,state.site,cycle,c=>c.wide&&missingWide.some(m=>m.key===c.key));nearest=mergeMissing(nearest,extra);}catch(e){showDiagnostic(`5 km extension failed; valid 2 km results retained.\n${e.message}`);}}
    const selected=CATEGORIES.map(c=>nearest.get(c.key)).filter(Boolean);if(!selected.length)throw new Error('The facility download succeeded, but no valid categories were classified.');
    progress(.42,`Routing ${selected.length} nearest facilities…`);
    const routed=await runPool(selected,MAX_ROUTE_CONCURRENCY,async item=>{
      let [walkRoute,cycleRoute]=await Promise.all([routeBetween(state.site,item.element.point,'foot'),routeBetween(state.site,item.element.point,'bike')]);
      if(walkRoute.distance==null)walkRoute=fallbackRoute(item.straight,'foot');if(cycleRoute.distance==null)cycleRoute=fallbackRoute(item.straight,'bike');return {...item,walkRoute,cycleRoute};
    },(done,total)=>progress(.42+.55*(done/total),`Routing facilities ${done} of ${total}…`));
    state.results=routed.filter(r=>!r.error);state.results.forEach(r=>{addFacility(r);addRoute(r.walkRoute.geometry,'foot');addRoute(r.cycleRoute.geometry,'bike');});toggleRoutes('bike',$('showCycleRoutes').checked);fitResults(state.site,state.results);renderResults();progress(1,'Complete.');setTimeout(()=>$('progressWrap').hidden=true,650);runStatus('good','Complete');
  }catch(e){runStatus('bad','Failed');showDiagnostic(e.message);progress(1,'Search failed.');}finally{setButton($('runBtn'),false,'Find nearest facilities');$('runBtn').disabled=!state.siteConfirmed;}
};

function showDiagnostic(text){$('diagnostics').hidden=false;$('diagnostics').textContent=text;}
$('showWalkRoutes').onchange=e=>toggleRoutes('foot',e.target.checked);$('showCycleRoutes').onchange=e=>toggleRoutes('bike',e.target.checked);

function renderResults(){const tbody=$('resultsTable').querySelector('tbody');tbody.innerHTML='';const order=[...state.results].sort((a,b)=>a.walkRoute.distance-b.walkRoute.distance);for(const g of GROUPS){const rows=order.filter(r=>r.category.group===g.id);if(!rows.length)continue;const tr=document.createElement('tr');tr.className='group-row';tr.innerHTML=`<td colspan="5">${escapeHtml(g.label)}</td>`;tbody.appendChild(tr);for(const r of rows){const row=document.createElement('tr');row.innerHTML=`<td>${escapeHtml(r.category.label)}</td><td><strong>${escapeHtml(r.name)}</strong>${r.address?`<span class="subtle">${escapeHtml(r.address)}</span>`:''}</td><td class="metric">${fmtDistance(r.walkRoute.distance)} / ${fmtTime(r.walkRoute.duration)}${r.walkRoute.estimated?'<span class="flag">estimated</span>':''}</td><td class="metric">${fmtDistance(r.cycleRoute.distance)} / ${fmtTime(r.cycleRoute.duration)}${r.cycleRoute.estimated?'<span class="flag">estimated</span>':''}</td><td><a class="source-link" href="${r.element.sourceUrl}" target="_blank" rel="noopener">OSM ↗</a></td>`;tbody.appendChild(row);}}
  $('elapsedBadge').textContent=`${((performance.now()-state.started)/1000).toFixed(1)} sec`;$('resultsCard').hidden=false;$('resultsCard').scrollIntoView({behavior:'smooth',block:'start'});
}

$('exportCsvBtn').onclick=()=>{const rows=[['Facility','Name','Address','Walking distance (m)','Walking time (min)','Walking estimated','Cycling distance (m)','Cycling time (min)','Cycling estimated','Data source','Source URL','App version']];for(const r of state.results){rows.push([r.category.label,r.name,r.address,Math.round(r.walkRoute.distance),(r.walkRoute.duration/60).toFixed(1),r.walkRoute.estimated?'yes':'no',Math.round(r.cycleRoute.distance),(r.cycleRoute.duration/60).toFixed(1),r.cycleRoute.estimated?'yes':'no','OpenStreetMap / OSRM',r.element.sourceUrl,APP_VERSION]);}const csv=rows.map(x=>x.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');downloadText('accessibility_assessment_alpha_0_1.csv',csv,'text/csv;charset=utf-8');};
$('copyTableBtn').onclick=async()=>{try{await navigator.clipboard.writeText($('resultsTable').innerText);alert('Table copied.');}catch{alert('Clipboard access was blocked. Select and copy the table manually.');}};
$('generateTextBtn').onclick=()=>{const sorted=[...state.results].sort((a,b)=>a.walkRoute.distance-b.walkRoute.distance);const paragraphs=[];paragraphs.push(`An assessment of access to local facilities has been undertaken from the confirmed site location at ${state.address||`${state.site.lat.toFixed(6)}, ${state.site.lon.toFixed(6)}`}. Routed walking and cycling distances and journey times have been calculated using the mapped pedestrian and cycle networks.`);for(const g of GROUPS){const rows=sorted.filter(r=>r.category.group===g.id);if(!rows.length)continue;const sentences=rows.map(r=>`the nearest ${r.category.label.toLowerCase()} is ${r.name}, approximately ${fmtDistance(r.walkRoute.distance)} (${fmtTime(r.walkRoute.duration)}) on foot and ${fmtDistance(r.cycleRoute.distance)} (${fmtTime(r.cycleRoute.duration)}) by cycle${r.walkRoute.estimated||r.cycleRoute.estimated?' [estimated route — verify]':''}`);paragraphs.push(`${g.label}: ${sentences.join('; ')}.`);}paragraphs.push('The identified facilities and routes should be checked against current authoritative information and/or site observations before inclusion in a formal submission.');$('reportText').value=paragraphs.join('\n\n');$('reportText').hidden=false;};

$('diagnosticsBtn').onclick=async()=>{setButton($('diagnosticsBtn'),true,'Testing…');$('diagnostics').hidden=false;$('diagnostics').textContent='Testing geocoding and facility-data services…';const lines=[];try{const g=await geocodeAddress('SW1A 1AA');lines.push(g.length?'✓ Geocoding responded':'⚠ Geocoding returned no result');}catch(e){lines.push(`✗ Geocoding: ${e.message}`);}try{const f=await fetchFacilities(51.501,-0.141,250);lines.push(`✓ Facility data responded via ${new URL(f.endpoint).host}`);}catch(e){lines.push(`✗ Facility data: ${e.message}`);}$('diagnostics').textContent=lines.join('\n');setButton($('diagnosticsBtn'),false,'Test live services');};
