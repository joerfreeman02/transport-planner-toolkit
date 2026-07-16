export const BUILD = 'Accessibility Assessment 1.4 · AA-1.4.0-20260716';
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];
export const CATEGORY_GROUPS = [
  {title:'Transport', keys:['bus_stop','national_rail_station','underground_station','overground_station','dlr_station','tram_stop','cycle_parking']},
  {title:'Education and childcare', keys:['nursery','primary_school','secondary_school','sixth_form','fe_college','university']},
  {title:'Everyday needs', keys:['supermarket','convenience_store','post_office','bank','cashpoint','petrol_station']},
  {title:'Healthcare', keys:['gp_surgery','pharmacy','dentist','hospital','urgent_care','optician']},
  {title:'Leisure and community', keys:['park_open_space','playground','gym_leisure','sports_facility','library','community_centre','place_of_worship','pub_bar','cafe','restaurant']}
];
export const CATEGORY_LABELS = {
  bus_stop:'Bus stop',national_rail_station:'National Rail station',underground_station:'London Underground station',overground_station:'London Overground station',dlr_station:'DLR station',tram_stop:'Tram stop',cycle_parking:'Cycle parking',
  nursery:'Nursery / childcare',primary_school:'Primary school',secondary_school:'Secondary school',sixth_form:'Sixth form',fe_college:'Further-education college',university:'University',
  supermarket:'Supermarket',convenience_store:'Convenience store',post_office:'Post office',bank:'Bank',cashpoint:'Cashpoint',petrol_station:'Petrol filling station',
  gp_surgery:'GP surgery',pharmacy:'Pharmacy',dentist:'Dentist',hospital:'Hospital',urgent_care:'Urgent treatment / walk-in centre',optician:'Optician',
  park_open_space:'Park / open space',playground:"Children's playground",gym_leisure:'Gym / leisure centre',sports_facility:'Sports facility',library:'Library',community_centre:'Community centre',place_of_worship:'Place of worship',pub_bar:'Public house / bar',cafe:'Café',restaurant:'Restaurant'
};
export const EXTENSION_KEYS = new Set(['national_rail_station','underground_station','overground_station','dlr_station','tram_stop','sixth_form','fe_college','university','hospital','urgent_care','secondary_school']);
