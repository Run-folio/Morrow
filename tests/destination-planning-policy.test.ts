import assert from 'node:assert/strict';
import test from 'node:test';
import { countries, countryCodeFor } from '../lib/easyt/country-registry.ts';
import { PLACE_CATALOG, findCatalogPlaceById } from '../lib/easyt/place-catalog.ts';
import { REFERENCE_SNAPSHOT_ID, referenceCountrySeeds } from '../lib/easyt/place-reference.ts';
import { referencePlaceById } from '../lib/easyt/place-reference.server.ts';
import { COUNTRY_DESTINATION_POLICIES, CONTINENT_DESTINATION_POLICIES, destinationPlanningDecision, freshDestinationTarget, destinationPlanningGroupKey } from '../lib/easyt/destination-planning-policy.ts';

const fresh = { intent: 'fresh-stop' as const };
const area = (id: string) => findCatalogPlaceById(id)!;
const target = (code: string, id: string) => {
  const entry = referenceCountrySeeds(code).find(row => row.canonicalPlaceId === id)!;
  return { ...entry, country: entry.parentCountries[0], providerId: entry.referenceProviderId, referenceSnapshotId: REFERENCE_SNAPSHOT_ID };
};
const sg = target('SG', 'reference:geonames:1880252');
const hk = target('HK', 'reference:geonames:1819729');

test('registry coverage makes every supported country a deliberate base decision', () => {
  assert.deepEqual(Object.keys(COUNTRY_DESTINATION_POLICIES).sort(), countries.map(row => row.code).sort());
  for (const country of countries) {
    const entry = PLACE_CATALOG.find(row => row.placeType === 'country' && countryCodeFor(row.canonicalName) === country.code)!;
    assert.ok(entry, country.code);
    assert.equal(destinationPlanningDecision(entry).behavior, 'choose-base', country.code);
    assert.equal(destinationPlanningDecision(entry, { intent: 'explicit-area' }).behavior, 'choose-base', country.code);
    if (!['SG', 'HK', 'MC'].includes(country.code)) assert.equal(destinationPlanningDecision(entry, fresh).behavior, 'choose-base', country.code);
  }
});

test('canonical continents and broad islands require a base', () => {
  const continents = PLACE_CATALOG.filter(row => row.placeType === 'continent');
  assert.deepEqual(Object.keys(CONTINENT_DESTINATION_POLICIES).sort(), continents.map(row => row.canonicalPlaceId).sort());
  for (const row of [...continents, ...PLACE_CATALOG.filter(row => (row.placeType === 'island' || row.placeType === 'archipelago') && row.routability !== 'direct_destination')]) {
    assert.equal(destinationPlanningDecision({ ...row, routability: 'direct_destination' }, fresh).behavior, 'choose-base', row.canonicalPlaceId);
  }
});

test('reviewed fresh-stop mappings select whole maintained targets without mutating sources', () => {
  for (const [source, chosen] of [[area('singapore'), sg], [area('jurisdiction-hk'), hk], [area('hong-kong'), hk]] as const) {
    const before = JSON.stringify(source);
    const decision = destinationPlanningDecision(source, fresh);
    assert.equal(decision.behavior, 'direct-stop');
    assert.equal(decision.targetCanonicalPlaceId, chosen.canonicalPlaceId);
    assert.strictEqual(freshDestinationTarget(source, [chosen], fresh), chosen);
    assert.equal(JSON.stringify(source), before);
    assert.equal(freshDestinationTarget(source, [chosen]), null);
  }
});

test('existing country and legacy selections never automatically acquire maintained city identities', () => {
  for (const source of [area('singapore'), area('jurisdiction-hk'), area('hong-kong')]) {
    assert.equal(destinationPlanningDecision(source).targetCanonicalPlaceId, undefined);
    assert.equal(freshDestinationTarget(source, [sg, hk], { intent: 'existing-selection' }), null);
    assert.equal(destinationPlanningGroupKey(source, [sg, hk]), source.canonicalPlaceId);
  }
});

test('San Marino country remains broad despite a same-name maintained capital', () => {
  for (const code of ['SM']) {
    const country = PLACE_CATALOG.find(row => row.placeType === 'country' && countryCodeFor(row.canonicalName) === code)!;
    assert.equal(destinationPlanningDecision(country, fresh).behavior, 'choose-base');
    assert.equal(freshDestinationTarget(country, referenceCountrySeeds(code), fresh), null);
    assert.equal(destinationPlanningDecision(referenceCountrySeeds(code)[0]).behavior, 'direct-stop');
  }
});

