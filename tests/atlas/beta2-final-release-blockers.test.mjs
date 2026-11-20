import assert from 'node:assert/strict';
import { normalizeBusText } from '../../src/atlas/domain/bus-text.mjs';
import { plannerAnnotationTaxonomy } from '../../src/atlas/domain/bus-planner-summary.mjs';

assert.equal(normalizeBusText('Merck Sharpe &amp; Dohme'), 'Merck Sharpe & Dohme');
assert.equal(normalizeBusText('Z &amp; S Buses'), 'Z & S Buses');
assert.equal(normalizeBusText('&amp;lt;script&amp;gt;'), '&lt;script&gt;', 'entity decoding is single-pass and does not expose recursively encoded markup');

const flexibleCallConnect = plannerAnnotationTaxonomy({
  routeNumber: 'R1', operator: 'TransportConnect', direction: 'Stamford CallConnect',
  origin: 'Queensgate Bus Station', destination: 'Demand Responsive Area',
  rawServiceSummaries: [{ operator: 'TransportConnect', direction: 'Stamford CallConnect', origin: 'Queensgate Bus Station', destination: 'Demand Responsive Area', source: { provider: 'BODS' } }]
});
assert.match(flexibleCallConnect.serviceQualification, /published times are notional/i);
assert.match(flexibleCallConnect.serviceQualification, /booked in advance/i);
const conventional = plannerAnnotationTaxonomy({
  routeNumber: 'R2', operator: 'TransportConnect', direction: 'Market Town', origin: 'A', destination: 'B',
  rawServiceSummaries: [{ operator: 'TransportConnect', direction: 'Market Town', origin: 'A', destination: 'B', source: { provider: 'BODS' } }]
});
assert.equal(conventional.serviceQualification, null, 'ordinary services are not classified as flexible without both CallConnect identity and demand-responsive source semantics');

const variants = plannerAnnotationTaxonomy({
  routeNumber: '907', routeNumbers: ['907', '907A'], destination: 'Main Destination',
  publicRouteFamilyDecision: { state: 'proven-family', principalRouteNumber: '907' },
  routeFamilyMembers: [
    { routeNumber: '907', destination: 'Main Destination', principalLocations: ['Main Destination'] },
    { routeNumber: '907A', destination: 'Brookfield Centre', materialDestinationEvidence: ['Brookfield Centre'],
      serviceVariants: [
        { origin: 'Lister Hospital', destination: 'Brookfield Centre', departureCountsByDay: { monday: 2, tuesday: 2, wednesday: 2, thursday: 2, friday: 2, saturday: 1, sunday: 7 } },
        { origin: 'Bus Station', destination: 'Brookfield Centre', departureCountsByDay: { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 2 } }
      ], departureCountsByDay: { monday: 2, tuesday: 2, wednesday: 2, thursday: 2, friday: 2, saturday: 1, sunday: 9 } }
  ]
});
assert.match(variants.additionalServices ?? '', /from Lister Hospital to Brookfield Centre[^)]*Sun: 7 journeys\/day/i);
assert.match(variants.additionalServices ?? '', /from Bus Station to Brookfield Centre[^)]*Sun: 2 journeys\/day/i);

console.log('PASS Beta.2 final release-blocker text normalization, DRT source semantics and route-family population checks.');
