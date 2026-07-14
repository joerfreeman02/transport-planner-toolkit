const n = v => (v||'').toLowerCase();
const nameText = tags => n(`${tags.name||''} ${tags.brand||''} ${tags.operator||''}`);
const exact = (tags,key,...values)=>values.includes(tags[key]);
const nameHas = (tags,re)=>re.test(nameText(tags));
const rejectName = (tags,re)=>re.test(nameText(tags));

export const GROUPS = [
  {id:'transport',label:'Transport'},
  {id:'education',label:'Education and childcare'},
  {id:'everyday',label:'Everyday needs'},
  {id:'healthcare',label:'Healthcare'},
  {id:'leisure',label:'Leisure and community'}
];

export const CATEGORIES = [
  {key:'bus_stop',group:'transport',label:'Bus stop',match:t=>exact(t,'highway','bus_stop')||((t.public_transport==='platform'||t.public_transport==='stop_position')&&(t.bus==='yes'||nameHas(t,/\bbus\b/)))},
  {key:'national_rail',group:'transport',label:'National Rail station',wide:true,match:t=>(exact(t,'railway','station','halt')||t.public_transport==='station')&&!isRapid(t)&&!isTram(t)},
  {key:'underground',group:'transport',label:'London Underground station',wide:true,match:t=>(exact(t,'railway','station','halt')||t.public_transport==='station')&&isUnderground(t)},
  {key:'overground',group:'transport',label:'London Overground station',wide:true,match:t=>(exact(t,'railway','station','halt')||t.public_transport==='station')&&isOverground(t)},
  {key:'dlr',group:'transport',label:'DLR station',wide:true,match:t=>(exact(t,'railway','station','halt')||t.public_transport==='station')&&isDlr(t)},
  {key:'tram',group:'transport',label:'Tram stop',wide:true,match:t=>exact(t,'railway','tram_stop')||t.tram==='yes'||(t.station==='light_rail'&&nameHas(t,/tram/))},
  {key:'cycle_parking',group:'transport',label:'Cycle parking',match:t=>t.amenity==='bicycle_parking'},
  {key:'cycle_hire',group:'transport',label:'Public cycle-hire station',match:t=>t.amenity==='bicycle_rental'||t.bicycle_rental==='docking_station'},
  {key:'park_ride',group:'transport',label:'Park and Ride',wide:true,match:t=>t.park_ride==='yes'||nameHas(t,/park\s*(?:&|and)\s*ride/)},
  {key:'ev_charging',group:'transport',label:'EV charging',match:t=>t.amenity==='charging_station'},

  {key:'nursery',group:'education',label:'Nursery / childcare',match:t=>exact(t,'amenity','kindergarten','childcare')||t.childcare==='yes'},
  {key:'primary_school',group:'education',label:'Primary school',match:t=>t.amenity==='school'&&isPrimary(t)},
  {key:'secondary_school',group:'education',label:'Secondary school',wide:true,match:t=>t.amenity==='school'&&isSecondary(t)},
  {key:'sixth_form',group:'education',label:'Sixth form',wide:true,match:t=>(exact(t,'amenity','school','college')||t.education)&&nameHas(t,/sixth\s*form/)},
  {key:'fe_college',group:'education',label:'Further-education college',wide:true,match:t=>t.amenity==='college'&&!rejectName(t,/adult learning|adult education|learning & skills|learning and skills|training centre|training center/)&&!nameHas(t,/sixth\s*form/)},
  {key:'university',group:'education',label:'University',wide:true,match:t=>t.amenity==='university'},

  {key:'supermarket',group:'everyday',label:'Supermarket',match:t=>t.shop==='supermarket'},
  {key:'convenience',group:'everyday',label:'Convenience store',match:t=>t.shop==='convenience'},
  {key:'post_office',group:'everyday',label:'Post office',match:t=>t.amenity==='post_office'||t.shop==='post_office'},
  {key:'bank',group:'everyday',label:'Bank',match:t=>t.amenity==='bank'},
  {key:'cashpoint',group:'everyday',label:'Cashpoint',match:t=>t.amenity==='atm'},
  {key:'parcel_locker',group:'everyday',label:'Parcel locker',match:t=>t.amenity==='parcel_locker'},
  {key:'fuel',group:'everyday',label:'Petrol filling station',match:t=>t.amenity==='fuel'},

  {key:'gp',group:'healthcare',label:'GP surgery',match:t=>isGp(t)},
  {key:'pharmacy',group:'healthcare',label:'Pharmacy',match:t=>t.amenity==='pharmacy'||t.healthcare==='pharmacy'},
  {key:'dentist',group:'healthcare',label:'Dentist',match:t=>t.amenity==='dentist'||t.healthcare==='dentist'},
  {key:'hospital',group:'healthcare',label:'Hospital',wide:true,match:t=>t.amenity==='hospital'||t.healthcare==='hospital'},
  {key:'urgent_care',group:'healthcare',label:'Urgent treatment / walk-in centre',wide:true,match:t=>(t.amenity==='clinic'||t.healthcare==='clinic')&&nameHas(t,/urgent|walk[- ]?in|minor injuries|treatment centre|treatment center/)},
  {key:'optician',group:'healthcare',label:'Optician',match:t=>t.shop==='optician'||t.healthcare==='optometrist'},

  {key:'park',group:'leisure',label:'Park / open space',match:t=>exact(t,'leisure','park','recreation_ground','nature_reserve')||exact(t,'boundary','protected_area')},
  {key:'playground',group:'leisure',label:"Children's playground",match:t=>t.leisure==='playground'},
  {key:'leisure_centre',group:'leisure',label:'Leisure centre',match:t=>t.leisure==='sports_centre'&&nameHas(t,/leisure|sports centre|sports center/)},
  {key:'gym',group:'leisure',label:'Gym',match:t=>t.leisure==='fitness_centre'||t.leisure==='fitness_station'},
  {key:'sports',group:'leisure',label:'Sports facility',match:t=>exact(t,'leisure','sports_centre','stadium','pitch','track')},
  {key:'library',group:'leisure',label:'Library',match:t=>t.amenity==='library'},
  {key:'community',group:'leisure',label:'Community centre',match:t=>t.amenity==='community_centre'},
  {key:'worship',group:'leisure',label:'Place of worship',match:t=>t.amenity==='place_of_worship'},
  {key:'pub',group:'leisure',label:'Public house',match:t=>exact(t,'amenity','pub','bar')},
  {key:'cafe',group:'leisure',label:'Café',match:t=>t.amenity==='cafe'},
  {key:'restaurant',group:'leisure',label:'Restaurant',match:t=>t.amenity==='restaurant'}
];

