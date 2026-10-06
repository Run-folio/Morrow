import { normalizeJourneyEnd, originPlaceFromBrief } from "./journey-endpoints.ts";
import type { CanonicalEasyTTrip, DestinationIntent, EasyTTrip, JourneyEndpointPlace, RouteIntent, TripStop } from "./trip.ts";
import type { TripDocumentIssue } from "./trip-document.ts";
import type { HomeTripDraft } from "./home-trip-handoff.ts";
import type { ResolvedPlaceMention } from "./place-intelligence.ts";

function orderInterpretation(prompt: string, sourceTexts: readonly string[]): "unordered" | "explicit" | "ambiguous" {
  const text = prompt.toLocaleLowerCase();
  let cursor = 0;
  const positions = sourceTexts.map(source => {
    const index = text.indexOf(source.trim().toLocaleLowerCase(), cursor);
    if (index >= 0) cursor = index + source.length;
    return { index, length: source.length };
  }).filter(position => position.index >= 0);
  const connective = /(?:->|[→⇒])|\b(?:then|followed by|next)\b/i;
  const sequenced = positions.length >= 2 && positions.slice(1).every((position, index) => connective.test(text.slice(positions[index]!.index + positions[index]!.length, position.index)));
  const numbered = positions.length >= 2 && positions.every(position => /(?:^|\n)\s*\d+[.)]\s*$/.test(text.slice(0, position.index)));
  const directOrder = positions.length === sourceTexts.length && (sequenced || numbered);
  const materialHint = /\b(?:itinerary|route)\s*:|\bin this order\b/i.test(prompt);
  if (!directOrder && !materialHint) return "unordered";
  return !directOrder || /\b(?:maybe|might|perhaps|either|not sure|in any order|other way|possibly|not necessarily|flexible order|dont care|don't care)\b/i.test(prompt) ? "ambiguous" : "explicit";
}

/** A source-bound night request survives failed geography; generated allocation is not evidence. */
function sourceRequestedNights(prompt: string, mention: ResolvedPlaceMention, allMentions: readonly ResolvedPlaceMention[], bareNightContext: boolean): number | null {
  const source = mention.sourceText;
  if (!source.trim()) return null;
  const sameSource = allMentions.filter(item => item.sourceText.toLocaleLowerCase() === source.toLocaleLowerCase()).sort((a, b) => a.order - b.order);
  const pattern = new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  const occurrences = [...prompt.matchAll(pattern)].filter(match => {
    const index = match.index!;
    const before = prompt[index - 1];
    const after = prompt[index + match[0].length];
    return !(before && /[\p{L}\p{N}]/u.test(before)) && !(after && /[\p{L}\p{N}]/u.test(after));
  });
  if (occurrences.length !== sameSource.length) return null;
  const occurrence = occurrences[sameSource.findIndex(item => item.mentionId === mention.mentionId)];
  if (!occurrence) return null;
  const suffix = prompt.slice(occurrence.index! + occurrence[0].length);
  const request = /^\s*[:—-]?\s*(\d{1,3})\s*(?:nights?\b|n\b)/i.exec(suffix)
    ?? (bareNightContext ? /^\s*[:—-]?\s*(\d{1,3})(?=\s*(?:[,;.:]|\band\b|\bthen\b|$))/i.exec(suffix) : null);
  return request ? Number(request[1]) : null;
}

