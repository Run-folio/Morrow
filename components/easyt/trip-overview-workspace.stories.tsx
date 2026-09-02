import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { BookingReadinessAction } from "@/lib/easyt/booking-readiness";
import type { EasyTTrip, PlanItem } from "@/lib/easyt/trip";
import type { ReadinessCard, TravelReadinessProfile } from "@/lib/easyt/travel-readiness";
import { tourTripFixture } from "./storybook/tour-trip.fixture";
import TripOverviewWorkspace from "./trip-overview-workspace";
import TripShell from "./trip-shell";

const image = "/journey/peru-sacred-valley-route.jpg";

const planDay = (dayNumber: number, stopId: string, title: string, type: PlanItem["type"] = "activity"): PlanItem => ({
  id: `overview-day-${dayNumber}`,
  stopId,
  dayNumber,
  date: `2026-08-${String(20 + dayNumber).padStart(2, "0")}`,
  type,
  title,
  reason: dayNumber === 1 ? "A protected arrival day leaves room to settle in." : "A focused day that keeps the route realistic.",
  notes: ["Keep the day geographically coherent", "Leave the evening flexible"],
  startsAt: null,
  endsAt: null,
  bookingUrl: null,
  latitude: null,
  longitude: null,
  image,
  sourceUrl: null,
});

const baseTrip: EasyTTrip = {
  schemaVersion: 1,
  id: "cusco-sacred-valley-arequipa",
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
    selectedPlaces: {},
    routeAssessment: {
      comfortableDays: 7,
      shortfallDays: 0,
      durations: {},
      route: {
        state: "current-order",
        currentStopIds: ["cusco", "sacred-valley", "arequipa"],
        recommendedStopIds: ["cusco", "sacred-valley", "arequipa"],
        currentTransferMinutes: 465,
        recommendedTransferMinutes: 465,
        improvementMinutes: 0,
        reasons: ["The entered order ranks first under the current route criteria.", "It keeps the route moving in one direction instead of doubling back."],
        tradeoffs: ["The Arequipa connection still needs a live flight check before booking."],
        summary: "This route already flows well.",
      },
    },
    bookings: [{ id: "stay-cusco", type: "stay", title: "Cusco stay", date: "2026-08-21", confirmation: null, url: null }],
    checklist: [
      { id: "passport", label: "Check passport validity", complete: true },
      { id: "insurance", label: "Review travel insurance", complete: false },
      { id: "offline", label: "Save offline maps", complete: false },
      { id: "packing", label: "Finish packing list", complete: false },
    ],
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
    planDay(1, "cusco", "Arrive in Cusco", "arrival"),
    planDay(2, "cusco", "Explore Cusco"),
    planDay(3, "cusco", "Explore Cusco"),
    planDay(4, "sacred-valley", "Travel to Sacred Valley", "transport"),
    planDay(5, "sacred-valley", "Explore Sacred Valley"),
    planDay(6, "arequipa", "Travel to Arequipa", "transport"),
    planDay(7, "arequipa", "Explore Arequipa"),
  ],
  recommendations: [],
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

const prepProfile: TravelReadinessProfile = { nationalities: [], residenceCountry: "", passportExpiryMonth: "" };
const prepActions: BookingReadinessAction[] = [{
  id: "trip-connectivity",
  category: "connectivity",
  provider: "saily",
  title: "Set up trip connectivity",
  detail: "Compare data coverage for Peru before purchasing.",
  cta: "Check eSIM coverage",
  href: "https://saily.com/",
  tripId: baseTrip.id,
  affiliate: true,
  livePrice: false,
}, {
  id: "trip-flights",
  category: "flight",
  provider: "google-flights",
  title: "Check the Arequipa flight",
  detail: "Compare the saved route and dates with the provider.",
  cta: "Check flights",
  href: "https://www.google.com/travel/flights",
  tripId: baseTrip.id,
  affiliate: false,
  livePrice: false,
}];
const prepReadinessCards: ReadinessCard[] = [{
  id: "insurance",
  priority: "useful",
  title: "Travel insurance",
  detail: "Compare medical cover, cancellation protection and activity exclusions before you travel.",
}];

const meta = {
  title: "Morrovia/05 Product Patterns/Trip workspace/Overview",
  component: TripOverviewWorkspace,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/cusco-sacred-valley-arequipa" } },
  },
  decorators: [(Story, context) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", paddingTop: 1 }}><TripShell trip={context.args.trip} cacheTrip={false} orientationAutoStart={false}><Story /></TripShell></main>],
  args: {
    trip: baseTrip,
    initialPrepActions: prepActions,
    initialPrepReadinessCards: prepReadinessCards,
    initialPrepProfile: prepProfile,
    initialPrepProviderStatus: "available",
    now: "2026-07-20",
  },
} satisfies Meta<typeof TripOverviewWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActivePlanning: Story = {};

