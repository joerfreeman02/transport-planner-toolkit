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
