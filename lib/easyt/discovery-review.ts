import { discoveryConfirmationChoiceForId, type DiscoveryReadyChoice } from './discovery-confirmation.ts';
import { discoveryBaseSuitableForMention } from './discovery-content.ts';
import { resolveDiscoveryBaseChoice, type DiscoveryDraft } from './discovery-draft.ts';
import type { DiscoveryProjection } from './discovery-projection.ts';
import { rankAttractionVisitTargets, placeMentionSupportsMultipleSelections, confirmedAttractionVisitSelection, isConfirmedAttractionVisitSelection, type AttractionVisitCandidate, type ResolvedPlaceMention } from './place-intelligence.ts';
import { analyzeRouteCountryContinuity } from './route-country-continuity.ts';
import { generateRouteCandidates } from './route-candidates.ts';
import { estimateLegForConstraints, type PlannerStop, type RoutePlanningConstraints } from './planner.ts';
import { allocateTripNights, tripNightsBetween } from './night-allocation.ts';
import { validateFinalPlan, type PlanValidationReport } from './plan-validator.ts';
import { tripFromBuilder, type EasyTTrip } from './trip.ts';

export type DiscoveryVisit = { intentId: string; baseId: string; name: string; proposal: AttractionVisitCandidate };
export type DiscoveryReview = ReturnType<typeof buildDiscoveryReview>;

