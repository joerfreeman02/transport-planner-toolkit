(function(root){
  'use strict';

  var BUILD='BUS-ROUTE-FAMILY-RESTORE-1.0.0-20260723';
  var workflow=root.TPTResearchWorkflow;

  if(!workflow||typeof workflow.siteResearchPlan!=='function'||workflow.__busRouteFamilyRestoreInstalled)return;

  var originalPlan=workflow.siteResearchPlan;

  function text(value){
    return value==null?'':String(value).trim();
  }

  function normal(value){
    return text(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
  }

  function routeTokens(route){
    var number=text(route&&route.routeNumber).toUpperCase();
    var matches=number.match(/[A-Z]*\d+[A-Z]*/g)||[];
    return Array.from(new Set(matches.map(normal).filter(Boolean)));
  }

  function authority(route){
    var explicit=text(route&&(
      route.transportAuthority||
      route.authority||
      route.regionalIdentifier||
      route.regionIdentifier||
      route.network
    ));
    if(explicit)return normal(explicit);

    var key=text(route&&route.canonicalRouteKey);
    var match=key.match(/^route:([^:]+):/i);
    return match?normal(match[1]):'';
  }

  function operator(route){
    return normal(route&&route.operator);
  }

  function endpointWords(value){
    return new Set(normal(value).split(' ').filter(function(word){
      return word.length>2&&!['town','centre','center','route','service','station'].includes(word);
    }));
  }

  function wordOverlap(a,b){
    var first=endpointWords(a),second=endpointWords(b);
    return Array.from(first).some(function(word){return second.has(word);});
  }

  function terminalsCompatible(a,b){
    var aEnds=[a&&a.routeOrigin,a&&a.routeDestination].filter(Boolean);
    var bEnds=[b&&b.routeOrigin,b&&b.routeDestination].filter(Boolean);
    if(!aEnds.length||!bEnds.length)return true;

    return aEnds.some(function(first){
      return bEnds.some(function(second){
        return normal(first)===normal(second)||wordOverlap(first,second);
      });
    });
  }

  function tokenOverlap(a,b){
    var first=new Set(routeTokens(a));
    return routeTokens(b).some(function(token){return first.has(token);});
  }

  function compatible(a,b){
    if(!tokenOverlap(a,b))return false;

    var aAuthority=authority(a),bAuthority=authority(b);
    if(aAuthority&&bAuthority&&aAuthority!==bAuthority)return false;

    var aOperator=operator(a),bOperator=operator(b);
    if(aOperator&&bOperator&&aOperator!==bOperator)return false;

    return terminalsCompatible(a,b);
  }

  function evidenceScore(route){
    var sources=Array.isArray(route&&route.sources)?route.sources:[];
    return sources.reduce(function(total,source){
      var url=text(source&&source.url);
      if(!url)return total;
      return total+(/\/(?:services?|routes?|timetables?)\/[^/?#]+/i.test(url)?8:2);
    },0);
  }

  function populatedScore(route){
    var fields=[
      'transportAuthority','operator','routeOrigin','routeDestination',
      'geographicContext','mondayFridayOperatingPeriod','saturdayOperatingPeriod',
      'sundayOperatingPeriod','servicePattern','retrievalDate','verificationStatus'
    ];
    var score=fields.reduce(function(total,key){
      return total+(text(route&&route[key])?1:0);
    },0);

    score+=Array.isArray(route&&route.principalLocationsServed)
      ?Math.min(route.principalLocationsServed.length,10)
      :0;

    return score;
  }

  function preferenceScore(route){
    var tokenCount=routeTokens(route).length;
    var groupedBonus=tokenCount>1?1000+tokenCount*100:0;
    var verifiedBonus=/^verified/i.test(text(route&&route.verificationStatus))?40:0;
    return groupedBonus+verifiedBonus+evidenceScore(route)*10+populatedScore(route);
  }

  function choosePreferred(group){
    return group.slice().sort(function(a,b){
      var scoreDifference=preferenceScore(b)-preferenceScore(a);
      if(scoreDifference)return scoreDifference;

      var newer=(Date.parse(b&&b.retrievalDate||b&&b.updatedAt||'')||0)-
        (Date.parse(a&&a.retrievalDate||a&&a.updatedAt||'')||0);
      if(newer)return newer;

      return text(workflow.routeKey(a)).localeCompare(text(workflow.routeKey(b)));
    })[0];
  }

  function buildGroups(routes){
    var remaining=(routes||[]).slice();
    var groups=[];

    while(remaining.length){
      var group=[remaining.shift()];
      var changed=true;

      while(changed){
        changed=false;
        for(var index=remaining.length-1;index>=0;index--){
          if(group.some(function(item){return compatible(item,remaining[index]);})){
            group.push(remaining.splice(index,1)[0]);
            changed=true;
          }
        }
      }
      groups.push(group);
    }

    return groups;
  }

  function clone(value){
    return value==null?value:JSON.parse(JSON.stringify(value));
  }

  function missingRelationshipCount(link){
    return typeof workflow.missingRelationship==='function'
      ?workflow.missingRelationship(link).length
      :0;
  }

  function prepareInput(input){
    input=input||{};
    var routes=(input.routes||[]).slice();
    if(routes.length<2)return input;

    var groups=buildGroups(routes);
    var preferredByOriginal=new Map();
    var preferredRoutes=[];

    groups.forEach(function(group){
      var preferred=choosePreferred(group);
      preferredRoutes.push(preferred);

      group.forEach(function(route){
        preferredByOriginal.set(normal(workflow.routeKey(route)),preferred);
        (route.legacyRouteKeys||[]).forEach(function(alias){
          preferredByOriginal.set(normal(alias),preferred);
        });
      });
    });

    function preferredForLink(link){
      var key=normal(workflow.linkRouteKey(link));
      if(preferredByOriginal.has(key))return preferredByOriginal.get(key);

      var matched=routes.find(function(route){
        return workflow.routeIdentityMatches(route,workflow.linkRouteKey(link));
      });
      return matched
        ?preferredByOriginal.get(normal(workflow.routeKey(matched)))||matched
        :null;
    }

    var relationshipMap=new Map();

    (input.relationships||[]).forEach(function(original){
      var link=clone(original);
      var preferred=preferredForLink(link);

      if(preferred){
        var preferredKey=workflow.routeKey(preferred);
        link.canonicalRouteKey=preferredKey;
        link.compositeRouteKey=preferredKey;
        link.routeIdentifier=preferredKey;
        link.routeNumber=preferred.routeNumber||link.routeNumber;
        link.operator=preferred.operator||link.operator;
        link.routeOrigin=preferred.routeOrigin||link.routeOrigin;
        link.routeDestination=preferred.routeDestination||link.routeDestination;
        link.geographicContext=preferred.geographicContext||link.geographicContext;
      }

      var key=workflow.stopKey(link)+'|'+normal(workflow.linkRouteKey(link));
      var existing=relationshipMap.get(key);

      if(!existing||missingRelationshipCount(link)<missingRelationshipCount(existing)){
        relationshipMap.set(key,link);
      }
    });

    return Object.assign({},input,{
      routes:preferredRoutes,
      relationships:Array.from(relationshipMap.values()),
      busRouteFamilyRestore:{
        build:BUILD,
        inputRouteCount:routes.length,
        consolidatedRouteCount:preferredRoutes.length,
        inputRelationshipCount:(input.relationships||[]).length,
        consolidatedRelationshipCount:relationshipMap.size
      }
    });
  }

  workflow.siteResearchPlan=function(input){
    return originalPlan.call(workflow,prepareInput(input));
  };

  workflow.__busRouteFamilyRestoreInstalled=true;
  workflow.busRouteFamilyRestoreBuild=BUILD;
  workflow.prepareBusRouteFamilyInput=prepareInput;
})(globalThis);
