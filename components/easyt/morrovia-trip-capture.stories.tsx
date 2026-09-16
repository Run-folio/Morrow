import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useRef, useState } from "react";
import { TOUR_TRIP_PROMPT, tourTripFixture } from "./storybook/tour-trip.fixture";
import { EasyTField } from "./easyt-controls";
import { MorroviaTripCapture, type MorroviaTripCaptureProps } from "./morrovia-trip-capture";
import { JourneyEndpointsEditor } from "./journey-endpoints-editor";

const endpointEntry = (start: string, end: string, mode: "unknown" | "same_as_start" | "explicit") => <JourneyEndpointsEditor
  showHeading={false}
  showHint={false}
  startValue={start}
  endValue={end}
  endSelection={mode === "explicit" ? { mode, place: { name: end } } : { mode }}
  onStartChange={() => undefined}
  onStartSelect={() => undefined}
  onEndChange={() => undefined}
  onEndSelect={() => undefined}
  onEndModeChange={() => undefined}
/>;

function ControlledCapture(props: Partial<MorroviaTripCaptureProps>) {
  const [value, setValue] = useState(props.value ?? "");
  const [startDate, setStartDate] = useState(props.startDate ?? "2026-09-12");
  const [endDate, setEndDate] = useState(props.endDate ?? "2026-09-26");
  const [travellers, setTravellers] = useState(props.travellers ?? 2);
  const [interests, setInterests] = useState(props.interests ?? []);
  const [mode, setMode] = useState<"stops" | "describe">(props.homepageEntry?.mode ?? "stops");
  const [budget, setBudget] = useState<"value" | "mid" | "high" | null>(props.homepageEntry?.budget ?? null);

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
    endpointEntry={props.endpointEntry}
    loading={props.loading}
    disabled={props.disabled}
    error={props.error}
    progressiveDetails={props.progressiveDetails}
    homepageEntry={props.homepageEntry ? {
      ...props.homepageEntry,
      mode,
      onModeChange: setMode,
      budget,
      onBudgetChange: setBudget,
      datesChosen: Boolean(startDate || endDate),
      onDatesClear: () => { setStartDate(""); setEndDate(""); },
    } : undefined}
  />;
}

const meta = {
  title: "Morrovia/05 Product Patterns/Trip capture",
  component: MorroviaTripCapture,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: "48px 24px" }}><div style={{ maxWidth: 1160, margin: "0 auto" }}><Story /></div></main>],
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
export const HomepageCollapsed: Story = { args: { progressiveDetails: true } };
export const HomepageExpanded: Story = {
  args: {
    progressiveDetails: true,
    value: "Japan for two weeks",
    endpointEntry: endpointEntry("London, United Kingdom", "", "unknown"),
    interests: ["nature", "food"],
  },
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('button[aria-controls]')?.click();
  },
};
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
export const HomepageStartUnknownEnd: Story = {
  args: { value: "Two weeks through Japan.", endpointEntry: endpointEntry("London, United Kingdom", "", "unknown") },
};
export const HomepageSameAsStart: Story = {
  args: { value: "Two weeks in Japan from London and back to London.", endpointEntry: endpointEntry("London, United Kingdom", "", "same_as_start") },
};
export const HomepageExplicitOpenJaw: Story = {
  args: { value: "Open jaw into Tokyo and out of Seoul.", endpointEntry: endpointEntry("Tokyo, Japan", "Seoul, South Korea", "explicit") },
};
export const HomepageEndpointFocus: Story = {
  args: { value: "Two weeks through Japan.", endpointEntry: endpointEntry("London, United Kingdom", "", "unknown") },
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLInputElement>('input[aria-label="Ending at"]')?.focus();
  },
};
export const HomepageEndpointsAt390: Story = {
  args: { value: "Two weeks through Japan.", endpointEntry: endpointEntry("London, United Kingdom", "", "unknown") },
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};
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
export const Mobile390: Story = { args: { progressiveDetails: true }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Tablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };

const wideDestinationEntry = <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
  <EasyTField label="First stop" placeholder="City, country or region" defaultValue="Lisbon" />
  <EasyTField label="Next stop" placeholder="Add another stop" defaultValue="Seville" />
</div>;

const wideHomepageArgs = {
  startDate: "2027-04-08",
  endDate: "2027-04-22",
  interests: [],
  homepageEntry: {
    mode: "stops",
    onModeChange: () => undefined,
    destinationEntry: wideDestinationEntry,
    budget: null,
    onBudgetChange: () => undefined,
    datesChosen: true,
    onDatesClear: () => undefined,
  },
} satisfies NonNullable<Story["args"]>;

export const WideHomepageCapture: Story = { args: wideHomepageArgs };

