import { createDiscoveryDraft, type DiscoveryDraft } from '../../lib/easyt/discovery-draft.ts';
import { projectDiscovery } from '../../lib/easyt/discovery-projection.ts';
import { resolvePlaceMentions } from '../../lib/easyt/place-intelligence.ts';
import { tripFromBuilder } from '../../lib/easyt/trip.ts';
import { extractStructuredTripBrief } from '../../lib/easyt/structured-trip-brief.ts';
export const fixture = (name = 'Australia', ids = ['sydney', 'melbourne']) => {
  const mention = resolvePlaceMentions(name).mentions[0]!;
  const draft: DiscoveryDraft = { ...createDiscoveryDraft(), step: 'review' as const, shortlistIds: ids };
  const projection = projectDiscovery({ mention, draft, context: { interests: [], existingPlaceIds: ['sydney'] } });
  const trip = tripFromBuilder({ id: 'review-trip', origin: 'London', stops: [
    { id: 'existing-sydney-stop', name: 'Sydney', country: 'Australia', canonicalPlaceId: 'sydney', coordinates: [151.2093, -33.8688] },
    { id: 'fixed-london', name: 'London', country: 'United Kingdom', canonicalPlaceId: 'london', coordinates: [-0.1276, 51.5072] },
  ], startDate: '2026-10-01', endDate: '2026-10-15', picks: {}, mustDo: name, pace: 'slow', hotels: 'few', budget: 'mid', draft: [],
  nightAllocations: { 'existing-sydney-stop': 5, 'fixed-london': 9 }, manualNightStopIds: ['existing-sydney-stop'],
  scheduleLocks: { stopIds: ['fixed-london'], arrivalDates: { 'fixed-london': '2026-10-06' } }, structuredBrief: extractStructuredTripBrief(name) });
  return { mention, draft, projection, trip };
};

/** Mirror Add's observable contract: reuse/create stop, then write its mention selection.
 * In particular attraction Add creates a provisional visit, not reviewed confirmation. */
export function applyDiscoveryAddSideEffects(trip: import('../../lib/easyt/trip.ts').EasyTTrip,
  mention: import('../../lib/easyt/place-intelligence.ts').ResolvedPlaceMention,
  choice: import('../../lib/easyt/discovery-confirmation.ts').DiscoveryReadyChoice, coordinates = choice.suggestion.coordinates) {
  let stop = trip.stops.find(item => item.canonicalPlaceId === choice.id);
  if (!stop) {
    if (!coordinates) throw new Error('Fixture must provide Add geocode coordinates');
    stop = { ...trip.stops[0]!, id: choice.id, name: choice.name, country: choice.suggestion.country,
      canonicalPlaceId: choice.id, longitude: coordinates[0], latitude: coordinates[1], nights: 1 };
    trip.stops.push(stop);
  }
  const selection: import('../../lib/easyt/place-intelligence.ts').PlaceSelection = {
    mentionId: mention.mentionId, kind: mention.routability === 'anchor_or_poi' ? 'visit' : 'base',
    selectedCanonicalPlaceId: choice.id, selectedName: choice.name, selectedPlaceType: choice.suggestion.placeType,
    selectedParentCountries: [choice.suggestion.country], routeStopId: stop.id,
    provenance: choice.suggestion.provenance[0]!,
    ...(mention.routability === 'anchor_or_poi' ? { relationshipType: 'visit-from-base' as const } : {}),
  };
  trip.brief.structuredBrief!.placeSelections = [selection, ...(trip.brief.structuredBrief!.placeSelections ?? [])
    .filter(item => item.mentionId !== mention.mentionId || item.selectedCanonicalPlaceId !== choice.id)];
}
