import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { legacyItineraryIdeas, type EasyTTrip } from "@/lib/easyt/trip";
import { addLocalDays } from "@/lib/easyt/local-date";
import { exploreResultForIdea, type ExploreResult } from "@/lib/easyt/explore";
import TripShell from "./trip-shell";
import TripOverviewWorkspace from "./trip-overview-workspace";
import TripTransportWorkspace from "./trip-transport-workspace";
import TripItineraryWorkspace from "./trip-itinerary-workspace";
import TripExploreWorkspace from "./trip-explore-workspace";
import TripStayWorkspace from "./trip-stay-workspace";
import { tourTripFixture } from "./storybook/tour-trip.fixture";

type View = "overview" | "transport" | "itinerary" | "explore" | "stay";

function WorkspaceSurfaces({ view, trip = tourTripFixture, empty = false }: { view: View; trip?: EasyTTrip; empty?: boolean }) {
  const results = empty ? [] : legacyItineraryIdeas(trip.brief.itineraryIdeas ?? []).map(idea => exploreResultForIdea(trip, idea)).filter((result): result is ExploreResult => result !== null);
  const emptyDiscovery = Object.fromEntries(trip.planItems.map(day => [day.dayNumber, []]));
  return <main className="morrovia-editorial-page"><TripShell trip={trip} cacheTrip={false} orientationAutoStart={false}>
    {view === "overview" ? <TripOverviewWorkspace trip={trip} now="2026-07-20" />
      : view === "transport" ? <TripTransportWorkspace trip={trip} />
      : view === "itinerary" ? <TripItineraryWorkspace trip={trip} initialSuggestions={emptyDiscovery} initialActivityInventory={emptyDiscovery} />
      : view === "explore" ? <TripExploreWorkspace trip={trip} initialResults={results} />
      : <TripStayWorkspace trip={trip} initialFinderState={{ corePlaces: [], accommodationInventoryStatus: "unconfigured" }} />}
  </TripShell></main>;
}

const meta = {
  title: "Morrovia/05 Product Patterns/Trip workspace/Surface review",
  component: WorkspaceSurfaces,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  args: { trip: tourTripFixture, empty: false },
} satisfies Meta<typeof WorkspaceSurfaces>;
export default meta;
type Story = StoryObj<typeof meta>;
const navigation = (view: View, id = tourTripFixture.id) => ({ nextjs: { appDirectory: true, navigation: { pathname: `/journey/${id}${view === "overview" ? "" : `/${view}`}`, segments: view === "overview" ? [] : [view] } } });
export const Overview: Story = { args: { view: "overview" }, parameters: navigation("overview") };
export const Transport: Story = { args: { view: "transport" }, parameters: navigation("transport") };
export const Itinerary: Story = { args: { view: "itinerary" }, parameters: navigation("itinerary") };
export const Explore: Story = { args: { view: "explore" }, parameters: navigation("explore") };
export const Stay: Story = { args: { view: "stay" }, parameters: navigation("stay") };
export const EmptyTransport: Story = { args: { view: "transport", trip: { ...tourTripFixture, legs: [] } }, parameters: navigation("transport") };
export const EmptyExplore: Story = { args: { view: "explore", empty: true, trip: { ...tourTripFixture, brief: { ...tourTripFixture.brief, itineraryIdeas: [] } } }, parameters: navigation("explore") };

// This synthetic fixture keeps a real current-day option available to compare
// Day by day and Calendar controls without touching saved browser trips.
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const shiftDate = (date: string) => addLocalDays(today, Math.round((Date.parse(date) - Date.parse(tourTripFixture.startDate)) / 86_400_000));
const currentTrip: EasyTTrip = {
  ...tourTripFixture,
  id: "surface-review-current-day",
  startDate: today,
  endDate: shiftDate(tourTripFixture.endDate),
  stops: tourTripFixture.stops.map(stop => ({ ...stop, arrivalDate: stop.arrivalDate ? shiftDate(stop.arrivalDate) : stop.arrivalDate, departureDate: stop.departureDate ? shiftDate(stop.departureDate) : stop.departureDate })),
  planItems: tourTripFixture.planItems.map(day => ({ ...day, date: shiftDate(day.date) })),
};
export const ItineraryToday: Story = { args: { view: "itinerary", trip: currentTrip }, parameters: navigation("itinerary", currentTrip.id) };

const repetitionTrip: EasyTTrip = {
  ...tourTripFixture,
  id: "surface-review-day-heading-copy",
  brief: { ...tourTripFixture.brief, bookings: [] },
  planItems: tourTripFixture.planItems.map(day => day.dayNumber === 2
    ? { ...day, title: "Flexible day in Cusco" }
    : day.dayNumber === 3 ? { ...day, title: "Birthday lunch with family" } : day),
};
export const RepetitionReview: Story = { args: { view: "itinerary", trip: repetitionTrip }, parameters: navigation("itinerary", repetitionTrip.id) };
