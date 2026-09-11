import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { setStorybookAuthOwner } from "../../../.storybook/auth-client.mock";
import DashboardClient, { TripCard } from "./dashboard-client";
import styles from "./dashboard.module.css";

type StoryStop = { name: string; country: string; latitude: number; longitude: number; nights: number };

function storyTrip({ id, title, status, startDate, endDate, stops, image }: {
  id: string;
  title: string;
  status: EasyTTrip["status"];
  startDate: string;
  endDate: string;
  stops: StoryStop[];
  image?: string | null;
}): EasyTTrip {
  const tripStops = stops.map((stop, index) => ({
    id: `${id}-stop-${index + 1}`,
    order: index,
    name: stop.name,
    country: stop.country,
    latitude: stop.latitude,
    longitude: stop.longitude,
    arrivalDate: startDate,
    departureDate: endDate,
    nights: stop.nights,
  }));
  return {
    schemaVersion: 1,
    id,
    ownerId: "storybook-first-traveller",
    title,
    status,
    startDate,
    endDate,
    travellers: 2,
    currency: "GBP",
    brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
    stops: tripStops,
    legs: [],
    planItems: tripStops.map((stop, index) => ({
      id: `${id}-day-${index + 1}`,
      stopId: stop.id,
      dayNumber: index + 1,
      date: startDate,
      type: "activity" as const,
      title: `A day in ${stop.name}`,
      reason: "Planned",
      notes: [],
      startsAt: null,
      endsAt: null,
      bookingUrl: null,
      latitude: stop.latitude,
      longitude: stop.longitude,
      image: index === 0 ? image ?? null : null,
    })),
    recommendations: [],
    createdAt: "2026-07-12T12:00:00.000Z",
    updatedAt: `2026-09-0${(Number(id.at(-1)) || 1) % 9 + 1}T12:00:00.000Z`,
  };
}

const currentJapan = storyTrip({
  id: "storybook-current-1", title: "Japan, your way", status: "planned", startDate: "2026-09-01", endDate: "2026-09-18", image: "/journey/immersive/place-kyoto-1536.webp",
  stops: [
    { name: "Tokyo", country: "Japan", latitude: 35.6762, longitude: 139.6503, nights: 4 },
    { name: "Kanazawa", country: "Japan", latitude: 36.5613, longitude: 136.6562, nights: 3 },
    { name: "Takayama", country: "Japan", latitude: 36.1461, longitude: 137.2522, nights: 3 },
    { name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, nights: 5 },
    { name: "Osaka", country: "Japan", latitude: 34.6937, longitude: 135.5023, nights: 2 },
  ],
});

const longCurrentJourney = storyTrip({
  id: "storybook-long-current-11",
  title: "London, Tulum, Cancún, Antigua Guatemala, Guatemala City & Mexico City",
  status: "planned",
  startDate: "2026-09-03",
  endDate: "2026-09-24",
  image: "/journey/product-shots/tour/map-workspace-mobile.png",
  stops: [
    { name: "Tulum", country: "Mexico", latitude: 20.2114, longitude: -87.4654, nights: 3 },
    { name: "Cancún", country: "Mexico", latitude: 21.1619, longitude: -86.8515, nights: 3 },
    { name: "Antigua Guatemala", country: "Guatemala", latitude: 14.5586, longitude: -90.7295, nights: 4 },
    { name: "Guatemala City", country: "Guatemala", latitude: 14.6349, longitude: -90.5069, nights: 3 },
    { name: "Mexico City", country: "Mexico", latitude: 19.4326, longitude: -99.1332, nights: 8 },
  ],
});

const upcomingAntigua = storyTrip({
  id: "storybook-upcoming-2", title: "From the Caribbean to Antigua", status: "planned", startDate: "2027-01-08", endDate: "2027-01-29", image: "/journey/immersive/route-mexico-yucatan-1536.webp",
  stops: [
    { name: "Cancún", country: "Mexico", latitude: 21.1619, longitude: -86.8515, nights: 4 },
    { name: "Tulum", country: "Mexico", latitude: 20.2114, longitude: -87.4654, nights: 3 },
    { name: "Caye Caulker", country: "Belize", latitude: 17.7361, longitude: -88.0325, nights: 4 },
    { name: "Flores", country: "Guatemala", latitude: 16.9297, longitude: -89.8917, nights: 3 },
    { name: "Antigua", country: "Guatemala", latitude: 14.5586, longitude: -90.7295, nights: 7 },
  ],
});

const upcomingBalkans = storyTrip({
  id: "storybook-upcoming-3", title: "The Balkans", status: "planned", startDate: "2027-05-10", endDate: "2027-05-21", image: "/journey/immersive/place-kotor-1536.webp",
  stops: [
    { name: "Dubrovnik", country: "Croatia", latitude: 42.6507, longitude: 18.0944, nights: 3 },
    { name: "Kotor", country: "Montenegro", latitude: 42.4247, longitude: 18.7712, nights: 3 },
    { name: "Shkodër", country: "Albania", latitude: 42.0693, longitude: 19.5033, nights: 2 },
    { name: "Tirana", country: "Albania", latitude: 41.3275, longitude: 19.8187, nights: 3 },
  ],
});

const ideaIberia = storyTrip({
  id: "storybook-idea-4", title: "Portugal + Spain", status: "draft", startDate: "2027-09-03", endDate: "2027-09-18",
  stops: [
    { name: "Lisbon", country: "Portugal", latitude: 38.7223, longitude: -9.1393, nights: 5 },
    { name: "Seville", country: "Spain", latitude: 37.3891, longitude: -5.9845, nights: 4 },
    { name: "Barcelona", country: "Spain", latitude: 41.3874, longitude: 2.1686, nights: 6 },
  ],
});

