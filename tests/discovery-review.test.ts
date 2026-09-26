import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiscoveryReview } from '../lib/easyt/discovery-review.ts';
import { createDiscoveryDraft, readDiscoveryDraft, type DiscoveryDraft } from '../lib/easyt/discovery-draft.ts';
import { extractStructuredTripBrief } from '../lib/easyt/structured-trip-brief.ts';
import { tripFromBuilder } from '../lib/easyt/trip.ts';
import { fixture } from './helpers/discovery-fixture.ts';
test('read-only review retains intent, direction, existing manual nights, browse-only uncertainty and actual route warnings', () => {
  const input = fixture('Australia', ['sydney', 'melbourne', 'uluru-kata-tjuta']);
  input.draft.directionId = 'australia-east-coast';
  const before = JSON.stringify(input);
  const review = buildDiscoveryReview(input);
  assert.equal(review.originalIntent, 'Australia');
  assert.equal(review.directionId, 'australia-east-coast');
  assert.deepEqual(review.reusedStopIds, ['existing-sydney-stop']);
  assert.deepEqual(review.newBaseIds, ['melbourne']);
  assert.ok(review.blockedIds.includes('uluru-kata-tjuta'));
  assert.equal(review.canConfirm, false);
  assert.equal(review.primaryAction.kind, 'confirm-selected-places');
  assert.ok(review.warnings.length > 0);
  assert.equal(review.fit, 'needs-checking');
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(review.existingStops.map(stop => stop.id), ['existing-sydney-stop', 'fixed-london']);
});
test('legacy chosen IDs remain explicit and duplicate canonical IDs add only one base', () => {
  const input = fixture();
  input.draft = readDiscoveryDraft({ ...extractStructuredTripBrief('Australia'), countryDiscoveryChoices: { [input.mention.mentionId]: ['sydney', 'melbourne', 'melbourne'] } }, input.mention.mentionId).draft;
  const review = buildDiscoveryReview(input);
  assert.deepEqual(review.newBaseIds, ['melbourne']);
  assert.equal(review.canConfirm, true);
});
test('landmark visit links an evidenced parent base without overnight landmark', () => {
  const input = fixture('Taj Mahal', []);
  // Contract fixture only: no new published Agra evidence.
  const source = fixture().projection.places.find(place => place.id === 'sydney')!;
  input.projection.places.push({ ...source, id: 'agra', name: 'Agra', country: 'India', coordinates: [78.008, 27.176] });
  input.draft.visitBaseByIntentId[input.mention.mentionId] = 'agra';
  const review = buildDiscoveryReview(input);
  assert.deepEqual(review.newBaseIds, ['agra']);
  assert.equal(review.visits[0]?.intentId, input.mention.mentionId);
  assert.equal(review.visits[0]?.baseId, 'agra');
  assert.equal(review.canConfirm, true);
});
test('conflicting base values and unsupported park relationships block confirmation', () => {
  const input = fixture('Taj Mahal', []);
  input.draft.baseByIntentId[input.mention.mentionId] = 'agra';
  input.draft.visitBaseByIntentId[input.mention.mentionId] = 'delhi';
  assert.equal(buildDiscoveryReview(input).canConfirm, false);
  const park = fixture('Kruger', []);
  park.draft.visitBaseByIntentId[park.mention.mentionId] = 'sydney';
  assert.equal(buildDiscoveryReview(park).canConfirm, false);
});

test('unavailable evidence and ambiguous repeated route occurrences block the entire confirmation', () => {
  const input = fixture('Australia', ['sydney']);
  input.trip.stops.push({ ...input.trip.stops[0]!, id: 'second-sydney' });
  assert.equal(buildDiscoveryReview(input).canConfirm, false);
  const stale = fixture('Australia', ['retired-canonical-id']);
  assert.deepEqual(buildDiscoveryReview(stale).blockedIds, ['retired-canonical-id']);
});

test('draft-only direction, shortlist and Back actions leave canonical route and manual nights untouched', async () => {
  const { reduceDiscoveryDraft } = await import('../lib/easyt/discovery-draft.ts');
  const input = fixture(); const before = JSON.stringify(input.trip);
  for (const action of [ { type: 'change-direction', directionId: 'australia-west' }, { type: 'add-shortlist', placeId: 'broome' },
    { type: 'set-step', step: 'places' } ] as const) input.draft = reduceDiscoveryDraft(input.draft, action);
  buildDiscoveryReview(input);
  assert.equal(JSON.stringify(input.trip), before);
  assert.deepEqual(input.draft.shortlistIds, ['sydney', 'melbourne', 'broome']);
});

