import { defaultTripIntent, type EasyTTrip, type PlanItem } from "@/lib/easyt/trip";

export const TOUR_TRIP_PROMPT = "Seven nights in Peru for two. Start in Cusco, spend three nights there, two in Ollantaytambo in the Sacred Valley and finish with two nights in Arequipa. We like food and culture.";
export const TOUR_TRIP_ROUTE = "Cusco → Ollantaytambo → Arequipa";

// Location-specific photographs with verified provider licences; see the public manifest.
const tourPhotos: Record<string, { image: string; sourceUrl: string }> = {
  cusco: { image: "/journey/product-shots/tour/source/cusco.jpg", sourceUrl: "https://unsplash.com/photos/a-view-of-a-city-from-a-high-point-of-view-g9U5KGu_m3Q" },
  "ollantaytambo": { image: "/journey/product-shots/tour/source/sacred-valley.jpg", sourceUrl: "https://unsplash.com/photos/rocky-mountains-hQljmSHzn4E" },
  arequipa: { image: "/journey/product-shots/tour/source/arequipa.jpg", sourceUrl: "https://unsplash.com/photos/a-panoramic-view-of-a-city-with-a-mountain-in-the-background-hpc4DFyjY40" },
};

const day = (
  dayNumber: number,
  stopId: string,
  date: string,
  title: string,
  reason: string,
  notes: string[],
  type: PlanItem["type"] = "activity",
): PlanItem => ({
  id: `tour-day-${dayNumber}`,
  stopId,
  dayNumber,
  date,
  type,
  title,
  reason,
  notes,
  startsAt: null,
  endsAt: null,
  bookingUrl: null,
  latitude: null,
  longitude: null,
  ...tourPhotos[stopId],
});

const intent = defaultTripIntent({
  travellers: 2,
  durationDays: 8,
  stopIds: ["cusco", "ollantaytambo", "arequipa"],
});

export const tourTripFixture: EasyTTrip = {
  schemaVersion: 1,
  id: "tour-cusco-sacred-valley-arequipa",
  ownerId: null,
  title: "Cusco, Sacred Valley & Arequipa",
  status: "draft",
  startDate: "2027-08-21",
  endDate: "2027-08-28",
  travellers: 2,
  currency: "GBP",
  brief: {
    origin: "Lima",
    originCountry: "Peru",
    originCanonicalPlaceId: "lima",
    originCoordinates: [-77.0428, -12.0464],
    mustDo: TOUR_TRIP_PROMPT,
    pace: "slow",
    hotelChanges: "few",
    budgetBand: "mid",
    selectedPlaces: { cusco: ["San Pedro Market", "Qorikancha"] },
    customActivities: { 2: ["San Blas and the historic centre"] },
    dayNotes: { 2: ["Keep the afternoon flexible"] },
    itineraryIdeas: [
      { id: "tour-idea-qorikancha", stopId: "cusco", placeId: "qorikancha", title: "Qorikancha", category: "activity", coordinates: [-71.981, -13.519], source: "destination-highlight", reasons: ["destination-significance"], dayId: "tour-day-2", dayPart: "morning" },
      { id: "tour-idea-market", stopId: "cusco", placeId: "san-pedro-market", title: "San Pedro Market", category: "restaurant", coordinates: [-71.9821, -13.5207], source: "personalised-recommendation", reasons: ["interest-relevance"], dayId: "tour-day-2", dayPart: "evening" },
    ],
    nightAllocations: { cusco: 3, "ollantaytambo": 2, arequipa: 2 },
    manualNightStopIds: ["cusco", "ollantaytambo", "arequipa"],
    routeAssessment: {
      comfortableDays: 8,
      shortfallDays: 0,
      durations: {},
      route: {
        state: "current-order",
        currentStopIds: ["cusco", "ollantaytambo", "arequipa"],
        recommendedStopIds: ["cusco", "ollantaytambo", "arequipa"],
        currentTransferMinutes: 465,
        recommendedTransferMinutes: 465,
        improvementMinutes: 0,
        reasons: ["The entered order ranks first under the current route criteria.", "It keeps the route moving in one direction instead of doubling back."],
        tradeoffs: ["The Arequipa flight still needs a live schedule check before booking."],
        summary: "This route already flows well.",
      },
    },
    bookings: [
      { id: "tour-stay-cusco", type: "stay", title: "Cusco stay", date: "2027-08-21", confirmation: "CUZ-321", url: null },
      { id: "tour-stay-valley", type: "stay", title: "Sacred Valley stay", date: "2027-08-24", confirmation: "SV-224", url: null },
      { id: "tour-stay-arequipa", type: "stay", title: "Arequipa stay", date: "2027-08-26", confirmation: "AQP-226", url: null },
      { id: "tour-arrival-flight", type: "transport", title: "Lima to Cusco flight", date: "2027-08-21", confirmation: "LIM-CUZ-821", url: null },
    ],
    checklist: [
      { id: "passport", label: "Check passport validity", complete: true },
      { id: "insurance", label: "Review travel insurance", complete: true },
      { id: "offline", label: "Save offline maps", complete: false },
      { id: "packing", label: "Finish packing list", complete: false },
    ],
    intent: { ...intent, preferences: { ...intent.preferences, pace: "relaxed", interests: ["food", "culture"] } },
  },
  stops: [
    { id: "cusco", order: 0, name: "Cusco", country: "Peru", canonicalPlaceId: "cusco", latitude: -13.517, longitude: -71.9785, arrivalDate: "2027-08-21", departureDate: "2027-08-24", nights: 3 },
    { id: "ollantaytambo", order: 1, name: "Ollantaytambo", country: "Peru", canonicalPlaceId: "ollantaytambo", latitude: -13.2586, longitude: -72.264, arrivalDate: "2027-08-24", departureDate: "2027-08-26", nights: 2 },
    { id: "arequipa", order: 2, name: "Arequipa", country: "Peru", canonicalPlaceId: "arequipa", latitude: -16.409, longitude: -71.5375, arrivalDate: "2027-08-26", departureDate: "2027-08-28", nights: 2 },
  ],
  legs: [
    { id: "tour-arrival", fromStopId: "tour-cusco-sacred-valley-arequipa-origin", toStopId: "cusco", fromEndpoint: { kind: "origin", id: "tour-cusco-sacred-valley-arequipa-origin", name: "Lima", country: "Peru", canonicalPlaceId: "lima", coordinates: [-77.0428, -12.0464] }, toEndpoint: { kind: "stop", id: "cusco", name: "Cusco", country: "Peru", canonicalPlaceId: "cusco", coordinates: [-71.9785, -13.517] }, classification: "arrival", mode: "flight", distanceKm: 575, durationMinutes: 90, doorToDoorMinutes: 210, provider: "Saved flight", provenance: "provider", confidence: "high", scheduleNeedsChecking: false, routeMetadata: {} },
    { id: "tour-cusco-valley", fromEndpoint: {"kind": "stop", "id": "cusco", "name": "Cusco", "country": "Peru", "canonicalPlaceId": "cusco", "coordinates": [-71.9785, -13.517]}, toEndpoint: {"kind": "stop", "id": "ollantaytambo", "name": "Ollantaytambo", "country": "Peru", "canonicalPlaceId": "ollantaytambo", "coordinates": [-72.264, -13.2586]}, fromStopId: "cusco", toStopId: "ollantaytambo", mode: "road", distanceKm: null, durationMinutes: 75, doorToDoorMinutes: 105, provider: "Saved transfer", provenance: "provider", confidence: "high", scheduleNeedsChecking: false, routeMetadata: {} },
    { id: "tour-valley-arequipa", fromEndpoint: {"kind": "stop", "id": "ollantaytambo", "name": "Ollantaytambo", "country": "Peru", "canonicalPlaceId": "ollantaytambo", "coordinates": [-72.264, -13.2586]}, toEndpoint: {"kind": "stop", "id": "arequipa", "name": "Arequipa", "country": "Peru", "canonicalPlaceId": "arequipa", "coordinates": [-71.5375, -16.409]}, fromStopId: "ollantaytambo", toStopId: "arequipa", mode: "flight", distanceKm: null, durationMinutes: 390, doorToDoorMinutes: 390, provider: "Saved flight", provenance: "provider", confidence: "high", scheduleNeedsChecking: false, routeMetadata: {} },
  ],
  planItems: [
    day(1, "cusco", "2027-08-21", "Arrive in Cusco", "A protected arrival day leaves time for the flight, check-in and altitude adjustment.", ["Check in and keep dinner close to the stay"], "arrival"),
    day(2, "cusco", "2027-08-22", "Explore Cusco", "Stay local while adjusting to the altitude.", ["San Blas and the historic centre", "Qorikancha", "Keep the afternoon flexible", "San Pedro Market"]),
    day(3, "cusco", "2027-08-23", "Explore Cusco", "A second day protects the pace before moving on.", ["Sacsayhuamán", "Choose one museum or market"]),
    day(4, "ollantaytambo", "2027-08-24", "Travel to Ollantaytambo", "A short road transfer keeps most of the day usable.", ["Leave after breakfast", "Check in before exploring Pisac"], "transport"),
    day(5, "ollantaytambo", "2027-08-25", "Explore Sacred Valley", "A full day keeps the valley from becoming a transit stop.", ["Pisac market", "Ollantaytambo"]),
    day(6, "arequipa", "2027-08-26", "Travel to Arequipa", "This is the longest transfer day in the route.", ["Allow a generous airport buffer", "Keep dinner close to the hotel"], "transport"),
    day(7, "arequipa", "2027-08-27", "Explore Arequipa", "Finish with one coherent day in the historic centre.", ["Santa Catalina Monastery", "Plaza de Armas at dusk"]),
    day(8, "arequipa", "2027-08-28", "Leave Arequipa", "Keep departure day simple.", ["Check out and travel to the airport"], "transport"),
  ],
  recommendations: [],
  createdAt: "2027-08-01T10:00:00.000Z",
  updatedAt: "2027-08-01T10:00:00.000Z",
};
