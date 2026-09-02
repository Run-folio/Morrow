import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { defaultTripIntent, type EasyTTrip } from "@/lib/easyt/trip";
import type { ActivityInventoryItem } from "@/lib/easyt/activity-inventory";
import LiveActivityInventory from "./live-activity-inventory";

const intent = defaultTripIntent({ stopIds: ["paris-stop"], durationDays: 1 });
const trip: EasyTTrip = {
  schemaVersion: 1, id: "storybook-live-activities", ownerId: "storybook-traveller", title: "Paris", status: "draft", startDate: "2026-09-01", endDate: "2026-09-01", travellers: 2, currency: "GBP",
  brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, intent: { ...intent, preferences: { ...intent.preferences, interests: ["food", "culture"] } } },
  stops: [{ id: "paris-stop", canonicalPlaceId: "paris", order: 0, name: "Paris", country: "France", latitude: 48.8566, longitude: 2.3522, arrivalDate: "2026-09-01", departureDate: "2026-09-02", nights: 1 }], legs: [],
  planItems: [{ id: "day-1", stopId: "paris-stop", dayNumber: 1, date: "2026-09-01", type: "activity", title: "Explore Paris", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }],
  recommendations: [], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
};
const inventory: ActivityInventoryItem[] = [
  { provider: "viator", source: "viator", providerProductId: "PARIS-FOOD", title: "Paris food market tasting", destination: { canonicalPlaceId: "paris", label: "Paris", providerDestinationId: "479" }, rating: 4.8, reviewCount: 326, duration: { fixedMinutes: 180 }, price: { amount: 72, currency: "GBP" }, productUrl: "https://www.viator.com/tours/Paris/PARIS-FOOD?pid=storybook", provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-01T12:00:00.000Z" } },
  { provider: "viator", source: "viator", providerProductId: "PARIS-MUSEUM", title: "Louvre museum highlights", destination: { canonicalPlaceId: "paris", label: "Paris", providerDestinationId: "479" }, duration: { fromMinutes: 90, toMinutes: 120 }, productUrl: "https://www.viator.com/tours/Paris/PARIS-MUSEUM?pid=storybook", provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-01T12:00:00.000Z" } },
];

const meta = {
  title: "Morrovia/05 Product Patterns/Trip workspace/Live activity inventory",
  component: LiveActivityInventory,
  parameters: { layout: "padded" },
  args: { trip, stop: trip.stops[0], day: trip.planItems[0], placement: "itinerary_day_experiences", workspace: "itinerary", initialItems: inventory, onSave: () => true, onSchedule: () => true },
} satisfies Meta<typeof LiveActivityInventory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
