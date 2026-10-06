import { defaultTripIntent, type CanonicalEasyTTrip, type EasyTTrip, type JourneyEndSelection, type JourneyEndpointPlace, type RouteIntent } from "./trip.ts";
import { routeIntentFromLegacyTrip } from "./trip-route-intent.ts";

export type TripDocumentIssue = { code: string; path: string; severity: "warning" | "blocking" };
export type TripDocumentReadResult =
  | { kind: "readable"; trip: CanonicalEasyTTrip; sourceSchemaVersion: 1 | 2; issues: TripDocumentIssue[] }
  | { kind: "unsupported"; sourceSchemaVersion: number }
  | { kind: "invalid"; issues: TripDocumentIssue[] };
export class TripDocumentReadError extends Error {
  readonly code: "unsupported_trip_version" | "invalid_trip_document";
  constructor(code: "unsupported_trip_version" | "invalid_trip_document") {
    super(code === "unsupported_trip_version" ? "This trip uses a newer document version. Keep your draft and update the app before editing." : "This trip document could not be validated. Your recovery copy has been preserved.");
    this.name = "TripDocumentReadError";
    this.code = code;
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}
function place(value: unknown): value is JourneyEndpointPlace {
  if (!object(value) || typeof value.name !== "string" || !value.name.trim()) return false;
  for (const key of ["canonicalPlaceId", "country", "providerId"]) if (value[key] !== undefined && typeof value[key] !== "string") return false;
  if (value.coordinates !== undefined) {
    const coordinates = value.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite)
      || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) return false;
  }
  return true;
}
function end(value: unknown): value is JourneyEndSelection {
  return object(value) && (["unknown", "same_as_start"].includes(String(value.mode)) || (value.mode === "explicit" && place(value.place)));
}

function routeIssues(value: unknown, trip: EasyTTrip): TripDocumentIssue[] {
  const invalid = (path: string): TripDocumentIssue[] => [{ code: "invalid_route_intent", path, severity: "blocking" }];
  const path = "brief.intent.route";
  if (!object(value) || value.version !== 1 || !(value.origin === null || place(value.origin)) || !end(value.journeyEnd)
    || !["return_to_start", "one_way", "unknown_legacy"].includes(String(value.tripType))
    || !["optimizable", "explicit", "manual", "legacy_preserved"].includes(String(value.orderAuthority))
    || !strings(value.orderedStopIds) || !(value.explicitIntentIds === null || strings(value.explicitIntentIds))
    || !(value.projectionInputKey === null || typeof value.projectionInputKey === "string") || !Array.isArray(value.destinations)) return invalid(path);
  const ids = new Set<string>();
  const mapped = new Set<string>();
  const stopIds = new Set(trip.stops.map(stop => stop.id));
  for (const [index, intent] of value.destinations.entries()) {
    if (!object(intent) || typeof intent.id !== "string" || !intent.id || ids.has(intent.id)
      || typeof intent.sourceText !== "string" || !["overnight_place", "planning_area"].includes(String(intent.kind))
      || !(intent.selectedPlace === null || place(intent.selectedPlace))
      || !["pending", "resolved", "needs_base", "ambiguous", "unresolved", "unavailable"].includes(String(intent.resolution))
      || !(intent.requestedNights === null || (typeof intent.requestedNights === "number" && Number.isInteger(intent.requestedNights) && intent.requestedNights >= 0))
      || !["required", "optional"].includes(String(intent.routeMembership)) || !strings(intent.stopIds)) return invalid(`${path}.destinations.${index}`);
    if (intent.kind === "overnight_place" && intent.stopIds.length > 1) return invalid(`${path}.destinations.${index}.stopIds`);
    if (intent.resolution === "resolved" && (!intent.selectedPlace || intent.stopIds.length === 0)) return invalid(`${path}.destinations.${index}.resolution`);
    ids.add(intent.id);
    for (const id of intent.stopIds) {
      if (!stopIds.has(id) || mapped.has(id)) return invalid(`${path}.destinations.${index}.stopIds`);
      mapped.add(id);
    }
  }
  if (mapped.size !== stopIds.size || JSON.stringify(value.orderedStopIds) !== JSON.stringify(trip.stops.map(stop => stop.id))) return invalid(`${path}.orderedStopIds`);
  if (value.explicitIntentIds && (new Set(value.explicitIntentIds).size !== value.explicitIntentIds.length || value.explicitIntentIds.some(id => !ids.has(id)))) return invalid(`${path}.explicitIntentIds`);
  if (value.orderAuthority === "explicit" && value.explicitIntentIds === null) return invalid(`${path}.explicitIntentIds`);
  if ((value.tripType === "return_to_start" && value.journeyEnd.mode !== "same_as_start")
    || (value.tripType === "one_way" && value.journeyEnd.mode === "same_as_start")
    || (value.tripType === "unknown_legacy" && value.journeyEnd.mode !== "unknown")) return invalid(`${path}.journeyEnd`);
  return [];
}

