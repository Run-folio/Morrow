import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { composeItineraryDay, type ComposedItineraryActivity } from "@/lib/easyt/itinerary-day-composition";
import { assignItineraryIdeaDayPart } from "@/lib/easyt/itinerary-ideas";
import { assignItineraryActivityDayPart, insertItineraryActivity, moveItineraryActivity, moveItineraryIdeaActivity } from "@/lib/easyt/itinerary-mutations";
import { defaultTripIntent, type EasyTTrip, type ItineraryDayPart } from "@/lib/easyt/trip";
import RichItineraryDayPlanner from "./rich-itinerary-day-planner";

const intent = defaultTripIntent({ stopIds: ["kyoto"], durationDays: 3 });

const baseTrip: EasyTTrip = {
  schemaVersion: 1,
  id: "storybook-rich-kyoto",
  ownerId: "storybook-traveller",
  title: "Three days in Kyoto",
  status: "planned",
  startDate: "2026-10-03",
  endDate: "2026-10-05",
  travellers: 2,
  currency: "GBP",
  brief: {
    origin: "Tokyo",
    mustDo: "Kyoto temples and food",
    pace: "slow",
    hotelChanges: "few",
    budgetBand: "mid",
    selectedPlaces: { kyoto: ["Fushimi Inari", "Kiyomizu-dera", "Dinner in Gion", "Nishiki Market"] },
    bookings: [
      { id: "stay-kyoto", type: "stay", title: "Machiya in Gion", date: "2026-10-03", confirmation: "KYOTO-3", url: null },
      { id: "gion-table", type: "reservation", title: "Dinner in Gion", date: "2026-10-04", confirmation: "GION-1930", url: null },
    ],
    customActivities: { 2: ["Leave space for a nearby walk"] },
    itineraryIdeas: [
      { id: "idea-fushimi", stopId: "kyoto", placeId: "fushimi", title: "Fushimi Inari", category: "activity", coordinates: [135.7727, 34.9671], source: "destination-highlight", reasons: ["destination-significance"], dayId: "kyoto-2", dayPart: "morning" },
      { id: "idea-kiyomizu", stopId: "kyoto", placeId: "kiyomizu", title: "Kiyomizu-dera", category: "activity", coordinates: [135.785, 34.994], source: "destination-highlight", reasons: ["destination-significance"], dayId: "kyoto-2", dayPart: "afternoon" },
      { id: "idea-gion", stopId: "kyoto", placeId: "gion", title: "Dinner in Gion", category: "restaurant", coordinates: [135.775, 35.003], source: "personalised-recommendation", reasons: ["interest-relevance"], dayId: "kyoto-2", dayPart: "evening" },
      { id: "idea-market", stopId: "kyoto", placeId: "market", title: "Nishiki Market", category: "restaurant", coordinates: [135.764, 35.005], source: "personalised-recommendation", reasons: ["interest-relevance"], dayId: "kyoto-2", dayPart: "midday" },
      { id: "idea-garden", stopId: "kyoto", placeId: "garden", title: "Murin-an garden", category: "activity", coordinates: [135.79, 35.011], source: "destination-highlight", reasons: ["destination-significance"] },
    ],
    intent,
  },
  stops: [{ id: "kyoto", order: 0, name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2026-10-03", departureDate: "2026-10-05", nights: 2 }],
  legs: [
    { id: "tokyo-kyoto", fromStopId: "storybook-rich-kyoto-origin", toStopId: "kyoto", fromEndpoint: { kind: "origin", id: "storybook-rich-kyoto-origin", name: "Tokyo", country: "Japan", coordinates: [139.6503, 35.6762] }, toEndpoint: { kind: "stop", id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] }, classification: "arrival", mode: "train", distanceKm: 450, durationMinutes: 190, doorToDoorMinutes: 240, provider: "Planning estimate", provenance: "planning_estimate", confidence: "medium", scheduleNeedsChecking: true, routeMetadata: {} },
    { id: "depart-kyoto", fromStopId: "kyoto", toStopId: "storybook-rich-kyoto-origin", fromEndpoint: { kind: "stop", id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] }, toEndpoint: { kind: "origin", id: "storybook-rich-kyoto-origin", name: "Tokyo", country: "Japan", coordinates: [139.6503, 35.6762] }, classification: "departure", mode: "train", distanceKm: 450, durationMinutes: null, provider: null, provenance: "unknown", confidence: "unknown", scheduleNeedsChecking: true, routeMetadata: {} },
  ],
  planItems: [
    { id: "kyoto-1", stopId: "kyoto", dayNumber: 1, date: "2026-10-03", type: "arrival", title: "Arrive in Kyoto", reason: "Keep the arrival day light.", notes: ["Tokyo → Kyoto", "Morrovia planning estimate: about 4h door to door; check current schedules.", "Settle into Gion"], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    { id: "kyoto-2", stopId: "kyoto", dayNumber: 2, date: "2026-10-04", type: "activity", title: "Temples and Gion", reason: "A coherent day across eastern Kyoto.", notes: ["Fushimi Inari", "Nishiki Market", "Kiyomizu-dera", "Dinner in Gion", "Leave space for a nearby walk"], noteDayParts: [null, null, null, null, "evening"], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    { id: "kyoto-3", stopId: "kyoto", dayNumber: 3, date: "2026-10-05", type: "transport", title: "Depart Kyoto", reason: "Travel onward.", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
  ],
  recommendations: [],
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
};

function StoryFrame({ trip, dayId }: { trip: EasyTTrip; dayId: string }) {
  const [workingTrip, setWorkingTrip] = useState(trip);
  const [addPart, setAddPart] = useState<ItineraryDayPart | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const composition = useMemo(() => composeItineraryDay(workingTrip, dayId), [dayId, workingTrip]);
  if (!composition) return null;
  const assign = (activity: ComposedItineraryActivity, dayPart: ItineraryDayPart | null) => {
    setWorkingTrip((current) => activity.source === "itinerary-idea"
      ? assignItineraryIdeaDayPart(current, activity.id, dayPart)
      : activity.noteIndex === null ? current : assignItineraryActivityDayPart(current, {
        dayNumber: composition.day.dayNumber,
        noteIndex: activity.noteIndex,
        title: activity.title,
      }, dayPart).trip);
  };
  const move = (activity: ComposedItineraryActivity, direction: "earlier" | "later") => {
    const dayPart = activity.dayPart;
    if (activity.noteIndex === null || dayPart === null) return;
    const peers = composition.planned[dayPart];
    const index = peers.findIndex((candidate) => candidate.id === activity.id);
    const neighbour = peers[index + (direction === "earlier" ? -1 : 1)];
    if (!neighbour || neighbour.noteIndex === null) return;
    const target = direction === "earlier" ? neighbour.noteIndex : neighbour.noteIndex + 1;
    setWorkingTrip((current) => activity.source === "itinerary-idea"
      ? moveItineraryIdeaActivity(current, activity.id, target).trip
      : moveItineraryActivity(current, {
        dayNumber: composition.day.dayNumber,
        noteIndex: activity.noteIndex!,
        title: activity.title,
      }, target).trip);
  };
  const add = () => {
    if (!addPart) return;
    const result = insertItineraryActivity(workingTrip, composition.day.dayNumber, composition.day.notes.length, draft, addPart);
    if (!result.changed) { setError(result.reason ?? "Could not add this activity."); return; }
    setWorkingTrip(result.trip);
    setAddPart(null);
    setDraft("");
    setError("");
  };
  return (
    <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: "24px" }}>
      <div style={{ width: "min(1040px, 100%)", margin: "0 auto" }}>
        <RichItineraryDayPlanner
          composition={composition}
          addComposerDayPart={addPart}
          addDraft={draft}
          addError={error}
          ideasHref={`/journey/${workingTrip.id}/itinerary#ideas`}
          onAddOpen={(part) => { setAddPart(part); setDraft(""); setError(""); }}
          onAddDraftChange={(value) => { setDraft(value); setError(""); }}
          onAddCancel={() => { setAddPart(null); setDraft(""); setError(""); }}
          onAddSubmit={add}
          onDayPartChange={assign}
          onMoveActivity={move}
        />
      </div>
    </main>
  );
}

const fullComposition = composeItineraryDay(baseTrip, "kyoto-2")!;

const meta = {
  title: "Morrovia/05 Product Patterns/Trip workspace/Itinerary/Rich day planner",
  component: RichItineraryDayPlanner,
  parameters: { layout: "fullscreen" },
  args: { composition: fullComposition, ideasHref: "/journey/storybook-rich-kyoto/itinerary#ideas" },
} satisfies Meta<typeof RichItineraryDayPlanner>;

export default meta;
type Story = StoryObj<typeof meta>;

const sparseTrip: EasyTTrip = {
  ...baseTrip,
  brief: {
    ...baseTrip.brief,
    customActivities: {},
    itineraryIdeas: baseTrip.brief.itineraryIdeas?.filter((idea) => idea.id === "idea-kiyomizu" || !idea.dayId),
  },
  planItems: baseTrip.planItems.map((day) => day.id === "kyoto-2" ? { ...day, notes: ["Kiyomizu-dera"], noteDayParts: [null] } : day),
};

const authoredTrip: EasyTTrip = {
  ...baseTrip,
  brief: {
    ...baseTrip.brief,
    bookings: baseTrip.brief.bookings?.filter((booking) => booking.type === "stay"),
    itineraryIdeas: baseTrip.brief.itineraryIdeas?.filter((idea) => !idea.dayId),
    customActivities: { 2: ["Early tea ceremony", "Riverside sketching", "Neighbourhood supper"] },
  },
  planItems: baseTrip.planItems.map((day) => day.id === "kyoto-2" ? {
    ...day,
    notes: ["Early tea ceremony", "Riverside sketching", "Neighbourhood supper"],
    noteDayParts: ["morning", "afternoon", "evening"],
  } : day),
};

export const FullFourSectionDay: Story = {
  render: () => <StoryFrame trip={baseTrip} dayId="kyoto-2" />,
};

export const SparseDay: Story = { render: () => <StoryFrame trip={sparseTrip} dayId="kyoto-2" /> };

export const AutomaticLegacyPlacement: Story = {
  render: () => <StoryFrame trip={{
    ...baseTrip,
    brief: {
      ...baseTrip.brief,
      itineraryIdeas: baseTrip.brief.itineraryIdeas?.map((idea) => idea.dayId === "kyoto-2" ? { ...idea, dayPart: null } : idea),
    },
  }} dayId="kyoto-2" />,
};

export const ArrivalDay: Story = {
  render: () => <StoryFrame trip={baseTrip} dayId="kyoto-1" />,
};

export const BookedActivity: Story = FullFourSectionDay;

export const AuthoredActivities: Story = { render: () => <StoryFrame trip={authoredTrip} dayId="kyoto-2" /> };

export const EmptyDaypart: Story = SparseDay;

export const MixedGeneratedAndAuthored: Story = FullFourSectionDay;

export const DepartureDayUnknownTiming: Story = {
  render: () => <StoryFrame trip={baseTrip} dayId="kyoto-3" />,
};

export const AccommodationNotYetOrganised: Story = {
  render: () => <StoryFrame trip={{ ...baseTrip, brief: { ...baseTrip.brief, bookings: [] } }} dayId="kyoto-2" />,
};

export const SparseProviderEvidence: Story = DepartureDayUnknownTiming;

export const LongActivityNames: Story = {
  render: () => <StoryFrame trip={{
    ...baseTrip,
    brief: {
      ...baseTrip.brief,
      itineraryIdeas: baseTrip.brief.itineraryIdeas?.map((idea) => idea.id === "idea-kiyomizu" ? {
        ...idea,
        title: "Kiyomizu-dera temple complex and the long approach through the preserved Higashiyama streets",
      } : idea),
    },
    planItems: baseTrip.planItems.map((day) => day.id === "kyoto-2" ? {
      ...day,
      notes: day.notes.map((note) => note === "Kiyomizu-dera"
        ? "Kiyomizu-dera temple complex and the long approach through the preserved Higashiyama streets"
        : note),
    } : day),
  }} dayId="kyoto-2" />,
};

export const Mobile320: Story = { ...SparseDay, globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile390: Story = { ...AuthoredActivities, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Tablet768: Story = { ...SparseDay, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const Desktop1024: Story = { ...FullFourSectionDay, globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const Desktop1440: Story = { ...FullFourSectionDay, globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const Desktop1680: Story = { ...FullFourSectionDay, globals: { viewport: { value: "morrovia1680", isRotated: false } } };

// Backward-compatible story exports retained for saved Storybook URLs.
export const FullMorningAfternoonEvening: Story = FullFourSectionDay;
export const PartiallyFreeDay: Story = SparseDay;
export const UnslottedPlannedItem: Story = AutomaticLegacyPlacement;
export const ArrivalDayBookedAccommodation: Story = ArrivalDay;
