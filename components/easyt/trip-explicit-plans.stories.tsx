import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { captureJourneyBrief } from "@/lib/easyt/journey-capture";
import { mergeStructuredTripBrief } from "@/lib/easyt/structured-trip-brief";
import { defaultTripIntent, type EasyTTrip } from "@/lib/easyt/trip";
import { removeExplicitVisitIntent, removeFixedCommitment, scheduleExplicitVisitIntent } from "@/lib/easyt/trip-explicit-plans";
import { tourTripFixture } from "./storybook/tour-trip.fixture";
import TripExplicitPlans from "./trip-explicit-plans";

const fixedCommitment = { id: "fixed-oaxaca", label: "Oaxaca", date: "2026-09-30", commitmentType: "fixed-date" as const, place: { name: "Oaxaca", canonicalPlaceId: "oaxaca-city", country: "Mexico", coordinates: [-96.7266, 17.0732] as [number, number] } };
const capture = captureJourneyBrief("Tulum and Cancun with a visit to Chichen Itza");
const intent = defaultTripIntent({ travellers: 2, durationDays: 8, stopIds: ["tulum", "cancun"] });
intent.hardConstraints.fixedCommitments = [fixedCommitment];
const stops: EasyTTrip["stops"] = [
  { id: "tulum", order: 0, name: "Tulum", country: "Mexico", canonicalPlaceId: "tulum", latitude: 20.2114, longitude: -87.4654, arrivalDate: "2026-09-26", departureDate: "2026-09-30", nights: 4 },
  { id: "cancun", order: 1, name: "Cancún", country: "Mexico", canonicalPlaceId: "cancun", latitude: 21.1619, longitude: -86.8515, arrivalDate: "2026-09-30", departureDate: "2026-10-04", nights: 4 },
];
const trip: EasyTTrip = {
  ...tourTripFixture,
  id: "explicit-plans-story",
  title: "Tulum & Cancún",
  startDate: "2026-09-26",
  endDate: "2026-10-04",
  brief: { ...tourTripFixture.brief, intent, structuredBrief: mergeStructuredTripBrief(capture.structuredBrief, { fixedCommitments: [fixedCommitment] }), itineraryIdeas: [] },
  stops,
  legs: [],
  planItems: tourTripFixture.planItems.map((day, index) => ({ ...day, id: `mexico-day-${index + 1}`, stopId: index < 4 ? "tulum" : "cancun", dayNumber: index + 1, date: new Date(Date.UTC(2026, 8, 26 + index)).toISOString().slice(0, 10), title: index < 4 ? "Explore Tulum" : "Explore Cancún", notes: [] })),
};

function Interactive() {
  const [value, setValue] = useState(trip);
  return <div style={{ maxWidth: 720 }}><TripExplicitPlans
    trip={value}
    variant="itinerary"
    onSchedule={(mentionId, dayId) => { setValue((current) => scheduleExplicitVisitIntent(current, mentionId, dayId)); return true; }}
    onRemoveVisit={(mentionId) => { setValue((current) => removeExplicitVisitIntent(current, mentionId)); return true; }}
    onRemoveCommitment={(commitmentId) => { setValue((current) => removeFixedCommitment(current, commitmentId)); return true; }}
  /></div>;
}

const meta = { title: "Morrovia/05 Product Patterns/Trip workspace/Explicit plans", component: TripExplicitPlans, parameters: { layout: "padded" } } satisfies Meta<typeof TripExplicitPlans>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = { args: { trip, variant: "overview" } };
export const ItineraryInteractive: Story = { args: { trip, variant: "itinerary" }, render: () => <Interactive /> };
export const Mobile390: Story = { args: { trip, variant: "overview" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