export const WideHomepageInteraction: Story = {
  args: {
    ...wideHomepageArgs,
  },
  play: async ({ canvasElement }) => {
    const settle = () => new Promise((resolve) => window.setTimeout(resolve, 0));
    if (canvasElement.querySelectorAll("form").length !== 1) throw new globalThis.Error("Wide capture must render one form");
    if (canvasElement.querySelectorAll('button[type="submit"]').length !== 1) throw new globalThis.Error("Wide capture must render one primary submit");

    const tabs = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    if (tabs.length !== 2 || tabs[0].getAttribute("aria-selected") !== "true") throw new globalThis.Error("Stops must be the selected tab initially");
    tabs[0].focus();
    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await settle();
    const describeTab = canvasElement.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
    if (describeTab.getAttribute("aria-selected") !== "true" || document.activeElement !== describeTab) throw new globalThis.Error("ArrowRight must select and focus Describe");
    canvasElement.querySelectorAll<HTMLButtonElement>('[role="tab"]')[0].click();
    await settle();
    if (canvasElement.querySelectorAll<HTMLButtonElement>('[role="tab"]')[0].getAttribute("aria-selected") !== "true") throw new globalThis.Error("Click must restore Stops mode");

    const personalize = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Personalize");
    if (!personalize) throw new globalThis.Error("Personalize control is missing");
    personalize.click();
    await settle();
    const culture = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Culture");
    if (!culture) throw new globalThis.Error("Culture interest is missing from Personalize");
    culture.click();
    await settle();
    const hide = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Hide personalization");
    if (!hide) throw new globalThis.Error("Hide personalization control is missing");
    const personalizePanelId = hide.getAttribute("aria-controls");
    if (!personalizePanelId || !canvasElement.querySelector(`#${CSS.escape(personalizePanelId)}`)) throw new globalThis.Error("Personalize panel did not open");
    hide.click();
    await settle();
    if (canvasElement.querySelector(`#${CSS.escape(personalizePanelId)}`)) throw new globalThis.Error("Personalize panel did not close");
    const reopen = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Personalize");
    if (!reopen) throw new globalThis.Error("Personalize reopen control is missing");
    reopen.click();
    await settle();
    if (!canvasElement.querySelector(`#${CSS.escape(personalizePanelId)}`)) throw new globalThis.Error("Personalize panel did not reopen");
    const retainedInterest = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Culture");
    if (retainedInterest?.getAttribute("aria-pressed") !== "true") throw new globalThis.Error("Expected retained interest after closing Personalize");
    const retainedDates = canvasElement.textContent?.includes("8 Apr 2027") && canvasElement.textContent?.includes("22 Apr 2027");
    if (!retainedDates) throw new globalThis.Error("Expected retained dates after closing Personalize");
  },
};

export const WideHomepageDescribeSpanish: Story = {
  args: {
    language: "es",
    value: "Dos semanas por Japón en tren, con comida y naturaleza.",
    startDate: "",
    endDate: "",
    homepageEntry: {
      mode: "describe",
      onModeChange: () => undefined,
      destinationEntry: wideDestinationEntry,
      budget: null,
      onBudgetChange: () => undefined,
      datesChosen: false,
      onDatesClear: () => undefined,
    },
  },
};

type StoryRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0?: { transcript?: string }; isFinal: boolean }> }) => void) | null;
};

let delayedRecognition: StoryRecognition | null = null;

class DelayedStoryRecognition implements StoryRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onresult: StoryRecognition["onresult"] = null;
  constructor() { delayedRecognition = this; }
  start() { this.onstart?.(); }
  stop() { this.onend?.(); }
  abort() { /* Keep the instance available to simulate a provider's delayed event. */ }
}

function VoiceUnmountCapture() {
  const originalRecognition = useRef(typeof window !== "undefined" ? window.SpeechRecognition : undefined);
  if (typeof window !== "undefined") {
    window.localStorage.setItem("morrovia-speech-disclosure-acknowledged-v1", "1");
    window.SpeechRecognition = DelayedStoryRecognition;
  }
  useEffect(() => () => {
    window.SpeechRecognition = originalRecognition.current;
    delayedRecognition = null;
  }, []);
  return <ControlledCapture {...wideHomepageArgs} homepageEntry={{ ...wideHomepageArgs.homepageEntry, mode: "describe" }} />;
}

export const WideHomepageDelayedVoiceAfterUnmount: Story = {
  render: () => <VoiceUnmountCapture />,
  play: async ({ canvasElement }) => {
    const settle = () => new Promise((resolve) => window.setTimeout(resolve, 0));
    await settle();
    const voice = canvasElement.querySelector<HTMLButtonElement>('button[aria-label="Use voice to add a trip idea"]');
    if (!voice) throw new globalThis.Error("Voice control is missing in Describe mode");
    voice.click();
    await settle();
    const delayedResult = delayedRecognition?.onresult;
    canvasElement.querySelectorAll<HTMLButtonElement>('[role="tab"]')[0]?.click();
    await settle();
    delayedResult?.({ resultIndex: 0, results: [{ 0: { transcript: "late provider transcript" }, isFinal: true }] });
    await settle();
    canvasElement.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]?.click();
    await settle();
    const prompt = canvasElement.querySelector<HTMLTextAreaElement>("textarea");
    if (prompt?.value) throw new globalThis.Error("Delayed voice result changed the unmounted Describe prompt");
  },
};

export const WideHomepageMobile390: Story = { ...WideHomepageCapture, globals: { viewport: { value: "morrovia390", isRotated: false } } };