test('target retirement, stale proof, wrong country, wrong type and changed point fail closed', () => {
  const invalid = [
    { ...hk, status: 'retired' }, { ...hk, status: 'quarantined' },
    { ...hk, referenceSnapshotId: 'old-snapshot' }, { ...hk, providerId: 'unverified' },
    { ...hk, country: 'China' }, { ...hk, parentCountries: ['China'] },
    { ...hk, placeType: 'country' as const }, { ...hk, coordinates: [114.2, 22.3] as const },
    { ...hk, coordinates: undefined }, { ...hk, routability: 'planning_area' as const },
  ];
  assert.equal(freshDestinationTarget(area('jurisdiction-hk'), [], fresh), null);
  for (const candidate of invalid) {
    assert.equal(freshDestinationTarget(area('jurisdiction-hk'), [candidate], fresh), null, JSON.stringify(candidate));
    assert.equal(destinationPlanningGroupKey(area('jurisdiction-hk'), [candidate], fresh), 'jurisdiction-hk');
  }
});

test('only reviewed source identities join a verified fresh stop group', () => {
  const sources = [area('jurisdiction-hk'), area('hong-kong'), hk];
  assert.equal(new Set(sources.map(row => destinationPlanningGroupKey(row, [hk], fresh))).size, 1);
  assert.equal(new Set(sources.map(row => destinationPlanningGroupKey(row, [hk], { intent: 'explicit-area' }))).size, 3);
  for (const source of [
    { ...hk, canonicalPlaceId: 'different-hong-kong' },
    { ...area('jurisdiction-hk'), parentCountries: ['China'] },
    { ...area('jurisdiction-hk'), placeType: 'island' as const },
    referenceCountrySeeds('HK').find(row => row.canonicalName === 'Sha Tin')!,
  ]) {
    assert.equal(destinationPlanningGroupKey(source, [hk], fresh), source.canonicalPlaceId);
    assert.equal(freshDestinationTarget(source, [hk], fresh), null);
  }
});

test('cities, towns and gateways use direct behavior while unknown and contradictory places require confirmation', () => {
  for (const row of [sg, hk, referenceCountrySeeds('SG')[1], area('tokyo')]) {
    assert.equal(destinationPlanningDecision(row).behavior, 'direct-stop');
  }
  assert.equal(destinationPlanningDecision({ canonicalPlaceId: 'airport:valid', placeType: 'transport_gateway', routability: 'direct_destination', country: 'Japan', coordinates: [140.4, 35.8] }).behavior, 'direct-stop');
  for (const row of [
    { placeType: 'unknown' as const, routability: 'direct_destination' as const },
    { placeType: 'city' as const },
    { canonicalPlaceId: 'unverified-city', placeType: 'city' as const, routability: 'direct_destination' as const, country: 'Japan' },
    { ...hk, providerId: 'unverified' },
  ]) assert.equal(destinationPlanningDecision(row).behavior, 'confirm');
});

test('reviewed compact targets remain consistent with the active local maintained snapshot', () => {
  for (const row of [sg, hk]) {
    const record = referencePlaceById(row.canonicalPlaceId)!;
    assert.equal(record.status, 'active');
    assert.equal(record.providerId, row.providerId);
    assert.equal(record.countryCode, countryCodeFor(row.country));
    assert.deepEqual(record.coordinates, row.coordinates);
    assert.strictEqual(freshDestinationTarget(row, [row], fresh), row);
  }
});

test('Monaco fresh city-state entry chooses the maintained urban stop while saved country stays broad', () => {
  const source = area('monaco');
  const chosen = target('MC', 'reference:geonames:2993458');
  assert.equal(destinationPlanningDecision(source, fresh).behavior, 'direct-stop');
  assert.strictEqual(freshDestinationTarget(source, [chosen], fresh), chosen);
  assert.equal(destinationPlanningGroupKey(source, [chosen], fresh), destinationPlanningGroupKey(chosen, [chosen], fresh));
  assert.equal(destinationPlanningDecision(source).behavior, 'choose-base');
  assert.equal(freshDestinationTarget(source, [chosen], { intent: 'explicit-area' }), null);
});

test('unsupported country and continent identities require confirmation', () => {
  assert.equal(destinationPlanningDecision({ canonicalPlaceId: 'made-up-country', placeType: 'country', country: 'Atlantis', routability: 'planning_area' }, fresh).behavior, 'confirm');
  assert.equal(destinationPlanningDecision({ canonicalPlaceId: 'made-up-continent', placeType: 'continent', routability: 'planning_area' }, fresh).behavior, 'confirm');
});

