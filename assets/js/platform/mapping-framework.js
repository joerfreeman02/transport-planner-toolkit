export const MAPPING_CONTRACT_VERSION='1.0.0';
const DEFAULT_VIEW=[52.2,-1.4];

export function createMapAdapter({containerId,accessibleSummaryId,onSiteMoved}){
  if(!globalThis.L)throw new Error('The mapping library is unavailable.');
  const map=L.map(containerId,{zoomControl:true}).setView(DEFAULT_VIEW,6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  const markerLayer=L.layerGroup().addTo(map);let siteMarker=null;
  function setSite(latitude,longitude,{fit=true}={}){const point=[Number(latitude),Number(longitude)];if(siteMarker)siteMarker.remove();siteMarker=L.marker(point,{draggable:true,title:'Development site'}).addTo(map).bindPopup('<b>Development site</b>');siteMarker.on('dragend',event=>{const p=event.target.getLatLng();onSiteMoved?.(p.lat,p.lng);});if(fit)map.setView(point,15);setTimeout(()=>map.invalidateSize(),50);}
  function showStops(stops,onSelect){markerLayer.clearLayers();for(const stop of stops){const marker=L.marker([stop.coordinate.latitude,stop.coordinate.longitude],{title:stop.name}).bindPopup(`<b>${escapeHtml(stop.name)}</b><br>${escapeHtml(stop.direction)}`);marker.on('click',()=>onSelect?.(stop.stopId));marker.addTo(markerLayer);}const summary=document.getElementById(accessibleSummaryId);if(summary)summary.textContent=stops.length?`${stops.length} candidate bus stops are shown on the map and listed in the stop table.`:'No candidate bus stops are currently shown.';}
  function fit(stops=[]){const points=[];if(siteMarker){const p=siteMarker.getLatLng();points.push([p.lat,p.lng]);}for(const stop of stops)points.push([stop.coordinate.latitude,stop.coordinate.longitude]);if(points.length>1)map.fitBounds(points,{padding:[28,28],maxZoom:16});}
  function destroy(){map.remove();}
  return{contractVersion:MAPPING_CONTRACT_VERSION,map,setSite,showStops,fit,destroy};
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
