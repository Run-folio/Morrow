import type { EasyTTrip, PlanItem, TripLeg } from "../lib/easyt/trip.ts";
const day = (id: string, stopId: string, dayNumber: number, date: string, title: string, type: PlanItem["type"] = "activity"): PlanItem => ({
    id,
    stopId,
    dayNumber,
    date,
    type,
    title,
    reason: "",
    notes: [],
    startsAt: null,
    endsAt: null,
    bookingUrl: null,
    latitude: null,
    longitude: null,
});
export function representativeTrip(): EasyTTrip {
    const legs: TripLeg[] = [
        {
            id: "arrival-tokyo-first", fromStopId: "calendar-trip-origin", toStopId: "tokyo-first", classification: "arrival", mode: "flight", distanceKm: 9500, durationMinutes: 900, doorToDoorMinutes: 1020, provider: "Planning estimate", provenance: "planning_estimate", confidence: "medium", routeMetadata: {},
            fromEndpoint: { kind: "origin", id: "calendar-trip-origin", name: "London", country: "United Kingdom", coordinates: [-0.1276, 51.5072] },
            toEndpoint: { kind: "stop", id: "tokyo-first", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] },
        },
        {
            id: "tokyo-kyoto", fromStopId: "tokyo-first", toStopId: "kyoto", classification: "intercity", mode: "train", distanceKm: 450, durationMinutes: 150, doorToDoorMinutes: 210, provider: "Planning estimate", provenance: "planning_estimate", confidence: "medium", routeMetadata: {},
            fromEndpoint: { kind: "stop", id: "tokyo-first", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] },
            toEndpoint: { kind: "stop", id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] },
        },
        {
            id: "kyoto-tokyo-return", fromStopId: "kyoto", toStopId: "tokyo-return", classification: "intercity", mode: "unknown", distanceKm: 450, durationMinutes: null, doorToDoorMinutes: null, provider: null, provenance: "unknown", confidence: "unknown", scheduleNeedsChecking: true, warnings: ["Live service needs confirmation."], routeMetadata: {},
            fromEndpoint: { kind: "stop", id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] },
            toEndpoint: { kind: "stop", id: "tokyo-return", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] },
        },
    ];
    return {
        schemaVersion: 1,
        id: "calendar-trip",
        ownerId: "traveller",
        title: "Tokyo, Kyoto and Tokyo",
        status: "draft",
        startDate: "2026-08-29",
        endDate: "2026-09-02",
        travellers: 2,
        currency: "GBP",
        brief: {
            origin: "London",
            originCountry: "United Kingdom",
            originCoordinates: [-0.1276, 51.5072],
            originCanonicalPlaceId: "london",
            journeyEnd: { mode: "unknown" },
            mustDo: "Markets and temples",
            pace: "slow",
            hotelChanges: "few",
            budgetBand: "mid",
            selectedPlaces: {},
            itineraryIdeas: [
                { id: "market", stopId: "tokyo-first", placeId: "toyosu-market", title: "Toyosu Market", area: "Tokyo", category: "activity", source: "personalised-recommendation", sourceUrl: "https://example.com/market", reasons: ["interest-relevance"], dayId: "tokyo-day-2", dayPart: "morning" },
                { id: "kyoto-tour", stopId: "kyoto", placeId: "kyoto-tour", title: "Kyoto full-day tour", area: "Kyoto", category: "activity", source: "live-provider-inventory", sourceUrl: "https://example.com/tour", reasons: ["destination-significance"], dayId: "kyoto-day-3", dayPart: null, provider: "viator", providerProductId: "tour-1", providerMetadata: { duration: { fixedMinutes: 600 }, provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-08-01T12:00:00.000Z" } } },
                { id: "dinner", stopId: "kyoto", placeId: "gion-dinner", title: "Gion dinner", area: "Kyoto", category: "restaurant", source: "personalised-recommendation", sourceUrl: "https://example.com/dinner", reasons: ["interest-relevance"], dayId: "kyoto-day-4", dayPart: "evening", startsAt: "19:30" },
                { id: "return-walk", stopId: "tokyo-return", placeId: "return-walk", title: "Return neighbourhood walk", area: "Tokyo", category: "activity", source: "traveller-visit-intent", sourceUrl: "https://example.com/walk", reasons: ["interest-relevance"], dayId: "tokyo-return-day-5", dayPart: null },
            ],
            bookings: [
                { id: "stay-tokyo-first", type: "stay", title: "Tokyo Station Hotel", date: "2026-08-29", endDate: "2026-08-31", confirmation: "TOKYO-1", url: null },
                { id: "transport-tokyo-kyoto", type: "transport", title: "Tokyo to Kyoto train", date: "2026-08-31", confirmation: "TRAIN-1", url: "https://example.com/train" },
                { id: "dinner-booking", type: "reservation", title: "Tea ceremony", date: "2026-09-01", confirmation: null, url: null },
                { id: "stay-tokyo-return", type: "stay", title: "Shinjuku Hotel", date: "2026-09-02", endDate: "2026-09-03", confirmation: "TOKYO-2", url: null },
            ],
        },
        stops: [
            { id: "tokyo-first", order: 0, name: "Tokyo", country: "Japan", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2026-08-29", departureDate: "2026-08-31", nights: 2 },
            { id: "kyoto", order: 1, name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2026-08-31", departureDate: "2026-09-02", nights: 2 },
            { id: "tokyo-return", order: 2, name: "Tokyo", country: "Japan", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2026-09-02", departureDate: "2026-09-03", nights: 1 },
        ],
        legs,
        planItems: [
            day("tokyo-day-1", "tokyo-first", 1, "2026-08-29", "Arrive in Tokyo", "arrival"),
            day("tokyo-day-2", "tokyo-first", 2, "2026-08-30", "Explore Tokyo"),
            day("kyoto-day-3", "kyoto", 3, "2026-08-31", "Travel to Kyoto", "transport"),
            day("kyoto-day-4", "kyoto", 4, "2026-09-01", "Explore Kyoto"),
            day("tokyo-return-day-5", "tokyo-return", 5, "2026-09-02", "Return to Tokyo", "transport"),
        ],
        recommendations: [],
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
    };
}
