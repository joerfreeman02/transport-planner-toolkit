let map,siteMarker,walkCircle,cycleCircle;const facilityLayers=[];const walkLayers=[];const cycleLayers=[];
export function initMap(onSiteMoved){
  map=L.map('map',{zoomControl:true}).setView([52.2,-1.4],6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  map.on('click',e=>{if(!siteMarker)return;siteMarker.setLatLng(e.latlng);onSiteMoved(e.latlng.lat,e.latlng.lng);});return map;
}
export function setSite(lat,lon,radii,onMove){
  if(siteMarker)siteMarker.remove();siteMarker=L.marker([lat,lon],{draggable:true,title:'Site'}).addTo(map).bindPopup('<b>Site</b>').openPopup();siteMarker.on('dragend',e=>{const p=e.target.getLatLng();onMove(p.lat,p.lng);});
  map.setView([lat,lon],15);drawCatchments(lat,lon,radii);setTimeout(()=>map.invalidateSize(),100);
}
export function drawCatchments(lat,lon,{walk,cycle}){if(walkCircle)walkCircle.remove();if(cycleCircle)cycleCircle.remove();cycleCircle=L.circle([lat,lon],{radius:cycle,color:'#487f78',weight:1,fillOpacity:.035,dashArray:'7 6'}).addTo(map);walkCircle=L.circle([lat,lon],{radius:walk,color:'#123f3b',weight:2,fillOpacity:.055,dashArray:'5 5'}).addTo(map);}
export function clearResults(){[facilityLayers,walkLayers,cycleLayers].forEach(a=>{a.forEach(x=>x.remove());a.length=0;});}
export function addFacility(result){const m=L.marker([result.element.point.lat,result.element.point.lon]).addTo(map).bindPopup(`<b>${result.category.label}</b><br>${result.name}`);facilityLayers.push(m);}
export function addRoute(geometry,type){if(!geometry?.coordinates)return;const latlngs=geometry.coordinates.map(([lon,lat])=>[lat,lon]);const arr=type==='foot'?walkLayers:cycleLayers;const line=L.polyline(latlngs,{weight:type==='foot'?4:3,opacity:.8,dashArray:type==='bike'?'8 6':null}).addTo(map);arr.push(line);}
export function toggleRoutes(type,visible){const arr=type==='foot'?walkLayers:cycleLayers;arr.forEach(layer=>visible?layer.addTo(map):layer.remove());}
export function fitResults(site,results){const pts=[[site.lat,site.lon],...results.map(r=>[r.element.point.lat,r.element.point.lon])];if(pts.length>1)map.fitBounds(pts,{padding:[28,28],maxZoom:15});}