/** Read-only projection. Candidate order and allocated nights never mutate the trip. */
export function buildDiscoveryReview(input: { mention: ResolvedPlaceMention; draft: DiscoveryDraft; projection: DiscoveryProjection;
  trip: EasyTTrip; constraints?: RoutePlanningConstraints; currentValidation?: PlanValidationReport }) {
  const { mention, draft, projection, trip } = input;
  const blockedIds = new Set<string>();
  const { baseId, conflict } = resolveDiscoveryBaseChoice(draft, mention.mentionId);
  const direction = projection.directions.find(item => item.id === draft.directionId);
  if (["landmark", "natural_area"].includes(mention.placeType) && !baseId) blockedIds.add(mention.mentionId);
  if (conflict || (draft.directionId && !direction)) blockedIds.add(mention.mentionId);
  const bases: DiscoveryReadyChoice[] = [];
  const visits: DiscoveryVisit[] = [];
  const addBase = (id: string) => {
    const place = projection.places.find(item => item.id === id);
    const choice = discoveryConfirmationChoiceForId(id, projection);
    if (!place || !place.stayEvidence.length || !['city', 'town', 'transport_gateway'].includes(place.placeType) || 'reason' in choice) {
      blockedIds.add(id); return false;
    }
    if (trip.stops.filter(stop => stop.canonicalPlaceId === id).length > 1) { blockedIds.add(id); return false; }
    if (!bases.some(base => base.id === id)) bases.push(choice);
    return true;
  };
  for (const id of new Set(draft.shortlistIds)) addBase(id);
  if (baseId) {
    if (['landmark', 'natural_area'].includes(mention.placeType)) {
      const base = projection.places.find(place => place.id === baseId);
      const existing = trip.stops.find(stop => stop.canonicalPlaceId === baseId);
      const proposal = base ? rankAttractionVisitTargets(mention, [{ routeStopId: existing?.id ?? `discovery:${base.id}`,
        name: base.name, country: base.country, canonicalPlaceId: base.id, coordinates: [...base.coordinates] }])[0] : undefined;
      // Only the existing evidenced relationship owner may authorize a visit.
      // Nearby coordinates alone cannot establish park access.
      if (!base || !discoveryBaseSuitableForMention(base, mention) || !proposal || proposal.score < 110) blockedIds.add(mention.mentionId);
      else if (addBase(baseId)) visits.push({ intentId: mention.mentionId, baseId, name: mention.canonicalName, proposal });
    } else addBase(baseId);
  }
  if (!placeMentionSupportsMultipleSelections(mention)) {
    const previous = trip.brief.structuredBrief?.placeSelections?.filter(selection => selection.mentionId === mention.mentionId && selection.routeStopId) ?? [];
    if (bases.length > 1 || previous.some(selection => !bases.some(base => base.id === selection.selectedCanonicalPlaceId))) blockedIds.add(mention.mentionId);
  }
  const reusedStopIds = bases.flatMap(base => trip.stops.filter(stop => stop.canonicalPlaceId === base.id).map(stop => stop.id));
  const newBaseIds = bases.filter(base => !trip.stops.some(stop => stop.canonicalPlaceId === base.id)).map(base => base.id);
  const newVisitIds = visits.filter(visit => {
    const stop = trip.stops.find(item => item.canonicalPlaceId === visit.baseId);
    if (!stop) return true;
    const expected = confirmedAttractionVisitSelection({ mentionId: visit.intentId, canonicalName: visit.name }, visit.proposal,
      { routeStopId: stop.id, name: stop.name, country: stop.country, canonicalPlaceId: stop.canonicalPlaceId });
    return !trip.brief.structuredBrief?.placeSelections?.some(selection => isConfirmedAttractionVisitSelection(selection, expected));
  }).map(visit => visit.intentId);
  const previewStops: PlannerStop[] = [...trip.stops.map(stop => ({ id: stop.id, name: stop.name, country: stop.country,
    canonicalPlaceId: stop.canonicalPlaceId, coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] as [number, number] : undefined })),
    ...bases.filter(base => newBaseIds.includes(base.id)).map(base => ({ id: `discovery:${base.id}`, name: base.name,
      country: base.suggestion.country, canonicalPlaceId: base.id, coordinates: base.suggestion.coordinates }))];
  const constraints = input.constraints ?? { fixedCommitments: trip.brief.intent?.hardConstraints.fixedCommitments,
    requiredStopIds: trip.brief.intent?.hardConstraints.mustSeeStopIds, avoidDriving: trip.brief.intent?.hardConstraints.avoidDriving };
  const origin = { name: trip.brief.origin, coordinates: trip.brief.originCoordinates };
  const candidates = generateRouteCandidates({ origin, stops: previewStops, constraints, estimateLeg: (from, to) => estimateLegForConstraints(from, to, constraints) });
  const continuity = analyzeRouteCountryContinuity(previewStops);
  const totalNights = tripNightsBetween(trip.startDate, trip.endDate);
  const nightAllocation = allocateTripNights({ totalNights, pace: trip.brief.intent?.preferences.pace, interests: trip.brief.intent?.preferences.interests, stops: previewStops.map(stop => {
    const original = trip.stops.find(item => item.id === stop.id);
    return { ...stop, preferredNights: original?.nights ?? undefined,
      manualNights: trip.brief.manualNightStopIds?.includes(stop.id) ? original?.nights ?? undefined : undefined,
      fixedNights: trip.brief.scheduleLocks?.stopIds.includes(stop.id) ? original?.nights ?? undefined : undefined };
  }), fixedCommitments: constraints.fixedCommitments });
  const fixedNightsFor = (stopId: string) => {
    const original = trip.stops.find(stop => stop.id === stopId);
    const allocation = trip.brief.nightAllocation?.stops.find(stop => stop.stopId === stopId);
    return trip.brief.manualNightStopIds?.includes(stopId) || trip.brief.scheduleLocks?.stopIds.includes(stopId)
      || allocation?.isFixed || allocation?.isManual ? original?.nights ?? undefined : undefined;
  };
  // Current diagnostics retain authoritative dates/protection even if a preview
  // would redistribute nights. Builder supplies its full existing validation.
  const currentValidation = input.currentValidation ?? validateFinalPlan({ plan: {
    version: 1, origin, stops: trip.stops.map(stop => ({ ...stop, ...previewStops.find(item => item.id === stop.id), nights: stop.nights ?? 0, fixedNights: fixedNightsFor(stop.id) })),
    totalNights, constraints, startDate: trip.startDate, endDate: trip.endDate, scheduleLocks: trip.brief.scheduleLocks,
  }, structuredBrief: trip.brief.structuredBrief, nightAllocation: trip.brief.nightAllocation });
  // Use the existing Builder document/calendar owner for hypothetical dates;
  // neither these dates nor its allocations are committed by Review.
  const previewTrip = tripFromBuilder({ id: trip.id, origin: trip.brief.origin, originCoordinates: trip.brief.originCoordinates,
    stops: previewStops, startDate: trip.startDate, endDate: trip.endDate, picks: trip.brief.selectedPlaces,
    mustDo: trip.brief.mustDo, pace: trip.brief.pace, hotels: trip.brief.hotelChanges, budget: trip.brief.budgetBand, draft: [],
    nightAllocations: nightAllocation.allocations ?? Object.fromEntries(previewStops.map(stop => [stop.id, trip.stops.find(item => item.id === stop.id)?.nights ?? 0])),
    manualNightStopIds: trip.brief.manualNightStopIds, scheduleLocks: trip.brief.scheduleLocks,
  });
  const validation = validateFinalPlan({ plan: { version: 1, origin, stops: previewStops.map(stop => {
    const dated = previewTrip.stops.find(item => item.id === stop.id)!;
    return { ...stop, nights: dated.nights ?? 0, arrivalDate: dated.arrivalDate, departureDate: dated.departureDate,
      fixedNights: fixedNightsFor(stop.id) };
  }), totalNights, constraints, startDate: trip.startDate, endDate: trip.endDate, scheduleLocks: trip.brief.scheduleLocks },
  structuredBrief: trip.brief.structuredBrief, nightAllocation });
  const warnings = [...candidates.constraintIssues, ...nightAllocation.conflicts, ...nightAllocation.notices,
    ...currentValidation.issues, ...validation.issues];
  return { mentionId: mention.mentionId, originalIntent: mention.sourceText || mention.canonicalName, directionId: draft.directionId,
    direction, bases, newBaseIds, reusedStopIds, visits, newVisitIds, blockedIds: [...blockedIds], existingStops: trip.stops,
    warnings, candidates, continuity, nightAllocation, currentValidation, validation, fit: 'needs-checking' as const,
    canConfirm: blockedIds.size === 0 && (bases.length > 0 || visits.length > 0),
    primaryAction: { kind: 'confirm-selected-places' as const, baseCount: newBaseIds.length, visitCount: newVisitIds.length } };
}
