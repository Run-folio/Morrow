import { restoreRetainedAuthoredContent, moveRetainedAuthoredContent, removeRetainedAuthoredContent, type RetainedContentSelection, type RetainedContentConsumption } from "./trip-retained-authored-content.ts";
import { builderDocumentFingerprint, prepareBuilderDocumentCommit } from "./trip-builder-document-commit.ts";
import { projectCanonicalRouteEndpoints, readTripDocument } from "./trip-document.ts";
import { canonicalJourneyEndpointPlace, journeyEndpointIdentityIsCoherent } from "./journey-endpoints.ts";
import { routeIntentForAcceptedBuilderOrder, validateBuilderStopOrder } from "./trip-builder-order.ts";
import { buildCanonicalTripLegs, routeEndpointForLeg } from "./trip-legs.ts";
import { clearTripLegTransportChoice, selectTripLegTransportChoice, supportedTransportChoicesForLeg } from "./transport-mode-choice.ts";
import { tripInterestIds } from "./trip-interest.ts";
import type { BudgetBand, CanonicalEasyTTrip, DestinationIntent, JourneyEndpointPlace, RouteIntent, TripStop, TripIntent } from "./trip.ts";

import type { RouteReconciliationScope } from "./trip.ts";
export type { RouteReconciliationScope } from "./trip.ts";
export type BuilderStructuralSnapshot = Pick<CanonicalEasyTTrip, "id" | "ownerId" | "stops" | "startDate" | "endDate"> & {
  route: RouteIntent;
  nightAllocations: CanonicalEasyTTrip["brief"]["nightAllocations"];
  dayAllocations: CanonicalEasyTTrip["brief"]["dayAllocations"];
  manualNightStopIds: CanonicalEasyTTrip["brief"]["manualNightStopIds"];
  selectedPlaces: CanonicalEasyTTrip["brief"]["selectedPlaces"];
  scheduleLocks: CanonicalEasyTTrip["brief"]["scheduleLocks"];
  hardConstraints: TripIntent["hardConstraints"];
  timing: TripIntent["timing"];
};
type DestinationSelection = {
  intentId: string; stopId: string; place: JourneyEndpointPlace;
  /** An explicit/captured occurrence position, never the displayed chip position. */
  beforeStopId?: string; stop?: TripStop;
};
export type BuilderAcceptedEdit =
  | { kind: "origin"; place: JourneyEndpointPlace | null }
  | { kind: "type"; tripType: "return_to_start" | "one_way"; acceptEndpointReplacement?: boolean }
  | { kind: "add-destination"; intent: DestinationIntent; stop?: TripStop; beforeStopId?: string }
  | { kind: "remove-destination"; intentId: string }
  | ({ kind: "resolve-destination" | "replace-destination" } & DestinationSelection)
  | { kind: "nights"; stopId: string; intentId: string; nights: number }
  | { kind: "dates"; startDate: string; endDate: string }
  | { kind: "travellers"; travellers: number }
  | { kind: "budget"; budget: BudgetBand }
  | { kind: "preferences"; preferences: Partial<TripIntent["preferences"]>; avoidDriving?: boolean }
  | { kind: "order"; stopIds: string[] }
  | { kind: "transport"; legId: string; identity: string | null }
  | { kind: "structural-inverse"; snapshot: BuilderStructuralSnapshot }
  | { kind: "retained-content-remove"; selection: RetainedContentSelection }
  | { kind: "retained-content-move"; selection: RetainedContentSelection; target: {stopId:string;dayId:string} };
type Rejection = "stale-source" | "invalid-input" | "endpoint-conflict" | "binding-conflict";
export type BuilderAcceptedEditResult =
  | { ok: true; trip: CanonicalEasyTTrip; scope: RouteReconciliationScope; releasedNights: number; retainedConsumption?: RetainedContentConsumption }
  | { ok: false; reason: Rejection };

