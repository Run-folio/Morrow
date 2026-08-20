import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EasyTButton } from "./easyt/easyt-controls";
import { JourneyTripPrepAccommodation } from "./journey-trip-prep-accommodation";
import { JourneyTripQuality } from "./journey-trip-quality";
import { tripFromBuilder, type EasyTTrip } from "@/lib/easyt/trip";

const trip = (bookings: EasyTTrip["brief"]["bookings"] = []) => {
  const built = tripFromBuilder({
  id: `storybook-readiness-${bookings.length}`, origin: "London", startDate: "2026-08-20", endDate: "2026-08-25", pace: "slow", hotels: "few", budget: "mid", mustDo: "Gardens and a relaxed food day.", picks: {}, dayAllocations: { tokyo: 3, kyoto: 2 },
  stops: [{ id: "tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] }, { id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] }],
    draft: [{ number: "1", date: "2026-08-20", destination: "Tokyo", title: "Arrive in Tokyo", reason: "Arrival day", items: ["Check in"] }],
  });
  return { ...built, brief: { ...built.brief, bookings } };
};

const sortedBookings: EasyTTrip["brief"]["bookings"] = [
  { id: "stay-tokyo", type: "stay", title: "Hotel in Shinjuku", date: "2026-08-20", confirmation: null, url: null },
  { id: "stay-kyoto", type: "stay", title: "Machiya stay in Gion", date: "2026-08-23", confirmation: null, url: null },
];

const partialBookings: EasyTTrip["brief"]["bookings"] = [sortedBookings[0]];

const meta = {
  title: "Patterns/Readiness and decisions",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TripAttention: Story = {
  render: () => <JourneyTripQuality origin="London" startDate="2026-08-20" endDate="2026-08-25" stops={[{ name: "Tokyo", country: "Japan" }]} mentions={[{ sourceText: "Kyoto", canonicalName: "Kyoto", role: "stop", status: "unresolved" }]} onAddMissingPlace={() => {}} onReviewOrigin={() => {}} onReviewDates={() => {}} onReviewTraveller={() => {}} />,
};

export const TripReady: Story = {
  render: () => <JourneyTripQuality origin="London" originCoordinates={[-0.1276, 51.5072]} startDate="2026-08-20" endDate="2026-08-25" stops={[{ name: "Tokyo", country: "Japan" }]} mentions={[{ sourceText: "Tokyo", canonicalName: "Tokyo", role: "stop", status: "resolved" }]} />,
};

export const AccommodationNeedsAStay: Story = { render: () => <JourneyTripPrepAccommodation trip={trip()} /> };

export const AccommodationPartiallySorted: Story = { render: () => <JourneyTripPrepAccommodation trip={trip(partialBookings)} /> };

export const AccommodationSorted: Story = { render: () => <JourneyTripPrepAccommodation trip={trip(sortedBookings)} /> };

export const ClearRecoveryAction: Story = {
  render: () => <section style={{ display: "grid", gap: 12, maxWidth: 520, padding: 28, border: "1px solid var(--morrovia-line)", borderRadius: "var(--morrovia-radius)", background: "#fff", color: "var(--morrovia-ink)" }}>
    <p style={{ margin: 0, color: "var(--morrovia-signal)", font: "800 10px/1.2 var(--morrovia-meta)", letterSpacing: ".12em" }}>YOUR NEXT STEP</p>
    <h2 style={{ margin: 0, font: "600 30px/1 var(--morrovia-display)", letterSpacing: "-.04em" }}>Start with the places that matter.</h2>
    <p style={{ margin: 0, color: "var(--morrovia-muted)", font: "15px/1.5 var(--morrovia-ui)" }}>Add a destination and Morrovia can begin shaping a realistic route around it.</p>
    <EasyTButton>Start a new trip</EasyTButton>
  </section>,
};
