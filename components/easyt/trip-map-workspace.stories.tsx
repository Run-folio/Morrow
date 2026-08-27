import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import "maplibre-gl/dist/maplibre-gl.css";
import TripShell from "./trip-shell";
import TripMapWorkspace from "./trip-map-workspace";
import { JourneyMapPlannerWorkspace, type JourneyMapPlannerWorkspaceProps } from "@/components/journey-map-planner-workspace";
import type { EasyTTrip, PlanItem } from "@/lib/easyt/trip";

const image = "/journey/peru-sacred-valley-route.jpg";

const day = (dayNumber: number, stopId: string, title: string, type: PlanItem["type"] = "activity", dayImage = image): PlanItem => ({
  id: `map-day-${dayNumber}`,
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
  image: dayImage,
  sourceUrl: null,
});

const trip: EasyTTrip = {
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
    bookings: [{ id: "stay-cusco", type: "stay", title: "Cusco stay", date: "2026-08-21", confirmation: null, url: null }],
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
    day(1, "cusco", "Arrive in Cusco", "arrival"),
    day(2, "cusco", "Explore Cusco"),
    day(3, "cusco", "Explore Cusco"),
    day(4, "sacred-valley", "Travel to Sacred Valley", "transport"),
    day(5, "sacred-valley", "Explore Sacred Valley"),
    day(6, "arequipa", "Travel to Arequipa", "transport"),
    day(7, "arequipa", "Explore Arequipa"),
  ],
  recommendations: [],
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

const indiaImages = {
  delhi: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Jama_Masjid_2011.jpg/330px-Jama_Masjid_2011.jpg",
  agra: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Taj_Mahal%2C_Agra%2C_India.jpg/330px-Taj_Mahal%2C_Agra%2C_India.jpg",
  jaipur: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/East_facade_Hawa_Mahal_Jaipur_from_ground_level_%28July_2022%29_-_img_01.jpg/330px-East_facade_Hawa_Mahal_Jaipur_from_ground_level_%28July_2022%29_-_img_01.jpg",
};

const indiaPlaceMedia = {
  Delhi: {
    image: indiaImages.delhi,
    alt: "Jama Masjid in Delhi",
    description: "Delhi is India's capital territory, where Old Delhi's historic lanes sit beside New Delhi's broad civic avenues.",
    learnMoreUrl: "https://en.wikipedia.org/wiki/Delhi",
  },
  Agra: {
    image: indiaImages.agra,
    alt: "The Taj Mahal in Agra",
    description: "Agra is a historic city on the Yamuna, best known for the Taj Mahal and its legacy as a centre of the Mughal Empire.",
    learnMoreUrl: "https://en.wikipedia.org/wiki/Agra",
  },
  Jaipur: {
    image: indiaImages.jaipur,
    alt: "The Hawa Mahal in Jaipur",
    description: "Jaipur, Rajasthan's capital, is known as the Pink City for its rose-coloured old quarter, palaces and planned avenues.",
    learnMoreUrl: "https://en.wikipedia.org/wiki/Jaipur",
  },
};

let goldenTrianglePlaceFixtureInstalled = false;