export const TourCapture: Story = {
  args: {
    trip: tourTripFixture,
    initialPrepActions: prepActions.map((action) => ({ ...action, tripId: tourTripFixture.id })),
  },
};

export const FirstTripArrival: Story = {
  args: { firstArrival: true },
};

export const HealthIssue: Story = {
  args: {
    trip: {
      ...baseTrip,
      stops: baseTrip.stops.map((stop) => stop.id === "arequipa" ? { ...stop, nights: 1 } : stop),
      legs: baseTrip.legs.map((leg) => leg.id === "valley-arequipa" ? { ...leg, mode: "road", durationMinutes: 480, distanceKm: 615 } : leg),
    },
  },
};

export const ReadyTrip: Story = {
  args: {
    trip: {
      ...baseTrip,
      brief: {
        ...baseTrip.brief,
        bookings: baseTrip.stops.map((stop) => ({ id: `stay-${stop.id}`, type: "stay" as const, title: `${stop.name} stay`, date: stop.arrivalDate, confirmation: null, url: null })),
        checklist: baseTrip.brief.checklist?.map((item) => ({ ...item, complete: true })),
      },
    },
  },
};

export const AllPreparationIncomplete: Story = {
  args: { trip: { ...baseTrip, brief: { ...baseTrip.brief, bookings: [], checklist: [] } }, initialPrepProfile: prepProfile },
};

export const AccommodationPartlyComplete: Story = {};

export const AccommodationComplete: Story = {
  args: {
    trip: {
      ...baseTrip,
      brief: {
        ...baseTrip.brief,
        bookings: baseTrip.stops.map((stop) => ({ id: `stay-${stop.id}`, type: "stay" as const, title: `${stop.name} stay`, date: stop.arrivalDate, confirmation: null, url: null })),
      },
    },
  },
};

export const TransportComplete: Story = {
  args: {
    trip: {
      ...baseTrip,
      brief: {
        ...baseTrip.brief,
        bookings: [
          ...(baseTrip.brief.bookings ?? []),
          ...baseTrip.legs.map((leg) => ({ id: `booking-${leg.id}`, type: "transport" as const, title: `Saved ${leg.id}`, date: null, confirmation: null, url: null })),
        ],
      },
    },
  },
};

export const TravellerDetailsComplete: Story = {
  args: { initialPrepProfile: { nationalities: ["United Kingdom"], residenceCountry: "United Kingdom", passportExpiryMonth: "2028-08" } },
};

export const EarlyIncomplete: Story = {
  args: { trip: { ...baseTrip, planItems: baseTrip.planItems.slice(0, 2), brief: { ...baseTrip.brief, bookings: [], checklist: [] } } },
};

export const MinimalTrip: Story = {
  args: {
    trip: {
      ...baseTrip,
      id: "minimal-overview",
      title: "Cusco",
      endDate: "2026-08-21",
      stops: [{ ...baseTrip.stops[0], departureDate: "2026-08-22", nights: 1 }],
      legs: [],
      planItems: [{ ...baseTrip.planItems[0], id: "minimal-day", notes: [], image: null }],
      brief: { ...baseTrip.brief, routeAssessment: undefined, bookings: [], checklist: [] },
    },
  },
};

export const LongerTrip: Story = {
  args: {
    trip: {
      ...baseTrip,
      endDate: "2026-09-03",
      planItems: Array.from({ length: 14 }, (_, index) => planDay(index + 1, baseTrip.stops[Math.min(2, Math.floor(index / 5))].id, `Plan day ${index + 1}`)),
    },
  },
};

export const ProviderUnavailable: Story = {
  args: { initialPrepActions: [], initialPrepReadinessCards: [], initialPrepProviderStatus: "unavailable" },
};

export const MissingImagesAndLongRoute: Story = {
  args: {
    trip: {
      ...baseTrip,
      stops: baseTrip.stops.map((stop, index) => index === 1 ? { ...stop, name: "The Sacred Valley and Ollantaytambo" } : stop),
      planItems: baseTrip.planItems.map((item) => ({ ...item, image: null })),
    },
  },
};

export const MissingOptionalData: Story = {
  args: {
    trip: {
      ...baseTrip,
      brief: { ...baseTrip.brief, routeAssessment: undefined, bookings: undefined, checklist: undefined },
      stops: baseTrip.stops.map((stop, index) => index === 1 ? { ...stop, latitude: null, longitude: null } : stop),
      planItems: baseTrip.planItems.map((item) => ({ ...item, image: null, notes: [] })),
    },
  },
};

export const DepartingToday: Story = { args: { now: "2026-08-21" } };
export const DepartureFarInFuture: Story = { args: { now: "2026-01-01" } };

export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile430: Story = { globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Tablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const Desktop1024: Story = { globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const Desktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const Desktop1680: Story = { globals: { viewport: { value: "morrovia1680", isRotated: false } } };
