export const PROJECT_CONTEXT_VERSION='1.0.0';
export const PROJECT_STORAGE_KEY='tpt-project-context-v1';

const clean=value=>String(value??'').trim();
export function newProjectContext({projectId,projectName,address,latitude,longitude,clientReference=''}){
  const now=new Date().toISOString(),lat=Number(latitude),lon=Number(longitude);
  if(!clean(projectName)||!clean(address))throw new Error('Project name and site address are required.');
  if(!Number.isFinite(lat)||lat < -90||lat > 90||!Number.isFinite(lon)||lon < -180||lon > 180)throw new Error('Valid WGS84 site coordinates are required.');
  return{schemaVersion:PROJECT_CONTEXT_VERSION,projectId:clean(projectId)||crypto.randomUUID(),projectName:clean(projectName),clientReference:clean(clientReference),site:{address:clean(address),coordinate:{latitude:lat,longitude:lon,crs:'EPSG:4326'}},createdAt:now,updatedAt:now};
}
export function saveProjectContext(context){localStorage.setItem(PROJECT_STORAGE_KEY,JSON.stringify({...context,updatedAt:new Date().toISOString()}));}
export function loadProjectContext(){try{const value=JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY)||'null');return value?.schemaVersion===PROJECT_CONTEXT_VERSION?value:null}catch{return null}}

