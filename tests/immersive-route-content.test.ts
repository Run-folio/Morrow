import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { routeFamilyByKey } from '../lib/easyt/route-catalog.ts';
import { publicRouteDetailFor, isPublishedPublicRouteKey } from '../lib/easyt/public-route.ts';
import { routePlannerPayload } from '../lib/easyt/public-route-handoff.ts';
import { checkPublicRouteRelease } from '../lib/easyt/public-route-release.ts';
import { immersiveHomepageRoutes, immersiveRouteKeys } from '../lib/easyt/immersive-homepage-routes.ts';
import { matchCatalogPlace } from '../lib/easyt/place-catalog.ts';
import { immersiveHomepageEnabled } from '../lib/easyt/immersive-homepage-config.ts';

const sequences = {
  'japan-slow': ['Tokyo', 'Kanazawa', 'Takayama', 'Kyoto', 'Osaka'],
  'balkans-overland': ['Dubrovnik', 'Kotor', 'Shkodër', 'Tirana'],
  'vietnam-cambodia': ['Hanoi', 'Hoi An', 'Ho Chi Minh City', 'Siem Reap'],
  'iceland-ring-road': ['Reykjavík', 'Vík', 'Höfn', 'Reykjahlíð', 'Akureyri'],
};
for (const key of immersiveRouteKeys) {
  test(`${key}: approved canonical route preserves sequence, countries, coordinates and minimum nights`, () => {
    const route = routeFamilyByKey[key]!;
    const before = JSON.stringify(route);
    const detail = publicRouteDetailFor(key);
    assert.ok(detail);
    const payload = routePlannerPayload(detail.planDraft, new Date(2026, 8, 7, 12));
    assert.deepEqual(payload.destinations.map(stop => stop.name), sequences[key]);
    assert.equal(new Set(payload.destinations.map(stop => stop.id)).size, route.stops.length);
    assert.equal(payload.origin, route.stops[0]!.name);
    assert.deepEqual(payload.destinations.map(stop => stop.country), route.stops.map(stop => stop.country));
    assert.deepEqual(payload.destinations.map(stop => stop.coordinates), route.stops.map(stop => stop.coordinates));
    assert.equal(payload.structuredBrief.placeIssues?.some(issue => issue.blocksRoute), false);
    const endConstraint = payload.structuredBrief.hardConstraints.find(item => item.type === 'end-at');
    assert.ok(endConstraint?.type === 'end-at');
    assert.equal(endConstraint.value, route.stops.at(-1)!.name);
    assert.deepEqual(payload.nightAllocations, detail.planDraft.nightAllocations);
    assert.equal(Object.values(payload.nightAllocations).reduce((a,b) => a+b, 0), detail.durationDays - 1);
    payload.destinations.forEach((stop,index) => assert.ok(payload.nightAllocations[stop.id]! >= route.stops[index]!.minimumNights));
    // Allocator output is NOT evidence of editorially reviewed recommendations.
    assert.equal(checkPublicRouteRelease(route).status, 'ready-with-verification');
    assert.deepEqual(checkPublicRouteRelease(route).blockers, []);
    assert.equal(route.release?.editorialReviewer, 'Shaun Whiting');
    assert.equal(payload.datesExplicit, false);
    assert.ok(route.stops.every(stop => stop.recommendedNights && stop.nightGuidanceRationale));
    assert.ok(payload.destinations.every(stop => stop.canonicalPlaceId));
    assert.deepEqual(payload.structuredBrief.placeIssues, []);
    assert.ok(payload.curatedRoute);
    assert.deepEqual(payload.curatedRoute.stops.map(stop => stop.recommendedNights), route.stops.map(stop => stop.recommendedNights));
    assert.ok(route.suggestedDays.min >= 1 + route.stops.reduce((sum,stop) => sum + stop.minimumNights,0));
    assert.ok(route.sourceLinks.every(source => source.owner && source.checkedAt && source.limitations));

    assert.equal(isPublishedPublicRouteKey(key), true);
    assert.equal(JSON.stringify(route), before);
  });
}
test('five-stop Japan identities resolve independently; the approved canonical route uses all five', () => {
  const places = ['Tokyo', 'Kanazawa', 'Takayama', 'Kyoto', 'Osaka'].map(name => matchCatalogPlace(name));
  assert.deepEqual(places.map(place => place?.canonicalPlaceId), ['tokyo','kanazawa','takayama','kyoto','osaka']);
  assert.ok(places.every(place => place?.parentCountries[0] === 'Japan'));
  assert.deepEqual(publicRouteDetailFor('japan-slow')?.stops.map(stop => stop.name), sequences['japan-slow']);
});
test('homepage stays default-off while admitting all four approved families', () => {
  assert.equal(immersiveHomepageEnabled(undefined), false);
  assert.equal(immersiveHomepageEnabled('false'), false);
  assert.deepEqual(immersiveHomepageRoutes().map(route => route.key), [...immersiveRouteKeys]);
});
test('destination photographs carry attribution and existing local variants; Osaka and Höfn are production-mapped', () => {
  const inventory = JSON.parse(readFileSync(new URL('../public/journey/immersive/destination-inventory.json', import.meta.url), 'utf8'));
  assert.equal(inventory.length, 18);
  for (const image of inventory) {
    assert.ok(image.author && image.license && /^https?:\/\//.test(image.licenseUrl) && image.sourceUrl.startsWith('https://') && image.changes);
    for (const variant of image.variants) assert.ok(existsSync(new URL(`../public${variant.src}`, import.meta.url)), variant.src);
  }
  assert.equal(inventory.some((image: { place: string }) => image.place === 'Osaka'), true);
});

test('Paris → Brussels → Amsterdam retains rail through owner normalization and JSON reload', async () => {
  const { tripFromBuilder } = await import('../lib/easyt/trip.ts');
  const { canonicalTripForOwner } = await import('../lib/easyt/trip-promotion.ts');
  const stops = [
    { id: 'paris', canonicalPlaceId: 'paris', name: 'Paris', country: 'France', coordinates: [2.3522,48.8566] as [number,number] },
    { id: 'brussels', canonicalPlaceId: 'brussels', name: 'Brussels', country: 'Belgium', coordinates: [4.3517,50.8503] as [number,number] },
    { id: 'amsterdam', canonicalPlaceId: 'amsterdam', name: 'Amsterdam', country: 'Netherlands', coordinates: [4.9041,52.3676] as [number,number] },
  ];
  const trip = tripFromBuilder({ id: 'rail-release-control', origin: 'Paris', originCanonicalPlaceId: 'paris', originCountry: 'France', originCoordinates: stops[0]!.coordinates,
    stops, startDate: '2026-10-01', endDate: '2026-10-07', nightAllocations: {paris:2,brussels:2,amsterdam:2}, picks:{},mustDo:'Paris, Brussels, Amsterdam',pace:'slow',hotels:'few',budget:'mid',draft:[] });
  for (const candidate of [trip, JSON.parse(JSON.stringify(canonicalTripForOwner('test-owner',trip)))]) {
    assert.deepEqual(candidate.legs.map((leg: {mode:string}) => leg.mode), ['train','train']);
    assert.deepEqual(candidate.stops.map((stop: {name:string}) => stop.name), ['Paris','Brussels','Amsterdam']);
    assert.deepEqual(candidate.stops.map((stop: {nights:number}) => stop.nights), [2,2,2]);
  }
});


test('all four pass release, catalogue, sitemap, homepage and demo boundaries with recorded independent sign-off', async () => {
  const { publicRouteSitemapKeys } = await import('../lib/easyt/public-route.ts');
  const { initialImmersiveRouteIndex, nextHomepageRoute } = await import('../lib/easyt/immersive-homepage-routes.ts');
  const { createHomepageDemo, homepageDemoReducer } = await import('../lib/easyt/homepage-demo.ts');
  {
    const routes = immersiveHomepageRoutes();
    assert.deepEqual(routes.map(route => route.key), [...immersiveRouteKeys]);
    const choices = new Set(Array.from({length:100}, (_, i) => initialImmersiveRouteIndex(routes, () => i/100)));
    assert.deepEqual([...choices].sort(), [0,1,2,3]);
    assert.equal(nextHomepageRoute(3, 1, routes.length), 0);
    assert.equal(nextHomepageRoute(0, -1, routes.length), 3);
    let demo = createHomepageDemo(routes);
    for (const route of routes) {
      assert.equal(checkPublicRouteRelease(routeFamilyByKey[route.key]).status, 'ready-with-verification');
      assert.ok(isPublishedPublicRouteKey(route.key));
      assert.ok(publicRouteSitemapKeys().includes(route.key));
      assert.ok(route.photos.every(Boolean));
      assert.ok(existsSync(new URL(`../public${route.heroImage}`, import.meta.url)));
      for (const view of ['map','builder','itinerary'] as const) {
        demo = homepageDemoReducer(demo, {type:'view',view});
        assert.equal(demo.view,view);
        assert.deepEqual(demo.nights[route.key], route.stops.map(stop => stop.nights));
      }
    }
  }
  assert.equal(immersiveHomepageRoutes().length, 4);
});


test('a confidence change alone cannot publish an unsigned route', () => {
  const route = routeFamilyByKey['japan-slow'];
  const before = route.confidence;
  const reviewer = route.release!.editorialReviewer;
  try {
    route.confidence = 'medium';
    delete route.release!.editorialReviewer;
    assert.equal(isPublishedPublicRouteKey(route.key), false);
    assert.equal(immersiveHomepageRoutes().some(candidate => candidate.key === route.key), false);
  } finally { route.confidence = before; route.release!.editorialReviewer = reviewer; }
});
