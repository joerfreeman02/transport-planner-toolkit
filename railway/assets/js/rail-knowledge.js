export const KNOWLEDGE_SCHEMA='tpt-rail-knowledge-v2';
export const KNOWLEDGE_KEY='tpt.rail.knowledge.v2';
export const FIELD_KEYS=['manager','operators','lines','frequency','destinations','cycleParking','stepFree','ticketing','waiting','toilets','carParking','notes'];
export const VALID_STATUSES=['missing','needs review','verified','manual'];
const iso=()=>new Date().toISOString();
export const emptyField=(value='')=>({value,status:value?'needs review':'missing',source:'',retrievalDate:''});
export function normaliseName(v=''){return v.toLowerCase().replace(/railway station|underground station|station/g,'').replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim();}
export function ids(s={}){return{crs:String(s.crs||s.identifiers?.crs||'').toUpperCase(),naptan:String(s.naptan||s.identifiers?.naptan||''),osm:String(s.osmId||s.identifiers?.osm||s.id||'')}}
export function keyFor(s={}){const i=ids(s);return i.crs?`crs:${i.crs}`:i.naptan?`naptan:${i.naptan}`:i.osm?`osm:${i.osm}`:`fallback:${normaliseName(s.name||'')}|${s.mode||''}|${(+s.lat||0).toFixed(3)}|${(+s.lon||0).toFixed(3)}`}
export function makeRecord(s={}){const fields={};FIELD_KEYS.forEach(k=>fields[k]=emptyField());return{schema:KNOWLEDGE_SCHEMA,key:keyFor(s),name:s.name||'',mode:s.mode||'',coordinates:{lat:+s.lat||null,lon:+s.lon||null},identifiers:ids(s),fields,createdAt:iso(),updatedAt:iso()}}
export function migrate(r={}){const x=makeRecord({...r,...r.coordinates,...r.identifiers});x.createdAt=r.createdAt||x.createdAt;x.updatedAt=r.updatedAt||x.updatedAt;x.key=r.key||x.key;FIELD_KEYS.forEach(k=>{const f=r.fields?.[k];if(f)x.fields[k]={value:String(f.value||''),status:VALID_STATUSES.includes(f.status)?f.status:(f.value?'needs review':'missing'),source:String(f.source||''),retrievalDate:String(f.retrievalDate||f.retrieved||'')}});return x}
export function loadLibrary(){try{const x=JSON.parse(localStorage.getItem(KNOWLEDGE_KEY)||'{}'),out={};Object.values(x.records||x).forEach(r=>{const m=migrate(r);out[m.key]=m});return out}catch{return{}}}
export const saveLibrary=r=>localStorage.setItem(KNOWLEDGE_KEY,JSON.stringify({schema:KNOWLEDGE_SCHEMA,updatedAt:iso(),records:r}));
export function distance(a,b){const R=6371000,q=Math.PI/180,dlat=(b.lat-a.lat)*q,dlon=(b.lon-a.lon)*q,h=Math.sin(dlat/2)**2+Math.cos(a.lat*q)*Math.cos(b.lat*q)*Math.sin(dlon/2)**2;return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))}
export function matchRecord(lib,s){const i=ids(s);for(const r of Object.values(lib)){const j=ids(r);if(i.crs&&i.crs===j.crs||i.naptan&&i.naptan===j.naptan||i.osm&&i.osm===j.osm)return r}return Object.values(lib).find(r=>normaliseName(r.name)===normaliseName(s.name)&&r.mode===s.mode&&distance(s,r.coordinates)<500)||null}
const d=f=>Date.parse(f?.retrievalDate||'')||0;
export function mergeRecord(a,b){a=migrate(a);b=migrate(b);const o={...a,...b,fields:{...a.fields},createdAt:a.createdAt,updatedAt:iso()};FIELD_KEYS.forEach(k=>{const x=a.fields[k],y=b.fields[k];if(!y?.value)o.fields[k]=x;else if(x?.status==='verified'&&(y.status!=='verified'||d(x)>d(y)))o.fields[k]=x;else o.fields[k]=y});o.key=keyFor({...o,...o.coordinates,...o.identifiers});return o}
export function upsert(lib,r){const n=migrate(r),old=lib[n.key]||matchRecord(lib,n),m=old?mergeRecord(old,n):n;lib[m.key]=m;saveLibrary(lib);return m}
export function summary(lib){const v=Object.values(lib),dates=v.flatMap(r=>Object.values(r.fields).map(f=>f.retrievalDate).filter(Boolean)).sort();return{count:v.length,lastReview:dates.at(-1)||'',stale:v.filter(r=>Object.values(r.fields).some(f=>f.value&&(!Date.parse(f.retrievalDate)||Date.now()-Date.parse(f.retrievalDate)>31536000000))).length}}
export function validate(data,schema){if(!data||data.schema!==schema)throw Error(`Expected schema ${schema}.`);if(!data.records||(!Array.isArray(data.records)&&typeof data.records!=='object'))throw Error('Missing records.');return true}
