import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EasyTTrip } from "@/lib/easyt/trip";
import TripShell, { TripWorkspacePlaceholder } from "./trip-shell";

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
    {
      id: "cusco-arrival",
      stopId: "cusco",
      dayNumber: 1,
      date: "2026-08-21",
      type: "arrival",
      title: "Arrive in Cusco",
      reason: "A protected arrival day.",
      notes: [],
      startsAt: null,
      endsAt: null,
      bookingUrl: null,
      latitude: null,
      longitude: null,
      image: "/journey/peru-sacred-valley-route.jpg",
      sourceUrl: null,
    },
  ],
  recommendations: [],
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

const meta = {
  title: "Morrovia/04 Structure/Trip shell",
  component: TripShell,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/journey/cusco-sacred-valley-arequipa" },
    },
  },
  decorators: [
    (Story) => (
      <main className="morrovia-editorial-page" style={{ minHeight: "100vh", paddingTop: 1 }}>
        <Story />
      </main>
    ),
  ],
} satisfies Meta<typeof TripShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  args: {
    trip,
    children: (
      <TripWorkspacePlaceholder
        title="Overview"
        description="Temporary foundation placeholder for responsive shell verification."
      />
    ),
  },
};

export const Itinerary: Story = {
  args: {
    trip,
    children: (
      <TripWorkspacePlaceholder
        title="Itinerary"
        description="Temporary foundation placeholder for the future itinerary body."
      />
    ),
  },
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/cusco-sacred-valley-arequipa/itinerary" } },
  },
};

export const MapWorkspace: Story = {
  args: {
    trip,
    children: (
      <TripWorkspacePlaceholder
        title="Map"
        description="Temporary foundation placeholder for the future shell-based map workspace."
      />
    ),
  },
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/cusco-sacred-valley-arequipa/map" } },
  },
};

export const LongTitleAndMissingImage: Story = {
  args: {
    trip: {
      ...trip,
      title: "A deliberately long journey from Cusco through the Sacred Valley, Lake Titicaca & Arequipa",
      startDate: "",
      endDate: "",
      planItems: [],
    },
    children: (
      <TripWorkspacePlaceholder
        title="Overview"
        description="Missing imagery and incomplete dates use the shell’s intentional fallback treatments."
      />
    ),
  },
};

export const Mobile320: Story = {
  ...Overview,
  parameters: { ...meta.parameters },
  globals: { viewport: { value: "morrovia320", isRotated: false } },
};

export const Tablet768: Story = {
  ...Overview,
  parameters: { ...Overview.parameters },
  globals: { viewport: { value: "morrovia768", isRotated: false } },
};

export const Desktop1024: Story = {
  ...Overview,
  parameters: { ...Overview.parameters },
  globals: { viewport: { value: "morrovia1024", isRotated: false } },
};

export const Desktop1440: Story = {
  ...Overview,
  parameters: { ...Overview.parameters },
  globals: { viewport: { value: "morrovia1440", isRotated: false } },
};
