import { generatedFlexibleStopIds, allocateGeneratedBuilderNights } from "./trip-builder-generated-nights.ts";
import { geographicDependency, geographicInputKey, geographicallyReady } from './geographic-binding.ts';
import { restoreRetainedAuthoredContent, restoreBuilderCalendarSnapshot, captureBuilderCalendarSnapshot, type BuilderCalendarSnapshot, moveRetainedAuthoredContent, removeRetainedAuthoredContent, type RetainedContentSelection, type RetainedContentConsumption } from "./trip-retained-authored-content.ts";
import { builderDocumentFingerprint, prepareBuilderDocumentCommit } from "./trip-builder-document-commit.ts";
import { projectCanonicalRouteEndpoints, readTripDocument } from "./trip-document.ts";
import { canonicalJourneyEndpointPlace, journeyEndpointIdentityIsCoherent } from "./journey-endpoints.ts";
import { routeIntentForAcceptedBuilderOrder, validateBuilderStopOrder } from "./trip-builder-order.ts";
import { buildCanonicalTripLegs, routeEndpointForLeg } from "./trip-legs.ts";
import { clearTripLegTransportChoice, selectTripLegTransportChoice, supportedTransportChoicesForLeg } from "./transport-mode-choice.ts";
import { tripInterestIds } from "./trip-interest.ts";
import { eligibleCountryContextIntentIds } from "./trip-country-context.ts";
import { structuredTripBriefFromSavedSelections, mergeStructuredTripBrief } from "./structured-trip-brief.ts";
import { placeMentionSupportsMultipleSelections, placeResolutionIssuesForMentions, type ResolvedPlaceMention, type PlaceSelection } from "./place-intelligence.ts";
import { DISCOVERY_DRAFT_VERSION, readDiscoveryDraft, type DiscoveryDraft } from "./discovery-draft.ts";
import type { BudgetBand, CanonicalEasyTTrip, DestinationIntent, JourneyEndpointPlace, RouteIntent, TripStop, TripIntent } from "./trip.ts";

import type { RouteReconciliationScope } from "./trip.ts";
import { rebalanceTripNights, calendarDayAllocationsFromNights, tripNightsBetween } from './night-allocation.ts';
export type { RouteReconciliationScope } from "./trip.ts";
export type BuilderStructuralSnapshot = Pick<CanonicalEasyTTrip, "id" | "ownerId" | "stops" | "startDate" | "endDate"> & {
  calendar?: BuilderCalendarSnapshot;
  route: RouteIntent;
  nightAllocations: CanonicalEasyTTrip["brief"]["nightAllocations"];
  nightAllocation?: CanonicalEasyTTrip["brief"]["nightAllocation"];
  dayAllocations: CanonicalEasyTTrip["brief"]["dayAllocations"];
  manualNightStopIds: CanonicalEasyTTrip["brief"]["manualNightStopIds"];
  selectedPlaces: CanonicalEasyTTrip["brief"]["selectedPlaces"];
  scheduleLocks: CanonicalEasyTTrip["brief"]["scheduleLocks"];
  hardConstraints: TripIntent["hardConstraints"];
  timing: TripIntent["timing"];
  structuredRouting?: Pick<NonNullable<CanonicalEasyTTrip["brief"]["structuredBrief"]>,
    "destinations" | "mustVisit" | "placeSelections" | "placeMentions" | "placeIssues" | "completedPlanningAreaMentionIds" | "removedPlaceMentionIds" | "countryDiscoveryChoices" | "discoveryDraftByMentionId">;
};
type DestinationSelection = {
  intentId: string; stopId: string; place: JourneyEndpointPlace;
  /** Bind an already captured night request using the selected source occurrence. */
  bindSourceNights?: boolean;
  /** An explicit/captured occurrence position, never the displayed chip position. */
  beforeStopId?: string; stop?: TripStop;
};
export type BuilderAcceptedEdit =
  | { kind: "origin"; place: JourneyEndpointPlace | null }
  | { kind: "type"; tripType: "return_to_start" | "one_way"; acceptEndpointReplacement?: boolean }
  | { kind: "legacy-end"; place: JourneyEndpointPlace }
  | { kind: "add-destination"; intent: DestinationIntent; stop?: TripStop; beforeStopId?: string }
  | { kind: "remove-destination"; intentId: string; stopId?: string }
  | ({ kind: "resolve-destination" | "replace-destination" } & DestinationSelection)
  | { kind: "nights"; stopId: string; intentId: string; nights: number }
  | { kind: "dates"; startDate: string; endDate: string }
  | { kind: "travellers"; travellers: number }
  | { kind: "budget"; budget: BudgetBand }
  | { kind: "preferences"; preferences: Partial<TripIntent["preferences"]>; avoidDriving?: boolean }
  | { kind: "constraints"; constraints: Partial<Pick<TripIntent["hardConstraints"], "optionalStopIds" | "fixedCommitments" | "avoidDriving">> }
  | { kind: "timing-flexibility"; flexibility: "fixed" | "flexible" }
  | { kind: "schedule-locks"; locks: NonNullable<CanonicalEasyTTrip["brief"]["scheduleLocks"]> }
  | { kind: "picks"; stopId: string; titles: string[] }
  | { kind: "planning-selection"; selection: PlaceSelection }
  | { kind: "planning-context"; mentionIds: string[] }
  | { kind: "planning-area"; mentionId: string; action: "complete" | "reopen" | "remove" }
  | { kind: "planning-mention"; mention: ResolvedPlaceMention; action: "add" | "cancel" }
  | { kind: "planning-mention"; mention: ResolvedPlaceMention; action: "replace"; expectedMention: ResolvedPlaceMention }
  | { kind: "discovery-state"; mentionId: string; draft?: DiscoveryDraft; choiceIds?: string[] }
  | { kind: "build-status" }
  | { kind: "order"; stopIds: string[]; source?: "drag" | "move-menu" | "route-check" }
  | { kind: "transport"; legId: string; identity: string | null }
  | { kind: "structural-inverse"; snapshot: BuilderStructuralSnapshot; restoreDates?: boolean }
  | { kind: "retained-content-remove"; selection: RetainedContentSelection }
  | { kind: "retained-content-move"; selection: RetainedContentSelection; target: {stopId:string;dayId:string} };
type Rejection = "stale-source" | "invalid-input" | "endpoint-conflict" | "binding-conflict";
export type BuilderAcceptedEditResult =
  | { ok: true; trip: CanonicalEasyTTrip; scope: RouteReconciliationScope; releasedNights: number; retainedConsumption?: RetainedContentConsumption }
  | { ok: false; reason: Rejection };

