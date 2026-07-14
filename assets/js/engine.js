import {CATEGORIES} from './categories.js';
import {elementPoint,elementName,elementAddress,haversine} from './utils.js';

export function normaliseElements(elements){
  const seen=new Set();const out=[];
  for(const el of elements){const point=elementPoint(el);if(!point)continue;const id=`${el.type}/${el.id}`;if(seen.has(id))continue;seen.add(id);out.push({...el,point,tags:el.tags||{},sourceUrl:`https://www.openstreetmap.org/${el.type}/${el.id}`});}
  return out;
}
export function classifyNearest(elements,site,maxStraight=Infinity,categoryFilter=null){
  const cats=categoryFilter?CATEGORIES.filter(categoryFilter):CATEGORIES;const results=new Map();
  for(const cat of cats){let best=null;for(const el of elements){if(!cat.match(el.tags))continue;const straight=haversine(site.lat,site.lon,el.point.lat,el.point.lon);if(straight>maxStraight)continue;if(!best||straight<best.straight){best={category:cat,element:el,straight,name:elementName(el.tags),address:elementAddress(el.tags)};}}if(best)results.set(cat.key,best);}
  return results;
}
export function mergeMissing(primary,extension){for(const [key,val] of extension){if(!primary.has(key))primary.set(key,val);}return primary;}
