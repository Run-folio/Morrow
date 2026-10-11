import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalPlaceSuggestionsForQuery } from '../lib/easyt/place-intelligence.ts';
import { mergeEquivalentPlaceSuggestions, placeSuggestionLocationDetail } from '../lib/easyt/place-autocomplete.ts';
import * as transport from '../lib/easyt/itinerary-transport-agenda.ts';
import { adaptedDiscoveryPlaces } from '../lib/easyt/discovery-evidence-adapter.ts';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';

test('traveller place rows keep verified geography without source jargon or unresolved metadata', () => {
  const osaka = canonicalPlaceSuggestionsForQuery('Osaka')[0]!;
  const choices = [osaka, { ...osaka, canonicalPlaceId: 'reference:geonames:1853909', provenance: [{ id: 'reference:geonames:1853909', label: 'GeoNames', kind: 'provider' as const, supports: 'Source record' }] }];
  assert.equal(mergeEquivalentPlaceSuggestions(choices).length, 2, 'distinct source IDs remain selectable');
  for (const choice of choices) {
    assert.equal(placeSuggestionLocationDetail(choice, choices), 'Japan');
    assert.doesNotMatch(placeSuggestionLocationDetail(choice, choices), /GeoNames|curated|Location to confirm/);
  }
  const namesakes = choices.map((choice, i) => ({ ...choice, administrativeHierarchy: ['Osaka Prefecture', i ? 'Sakai' : 'Osaka'] }));
  assert.deepEqual(namesakes.map(choice => placeSuggestionLocationDetail(choice, namesakes)), ['Osaka · Osaka Prefecture · Japan', 'Sakai · Osaka Prefecture · Japan']);
});

test('transport projection distinguishes genuine pending, settled unknown and recorded failure without mutation', () => {
  const state = (transport as any).transportAssessmentState;
  assert.equal(typeof state, 'function', 'transport must have a truthful assessment projection');
  const trip = canonicalRouteFixture();
  const leg = trip.legs[0]!;
  const unknown = { ...leg, mode: 'unknown', durationMinutes: null, doorToDoorMinutes: null, provenance: 'unknown', routeMetadata: {} };
  trip.legs = [unknown as any];
  const before = JSON.stringify(trip);
  assert.equal(state(trip, trip.legs[0]), 'unknown');
  trip.legs[0]!.routeMetadata = { pending: true };
  assert.equal(state(trip, trip.legs[0]), 'unknown', 'a retained placeholder alone is not an active request');
  trip.brief.cascadeStatus = { conflicts: [], affectedBookingIds: [], affectedPlanItemCount: 0, routeReconciliation: { version: 1, residual: [{ kind: 'leg', targetId: leg.id, basisKey: 'fixture', phase: 'failed', reason: 'unavailable' }] } } as any;
  assert.equal(state(trip, trip.legs[0]), 'failed', 'recorded failure overrides a retained pending placeholder');
  trip.brief.cascadeStatus!.routeReconciliation!.residual[0]!.phase = 'pending';
  assert.equal(state(trip, trip.legs[0]), 'pending');
  delete trip.brief.cascadeStatus;
  trip.legs[0]!.routeMetadata = {};
  assert.equal(JSON.stringify(trip), before, 'presentation leaves canonical data intact');
});

test('settled transport summary counts unknown legs and preserves mode and duration qualifications', () => {
  const summary = (transport as any).transportAssessmentSummary;
  assert.equal(typeof summary, 'function');
  const trip = canonicalRouteFixture();
  trip.stops = trip.stops.map(stop => { const place = adaptedDiscoveryPlaces().find(place => place.id === stop.id)!; return { ...stop, canonicalPlaceId: place.id, longitude: place.coordinates![0], latitude: place.coordinates![1] }; });
  trip.legs = trip.legs.slice(0, 2);
  trip.legs[0] = { ...trip.legs[0]!, mode: 'train', provenance: 'canonical_schedule', routeMetadata: {}, durationMinutes: 120 };
  trip.legs[1] = { ...trip.legs[1]!, mode: 'unknown', provenance: 'unknown', routeMetadata: {}, durationMinutes: null, doorToDoorMinutes: null };
  const before = JSON.stringify(trip);
  const result = summary(trip, 'en');
  assert.match(result.label, /1 of 2 transfers/);
  assert.match(result.label, /1 need checking/);
  assert.doesNotMatch(result.label, /up to date|checking transport options/i);
  assert.equal(JSON.stringify(trip), before);
  assert.match(summary(trip, 'es').label, /1 de 2/);
});

test('coverage respects accepted geography and recorded reconciliation phases', () => {
  const trip = canonicalRouteFixture();
  trip.stops = trip.stops.map(stop => {
    const place = adaptedDiscoveryPlaces().find(place => place.id === stop.id)!;
    return { ...stop, canonicalPlaceId: place.id, longitude: place.coordinates[0], latitude: place.coordinates[1] };
  });
  trip.legs = trip.legs.slice(0, 2).map(leg => ({ ...leg, mode: 'train', provenance: 'canonical_schedule', durationMinutes: 120, routeMetadata: {} }));
  assert.match(transport.transportAssessmentSummary(trip, 'en').label, /2 of 2 transfers/);
  trip.stops[1]!.latitude! += 0.0001;
  assert.match(transport.transportAssessmentSummary(trip, 'en').label, /0 of 2 transfers · 2 need checking/, 'unsupported coordinates cannot gain coverage from a saved mode');
  trip.brief.cascadeStatus = { conflicts: [], affectedBookingIds: [], affectedPlanItemCount: 0, routeReconciliation: { version: 1, inputKey: 'fixture', residual: trip.legs.map(leg => ({ kind: 'leg', targetId: leg.id, basisKey: 'fixture', phase: 'pending' })) } };
  assert.equal(transport.transportAssessmentSummary(trip, 'en').state, 'saving');
  assert.match(transport.transportAssessmentSummary(trip, 'en').label, /Checking 2/);
  trip.brief.cascadeStatus.routeReconciliation!.residual.forEach(unit => { unit.phase = 'failed'; });
  assert.equal(transport.transportAssessmentSummary(trip, 'en').state, 'error');
  assert.match(transport.transportAssessmentSummary(trip, 'en').label, /2 could not be checked/);
  trip.brief.cascadeStatus.routeReconciliation!.residual = [];
  assert.equal(transport.transportAssessmentSummary(trip, 'en').state, 'device');
  assert.doesNotMatch(transport.transportAssessmentSummary(trip, 'en').label, /Checking 2/);
});
