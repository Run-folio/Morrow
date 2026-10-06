import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import HomeTripStarter from "./home-trip-starter";
import { HomeDestinationEditor } from "./home-destination-editor";
import { MorroviaTripCapture } from "@/components/easyt/morrovia-trip-capture";
import { EasyTButton, EasyTField } from "@/components/easyt/easyt-controls";
import type { HomepageDestinationEntry, HomepageInputSnapshot } from "@/lib/easyt/home-trip-handoff";
import { captureJourneyBrief } from "@/lib/easyt/journey-capture";
import { homepageInputStorageKey } from "@/lib/easyt/private-browser-context";
import { homepageRouteReviewKey, homepageCapturedRouteEvidence } from "@/lib/easyt/home-route-choice";
import { canonicalPlaceSuggestionFor } from "@/lib/easyt/place-intelligence";

const meta = {
  title: "Morrovia/05 Product Patterns/Homepage trip starter",
  component: HomeTripStarter,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/" } },
  },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: "48px 24px" }}><div style={{ maxWidth: 720, margin: "0 auto" }}><Story /></div></main>],
} satisfies Meta<typeof HomeTripStarter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstVisit: Story = {
  play: async ({ canvasElement }) => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const tabs = canvasElement.querySelectorAll('[role="tab"]');
    if (tabs.length !== 2) throw new Error("The connected Homepage must retain both approved entry modes");
    if (!canvasElement.querySelector("[data-home-destination-entry]")) throw new Error("Stops mode must retain its first stable destination occurrence");
  },
};
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };

export const WideCompositionContract: Story = {
  render: () => <MorroviaTripCapture
    language="en"
    value=""
    onValueChange={() => undefined}
    startDate=""
    endDate=""
    onDatesChange={() => undefined}
    travellers={2}
    onTravellersChange={() => undefined}
    interests={[]}
    onInterestsChange={() => undefined}
    onSubmit={() => undefined}
    homepageEntry={{
      mode: "stops",
      onModeChange: () => undefined,
      destinationEntry: <EasyTField label="First stop" placeholder="City, country or region" />,
      budget: null,
      onBudgetChange: () => undefined,
      datesChosen: false,
      onDatesClear: () => undefined,
    }}
  />,
};

function storyEntry(id: string, name: string): HomepageDestinationEntry {
  const selection = canonicalPlaceSuggestionFor(name);
  if (!selection) throw new Error(`Missing story destination ${name}`);
  return { id, text: selection.label, selection };
}

