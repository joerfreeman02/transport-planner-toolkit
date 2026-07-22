const KEY='tpt.project.v1';
const $=id=>document.getElementById(id);
function load(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}}
function save(){
  const project={name:$('projectName').value.trim(),siteAddress:$('siteAddress').value.trim(),updatedAt:new Date().toISOString()};
  localStorage.setItem(KEY,JSON.stringify(project));
  $('projectStatus').textContent='Project details saved in this browser.';
}
function clearProject(){localStorage.removeItem(KEY);$('projectName').value='';$('siteAddress').value='';$('projectStatus').textContent='Project details cleared.';}
const p=load();$('projectName').value=p.name||'';$('siteAddress').value=p.siteAddress||'';
$('saveProject').onclick=save;$('clearProject').onclick=clearProject;

const sharedStatus=$('sharedStatus'),sharedBadge=$('sharedConnectionBadge'),sharedEditor=$('sharedEditor'),sharedToken=$('sharedToken'),publishRail=$('publishRail');
function renderSharedConnection(message){
  const connection=TPTSharedLibrary.connection(),railCount=TPTSharedLibrary.railProposals().length;
  sharedEditor.value=connection.editor||sharedEditor.value;
  sharedBadge.textContent=connection.connected?'Connected':'Read only';sharedBadge.className='status '+(connection.connected?'stable':'existing');
  publishRail.disabled=!connection.connected||!railCount;
  sharedStatus.textContent=message||((connection.connected?'Connected as '+(connection.user||'authorised GitHub user')+'. ':'Read-only shared masters. ')+(connection.lastRefresh?'Last successful refresh: '+new Date(connection.lastRefresh).toLocaleString()+'. ':'')+railCount+' local Rail proposal(s) retained.');
}
async function refreshShared(){try{const masters=await TPTSharedLibrary.loadAll();renderSharedConnection('Shared masters loaded: '+masters.rail.records.length+' Rail, '+masters.busStops.records.length+' Bus Stop, '+masters.busRoutes.records.length+' Bus Route and '+masters.busStopRoutes.records.length+' Stop–Route relationship records.');}catch(error){renderSharedConnection('Shared refresh failed safely: '+error.message+' Local proposals remain unchanged.');}}
$('sharedConnect').onclick=async()=>{try{const editor=sharedEditor.value.trim(),token=sharedToken.value;sharedStatus.textContent='Testing the GitHub connection…';await TPTSharedLibrary.connect(editor,token,$('sharedRemember').checked);sharedToken.value='';renderSharedConnection();}catch(error){sharedToken.value='';renderSharedConnection(error.message);}};
$('sharedDisconnect').onclick=()=>{TPTSharedLibrary.forget();sharedToken.value='';renderSharedConnection('Disconnected. Shared masters remain available read-only.');};
$('sharedRefresh').onclick=refreshShared;
publishRail.onclick=async()=>{try{sharedStatus.textContent='Preparing Rail shared-library merge preview…';const result=await TPTSharedLibrary.publishRail('RAIL-4.4.0');renderSharedConnection('Rail shared publication succeeded at commit '+(result.commit||'confirmed by GitHub')+'.');}catch(error){renderSharedConnection('Rail publication not completed: '+error.message);}};
renderSharedConnection();refreshShared();
