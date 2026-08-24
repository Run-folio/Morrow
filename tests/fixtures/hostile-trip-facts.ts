import type { EasyTTrip } from "../../lib/easyt/trip.ts";

export function hostileTripFixture(overrides: Partial<EasyTTrip> = {}): EasyTTrip {
  const trip: EasyTTrip = {
    schemaVersion: 1,
    id: "hostile-trip",
    ownerId: null,
    title: "Hostile fixture",
    status: "draft",
    startDate: "2026-09-01",
    endDate: "2026-09-04",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "Origin",
      mustDo: "",
      pace: "full",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      intent: {
        version: 1,
        travellers: 2,
        timing: { flexibility: "fixed", durationDays: 4 },
        hardConstraints: { originRequired: true, mustSeeStopIds: ["a", "b", "c"], optionalStopIds: [], fixedCommitments: [], avoidDriving: false },
        preferences: { budgetSensitivity: "mid", transportModes: ["train"], pace: "balanced", interests: [], dislikes: [] },
      },
    },
    stops: [
      { id: "a", order: 0, name: "A", country: "Test", latitude: null, longitude: null, arrivalDate: "2026-09-01", departureDate: "2026-09-02", nights: 1 },
      { id: "b", order: 1, name: "B", country: "Test", latitude: null, longitude: null, arrivalDate: "2026-09-02", departureDate: "2026-09-05", nights: 2 },
      { id: "c", order: 2, name: "C", country: "Test", latitude: null, longitude: null, arrivalDate: "2026-09-03", departureDate: "2026-09-04", nights: 1 },
    ],
    legs: [
      { id: "a-b", fromStopId: "a", toStopId: "b", mode: "train", distanceKm: 100, durationMinutes: 120, provider: "Saved rail", routeMetadata: {} },
      { id: "b-c", fromStopId: "b", toStopId: "c", mode: "ferry", distanceKm: 80, durationMinutes: 90, provider: "Saved ferry", routeMetadata: {} },
      { id: "c-b", fromStopId: "c", toStopId: "b", mode: "flight", distanceKm: 500, durationMinutes: 180, provider: "Saved flight", routeMetadata: {} },
    ],
    planItems: [
      { id: "day-a", stopId: "a", dayNumber: 1, date: "2026-09-01", type: "arrival", title: "A", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-b-1", stopId: "b", dayNumber: 2, date: "2026-09-02", type: "arrival", title: "B", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-c", stopId: "c", dayNumber: 3, date: "2026-09-03", type: "arrival", title: "C", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-b-2", stopId: "b", dayNumber: 4, date: "2026-09-04", type: "arrival", title: "Return to B", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    ],
    recommendations: [],
    createdAt: "2026-08-01",
    updatedAt: "2026-08-01",
  };
  return { ...trip, ...overrides, brief: { ...trip.brief, ...(overrides.brief ?? {}) } };
}

export const hostileEmptyTrip = () => hostileTripFixture({ stops: [], legs: [], planItems: [] });

export const hostileUnknownTransportTrip = () => {
  const trip = hostileTripFixture();
  trip.stops = trip.stops.slice(0, 2);
  trip.stops[0] = { ...trip.stops[0], arrivalDate: "2026-09-01", departureDate: "2026-09-02", nights: 1 };
  trip.stops[1] = { ...trip.stops[1], arrivalDate: "2026-09-02", departureDate: "2026-09-03", nights: 0 };
  trip.planItems = trip.planItems.slice(0, 2);
  trip.endDate = "2026-09-02";
  trip.brief.intent = { ...trip.brief.intent!, hardConstraints: { ...trip.brief.intent!.hardConstraints, mustSeeStopIds: ["a", "b"] } };
  trip.legs = [{ id: "unknown", fromStopId: "a", toStopId: "b", mode: "unknown", distanceKm: null, durationMinutes: null, provider: null, routeMetadata: {} }];
  return trip;
};

export const hostileNoDrivingTrip = () => {
  const trip = hostileTripFixture();
  trip.brief.intent = { ...trip.brief.intent!, hardConstraints: { ...trip.brief.intent!.hardConstraints, avoidDriving: true } };
  trip.legs[0] = { ...trip.legs[0], mode: "road" };
  return trip;
};