function DestinationEditorStory({ language = "en", initialEntries = [storyEntry("entry-1", "Tokyo"), storyEntry("entry-2", "Kyoto"), storyEntry("entry-3", "Tokyo")] }: { language?: "en" | "es"; initialEntries?: HomepageDestinationEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [nextId, setNextId] = useState(initialEntries.length + 1);
  const [submits, setSubmits] = useState(0);
  return <form onSubmit={(event) => { event.preventDefault(); setSubmits((count) => count + 1); }}>
    <HomeDestinationEditor
      entries={entries}
      language={language}
      createEntry={() => {
        const entry = { id: `entry-${nextId}`, text: "", selection: null };
        setNextId((value) => value + 1);
        return entry;
      }}
      onChange={setEntries}
    />
    <EasyTButton type="submit" size="small" variant="quiet">Submit story form</EasyTButton>
    <output aria-label="Story form submissions">{submits}</output>
  </form>;
}

export const DestinationOccurrences: Story = {
  render: () => <DestinationEditorStory />,
  play: async ({ canvasElement }) => {
    const settle = () => new Promise((resolve) => window.setTimeout(resolve, 50));
    const ids = () => Array.from(canvasElement.querySelectorAll<HTMLElement>("[data-home-destination-entry]")).map(entry => entry.dataset.homeDestinationEntry);
    if (ids().join(",") !== "entry-1,entry-2,entry-3") throw new Error("Repeated destinations must keep occurrence IDs");
    if (canvasElement.querySelector('button[aria-label*="Move"]')) throw new Error("Destination intents must not expose route-order controls");
    if (canvasElement.querySelectorAll('button[aria-label="Add destination"]').length !== 1) throw new Error("One Add destination owner is required");
    canvasElement.querySelector<HTMLButtonElement>('[data-home-destination-entry="entry-1"] button')?.click();
    await settle();
    const input = canvasElement.querySelector<HTMLInputElement>('[data-home-destination-entry="entry-1"] input');
    if (!input) throw new Error("Editing must open only its occurrence");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Tok");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle();
    if (canvasElement.querySelector<HTMLOutputElement>('output[aria-label="Story form submissions"]')?.value !== "0") throw new Error("Autocomplete Enter must not submit");
    canvasElement.querySelector<HTMLButtonElement>('[data-home-destination-entry="entry-1"] button[aria-label^="Remove"]')?.click();
    await settle();
    if (ids().join(",") !== "entry-2,entry-3") throw new Error("Removing one Tokyo must preserve the other occurrence");
    if (!canvasElement.querySelector('[data-home-destination-entry="entry-3"]')?.textContent?.includes("Tokyo")) throw new Error("Other Tokyo selection changed");
    if (document.activeElement !== canvasElement.querySelector('[data-home-destination-entry="entry-2"] button')) throw new Error("Removal must restore nearby focus");
  },
};

export const DestinationSixthOccurrence: Story = {
  render: () => <DestinationEditorStory initialEntries={[storyEntry("entry-1", "Tokyo"), storyEntry("entry-2", "Kyoto"), storyEntry("entry-3", "Tokyo"), storyEntry("entry-4", "Nikko")]} />,
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('button[aria-label="Add destination"]')?.click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const entries = canvasElement.querySelectorAll("[data-home-destination-entry]");
    if (entries.length !== 5) throw new Error("Five total must mean five complete entries including the first");
    if (entries[4]?.getAttribute("data-home-destination-entry") !== "entry-5") throw new Error("Caller must allocate a fresh occurrence ID");
    const addedInput = entries[4]?.querySelector<HTMLInputElement>('input[role="combobox"]');
    if (!addedInput) throw new Error("Added destination input is missing");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(addedInput, "Tok");
    addedInput.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    addedInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    addedInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    if (entries[4]?.getAttribute("data-home-destination-entry") !== "entry-5" || !entries[4]?.textContent?.includes("Tokyo")) throw new Error("Adding the same place must retain its fresh occurrence ID");
    const firstFiveIds = Array.from(entries).map((entry) => entry.getAttribute("data-home-destination-entry"));
    canvasElement.querySelector<HTMLButtonElement>('button[aria-label="Add destination"]')?.click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const sixEntries = canvasElement.querySelectorAll("[data-home-destination-entry]");
    if (sixEntries.length !== 6 || sixEntries[5]?.getAttribute("data-home-destination-entry") !== "entry-6") throw new Error("Adding a sixth destination must use a fresh caller ID");
    if (Array.from(sixEntries).slice(0, 5).some((entry, index) => entry.getAttribute("data-home-destination-entry") !== firstFiveIds[index])) throw new Error("Adding a sixth destination must not overwrite the first five occurrences");
  },
};

export const DestinationEditorSpanish390: Story = {
  render: () => <DestinationEditorStory language="es" />,
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};

export const DestinationLongName: Story = {
  render: () => <DestinationEditorStory initialEntries={[storyEntry("entry-long", "San Cristóbal de las Casas"), storyEntry("entry-2", "Kyoto")]} />,
};

export const DestinationNoResultsRetry: Story = {
  render: () => <DestinationEditorStory initialEntries={[{ id: "entry-empty", text: "", selection: null }]} />,
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector<HTMLInputElement>('input[aria-label="Destination"]');
    if (!input) throw new Error("First destination input is missing");
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "No Such Place Qxz");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    if (!canvasElement.querySelector('[role="alert"]') || !Array.from(canvasElement.querySelectorAll("button")).some((button) => button.textContent === "Retry")) throw new Error("Provider failure must offer retry");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const currentInput = canvasElement.querySelector<HTMLInputElement>('[data-home-destination-entry="entry-empty"] input');
    if (currentInput && currentInput.getAttribute("aria-expanded") !== "false") throw new Error("Escape must close autocomplete results");
    if (!canvasElement.querySelector('[data-home-destination-entry="entry-empty"]')?.textContent?.includes("No Such Place Qxz")) throw new Error("Escape must preserve unresolved draft text");
  },
};

export const DestinationUnresolvedRecovery: Story = {
  render: () => <DestinationEditorStory initialEntries={[{ id: "entry-held", text: "San Pedro de Atacama", selection: null }, storyEntry("entry-2", "Tokyo")]} />,
};
export const DestinationLongName430: Story = { ...DestinationLongName, globals: { viewport: { value: "morrovia430", isRotated: false } } };

