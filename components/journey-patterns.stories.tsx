import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import TripBuilder from "@/app/journey/new/trip-builder";
import type { JourneyCalendarDay, JourneyStop } from "@/lib/journey";
import { tripFromBuilder, type EasyTTrip } from "@/lib/easyt/trip";
import { JourneyItineraryRefinement } from "./journey-itinerary-refinement";
import { JourneyLocalFinder, type JourneyLocalPlace } from "./journey-local-finder";
import { PlanWorkspace, type PlanWorkspaceCopy } from "./journey-plan-workspace";
import { JourneyTripQuality } from "./journey-trip-quality";

const planCopy: PlanWorkspaceCopy = {
  addActivity: "Add activity", add: "Add", cancel: "Cancel",
};

const storyTrip = (bookings: EasyTTrip["brief"]["bookings"] = []) => {
  const trip = tripFromBuilder({
  id: "storybook-tokyo", origin: "London", startDate: "2026-08-20", endDate: "2026-08-25", pace: "slow", hotels: "few", budget: "mid", mustDo: "A calm route with one great food day.",
  stops: [
    { id: "tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] },
    { id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] },
  ],
  dayAllocations: { tokyo: 3, kyoto: 2 },
  picks: {},
  draft: [
    { number: "1", date: "2026-08-20", destination: "Tokyo", title: "Arrive in Tokyo", reason: "Keep the first day light after the journey.", items: ["Check in", "Walk one nearby area"] },
    { number: "2", date: "2026-08-21", destination: "Tokyo", title: "Explore Tokyo", reason: "A full city day without crossing town repeatedly.", items: ["Neighbourhood walk", "Dinner nearby"] },
    { number: "3", date: "2026-08-22", destination: "Kyoto", title: "Train to Kyoto", reason: "An easy onward transfer.", items: ["Shinkansen", "Check in"] },
  ],
    createdAt: "2026-08-01T00:00:00.000Z",
  });
  return { ...trip, brief: { ...trip.brief, bookings } };
};

const selectedStop: JourneyStop = {
  id: "tokyo", city: "Tokyo", country: "Japan", date: "Aug 20", coordinates: [139.6917, 35.6895], theme: "city", marker: "skyline", description: "A calm first base with room to settle into the city.", highlights: [], aiPrompt: "",
};

const selectedDay: JourneyCalendarDay = {
  id: "storybook-day-1", date: "Aug 20", label: "Day 1", stopId: "tokyo", city: "Tokyo", title: "Arrive in Tokyo", items: ["Check in", "Walk one nearby area", "Keep dinner easy"],
  travel: { mode: "flight", from: "London", duration: "14h 20m", detail: "Airport transfer and arrival buffer" },
};

const mappedTokyoStay: JourneyLocalPlace = {
  id: "mapped-tokyo-stay",
  name: "Yanaka neighbourhood stay",
  address: "Yanaka, Taito City, Tokyo",
  category: "guest house",
  coordinates: [139.766, 35.727],
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Yanaka%20Tokyo",
  distanceKm: 1.2,
  availability: "check",
  provider: "openstreetmap",
};

const photonTokyoStay: JourneyLocalPlace = {
  ...mappedTokyoStay,
  id: "photon-tokyo-stay",
  name: "Asakusa mapped hotel",
  address: "Asakusa, Taito City, Tokyo",
  category: "hotel",
  coordinates: [139.7967, 35.7148],
};

const liveTokyoStay: JourneyLocalPlace = {
  id: "booking-tokyo-stay",
  name: "Tokyo Station Hotel",
  address: "Marunouchi, Tokyo",
  category: "hotel",
  coordinates: [139.765, 35.6812],
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Tokyo%20Station%20Hotel",
  availability: "available",
  provider: "booking-demand",
  price: { total: 640, currency: "GBP" },
  rating: 9.1,
};

const antiguaRestaurant: JourneyLocalPlace = {
  id: "photon-antigua-restaurant",
  name: "Comedor Las Palmas",
  address: "5a Avenida Sur, Antigua Guatemala, Guatemala",
  category: "restaurant",
  coordinates: [-90.7348, 14.5559],
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Comedor%20Las%20Palmas%20Antigua%20Guatemala",
  distanceKm: 0.4,
  availability: "check",
  provider: "openstreetmap",
};

function PlanWorkspaceStory() {
  const [activityDraft, setActivityDraft] = useState("");
  return <div style={{ maxWidth: 760, padding: 24, border: "1px solid var(--morrovia-line)", borderRadius: "var(--morrovia-radius)", background: "#fff" }}>
    <p style={{ margin: "0 0 4px", color: "var(--morrovia-signal)", font: "800 10px/1.2 var(--morrovia-meta)", letterSpacing: ".12em" }}>AT TOKYO</p>
    <h2 style={{ margin: "0 0 16px", font: "600 28px/1 var(--morrovia-display)" }}>Shape the day</h2>
    <PlanWorkspace
      context={{
        selectedDay,
        selectedStop,
        planItem: storyTrip().planItems[0],
        days: [{ id: "storybook-day-1", dayNumber: 1, date: "2026-08-20" }, { id: "storybook-day-2", dayNumber: 2, date: "2026-08-21" }],
        items: [
          { id: "arrival-transfer", kind: "transfer", title: "London → Tokyo", scheduleLabel: "09:30", metadata: "14h 20m", detail: "Planning estimate · check current schedules", mapSelectionId: null, transferMode: "flight" },
          { id: "check-in", kind: "activity", title: "Check in and take a short neighbourhood walk", scheduleLabel: "Afternoon", metadata: "Yanaka", detail: null, mapSelectionId: "idea:check-in" },
        ],
        freeTime: "evening",
      }}
      activity={{
        draft: activityDraft,
        onDraftChange: setActivityDraft,
        onAdd: () => setActivityDraft(""),
      }}
      navigation={{ onSelectDay: () => {}, onSelectItem: () => {}, onSelectTransfer: () => {}, onFindNearby: () => {} }}
      editHref="/journey/storybook-tokyo/itinerary"
      copy={planCopy}
    />
  </div>;
}