const budgets = new Set(["value", "mid", "high"]);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const nonempty = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
function validDate(value: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function validPlace(place: JourneyEndpointPlace) {
  if (!place || !nonempty(place.name)) return false;
  if ([place.canonicalPlaceId, place.country, place.providerId].some(value => value !== undefined && !nonempty(value))) return false;
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
  return selectedPlace({ ...before, ...Object.fromEntries(Object.entries(place).filter(([, value]) => value !== undefined)) });
}
function placeEvidence(place: { name: string; canonicalPlaceId?: string; providerId?: string; country?: string; coordinates?: readonly number[] | null } | null) {
  if (!place) return null;
  return { canonicalPlaceId: place.canonicalPlaceId ?? null, providerId: place.providerId ?? null, coordinates: place.coordinates ?? null,
    ...(!place.canonicalPlaceId && !place.providerId ? { name: place.name, country: place.country } : {}) };
}
function placeForStop(stop: TripStop): JourneyEndpointPlace {
  return { name: stop.name, country: stop.country, canonicalPlaceId: stop.canonicalPlaceId, providerId: stop.providerId,
    ...(Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude) ? { coordinates: [stop.longitude!, stop.latitude!] } : {}) };
}
function setStopPlace(stop: TripStop, place: JourneyEndpointPlace): TripStop {
  place = selectedPlaceForExisting(placeForStop(stop), place);
  const { canonicalPlaceId: _id, providerId: _provider, ...rest } = stop;
  return { ...rest, name: place.name, country: place.country ?? "", canonicalPlaceId: place.canonicalPlaceId,
    providerId: place.providerId, latitude: place.coordinates?.[1] ?? null, longitude: place.coordinates?.[0] ?? null };
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
    route: trip.brief.intent.route, nightAllocations: trip.brief.nightAllocations, dayAllocations: trip.brief.dayAllocations,
    manualNightStopIds: trip.brief.manualNightStopIds, selectedPlaces: trip.brief.selectedPlaces,
    scheduleLocks: trip.brief.scheduleLocks, hardConstraints: trip.brief.intent.hardConstraints, timing: trip.brief.intent.timing });
}

