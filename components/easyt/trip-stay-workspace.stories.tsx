import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { JourneyLocalFinderInitialState, JourneyLocalPlace } from "@/lib/easyt/local-place";
import type { EasyTTrip, PlanItem } from "@/lib/easyt/trip";
import TripShell from "./trip-shell";
import TripStayWorkspace from "./trip-stay-workspace";

const day = (id: string, stopId: string, dayNumber: number, date: string): PlanItem => ({
  id,
  stopId,
  dayNumber,
  date,
  type: "activity",
  title: "Explore Tokyo",
  reason: "Keep the day geographically coherent.",
  notes: [],
  startsAt: null,
  endsAt: null,
  bookingUrl: null,
  latitude: null,
  longitude: null,
});

const trip: EasyTTrip = {
  schemaVersion: 1,
  id: "storybook-tokyo-return",
  ownerId: null,
  title: "Tokyo, Kyoto & Tokyo",
  status: "draft",
  startDate: "2027-03-03",
  endDate: "2027-03-11",
  travellers: 2,
  currency: "GBP",
  brief: {
    origin: "London",
    mustDo: "Food and culture",
    pace: "slow",
    hotelChanges: "few",
    budgetBand: "mid",
    selectedPlaces: {},
    itineraryIdeas: [
      { id: "meiji", stopId: "tokyo-first", dayId: "tokyo-day-1", dayPart: "morning", placeId: "meiji-shrine", title: "Meiji Shrine", category: "activity", coordinates: [139.6993, 35.6764], description: "", source: "personalised-recommendation", reasons: [] },
      { id: "museum", stopId: "tokyo-first", dayId: "tokyo-day-2", dayPart: "afternoon", placeId: "museum", title: "Nezu Museum", category: "activity", coordinates: [139.717, 35.662], description: "", source: "personalised-recommendation", reasons: [] },
      { id: "garden", stopId: "tokyo-first", dayId: "tokyo-day-3", dayPart: "morning", placeId: "garden", title: "Shinjuku Gyoen", category: "activity", coordinates: [139.71, 35.685], description: "", source: "personalised-recommendation", reasons: [] },
      { id: "return-market", stopId: "tokyo-return", dayId: "tokyo-return-day", dayPart: "morning", placeId: "market", title: "Toyosu Market", category: "restaurant", coordinates: [139.785, 35.645], description: "", source: "personalised-recommendation", reasons: [] },
    ],
  },
  stops: [
    { id: "tokyo-first", order: 0, name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2027-03-03", departureDate: "2027-03-06", nights: 3 },
    { id: "kyoto", order: 1, name: "Kyoto", country: "Japan", canonicalPlaceId: "kyoto", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2027-03-06", departureDate: "2027-03-09", nights: 3 },
    { id: "tokyo-return", order: 2, name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2027-03-09", departureDate: "2027-03-11", nights: 2 },
  ],
  legs: [],
  planItems: [
    day("tokyo-day-1", "tokyo-first", 1, "2027-03-03"),
    day("tokyo-day-2", "tokyo-first", 2, "2027-03-04"),
    day("tokyo-day-3", "tokyo-first", 3, "2027-03-05"),
    day("kyoto-day", "kyoto", 4, "2027-03-06"),
    day("tokyo-return-day", "tokyo-return", 7, "2027-03-09"),
  ],
  recommendations: [],
  createdAt: "2026-09-13T00:00:00.000Z",
  updatedAt: "2026-09-13T00:00:00.000Z",
};

const mappedStay = (id: string, name: string, coordinates: [number, number], overrides: Partial<JourneyLocalPlace> = {}): JourneyLocalPlace => ({
  id,
  name,
  address: "Tokyo, Japan",
  category: "Hotel",
  coordinates,
  mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`,
  availability: "check",
  provider: "google-places",
  ...overrides,
});

const mappedPlaces: JourneyLocalPlace[] = [
  mappedStay("sakura-house", "Sakura House", [139.704, 35.681], { address: "Shinjuku, Tokyo", rating: 4.5, reviewCount: 812 }),
  mappedStay("garden-hotel", "Garden Hotel Tokyo", [139.712, 35.684], { address: "Shinjuku, Tokyo", rating: 4.4, reviewCount: 425 }),
  mappedStay("yoyogi-lodge", "Yoyogi Lodge", [139.697, 35.678], { address: "Yoyogi, Tokyo", rating: 4.2, reviewCount: 233 }),
  mappedStay("aoyama-rooms", "Aoyama Rooms", [139.718, 35.668], { address: "Aoyama, Tokyo", rating: 4.6, reviewCount: 151 }),
  mappedStay("city-inn", "City Inn", [139.69, 35.687], { provider: "openstreetmap", operational: true }),
  mappedStay("tokyo-guesthouse", "Tokyo Guesthouse", [139.721, 35.69], { provider: "openstreetmap", category: "Guest house" }),
];

const bookingStay = mappedStay("booking-property-42", "Kadoya Hotel", [139.698, 35.691], {
  address: "Nishi-Shinjuku, Tokyo",
  provider: "booking-demand",
  providerProductId: "42",
  availability: "available",
  rating: 4.7,
  reviewCount: 1674,
  price: { total: 486, currency: "GBP" },
  cancellation: "free_cancellation",
  description: "A current provider result for the selected stop and date range.",
});
const bookingGardenEnrichment = mappedStay("booking-garden-88", "Garden Hotel Tokyo", [139.7124, 35.6844], {
  address: "Shinjuku, Tokyo",
  provider: "booking-demand",
  providerProductId: "88",
  availability: "available",
  rating: 4.6,
  reviewCount: 596,
  price: { total: 438, currency: "GBP" },
  cancellation: "free_cancellation",
});
const strongMapped = mappedStay("strong-mapped", "Shinjuku Heritage Hotel", [139.704, 35.681], { rating: 4.9, reviewCount: 4200 });
const weakBooking = mappedStay("weak-booking", "Outer Tokyo Rooms", [139.82, 35.78], {
  provider: "booking-demand",
  providerProductId: "weak-17",
  availability: "available",
  rating: 3.2,
  reviewCount: 12,
  price: { total: 312, currency: "GBP" },
});

const ready: JourneyLocalFinderInitialState = { corePlaces: mappedPlaces, accommodationInventoryStatus: "unconfigured" };
const loading: JourneyLocalFinderInitialState = { corePlaces: mappedPlaces, accommodationInventoryStatus: "loading" };
const enriched: JourneyLocalFinderInitialState = { corePlaces: mappedPlaces, commercialPlaces: [bookingStay], accommodationInventoryStatus: "live" };
const partiallyEnriched: JourneyLocalFinderInitialState = { corePlaces: mappedPlaces, commercialPlaces: [bookingGardenEnrichment], accommodationInventoryStatus: "live" };
const rankingComparison: JourneyLocalFinderInitialState = { corePlaces: [strongMapped, ...mappedPlaces.slice(1, 4)], commercialPlaces: [weakBooking], accommodationInventoryStatus: "live" };
const unavailable: JourneyLocalFinderInitialState = { corePlaces: mappedPlaces, accommodationInventoryStatus: "unavailable" };
const sparse: JourneyLocalFinderInitialState = { corePlaces: [mappedStay("small-ryokan", "Small Ryokan", [139.7, 35.68], { category: "Ryokan", provider: "openstreetmap" })], accommodationInventoryStatus: "unconfigured" };

const meta = {
  title: "Morrovia/05 Product Patterns/Trip workspace/Stay",
  component: TripStayWorkspace,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: `/journey/${trip.id}/stay`, query: { stop: "tokyo-first" } } },
  },
  decorators: [(Story, context) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", paddingTop: 1 }}><TripShell trip={context.args.trip} cacheTrip={false} orientationAutoStart={false}><Story /></TripShell></main>],
  args: { trip, initialStopId: "tokyo-first", initialFinderState: ready },
} satisfies Meta<typeof TripStayWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TokyoThreeNightStay: Story = {};
export const RepeatedTokyoStay: Story = { args: { initialStopId: "tokyo-return", initialFinderState: sparse } };
export const StrongAreaEvidence: Story = {};
export const NoNeighbourhoodFallback: Story = { args: { initialStopId: "tokyo-return", initialFinderState: sparse } };
export const SixOptionShortlist: Story = {};
export const MappedResultsBookingLoading: Story = { args: { initialFinderState: loading } };
export const BookingEnriched: Story = { args: { initialFinderState: enriched } };
export const PartiallyEnrichedShortlist: Story = { args: { initialFinderState: partiallyEnriched, initialSelectedPlaceId: "garden-hotel" } };
export const BookingFactsSeparateTripComCta: Story = { args: { initialFinderState: enriched, initialSelectedPlaceId: "booking-property-42" } };
export const RankingComparison: Story = { args: { initialFinderState: rankingComparison, initialSelectedPlaceId: "strong-mapped" } };
export const ProviderUnavailableMappedBaseReady: Story = { args: { initialFinderState: unavailable } };
export const BookingFailureMappedShortlist: Story = { args: { initialFinderState: unavailable, initialSelectedPlaceId: "sakura-house" } };
export const NoPropertyImage: Story = { args: { initialFinderState: sparse, initialSelectedPlaceId: "small-ryokan" } };
export const SparsePropertyDetail: Story = { args: { initialFinderState: sparse, initialSelectedPlaceId: "small-ryokan" } };
export const RichPropertyDetail: Story = { args: { initialFinderState: enriched, initialSelectedPlaceId: "booking-property-42" } };
export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile390: Story = { args: { initialFinderState: enriched, initialSelectedPlaceId: "booking-property-42" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile430: Story = { globals: { viewport: { value: "morrovia430", isRotated: false } } };