/** Capture source intent before a routability filter can discard a destination. */
export function routeIntentFromHandoff(draft: HomeTripDraft, stops: readonly TripStop[]): RouteIntent {
  const mentions = draft.locationMentions ?? draft.structuredBrief?.placeMentions ?? [];
  const removed = new Set(draft.structuredBrief?.removedPlaceMentionIds ?? []);
  const sourceMentions = mentions.filter(mention => !removed.has(mention.mentionId) && mention.role !== "excluded"
    && mention.role !== "origin" && mention.role !== "fixed_start" && mention.role !== "fixed_end"
    && mention.role !== "anchor" && mention.routability !== "anchor_or_poi" && mention.placeType !== "landmark");
  const selections = draft.structuredBrief?.placeSelections ?? [];
  const stopById = new Map(stops.map(stop => [stop.id, stop]));
  const bound = new Set<string>();
  const previous = draft.routeIntent;
  const destinations: DestinationIntent[] = sourceMentions.map(mention => {
    const saved = previous?.destinations.find(intent => intent.id === mention.mentionId);
    const expectedId = Object.entries(draft.homepage?.occurrenceMentionIds ?? {}).find(([, id]) => id === mention.mentionId)?.[0]
      ?? draft.structuredBrief?.destinations.find(destination => destination.placeMentionId === mention.mentionId && destination.id && stopById.has(destination.id))?.id
      ?? `${mention.canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${mention.order}`;
    const selectionIds = selections.filter(selection => selection.mentionId === mention.mentionId && selection.kind !== "visit").flatMap(selection => selection.routeStopId ? [selection.routeStopId] : []);
    const ids = new Set([...(saved?.stopIds ?? []), ...selectionIds, expectedId]);
    const mapped = stops.filter(stop => ids.has(stop.id) && !bound.has(stop.id));
    mapped.forEach(stop => bound.add(stop.id));
    const planningArea = mention.routability === "planning_area" || mention.requiresBaseSelection
      || ["continent", "country", "macro_region", "region", "sub_region", "island", "archipelago", "natural_area", "coast", "mountain_range", "valley", "travel_corridor"].includes(mention.placeType);
    const constraints = Array.isArray(draft.structuredBrief?.hardConstraints) ? draft.structuredBrief.hardConstraints : [];
    const requested = constraints.find(constraint => {
      if (constraint.type !== "fixed-commitment" || !nonnegativeInteger(constraint.fixedNights) || constraint.provenance.kind !== "explicit") return false;
      const matching = sourceMentions.filter(item => constraint.place?.canonicalPlaceId
        ? item.canonicalPlaceId === constraint.place.canonicalPlaceId
        : constraint.place?.name?.toLocaleLowerCase() === item.canonicalName.toLocaleLowerCase());
      return matching.length === 1 && matching[0]!.mentionId === mention.mentionId;
    });
    const requestedNights = saved?.requestedNights ?? (requested?.type === "fixed-commitment" ? requested.fixedNights! : sourceRequestedNights(draft.brief ?? draft.structuredBrief?.source.rawPrompt ?? "", mention, mentions, draft.structuredBrief?.duration?.unit === "nights"));
    const selectedPlace = mention.canonicalPlaceId ? {
      name: mention.canonicalName, canonicalPlaceId: mention.canonicalPlaceId,
      ...(mention.coordinates ? { coordinates: mention.coordinates } : {}),
      ...(mention.parentCountries.length === 1 ? { country: mention.parentCountries[0] } : {}),
    } : mapped[0]?.canonicalPlaceId ? placeForRouteStop(mapped[0]) : saved?.selectedPlace ?? null;
    let resolution: DestinationIntent["resolution"] = mention.status === "ambiguous" ? "ambiguous"
      : planningArea && !mapped.length ? "needs_base"
      : mapped.length && selectedPlace ? "resolved"
      : selectedPlace ? "pending" : "unresolved";
    if (saved && saved.sourceText === mention.sourceText && !mapped.length && ["pending", "unavailable"].includes(saved.resolution)) resolution = saved.resolution;
    return { id: mention.mentionId, sourceText: mention.sourceText, kind: planningArea ? "planning_area" : "overnight_place",
      selectedPlace, resolution, requestedNights, routeMembership: mention.role === "required" ? "required" : saved?.routeMembership ?? "required",
      stopIds: mapped.map(stop => stop.id) };
  });
  // Existing/editorial stays without capture bindings still have their own occurrence intent.
  for (const stop of stops) if (!bound.has(stop.id)) destinations.push({
    id: `legacy-stop:${stop.id}`, sourceText: stop.name, kind: "overnight_place", selectedPlace: placeForRouteStop(stop),
    resolution: stop.canonicalPlaceId || Number.isFinite(stop.latitude) ? "resolved" : "unresolved",
    requestedNights: null, routeMembership: "required", stopIds: [stop.id],
  });
  const interpretation = draft.homepage?.mode === "stops" ? "unordered" : orderInterpretation(draft.brief ?? draft.structuredBrief?.source.rawPrompt ?? "", sourceMentions.map(mention => mention.sourceText));
  const authority = previous?.orderAuthority ?? (draft.sourceRouteKey ? "legacy_preserved" : interpretation === "explicit" ? "explicit" : "optimizable");
  const journeyEnd = normalizeJourneyEnd(previous?.journeyEnd ?? draft.journeyEnd);
  return { version: 1,
    origin: previous?.origin ?? (draft.origin?.trim() ? { name: draft.origin, canonicalPlaceId: draft.originCanonicalPlaceId,
      country: draft.originCountry, providerId: draft.originProviderId, coordinates: draft.originCoordinates } : null),
    tripType: previous?.tripType ?? (journeyEnd.mode === "same_as_start" ? "return_to_start" : journeyEnd.mode === "explicit" ? "one_way" : "unknown_legacy"),
    journeyEnd, destinations, orderAuthority: authority,
    explicitIntentIds: authority === "explicit" ? previous?.explicitIntentIds ?? destinations.map(intent => intent.id) : null,
    orderedStopIds: stops.map(stop => stop.id), projectionInputKey: previous?.projectionInputKey ?? null };
}