const budgets = new Set(["value", "mid", "high"]);

/** Rebuild existing allocation projections without assigning any released/held night. */
function synchronizeAcceptedNightAllocations(trip: CanonicalEasyTTrip, flexible: Set<string>) {
  const allocations = Object.fromEntries(trip.stops.map(stop => [stop.id, stop.nights ?? 0]));
  const manual = new Set(trip.brief.manualNightStopIds ?? []);
  const locked = new Set(trip.brief.scheduleLocks?.stopIds ?? []);
  const commitments = trip.brief.intent.hardConstraints.fixedCommitments.filter(item => item.stopId && trip.stops.some(stop => stop.id === item.stopId));
  const result = rebalanceTripNights({ totalNights: tripNightsBetween(trip.startDate, trip.endDate),
    stops: trip.stops.map(stop => ({ ...stop, required: trip.brief.intent.hardConstraints.mustSeeStopIds.includes(stop.id),
      fixedNights: locked.has(stop.id) || trip.brief.scheduleLocks?.arrivalDates[stop.id] ? stop.nights ?? 0 : undefined })),
    pace: trip.brief.intent.preferences.pace, interests: trip.brief.intent.preferences.interests,
    fixedCommitments: commitments, currentAllocations: allocations, manualStopIds: trip.stops.map(stop => stop.id) }).nightAllocation;
  // Freezing canonical values for projection is not a new traveller edit or booking.
  result.stops = result.stops.map(stop => ({ ...stop, isManual: manual.has(stop.stopId) ? true : flexible.has(stop.stopId) ? false : undefined,
    isFixed: locked.has(stop.stopId) || Boolean(trip.brief.scheduleLocks?.arrivalDates[stop.stopId]) || commitments.some(item => item.stopId === stop.stopId && item.fixedNights !== undefined),
    reasons: stop.reasons.filter(reason => reason.code !== 'manual-nights' || manual.has(stop.stopId)) }));
  trip.brief.nightAllocations = allocations;
  trip.brief.dayAllocations = calendarDayAllocationsFromNights(trip.stops.map(stop => stop.id), allocations);
  trip.brief.nightAllocation = result;
}
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const nonempty = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
function bindSourceNightRequest(trip: CanonicalEasyTTrip, intent: DestinationIntent, stopId: string, place: JourneyEndpointPlace) {
  const brief = trip.brief.structuredBrief;
  const mentions = brief?.placeMentions?.filter(mention => mention.mentionId === intent.id) ?? [];
  const destinations = brief?.destinations.filter(destination => destination.placeMentionId === intent.id) ?? [];
  if (!brief || intent.kind !== "overnight_place" || !integer(intent.requestedNights)
    || intent.stopIds.length !== 1 || intent.stopIds[0] !== stopId || mentions.length !== 1 || destinations.length !== 1
    || mentions[0]!.status !== "resolved" || mentions[0]!.canonicalPlaceId !== place.canonicalPlaceId
    || destinations[0]!.id && destinations[0]!.id !== stopId) return false;
  const id = `source-night:${intent.id}`;
  const commitments = trip.brief.intent.hardConstraints.fixedCommitments;
  const owned = commitments.find(commitment => commitment.id === id);
  if (owned && (owned.stopId !== stopId || owned.fixedNights !== intent.requestedNights || owned.date || owned.commitmentType)) return false;
  const linkedRequests = commitments.filter(commitment => commitment.stopId === stopId && commitment.fixedNights !== undefined
    && !commitment.date && !commitment.commitmentType);
  if (linkedRequests.some(commitment => commitment.fixedNights !== intent.requestedNights)) return false;
  if (!owned && !linkedRequests.length) commitments.push({ id, label: `${place.name} — ${intent.requestedNights} nights`, stopId,
    fixedNights: intent.requestedNights, place: { name: place.name, canonicalPlaceId: place.canonicalPlaceId, country: place.country, coordinates: place.coordinates } });
  const bound = { ...destinations[0]!, id: stopId, name: place.name, canonicalPlaceId: place.canonicalPlaceId,
    resolutionStatus: "resolved" as const, placeType: mentions[0]!.placeType, parentCountries: place.country ? [place.country] : destinations[0]!.parentCountries };
  brief.destinations = brief.destinations.map(destination => destination.placeMentionId === intent.id ? bound : destination);
  brief.mustVisit = brief.mustVisit.map(destination => destination.placeMentionId === intent.id ? { ...destination, ...bound } : destination);
  trip.brief.structuredBrief = mergeStructuredTripBrief(brief, { fixedCommitments: commitments });
  return true;
}
function validDate(value: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function validPlace(place: JourneyEndpointPlace, role: 'stop' | 'endpoint' = 'stop') {
  if (!place || !nonempty(place.name)) return false;
  if ([place.canonicalPlaceId, place.country, place.providerId].some(value => value !== undefined && !nonempty(value))) return false;
  // Preserve legacy/future drafts; reject an incoming record claiming known but incompatible evidence.
  if (place.geographicBinding?.version === 1 && !geographicallyReady(place, role)) return false;
  return place.coordinates === undefined
    ? Boolean(place.canonicalPlaceId || place.providerId)
    : Array.isArray(place.coordinates) && place.coordinates.length === 2 && journeyEndpointIdentityIsCoherent(place);
}
function selectedPlace(place: JourneyEndpointPlace): JourneyEndpointPlace {
  return Object.fromEntries(Object.entries(canonicalJourneyEndpointPlace(place)).filter(([, value]) => value !== undefined)) as JourneyEndpointPlace;
}
function sameVerifiedPlace(left: JourneyEndpointPlace, right: JourneyEndpointPlace) {
  return Boolean(left.canonicalPlaceId && right.canonicalPlaceId ? left.canonicalPlaceId === right.canonicalPlaceId
    : left.providerId && right.providerId && left.providerId === right.providerId);
}
function selectedPlaceForExisting(before: JourneyEndpointPlace | null, place: JourneyEndpointPlace) {
  if (!before || !sameVerifiedPlace(before, place)) return selectedPlace(place);
  const merged={ ...before, ...Object.fromEntries(Object.entries(place).filter(([, value]) => value !== undefined)) };
  if(place.geographicBinding===undefined&&geographicInputKey(merged)!==geographicInputKey(before))delete merged.geographicBinding;
  return selectedPlace(merged);
}
function placeEvidence(place: { name: string; canonicalPlaceId?: string; providerId?: string; country?: string; coordinates?: readonly number[] | null; geographicBinding?:JourneyEndpointPlace['geographicBinding'] } | null, includeBinding=true) {
  if (!place) return null;
  return { canonicalPlaceId: place.canonicalPlaceId ?? null, providerId: place.providerId ?? null, coordinates: place.coordinates ?? null,
    ...(includeBinding?geographicDependency({...place,coordinates:place.coordinates as [number,number]|undefined}):{}),
    ...(!place.canonicalPlaceId && !place.providerId ? { name: place.name, country: place.country } : {}) };
}
function schedulePlaceIdentity(place: JourneyEndpointPlace | null) {
  if (!place) return null;
  return place.canonicalPlaceId ? { canonicalPlaceId: place.canonicalPlaceId }
    : place.providerId ? { providerId: place.providerId } : { name: place.name, country: place.country };
}
function placeForStop(stop: TripStop): JourneyEndpointPlace {
  return { name: stop.name, country: stop.country, canonicalPlaceId: stop.canonicalPlaceId, providerId: stop.providerId,
    ...(stop.geographicBinding===undefined?{}:{geographicBinding:stop.geographicBinding}),
    ...(Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude) ? { coordinates: [stop.longitude!, stop.latitude!] } : {}) };
}
function setStopPlace(stop: TripStop, place: JourneyEndpointPlace): TripStop {
  place = selectedPlaceForExisting(placeForStop(stop), place);
  const { canonicalPlaceId: _id, providerId: _provider, geographicBinding:_binding, ...rest } = stop;
  return { ...rest, name: place.name, country: place.country ?? "", canonicalPlaceId: place.canonicalPlaceId,
    providerId: place.providerId, ...(place.geographicBinding===undefined?{}:{geographicBinding:place.geographicBinding}), latitude: place.coordinates?.[1] ?? null, longitude: place.coordinates?.[0] ?? null };
}
function insertStop(trip: CanonicalEasyTTrip, stop: TripStop, beforeStopId?: string) {
  const index = beforeStopId === undefined ? trip.stops.length : trip.stops.findIndex(item => item.id === beforeStopId);
  if (index < 0 || trip.stops.some(item => item.id === stop.id)) return false;
  trip.stops.splice(index, 0, stop);
  trip.stops.forEach((item, order) => { item.order = order; });
  return true;
}
export function builderStructuralSnapshot(trip: CanonicalEasyTTrip): BuilderStructuralSnapshot {
  return structuredClone({ id: trip.id, ownerId: trip.ownerId, stops: trip.stops, startDate: trip.startDate, endDate: trip.endDate,
    calendar: captureBuilderCalendarSnapshot(trip),
    route: trip.brief.intent.route, nightAllocations: trip.brief.nightAllocations, nightAllocation: trip.brief.nightAllocation, dayAllocations: trip.brief.dayAllocations,
    manualNightStopIds: trip.brief.manualNightStopIds, selectedPlaces: trip.brief.selectedPlaces,
    scheduleLocks: trip.brief.scheduleLocks, hardConstraints: trip.brief.intent.hardConstraints, timing: trip.brief.intent.timing,
    ...(trip.brief.structuredBrief ? { structuredRouting: { destinations: trip.brief.structuredBrief.destinations,
      mustVisit: trip.brief.structuredBrief.mustVisit, placeSelections: trip.brief.structuredBrief.placeSelections,
      placeMentions: trip.brief.structuredBrief.placeMentions, placeIssues: trip.brief.structuredBrief.placeIssues,
      completedPlanningAreaMentionIds: trip.brief.structuredBrief.completedPlanningAreaMentionIds,
      removedPlaceMentionIds: trip.brief.structuredBrief.removedPlaceMentionIds, countryDiscoveryChoices: trip.brief.structuredBrief.countryDiscoveryChoices,
      discoveryDraftByMentionId: trip.brief.structuredBrief.discoveryDraftByMentionId } } : {}) });
}

