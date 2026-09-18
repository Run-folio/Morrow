import type { EasyTTrip } from "./trip";

export type BuilderDocumentCommitResult =
  | { ok: true; document: EasyTTrip }
  | { ok: false; reason: "stale-source" | "invalid-document" };

function sortedRecord<T>(value: Record<string, T> | undefined) {
  return Object.fromEntries(Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right)));
}

/** Fingerprint only traveller-editable Builder truth; derived routes and timestamps are deliberately excluded. */
export function builderDocumentFingerprint(trip: EasyTTrip): string {
  return JSON.stringify({
    id: trip.id,
    origin: {
      name: trip.brief.origin,
      coordinates: trip.brief.originCoordinates,
      canonicalPlaceId: trip.brief.originCanonicalPlaceId,
      country: trip.brief.originCountry,
      providerId: trip.brief.originProviderId,
    },
    journeyEnd: trip.brief.journeyEnd ?? { mode: "unknown" },
    stops: trip.stops.map((stop) => ({
      id: stop.id,
      order: stop.order,
      name: stop.name,
      country: stop.country,
      canonicalPlaceId: stop.canonicalPlaceId,
      countryCode: stop.countryCode,
      region: stop.region,
      providerId: stop.providerId,
      latitude: stop.latitude,
      longitude: stop.longitude,
      nights: stop.nights,
    })),
    startDate: trip.startDate,
    endDate: trip.endDate,
    travellers: trip.travellers,
    budget: trip.brief.budgetBand,
    mustDo: trip.brief.mustDo,
    pace: trip.brief.pace,
    hotelChanges: trip.brief.hotelChanges,
    selectedPlaces: sortedRecord(trip.brief.selectedPlaces),
    dayAllocations: sortedRecord(trip.brief.dayAllocations),
    nightAllocations: sortedRecord(trip.brief.nightAllocations),
    manualNightStopIds: [...(trip.brief.manualNightStopIds ?? [])].sort(),
    intent: trip.brief.intent,
    structuredBrief: trip.brief.structuredBrief,
    scheduleLocks: trip.brief.scheduleLocks,
    decisionSelections: trip.brief.decisionSelections,
  });
}

export function prepareBuilderDocumentCommit(input: {
  current: EasyTTrip;
  proposed: EasyTTrip;
  expectedFingerprint: string;
  validate: (trip: EasyTTrip) => boolean;
}): BuilderDocumentCommitResult {
  if (builderDocumentFingerprint(input.current) !== input.expectedFingerprint) {
    return { ok: false, reason: "stale-source" };
  }
  if (!input.validate(input.proposed)) return { ok: false, reason: "invalid-document" };
  return { ok: true, document: input.proposed };
}