export function routeOrderReviewIssue(trip: CanonicalEasyTTrip): TripDocumentIssue | null {
  if (trip.brief.intent.route.orderAuthority !== "optimizable") return null;
  const structured = trip.brief.structuredBrief;
  if (structured?.source?.inputs?.length && structured.source.inputs.every(source => source === "builder" || source === "morrovia-default")) return null;
  const prompt = structured?.source?.rawPrompt ?? trip.brief.capturedIntent?.originalBrief ?? "";
  return orderInterpretation(prompt, trip.brief.intent.route.destinations.map(intent => intent.sourceText)) === "ambiguous" ? { code: "route_order_requires_clarification", path: "brief.intent.route.orderAuthority", severity: "blocking" } : null;
}
export type HandoffResolutionScope = { ownerId: string | null; tripId: string; inputRevision: number };
export function applyHandoffRouteResolution(input: {
  route: RouteIntent; intentId: string; expectedScope: HandoffResolutionScope; currentScope: HandoffResolutionScope;
  outcome: { status: "empty" | "timeout" | "error" | "ambiguous" | "needs_base" } | { status: "selected"; place: JourneyEndpointPlace; stopId: string };
}): RouteIntent {
  const expected = input.expectedScope;
  const current = input.currentScope;
  if (expected.ownerId !== current.ownerId || expected.tripId !== current.tripId || expected.inputRevision !== current.inputRevision) return input.route;
  const intent = input.route.destinations.find(item => item.id === input.intentId);
  if (!intent || intent.resolution === "resolved") return input.route;
  const outcome = input.outcome;
  if (outcome.status === "selected" && intent.stopIds.length && !intent.stopIds.includes(outcome.stopId)) return input.route;
  const next: DestinationIntent = outcome.status === "selected"
    ? { ...intent, selectedPlace: structuredClone(outcome.place), resolution: "resolved", stopIds: [outcome.stopId] }
    : { ...intent, resolution: outcome.status === "empty" ? "unresolved" : outcome.status === "timeout" || outcome.status === "error" ? "unavailable" : outcome.status };
  return { ...input.route, destinations: input.route.destinations.map(item => item.id === input.intentId ? next : item) };
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function placeForRouteStop(stop: TripStop): JourneyEndpointPlace {
  return {
    name: stop.name,
    ...(stop.canonicalPlaceId ? { canonicalPlaceId: stop.canonicalPlaceId } : {}),
    ...(stop.providerId ? { providerId: stop.providerId } : {}),
    ...(stop.country ? { country: stop.country } : {}),
    ...(Number.isFinite(stop.longitude) && Number.isFinite(stop.latitude)
      ? { coordinates: [stop.longitude!, stop.latitude!] as [number, number] } : {}),
  };
}

/** Preserve the ordered v1 projection; geography and labels never merge stays. */
export function routeIntentFromLegacyTrip(trip: EasyTTrip): RouteIntent {
  const sourceEnd = trip.brief.journeyEnd ?? trip.brief.intent?.journeyEnd;
  const journeyEnd = sourceEnd && (sourceEnd.mode !== "explicit" || sourceEnd.place?.name?.trim())
    ? structuredClone(sourceEnd) : normalizeJourneyEnd(sourceEnd);
  const manualIds = Array.isArray(trip.brief.manualNightStopIds) ? trip.brief.manualNightStopIds : [];
  const optionalIds = Array.isArray(trip.brief.intent?.hardConstraints?.optionalStopIds) ? trip.brief.intent.hardConstraints.optionalStopIds : [];
  let destinations: DestinationIntent[] = trip.stops.map(stop => ({
    id: `legacy-stop:${stop.id}`,
    sourceText: stop.name,
    kind: "overnight_place",
    selectedPlace: placeForRouteStop(stop),
    resolution: stop.canonicalPlaceId || (Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)) ? "resolved" : "unresolved",
    requestedNights: manualIds.includes(stop.id) && nonnegativeInteger(stop.nights) ? stop.nights : null,
    routeMembership: optionalIds.includes(stop.id) ? "optional" : "required",
    stopIds: [stop.id],
  }));
  const structured = trip.brief.structuredBrief;
  const structuredMentions = Array.isArray(structured?.placeMentions) ? structured.placeMentions : [];
  if (structuredMentions.length && Array.isArray(structured?.destinations) && Array.isArray(structured?.hardConstraints)) {
    const occurrenceMentionIds: Record<string, string> = {};
    for (const mention of structuredMentions) {
      if (!mention.canonicalPlaceId || !mention.mentionId) continue;
      const sameMentionPlace = structuredMentions.filter(item => item.canonicalPlaceId === mention.canonicalPlaceId && item.routability === "direct_destination");
      const sameStops = trip.stops.filter(stop => stop.canonicalPlaceId === mention.canonicalPlaceId);
      // Exact unique geographic evidence can bind one occurrence; repeated places cannot.
      if (sameMentionPlace.length === 1 && sameStops.length === 1) occurrenceMentionIds[sameStops[0]!.id] = mention.mentionId;
    }
    const captured = routeIntentFromHandoff({
      locationMentions: structuredMentions, structuredBrief: structured,
      homepage: { version: 1, ownerId: trip.ownerId, revision: 0, mode: "describe", occurrenceMentionIds,
        choices: { dates: { state: "untouched" }, budget: { state: "untouched" }, interests: { state: "untouched" }, travellers: { state: "untouched" }, origin: { state: "untouched" }, journeyEnd: { state: "untouched" } } },
    }, trip.stops);
    destinations = captured.destinations.map(intent => ({ ...intent,
      requestedNights: intent.requestedNights ?? (intent.stopIds.length === 1 && manualIds.includes(intent.stopIds[0]!)
        ? trip.stops.find(stop => stop.id === intent.stopIds[0])?.nights ?? null : null),
      routeMembership: intent.stopIds.length && intent.stopIds.every(id => optionalIds.includes(id)) ? "optional" : intent.routeMembership,
    }));
  }
  const captured = trip.brief.capturedIntent;
  if (Array.isArray(captured?.mentions)) {
    captured.mentions.forEach((mention, index) => {
      if (mention?.role !== "stop" || mention.status !== "unresolved" || mention.intent === "landmark" || !mention.sourceText) return;
      if (structuredMentions.some(item => item.order === mention.order && item.sourceText === mention.sourceText && destinations.some(intent => intent.id === item.mentionId))) return;
      // Original immutable source occurrence is the fallback for v1's ID-less mentions.
      const id = `legacy-mention:${trip.id}:${index}`;
      destinations.push({ id, sourceText: mention.sourceText,
        kind: ["country", "region", "island", "lake"].includes(mention.placeType ?? "") ? "planning_area" : "overnight_place",
        selectedPlace: null, resolution: "unresolved", requestedNights: null,
        routeMembership: "required", stopIds: [] });
    });
  }
  return {
    version: 1,
    origin: trip.brief.origin?.trim() ? originPlaceFromBrief(trip.brief) : null,
    tripType: journeyEnd.mode === "same_as_start" ? "return_to_start" : journeyEnd.mode === "explicit" ? "one_way" : "unknown_legacy",
    journeyEnd,
    destinations,
    orderAuthority: "legacy_preserved",
    explicitIntentIds: null,
    orderedStopIds: trip.stops.map(stop => stop.id),
    projectionInputKey: null,
  };
}

