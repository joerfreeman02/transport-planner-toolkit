(function(root){
  'use strict';

  var BUILD='BUS-EMERGENCY-182-20260723';
  var ADMIN_KEY='tpt.show-admin-tools.v1';
  var SELECTION_KEY='tpt.site-research.bus-selection.v1';
  var LOCAL_LIBRARY_KEY='tpt.bus.knowledge.v1';
  var installed=false;

  function normal(value){
    return String(value==null?'':value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }

  function isAdmin(){
    return localStorage.getItem(ADMIN_KEY)==='true';
  }

  function exactStopKey(record){
    var naptan=normal(record&&record.naptanCode);
    if(naptan)return'naptan:'+naptan;
    var fallback=normal(record&&record.fallbackIdentity);
    return fallback?'fallback:'+fallback:'';
  }

  function parseCoordinateLink(row){
    var link=row.querySelector('a[href*="google.com/maps"]');
    if(!link)return null;
    try{
      var query=new URL(link.href,location.href).searchParams.get('query')||'';
      var values=query.split(',').map(Number);
      if(values.length===2&&values.every(Number.isFinite))return{latitude:values[0],longitude:values[1]};
    }catch(error){}
    return null;
  }

  function parseMetric(text){
    var value=String(text||'');
    var distance=value.match(/([0-9]+(?:\.[0-9]+)?)\s*m/i);
    var minutes=value.match(/([0-9]+(?:\.[0-9]+)?)\s*min/i);
    if(!distance&&!minutes)return null;
    return{
      distance:distance?Number(distance[1]):null,
      duration:minutes?Number(minutes[1])*60:null,
      status:/routed/i.test(value)?'routed':/estimated/i.test(value)?'estimated':'displayed',
      source:/routed/i.test(value)?'OSRM displayed result':'Bus Assessment displayed result'
    };
  }

  function parseStopRow(row){
    var identityText=(row.querySelector('small')||{}).textContent||'';
    var naptanMatch=identityText.match(/NaPTAN\/ATCO:\s*([^·\s]+)/i);
    var fallbackMatch=identityText.match(/Fallback:\s*([^·]+)/i);
    var naptanCode=naptanMatch?naptanMatch[1].trim():'';
    var fallbackIdentity=fallbackMatch?fallbackMatch[1].trim():'';
    if(!naptanCode&&!fallbackIdentity){
      var rowId=String(row.dataset.stopId||'');
      if(rowId.indexOf('naptan:')===0)naptanCode=rowId.slice(7);
      else if(rowId.indexOf('osm:')===0)fallbackIdentity=rowId.slice(4);
    }
    var directionPair=(row.children[2]&&row.children[2].textContent||'').split(/\s*·\s*Pair\s*/i);
    var pieces=identityText.split(/\s*·\s*/).map(function(x){return x.trim();}).filter(Boolean);
    return{
      naptanCode:naptanCode,
      fallbackIdentity:naptanCode?'':fallbackIdentity,
      stopName:(row.querySelector('.stop-focus')||{}).textContent||'Bus stop',
      locality:pieces.length>2?pieces[pieces.length-1]:'',
      direction:(directionPair[0]||'Direction not stated').trim(),
      pairedStopGroup:(directionPair[1]||'').trim(),
      coordinates:parseCoordinateLink(row),
      walking:parseMetric(row.children[4]&&row.children[4].textContent),
      cycling:parseMetric(row.children[5]&&row.children[5].textContent),
      source:pieces.length>1?pieces[1]:'Bus Assessment mapped stop data',
      retrievalDate:new Date().toISOString().slice(0,10)
    };
  }

  function selectedRows(){
    return Array.from(document.querySelectorAll('#stopRows tr[data-stop-id]')).filter(function(row){
      var box=row.querySelector('input[type="checkbox"]');
      return box&&box.checked;
    });
  }

  function duplicateIdentities(stops){
    var seen=new Map(),duplicates=[];
    stops.forEach(function(stop){
      var key=exactStopKey(stop);
      if(!key)return;
      if(seen.has(key))duplicates.push({key:key,first:seen.get(key),second:stop});
      else seen.set(key,stop);
    });
    return duplicates;
  }

  function loadLocalLibrary(){
    try{
      var value=JSON.parse(localStorage.getItem(LOCAL_LIBRARY_KEY)||'{}');
      return{
        stops:Array.isArray(value.stops)?value.stops:[],
        routes:Array.isArray(value.routes)?value.routes:[],
        stopRoutes:Array.isArray(value.stopRoutes)?value.stopRoutes:[]
      };
    }catch(error){
      return{stops:[],routes:[],stopRoutes:[]};
    }
  }

  async function loadEffectiveLibrary(){
    var local=loadLocalLibrary(),shared={stops:[],routes:[],stopRoutes:[]};
    try{
      if(root.TPTSharedLibrary&&typeof root.TPTSharedLibrary.loadAll==='function'){
        var masters=await root.TPTSharedLibrary.loadAll();
        shared={
          stops:masters.busStops&&Array.isArray(masters.busStops.records)?masters.busStops.records:[],
          routes:masters.busRoutes&&Array.isArray(masters.busRoutes.records)?masters.busRoutes.records:[],
          stopRoutes:masters.busStopRoutes&&Array.isArray(masters.busStopRoutes.records)?masters.busStopRoutes.records:[]
        };
      }
    }catch(error){}
    return{
      stops:shared.stops.concat(local.stops),
      routes:shared.routes.concat(local.routes),
      stopRoutes:shared.stopRoutes.concat(local.stopRoutes)
    };
  }

  function exactRecord(stop,records){
    var key=exactStopKey(stop);
    if(!key)return null;
    var matches=records.filter(function(record){return exactStopKey(record)===key;});
    return matches.length?matches[matches.length-1]:null;
  }

  function clone(value){
    return value==null?value:JSON.parse(JSON.stringify(value));
  }

  function routeForLink(link,routes){
    if(!root.TPTResearchWorkflow)return null;
    var explicit=link.canonicalRouteKey||link.compositeRouteKey||link.routeIdentifier||'';
    var candidates=routes.filter(function(route){return normal(route.routeNumber)===normal(link.routeNumber);});
    if(explicit&&typeof root.TPTResearchWorkflow.routeIdentityMatches==='function'){
      return candidates.find(function(route){return root.TPTResearchWorkflow.routeIdentityMatches(route,explicit);})||null;
    }
    return candidates.length===1?candidates[0]:null;
  }

  function enrichStop(discovered,library){
    var effective=exactRecord(discovered,library.stops)||{};
    var key=exactStopKey(discovered);
    var links=library.stopRoutes.filter(function(link){return exactStopKey(link)===key;});
    var routeReferences=[];
    links.forEach(function(link){
      var route=routeForLink(link,library.routes);
      if(route&&root.TPTResearchWorkflow&&typeof root.TPTResearchWorkflow.routeKey==='function'){
        var routeKey=root.TPTResearchWorkflow.routeKey(route);
        if(routeKey&&!routeReferences.includes(routeKey))routeReferences.push(routeKey);
      }
    });
    var result=Object.assign({},clone(effective)||{},discovered);
    result.naptanCode=discovered.naptanCode;
    result.fallbackIdentity=discovered.naptanCode?'':discovered.fallbackIdentity;
    result.stopName=discovered.stopName;
    result.locality=discovered.locality||effective.locality||'';
    result.direction=discovered.direction;
    result.pairedStopGroup=discovered.pairedStopGroup;
    result.coordinates=discovered.coordinates||effective.coordinates||null;
    result.walking=discovered.walking;
    result.cycling=discovered.cycling;
    result.routesServed=Array.from(new Set((Array.isArray(effective.routesServed)?effective.routesServed:[]).concat(links.map(function(link){return link.routeNumber;}).filter(Boolean))));
    result.relationshipReferences=links.map(function(link){
      var routeKey=root.TPTResearchWorkflow&&typeof root.TPTResearchWorkflow.linkRouteKey==='function'?root.TPTResearchWorkflow.linkRouteKey(link):(link.canonicalRouteKey||link.compositeRouteKey||link.routeIdentifier||'');
      return key+'|'+routeKey;
    }).filter(Boolean);
    result.reusableRouteReferences=routeReferences;
    result.source=effective.source||discovered.source;
    result.retrievalDate=effective.retrievalDate||discovered.retrievalDate;
    result.emergencyIdentityProtection=BUILD;
    return result;
  }

  function setStatus(message,isError){
    var status=document.getElementById('busImportProgress');
    if(status){
      status.dataset.emergencyStatus='true';
      status.textContent=(isError?'! ':'')+message;
    }
  }

  async function openBusOnlyResearch(){
    var rows=selectedRows();
    if(!rows.length){setStatus('Select at least one exact Bus Stop before opening Bus-only research.',true);return;}
    var discovered=rows.map(parseStopRow);
    var missingIdentity=discovered.filter(function(stop){return!exactStopKey(stop);});
    if(missingIdentity.length){setStatus('Research request not created because a selected stop has no exact NaPTAN or fallback identity.',true);return;}
    var duplicates=duplicateIdentities(discovered);
    if(duplicates.length){
      var names=duplicates.map(function(item){return item.first.stopName+' / '+item.second.stopName+' ('+item.key.replace(/^.*?:/,'')+')';}).join('; ');
      setStatus('Research request not created because two selected rows resolve to the same Bus Stop identity: '+names+'. Refresh the stop search or deselect the duplicate record.',true);
      return;
    }
    setStatus('Preparing exact Bus Stop identities and checking reusable company information…',false);
    var library=await loadEffectiveLibrary();
    var stops=discovered.map(function(stop){return enrichStop(stop,library);});
    var lat=Number((document.getElementById('siteLat')||{}).value),lon=Number((document.getElementById('siteLon')||{}).value);
    var site={
      name:String((document.getElementById('projectName')||{}).value||'').trim(),
      siteAddress:String((document.getElementById('siteAddress')||{}).value||'').trim(),
      site:{lat:Number.isFinite(lat)?lat:null,lon:Number.isFinite(lon)?lon:null,label:String((document.getElementById('siteAddress')||{}).value||'Map-selected site').trim()||'Map-selected site',confirmed:Number.isFinite(lat)&&Number.isFinite(lon)}
    };
    localStorage.setItem(SELECTION_KEY,JSON.stringify({stops:stops,site:site,updatedAt:new Date().toISOString(),originatingBuild:BUILD}));
    location.href='../site-research/';
  }

  function applyPlannerUI(){
    if(isAdmin())return;
    var button=document.getElementById('busPrimaryAction');
    var importButton=document.getElementById('busImportVisible');
    var plan=document.getElementById('busBatchPlan');
    var advanced=document.querySelector('.research-advanced');
    var count=selectedRows().length;
    if(button){
      button.textContent='Use Bus-only research';
      button.disabled=count===0;
      button.dataset.emergencyBusOnly='true';
    }
    if(importButton)importButton.hidden=true;
    if(advanced)advanced.hidden=true;
    if(plan){
      plan.hidden=true;
      var summary=document.getElementById('busEmergencyPlannerSummary');
      if(!summary){
        summary=document.createElement('div');
        summary.id='busEmergencyPlannerSummary';
        summary.className='research-summary';
        plan.insertAdjacentElement('afterend',summary);
      }
      summary.innerHTML='<p><strong>Bus-only Site Research</strong></p><p>'+count+' exact stop(s) selected. The Toolkit will preserve each selected NaPTAN/fallback identity, check reusable company records and create the fewest safe Bus research packs.</p><p>For both Railway and Bus research, select all locations first and use <strong>Combined Site Research</strong>.</p>';
    }
    var status=document.getElementById('busImportProgress');
    if(status&&!status.dataset.emergencyStatus)status.textContent=count?'Ready — use Bus-only research to continue with the selected exact stops.':'Select the required Bus stops first.';
  }

  function install(){
    if(installed||isAdmin())return;
    var button=document.getElementById('busPrimaryAction');
    var rows=document.getElementById('stopRows');
    var plan=document.getElementById('busBatchPlan');
    if(!button||!rows||!plan)return;
    installed=true;
    button.addEventListener('click',function(event){
      event.preventDefault();
      event.stopImmediatePropagation();
      openBusOnlyResearch().catch(function(error){setStatus('Bus-only research could not be opened: '+error.message,true);});
    },true);
    document.addEventListener('change',function(event){
      if(event.target&&event.target.matches('#stopRows input[type="checkbox"]')){
        var status=document.getElementById('busImportProgress');
        if(status)delete status.dataset.emergencyStatus;
        applyPlannerUI();
      }
    },true);
    new MutationObserver(function(){queueMicrotask(applyPlannerUI);}).observe(rows,{childList:true,subtree:true});
    new MutationObserver(function(){queueMicrotask(applyPlannerUI);}).observe(plan,{childList:true,subtree:true});
    applyPlannerUI();
  }

  root.TPTBusEmergencyHotfix={
    build:BUILD,
    normal:normal,
    exactStopKey:exactStopKey,
    parseStopRow:parseStopRow,
    duplicateIdentities:duplicateIdentities,
    enrichStop:enrichStop,
    openBusOnlyResearch:openBusOnlyResearch,
    applyPlannerUI:applyPlannerUI
  };

  var attempts=0;
  var timer=setInterval(function(){
    attempts++;
    if(root.BusCoreReady){clearInterval(timer);install();}
    else if(attempts>80)clearInterval(timer);
  },150);
})(globalThis);