const meta = {
  title: "Morrovia/05 Product Patterns/Builder and planner",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const BuilderStart: Story = {
  render: () => <TripBuilder />,
};

export const BuilderAt390: Story = {
  globals: { viewport: { value: "morrovia390", isRotated: false } },
  render: () => <div style={{ width: 390, maxWidth: "100%" }}><TripBuilder /></div>,
};

export const ShapeTheDayPlan: Story = {
  globals: { viewport: { value: "morrovia390", isRotated: false } },
  render: () => <PlanWorkspaceStory />,
};

export const ShapeTheDayStay: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyLocalFinder kind="stay" city="Tokyo" country="Japan" dayId="storybook-tokyo-day" coordinates={[139.6917, 35.6895]} staySearch={{ checkIn: "2026-08-20", checkOut: "2026-08-23", adults: 2 }} /></div>,
};

export const StayBaseLoading: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyLocalFinder kind="stay" city="Tokyo" country="Japan" dayId="storybook-tokyo-loading" coordinates={[139.6917, 35.6895]} initialState={{ corePlaces: [], coreLoading: true, accommodationInventoryStatus: "not-requested" }} /></div>,
};

export const StayPhotonFallbackReady: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyLocalFinder kind="stay" city="Tokyo" country="Japan" dayId="storybook-tokyo-photon" coordinates={[139.6917, 35.6895]} initialState={{ corePlaces: [photonTokyoStay], accommodationInventoryStatus: "not-requested" }} /></div>,
};

export const StayCoreReadyCommercialLoading: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyLocalFinder kind="stay" city="Tokyo" country="Japan" dayId="storybook-tokyo-progressive" coordinates={[139.6917, 35.6895]} staySearch={{ checkIn: "2026-08-20", checkOut: "2026-08-23", adults: 2 }} initialState={{ corePlaces: [mappedTokyoStay], accommodationInventoryStatus: "loading" }} /></div>,
};

export const StayBookingReadyAfterBase: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyLocalFinder kind="stay" city="Tokyo" country="Japan" dayId="storybook-tokyo-booking-ready" coordinates={[139.6917, 35.6895]} staySearch={{ checkIn: "2026-08-20", checkOut: "2026-08-23", adults: 2 }} initialState={{ corePlaces: [mappedTokyoStay], commercialPlaces: [liveTokyoStay], accommodationInventoryStatus: "live" }} /></div>,
};

export const StayCoreReadyProviderUnavailableMobile390: Story = {
  globals: { viewport: { value: "morrovia390", isRotated: false } },
  render: () => <div style={{ maxWidth: 390 }}><JourneyLocalFinder kind="stay" city="Tokyo" country="Japan" dayId="storybook-tokyo-provider-failed" coordinates={[139.6917, 35.6895]} staySearch={{ checkIn: "2026-08-20", checkOut: "2026-08-23", adults: 2 }} initialState={{ corePlaces: [mappedTokyoStay], accommodationInventoryStatus: "unavailable" }} /></div>,
};

export const ShapeTheDayEat: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyLocalFinder kind="restaurant" city="Tokyo" country="Japan" dayId="storybook-tokyo-day" coordinates={[139.6917, 35.6895]} /></div>,
};

export const EatAntiguaNamedFallbackReady: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyLocalFinder canonicalPlaceId="antigua-guatemala" kind="restaurant" city="Antigua Guatemala" country="Guatemala" dayId="storybook-antigua-ready" coordinates={[-90.7339, 14.5586]} initialState={{ corePlaces: [antiguaRestaurant] }} /></div>,
};

export const EatPartialProviderFailureUseful: Story = EatAntiguaNamedFallbackReady;

export const EatAllProvidersUnavailable: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyLocalFinder canonicalPlaceId="antigua-guatemala" kind="restaurant" city="Antigua Guatemala" country="Guatemala" dayId="storybook-antigua-failed" coordinates={[-90.7339, 14.5586]} initialState={{ corePlaces: [], coreLoading: false, coreUnavailable: true }} /></div>,
};

export const EatValidEmpty: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyLocalFinder canonicalPlaceId="antigua-guatemala" kind="restaurant" city="Antigua Guatemala" country="Guatemala" dayId="storybook-antigua-empty" coordinates={[-90.7339, 14.5586]} initialState={{ corePlaces: [], coreLoading: false, coreUnavailable: false }} /></div>,
};

export const StayBaseReadyBookingLoadingAntigua: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyLocalFinder canonicalPlaceId="antigua-guatemala" kind="stay" city="Antigua Guatemala" country="Guatemala" dayId="storybook-antigua-stay" coordinates={[-90.7339, 14.5586]} staySearch={{ checkIn: "2026-10-03", checkOut: "2026-10-05", adults: 2 }} initialState={{ corePlaces: [{ ...mappedTokyoStay, id: "antigua-stay", name: "Casa del Arco", address: "Antigua Guatemala, Guatemala", coordinates: [-90.7328, 14.5574] }], accommodationInventoryStatus: "loading" }} /></div>,
};

export const ShapeTheDaySee: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyItineraryRefinement trip={storyTrip()} stop={storyTrip().stops[0]} day={storyTrip().planItems[0]} onSelectionChange={() => {}} onExploreMap={() => {}} compact /></div>,
};
