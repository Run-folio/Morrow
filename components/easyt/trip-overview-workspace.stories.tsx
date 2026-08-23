import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EasyTTrip, PlanItem } from "@/lib/easyt/trip";
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

const meta = {
  title: "Components/Trip overview workspace",
  component: TripOverviewWorkspace,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/cusco-sacred-valley-arequipa" } },
  },
  decorators: [(Story, context) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", paddingTop: 1 }}><TripShell trip={context.args.trip}><Story /></TripShell></main>],
  args: { trip: baseTrip },
} satisfies Meta<typeof TripOverviewWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActivePlanning: Story = {};

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

export const EarlyIncomplete: Story = {
  args: { trip: { ...baseTrip, planItems: baseTrip.planItems.slice(0, 2), brief: { ...baseTrip.brief, bookings: [], checklist: [] } } },
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

export const Mobile320: Story = { parameters: { viewport: { defaultViewport: "morrovia320" } } };
export const Mobile390: Story = { parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile430: Story = { parameters: { viewport: { defaultViewport: "morrovia430" } } };
export const Tablet768: Story = { parameters: { viewport: { defaultViewport: "morrovia768" } } };
