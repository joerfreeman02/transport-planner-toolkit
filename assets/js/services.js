import {NOMINATIM_URL,OVERPASS_ENDPOINTS,ROUTING_BASE,REQUEST_TIMEOUTS,FALLBACK_SPEED_KMH} from './config.js';
import {withTimeout} from './utils.js';

export async function geocodeAddress(q){
  const params=new URLSearchParams({format:'jsonv2',countrycodes:'gb',limit:'5',addressdetails:'1',q});
  const res=await withTimeout(signal=>fetch(`${NOMINATIM_URL}?${params}`,{signal,headers:{Accept:'application/json'}}),REQUEST_TIMEOUTS.geocode,'Geocoding');
  if(!res.ok)throw new Error(`Geocoding HTTP ${res.status}`);return res.json();
}

function primaryQuery(lat,lon,radius){return `[out:json][timeout:20];(nwr(around:${radius},${lat},${lon})[amenity];nwr(around:${radius},${lat},${lon})[shop];nwr(around:${radius},${lat},${lon})[leisure];nwr(around:${radius},${lat},${lon})[healthcare];nwr(around:${radius},${lat},${lon})[railway];nwr(around:${radius},${lat},${lon})[public_transport];nwr(around:${radius},${lat},${lon})[education];nwr(around:${radius},${lat},${lon})[childcare];nwr(around:${radius},${lat},${lon})["highway"="bus_stop"];nwr(around:${radius},${lat},${lon})[park_ride];);out center tags;`;}
function extensionQuery(lat,lon,radius){return `[out:json][timeout:20];(nwr(around:${radius},${lat},${lon})["railway"~"^(station|halt|tram_stop)$"];nwr(around:${radius},${lat},${lon})["public_transport"="station"];nwr(around:${radius},${lat},${lon})["amenity"~"^(school|college|university|hospital|clinic)$"];nwr(around:${radius},${lat},${lon})["healthcare"~"^(hospital|clinic)$"];nwr(around:${radius},${lat},${lon})[park_ride];);out center tags;`;}

export async function fetchFacilities(lat,lon,radius,{extension=false}={}){
  const q=extension?extensionQuery(lat,lon,radius):primaryQuery(lat,lon,radius);let last;
  for(const endpoint of OVERPASS_ENDPOINTS){
    try{
      const res=await withTimeout(signal=>fetch(endpoint,{method:'POST',signal,headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',Accept:'application/json'},body:`data=${encodeURIComponent(q)}`}),REQUEST_TIMEOUTS.overpass,'Facility download');
      if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json();return {elements:data.elements||[],endpoint};
    }catch(e){last=e;}
  }
  throw new Error(`Facility data unavailable: ${last?.message||'all endpoints failed'}`);
}

export async function routeBetween(from,to,profile){
  const p=profile==='foot'?'foot':'bike';const url=`${ROUTING_BASE}/routed-${p}/route/v1/${p}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=false`;
  try{
    const res=await withTimeout(signal=>fetch(url,{signal,headers:{Accept:'application/json'}}),REQUEST_TIMEOUTS.route,`${profile} routing`);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json();if(data.code!=='Ok'||!data.routes?.length)throw new Error('no route returned');
    const r=data.routes[0];return {distance:r.distance,duration:r.duration,geometry:r.geometry,estimated:false,source:'OSRM'};
  }catch(error){
    return {distance:null,duration:null,geometry:null,estimated:true,source:'fallback',error:error.message};
  }
}
export function fallbackRoute(straight,profile){const factor=profile==='foot'?1.2:1.15;const distance=straight*factor;const kmh=FALLBACK_SPEED_KMH[profile];return {distance,duration:(distance/1000)/kmh*3600,geometry:null,estimated:true,source:'estimated'};}
