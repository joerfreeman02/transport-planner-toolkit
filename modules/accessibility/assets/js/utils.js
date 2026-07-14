export function haversineM(lat1,lon1,lat2,lon2){const R=6371000,toRad=d=>d*Math.PI/180;const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
export function elementPoint(el){if(el.type==='node'&&Number.isFinite(el.lat)&&Number.isFinite(el.lon))return{lat:el.lat,lon:el.lon};if(el.center&&Number.isFinite(el.center.lat)&&Number.isFinite(el.center.lon))return{lat:el.center.lat,lon:el.center.lon};return null;}
export function formatAddress(t={}){const p=[];const line=[t['addr:housenumber'],t['addr:street']].filter(Boolean).join(' ');if(line)p.push(line);if(t['addr:city'])p.push(t['addr:city']);if(t['addr:postcode'])p.push(t['addr:postcode']);return p.join(', ');}
export function formatDistance(m){if(m==null||!Number.isFinite(m))return '—';return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(1)} km`;}
export function formatDuration(s){if(s==null||!Number.isFinite(s))return '—';return `${Math.max(1,Math.round(s/60))} min`;}
export function sourceUrl(el){return `https://www.openstreetmap.org/${el.type}/${el.id}`;}
export async function fetchWithTimeout(url,options={},timeoutMs=12000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(url,{...options,signal:controller.signal});}finally{clearTimeout(timer);}}
export function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
export function downloadText(filename,text,type='text/plain'){const blob=new Blob([text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
export function uniqueBy(items,keyFn){const seen=new Set();return items.filter(x=>{const k=keyFn(x);if(seen.has(k))return false;seen.add(k);return true;});}
