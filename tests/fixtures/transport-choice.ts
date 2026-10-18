import type { EasyTTrip, TransferSegment } from "../../lib/easyt/trip.ts";

export function japanTrip(): EasyTTrip {
  const from = { kind: "stop" as const, id: "tokyo", canonicalPlaceId: "tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] as [number, number] };
  const to = { kind: "stop" as const, id: "kyoto", canonicalPlaceId: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] as [number, number] };
  const rail: TransferSegment = { id: "tokyo:kyoto:train:0", mode: "train", fromEndpoint: from, toEndpoint: to, distanceKm: 365, durationMinutes: 135, provider: "Reviewed Tokaido rail evidence.", provenance: "canonical_schedule", confidence: "high", scheduleNeedsChecking: true };
  const road: TransferSegment = { id: "tokyo:kyoto:road:0", mode: "road", fromEndpoint: from, toEndpoint: to, distanceKm: 455, durationMinutes: 390, provider: "OpenRouteService routed road estimate.", provenance: "routing_engine", confidence: "medium", scheduleNeedsChecking: true };
  return {
    schemaVersion: 1, id: "trip-japan-choice", ownerId: null, title: "Japan", status: "planned", startDate: "2027-04-01", endDate: "2027-04-08", travellers: 2, currency: "GBP",
    brief: { origin: "Tokyo", originCanonicalPlaceId: "tokyo", originCountry: "Japan", originCoordinates: [139.6917, 35.6895], mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, decisionSelections: { transportByLeg: {} }, intent: { version: 1, travellers: 2, timing: { flexibility: "fixed", durationDays: 8 }, hardConstraints: { originRequired: true, mustSeeStopIds: [], optionalStopIds: [], fixedCommitments: [], avoidDriving: false }, preferences: { budgetSensitivity: "mid", transportModes: ["train"], pace: "balanced", interests: [], dislikes: [] } } },
    stops: [
      { id: "tokyo", canonicalPlaceId: "tokyo", order: 0, name: "Tokyo", country: "Japan", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2027-04-01", departureDate: "2027-04-04", nights: 3 },
      { id: "kyoto", canonicalPlaceId: "kyoto", order: 1, name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2027-04-04", departureDate: "2027-04-08", nights: 4 },
    ],
    legs: [{ id: "trip-japan-choice-leg-1", fromStopId: "tokyo", toStopId: "kyoto", fromEndpoint: from, toEndpoint: to, classification: "intercity", mode: "train", distanceKm: 365, durationMinutes: 135, doorToDoorMinutes: 135, headlineMinutes: 135, provider: rail.provider, provenance: rail.provenance, confidence: rail.confidence, scheduleNeedsChecking: true, warnings: [], segments: [rail], routeMetadata: { source: "multimodal-resolver", planningEstimate: true, multimodalResolution: { version: 1, selected: "train", selectedCandidateId: "rail:network:tokaido", candidates: [
      { id: "rail:network:tokaido", summaryMode: "train", segments: [rail], totalDurationMinutes: 135, distanceKm: 365, confidence: "high", provenance: "canonical_schedule", evidence: "intercity_rail_network", connectionCount: 0, score: 90, reasons: ["Reviewed rail evidence supports this journey."] },
      { id: "road:routed", summaryMode: "road", segments: [road], totalDurationMinutes: 390, distanceKm: 455, confidence: "medium", provenance: "routing_engine", evidence: "routed_road", connectionCount: 0, score: 55, reasons: ["A road provider returned a plausible route."] },
    ], rejected: [] } } }],
    planItems: [{ id: "day-4", stopId: "kyoto", dayNumber: 4, date: "2027-04-04", type: "transport", title: "Tokyo to Kyoto", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }],
    recommendations: [], createdAt: "2026-09-22T12:00:00.000Z", updatedAt: "2026-09-22T12:00:00.000Z",
  };
}
