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