function dependencies(before: CanonicalEasyTTrip, after: CanonicalEasyTTrip, edit: BuilderAcceptedEdit): RouteReconciliationScope {
  const scope: RouteReconciliationScope = { legIds: [], scheduleStopIds: [], recommendationStopIds: [], endpointChanged: false, routeAssessment: false };
  const oldRoute = before.brief.intent.route;
  const route = after.brief.intent.route;
  const endpointDependency = (r: RouteIntent) => [placeEvidence(r.origin), r.tripType,
    r.journeyEnd.mode === "explicit" ? { mode: "explicit", place: placeEvidence(r.journeyEnd.place) } : r.journeyEnd];
  scope.endpointChanged = JSON.stringify(endpointDependency(oldRoute)) !== JSON.stringify(endpointDependency(route));
  const changed = new Set<string>();
  for (const stop of [...before.stops, ...after.stops]) {
    const prior = before.stops.find(item => item.id === stop.id);
    const next = after.stops.find(item => item.id === stop.id);
    if (!prior || !next || prior.order !== next.order || prior.nights !== next.nights
      || JSON.stringify(placeEvidence(placeForStop(prior))) !== JSON.stringify(placeEvidence(placeForStop(next)))) changed.add(stop.id);
  }
  const dates = before.startDate !== after.startDate || before.endDate !== after.endDate;
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
    const indices = [...before.stops, ...after.stops].filter(stop => changed.has(stop.id)).map(stop => stop.order);
    const first = dates || scope.endpointChanged || transportPreferences ? 0 : Math.min(...indices);
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
        if (edit.place !== null && !validPlace(edit.place)) return reject("invalid-input");
        route.origin = edit.place === null ? null : selectedPlaceForExisting(route.origin, edit.place);
        break;
      }
      case "type": {
        if (!["return_to_start", "one_way"].includes(edit.tripType)) return reject("invalid-input");
        if (edit.tripType === "return_to_start" && route.journeyEnd.mode === "explicit" && edit.acceptEndpointReplacement !== true) return reject("endpoint-conflict");
        route.tripType = edit.tripType;
        if (edit.tripType === "return_to_start") route.journeyEnd = { mode: "same_as_start" };
        else if (route.journeyEnd.mode === "same_as_start") route.journeyEnd = { mode: "unknown" };
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
      case "nights": {
        if (!integer(edit.nights)) return reject("invalid-input");
        const intent = route.destinations.find(item => item.id === edit.intentId);
        const stop = trip.stops.find(item => item.id === edit.stopId);
        if (!intent?.stopIds.includes(edit.stopId) || !stop) return reject("binding-conflict");
        stop.nights = edit.nights;
        if (intent.kind === "overnight_place") intent.requestedNights = edit.nights;
        trip.brief.nightAllocations = { ...trip.brief.nightAllocations, [stop.id]: edit.nights };
        trip.brief.manualNightStopIds = [...new Set([...(trip.brief.manualNightStopIds ?? []), stop.id])];
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
        const removed = new Set(intent.stopIds);
        const allocated = trip.stops.filter(stop => removed.has(stop.id)).reduce((sum, stop) => sum + (stop.nights ?? 0), 0);
        releasedNights = Math.max(allocated, intent.requestedNights ?? 0);
        trip.stops = trip.stops.filter(stop => !removed.has(stop.id)).map((stop, order) => ({ ...stop, order }));
        route.destinations = route.destinations.filter(item => item.id !== intent.id);
        if (route.explicitIntentIds) route.explicitIntentIds = route.explicitIntentIds.filter(id => id !== intent.id);
        for (const key of ["nightAllocations", "dayAllocations", "selectedPlaces"] as const) {
          const values = trip.brief[key];
          if (values) for (const id of removed) delete values[id];
        }
        trip.brief.manualNightStopIds = trip.brief.manualNightStopIds?.filter(id => !removed.has(id));
        trip.brief.intent.hardConstraints.mustSeeStopIds = trip.brief.intent.hardConstraints.mustSeeStopIds.filter(id => !removed.has(id));
        trip.brief.intent.hardConstraints.optionalStopIds = trip.brief.intent.hardConstraints.optionalStopIds.filter(id => !removed.has(id));
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
        break;
      }
      case "order": {
        const result = validateBuilderStopOrder(trip.stops, edit.stopIds, { lockedStopIds: trip.brief.scheduleLocks?.stopIds });
        if (!result.ok) return reject("binding-conflict");
        trip.stops = result.stops.map((stop, order) => ({ ...stop, order }));
        trip.brief.intent.route = routeIntentForAcceptedBuilderOrder(route, result.ids, "move-menu");
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
        trip = restoreRetainedAuthoredContent(trip, s.stops) as CanonicalEasyTTrip;
        trip.stops = structuredClone(s.stops);
        // Structural stop/order Undo owns membership, requests and authority, not later endpoint/date edits.
        trip.brief.intent.route = { ...structuredClone(s.route), origin: route.origin, tripType: route.tripType, journeyEnd: route.journeyEnd };
        for (const key of ["nightAllocations", "dayAllocations", "manualNightStopIds", "selectedPlaces", "scheduleLocks"] as const) {
          Object.assign(trip.brief, { [key]: structuredClone(s[key]) });
        }
        trip.brief.intent.hardConstraints = { ...trip.brief.intent.hardConstraints,
          mustSeeStopIds: structuredClone(s.hardConstraints.mustSeeStopIds), optionalStopIds: structuredClone(s.hardConstraints.optionalStopIds) };
        route = trip.brief.intent.route;
        break;
      }
      default: return reject("invalid-input");
    }
    route.orderedStopIds = trip.stops.map(stop => stop.id);
    route.projectionInputKey = current.brief.intent.route.projectionInputKey;
    trip = projectCanonicalRouteEndpoints(trip);
    const checked = prepareBuilderDocumentCommit({ current, proposed: trip, expectedFingerprint, validate: () => true });
    if (!checked.ok) return reject(checked.reason === "stale-source" ? "stale-source" : "invalid-input");
    return { ok: true, trip, scope: dependencies(current, trip, edit), releasedNights, ...(retainedConsumption ? {retainedConsumption} : {}) };
  } catch { return reject("invalid-input"); }
}
