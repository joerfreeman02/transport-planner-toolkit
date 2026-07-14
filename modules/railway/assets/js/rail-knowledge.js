export const KNOWLEDGE_KEY='tpt.rail.knowledge.v1';

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

export function makeRecord(station){
  return {
    key: stationKey(station.name,station.mode),
    name: station.name,
    mode: station.mode,
    crs:'',
    fields:{
      manager:emptyField(station.manager||''),
      operators:emptyField(station.operators||''),
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
  };
}

export function loadLibrary(){
  try{const x=JSON.parse(localStorage.getItem(KNOWLEDGE_KEY)||'{}');return x&&typeof x==='object'?x:{}}catch{return{}}
}
export function saveLibrary(lib){localStorage.setItem(KNOWLEDGE_KEY,JSON.stringify(lib));}
export function matchRecord(lib,station){
  const exact=lib[stationKey(station.name,station.mode)]; if(exact)return exact;
  const n=normaliseStationName(station.name);
  return Object.values(lib).find(r=>normaliseStationName(r.name)===n)||null;
}
export function upsertRecord(lib,record){record.updatedAt=new Date().toISOString();lib[record.key||stationKey(record.name,record.mode)]=record;saveLibrary(lib);return lib;}
export function statusLabel(status){return status==='verified'?'Verified':status==='review'?'Needs review':status==='manual'?'Manual':'Missing';}
export function statusClass(status){return status==='verified'?'good':status==='review'||status==='manual'?'warn':'neutral';}
export function verifiedCount(record){return Object.values(record?.fields||{}).filter(f=>f.status==='verified'&&f.value).length;}