function transitText(t){return n(`${t.network||''} ${t.operator||''} ${t.brand||''} ${t.line||''} ${t.station||''} ${t.name||''}`);}
function isUnderground(t){const s=transitText(t);return t.station==='subway'||s.includes('london underground')||s.includes('underground');}
function isOverground(t){return transitText(t).includes('overground');}
function isDlr(t){const s=transitText(t);return /\bdlr\b|docklands light railway/.test(s);}
function isRapid(t){return isUnderground(t)||isOverground(t)||isDlr(t);}
function isTram(t){return t.railway==='tram_stop'||t.tram==='yes'||t.station==='light_rail';}
function isPrimary(t){if(String(t['isced:level']||'').split(';').includes('1'))return true;return nameHas(t,/\b(primary|infant|junior|first school)\b/);}
function isSecondary(t){if(String(t['isced:level']||'').split(';').some(x=>['2','3'].includes(x)))return true;return nameHas(t,/\b(secondary|high school|upper school|comprehensive)\b/)||nameHas(t,/academy/)&&!isPrimary(t);}
function isGp(t){
  if(t.amenity==='doctors'||exact(t,'healthcare','doctor','general_practitioner'))return !rejectName(t,/fitness|gym|leisure|wellbeing club|sports centre|sports center/);
  return (t.amenity==='clinic'||t.healthcare==='clinic')&&nameHas(t,/\b(gp|surgery|medical centre|medical center|health centre|health center|general practice)\b/)&&!rejectName(t,/fitness|gym|leisure|wellbeing club|sports centre|sports center/);
}
