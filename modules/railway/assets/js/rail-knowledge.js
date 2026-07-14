export const KNOWLEDGE_KEY='tpt.rail.knowledge.v2';
export const BACKUP_KEY='tpt.rail.knowledge.backup.v2';

export function normaliseStationName(name=''){
  return String(name).toLowerCase()
    .replace(/railway station|station/g,'')
    .replace(/&/g,'and')
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
}

export function stationKey(name,mode=''){
  return `${normaliseStationName(name)}|${String(mode).toLowerCase().trim()}`;
}

export function emptyField(value=''){
  return {value, status:value?'review':'missing', source:'', retrieved:''};
}

export function ensureRecordShape(record){
  if(!record||typeof record!=='object') return record;
  record.fields=record.fields||{};
  const keys=['manager','operators','lineNames','frequency','destinations','cycleParking','stepFree','ticketing','waiting','toilets','carParking'];
  for(const k of keys) record.fields[k]={...emptyField(),...(record.fields[k]||{})};
  record.notes=record.notes||'';
  record.updatedAt=record.updatedAt||new Date().toISOString();
  record.key=record.key||stationKey(record.name,record.mode);
  return record;
}

export function makeRecord(station){
  const mappedLines=[station.tags?.line,station.tags?.ref,station.tags?.route_ref].filter(Boolean).join(', ');
  return ensureRecordShape({
    key: stationKey(station.name,station.mode),
    name: station.name,
    mode: station.mode,
    crs:station.tags?.ref||station.tags?.uic_ref||'',
    latitude:station.lat,
    longitude:station.lon,
    fields:{
      manager:emptyField(station.manager||''),
      operators:emptyField(station.operators||''),
      lineNames:emptyField(mappedLines),
      frequency:emptyField(station.frequency||''),
      destinations:emptyField(station.destinations||''),
      cycleParking:emptyField(station.cycleParking||''),
      stepFree:emptyField(station.stepFree||''),
      ticketing:emptyField(''),
      waiting:emptyField(''),
      toilets:emptyField(''),
      carParking:emptyField('')
    },
    notes:'',
    updatedAt:new Date().toISOString()
  });
}

function migrateLibrary(lib){
  const out={};
  for(const [k,v] of Object.entries(lib||{})){
    const r=ensureRecordShape(v);
    if(r) out[r.key||k]=r;
  }
  return out;
}

export function loadLibrary(){
  try{
    const v2=JSON.parse(localStorage.getItem(KNOWLEDGE_KEY)||'{}');
    if(v2&&Object.keys(v2).length) return migrateLibrary(v2);
    const v1=JSON.parse(localStorage.getItem('tpt.rail.knowledge.v1')||'{}');
    const migrated=migrateLibrary(v1);
    if(Object.keys(migrated).length) saveLibrary(migrated);
    return migrated;
  }catch{return{}}
}
export function saveLibrary(lib){localStorage.setItem(KNOWLEDGE_KEY,JSON.stringify(migrateLibrary(lib)));}
export function backupLibrary(lib){localStorage.setItem(BACKUP_KEY,JSON.stringify({createdAt:new Date().toISOString(),records:migrateLibrary(lib)}));}
export function matchRecord(lib,station){
  const exact=lib[stationKey(station.name,station.mode)]; if(exact)return ensureRecordShape(exact);
  const n=normaliseStationName(station.name);
  return ensureRecordShape(Object.values(lib).find(r=>normaliseStationName(r.name)===n)||null);
}
export function upsertRecord(lib,record){
  ensureRecordShape(record);record.updatedAt=new Date().toISOString();
  lib[record.key||stationKey(record.name,record.mode)]=record;saveLibrary(lib);return lib;
}
export function statusLabel(status){return status==='verified'?'Verified':status==='review'?'Needs review':status==='manual'?'Manual':'Missing';}
export function statusClass(status){return status==='verified'?'good':status==='review'||status==='manual'?'warn':'neutral';}
export function verifiedCount(record){return Object.values(ensureRecordShape(record)?.fields||{}).filter(f=>f.status==='verified'&&f.value).length;}
export function isStale(record,days=365){
  const dates=Object.values(ensureRecordShape(record)?.fields||{}).filter(f=>f.value&&f.retrieved).map(f=>new Date(f.retrieved));
  if(!dates.length)return true;
  const newest=Math.max(...dates.map(d=>d.getTime()).filter(Number.isFinite));
  return !Number.isFinite(newest)||Date.now()-newest>days*86400000;
}
