import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { TOUR_TRIP_PROMPT, tourTripFixture } from "./storybook/tour-trip.fixture";
import { EasyTField } from "./easyt-controls";
import { MorroviaTripCapture, type MorroviaTripCaptureProps } from "./morrovia-trip-capture";

function ControlledCapture(props: Partial<MorroviaTripCaptureProps>) {
  const [value, setValue] = useState(props.value ?? "");
  const [startDate, setStartDate] = useState(props.startDate ?? "2026-09-12");
  const [endDate, setEndDate] = useState(props.endDate ?? "2026-09-26");
  const [travellers, setTravellers] = useState(props.travellers ?? 2);
  const [interests, setInterests] = useState(props.interests ?? []);

  return <MorroviaTripCapture
    language={props.language ?? "en"}
    value={value}
    onValueChange={setValue}
    startDate={startDate}
    endDate={endDate}
    onDatesChange={(range) => { setStartDate(range.start); setEndDate(range.end); }}
    travellers={travellers}
    onTravellersChange={setTravellers}
    interests={interests}
    onInterestsChange={setInterests}
    onSubmit={() => undefined}
    allowEmptyPrompt={props.allowEmptyPrompt}
    manualEntry={props.manualEntry}
    loading={props.loading}
    disabled={props.disabled}
    error={props.error}
  />;
}

const meta = {
  title: "Morrovia/05 Product Patterns/Trip capture",
  component: MorroviaTripCapture,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: "48px 24px" }}><div style={{ maxWidth: 720, margin: "0 auto" }}><Story /></div></main>],
  render: (args) => <ControlledCapture {...args} />,
  args: {
    language: "en",
    value: "",
    startDate: "2026-09-12",
    endDate: "2026-09-26",
    travellers: 2,
    interests: [],
    onValueChange: () => undefined,
    onDatesChange: () => undefined,
    onTravellersChange: () => undefined,
    onInterestsChange: () => undefined,
    onSubmit: () => undefined,
  },
} satisfies Meta<typeof MorroviaTripCapture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstVisit: Story = {};
export const EmptyPromptValidation: Story = {
  play: async ({ canvasElement }) => {
    const submit = Array.from(canvasElement.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Plan my trip"));
    submit?.click();
  },
};
export const AIAndSpeechTransparency: Story = { args: { value: "A relaxed train trip from Paris through Switzerland." } };
export const CompactDefaultHierarchy: Story = { args: { value: "A relaxed train trip from Paris through Switzerland." } };
export const Filled: Story = { args: { value: "Paris to Lisbon, Madrid and Seville for two weeks.", interests: ["food", "culture"] } };
export const BuilderManualAlternative: Story = {
  args: {
    allowEmptyPrompt: true,
    manualEntry: <div style={{ display: "grid", gridTemplateColumns: "minmax(0, .8fr) minmax(0, 1.2fr)", gap: 10 }}>
      <EasyTField label="From" placeholder="Departure city or airport" />
      <EasyTField label="Where to" placeholder="Add a city, country or region" />
    </div>,
  },
};
export const TourCuscoTrip: Story = {
  args: {
    value: TOUR_TRIP_PROMPT,
    startDate: tourTripFixture.startDate,
    endDate: tourTripFixture.endDate,
    travellers: tourTripFixture.travellers,
    interests: ["food", "culture"],
  },
};
export const Loading: Story = { args: { value: "Two weeks through Japan.", loading: true } };
export const Error: Story = { args: { value: "Two weeks through Japan.", error: "We couldn't understand your trip. Please try again." } };
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Tablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
