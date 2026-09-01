import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EasyTNavigation from "@/app/journey/easyt-navigation";
import type { ItineraryDiscoveryPlace } from "@/lib/easyt/itinerary-day-context";
import { defaultTripIntent, type EasyTTrip, type PlanItem } from "@/lib/easyt/trip";
import type { TripInterest } from "@/lib/easyt/trip-interest";
import { affiliatePartners, getActivityBookingAction } from "@/lib/easyt/booking-readiness";
import { tourTripFixture } from "./storybook/tour-trip.fixture";
import TripItineraryWorkspace from "./trip-itinerary-workspace";
import TripShell from "./trip-shell";

const day = (dayNumber: number, stopId: string, date: string, title: string, reason: string, notes: string[], type: PlanItem["type"] = "activity", image: string | null = "/journey/peru-sacred-valley-route.jpg"): PlanItem => ({
  id: `day-${dayNumber}`,
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
  image,
  sourceUrl: image,
});

const storyIntent = defaultTripIntent({
  travellers: 2,
  durationDays: 7,
  stopIds: ["cusco", "sacred-valley", "arequipa"],
});

const trip: EasyTTrip = {
  schemaVersion: 1,
  id: "storybook-pass3b-cusco-itinerary",
  ownerId: "storybook-traveller",
  title: "Cusco to Cusco & Sacred Valley & Arequipa",
  status: "draft",
  startDate: "2026-08-21",
  endDate: "2026-08-27",
  travellers: 2,
  currency: "GBP",
  brief: {
    origin: "Cusco",
    mustDo: "Sacred Valley",
    pace: "slow",
    hotelChanges: "few",
    budgetBand: "mid",
    selectedPlaces: { cusco: ["San Pedro Market"] },
    customActivities: { 1: ["Walk San Blas before dinner"] },
    dayNotes: { 1: ["Confirm the airport pickup before departure."] },
    mapPins: [{ id: "cusco-market", title: "San Pedro Market", category: "activity", dayNumber: 1, latitude: -13.5207, longitude: -71.9821 }],
    bookings: [{ id: "stay-cusco", type: "stay", title: "Cusco stay", date: "2026-08-21", confirmation: "CUSCO-824", url: null }],
    intent: {
      ...storyIntent,
      preferences: { ...storyIntent.preferences, interests: ["food", "culture"] },
    },
  },
  stops: [
    { id: "cusco", order: 0, name: "Cusco", country: "Peru", latitude: -13.532, longitude: -71.967, arrivalDate: "2026-08-21", departureDate: "2026-08-24", nights: 3 },
    { id: "sacred-valley", order: 1, name: "Sacred Valley", country: "Peru", latitude: -13.333, longitude: -72.083, arrivalDate: "2026-08-24", departureDate: "2026-08-26", nights: 2 },
    { id: "arequipa", order: 2, name: "Arequipa", country: "Peru", latitude: -16.398, longitude: -71.536, arrivalDate: "2026-08-26", departureDate: "2026-08-28", nights: 2 },
  ],
  legs: [
    { id: "cusco-valley", fromStopId: "cusco", toStopId: "sacred-valley", mode: "road", distanceKm: 55, durationMinutes: 75, provider: null, routeMetadata: {} },
    { id: "valley-arequipa", fromStopId: "sacred-valley", toStopId: "arequipa", mode: "flight", distanceKm: 315, durationMinutes: 390, provider: null, routeMetadata: {} },
  ],
  planItems: [
    day(1, "cusco", "2026-08-21", "Arrive in Cusco", "A protected arrival day gives the route room for the transfer, check-in and a first feel for the place.", ["Cusco → Cusco", "Estimated door-to-door: about 3h 10m", "Check in, walk one nearby area and keep dinner easy", "Walk San Blas before dinner"], "arrival"),
    day(2, "cusco", "2026-08-22", "Explore Cusco", "Stay local while adjusting to the altitude.", ["San Blas and the historic centre", "Keep the afternoon flexible"]),
    day(3, "cusco", "2026-08-23", "Explore Cusco", "A second day protects the pace before moving on.", ["Sacsayhuamán", "Choose one museum or market"]),
    day(4, "sacred-valley", "2026-08-24", "Travel to Sacred Valley", "A short road transfer keeps most of the day usable.", ["Leave after breakfast", "Check in before exploring Pisac"], "transport"),
    day(5, "sacred-valley", "2026-08-25", "Explore Sacred Valley", "One full day keeps the valley from becoming a transit stop.", ["Choose one cluster of villages", "Keep the evening near the stay"]),
    day(6, "arequipa", "2026-08-26", "Travel to Arequipa", "This is the longest transfer day in the route.", ["Allow a generous airport buffer", "Keep dinner close to the hotel"], "transport"),
    day(7, "arequipa", "2026-08-27", "Explore Arequipa", "Finish with one coherent day in the historic centre.", ["Santa Catalina Monastery", "Plaza de Armas at dusk"]),
  ],
  recommendations: [{
    id: "cusco-arrival-pace",
    rule: "arrival-day-load",
    severity: "info",
    message: "Keep the arrival day geographically tight",
    evidence: "The current plan protects check-in time and keeps the evening near your Cusco base.",
    affectedDays: [1],
    confidence: "high",
    checkedAt: "2026-08-01T10:00:00.000Z",
    proposedChange: null,
    status: "open",
  }],
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

const edgeCaseTrip: EasyTTrip = {
  ...trip,
  id: "storybook-itinerary-edge-gauntlet",
  brief: {
    ...trip.brief,
    customActivities: { 1: ["Walk San Blas before dinner"] },
    bookings: [
      ...(trip.brief.bookings ?? []),
      { id: "locked-san-blas", type: "reservation", title: "Walk San Blas before dinner", date: "2026-08-21", confirmation: null, url: null },
      { id: "stay-sacred-valley", type: "stay", title: "Sacred Valley stay", date: "2026-08-24", confirmation: null, url: null },
    ],
  },
  stops: trip.stops.map((stop) => stop.id === "arequipa" ? { ...stop, latitude: null, longitude: null } : stop),
  planItems: trip.planItems.map((item) => item.dayNumber === 2 ? {
    ...item,
    type: "open",
    title: "Free day",
    reason: "Nothing is fixed yet.",
    notes: [],
    image: null,
  } : item.dayNumber === 3 ? {
    ...item,
    title: "A dense day with many activities",
    notes: Array.from({ length: 14 }, (_, index) => `Activity ${index + 1} around Cusco`),
    image: null,
  } : item.dayNumber === 5 ? {
    ...item,
    type: "stay",
    title: "Accommodation but no activities",
    notes: [],
  } : item.dayNumber === 7 ? {
    ...item,
    type: "open",
    title: "Museo Nacional de Arqueología, Antropología e Historia del Perú and the historic centre without confirmed coordinates",
    reason: "",
    notes: ["Neighbourhood walk", "Details to confirm"],
    image: null,
  } : item),
};

const longTrip: EasyTTrip = {
  ...trip,
  id: "storybook-itinerary-long-trip",
  title: "A month through Peru",
  endDate: "2026-09-21",
  planItems: Array.from({ length: 32 }, (_, index) => {
    const dayNumber = index + 1;
    const base = trip.planItems[index % trip.planItems.length]!;
    const date = new Date(Date.UTC(2026, 7, 20 + dayNumber)).toISOString().slice(0, 10);
    return { ...base, id: `long-trip-day-${dayNumber}`, dayNumber, date, title: `${base.title} · day ${dayNumber}` };
  }),
};

const longTimelineActivity =
  "Taipei 101 (Chinese: 台北101; pinyin: Táiběi Yīlíngyī; stylized in all caps), formerly known as the Taipei World Financial Center, is intentionally long canonical/provider-derived activity text.";

const longContentTrip: EasyTTrip = {
  ...trip,
  id: "storybook-itinerary-long-content",
  brief: {
    ...trip.brief,
    customActivities: {
      ...trip.brief.customActivities,
      4: [longTimelineActivity],
    },
    bookings: [
      ...(trip.brief.bookings ?? []),
      {
        id: "long-transport-booking",
        type: "transport",
        title: "Taipei 101 (Chinese: 台北101; pinyin: Táiběi Yīlíngyī; stylized in all caps), formerly known as the Taipei World Financial Center and kept here as canonical provider content",
        date: "2026-08-24",
        confirmation: "PROVIDER-CONFIRMATION-REFERENCE-THAT-REMAINS-READABLE",
        url: "https://www.example.com/booking",
      },
    ],
  },
  legs: trip.legs.map((leg) => leg.id === "cusco-valley" ? {
    ...leg,
    provider: "A planning estimate from a regional transport provider; compare rail, road and shared-transfer options before booking because operational times and pickup points can change.",
  } : leg),
  planItems: trip.planItems.map((item) => item.dayNumber === 4 ? {
    ...item,
    title: "Travel to Sacred Valley via the long-established Cusco–Pisac corridor, with a provider-derived arrival window that must stay inside the timeline card",
    notes: [
      longTimelineActivity,
      "Museo Nacional de Arqueología, Antropología e Historia del Perú with an extended provider note that must wrap without concealing timeline actions or metadata.",
    ],
  } : item),
};

const longContentSuggestions: Record<number, ItineraryDiscoveryPlace[]> = {
  4: [
    {
      id: "long-taipei-101",
      title: "Taipei 101 (Chinese: 台北101; pinyin: Táiběi Yīlíngyī; stylized in all caps), formerly known as the Taipei World Financial Center",
      area: "Sacred Valley",
      type: "Landmark",
      tags: ["Culture"],
      description: "A deliberately long provider description that should remain in the compact two-line description treatment while preserving the complete semantic text, source link and Add action.",
      image: "/journey/peru-sacred-valley-route.jpg",
      sourceUrl: "https://en.wikipedia.org/wiki/Taipei_101",
      coordinates: [-72.083, -13.333],
    },
    {
      id: "long-museum",
      title: "Museo Nacional de Arqueología, Antropología e Historia del Perú and its long-form collection name",
      area: "Sacred Valley",
      type: "Culture",
      tags: ["Culture"],
      description: "Long attraction and provider context stays bounded inside the compact card instead of widening the planning rail or pushing the Add action away.",
      coordinates: [-72.08, -13.334],
    },
  ],
};

const interestSuggestionPool: ItineraryDiscoveryPlace[] = [
  { id: "generic-loop", title: "Orientation loop", area: "Barcelona", type: "Experience", tags: [], description: "A general introduction with no classified activity evidence.", coordinates: [2.17, 41.38], qualityScore: 11 },
  { id: "food-market", title: "La Boqueria food market", area: "Barcelona", type: "Food", tags: ["Food"], description: "A market visit focused on regional ingredients and tastings.", coordinates: [2.172, 41.381], qualityScore: 11 },
  { id: "heritage-museum", title: "Picasso Museum", area: "Barcelona", type: "Culture", tags: ["Culture"], description: "A museum visit centred on art and local history.", coordinates: [2.181, 41.385], qualityScore: 11 },
  { id: "park-trail", title: "Montjuïc mountain trail", area: "Barcelona", type: "Nature", tags: ["Nature"], description: "A scenic outdoor hike following a marked hill trail.", coordinates: [2.164, 41.364], qualityScore: 11 },
  { id: "botanical-garden", title: "Barcelona Botanical Garden", area: "Barcelona", type: "Nature", tags: ["Nature"], description: "A calm garden with Mediterranean plants and natural scenery.", coordinates: [2.158, 41.362], qualityScore: 11 },
  { id: "beach-kayak", title: "Barceloneta beach kayaking", area: "Barcelona", type: "Beach", tags: ["Beach"], description: "A coastal water activity from the city beach.", coordinates: [2.192, 41.377], qualityScore: 11 },
  { id: "city-viewpoint", title: "Bunkers del Carmel city viewpoint", area: "Barcelona", type: "Cities", tags: ["Cities"], description: "An urban viewpoint across the city skyline.", coordinates: [2.161, 41.419], qualityScore: 11 },
  { id: "coastal-quarter", title: "Barceloneta neighbourhood architecture walk", area: "Barcelona", type: "Cities", tags: ["Cities", "Beach"], description: "A city walking tour through a seaside neighbourhood and its architecture.", coordinates: [2.19, 41.38], qualityScore: 11 },
];

function tripWithInterests(interests: TripInterest[]): EasyTTrip {
  return {
    ...trip,
    id: `storybook-itinerary-${interests.join("-")}`,
    title: "Barcelona city and coast",
    brief: {
      ...trip.brief,
      origin: "Madrid",
      selectedPlaces: { cusco: [] },
      mapPins: [],
      bookings: [],
      intent: {
        ...trip.brief.intent!,
        preferences: { ...trip.brief.intent!.preferences, interests },
      },
    },
    stops: trip.stops.map((stop) => stop.id === "cusco" ? { ...stop, name: "Barcelona", country: "Spain", latitude: 41.3874, longitude: 2.1686 } : stop),
    planItems: trip.planItems.map((item) => item.stopId === "cusco" ? { ...item, title: item.dayNumber === 1 ? "Arrive in Barcelona" : "Explore Barcelona", notes: item.dayNumber === 1 ? ["Keep the arrival day close to the centre"] : ["Keep the day flexible across one district"] } : item),
  };
}

const meta = {
  title: "Morrovia/05 Product Patterns/Trip workspace/Itinerary",
  component: TripItineraryWorkspace,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/journey/cusco-sacred-valley-arequipa/itinerary" } } },
  decorators: [(Story, context) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh" }}>{context.args.presentation === "legacy" ? <Story /> : <><EasyTNavigation current="trips" /><TripShell trip={context.args.trip} cacheTrip={false}><Story /></TripShell></>}</main>],
  args: {
    trip,
    presentation: "shell",
    initialSuggestions: {
      1: [
        { id: "wiki-qorikancha", title: "Qorikancha", area: "Cusco", type: "Culture", tags: ["Cities"], description: "A compact historic anchor close to the centre, suitable for the flexible part of this arrival day.", image: "/journey/peru-sacred-valley-route.jpg", sourceUrl: "https://en.wikipedia.org/wiki/Coricancha", coordinates: [-71.981, -13.519], qualityScore: 11 },
        { id: "wiki-plaza-armas", title: "Plaza de Armas", area: "Cusco", type: "Landmark", tags: ["Cities"], description: "An easy central stop that can fit before dinner without adding a cross-city transfer.", coordinates: [-71.9789, -13.5163], qualityScore: 8 },
      ],
    },
  },
} satisfies Meta<typeof TripItineraryWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FoodAndCultureRecommendations: Story = {
  args: { trip: tripWithInterests(["food", "culture"]), initialSuggestions: { 1: interestSuggestionPool } },
};

export const NatureAndHikingRecommendations: Story = {
  args: { trip: tripWithInterests(["nature", "hiking"]), initialSuggestions: { 1: interestSuggestionPool } },
};

export const BeachAndCitiesRecommendations: Story = {
  args: { trip: tripWithInterests(["beach", "cities"]), initialSuggestions: { 1: interestSuggestionPool } },
};

export const UnscheduledSavedIdea: Story = {
  args: { trip: { ...trip, brief: { ...trip.brief, itineraryIdeas: [{ id: "idea-cusco-wiki-qorikancha", stopId: "cusco", placeId: "wiki-qorikancha", title: "Qorikancha", category: "activity", coordinates: [-71.981, -13.519], source: "destination-highlight", reasons: ["destination-significance"] }] } } },
};

export const RecommendationAlreadyScheduled: Story = {
  args: { trip: { ...trip, brief: { ...trip.brief, itineraryIdeas: [{ id: "idea-cusco-wiki-qorikancha", stopId: "cusco", placeId: "wiki-qorikancha", title: "Qorikancha", category: "activity", coordinates: [-71.981, -13.519], source: "destination-highlight", reasons: ["destination-significance", "interest-relevance"], dayId: "day-2" }] } } },
};

export const RichDayPlannerIntegrated: Story = {
  args: {
    trip: {
      ...trip,
      id: "storybook-itinerary-rich-day-integrated",
      brief: {
        ...trip.brief,
        itineraryIdeas: [
          { id: "idea-cusco-qorikancha", stopId: "cusco", placeId: "qorikancha", title: "Qorikancha", category: "activity", coordinates: [-71.981, -13.519], source: "destination-highlight", reasons: ["destination-significance"], dayId: "day-2", dayPart: "morning" },
          { id: "idea-cusco-market", stopId: "cusco", placeId: "san-pedro-market", title: "San Pedro Market", category: "restaurant", coordinates: [-71.9821, -13.5207], source: "personalised-recommendation", reasons: ["interest-relevance"], dayId: "day-2", dayPart: null },
        ],
      },
    },
    selectedDayNumber: 2,
  },
};

export const TourCapture: Story = {
  args: { trip: tourTripFixture, selectedDayNumber: 2 },
};

export const RecommendationDefault: Story = {};

export const ActivityHandoffViator: Story = RecommendationDefault;

export const ActivityHandoffTripComFallback: Story = {
  args: { activityAction: getActivityBookingAction({ category: "activities" }, { viator: null, tripCom: affiliatePartners.tripCom }) },
};

export const ActivityHandoffUnavailable: Story = { args: { activityAction: null } };

export const ActivityHandoffLongDestination: Story = {
  args: {
    trip: {
      ...trip,
      stops: trip.stops.map((stop) => stop.id === "cusco" ? { ...stop, name: "The Historic Centre and Hillside Neighbourhoods of Cusco" } : stop),
    },
  },
};

export const RecommendationNoImage: Story = {
  args: {
    initialSuggestions: {
      1: [{ id: "wiki-plaza-armas", title: "Plaza de Armas", area: "Cusco", type: "Landmark", tags: ["Cities"], description: "An easy central stop that can fit before dinner without adding a cross-city transfer.", coordinates: [-71.9789, -13.5163], qualityScore: 8 }],
    },
  },
};

export const RecommendationInterestMatch: Story = FoodAndCultureRecommendations;

export const RecommendationAlreadySaved: Story = UnscheduledSavedIdea;

export const RecommendationAlreadyAdded: Story = RecommendationAlreadyScheduled;

export const RecommendationDayPickerOpen: Story = {
  play: async ({ canvasElement }) => {
    const trigger = [...canvasElement.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.getAttribute("aria-label")?.includes("Choose day and part of day"));
    trigger?.click();
  },
};

export const EmptyDayWithSidebarSuggestion: Story = {
  args: { trip: edgeCaseTrip, selectedDayNumber: 2, initialSuggestions: { 2: [interestSuggestionPool[0]] } },
};

export const ClickAddAutomaticallyPlaced: Story = {
  play: async ({ canvasElement }) => {
    const add = [...canvasElement.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Add to Day"));
    add?.click();
  },
};

export const ExplicitDayPartPlacement: Story = RecommendationDayPickerOpen;

export const SuggestionDraggingOverMorning: Story = {
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>("[data-itinerary-suggestion-id]");
    const target = canvasElement.querySelector<HTMLElement>("[data-day-part='morning'] [data-drop-index='0']");
    if (!card || !target) return;
    const transfer = new DataTransfer();
    card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: transfer }));
  },
};

