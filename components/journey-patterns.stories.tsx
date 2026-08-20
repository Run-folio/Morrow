import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import TripBuilder from "@/app/journey/new/trip-builder";
import type { JourneyCalendarDay, JourneyStop } from "@/lib/journey";
import { tripFromBuilder, type EasyTTrip } from "@/lib/easyt/trip";
import { JourneyItineraryRefinement } from "./journey-itinerary-refinement";
import { JourneyLocalFinder } from "./journey-local-finder";
import { PlanWorkspace, type PlanWorkspaceCopy } from "./journey-plan-workspace";
import { JourneyTripPrepAccommodation } from "./journey-trip-prep-accommodation";
import { JourneyTripQuality } from "./journey-trip-quality";

const planCopy: PlanWorkspaceCopy = {
  travelConnection: "Travel connection", localTransfer: "Local transfer", editingHint: "Drag activities to reorder them. Suggestions stay intact unless you remove them.", scheduleHealth: "Schedule health", needsCheck: "Needs a quick check", comfortable: "Comfortable pace", dayClear: "No long transfer or crowded activity signal for this day.", moveDay: "Move this day", earlier: "Earlier", later: "Later", editActivity: "Edit your custom activity", yours: "Yours", addActivity: "Add a custom activity", add: "Add", notes: "Notes to self", dayOnly: "For this day only", editNote: "Edit note", save: "Save", cancel: "Cancel", addNote: "Add a note", addNoteButton: "Add note", meal: "Dinner", savedRestaurant: "saved restaurant", next: "Next",
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

function PlanWorkspaceStory() {
  const [activities, setActivities] = useState(selectedDay.items);
  const [activityDraft, setActivityDraft] = useState("");
  const [notes, setNotes] = useState(["Book the airport transfer once the flight is confirmed."]);
  const [noteDraft, setNoteDraft] = useState("");
  return <div style={{ maxWidth: 760, padding: 24, border: "1px solid var(--morrovia-line)", borderRadius: "var(--morrovia-radius)", background: "#fff" }}>
    <p style={{ margin: "0 0 4px", color: "var(--morrovia-signal)", font: "800 10px/1.2 var(--morrovia-meta)", letterSpacing: ".12em" }}>AT TOKYO</p>
    <h2 style={{ margin: "0 0 16px", font: "600 28px/1 var(--morrovia-display)" }}>Shape the day</h2>
    <PlanWorkspace
      context={{ selectedDay, selectedStop, selectedDayIndex: 0, totalDays: 3, planItem: storyTrip().planItems[0], transfer: selectedDay.travel }}
      schedule={{ signals: ["Arrival transfer uses much of the day."], warning: "" }}
      activity={{
        items: activities, customItems: activities, draft: activityDraft, dragged: null, onDraftChange: setActivityDraft,
        onAdd: () => { if (activityDraft.trim()) { setActivities((items) => [...items, activityDraft.trim()]); setActivityDraft(""); } },
        onRename: ({ index }, value) => setActivities((items) => items.map((item, itemIndex) => itemIndex === index ? value : item)),
        onRemove: ({ index }) => setActivities((items) => items.filter((_, itemIndex) => itemIndex !== index)),
        onMove: ({ index }, to) => setActivities((items) => { const next = [...items]; const [item] = next.splice(index, 1); next.splice(Math.max(0, Math.min(to.index, next.length)), 0, item); return next; }),
        onDragStart: () => {}, onDragOver: (event) => event.preventDefault(), onDrop: (event) => event.preventDefault(), onDragEnd: () => {},
      }}
      notes={{
        items: notes, draft: noteDraft, editing: null, editingDraft: "", onDraftChange: setNoteDraft,
        onAdd: () => { if (noteDraft.trim()) { setNotes((items) => [...items, noteDraft.trim()]); setNoteDraft(""); } },
        onBeginEdit: () => {}, onEditingDraftChange: () => {}, onSaveEdit: () => {}, onCancelEdit: () => {}, onRemove: ({ index }) => setNotes((items) => items.filter((_, noteIndex) => noteIndex !== index)),
      }}
      navigation={{ onMoveDay: () => {}, onPreviousDay: () => {}, onNextDay: () => {}, nextDay: { date: "Aug 21", city: "Tokyo" } }}
      copy={planCopy}
    />
  </div>;
}

const meta = {
  title: "Patterns/Builder and planner",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const BuilderStart: Story = {
  render: () => <TripBuilder />,
};

export const BuilderAt390: Story = {
  parameters: { viewport: { defaultViewport: "morrovia390" } },
  render: () => <div style={{ width: 390, maxWidth: "100%" }}><TripBuilder /></div>,
};

export const ShapeTheDayPlan: Story = {
  parameters: { viewport: { defaultViewport: "morrovia390" } },
  render: () => <PlanWorkspaceStory />,
};

export const ShapeTheDayStay: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyLocalFinder kind="stay" city="Tokyo" country="Japan" dayId="storybook-tokyo-day" coordinates={[139.6917, 35.6895]} staySearch={{ checkIn: "2026-08-20", checkOut: "2026-08-23", adults: 2 }} /></div>,
};

export const ShapeTheDayEat: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyLocalFinder kind="restaurant" city="Tokyo" country="Japan" dayId="storybook-tokyo-day" coordinates={[139.6917, 35.6895]} /></div>,
};

export const ShapeTheDaySee: Story = {
  render: () => <div style={{ maxWidth: 620 }}><JourneyItineraryRefinement trip={storyTrip()} stop={storyTrip().stops[0]} onSelectionChange={() => {}} onExploreMap={() => {}} compact /></div>,
};
