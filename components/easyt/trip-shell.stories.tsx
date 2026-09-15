import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { saveTripRecoveryToStorage, tripRecoveryStorageKey } from "@/lib/easyt/storage";
import { setStorybookAuthOwner } from "../../.storybook/auth-client.mock";
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

function HistoricalRecoveryShell() {
  setStorybookAuthOwner("storybook-traveller");
  const [ready, setReady] = useState(false);
  const writeId = "storybook-historical-recovery";
  useEffect(() => {
    saveTripRecoveryToStorage(window.localStorage, {
      ...trip,
      title: "Cusco device notes",
      brief: { ...trip.brief, customTitle: "Cusco device notes" },
    }, { state: "conflict", writeId, now: "2026-09-14T08:00:00.000Z" });
    setReady(true);
    return () => window.localStorage.removeItem(tripRecoveryStorageKey(trip.ownerId, trip.id, writeId));
  }, []);
  return ready ? <TripShell trip={trip}><TripWorkspacePlaceholder title="Overview" description="The cloud trip remains saved while its separate device copy is reviewed." /></TripShell> : null;
}

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

export const CleanTrip: Story = Overview;
export const GenuineHistoricalDeviceDivergence: Story = { ...Overview, render: () => <HistoricalRecoveryShell /> };

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

export const GeneratedOneCountry: Story = {
  args: {
    trip: { ...trip, brief: { ...trip.brief, customTitle: null } },
    children: <TripWorkspacePlaceholder title="Overview" description="A single-country route uses the country as its concise trip identity." />,
  },
};

export const GeneratedTwoCountries: Story = {
  args: {
    trip: {
      ...trip,
      brief: { ...trip.brief, customTitle: null },
      stops: [
        { ...trip.stops[0]!, id: "paris", name: "Paris", country: "France" },
        { ...trip.stops[1]!, id: "bruges", name: "Bruges", country: "Belgium" },
      ],
    },
    children: <TripWorkspacePlaceholder title="Overview" description="Two resolved countries remain concise while the route stays on its own line." />,
  },
};

export const GeneratedLongMultiCountry: Story = {
  args: {
    trip: {
      ...trip,
      brief: { ...trip.brief, customTitle: null },
      stops: [
        { ...trip.stops[0]!, id: "paris", name: "Paris", country: "France" },
        { ...trip.stops[1]!, id: "bruges", name: "Bruges", country: "Belgium" },
        { ...trip.stops[2]!, id: "amsterdam", name: "Amsterdam", country: "Netherlands" },
        { ...trip.stops[2]!, id: "cologne", order: 3, name: "Cologne", country: "Germany" },
        { ...trip.stops[2]!, id: "prague", order: 4, name: "Prague", country: "Czechia" },
      ],
    },
    children: <TripWorkspacePlaceholder title="Overview" description="Long multi-country identities stay bounded without hiding the route." />,
  },
};

export const CustomUnicodeTitle: Story = {
  args: {
    trip: { ...trip, title: "春の家族旅行 — Perú", brief: { ...trip.brief, customTitle: "春の家族旅行 — Perú" } },
    children: <TripWorkspacePlaceholder title="Overview" description="Traveller-authored Unicode names survive the shared shell presentation." />,
  },
};

export const LongCustomTitle: Story = {
  args: {
    trip: { ...trip, title: "A long-awaited spring journey with family across old favourites and entirely new places", brief: { ...trip.brief, customTitle: "A long-awaited spring journey with family across old favourites and entirely new places" } },
    children: <TripWorkspacePlaceholder title="Overview" description="Long custom identity wraps independently of the unchanged route line." />,
  },
};

export const Mobile320: Story = {
  ...Overview,
  parameters: { ...meta.parameters },
  globals: { viewport: { value: "morrovia320", isRotated: false } },
};

export const Mobile390LongGeneratedTitle: Story = {
  ...GeneratedLongMultiCountry,
  globals: { viewport: { value: "morrovia390", isRotated: false } },
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