export const SavedIdeaScheduling: Story = UnscheduledSavedIdea;
export const AlreadyAddedSuggestionState: Story = RecommendationAlreadyScheduled;
export const MobileAddFallback390: Story = { ...RecommendationDefault, globals: { viewport: { value: "morrovia390", isRotated: false } } };

export const HeaderMoreMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    [...canvasElement.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "More")?.click();
  },
};

export const AddNoteComposerOpen: Story = {
  play: async ({ canvasElement }) => {
    [...canvasElement.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Add note"))?.click();
  },
};

export const AddNoteMobileSheet390: Story = {
  ...AddNoteComposerOpen,
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};

export const FindIdeasFocused: Story = {
  play: async ({ canvasElement }) => {
    [...canvasElement.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Find ideas"))?.click();
  },
};

export const FindIdeasMobileSheet390: Story = {
  ...FindIdeasFocused,
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};

export const SparseRecommendationEvidence: Story = {
  args: { trip: tripWithInterests([]), initialSuggestions: { 1: [interestSuggestionPool[0]] } },
};

export const AccommodationNeeded: Story = {
  args: { trip: { ...trip, id: "storybook-itinerary-accommodation-needed", brief: { ...trip.brief, bookings: (trip.brief.bookings ?? []).filter((booking) => booking.type !== "stay") } } },
};

export const AccommodationBooked: Story = {
  args: { trip },
};

export const SameCityArrival: Story = {
  args: {
    trip: {
      ...trip,
      id: "storybook-itinerary-same-city-arrival",
      brief: { ...trip.brief, origin: "Cusco", originCanonicalPlaceId: "cusco" },
      legs: [{
        id: "storybook-same-city-arrival-leg", fromStopId: "storybook-itinerary-same-city-arrival-origin", toStopId: "cusco",
        fromEndpoint: { kind: "origin", id: "storybook-itinerary-same-city-arrival-origin", name: "Cusco", canonicalPlaceId: "cusco", coordinates: [-71.967, -13.532] },
        toEndpoint: { kind: "stop", id: "cusco", name: "Cusco", country: "Peru", canonicalPlaceId: "cusco", coordinates: [-71.967, -13.532] },
        classification: "arrival", mode: "walk", distanceKm: 0, durationMinutes: 0, doorToDoorMinutes: 0, provider: "The journey origin and first overnight stop are the same canonical place.", provenance: "planning_estimate", routeMetadata: { source: "canonical-endpoint-identity" },
      }, ...trip.legs.slice(1)],
    },
    selectedDayNumber: 1,
  },
};

export const AccommodationNeededMobile320: Story = { ...AccommodationNeeded, globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const AccommodationNeededMobile390: Story = { ...AccommodationNeeded, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const AccommodationNeededTablet768: Story = { ...AccommodationNeeded, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const AccommodationNeededDesktop1024: Story = { ...AccommodationNeeded, globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const AccommodationNeededDesktop1440: Story = { ...AccommodationNeeded, globals: { viewport: { value: "morrovia1440", isRotated: false } } };

export const LegacyPresentation: Story = {
  args: {
    presentation: "legacy",
    selectedPlaceCount: 5,
    onEditBrief: () => undefined,
    onOpenMap: () => undefined,
  },
};

export const TravelDay: Story = {
  play: async ({ canvasElement }) => {
    const buttons = canvasElement.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons[3]?.click();
  },
};

export const DeepLinkedTravelDay: Story = { args: { selectedDayNumber: 4 } };

export const MissingImageAndLongTitle: Story = {
  args: {
    trip: {
      ...trip,
      planItems: trip.planItems.map((item, index) => index === 0 ? {
        ...item,
        title: "Arrive in Cusco and settle into the historic centre without rushing the first afternoon",
        image: null,
      } : item),
    },
  },
};

export const EmptyDay: Story = { args: { trip: edgeCaseTrip, selectedDayNumber: 2 } };

export const DenseDay: Story = { args: { trip: edgeCaseTrip, selectedDayNumber: 3 } };

export const PartialDayWithoutCoordinates: Story = { args: { trip: edgeCaseTrip, selectedDayNumber: 7 } };

export const LongTripLateDay: Story = { args: { trip: longTrip, selectedDayNumber: 30 } };

export const LongContentContainment: Story = {
  args: { trip: longContentTrip, selectedDayNumber: 4, initialSuggestions: longContentSuggestions },
};

export const RecommendationLongTitle: Story = {
  args: {
    initialSuggestions: {
      1: [{
        id: "long-recommendation-title",
        title: "Museo Nacional de Arqueología, Antropología e Historia del Perú and its long-form collection name",
        area: "Cusco",
        type: "Culture",
        tags: ["Culture"],
        description: "Long provider-backed attraction context remains readable without widening the planning rail or displacing the Add action.",
        image: "/journey/peru-sacred-valley-route.jpg",
        coordinates: [-71.98, -13.52],
        qualityScore: 9,
      }],
    },
  },
};

export const RecommendationMobile320: Story = { ...RecommendationDefault, globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const RecommendationMobile390: Story = { ...RecommendationDefault, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const RecommendationTablet768: Story = { ...RecommendationDefault, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const RecommendationDesktop1024: Story = { ...RecommendationDefault, globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const RecommendationDesktop1440: Story = { ...RecommendationDefault, globals: { viewport: { value: "morrovia1440", isRotated: false } } };

export const LongContentMobile320: Story = { ...LongContentContainment, globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const LongContentMobile390: Story = { ...LongContentContainment, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const LongContentTablet768: Story = { ...LongContentContainment, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const LongContentDesktop1024: Story = { ...LongContentContainment, globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const LongContentDesktop1440: Story = { ...LongContentContainment, globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const LongContentDesktop1680: Story = { ...LongContentContainment, globals: { viewport: { value: "morrovia1680", isRotated: false } } };

export const IncompleteItinerary: Story = { args: { trip: { ...trip, planItems: [] } } };

export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile430: Story = { globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Tablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const Desktop1024: Story = { globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const Desktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };
