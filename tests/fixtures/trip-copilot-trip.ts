import type { EasyTTrip, PlanItem } from "../../lib/easyt/trip.ts";

function day(dayNumber: number, stopId: string, date: string, title: string, type: PlanItem["type"] = "activity"): PlanItem {
  return {
    id: `japan-day-${dayNumber}`,
    stopId,
    dayNumber,
    date,
    type,
    title,
    reason: "A deterministic Morrovia itinerary day.",
    notes: type === "transport" ? ["Keep the arrival evening flexible"] : ["One main area", "Unscheduled evening"],
    startsAt: null,
    endsAt: null,
    bookingUrl: null,
    latitude: null,
    longitude: null,
  };
}

export function tripCopilotFixture(): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "private-trip-id-not-for-model",
    ownerId: "private-owner-id-not-for-model",
    title: "Tokyo, Kyoto and Hiroshima",
    status: "draft",
    startDate: "2026-10-10",
    endDate: "2026-10-19",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      mustDo: "Food, neighbourhoods and history",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      nightAllocations: { tokyo: 4, kyoto: 3, hiroshima: 2 },
      intent: {
        version: 1,
        travellers: 2,
        timing: { flexibility: "fixed", durationDays: 10 },
        hardConstraints: { originRequired: true, mustSeeStopIds: ["kyoto"], optionalStopIds: ["hiroshima"], fixedCommitments: [], avoidDriving: true },
        preferences: { budgetSensitivity: "mid", transportModes: ["flight", "train"], pace: "relaxed", interests: ["food", "culture"], dislikes: ["frequent hotel changes"] },
      },
      bookings: [{ id: "stay-tokyo", type: "stay", title: "Tokyo stay", date: "2026-10-10", confirmation: "PRIVATE-CONFIRMATION", url: "https://private.invalid/booking" }],
      checklist: [{ id: "passport", label: "Check passport validity", complete: true }, { id: "insurance", label: "Arrange travel insurance", complete: false }],
    },
    stops: [
      { id: "tokyo", order: 0, name: "Tokyo", country: "Japan", canonicalPlaceId: "place:tokyo", latitude: 35.6762, longitude: 139.6503, arrivalDate: "2026-10-10", departureDate: "2026-10-14", nights: 4 },
      { id: "kyoto", order: 1, name: "Kyoto", country: "Japan", canonicalPlaceId: "place:kyoto", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2026-10-14", departureDate: "2026-10-17", nights: 3 },
      { id: "hiroshima", order: 2, name: "Hiroshima", country: "Japan", canonicalPlaceId: "place:hiroshima", latitude: 34.3853, longitude: 132.4553, arrivalDate: "2026-10-17", departureDate: "2026-10-19", nights: 2 },
    ],
    legs: [
      { id: "tokyo-kyoto", fromStopId: "tokyo", toStopId: "kyoto", mode: "train", distanceKm: 450, durationMinutes: 210, provider: "PRIVATE PROVIDER NOTE", routeMetadata: { privateProviderPayload: "DO-NOT-SEND" } },
      { id: "kyoto-hiroshima", fromStopId: "kyoto", toStopId: "hiroshima", mode: "train", distanceKm: 360, durationMinutes: 180, provider: null, routeMetadata: {} },
    ],
    planItems: [
      day(1, "tokyo", "2026-10-10", "Arrive in Tokyo", "arrival"),
      day(2, "tokyo", "2026-10-11", "Neighbourhoods of west Tokyo"),
      day(3, "tokyo", "2026-10-12", "Old Tokyo and food"),
      day(4, "tokyo", "2026-10-13", "Flexible Tokyo day", "open"),
      day(5, "kyoto", "2026-10-14", "Train to Kyoto", "transport"),
      day(6, "kyoto", "2026-10-15", "Eastern Kyoto"),
      day(7, "kyoto", "2026-10-16", "Western Kyoto"),
      day(8, "hiroshima", "2026-10-17", "Train to Hiroshima", "transport"),
      day(9, "hiroshima", "2026-10-18", "Hiroshima and Miyajima"),
      day(10, "hiroshima", "2026-10-19", "Departure day", "open"),
    ],
    recommendations: [],
    changeHistory: [{ id: "private-change", recommendationId: "private-recommendation", action: "apply", summary: "PRIVATE CHANGE HISTORY", changedAt: "2026-08-01T00:00:00.000Z" }],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}
