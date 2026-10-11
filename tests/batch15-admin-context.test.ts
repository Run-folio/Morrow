import assert from 'node:assert/strict';
import test from 'node:test';
import { searchReferencePlaces, referencePlaceById, referencePhotoPlaceContext } from '../lib/easyt/place-reference.server.ts';
import { placeSuggestionLocationDetail } from '../lib/easyt/place-autocomplete.ts';
import { referenceSelectionMatches } from '../lib/easyt/place-reference.ts';
import { referenceSnapshotId } from '../lib/easyt/place-reference.server.ts';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { searchBundledIslandIdentityCandidates } from '../lib/easyt/island-geography.server.ts';
import { tripFromBuilder } from '../lib/easyt/trip.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { builderPlaceCommand, prepareBuilderHandlerEdit } from '../lib/easyt/trip-builder-handler-contract.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
import { mergeHandoffLocationChoice, type HandoffLocationChoice } from '../lib/easyt/home-trip-handoff.ts';
import type { ResolvedPlaceMention } from '../lib/easyt/place-intelligence.ts';

test('island bindings migrate with the reference snapshot while retaining reviewed identities', () => {
  const manifest = JSON.parse(readFileSync('data/place-reference/islands/manifest.json', 'utf8'));
  const derived = JSON.parse(gunzipSync(readFileSync('data/place-reference/islands/base-bindings.json.gz')).toString());
  assert.equal(manifest.referenceSnapshotId, referenceSnapshotId());
  assert.equal(derived.referenceSnapshotId, referenceSnapshotId());
  assert.equal(derived.bindings.length, 192);
  assert.ok(searchBundledIslandIdentityCandidates('Santorini').some(item => item.canonicalName === 'Santorini'));
});

test('same-name Xi’an choices show the shortest verified province and retain five distinct GeoNames identities', () => {
  const choices = searchReferencePlaces('Xi’an', { explicitCountryNames: ['China'] })
    .filter(item => item.canonicalName === 'Xi’an');
  assert.equal(choices.length, 5);
  const details = choices.map(item => placeSuggestionLocationDetail({
    name: item.canonicalName, country: item.parentCountries?.[0], region: item.parentRegionId,
    administrativeHierarchy: item.administrativeHierarchy, placeType: item.placeType,
  }, choices.map(other => ({ name: other.canonicalName, country: other.parentCountries?.[0],
    region: other.parentRegionId, administrativeHierarchy: other.administrativeHierarchy,
    placeType: other.placeType }))));
  assert.deepEqual(new Set(details), new Set([
    'Shaanxi · China', 'Hunan · China', 'Guangdong · China', 'Liaoning · China', 'Heilongjiang · China',
  ]));
  for (const choice of choices) {
    const record = referencePlaceById(choice.canonicalPlaceId!);
    assert.ok(record);
    assert.ok(referenceSelectionMatches({ canonicalPlaceId: choice.canonicalPlaceId!, providerId: choice.providerId,
      country: choice.parentCountries![0]!, placeType: choice.placeType, coordinates: choice.coordinates! }, record, referenceSnapshotId()));
  }
});

test('a district appears only when province alone cannot distinguish same-name places', () => {
  const choices = [
    { name: 'Springfield', country: 'United States', placeType: 'city', region: 'Illinois', administrativeHierarchy: ['Illinois', 'Sangamon County'] },
    { name: 'Springfield', country: 'United States', placeType: 'city', region: 'Illinois', administrativeHierarchy: ['Illinois', 'Lake County'] },
    { name: 'Springfield', country: 'United States', placeType: 'city', region: 'Massachusetts', administrativeHierarchy: ['Massachusetts', 'Hampden County'] },
  ];
  assert.deepEqual(choices.map(item => placeSuggestionLocationDetail(item, choices)), [
    'Sangamon County · Illinois · United States', 'Lake County · Illinois · United States', 'Massachusetts · United States',
  ]);
});