function installGoldenTrianglePlaceFixture() {
  if (typeof window === "undefined" || goldenTrianglePlaceFixtureInstalled) return;
  goldenTrianglePlaceFixtureInstalled = true;
  const fetchFromStory = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const value = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(value, window.location.origin);
    if (url.pathname.includes("/copilot/actions/") && url.pathname.endsWith("/apply")) {
      return new Response(JSON.stringify({ trip: goldenTriangleTrip, applied: true, idempotent: false }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname.endsWith("/copilot")) {
      const impacts = { dates: { before: "2026-08-27 → 2026-09-05", after: "2026-08-27 → 2026-09-06", changed: true }, route: { changedStopCount: 2, changedStops: ["Agra", "Jaipur"] }, transfers: { changed: false, warningCount: 0 }, itinerary: { changedDayCount: 3 }, health: { before: "needs-review", after: "needs-review", openIssuesBefore: 1, openIssuesAfter: 2 }, readiness: { before: 2, after: 1, readyBefore: false, readyAfter: false } };
      const action = { action: "change_stop_nights", stopId: "agra", nights: 3 };
      const option = (previewId: string, summary: string, changes: Array<{ label: string; before: string; after: string }>) => ({ previewId, canApply: true, expiresAt: "2026-08-27T13:00:00.000Z", action, summary, changes, impacts, warnings: [] });
      return new Response(JSON.stringify({ answer: "There is more than one safe way to make that change. Choose the outcome you want to review.", scope: "stop", proposedChange: { type: "change_stop_nights", summary: "Choose how Morrovia should make this change" }, mutationPreview: { action, summary: "Choose how Morrovia should make this change", canApply: false, preview: null, alternatives: [option("11111111-1111-4111-8111-111111111111", "Add one day to the trip", [{ label: "Agra", before: "2 nights", after: "3 nights" }, { label: "Trip end", before: "5 Sep", after: "6 Sep" }]), option("22222222-2222-4222-8222-222222222222", "Move one night from Jaipur to Agra", [{ label: "Agra", before: "2 nights", after: "3 nights" }, { label: "Jaipur", before: "4 nights", after: "3 nights" }])], warnings: ["Choose one outcome before applying."] } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname !== "/api/journey-place") return fetchFromStory(input, init);
    const title = url.searchParams.get("title") as keyof typeof indiaPlaceMedia | null;
    const media = title ? indiaPlaceMedia[title] : undefined;
    return new Response(JSON.stringify({ place: media ? {
      ...media,
      sourceUrl: media.learnMoreUrl,
      sourceLabel: "Wikimedia Commons",
      descriptionSourceLabel: "Wikipedia",
    } : null }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

const indiaDay = (dayNumber: number, stopId: keyof typeof indiaImages, title: string, type: PlanItem["type"] = "activity") => ({
  ...day(dayNumber, stopId, title, type, indiaImages[stopId]),
  id: `india-day-${dayNumber}`,
  date: new Date(Date.UTC(2026, 7, 26 + dayNumber)).toISOString().slice(0, 10),
});

const goldenTriangleTrip: EasyTTrip = {
  ...trip,
  id: "delhi-agra-jaipur",
  title: "Delhi, Agra & Jaipur",
  startDate: "2026-08-27",
  endDate: "2026-09-05",
  brief: {
    ...trip.brief,
    origin: "Delhi",
    mustDo: "Taj Mahal and Rajasthan",
    bookings: [],
  },
  stops: [
    { id: "delhi", order: 0, name: "Delhi", country: "India", latitude: 28.7041, longitude: 77.1025, arrivalDate: "2026-08-27", departureDate: "2026-08-31", nights: 4 },
    { id: "agra", order: 1, name: "Agra", country: "India", latitude: 27.1767, longitude: 78.0081, arrivalDate: "2026-08-31", departureDate: "2026-09-02", nights: 2 },
    { id: "jaipur", order: 2, name: "Jaipur", country: "India", latitude: 26.9124, longitude: 75.7873, arrivalDate: "2026-09-02", departureDate: "2026-09-06", nights: 4 },
  ],
  legs: [
    { id: "delhi-agra", fromStopId: "delhi", toStopId: "agra", mode: "train", distanceKm: 233, durationMinutes: 210, provider: "Morrovia planning estimate; compare current rail schedules before booking.", routeMetadata: { planningEstimate: true, transferImpact: { headline: { status: "known", value: { planningMinutes: 120 } }, doorToDoor: { status: "known", value: { planningMinutes: 210 } } } } },
    { id: "agra-jaipur", fromStopId: "agra", toStopId: "jaipur", mode: "train", distanceKm: 222, durationMinutes: 210, provider: "Morrovia planning estimate; compare rail and road schedules before booking.", routeMetadata: { planningEstimate: true, transferImpact: { headline: { status: "known", value: { planningMinutes: 120 } }, doorToDoor: { status: "known", value: { planningMinutes: 210 } } } } },
  ],
  planItems: [
    indiaDay(1, "delhi", "Arrive in Delhi", "arrival"),
    indiaDay(2, "delhi", "Old Delhi and Jama Masjid"),
    indiaDay(3, "delhi", "New Delhi landmarks"),
    indiaDay(4, "delhi", "A slower Delhi day"),
    indiaDay(5, "agra", "Train to Agra", "transport"),
    indiaDay(6, "agra", "Taj Mahal at first light"),
    indiaDay(7, "jaipur", "Train to Jaipur", "transport"),
    indiaDay(8, "jaipur", "Amber Fort and the old city"),
    indiaDay(9, "jaipur", "Markets, crafts and food"),
    indiaDay(10, "jaipur", "A flexible Jaipur finish"),
  ],
};

const goldenTriangleWithPin: EasyTTrip = {
  ...goldenTriangleTrip,
  brief: {
    ...goldenTriangleTrip.brief,
    mapPins: [{ id: "saved-red-fort", title: "Red Fort sunrise", category: "activity", dayNumber: 2, longitude: 77.241, latitude: 28.6562 }],
  },
};

function TripMapStory({ storyTrip, presentation = "shell", storyState }: { storyTrip: EasyTTrip; presentation?: "shell" | "focused"; storyState?: JourneyMapPlannerWorkspaceProps["storyState"] }) {
  if (presentation === "focused") return <JourneyMapPlannerWorkspace trip={storyTrip} presentation="focused" storyState={storyState} />;
  return <TripShell trip={storyTrip}><TripMapWorkspace trip={storyTrip} storyState={storyState} /></TripShell>;
}

const meta = {
  title: "Components/Trip map workspace",
  component: TripMapStory,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/cusco-sacred-valley-arequipa/map" } },
  },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", paddingTop: 1 }}><Story /></main>],
  args: { storyTrip: trip },
} satisfies Meta<typeof TripMapStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActivePlanning: Story = {};

export const GoldenTriangle: Story = {
  args: { storyTrip: goldenTriangleTrip },
  decorators: [(Story) => {
    installGoldenTrianglePlaceFixture();
    return <><style>{`aside[role="alert"]{display:none!important}`}</style><Story /></>;
  }],
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/delhi-agra-jaipur/map" } },
  },
};

export const StayDeepLink: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/journey/cusco-sacred-valley-arequipa/map",
        query: { stop: "sacred-valley", mode: "stay" },
      },
    },
  },
};

export const FocusedLegacyRoute: Story = {
  args: { presentation: "focused" },
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/journey/plan" } } },
};

export const HealthWarning: Story = {
  args: {
    storyTrip: {
      ...trip,
      stops: trip.stops.map((stop) => stop.id === "arequipa" ? { ...stop, nights: 1 } : stop),
      legs: trip.legs.map((leg) => leg.id === "valley-arequipa" ? { ...leg, mode: "road", durationMinutes: 480, distanceKm: 615 } : leg),
    },
  },
};

export const MissingImagery: Story = {
  args: { storyTrip: { ...trip, planItems: trip.planItems.map((item) => ({ ...item, image: null })) } },
};

export const UnknownTransport: Story = {
  args: {
    storyTrip: {
      ...trip,
      legs: trip.legs.map((leg) => leg.id === "valley-arequipa"
        ? { ...leg, mode: "unknown", durationMinutes: null, distanceKm: null, provider: null, routeMetadata: {} }
        : leg),
    },
  },
};

export const Mobile320: Story = { parameters: { viewport: { defaultViewport: "morrovia320" } } };
export const Mobile390: Story = { parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile430: Story = { parameters: { viewport: { defaultViewport: "morrovia430" } } };
export const Tablet768: Story = { parameters: { viewport: { defaultViewport: "morrovia768" } } };

/* Restoration acceptance matrix: each state is independently reachable and
   safe to render in the static Storybook build. */
export const InitialBrandedOverview: Story = GoldenTriangle;

export const DetailedBasemap: Story = {
  ...GoldenTriangle,
  args: { storyTrip: goldenTriangleTrip, storyState: { mapMode: "detail" } },
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/journey/delhi-agra-jaipur/map", query: { stop: "delhi", mode: "plan" } } } },
};

export const AddPinCollapsed: Story = GoldenTriangle;

export const AddPinChooseLocation: Story = {
  ...GoldenTriangle,
  args: { storyTrip: goldenTriangleTrip, storyState: { mapMode: "detail", pinPlacement: true } },
  parameters: DetailedBasemap.parameters,
};

export const AddPinNameLocation: Story = {
  ...GoldenTriangle,
  args: { storyTrip: goldenTriangleTrip, storyState: { mapMode: "detail", pinCoordinates: [77.188, 28.626] } },
  parameters: DetailedBasemap.parameters,
};

export const SavedPinReloaded: Story = {
  args: { storyTrip: goldenTriangleWithPin, storyState: { mapMode: "detail" } },
  decorators: GoldenTriangle.decorators,
  parameters: DetailedBasemap.parameters,
};

export const RenameDeletePin: Story = {
  ...SavedPinReloaded,
  args: { storyTrip: goldenTriangleWithPin, storyState: { mapMode: "detail", selectedPlannerPinId: "saved-red-fort" } },
};

export const RichDestinationEmbedded: Story = DetailedBasemap;

export const RichDestinationFullscreen: Story = {
  ...DetailedBasemap,
  args: { storyTrip: goldenTriangleTrip, storyState: { mapMode: "detail", expandedMap: true, destinationExpanded: true } },
};

export const RichDestinationClosed: Story = {
  ...DetailedBasemap,
  args: { storyTrip: goldenTriangleTrip, storyState: { mapMode: "detail", expandedMap: true, destinationExpanded: false } },
};

export const ShapeDayAndTripHealth: Story = GoldenTriangle;

export const MissingDestinationDescription: Story = {
  args: {
    storyTrip: {
      ...trip,
      stops: trip.stops.map((stop) => stop.id === "cusco" ? { ...stop, name: "Mapped stop without editorial copy" } : stop),
      planItems: trip.planItems.map((item) => item.stopId === "cusco" ? { ...item, image: null } : item),
    },
  },
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/journey/cusco-sacred-valley-arequipa/map", query: { stop: "cusco", mode: "plan" } } } },
};

export const Mobile390Restoration: Story = {
  ...DetailedBasemap,
  parameters: { ...DetailedBasemap.parameters, viewport: { defaultViewport: "morrovia390" } },
};

export const Mobile390Overview: Story = {
  ...GoldenTriangle,
  parameters: { ...GoldenTriangle.parameters, viewport: { defaultViewport: "morrovia390" } },
};

export const Mobile390PinComposer: Story = {
  ...AddPinNameLocation,
  parameters: { ...AddPinNameLocation.parameters, viewport: { defaultViewport: "morrovia390" } },
};

export const Mobile390RichFullscreen: Story = {
  ...RichDestinationFullscreen,
  parameters: { ...RichDestinationFullscreen.parameters, viewport: { defaultViewport: "morrovia390" } },
};
