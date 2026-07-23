(function(){
  'use strict';
  var enabled=localStorage.getItem('tpt.show-admin-tools.v1')==='true';
  document.documentElement.dataset.adminTools=enabled?'on':'off';
  document.querySelectorAll('.admin-only').forEach(function(element){element.hidden=!enabled;});
})();
