export function withTimeout(promiseFactory, ms, label='Request'){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(`${label} timed out`), ms);
  return promiseFactory(controller.signal).finally(()=>clearTimeout(timer));
}
export function haversine(lat1,lon1,lat2,lon2){
  const R=6371000,toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
export function fmtDistance(m){if(m==null||!Number.isFinite(m))return '—';return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(1)} km`;}
export function fmtTime(seconds){if(seconds==null||!Number.isFinite(seconds))return '—';return `${Math.max(1,Math.round(seconds/60))} min`;}
export function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
export function elementPoint(el){if(el.type==='node'&&Number.isFinite(el.lat))return {lat:el.lat,lon:el.lon};if(el.center)return {lat:el.center.lat,lon:el.center.lon};return null;}
export function elementName(tags={}){return tags.name||tags['name:en']||tags.brand||tags.operator||'(unnamed mapped feature)';}
export function elementAddress(tags={}){const p=[];if(tags['addr:housenumber']||tags['addr:street'])p.push(`${tags['addr:housenumber']||''} ${tags['addr:street']||''}`.trim());if(tags['addr:place'])p.push(tags['addr:place']);if(tags['addr:postcode'])p.push(tags['addr:postcode']);return p.join(', ');}
export async function runPool(items, limit, worker, onProgress=()=>{}){
  let index=0,done=0;const output=new Array(items.length);
  async function runner(){while(true){const i=index++;if(i>=items.length)return;try{output[i]=await worker(items[i],i);}catch(e){output[i]={error:e};}done++;onProgress(done,items.length);}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},runner));return output;
}
export function downloadText(filename,text,mime='text/plain'){const blob=new Blob([text],{type:mime});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