/** Single compatibility endpoint projection; callers cannot merge an old identity into a new name. */
export function projectCanonicalRouteEndpoints(trip: CanonicalEasyTTrip): CanonicalEasyTTrip {
  const route = trip.brief.intent.route;
  const origin = route.origin;
  const { origin: _origin, originCanonicalPlaceId: _canonical, originProviderId: _provider,
    originCountry: _country, originCoordinates: _coordinates, journeyEnd: _end, ...brief } = trip.brief;
  return { ...trip, brief: {
    ...brief,
    origin: origin?.name ?? "",
    ...(origin?.canonicalPlaceId !== undefined ? { originCanonicalPlaceId: origin.canonicalPlaceId } : {}),
    ...(origin?.providerId !== undefined ? { originProviderId: origin.providerId } : {}),
    ...(origin?.country !== undefined ? { originCountry: origin.country } : {}),
    ...(origin?.coordinates !== undefined ? { originCoordinates: origin.coordinates } : {}),
    journeyEnd: structuredClone(route.journeyEnd),
  } };
}

function optionalIssues(trip: EasyTTrip): TripDocumentIssue[] {
  const issues: TripDocumentIssue[] = [];
  const structured = trip.brief.structuredBrief;
  if (structured && (!Array.isArray(structured.destinations) || !Array.isArray(structured.hardConstraints)
    || !Array.isArray(structured.interests) || !object(structured.source))) {
    issues.push({ code: "malformed_optional_metadata", path: "brief.structuredBrief", severity: "warning" });
  }
  const commitments = trip.brief.intent?.hardConstraints?.fixedCommitments;
  if (Array.isArray(commitments)) for (const commitment of commitments) {
    if (commitment?.stopId || !commitment?.place?.name) continue;
    const matching = trip.stops.filter(stop => commitment.place?.canonicalPlaceId
      ? stop.canonicalPlaceId === commitment.place.canonicalPlaceId
      : stop.name.toLocaleLowerCase() === commitment.place!.name.toLocaleLowerCase());
    if (matching.length > 1) issues.push({ code: "ambiguous_commitment_binding", path: `brief.intent.hardConstraints.fixedCommitments.${commitment.id}`, severity: "blocking" });
  }
  return issues;
}