test('same-name identities within one province are marked as requiring photo coordinates', () => {
  assert.equal(referencePlaceById('reference:geonames:1795565')?.photoRequiresCoordinates, true);
  assert.equal(referencePlaceById('reference:geonames:1795566')?.photoRequiresCoordinates, true);
  assert.equal(referencePlaceById('reference:geonames:1790630')?.photoRequiresCoordinates, undefined);
});

test('a selected district survives canonical trip construction and a saved document reload', () => {
  const selected = searchReferencePlaces('Shenzhen', { explicitCountryNames: ['China'] })
    .find(item => item.canonicalPlaceId === 'reference:geonames:1795566')!;
  assert.deepEqual(selected.administrativeHierarchy, ['Guangdong', 'Maoming Shi']);
  const trip = tripFromBuilder({ id: 'district-trip', origin: 'Hong Kong',
    stops: [{ id: 'selected', name: selected.canonicalName, country: 'China',
      canonicalPlaceId: selected.canonicalPlaceId, providerId: selected.providerId,
      region: selected.parentRegionId, administrativeHierarchy: selected.administrativeHierarchy,
      coordinates: selected.coordinates as [number, number] }],
    startDate: '2027-01-01', endDate: '2027-01-04', picks: {}, mustDo: '',
    pace: 'slow', hotels: 'few', budget: 'mid', draft: [],
  });
  assert.deepEqual(trip.stops[0]?.administrativeHierarchy, ['Guangdong', 'Maoming Shi']);
  const reloaded = requireReadableTripDocument(JSON.parse(JSON.stringify(trip)));
  assert.deepEqual(reloaded.stops[0]?.administrativeHierarchy, ['Guangdong', 'Maoming Shi']);
});

test('homepage handoff enrichment keeps the chosen district on its stop occurrence', () => {
  const fixture = JSON.parse(readFileSync('tests/fixtures/batch14-city-region-candidates.json', 'utf8'))[0] as {
    name: string; mention: ResolvedPlaceMention; expected: HandoffLocationChoice;
  };
  const choice = { ...fixture.expected, administrativeHierarchy: ['Lima Province', 'Lima District'] };
  const enriched = mergeHandoffLocationChoice([{ id: 'selected', name: fixture.name,
    country: choice.country }], fixture.mention, choice, 'selected');
  assert.deepEqual(enriched[0]?.administrativeHierarchy, ['Lima Province', 'Lima District']);
});

test('an older saved stop without district still recovers exact photo geography from stable identity', () => {
  const older = { canonicalPlaceId: 'reference:geonames:1795566', name: 'Shenzhen', country: 'China',
    coordinates: [111.11793, 22.1823] as [number, number] };
  assert.deepEqual(referencePhotoPlaceContext(older), { valid: true, canonicalName: 'Shenzhen', placeType: 'city', region: 'Guangdong',
    administrativeHierarchy: ['Guangdong', 'Maoming Shi'], requiresPhotoCoordinates: true });
  assert.deepEqual(referencePhotoPlaceContext({ ...older, coordinates: [114.0683, 22.54554] }), { valid: false });
});

test('the canonical Builder accepted edit retains district names through persistence', () => {
  const initial = requireReadableTripDocument(canonicalRouteFixture());
  const selected = searchReferencePlaces('Shenzhen', { explicitCountryNames: ['China'] })
    .find(item => item.canonicalPlaceId === 'reference:geonames:1795566')!;
  const command = builderPlaceCommand(initial, { stopId: 'selected-shenzhen', place: {
    name: selected.canonicalName, country: 'China', canonicalPlaceId: selected.canonicalPlaceId,
    providerId: selected.providerId, coordinates: selected.coordinates as [number, number],
    region: selected.parentRegionId, administrativeHierarchy: selected.administrativeHierarchy,
  } });
  assert.ok(command);
  const applied = prepareBuilderHandlerEdit(initial, command, builderDocumentFingerprint(initial));
  assert.ok(applied.ok);
  if (!applied.ok) return;
  const reloaded = requireReadableTripDocument(JSON.parse(JSON.stringify(applied.trip)));
  assert.deepEqual(reloaded.stops.find(stop => stop.id === 'selected-shenzhen')?.administrativeHierarchy,
    ['Guangdong', 'Maoming Shi']);
});
