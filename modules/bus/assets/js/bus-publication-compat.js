(function (root) {
  'use strict';

  var BUILD = 'BUS-PUBLISH-COMPAT-1.0.0-20260724';
  var LIBRARY_KEY = 'tpt.bus.knowledge.v1';

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function normal(value) {
    return text(value)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function useful(value) {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;

    if (typeof value === 'object') {
      return Object.keys(value).some(function (key) {
        return useful(value[key]);
      });
    }

    return text(value) !== '' && !/research required/i.test(text(value));
  }

  function verified(record) {
    return normal(record && record.verificationStatus).indexOf('verified') === 0;
  }

  function stopKey(record) {
    var naptan = normal(record && record.naptanCode);

    if (naptan) {
      return 'naptan:' + naptan;
    }

    var fallback = normal(record && record.fallbackIdentity);
    return fallback ? 'fallback:' + fallback : '';
  }

  function routeNumberKey(record) {
    return normal(record && record.routeNumber);
  }

  function recordDate(record) {
    return Date.parse(
      record && (record.retrievalDate || record.updatedAt) || ''
    ) || 0;
  }

  function completeness(record, fields) {
    return fields.reduce(function (total, field) {
      return total + (useful(record && record[field]) ? 1 : 0);
    }, 0);
  }

  function chooseBest(records, fields) {
    return (records || [])
      .filter(Boolean)
      .slice()
      .sort(function (a, b) {
        var verifiedDifference =
          Number(verified(b)) - Number(verified(a));

        if (verifiedDifference) {
          return verifiedDifference;
        }

        var dateDifference = recordDate(b) - recordDate(a);

        if (dateDifference) {
          return dateDifference;
        }

        return completeness(b, fields) - completeness(a, fields);
      })[0] || null;
  }

  function sourceScore(source) {
    var score = 0;

    try {
      var url = new URL(text(source && source.url));
      var pathParts = url.pathname.split('/').filter(Boolean);

      if (/^https?:$/.test(url.protocol)) score += 10;
      if (pathParts.length > 0) score += 10;
      if (pathParts.length > 1) score += 10;
    } catch (error) {
      return 0;
    }

    if (text(source && source.title)) score += 5;
    if (text(source && source.publisher)) score += 5;

    if (/^\d{4}-\d{2}-\d{2}$/.test(
      text(source && source.retrievalDate)
    )) {
      score += 5;
    }

    return score;
  }

  function mergeSources() {
    var map = new Map();

    Array.prototype.slice
      .call(arguments)
      .flat()
      .filter(Boolean)
      .forEach(function (source) {
        var key =
          normal(source && source.url) ||
          normal(source && source.title) + '|' +
          normal(source && source.publisher);

        if (key && !map.has(key)) {
          map.set(key, clone(source));
        }
      });

    return Array.from(map.values()).sort(function (a, b) {
      return sourceScore(b) - sourceScore(a);
    });
  }

  function newestDate(records) {
    var dates = (records || [])
      .map(function (record) {
        return text(record && record.retrievalDate);
      })
      .filter(function (value) {
        return /^\d{4}-\d{2}-\d{2}$/.test(value);
      })
      .sort();

    return dates.length ? dates[dates.length - 1] : '';
  }

  function uniqueValues(records, field) {
    var values = [];

    (records || []).forEach(function (record) {
      var value = record && record[field];

      if (!useful(value)) {
        return;
      }

      if (!values.some(function (existing) {
        return normal(existing) === normal(value);
      })) {
        values.push(text(value));
      }
    });

    return values.join(' / ');
  }

  function mergeQualifications(records) {
    var result = {};

    (records || []).forEach(function (record) {
      var qualifications = record && record.serviceQualifications;

      if (
        !qualifications ||
        typeof qualifications !== 'object' ||
        Array.isArray(qualifications)
      ) {
        return;
      }

      Object.keys(qualifications).forEach(function (key) {
        var value = qualifications[key];

        if (!useful(value)) {
          return;
        }

        if (!result[key]) {
          result[key] = value;
        } else if (normal(result[key]) !== normal(value)) {
          result[key] =
            text(result[key]) + ' / ' + text(value);
        }
      });
    });

    return result;
  }

  function selectedStopKeys() {
    var keys = new Set();

    document
      .querySelectorAll('#stopRows tr[data-stop-id]')
      .forEach(function (row) {
        var checkbox = row.querySelector('input[type="checkbox"]');

        if (!checkbox || !checkbox.checked) {
          return;
        }

        var identity = text(
          (row.querySelector('small') || {}).textContent
        );

        var naptan =
          identity.match(/NaPTAN\/ATCO:\s*([^·\s]+)/i);

        var fallback =
          identity.match(/Fallback:\s*([^·]+)/i);

        if (naptan) {
          keys.add('naptan:' + normal(naptan[1]));
        } else if (fallback) {
          keys.add('fallback:' + normal(fallback[1]));
        }
      });

    return keys;
  }

  function includedRouteNumbers() {
    var routes = new Set();

    document.querySelectorAll('#routeRows tr').forEach(function (row) {
      var checkbox = row.querySelector('input[type="checkbox"]');

      if (
        !checkbox ||
        !checkbox.checked ||
        !row.cells ||
        !row.cells[1]
      ) {
        return;
      }

      var match = text(row.cells[1].textContent)
        .match(/^Route\s+([^\n\r]+)/i);

      if (match) {
        routes.add(normal(match[1]));
      }
    });

    return routes;
  }

  function loadLibrary() {
    var value = JSON.parse(
      localStorage.getItem(LIBRARY_KEY) || '{}'
    );

    return {
      stops: Array.isArray(value.stops) ? value.stops : [],
      routes: Array.isArray(value.routes) ? value.routes : [],
      stopRoutes: Array.isArray(value.stopRoutes)
        ? value.stopRoutes
        : []
    };
  }

  function preparePublication() {
    var library = loadLibrary();
    var selectedStops = selectedStopKeys();
    var includedRoutes = includedRouteNumbers();

    if (!selectedStops.size) {
      throw new Error(
        'No selected Bus Stop identities were found.'
      );
    }

    if (!includedRoutes.size) {
      throw new Error(
        'No checked Bus Route rows were found.'
      );
    }

    var relationshipMap = new Map();

    library.stopRoutes
      .filter(function (relationship) {
        return (
          selectedStops.has(stopKey(relationship)) &&
          includedRoutes.has(routeNumberKey(relationship)) &&
          verified(relationship)
        );
      })
      .forEach(function (relationship) {
        var key = [
          stopKey(relationship),
          routeNumberKey(relationship),
          normal(relationship.directionFromStop),
          normal(relationship.stopSpecificDestination)
        ].join('|');

        relationshipMap.set(
          key,
          chooseBest(
            [relationshipMap.get(key), relationship],
            [
              'directionFromStop',
              'stopSpecificDestination',
              'mondayFridayOperatingPeriod',
              'saturdayOperatingPeriod',
              'sundayOperatingPeriod',
              'typicalWeekdayBusesPerHour',
              'saturdayBusesPerHour',
              'sundayBusesPerHour',
              'servicePattern',
              'serviceQualifications',
              'journeyOpportunities',
              'transportStatementParagraph',
              'sources',
              'retrievalDate'
            ]
          )
        );
      });

    var relationships =
      Array.from(relationshipMap.values());

    if (!relationships.length) {
      throw new Error(
        'No verified local Stop–Route records match the selected stops and checked routes.'
      );
    }

    var routeMap = new Map();

    Array.from(
      new Set(relationships.map(routeNumberKey))
    ).forEach(function (routeNumber) {
      var route = chooseBest(
        library.routes.filter(function (candidate) {
          return (
            routeNumberKey(candidate) === routeNumber &&
            verified(candidate)
          );
        }),
        [
          'operator',
          'routeOrigin',
          'routeDestination',
          'geographicContext',
          'principalLocationsServed',
          'sources',
          'retrievalDate'
        ]
      );

      if (!route) {
        throw new Error(
          'No verified local Route record is available for ' +
          routeNumber + '.'
        );
      }

      route = clone(route);

      var routeRelationships =
        relationships.filter(function (relationship) {
          return routeNumberKey(relationship) === routeNumber;
        });

      if (!useful(route.principalLocationsServed)) {
        route.principalLocationsServed = [
          route.routeOrigin,
          route.routeDestination
        ].filter(useful);
      }

      if (!useful(route.geographicContext)) {
        route.geographicContext =
          'Service corridor between ' +
          text(route.routeOrigin) +
          ' and ' +
          text(route.routeDestination) +
          (
            route.principalLocationsServed.length
              ? ' via ' +
                route.principalLocationsServed.join(', ')
              : ''
          ) +
          '.';
      }

      route.mondayFridayOperatingPeriod =
        uniqueValues(
          routeRelationships,
          'mondayFridayOperatingPeriod'
        ) || route.mondayFridayOperatingPeriod;

      route.saturdayOperatingPeriod =
        uniqueValues(
          routeRelationships,
          'saturdayOperatingPeriod'
        ) || route.saturdayOperatingPeriod;

      route.sundayOperatingPeriod =
        uniqueValues(
          routeRelationships,
          'sundayOperatingPeriod'
        ) || route.sundayOperatingPeriod;

      route.servicePattern =
        uniqueValues(
          routeRelationships,
          'servicePattern'
        ) || route.servicePattern;

      route.serviceQualifications =
        mergeQualifications(routeRelationships);

      if (!useful(route.serviceQualifications)) {
        route.serviceQualifications = {
          general: route.servicePattern
        };
      }

      route.sources = mergeSources(
        route.sources || [],
        routeRelationships.flatMap(function (relationship) {
          return relationship.sources || [];
        })
      );

      route.retrievalDate =
        newestDate([route].concat(routeRelationships)) ||
        route.retrievalDate;

      route.verificationStatus = 'verified';
      route.publicationCompatibilityBuild = BUILD;

      routeMap.set(routeNumber, route);
    });

    relationships = relationships.map(function (input) {
      var relationship = clone(input);
      var route =
        routeMap.get(routeNumberKey(relationship));

      var routeIdentity = [
        route.routeNumber,
        route.operator,
        route.routeOrigin,
        route.routeDestination,
        route.geographicContext
      ].map(normal).join('|');

      relationship.operator = route.operator;
      relationship.routeOrigin = route.routeOrigin;
      relationship.routeDestination = route.routeDestination;
      relationship.geographicContext =
        route.geographicContext;

      relationship.canonicalRouteKey = routeIdentity;
      relationship.compositeRouteKey = routeIdentity;
      relationship.routeIdentifier = routeIdentity;

      if (!useful(relationship.serviceQualifications)) {
        relationship.serviceQualifications =
          clone(route.serviceQualifications);
      }

      relationship.sources = mergeSources(
        relationship.sources || [],
        route.sources || []
      );

      relationship.retrievalDate =
        newestDate([relationship, route]) ||
        route.retrievalDate;

      relationship.verificationStatus = 'verified';
      relationship.publicationCompatibilityBuild = BUILD;

      return relationship;
    });

    var stopMap = new Map();

    library.stops
      .filter(function (stop) {
        return (
          selectedStops.has(stopKey(stop)) &&
          verified(stop)
        );
      })
      .forEach(function (input) {
        var stop = clone(input);

        var routesServed = relationships
          .filter(function (relationship) {
            return stopKey(relationship) === stopKey(stop);
          })
          .map(function (relationship) {
            return relationship.routeNumber;
          });

        stop.routesServed = Array.from(
          new Set(
            (
              Array.isArray(stop.routesServed)
                ? stop.routesServed
                : []
            ).concat(routesServed)
          )
        );

        if (
          !useful(stop.indicator) &&
          useful(stop.direction)
        ) {
          stop.indicator = stop.direction;
        }

        stop.publicationCompatibilityBuild = BUILD;

        var existing = stopMap.get(stopKey(stop));

        stopMap.set(
          stopKey(stop),
          chooseBest(
            [existing, stop],
            [
              'stopName',
              'locality',
              'direction',
              'indicator',
              'routesServed',
              'sources',
              'retrievalDate'
            ]
          )
        );
      });

    return {
      stops: Array.from(stopMap.values()),
      routes: Array.from(routeMap.values()),
      stopRoutes: relationships,
      originatingBuild:
        'BUS-PROD-150-20260717+' + BUILD
    };
  }

  function setStatus(message) {
    var element =
      document.getElementById('researchStatus');

    if (element) {
      element.textContent = message;
    }
  }

  async function publishSelected() {
    if (
      !root.TPTSharedLibrary ||
      typeof root.TPTSharedLibrary.publishBus !==
        'function'
    ) {
      throw new Error(
        'The current Shared Library publisher is unavailable.'
      );
    }

    setStatus(
      'Preparing only the selected Bus records for publication…'
    );

    var payload = preparePublication();

    var approved = confirm(
      'Publish only these selected records?\n\n' +
      payload.stops.length +
      ' Bus Stop record(s)\n' +
      payload.routes.length +
      ' Bus Route record(s)\n' +
      payload.stopRoutes.length +
      ' exact Stop–Route Relationship record(s)\n\n' +
      'Unticked rows and unrelated old local records will not be proposed.'
    );

    if (!approved) {
      setStatus(
        'Shared publication cancelled before any GitHub change.'
      );
      return;
    }

    var result =
      await root.TPTSharedLibrary.publishBus(payload);

    setStatus(
      'Shared publication complete: ' +
      payload.routes.length +
      ' Route(s) and ' +
      payload.stopRoutes.length +
      ' exact Stop–Route Relationship(s) processed.' +
      (
        result && result.published != null
          ? ' ' +
            result.published +
            ' Shared Library file(s) updated.'
          : ''
      )
    );

    var refresh =
      document.getElementById('refreshShared');

    if (refresh) {
      refresh.click();
    }
  }

  document.addEventListener(
    'click',
    function (event) {
      var button =
        event.target && event.target.closest
          ? event.target.closest('#publishShared')
          : null;

      if (!button || button.disabled) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      publishSelected().catch(function (error) {
        setStatus(
          'Shared publication not completed: ' +
          error.message
        );
      });
    },
    true
  );

  root.TPTBusPublicationCompat = {
    build: BUILD,
    preparePublication: preparePublication,
    publishSelected: publishSelected
  };
})(window);