export function readTripDocument(value: unknown): TripDocumentReadResult {
  const invalid = (path: string): TripDocumentReadResult => ({ kind: "invalid", issues: [{ code: "invalid_trip_document", path, severity: "blocking" }] });
  if (!object(value)) return invalid("document");
  if (typeof value.schemaVersion === "number" && Number.isInteger(value.schemaVersion) && value.schemaVersion > 2) return { kind: "unsupported", sourceSchemaVersion: value.schemaVersion };
  if (![1, 2].includes(Number(value.schemaVersion)) || typeof value.schemaVersion !== "number") return invalid("schemaVersion");
  if (typeof value.id !== "string" || !value.id || typeof value.startDate !== "string" || typeof value.endDate !== "string"
    || !(value.ownerId === null || typeof value.ownerId === "string") || !object(value.brief)
    || !Array.isArray(value.stops) || !Array.isArray(value.planItems)) return invalid("document");
  const stopIds = new Set<string>();
  for (const stop of value.stops) {
    if (!object(stop) || typeof stop.id !== "string" || !stop.id || stopIds.has(stop.id) || typeof stop.name !== "string") return invalid("stops");
    stopIds.add(stop.id);
  }
  const sourceSchemaVersion = value.schemaVersion as 1 | 2;
  const trip = structuredClone(value) as unknown as EasyTTrip;
  const issues = optionalIssues(trip);
  if (sourceSchemaVersion === 2) {
    if (trip.brief.intent?.version !== 2) return invalid("brief.intent.version");
    const invalidRoute = routeIssues(trip.brief.intent.route, trip);
    if (invalidRoute.length) return { kind: "invalid", issues: invalidRoute };
    const { journeyEnd: _legacy, ...intent } = trip.brief.intent;
    return { kind: "readable", sourceSchemaVersion, issues,
      trip: projectCanonicalRouteEndpoints({ ...trip, brief: { ...trip.brief, intent } } as CanonicalEasyTTrip) };
  }
  const saved = object(trip.brief.intent) ? trip.brief.intent : undefined;
  const durationDays = Math.round((Date.parse(`${trip.endDate}T00:00:00Z`) - Date.parse(`${trip.startDate}T00:00:00Z`)) / 86_400_000) + 1;
  const fallback = defaultTripIntent({ travellers: trip.travellers, stopIds: trip.stops.map(stop => stop.id), budgetSensitivity: trip.brief.budgetBand,
    ...(Number.isFinite(durationDays) && durationDays > 0 ? { durationDays } : {}) });
  const intent = { ...fallback, ...saved,
    timing: { ...fallback.timing, ...(object(saved?.timing) ? saved.timing : {}) },
    hardConstraints: { ...fallback.hardConstraints, ...(object(saved?.hardConstraints) ? saved.hardConstraints : {}) },
    preferences: { ...fallback.preferences, ...(object(saved?.preferences) ? saved.preferences : {}) },
  };
  // Malformed optional endpoint evidence is retained in the source, never guessed as return.
  if (trip.brief.journeyEnd !== undefined && !end(trip.brief.journeyEnd)) {
    issues.push({ code: "malformed_optional_metadata", path: "brief.journeyEnd", severity: "warning" });
    trip.brief.journeyEnd = { mode: "unknown" };
  }
  if (intent.journeyEnd !== undefined && !end(intent.journeyEnd)) intent.journeyEnd = { mode: "unknown" };
  const route = routeIntentFromLegacyTrip({ ...trip, brief: { ...trip.brief, intent } });
  const { journeyEnd: _legacy, ...canonicalIntent } = intent;
  const canonical = { ...trip, schemaVersion: 2, brief: { ...trip.brief, intent: { ...canonicalIntent, version: 2, route } } } as CanonicalEasyTTrip;
  return { kind: "readable", sourceSchemaVersion, issues, trip: projectCanonicalRouteEndpoints(canonical) };
}
export function requireReadableTripDocument(value: unknown): CanonicalEasyTTrip {
  const result = readTripDocument(value);
  if (result.kind !== "readable") throw new TripDocumentReadError(result.kind === "unsupported" ? "unsupported_trip_version" : "invalid_trip_document");
  return result.trip;
}
export function prepareTripDocumentForWrite(trip: EasyTTrip): CanonicalEasyTTrip {
  const canonical = requireReadableTripDocument(trip);
  const issues = routeIssues(canonical.brief.intent.route, canonical);
  if (issues.length) throw new TripDocumentReadError("invalid_trip_document");
  return canonical;
}
