const request=async(url,options={})=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),options.timeout||15000);try{const{timeout,...fetchOptions}=options;const response=await fetch(url,{...fetchOptions,headers:{Accept:'application/json',...(fetchOptions.headers||{})},signal:controller.signal});if(!response.ok)throw new Error(`Provider returned HTTP ${response.status}.`);return await response.json();}finally{clearTimeout(timer)}};

export async function geocodeAddress(query){
  const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=gb&limit=5&q=${encodeURIComponent(query)}`;
  const data=await request(url,{timeout:12000});
  return data.map(item=>({latitude:Number(item.lat),longitude:Number(item.lon),label:item.display_name}));
}

export async function discoverStops(latitude,longitude,radius=1200){
  const query=`[out:json][timeout:20];(node(around:${radius},${latitude},${longitude})[highway=bus_stop];node(around:${radius},${latitude},${longitude})[public_transport=platform][bus=yes];way(around:${radius},${latitude},${longitude})[public_transport=platform][bus=yes];);out center tags;`;
  const data=await request('https://overpass-api.de/api/interpreter',{timeout:25000,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:`data=${encodeURIComponent(query)}`});
  return data.elements||[];
}