const pastTrips = [
  storyTrip({ id: "storybook-past-5", title: "A week by the Atlantic", status: "archived", startDate: "2026-06-06", endDate: "2026-06-13", image: "/journey/portugal-atlantic-route.jpg", stops: [
    { name: "Lisbon", country: "Portugal", latitude: 38.7223, longitude: -9.1393, nights: 3 },
    { name: "Comporta", country: "Portugal", latitude: 38.3806, longitude: -8.7861, nights: 2 },
    { name: "Lagos", country: "Portugal", latitude: 37.1028, longitude: -8.6730, nights: 2 },
  ] }),
  storyTrip({ id: "storybook-past-6", title: "Iberia, slowly", status: "archived", startDate: "2025-09-10", endDate: "2025-09-25", image: "/journey/immersive/route-spain-rail-1536.webp", stops: [
    { name: "Lisbon", country: "Portugal", latitude: 38.7223, longitude: -9.1393, nights: 5 },
    { name: "Seville", country: "Spain", latitude: 37.3891, longitude: -5.9845, nights: 5 },
    { name: "Barcelona", country: "Spain", latitude: 41.3874, longitude: 2.1686, nights: 5 },
  ] }),
  storyTrip({ id: "storybook-past-7", title: "Mexico City to Oaxaca", status: "archived", startDate: "2025-02-02", endDate: "2025-02-14", image: "/journey/immersive/route-mexico-yucatan-1536.webp", stops: [
    { name: "Mexico City", country: "Mexico", latitude: 19.4326, longitude: -99.1332, nights: 6 },
    { name: "Puebla", country: "Mexico", latitude: 19.0414, longitude: -98.2063, nights: 2 },
    { name: "Oaxaca", country: "Mexico", latitude: 17.0732, longitude: -96.7266, nights: 4 },
  ] }),
  storyTrip({ id: "storybook-past-8", title: "Northern Italy by train", status: "archived", startDate: "2024-05-04", endDate: "2024-05-16", image: "/journey/immersive/route-italy-table-1536.webp", stops: [
    { name: "Milan", country: "Italy", latitude: 45.4642, longitude: 9.1900, nights: 4 },
    { name: "Bologna", country: "Italy", latitude: 44.4949, longitude: 11.3426, nights: 4 },
    { name: "Venice", country: "Italy", latitude: 45.4408, longitude: 12.3155, nights: 4 },
  ] }),
];

const allTrips = [currentJapan, upcomingAntigua, upcomingBalkans, ideaIberia, ...pastTrips];
const populatedStamps = [
  { countryId: "portugal", status: "visited" as const },
  { countryId: "spain", status: "visited" as const },
  { countryId: "japan", status: "want" as const },
];
const cardCopy = { routeWaiting: "Route to confirm", edit: "Edit trip", restore: "Restore", archive: "Archive", duplicate: "Duplicate", gift: "Share", delete: "Delete" };

const renderCardGrid = () => <div className={styles.sectionGrid}>{[upcomingAntigua, upcomingBalkans].map((trip) => <TripCard key={trip.id} kind="upcoming" trip={trip} language="en" copy={cardCopy} working={false} workingAction={null} onAction={() => undefined} onGift={() => undefined} onRemove={() => undefined} />)}</div>;

const meta = {
  title: "Morrovia/05 Product Patterns/Trips dashboard",
  component: DashboardClient,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/journey/dashboard" } } },
  decorators: [(Story) => {
    setStorybookAuthOwner("storybook-first-traveller");
    return <main className="morrovia-editorial-page" style={{ minHeight: "100vh", overflow: "hidden" }}><div style={{ width: "min(1320px, calc(100% - 40px))", margin: "0 auto 80px" }}><header className={styles.pageIntro}><p className={styles.eyebrow}>Your personal journey library</p><h1><span>Your journeys.</span><em>Ready when you are.</em></h1></header><Story /></div></main>;
  }],
  args: { trips: [], stamps: [], ownerId: "storybook-first-traveller" },
} satisfies Meta<typeof DashboardClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ZeroTrips: Story = {};
export const ActiveTrips: Story = { args: { trips: allTrips, stamps: populatedStamps } };
export const OneTrip: Story = { args: { trips: [currentJapan], stamps: populatedStamps } };
export const SixPlusPastJourneys: Story = { args: { trips: [currentJapan, ...pastTrips, { ...pastTrips[0]!, id: "storybook-past-9", title: "A return to the Atlantic" }, { ...pastTrips[1]!, id: "storybook-past-10", title: "Southern Spain remembered" }], stamps: populatedStamps } };
export const Mobile390: Story = { args: { trips: allTrips, stamps: populatedStamps }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile430: Story = { args: { trips: allTrips, stamps: populatedStamps }, globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const LongCurrentJourneyMobile390: Story = { args: { trips: [longCurrentJourney], stamps: populatedStamps }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const InvalidHeroMediaMobile390: Story = { args: { trips: [{ ...longCurrentJourney, id: "storybook-invalid-media", stops: longCurrentJourney.stops.map((stop) => ({ ...stop, name: "Unreviewed place" })) }], stamps: populatedStamps }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const UpcomingCardsDesktop: Story = { render: renderCardGrid };
export const UpcomingCardsTablet768: Story = { render: renderCardGrid, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const UpcomingCardsMobile390: Story = { render: renderCardGrid, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const ClickableCardKeyboardFocus: Story = { render: renderCardGrid, play: async ({ canvasElement }) => { canvasElement.querySelector<HTMLAnchorElement>("article a")?.focus(); } };
