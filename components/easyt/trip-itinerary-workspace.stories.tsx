import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EasyTTrip, PlanItem } from "@/lib/easyt/trip";
import TripItineraryWorkspace from "./trip-itinerary-workspace";

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
  brief: { origin: "Cusco", mustDo: "Sacred Valley", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
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
    day(1, "cusco", "2026-08-21", "Arrive in Cusco", "A protected arrival day gives the route room for the transfer, check-in and a first feel for the place.", ["Cusco → Cusco", "Estimated door-to-door: about 3h 10m", "Check in, walk one nearby area and keep dinner easy"], "arrival"),
    day(2, "cusco", "2026-08-22", "Explore Cusco", "Stay local while adjusting to the altitude.", ["San Blas and the historic centre", "Keep the afternoon flexible"]),
    day(3, "cusco", "2026-08-23", "Explore Cusco", "A second day protects the pace before moving on.", ["Sacsayhuamán", "Choose one museum or market"]),
    day(4, "sacred-valley", "2026-08-24", "Travel to Sacred Valley", "A short road transfer keeps most of the day usable.", ["Leave after breakfast", "Check in before exploring Pisac"], "transport"),
    day(5, "sacred-valley", "2026-08-25", "Explore Sacred Valley", "One full day keeps the valley from becoming a transit stop.", ["Choose one cluster of villages", "Keep the evening near the stay"]),
    day(6, "arequipa", "2026-08-26", "Travel to Arequipa", "This is the longest transfer day in the route.", ["Allow a generous airport buffer", "Keep dinner close to the hotel"], "transport"),
    day(7, "arequipa", "2026-08-27", "Explore Arequipa", "Finish with one coherent day in the historic centre.", ["Santa Catalina Monastery", "Plaza de Armas at dusk"]),
  ],
  recommendations: [],
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

const meta = {
  title: "Components/Trip itinerary workspace",
  component: TripItineraryWorkspace,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: 24 }}><Story /></main>],
  args: { trip, presentation: "shell" },
} satisfies Meta<typeof TripItineraryWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

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

export const IncompleteItinerary: Story = { args: { trip: { ...trip, planItems: [] } } };

export const Mobile320: Story = { parameters: { viewport: { defaultViewport: "morrovia320" } } };
export const Mobile390: Story = { parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile430: Story = { parameters: { viewport: { defaultViewport: "morrovia430" } } };
export const Tablet768: Story = { parameters: { viewport: { defaultViewport: "morrovia768" } } };