function seedPlanner(overrides: Partial<HomepageInputSnapshot>, language = "en") {
  return () => {
    const key = homepageInputStorageKey(null);
    const previous = localStorage.getItem(key);
    const previousLanguage = localStorage.getItem("easyt-language");
    const snapshot: HomepageInputSnapshot = {
      version: 1, ownerId: null, revision: 0, mode: "stops", prompt: "",
      entries: [storyEntry("tokyo-first", "Tokyo"), storyEntry("kyoto", "Kyoto"), storyEntry("tokyo-last", "Tokyo")],
      tripType: { state: "untouched" }, originInput: "London",
      origin: { state: "selected", value: { name: "London", canonicalPlaceId: "london", coordinates: [-.1276, 51.5072] } },
      journeyEnd: { state: "untouched" }, dates: { state: "selected", value: { start: "2026-10-15", end: "2026-10-29" } },
      budget: { state: "selected", value: "mid" }, interests: { state: "selected", value: ["food"] }, travellers: { state: "selected", value: 2 }, ...overrides,
    };
    localStorage.setItem(key, JSON.stringify({ snapshot }));
    localStorage.setItem("easyt-language", language);
    return () => {
      if (previous === null) localStorage.removeItem(key); else localStorage.setItem(key, previous);
      if (previousLanguage === null) localStorage.removeItem("easyt-language"); else localStorage.setItem("easyt-language", previousLanguage);
    };
  };
}
export const PlannerReturn: Story = { beforeEach: seedPlanner({}) };
export const PlannerOneWay: Story = { beforeEach: seedPlanner({ tripType: { state: "selected", value: "one_way" } }) };
export const PlannerExplicitFinish: Story = { beforeEach: seedPlanner({ tripType: { state: "selected", value: "one_way" }, journeyEnd: { state: "selected", value: { mode: "explicit", place: { name: "Rome", canonicalPlaceId: "rome" } } } }) };
export const PlannerLegacyUnknown: Story = { beforeEach: seedPlanner({ tripType: undefined }) };
export const PlannerDescribeConflict: Story = {
  beforeEach: seedPlanner({ mode: "describe", prompt: "Tokyo 3 nights, Kyoto 2 nights, finish in Rome 3 nights", tripType: { state: "selected", value: "one_way" }, journeyEnd: { state: "selected", value: { mode: "explicit", place: { name: "Rome", canonicalPlaceId: "rome" } } } }),
  play: async ({ canvasElement }) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    const root = canvasElement.querySelector('[data-homepage-trip-type]');
    const button = root?.querySelector<HTMLButtonElement>('button');
    const before = localStorage.getItem(homepageInputStorageKey(null));
    button?.click();
    await new Promise(resolve => setTimeout(resolve, 50));
    const dialog = canvasElement.querySelector<HTMLDialogElement>('dialog');
    if (!dialog?.open) throw new Error("Replacing a known finish requires review");
    Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === "Cancel")?.click();
    await new Promise(resolve => setTimeout(resolve, 50));
    if (localStorage.getItem(homepageInputStorageKey(null)) !== before) throw new Error("Cancel mutated the intake");
    button?.click();
    await new Promise(resolve => setTimeout(resolve, 50));
    Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === "Confirm")?.click();
    await new Promise(resolve => setTimeout(resolve, 100));
    const stored = JSON.parse(localStorage.getItem(homepageInputStorageKey(null)) ?? "null");
    if (stored.snapshot.tripType.value !== "return_to_start" || !stored.snapshot.routeReview) throw new Error("Return confirmation was not saved atomically");
    if (stored.snapshot.prompt !== "Tokyo 3 nights, Kyoto 2 nights, finish in Rome 3 nights") throw new Error("Review must preserve the original source");
    const evidence = homepageCapturedRouteEvidence(stored.snapshot.prompt, captureJourneyBrief(stored.snapshot.prompt));
    if (homepageRouteReviewKey(stored.snapshot, evidence) !== stored.snapshot.routeReview.reviewedInputKey) throw new Error("Review evidence key changed");
  },
};
export const PlannerSpanish430: Story = { beforeEach: seedPlanner({ entries: [storyEntry("long", "San Cristóbal de las Casas"), storyEntry("repeat", "Tokyo")] }, "es"), globals: { viewport: { value: "morrovia430", isRotated: false } } };