test('reviewed cross-source city links consolidate only fresh suggestions to intact maintained targets', async () => {
  const policy = await import('../lib/easyt/destination-planning-policy.ts');
  assert.equal(typeof policy.consolidateFreshDestinationSuggestions, 'function');
  for (const [legacyId, code, referenceId] of [
    ['beijing', 'CN', '1816670'], ['paris', 'FR', '2988507'], ['seoul', 'KR', '1835848'],
    ['manila', 'PH', '1701668'], ['madrid', 'ES', '3117735'], ['lisbon', 'PT', '2267057'], ['porto', 'PT', '2735943'],
  ]) {
    const source = area(legacyId), chosen = target(code, `reference:geonames:${referenceId}`);
    const record = referencePlaceById(chosen.canonicalPlaceId)!;
    assert.equal(record.canonicalName, source.canonicalName);
    assert.equal(record.countryCode, code);
    assert.equal(record.status, 'active');
    assert.equal(record.providerId, chosen.providerId);
    assert.deepEqual(record.coordinates, chosen.coordinates);
    const before = JSON.stringify(source);
    assert.strictEqual(freshDestinationTarget(source, [chosen], fresh), chosen);
    const result = policy.consolidateFreshDestinationSuggestions([source, chosen], fresh);
    assert.equal(result.length, 1);
    assert.strictEqual(result[0], chosen);
    assert.deepEqual(policy.consolidateFreshDestinationSuggestions([source, chosen]), [source, chosen]);
    assert.deepEqual(policy.consolidateFreshDestinationSuggestions([source, chosen], { intent: 'explicit-area' }), [source, chosen]);
    assert.equal(JSON.stringify(source), before);
  }
});

test('fresh mapping rejects conflicting names and every supplied source or target proof', () => {
  for (const source of [
    { ...area('jurisdiction-hk'), name: 'Not Hong Kong' },
    { ...area('jurisdiction-hk'), canonicalName: 'Not Hong Kong' },
    { ...area('jurisdiction-hk'), providerId: hk.providerId },
    { ...area('jurisdiction-hk'), referenceSnapshotId: REFERENCE_SNAPSHOT_ID },
    { ...area('jurisdiction-hk'), provenance: [{ id: 'spoofed-source', kind: 'canonical' }] },
  ]) assert.equal(freshDestinationTarget(source, [hk], fresh), null);
  for (const chosen of [
    { ...hk, name: 'Not Hong Kong' }, { ...hk, canonicalName: 'Not Hong Kong' },
    { ...hk, referenceProviderId: 'spoofed-proof' },
    { ...hk, provenance: [{ id: 'spoofed-proof', kind: 'provider' }] },
  ]) assert.equal(freshDestinationTarget(area('jurisdiction-hk'), [chosen], fresh), null);
});

test('fresh consolidation preserves districts, namesakes, physical areas and conflicting copies', async () => {
  const policy = await import('../lib/easyt/destination-planning-policy.ts');
  assert.equal(typeof policy.consolidateFreshDestinationSuggestions, 'function');
  const conflicting = { ...hk, name: 'Unrelated place' };
  const foreign = { ...area('bali'), canonicalPlaceId: 'foreign-bali', placeType: 'city' as const, parentCountries: ['Cameroon'], coordinates: [10, 5] as const };
  const district = referenceCountrySeeds('HK').find(row => row.canonicalName === 'Sha Tin')!;
  const untouched = [area('bali'), foreign, district, conflicting];
  const result = policy.consolidateFreshDestinationSuggestions([area('jurisdiction-hk'), ...untouched, hk], fresh);
  assert.deepEqual(result, [hk, ...untouched]);
  const lisbon = target('PT', 'reference:geonames:2267057'), porto = target('PT', 'reference:geonames:2735943');
  assert.deepEqual(policy.consolidateFreshDestinationSuggestions([area('lisbon'), area('porto'), lisbon, porto], fresh), [lisbon, porto]);
});

test('authored direct island keeps its semantics for fresh and existing selections; explicit area remains broad', () => {
  const island = area('nusa-lembongan');
  assert.equal(destinationPlanningDecision(island).behavior, 'direct-stop');
  assert.equal(destinationPlanningDecision(island, fresh).behavior, 'direct-stop');
  assert.equal(destinationPlanningDecision(island, { intent: 'explicit-area' }).behavior, 'choose-base');
  assert.equal(destinationPlanningDecision({ ...island, canonicalPlaceId: 'unreviewed-island' }).behavior, 'choose-base');
});
