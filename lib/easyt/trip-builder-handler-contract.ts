import type { BudgetBand, CanonicalEasyTTrip, JourneyEndSelection, JourneyEndpointPlace, TripStop } from './trip.ts';
import { prepareAcceptedBuilderEdit, type BuilderAcceptedEdit } from './trip-builder-edit.ts';
import { prepareBuilderNecessaryProjection } from './trip-builder-reconciliation.ts';
import { prepareTripDocumentForWrite, requireReadableTripDocument } from './trip-document.ts';
import { builderDetailsFingerprint, builderDocumentFingerprint } from './trip-builder-document-commit.ts';

const endpointKey = (place: JourneyEndpointPlace | null) => JSON.stringify(place && {
  name: place.name, canonicalPlaceId: place.canonicalPlaceId, providerId: place.providerId, country: place.country, coordinates: place.coordinates,
});
/** The existing compact form owns these explicit fields, never a route-document diff. */
export function builderDetailsCommands(trip: CanonicalEasyTTrip, draft: {
  journeyOrigin: JourneyEndpointPlace; journeyEnd: JourneyEndSelection;
  startDate: string; endDate: string; travellers: number; budget: BudgetBand;
}, expectedFingerprint: string) {
  if (builderDetailsFingerprint(trip) !== expectedFingerprint) return { ok: false as const, reason: 'stale-source' as const };
  const edits: BuilderAcceptedEdit[] = [], route = trip.brief.intent.route;
  if (endpointKey(route.origin) !== endpointKey(draft.journeyOrigin)) edits.push({ kind: 'origin', place: draft.journeyOrigin });
  if (JSON.stringify(route.journeyEnd) !== JSON.stringify(draft.journeyEnd)) {
    if (draft.journeyEnd.mode === 'explicit') {
      if (route.journeyEnd.mode !== 'explicit') return { ok: false as const, reason: 'endpoint-conflict' as const };
      edits.push({ kind: 'legacy-end', place: draft.journeyEnd.place });
    } else edits.push({ kind: 'type', tripType: draft.journeyEnd.mode === 'same_as_start' ? 'return_to_start' : 'one_way',
      ...(route.journeyEnd.mode === 'explicit' ? { acceptEndpointReplacement: true } : {}) });
  }
  if (trip.startDate !== draft.startDate || trip.endDate !== draft.endDate) edits.push({ kind: 'dates', startDate: draft.startDate, endDate: draft.endDate });
  if (trip.travellers !== draft.travellers) edits.push({ kind: 'travellers', travellers: draft.travellers });
  if (trip.brief.budgetBand !== draft.budget) edits.push({ kind: 'budget', budget: draft.budget });
  return { ok: true as const, edits };
}

function intentForStop(trip: CanonicalEasyTTrip, stopId: string) {
  const matching = trip.brief.intent.route.destinations.filter(intent => intent.stopIds.includes(stopId));
  return matching.length === 1 && trip.stops.some(stop => stop.id === stopId) ? matching[0]! : null;
}
export function builderNightsCommand(trip: CanonicalEasyTTrip, stopId: string, nights: number): BuilderAcceptedEdit | null {
  const intent = intentForStop(trip, stopId);
  return intent ? { kind: 'nights', intentId: intent.id, stopId, nights } : null;
}
export function builderRemoveCommand(trip: CanonicalEasyTTrip, stopId: string): BuilderAcceptedEdit | null {
  const intent = intentForStop(trip, stopId);
  return intent ? { kind: 'remove-destination', intentId: intent.id, ...(intent.stopIds.length > 1 ? { stopId } : {}) } : null;
}
/** Caller supplies the captured pending intent/slot. Display names and chip indexes prove neither. */
export function builderPlaceCommand(trip: CanonicalEasyTTrip, input: {
  stopId: string; place: JourneyEndpointPlace; intentId?: string; beforeStopId?: string;
  requestedNights?: number | null; sourceText?: string;
  bindSourceNights?: boolean;
}): BuilderAcceptedEdit | null {
  const mapped = intentForStop(trip, input.stopId);
  const intent = input.intentId ? trip.brief.intent.route.destinations.find(item => item.id === input.intentId) : mapped;
  if (input.intentId && !intent || mapped && intent?.id !== mapped.id) return null;
  if (intent) return { kind: intent.resolution === 'resolved' ? 'replace-destination' : 'resolve-destination',
    intentId: intent.id, stopId: input.stopId, place: input.place, ...(input.beforeStopId ? { beforeStopId: input.beforeStopId } : {}),
    ...(input.bindSourceNights ? { bindSourceNights: true } : {}) };
  const stop: TripStop = { id: input.stopId, order: trip.stops.length, name: input.place.name, country: input.place.country ?? '',
    canonicalPlaceId: input.place.canonicalPlaceId, providerId: input.place.providerId,
    longitude: input.place.coordinates?.[0] ?? null, latitude: input.place.coordinates?.[1] ?? null,
    arrivalDate: null, departureDate: null, nights: input.requestedNights ?? null };
  return { kind: 'add-destination', intent: { id: `builder-intent:${input.stopId}`, sourceText: input.sourceText ?? input.place.name,
    kind: 'overnight_place', selectedPlace: input.place, resolution: 'resolved', requestedNights: input.requestedNights ?? null,
    routeMembership: 'required', stopIds: [input.stopId] }, stop, ...(input.beforeStopId ? { beforeStopId: input.beforeStopId } : {}) };
}
/** Dormant conversion exercises the same accepted-edit/prefix contract as the mounted coordinator. */
export function prepareBuilderHandlerEdit(trip: CanonicalEasyTTrip, edit: BuilderAcceptedEdit, expectedFingerprint: string) {
  const accepted = prepareAcceptedBuilderEdit(trip, edit, expectedFingerprint);
  if (!accepted.ok) return accepted;
  const coherent = prepareBuilderNecessaryProjection(trip, accepted.trip, accepted.scope, accepted.retainedConsumption);
  if (!coherent.ok) return coherent;
  return { ok: true as const, trip: requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(coherent.trip)))),
    releasedNights: accepted.releasedNights };
}
/** One deliberate form commit contains bounded, explicit commands; no whole-document diff inference. */
export function prepareBuilderHandlerEdits(trip: CanonicalEasyTTrip, edits: readonly BuilderAcceptedEdit[], expectedFingerprint: string) {
  if (!Array.isArray(edits) || !edits.length || edits.length > 28) return { ok: false as const, reason: 'invalid-input' as const };
  let next = trip, releasedNights = 0;
  for (const [index, edit] of edits.entries()) {
    const prepared = prepareBuilderHandlerEdit(next, edit, index === 0 ? expectedFingerprint : builderDocumentFingerprint(next));
    if (!prepared.ok) return prepared;
    next = prepared.trip; releasedNights += prepared.releasedNights;
  }
  return { ok: true as const, trip: next, releasedNights };
}