test('Review action labels enumerate only new base and visit actions in both languages', async () => {
  const { discoveryConfirmLabel, discoveryWarningText } = await import('../lib/easyt/i18n.ts');
  assert.equal(discoveryConfirmLabel('en', 1, 0), 'Add 1 base');
  assert.equal(discoveryConfirmLabel('es', 0, 1), 'Añadir 1 visita');
  assert.equal(discoveryConfirmLabel('en', 2, 1), 'Add 2 bases and 1 visit');
  assert.equal(discoveryConfirmLabel('es', 0, 0), 'Confirmar lugares existentes');
  assert.match(discoveryWarningText('es', { code: 'unsupported-transfer', message: 'Unknown transfer', stopIds: ['stop'] }, [{ id: 'stop', name: 'Sydney' }]), /Sydney/);
  assert.doesNotMatch(discoveryWarningText('es', { code: 'unsupported-transfer', message: 'Unknown transfer' }, []), /Unknown transfer/);
});

test('Review retains authoritative fixed arrival conflicts and protection when no new stop is selected', () => {
  const input = fixture('Australia', ['sydney']);
  input.trip.brief.scheduleLocks!.arrivalDates['fixed-london'] = '2026-10-08';
  const before = JSON.stringify(input.trip);
  const review = buildDiscoveryReview(input);
  assert.ok(review.validation.issues.some(issue => issue.code === 'fixed-date-conflict'));
  assert.ok(review.warnings.some(issue => issue.code === 'fixed-date-conflict'));
  assert.equal(JSON.stringify(input.trip), before);
});

test('ordinary geography shortlist order is membership; the existing route scorer owns Australia chronology', () => {
  const input = fixture('Australia', ['airlie-beach', 'sydney', 'port-douglas']);
  input.trip = tripFromBuilder({ id: 'australia-order-review', origin: 'London', originCoordinates: [-0.1276, 51.5072],
    stops: [], startDate: '2026-10-01', endDate: '2026-10-15', picks: {}, mustDo: 'Australia', pace: 'slow',
    hotels: 'few', budget: 'mid', draft: [], structuredBrief: extractStructuredTripBrief('Australia') });
  input.draft.directionId = 'australia-east-coast';
  const review = buildDiscoveryReview(input);
  assert.deepEqual(input.draft.shortlistIds, ['airlie-beach', 'sydney', 'port-douglas']);
  assert.deepEqual(review.bases.map(base => base.id), ['airlie-beach', 'sydney', 'port-douglas']);
  assert.deepEqual(review.orderedStopIds?.map(id => id.replace(/^discovery:/, '')),
    ['port-douglas', 'airlie-beach', 'sydney']);
  assert.equal(review.routeOrderSource, 'route-scorer');
});

test('ordinary Japan shortlist uses the existing route scorer instead of Osaka click chronology', () => {
  const input = fixture('Japan', ['osaka', 'kanazawa', 'kyoto']);
  input.trip = tripFromBuilder({ id: 'japan-order-review', origin: 'London', originCoordinates: [-0.1276, 51.5072],
    stops: [], startDate: '2026-10-01', endDate: '2026-10-15', picks: {}, mustDo: 'Japan', pace: 'slow',
    hotels: 'few', budget: 'mid', draft: [], structuredBrief: extractStructuredTripBrief('Japan') });
  const review = buildDiscoveryReview(input);
  assert.deepEqual(input.draft.shortlistIds, ['osaka', 'kanazawa', 'kyoto']);
  assert.deepEqual(review.bases.map(base => base.id), ['osaka', 'kanazawa', 'kyoto']);
  assert.deepEqual(review.orderedStopIds?.map(id => id.replace(/^discovery:/, '')), ['osaka', 'kyoto', 'kanazawa']);
  assert.equal(review.routeOrderSource, 'route-scorer');
});

test('an explicitly selected reviewed route family retains its editorial route chronology', () => {
  const input = fixture('Africa', ['swakopmund', 'windhoek']);
  input.trip = tripFromBuilder({ id: 'namibia-family-order-review', origin: 'London', originCoordinates: [-0.1276, 51.5072],
    stops: [], startDate: '2026-10-01', endDate: '2026-10-15', picks: {}, mustDo: 'Africa', pace: 'slow',
    hotels: 'few', budget: 'mid', draft: [], structuredBrief: extractStructuredTripBrief('Africa') });
  input.draft.directionId = 'route-family:namibia-self-drive';
  const review = buildDiscoveryReview(input);
  assert.deepEqual(review.bases.map(base => base.id), ['swakopmund', 'windhoek']);
  assert.deepEqual(review.orderedStopIds?.map(id => id.replace(/^discovery:/, '')), ['windhoek', 'swakopmund']);
  assert.equal(review.routeOrderSource, 'reviewed-route-family');
  assert.equal(review.direction?.title, 'Namibia Self-Drive');
});