function placeDependency(place: JourneyEndpointPlace | null) {
  if (!place) return null;
  return { canonicalPlaceId: place.canonicalPlaceId ?? null, providerId: place.providerId ?? null,
    coordinates: place.coordinates ?? null,
    // An unverified endpoint's typed place remains semantic input, not display copy.
    ...(place.canonicalPlaceId || place.providerId || place.coordinates ? {} : { sourceText: place.name.trim().toLocaleLowerCase(), country: place.country ?? null }) };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

/** Browser/server-identical semantic serialization; excludes save and display fields. */
export function routeProjectionInputKey(trip: EasyTTrip): string {
  const route = trip.brief.intent?.route ?? routeIntentFromLegacyTrip(trip);
  return JSON.stringify(stableValue({
    origin: placeDependency(route.origin), tripType: route.tripType,
    journeyEnd: route.journeyEnd.mode === "explicit" ? { mode: "explicit", place: placeDependency(route.journeyEnd.place) } : route.journeyEnd,
    destinations: [...route.destinations].sort((a, b) => a.id.localeCompare(b.id)).map(intent => ({
      id: intent.id, kind: intent.kind, selectedPlace: placeDependency(intent.selectedPlace),
      ...(intent.selectedPlace?.canonicalPlaceId || intent.selectedPlace?.providerId || intent.selectedPlace?.coordinates ? {} : { sourceText: intent.sourceText.trim().toLocaleLowerCase() }),
      resolution: intent.resolution, requestedNights: intent.requestedNights,
      routeMembership: intent.routeMembership, stopIds: intent.stopIds,
    })),
    orderAuthority: route.orderAuthority, explicitIntentIds: route.explicitIntentIds, orderedStopIds: route.orderedStopIds,
    stops: trip.stops.map(stop => ({ id: stop.id, place: placeDependency(placeForRouteStop(stop)), nights: stop.nights })),
    startDate: trip.startDate, endDate: trip.endDate,
    fixedCommitments: trip.brief.intent?.hardConstraints?.fixedCommitments ?? [],
    scheduleLocks: trip.brief.scheduleLocks ?? null,
  }));
}

export function routeProjectionStatus(trip: CanonicalEasyTTrip): "legacy_unverified" | "current" | "pending" | "provisional" {
  const route = trip.brief.intent.route;
  if (route.destinations.some(intent => intent.routeMembership === "required" && intent.resolution !== "resolved")) return "provisional";
  if (route.projectionInputKey === null) return "legacy_unverified";
  return route.projectionInputKey === routeProjectionInputKey(trip) ? "current" : "pending";
}

export function routeNightBudget(trip: CanonicalEasyTTrip, availableNights: number | null): {
  allocated: number; held: number; unallocated: number | null; overallocated: number; issues: TripDocumentIssue[];
} {
  const issues: TripDocumentIssue[] = [];
  const stops = new Map(trip.stops.map(stop => [stop.id, stop]));
  let allocated = 0;
  for (const stop of trip.stops) {
    if (nonnegativeInteger(stop.nights)) allocated += stop.nights;
    else issues.push({ code: "unknown_allocated_nights", path: `stops.${stop.id}.nights`, severity: "warning" });
  }
  const seen = new Set<string>();
  let held = 0;
  for (const intent of trip.brief.intent.route.destinations) {
    let mapped = 0;
    for (const id of intent.stopIds) {
      if (seen.has(id) || !stops.has(id)) issues.push({ code: "ambiguous_night_binding", path: `brief.intent.route.destinations.${intent.id}`, severity: "blocking" });
      seen.add(id);
      const nights = stops.get(id)?.nights;
      if (nonnegativeInteger(nights)) mapped += nights;
    }
    if (intent.requestedNights !== null) held += Math.max(0, intent.requestedNights - mapped);
  }
  const known = nonnegativeInteger(availableNights) && issues.length === 0;
  return { allocated, held, unallocated: known ? Math.max(0, availableNights - allocated - held) : null,
    overallocated: nonnegativeInteger(availableNights) ? Math.max(0, allocated + held - availableNights) : 0, issues };
}