function dependencies(before: CanonicalEasyTTrip, after: CanonicalEasyTTrip, edit: BuilderAcceptedEdit): RouteReconciliationScope {
  const scope: RouteReconciliationScope = { legIds: [], scheduleStopIds: [], recommendationStopIds: [], endpointChanged: false, routeAssessment: false };
  const oldRoute = before.brief.intent.route;
  const route = after.brief.intent.route;
  const endpointDependency = (r: RouteIntent, includeBinding=true) => [placeEvidence(r.origin,includeBinding), r.tripType,
    r.journeyEnd.mode === "explicit" ? { mode: "explicit", place: placeEvidence(r.journeyEnd.place,includeBinding) } : r.journeyEnd];
  scope.endpointChanged = JSON.stringify(endpointDependency(oldRoute)) !== JSON.stringify(endpointDependency(route));
  const endpointScheduleIdentity = (r: RouteIntent) => [schedulePlaceIdentity(r.origin), r.tripType,
    r.journeyEnd.mode === 'explicit' ? { mode: 'explicit', place: schedulePlaceIdentity(r.journeyEnd.place) } : r.journeyEnd];
  const endpointInputChanged=JSON.stringify(endpointScheduleIdentity(oldRoute))!==JSON.stringify(endpointScheduleIdentity(route));
  const changed = new Set<string>();
  const scheduleChanged = new Set<string>();
  for (const stop of [...before.stops, ...after.stops]) {
    const prior = before.stops.find(item => item.id === stop.id);
    const next = after.stops.find(item => item.id === stop.id);
    if (!prior || !next || prior.order !== next.order || prior.nights !== next.nights
      || JSON.stringify(placeEvidence(placeForStop(prior))) !== JSON.stringify(placeEvidence(placeForStop(next)))) changed.add(stop.id);
    if (!prior || !next || prior.order !== next.order || prior.nights !== next.nights
      || JSON.stringify(schedulePlaceIdentity(placeForStop(prior))) !== JSON.stringify(schedulePlaceIdentity(placeForStop(next)))) scheduleChanged.add(stop.id);
  }
  const dates = before.startDate !== after.startDate || before.endDate !== after.endDate
    || JSON.stringify([before.brief.scheduleLocks, before.brief.intent.hardConstraints.fixedCommitments, before.brief.intent.timing.flexibility])
      !== JSON.stringify([after.brief.scheduleLocks, after.brief.intent.hardConstraints.fixedCommitments, after.brief.intent.timing.flexibility]);
  const transportPreferences = JSON.stringify([before.brief.intent.preferences.transportModes, before.brief.intent.hardConstraints.avoidDriving])
    !== JSON.stringify([after.brief.intent.preferences.transportModes, after.brief.intent.hardConstraints.avoidDriving]);
  const recommendations = before.travellers !== after.travellers || before.brief.budgetBand !== after.brief.budgetBand
    || JSON.stringify(before.brief.intent.preferences) !== JSON.stringify(after.brief.intent.preferences);
  const intents = (r: RouteIntent) => r.destinations.map(intent => ({ id: intent.id, kind: intent.kind,
    selectedPlace: placeEvidence(intent.selectedPlace), resolution: intent.resolution, requestedNights: intent.requestedNights,
    routeMembership: intent.routeMembership, stopIds: intent.stopIds,
    ...(!intent.selectedPlace?.canonicalPlaceId && !intent.selectedPlace?.providerId ? { sourceText: intent.sourceText } : {}) }));
  const intentChanged = JSON.stringify(intents(oldRoute)) !== JSON.stringify(intents(route));
  if (changed.size || dates || scope.endpointChanged || transportPreferences || edit.kind === "transport") {
    scope.routeAssessment = true;
    const indices = [...before.stops, ...after.stops].filter(stop => scheduleChanged.has(stop.id)).map(stop => stop.order);
    const first = dates || endpointInputChanged || transportPreferences ? 0 : Math.min(...indices);
    scope.scheduleStopIds = after.stops.filter(stop => stop.order >= first).map(stop => stop.id);
    if (edit.kind === "transport") {
      const leg = before.legs.find(item => item.id === edit.legId)!;
      scope.legIds = [leg.id];
      const toIndex = after.stops.findIndex(stop => stop.id === leg.toStopId);
      scope.scheduleStopIds = after.stops.slice(Math.max(0, toIndex)).map(stop => stop.id);
    } else {
      // Reuse the existing canonical graph builder for pair/evidence comparison only.
      const graph = (trip: CanonicalEasyTTrip) => buildCanonicalTripLegs({ tripId: trip.id,
        origin: { ...(trip.brief.intent.route.origin ?? { name: "" }), coordinates: trip.brief.intent.route.origin?.coordinates ?? null },
        journeyEnd: trip.brief.intent.route.journeyEnd, stops: trip.stops }).map(leg => {
          const existing = trip.legs.find(item => item.fromStopId === leg.fromStopId && item.toStopId === leg.toStopId);
          return existing ? { ...leg, id: existing.id } : leg;
        });
      const previous = graph(before), next = graph(after);
      const identity = (leg: typeof previous[number]) => JSON.stringify([leg.fromStopId, leg.toStopId,
        placeEvidence(leg.fromEndpoint ?? null), placeEvidence(leg.toEndpoint ?? null)]);
      scope.legIds = [...previous, ...next].filter(leg => {
        const other = (previous.includes(leg) ? next : previous).find(item => identity(item) === identity(leg));
        return !other || dates || transportPreferences || (edit.kind === "nights" && (scope.scheduleStopIds.includes(leg.fromStopId) || scope.scheduleStopIds.includes(leg.toStopId)));
      }).map(leg => leg.id);
    }
  }
  scope.routeAssessment ||= intentChanged;
  scope.recommendationStopIds = recommendations || dates ? after.stops.map(stop => stop.id)
    : [...changed, ...(edit.kind === "nights" || edit.kind === "transport" ? scope.scheduleStopIds : [])];
  if (edit.kind === "picks") scope.recommendationStopIds.push(edit.stopId);
  if (edit.kind === "planning-selection" && edit.selection.routeStopId) scope.recommendationStopIds.push(edit.selection.routeStopId);
  for (const key of ["legIds", "scheduleStopIds", "recommendationStopIds"] as const) scope[key] = [...new Set(scope[key])].sort();
  return scope;
}

