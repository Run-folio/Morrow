import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { setStorybookAuthOwner } from "../../../.storybook/auth-client.mock";
import DashboardClient, { TripCard } from "./dashboard-client";
import styles from "./dashboard.module.css";

function cardTrip(id: string, title: string, image: string | null, status: EasyTTrip["status"] = "draft"): EasyTTrip {
  const stops = [
    { id: `${id}-lisbon`, order: 0, name: "Lisbon", country: "Portugal", latitude: 38.72, longitude: -9.14, arrivalDate: "2026-08-25", departureDate: "2026-08-30", nights: 5 },
    { id: `${id}-seville`, order: 1, name: "Seville", country: "Spain", latitude: 37.39, longitude: -5.98, arrivalDate: "2026-08-30", departureDate: "2026-09-04", nights: 5 },
    { id: `${id}-barcelona`, order: 2, name: "Barcelona", country: "Spain", latitude: 41.39, longitude: 2.17, arrivalDate: "2026-09-04", departureDate: "2026-09-09", nights: 5 },
  ];
  return {
    schemaVersion: 1,
    id,
    ownerId: "storybook-first-traveller",
    title,
    status,
    startDate: "2026-08-25",
    endDate: "2026-09-09",
    travellers: 2,
    currency: "GBP",
    brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
    stops,
    legs: [],
    planItems: Array.from({ length: 16 }, (_, index) => ({
      id: `${id}-day-${index + 1}`,
      stopId: stops[Math.min(2, Math.floor(index / 5))]!.id,
      dayNumber: index + 1,
      date: new Date(Date.UTC(2026, 7, 25 + index)).toISOString().slice(0, 10),
      type: "activity" as const,
      title: `Day ${index + 1}`,
      reason: "Planned",
      notes: [],
      startsAt: null,
      endsAt: null,
      bookingUrl: null,
      latitude: null,
      longitude: null,
      image: index === 0 ? image : null,
    })),
    recommendations: [],
    createdAt: "2026-08-25T12:00:00.000Z",
    updatedAt: `2026-08-25T12:0${id.slice(-1)}:00.000Z`,
  };
}

const cardTrips = [
  cardTrip("storybook-trip-1", "Lisbon, Seville & Barcelona", "/journey/portugal-atlantic-route.jpg"),
  cardTrip("storybook-trip-2", "Gatwick, Santiago, Easter Island, Puerto de Punta Arenas & Tierra del Fuego", "/journey/peru-sacred-valley-route.jpg"),
  cardTrip("storybook-trip-3", "Lisbon, Seville & Barcelona", null),
  cardTrip("storybook-trip-4", "Lisbon, Seville & Barcelona", "/journey/portugal-atlantic-route.jpg"),
];

const populatedStamps = [
  { countryId: "portugal", status: "visited" as const },
  { countryId: "spain", status: "visited" as const },
  { countryId: "japan", status: "want" as const },
];

const cardCopy = {
  routeWaiting: "Route to confirm",
  edit: "Edit trip",
  restore: "Restore",
  archive: "Archive",
  duplicate: "Duplicate",
  gift: "Share",
  delete: "Delete",
};

const renderCardGrid = () => <div className={styles.tripGrid}>{cardTrips.map((trip) => <TripCard
  key={trip.id}
  trip={trip}
  language="en"
  copy={cardCopy}
  working={false}
  workingAction={null}
  onAction={() => undefined}
  onGift={() => undefined}
  onRemove={() => undefined}
/>)}</div>;

const meta = {
  title: "Morrovia/05 Product Patterns/Trips dashboard",
  component: DashboardClient,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/dashboard" } },
  },
  decorators: [(Story) => {
    setStorybookAuthOwner("storybook-first-traveller");
    return <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: "28px 24px" }}><div style={{ maxWidth: 1180, margin: "0 auto" }}><Story /></div></main>;
  }],
  args: { trips: [], stamps: [], ownerId: "storybook-first-traveller" },
} satisfies Meta<typeof DashboardClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ZeroTrips: Story = {};
export const ActiveTrips: Story = { args: { trips: cardTrips, stamps: populatedStamps } };
export const PlannedTrips: Story = { args: { trips: cardTrips.slice(0, 3).map((trip) => ({ ...trip, status: "planned" as const })), stamps: populatedStamps } };
export const ArchivedTrips: Story = { args: { trips: cardTrips.slice(0, 2).map((trip) => ({ ...trip, status: "archived" as const })), stamps: populatedStamps } };
export const StampedEmptySummary: Story = { args: { trips: cardTrips.slice(0, 1), stamps: [] } };
export const Mobile390: Story = { args: { trips: cardTrips, stamps: populatedStamps }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const ActiveCardsDesktop: Story = { render: renderCardGrid };
export const ActiveCardsTablet768: Story = { render: renderCardGrid, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const ActiveCardsMobile390: Story = { render: renderCardGrid, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const ClickableCardKeyboardFocus: Story = {
  render: renderCardGrid,
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLAnchorElement>('a[aria-label^="Open trip:"]')?.focus();
  },
};
