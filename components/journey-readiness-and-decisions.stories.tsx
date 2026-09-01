import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EasyTButton } from "./easyt/easyt-controls";
import { JourneyTripQuality } from "./journey-trip-quality";

const meta = {
  title: "Morrovia/05 Product Patterns/Readiness and decisions",
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

export const ClearRecoveryAction: Story = {
  render: () => <section style={{ display: "grid", gap: 12, maxWidth: 520, padding: 28, border: "1px solid var(--morrovia-line)", borderRadius: "var(--morrovia-radius)", background: "#fff", color: "var(--morrovia-ink)" }}>
    <p style={{ margin: 0, color: "var(--morrovia-signal)", font: "800 10px/1.2 var(--morrovia-meta)", letterSpacing: ".12em" }}>YOUR NEXT STEP</p>
    <h2 style={{ margin: 0, font: "600 30px/1 var(--morrovia-display)", letterSpacing: "-.04em" }}>Start with the places that matter.</h2>
    <p style={{ margin: 0, color: "var(--morrovia-muted)", font: "15px/1.5 var(--morrovia-ui)" }}>Add a destination and Morrovia can begin shaping a realistic route around it.</p>
    <EasyTButton>Start a new trip</EasyTButton>
  </section>,
};