/** Intermediate canonical input candidate. Task 2's valid-child prefix MUST precede persistence. */
export function prepareAcceptedBuilderEdit(current: CanonicalEasyTTrip, edit: BuilderAcceptedEdit, expectedFingerprint: string): BuilderAcceptedEditResult {
  const reject = (reason: Rejection): BuilderAcceptedEditResult => ({ ok: false, reason });
  if (builderDocumentFingerprint(current) !== expectedFingerprint) return reject("stale-source");
  if (current.schemaVersion !== 2 || readTripDocument(current).kind !== "readable") return reject("invalid-input");
  let trip = structuredClone(current);
  let route = trip.brief.intent.route;
  let releasedNights = 0;
  let retainedConsumption: RetainedContentConsumption | undefined;
  try {
    switch (edit.kind) {
      case "origin": {
        if (edit.place !== null && !validPlace(edit.place, 'endpoint')) return reject("invalid-input");
        route.origin = edit.place === null ? null : selectedPlaceForExisting(route.origin, edit.place);
        break;
      }
      case "type": {
        if (!["return_to_start", "one_way"].includes(edit.tripType)) return reject("invalid-input");
        if (edit.tripType === "return_to_start" && route.journeyEnd.mode === "explicit" && edit.acceptEndpointReplacement !== true) return reject("endpoint-conflict");
        route.tripType = edit.tripType;
        if (edit.tripType === "return_to_start") route.journeyEnd = { mode: "same_as_start" };
        else if (route.journeyEnd.mode === "same_as_start" || edit.acceptEndpointReplacement === true) route.journeyEnd = { mode: "unknown" };
        break;
      }
      case "legacy-end": {
        // Compatibility editing owns only a finish already present in a legacy document.
        if (route.journeyEnd.mode !== "explicit") return reject("endpoint-conflict");
        if (!validPlace(edit.place, 'endpoint')) return reject("invalid-input");
        route.journeyEnd = { mode: "explicit", place: selectedPlaceForExisting(route.journeyEnd.place, edit.place) };
        break;
      }
      case "budget": {
        if (!budgets.has(edit.budget)) return reject("invalid-input");
        trip.brief.budgetBand = edit.budget;
        trip.brief.budgetPreference = { source: "explicit", value: edit.budget };
        trip.brief.intent.preferences.budgetSensitivity = edit.budget;
        break;
      }
      case "travellers": {
        if (!Number.isInteger(edit.travellers) || edit.travellers < 1 || edit.travellers > 12) return reject("invalid-input");
        trip.travellers = trip.brief.intent.travellers = edit.travellers;
        break;
      }
      case "dates": {
        if (!validDate(edit.startDate) || !validDate(edit.endDate) || edit.startDate > edit.endDate) return reject("invalid-input");
        trip.startDate = edit.startDate; trip.endDate = edit.endDate;
        trip.brief.intent.timing = { flexibility: "fixed", durationDays: Math.round((Date.parse(edit.endDate) - Date.parse(edit.startDate)) / 86_400_000) + 1 };
        trip.brief.endDateIsSuggestion = false;
        if (trip.brief.structuredBrief) trip.brief.structuredBrief = mergeStructuredTripBrief(trip.brief.structuredBrief, {
          duration: { value: trip.brief.intent.timing.durationDays, unit: 'days', precision: 'exact' },
          dates: { start: trip.startDate, end: trip.endDate, fixed: true },
        });
        break;
      }
      case "preferences": {
        const p = edit.preferences;
        if (!p || Object.keys(p).some(key => !Object.hasOwn(trip.brief.intent.preferences, key))) return reject("invalid-input");
        if (p.budgetSensitivity !== undefined && !budgets.has(p.budgetSensitivity)
          || p.pace !== undefined && !["relaxed", "balanced", "packed"].includes(p.pace)
          || p.transportModes !== undefined && (!Array.isArray(p.transportModes) || p.transportModes.some(mode => !["flight", "train", "drive"].includes(mode)))
          || p.interests !== undefined && (!Array.isArray(p.interests) || p.interests.some(interest => !tripInterestIds.includes(interest)))
          || p.dislikes !== undefined && (!Array.isArray(p.dislikes) || p.dislikes.some(value => typeof value !== "string"))
          || edit.avoidDriving !== undefined && typeof edit.avoidDriving !== "boolean") return reject("invalid-input");
        trip.brief.intent.preferences = { ...trip.brief.intent.preferences, ...structuredClone(p) };
        if (p.budgetSensitivity !== undefined) { trip.brief.budgetBand = p.budgetSensitivity; trip.brief.budgetPreference = { source: "explicit", value: p.budgetSensitivity }; }
        if (p.pace !== undefined) trip.brief.pace = p.pace === "packed" ? "full" : "slow";
        if (edit.avoidDriving !== undefined) trip.brief.intent.hardConstraints.avoidDriving = edit.avoidDriving;
        break;
      }
      case "constraints": {
        const c = edit.constraints;
        if (!c || Object.keys(c).some(key => !["optionalStopIds", "fixedCommitments", "avoidDriving"].includes(key))) return reject("invalid-input");
        if (c.avoidDriving !== undefined && typeof c.avoidDriving !== "boolean"
          || c.optionalStopIds !== undefined && (!Array.isArray(c.optionalStopIds) || new Set(c.optionalStopIds).size !== c.optionalStopIds.length
            || c.optionalStopIds.some(id => !trip.stops.some(stop => stop.id === id)))
          || c.fixedCommitments !== undefined && (!Array.isArray(c.fixedCommitments) || new Set(c.fixedCommitments.map(item => item.id)).size !== c.fixedCommitments.length
            || c.fixedCommitments.some(item => !nonempty(item.id) || !nonempty(item.label) || item.date !== undefined && !validDate(item.date)
              || item.stopId !== undefined && !trip.stops.some(stop => stop.id === item.stopId)
              || item.fixedNights !== undefined && !integer(item.fixedNights)))) return reject("invalid-input");
        trip.brief.intent.hardConstraints = { ...trip.brief.intent.hardConstraints, ...structuredClone(c) };
        if(trip.brief.structuredBrief && c.fixedCommitments)trip.brief.structuredBrief=mergeStructuredTripBrief(trip.brief.structuredBrief,{fixedCommitments:c.fixedCommitments});
        if (c.optionalStopIds) {
          trip.brief.intent.hardConstraints.mustSeeStopIds = trip.stops.filter(stop => !c.optionalStopIds!.includes(stop.id)).map(stop => stop.id);
          route.destinations = route.destinations.map(intent => intent.stopIds.length ? { ...intent,
            routeMembership: intent.stopIds.every(id => c.optionalStopIds!.includes(id)) ? "optional" : "required" } : intent);
        }
        break;
      }
      case "timing-flexibility": {
        if (!["fixed", "flexible"].includes(edit.flexibility)) return reject("invalid-input");
        trip.brief.intent.timing.flexibility = edit.flexibility;
        break;
      }
      case "schedule-locks": {
        const l = edit.locks;
        if (!l || !Array.isArray(l.stopIds) || new Set(l.stopIds).size !== l.stopIds.length || !l.arrivalDates
          || l.stopIds.some(id => !trip.stops.some(stop => stop.id === id))
          || Object.entries(l.arrivalDates).some(([id, date]) => !trip.stops.some(stop => stop.id === id) || !validDate(date))) return reject("binding-conflict");
        trip.brief.scheduleLocks = structuredClone(l);
        break;
      }
      case "picks": {
        if (!trip.stops.some(stop => stop.id === edit.stopId) || !Array.isArray(edit.titles) || edit.titles.some(title => !nonempty(title))) return reject("binding-conflict");
        trip.brief.selectedPlaces = { ...trip.brief.selectedPlaces, [edit.stopId]: structuredClone(edit.titles) };
        break;
      }
      case "discovery-state": {
        const brief=trip.brief.structuredBrief;
        if(!brief?.placeMentions?.some(mention=>mention.mentionId===edit.mentionId)
          || readDiscoveryDraft(brief,edit.mentionId).status==="unsupported-version"
          || edit.draft && (edit.draft.version!==DISCOVERY_DRAFT_VERSION || !Array.isArray(edit.draft.shortlistIds))
          || edit.choiceIds && (!Array.isArray(edit.choiceIds) || edit.choiceIds.some(id=>!nonempty(id)))) return reject("binding-conflict");
        if(edit.draft)brief.discoveryDraftByMentionId={...brief.discoveryDraftByMentionId,[edit.mentionId]:structuredClone(edit.draft)};
        if(edit.choiceIds)brief.countryDiscoveryChoices={...brief.countryDiscoveryChoices,[edit.mentionId]:[...new Set(edit.choiceIds)]};
        break;
      }
      case "planning-context": {
        const eligible=new Set(eligibleCountryContextIntentIds(trip)),ids=edit.mentionIds;
        if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!eligible.has(id)))return reject("binding-conflict");
        const removed=new Set(ids),brief=trip.brief.structuredBrief!;
        route.destinations=route.destinations.filter(intent=>!removed.has(intent.id));
        if(route.explicitIntentIds)route.explicitIntentIds=route.explicitIntentIds.filter(id=>!removed.has(id));
        brief.destinations=brief.destinations.filter(d=>!d.placeMentionId||!removed.has(d.placeMentionId));
        brief.mustVisit=brief.mustVisit.filter(d=>!d.placeMentionId||!removed.has(d.placeMentionId));
        brief.placeIssues=brief.placeIssues?.filter(issue=>!removed.has(issue.mentionId));
        break;
      }
      case "planning-mention": {
        const brief=trip.brief.structuredBrief, mention=edit.mention;
        if (!brief || !mention || !nonempty(mention.mentionId)) return reject("binding-conflict");
        const prior=brief.placeMentions?.find(item=>item.mentionId===mention.mentionId);
        if(edit.action === "cancel") {
          if(!prior || JSON.stringify(prior)!==JSON.stringify(mention) || brief.placeSelections?.some(s=>s.mentionId===mention.mentionId)
            || route.destinations.some(intent=>intent.id===mention.mentionId && intent.stopIds.length)) return reject("binding-conflict");
          brief.placeMentions=brief.placeMentions!.filter(item=>item.mentionId!==mention.mentionId);
        } else if(edit.action === "add") {
          if(prior && JSON.stringify(prior)!==JSON.stringify(mention)) return reject("binding-conflict");
          brief.placeMentions=prior?brief.placeMentions:[...(brief.placeMentions??[]),structuredClone(mention)];
        } else if(edit.action === "replace") {
          if(!prior || JSON.stringify(prior)!==JSON.stringify(edit.expectedMention)
            || mention.mentionId!==edit.expectedMention.mentionId) return reject("binding-conflict");
          brief.placeMentions=brief.placeMentions!.map(item=>item.mentionId===mention.mentionId?structuredClone(mention):item);
        } else return reject("invalid-input");
        brief.placeIssues=placeResolutionIssuesForMentions(brief.placeMentions??[]);
        brief.removedPlaceMentionIds=brief.removedPlaceMentionIds?.filter(id=>id!==mention.mentionId);
        break;
      }
      case "planning-area": {
        const brief=trip.brief.structuredBrief;
        if(!brief?.placeMentions?.some(mention=>mention.mentionId===edit.mentionId)) return reject("binding-conflict");
        const selections=brief.placeSelections??[], completed=brief.completedPlanningAreaMentionIds??[];
        if(edit.action === "complete") {
          if(!selections.some(s=>s.mentionId===edit.mentionId && trip.stops.some(stop=>stop.id===s.routeStopId))) return reject("binding-conflict");
          brief.completedPlanningAreaMentionIds=[...new Set([...completed,edit.mentionId])];
        } else if(edit.action === "reopen" || edit.action === "remove") {
          brief.completedPlanningAreaMentionIds=completed.filter(id=>id!==edit.mentionId);
          if(edit.action === "remove") {
            if(route.destinations.some(intent=>intent.id===edit.mentionId && intent.stopIds.length)) return reject("binding-conflict");
            brief.placeSelections=selections.filter(s=>s.mentionId!==edit.mentionId);
            brief.removedPlaceMentionIds=[...new Set([...(brief.removedPlaceMentionIds??[]),edit.mentionId])];
          }
        } else return reject("invalid-input");
        break;
      }
      case "planning-selection": {
        const s = edit.selection;
        const stop = trip.stops.find(stop => stop.id === s?.routeStopId);
        const mention = trip.brief.structuredBrief?.placeMentions?.find(mention => mention.mentionId === s?.mentionId);
        const intent = route.destinations.find(intent => intent.id === s?.mentionId);
        const prior = trip.brief.structuredBrief?.placeSelections?.some(selection => selection.mentionId === s?.mentionId);
        const originSelection = !s?.routeStopId && (mention?.role === "origin" || mention?.role === "fixed_start") && s?.kind === "base"
          && route.origin?.canonicalPlaceId === s.selectedCanonicalPlaceId;
        if (!s || (!stop && !originSelection) || !["base", "ambiguity", "visit"].includes(s.kind) || !nonempty(s.selectedCanonicalPlaceId) || !nonempty(s.selectedName)
          || !s.provenance || (!mention && !intent && !prior)
          || s.kind === "visit" && mention?.routability !== "anchor_or_poi"
          || s.kind !== "visit" && !originSelection && stop!.canonicalPlaceId !== s.selectedCanonicalPlaceId) return reject("binding-conflict");
        const brief = trip.brief.structuredBrief ?? structuredTripBriefFromSavedSelections({
          destinations: trip.stops.map(stop => ({ id: stop.id, name: stop.name, canonicalPlaceId: stop.canonicalPlaceId, role: "preferred", priority: "normal" })),
          travellers: trip.travellers, dates: { start: trip.startDate, end: trip.endDate, fixed: trip.brief.intent.timing.flexibility === "fixed" },
          pace: trip.brief.intent.preferences.pace, interests: trip.brief.intent.preferences.interests,
          transportPreferences: trip.brief.intent.preferences.transportModes, budget: trip.brief.budgetBand, avoidDriving: trip.brief.intent.hardConstraints.avoidDriving,
        });
        const multiple = mention && placeMentionSupportsMultipleSelections(mention);
        brief.placeSelections = [structuredClone(s), ...(brief.placeSelections ?? []).filter(selection => selection.mentionId !== s.mentionId
          || multiple && selection.routeStopId !== s.routeStopId && selection.selectedCanonicalPlaceId !== s.selectedCanonicalPlaceId)];
        if (s.kind !== "visit") brief.countryDiscoveryChoices = { ...brief.countryDiscoveryChoices,
          [s.mentionId]: [...new Set([...(brief.countryDiscoveryChoices?.[s.mentionId] ?? []), s.selectedCanonicalPlaceId])] };
        brief.removedPlaceMentionIds = brief.removedPlaceMentionIds?.filter(id => id !== s.mentionId);
        trip.brief.structuredBrief = brief;
        break;
      }
      case "build-status": {
        if (trip.status === "archived") return reject("binding-conflict");
        trip.status = "planned";
        break;
      }
      case "nights": {
        if (!integer(edit.nights)) return reject("invalid-input");
        const intent = route.destinations.find(item => item.id === edit.intentId);
        const stop = trip.stops.find(item => item.id === edit.stopId);
        if (!intent?.stopIds.includes(edit.stopId) || !stop) return reject("binding-conflict");
        stop.nights = edit.nights;
        if (intent.kind === "overnight_place") intent.requestedNights = edit.nights;
        trip.brief.nightAllocations = { ...trip.brief.nightAllocations, [stop.id]: edit.nights };
        trip.brief.manualNightStopIds = [...new Set([...(trip.brief.manualNightStopIds ?? []), stop.id])];
        // A stay request is editable; a dated/booking commitment retains its original protection.
        trip.brief.intent.hardConstraints.fixedCommitments = trip.brief.intent.hardConstraints.fixedCommitments.map(item => item.stopId === stop.id && !item.date && item.commitmentType !== 'booking'
          ? { ...item, fixedNights: edit.nights } : item);
        if (trip.brief.structuredBrief) trip.brief.structuredBrief.hardConstraints = trip.brief.structuredBrief.hardConstraints.map(item => item.type === 'fixed-commitment'
          && item.stopId === stop.id && !item.date && item.commitmentType !== 'booking' ? { ...item, fixedNights: edit.nights,
            provenance: { ...item.provenance, source: 'builder', kind: 'explicit', confidence: 'high' } } : item);
        break;
      }
      case "add-destination": {
        if (!edit.intent || !nonempty(edit.intent.id) || route.destinations.some(item => item.id === edit.intent.id)) return reject("binding-conflict");
        const intent = structuredClone(edit.intent);
        if (intent.stopIds.length) {
          if (!edit.stop || intent.stopIds.length !== 1 || intent.stopIds[0] !== edit.stop.id
            || !intent.selectedPlace || !validPlace(intent.selectedPlace)
            || !insertStop(trip, setStopPlace(structuredClone(edit.stop), intent.selectedPlace), edit.beforeStopId)) return reject("binding-conflict");
          if (intent.requestedNights !== null && intent.kind === "overnight_place") trip.stops.find(stop => stop.id === edit.stop!.id)!.nights = intent.requestedNights;
        } else if (edit.stop) return reject("binding-conflict");
        route.destinations.push(intent);
        // Adding an unordered intent is not evidence of an explicit source sequence.
        break;
      }
      case "remove-destination": {
        const intent = route.destinations.find(item => item.id === edit.intentId);
        if (!intent) return reject("binding-conflict");
        if (edit.stopId !== undefined && !intent.stopIds.includes(edit.stopId)) return reject("binding-conflict");
        const removed = new Set(edit.stopId === undefined ? intent.stopIds : [edit.stopId]);
        const remaining = intent.stopIds.filter(id => !removed.has(id));
        const allocated = trip.stops.filter(stop => removed.has(stop.id)).reduce((sum, stop) => sum + (stop.nights ?? 0), 0);
        releasedNights = remaining.length ? allocated : Math.max(allocated, intent.requestedNights ?? 0);
        trip.stops = trip.stops.filter(stop => !removed.has(stop.id)).map((stop, order) => ({ ...stop, order }));
        route.destinations = remaining.length ? route.destinations.map(item => item.id === intent.id ? { ...item, stopIds: remaining } : item)
          : route.destinations.filter(item => item.id !== intent.id);
        if (route.explicitIntentIds && !remaining.length) route.explicitIntentIds = route.explicitIntentIds.filter(id => id !== intent.id);
        for (const key of ["nightAllocations", "dayAllocations", "selectedPlaces"] as const) {
          const values = trip.brief[key];
          if (values) for (const id of removed) delete values[id];
        }
        trip.brief.manualNightStopIds = trip.brief.manualNightStopIds?.filter(id => !removed.has(id));
        trip.brief.intent.hardConstraints.mustSeeStopIds = trip.brief.intent.hardConstraints.mustSeeStopIds.filter(id => !removed.has(id));
        trip.brief.intent.hardConstraints.optionalStopIds = trip.brief.intent.hardConstraints.optionalStopIds.filter(id => !removed.has(id));
        trip.brief.intent.hardConstraints.fixedCommitments = trip.brief.intent.hardConstraints.fixedCommitments.filter(item => !item.stopId || !removed.has(item.stopId) || item.date || item.commitmentType === 'booking');
        const structured = trip.brief.structuredBrief;
        if (structured) {
          structured.hardConstraints = structured.hardConstraints.filter(item => item.type !== 'fixed-commitment' || !item.stopId || !removed.has(item.stopId) || item.date || item.commitmentType === 'booking');
          const removedSelections = structured.placeSelections?.filter(selection => selection.routeStopId && removed.has(selection.routeStopId)) ?? [];
          structured.placeSelections = structured.placeSelections?.filter(selection => !selection.routeStopId || !removed.has(selection.routeStopId));
          structured.destinations = structured.destinations.filter(destination => !destination.id || !removed.has(destination.id));
          structured.mustVisit = structured.mustVisit.filter(destination => !destination.id || !removed.has(destination.id));
          if (!remaining.length && structured.placeMentions?.some(mention => mention.mentionId === intent.id)) {
            structured.removedPlaceMentionIds = [...new Set([...(structured.removedPlaceMentionIds ?? []), intent.id])];
          }
          for (const selection of removedSelections) {
            const choices = structured.countryDiscoveryChoices?.[selection.mentionId];
            if (choices) structured.countryDiscoveryChoices = { ...structured.countryDiscoveryChoices,
              [selection.mentionId]: choices.filter(id => id !== selection.selectedCanonicalPlaceId) };
          }
        }
        break;
      }
      case "replace-destination":
      case "resolve-destination": {
        const intent = route.destinations.find(item => item.id === edit.intentId);
        if (!intent || !nonempty(edit.stopId) || !validPlace(edit.place)) return reject("binding-conflict");
        const existing = trip.stops.find(item => item.id === edit.stopId);
        if (existing && !intent.stopIds.includes(existing.id) || edit.stop && edit.stop.id !== edit.stopId) return reject("binding-conflict");
        if (!existing && intent.kind === "overnight_place" && intent.stopIds.length) return reject("binding-conflict");
        const place = selectedPlaceForExisting(intent.kind === "overnight_place" ? intent.selectedPlace : null, edit.place);
        if (existing) trip.stops = trip.stops.map(stop => stop.id === existing.id ? setStopPlace(stop, place) : stop);
        else {
          const allocatedNights = edit.stop?.nights ?? null;
          if (allocatedNights !== null && !integer(allocatedNights)) return reject("invalid-input");
          const stop: TripStop = setStopPlace({ id: edit.stopId, order: trip.stops.length, name: place.name, country: place.country ?? "", latitude: null, longitude: null,
            arrivalDate: null, departureDate: null, nights: intent.kind === "overnight_place" ? intent.requestedNights ?? allocatedNights : allocatedNights }, place);
          let beforeStopId = edit.beforeStopId;
          if (beforeStopId === undefined && route.orderAuthority === "explicit" && route.explicitIntentIds?.includes(intent.id)) {
            const later = route.explicitIntentIds.slice(route.explicitIntentIds.indexOf(intent.id) + 1);
            beforeStopId = later.flatMap(id => route.destinations.find(item => item.id === id)?.stopIds ?? [])[0];
          }
          if (!insertStop(trip, stop, beforeStopId)) return reject("binding-conflict");
          intent.stopIds.push(stop.id);
        }
        if (intent.kind === "overnight_place") intent.selectedPlace = place;
        intent.resolution = "resolved";
        if (edit.bindSourceNights !== undefined && typeof edit.bindSourceNights !== "boolean") return reject("invalid-input");
        if (edit.bindSourceNights && !bindSourceNightRequest(trip, intent, edit.stopId, place)) return reject("binding-conflict");
        break;
      }
      case "order": {
        const result = validateBuilderStopOrder(trip.stops, edit.stopIds, { lockedStopIds: trip.brief.scheduleLocks?.stopIds });
        if (!result.ok) return reject("binding-conflict");
        trip.stops = result.stops.map((stop, order) => ({ ...stop, order }));
        trip.brief.intent.route = routeIntentForAcceptedBuilderOrder(route, result.ids, edit.source ?? "move-menu");
        trip.brief.decisionSelections = { ...trip.brief.decisionSelections, transportByLeg: trip.brief.decisionSelections?.transportByLeg ?? {},
          routeOrder: edit.source === "route-check" ? "recommended" : "entered" };
        route = trip.brief.intent.route;
        break;
      }
      case "transport": {
        const leg = trip.legs.find(item => item.id === edit.legId);
        if (!leg) return reject("binding-conflict");
        if (edit.identity !== null) {
          const choice = supportedTransportChoicesForLeg(trip, leg).find(item => item.identity === edit.identity);
          const from = routeEndpointForLeg(trip, leg, "from"), to = routeEndpointForLeg(trip, leg, "to");
          if (!choice || !from || !to
            || JSON.stringify(placeEvidence(choice.segments[0]!.fromEndpoint)) !== JSON.stringify(placeEvidence(from))
            || JSON.stringify(placeEvidence(choice.segments.at(-1)!.toEndpoint)) !== JSON.stringify(placeEvidence(to))) return reject("binding-conflict");
        }
        trip = (edit.identity === null ? clearTripLegTransportChoice(trip, leg.id) : selectTripLegTransportChoice(trip, leg.id, edit.identity)) as CanonicalEasyTTrip;
        route = trip.brief.intent.route;
        break;
      }
      case "retained-content-remove": case "retained-content-move": {
        const action = edit.kind === "retained-content-remove" ? removeRetainedAuthoredContent(trip,edit.selection)
          : moveRetainedAuthoredContent(trip,edit.selection,edit.target);
        if (!action.ok) return reject("binding-conflict");
        trip = action.trip as CanonicalEasyTTrip;
        retainedConsumption = action.consumption;
        route = trip.brief.intent.route;
        break;
      }
      case "structural-inverse": {
        const s = edit.snapshot;
        if (!s || s.id !== trip.id || s.ownerId !== trip.ownerId) return reject("binding-conflict");
        if (s.calendar) trip = restoreBuilderCalendarSnapshot(trip, s.calendar, s.stops) as CanonicalEasyTTrip;
        trip = restoreRetainedAuthoredContent(trip, s.stops) as CanonicalEasyTTrip;
        trip.stops = structuredClone(s.stops);
        if(edit.restoreDates) { trip.startDate=s.startDate;trip.endDate=s.endDate;trip.brief.intent.timing=structuredClone(s.timing); }
        // Structural stop/order Undo owns membership, requests and authority, not later endpoint/date edits.
        trip.brief.intent.route = { ...structuredClone(s.route), origin: route.origin, tripType: route.tripType, journeyEnd: route.journeyEnd };
        for (const key of ["nightAllocations", "nightAllocation", "dayAllocations", "manualNightStopIds", "selectedPlaces", "scheduleLocks"] as const) {
          Object.assign(trip.brief, { [key]: structuredClone(s[key]) });
        }
        trip.brief.intent.hardConstraints = { ...trip.brief.intent.hardConstraints,
          mustSeeStopIds: structuredClone(s.hardConstraints.mustSeeStopIds), optionalStopIds: structuredClone(s.hardConstraints.optionalStopIds) };
        if (s.structuredRouting && trip.brief.structuredBrief) {
          trip.brief.structuredBrief = { ...trip.brief.structuredBrief, ...structuredClone(s.structuredRouting) };
        }
        route = trip.brief.intent.route;
        break;
      }
      default: return reject("invalid-input");
    }
    const flexible = generatedFlexibleStopIds(edit.kind === 'structural-inverse' ? trip : current);
    for (const stop of trip.stops) {
      const old = current.stops.find(s => s.id === stop.id);
      const intent = route.destinations.find(i => i.stopIds.includes(stop.id));
      // Only an accepted new, unrequested stay may gain fresh generated provenance.
      if (!old && stop.nights === null && intent?.requestedNights === null
        && ['add-destination','resolve-destination','replace-destination'].includes(edit.kind)) flexible.add(stop.id);
      if (edit.kind === 'nights' && edit.stopId === stop.id) flexible.delete(stop.id);
    }
    const increases = edit.kind === 'nights' && edit.nights > (current.stops.find(s=>s.id===edit.stopId)?.nights??0);
    const addsPlanningBase = edit.kind === 'replace-destination' && trip.stops.some(stop => !current.stops.some(old => old.id === stop.id));
    if (edit.kind === 'dates' || edit.kind === 'add-destination' || edit.kind === 'resolve-destination' || addsPlanningBase || increases) allocateGeneratedBuilderNights(trip,flexible);
    route.orderedStopIds = trip.stops.map(stop => stop.id);
    if (['dates', 'nights', 'add-destination', 'remove-destination', 'resolve-destination', 'replace-destination', 'structural-inverse'].includes(edit.kind)) synchronizeAcceptedNightAllocations(trip, flexible);
    route.projectionInputKey = current.brief.intent.route.projectionInputKey;
    trip = projectCanonicalRouteEndpoints(trip);
    const checked = prepareBuilderDocumentCommit({ current, proposed: trip, expectedFingerprint, validate: () => true });
    if (!checked.ok) return reject(checked.reason === "stale-source" ? "stale-source" : "invalid-input");
    return { ok: true, trip, scope: dependencies(current, trip, edit), releasedNights, ...(retainedConsumption ? {retainedConsumption} : {}) };
  } catch { return reject("invalid-input"); }
}
