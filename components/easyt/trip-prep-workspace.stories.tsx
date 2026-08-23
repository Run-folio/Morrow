import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { BookingReadinessAction } from "@/lib/easyt/booking-readiness";
import type { EasyTTrip, PlanItem } from "@/lib/easyt/trip";
import type { ReadinessCard, TravelReadinessProfile } from "@/lib/easyt/travel-readiness";
import TripPrepWorkspace from "./trip-prep-workspace";
import TripShell from "./trip-shell";

const image = "/journey/peru-sacred-valley-route.jpg";
const day = (dayNumber: number, stopId: string, title: string, type: PlanItem["type"] = "activity"): PlanItem => ({
  id: `prep-day-${dayNumber}`,
  stopId,
  dayNumber,
  date: `2026-08-${String(20 + dayNumber).padStart(2, "0")}`,
  type,
  title,
  reason: "A focused day that keeps the route realistic.",
  notes: [],
  startsAt: null,
  endsAt: null,
  bookingUrl: null,
  latitude: null,
  longitude: null,
  image,
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
    originCoordinates: [-71.967, -13.532],
    mustDo: "Sacred Valley",
    pace: "slow",
    hotelChanges: "few",
    budgetBand: "mid",
    selectedPlaces: { cusco: ["Sacsayhuamán"] },
    bookings: [{ id: "stay-cusco", type: "stay", title: "Cusco stay", date: "2026-08-21", confirmation: null, url: null }],
    checklist: [
      { id: "insurance", label: "Review travel insurance", complete: false },
      { id: "offline", label: "Save offline maps", complete: false },
      { id: "packing", label: "Finish packing list", complete: true },
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
  planItems: [day(1, "cusco", "Arrive in Cusco", "arrival"), day(2, "cusco", "Explore Cusco"), day(3, "cusco", "Explore Cusco"), day(4, "sacred-valley", "Travel to Sacred Valley", "transport"), day(5, "sacred-valley", "Explore Sacred Valley"), day(6, "arequipa", "Travel to Arequipa", "transport"), day(7, "arequipa", "Explore Arequipa")],
  recommendations: [],
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

const profile: TravelReadinessProfile = { nationalities: [], residenceCountry: "", passportExpiryMonth: "" };
const readyProfile: TravelReadinessProfile = { nationalities: ["United Kingdom"], residenceCountry: "United Kingdom", passportExpiryMonth: "2028-04" };
const actions: BookingReadinessAction[] = [{
  id: "trip-flights", category: "flight", provider: "google-flights", title: "Check an open-jaw flight", detail: "Cusco → Cusco, returning from Arequipa. Dates are carried into the provider search.", cta: "Check flights", href: "https://www.google.com/travel/flights", tripId: trip.id, affiliate: false, livePrice: false,
}, {
  id: "trip-connectivity", category: "connectivity", provider: "saily", title: "Set up trip connectivity", detail: "Compare data coverage for Peru before purchasing.", cta: "Check eSIM coverage", href: "https://saily.com/", tripId: trip.id, affiliate: true, livePrice: false,
}, {
  id: "activity-cusco", category: "activity", provider: "google", title: "Check major activities in Cusco", detail: "Confirm dates and opening days for Sacsayhuamán.", cta: "Check options", href: "https://www.google.com/search?q=Sacsayhuaman", tripId: trip.id, stopId: "cusco", affiliate: false, livePrice: false,
}];
const readinessCards: ReadinessCard[] = [{ id: "entry", priority: "essential", title: "Entry, visa and transit", detail: "Add your nationality to make this check more personal." }, { id: "passport", priority: "essential", title: "Passport validity", detail: "Add an expiry month to make this reminder more useful." }, { id: "insurance", priority: "useful", title: "Travel insurance", detail: "Compare medical cover, cancellation protection and activity exclusions before you travel." }];

function StoryFrame({ storyTrip, storyProfile, storyActions, storyReadiness, now = "2026-07-20", presentation = "shell", providerStatus }: {
  storyTrip: EasyTTrip;
  storyProfile: TravelReadinessProfile;
  storyActions: BookingReadinessAction[];
  storyReadiness: ReadinessCard[];
  now?: string;
  presentation?: "shell" | "legacy";
  providerStatus?: "loading" | "available" | "unavailable";
}) {
  if (presentation === "legacy") return <div style={{ width: "min(860px, calc(100% - 48px))", margin: "24px auto" }}><TripPrepWorkspace trip={storyTrip} presentation="legacy" /></div>;
  return <TripShell trip={storyTrip}><TripPrepWorkspace trip={storyTrip} initialProfile={storyProfile} initialActions={storyActions} initialReadinessCards={storyReadiness} initialProviderStatus={providerStatus} now={now} /></TripShell>;
}

const meta = {
  title: "Components/Trip prep workspace",
  component: StoryFrame,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/journey/cusco-sacred-valley-arequipa/prep" } } },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", paddingTop: 1 }}><Story /></main>],
  args: { storyTrip: trip, storyProfile: profile, storyActions: actions, storyReadiness: readinessCards, now: "2026-07-20" },
} satisfies Meta<typeof StoryFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NormalPlanning: Story = {};
export const LegacyBody: Story = { args: { presentation: "legacy" }, parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/journey/prep" } } } };
export const ZeroPercent: Story = { args: { storyTrip: { ...trip, brief: { ...trip.brief, bookings: [], checklist: trip.brief.checklist?.map((item) => ({ ...item, complete: false })) } } } };
export const UrgentMustDo: Story = { args: { now: "2026-08-17" } };
export const MostlyComplete: Story = { args: { storyProfile: readyProfile, storyTrip: { ...trip, brief: { ...trip.brief, bookings: trip.stops.map((stop) => ({ id: `stay-${stop.id}`, type: "stay" as const, title: `${stop.name} stay`, date: stop.arrivalDate, confirmation: null, url: null })), checklist: trip.brief.checklist?.map((item) => ({ ...item, complete: item.id !== "offline" })) } }, storyActions: [] } };
export const FullyReady: Story = { args: { storyProfile: readyProfile, storyReadiness: [], storyActions: [], storyTrip: { ...trip, brief: { ...trip.brief, bookings: trip.stops.map((stop) => ({ id: `stay-${stop.id}`, type: "stay" as const, title: `${stop.name} stay`, date: stop.arrivalDate, confirmation: null, url: null })), checklist: trip.brief.checklist?.map((item) => ({ ...item, complete: true })) } } } };
export const MissingDates: Story = { args: { storyTrip: { ...trip, startDate: "", endDate: "", stops: trip.stops.map((stop) => ({ ...stop, arrivalDate: null, departureDate: null })) }, storyActions: [] } };
export const InvalidDates: Story = { args: { storyTrip: { ...trip, startDate: "2026-02-31", endDate: "2026-02-20", stops: trip.stops.map((stop) => ({ ...stop, arrivalDate: "2026-02-31", departureDate: "2026-02-20" })) }, storyActions: [] } };
export const StartedWithoutEndDate: Story = { args: { storyTrip: { ...trip, endDate: "" }, now: "2026-08-23" } };
export const InProgress: Story = { args: { now: "2026-08-23" } };
export const Ended: Story = { args: { now: "2026-09-01" } };
export const ProviderUnavailable: Story = { args: { storyProfile: readyProfile, storyReadiness: [], storyActions: [], providerStatus: "unavailable" } };
export const LongTaskCopy: Story = { args: { storyTrip: { ...trip, brief: { ...trip.brief, checklist: [...(trip.brief.checklist ?? []), { id: "weather-backup", label: "Download confirmations and prepare a flexible weather backup for every high-altitude travel day", complete: false }] } } } };
export const MissingOptionalState: Story = { args: { storyTrip: { ...trip, brief: { ...trip.brief, checklist: trip.brief.checklist?.filter((item) => item.id !== "offline") } } } };
export const Mobile320: Story = { parameters: { viewport: { defaultViewport: "morrovia320" } } };
export const Mobile390: Story = { parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile430: Story = { parameters: { viewport: { defaultViewport: "morrovia430" } } };
export const Tablet768: Story = { parameters: { viewport: { defaultViewport: "morrovia768" } } };
