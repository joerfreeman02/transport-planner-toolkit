export const BUS_SCHEMA_VERSION='1.0.0';
const text=value=>String(value??'').trim();
const normal=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const round=value=>Number(value).toFixed(5);

export function stopIdentity(raw){
  if(raw.sourceStopId)return `${raw.source}:${raw.sourceStopId}`;
  return `derived:${normal(raw.name)}:${round(raw.latitude)}:${round(raw.longitude)}:${normal(raw.direction||'unknown')}`;
}

export function normaliseStops(elements,site){
  const exact=new Map();
  for(const element of elements){
    const tags=element.tags||{},latitude=Number(element.lat??element.center?.lat),longitude=Number(element.lon??element.center?.lon);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude))continue;
    const raw={source:'openstreetmap',sourceStopId:`${element.type}/${element.id}`,name:text(tags.name)||'Unnamed bus stop',locality:text(tags.locality||tags['addr:suburb']),latitude,longitude,direction:text(tags.direction||tags.bearing||tags['ref:GB:NaPTAN:Indicator'])||'Direction not stated'};
    const stopId=stopIdentity(raw);if(exact.has(stopId))continue;
    const nameKey=normal(raw.name),pairId=nameKey?`pair:${nameKey}`:null;
    exact.set(stopId,{stopId,sourceStopId:raw.sourceStopId,pairId,name:raw.name,locality:raw.locality,coordinate:{latitude,longitude,crs:'EPSG:4326'},direction:raw.direction,bearing:null,distanceM:Math.round(haversine(site.latitude,site.longitude,latitude,longitude)),included:true,inclusionReason:'Candidate stop within the search area.',verificationState:'researched',sources:[{title:'OpenStreetMap bus-stop data',url:`https://www.openstreetmap.org/${element.type}/${element.id}`,retrievedAt:new Date().toISOString()}]});
  }
  return [...exact.values()].sort((a,b)=>a.distanceM-b.distanceM||a.name.localeCompare(b.name));
}

export function createService(input){
  const value=input.frequencyType==='unknown'||input.frequencyType==='irregular'?null:Number(input.frequencyValue);
  if(!text(input.stopId)||!text(input.routeNumber)||!text(input.operator)||!text(input.direction)||!text(input.destination))throw new Error('Stop, route, operator, direction and destination are required.');
  if(value!==null&&(!Number.isFinite(value)||value<=0))throw new Error('Frequency must be greater than zero.');
  const sourceUrl=safeSourceUrl(input.sourceUrl);
  return{serviceId:crypto.randomUUID(),stopId:text(input.stopId),routeNumber:text(input.routeNumber),operator:text(input.operator),direction:text(input.direction),destination:text(input.destination),operatingHours:text(input.operatingHours),frequency:{type:input.frequencyType,value,dayType:text(input.dayType)||'Typical weekday',period:text(input.period)||'Representative daytime period',qualification:text(input.qualification)},notes:text(input.notes),verificationState:'researched',sources:sourceUrl?[{title:text(input.sourceTitle)||'Bus service source',url:sourceUrl,retrievedAt:new Date().toISOString()}]:[]};
}

function safeSourceUrl(value){if(!text(value))return'';const url=new URL(text(value));if(!['https:','http:'].includes(url.protocol))throw new Error('Source links must use HTTPS or HTTP.');return url.href;}

export function validateAssessment(value){
  const errors=[];
  if(value?.schemaVersion!==BUS_SCHEMA_VERSION)errors.push('Unsupported Bus schema version.');
  if(!value?.assessmentId)errors.push('Assessment identity is missing.');
  if(!value?.site?.confirmed)errors.push('Confirm the site before saving or exporting.');
  if(!Array.isArray(value?.stops))errors.push('Stops must be an array.');
  if(!Array.isArray(value?.services))errors.push('Services must be an array.');
  return errors;
}

export function haversine(lat1,lon1,lat2,lon2){const r=6371000,p=Math.PI/180,a=Math.sin((lat2-lat1)*p/2)**2+Math.cos(lat1*p)*Math.cos(lat2*p)*Math.sin((lon2-lon1)*p/2)**2;return 2*r*Math.asin(Math.sqrt(a));}
