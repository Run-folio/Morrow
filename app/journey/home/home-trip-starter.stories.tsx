import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import HomeTripStarter from "./home-trip-starter";
import { HomeDestinationEditor } from "./home-destination-editor";
import { MorroviaTripCapture } from "@/components/easyt/morrovia-trip-capture";
import { EasyTButton, EasyTField } from "@/components/easyt/easyt-controls";
import type { HomepageDestinationEntry } from "@/lib/easyt/home-trip-handoff";
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
    const settle = () => new Promise((resolve) => window.setTimeout(resolve, 0));
    const entryIds = () => Array.from(canvasElement.querySelectorAll<HTMLElement>("[data-home-destination-entry]")).map((entry) => entry.dataset.homeDestinationEntry);
    if (entryIds().join(",") !== "entry-1,entry-2,entry-3") throw new Error("Repeated destinations must keep occurrence IDs");

    const firstInput = canvasElement.querySelector<HTMLInputElement>('input[aria-label="First stop"]');
    if (!firstInput) throw new Error("First destination input is missing");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(firstInput, "Tok");
    firstInput.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    if (!canvasElement.textContent?.includes("1 unconfirmed")) throw new Error("Editing text must clear only that occurrence selection");

    firstInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    firstInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle();
    if (canvasElement.querySelector<HTMLOutputElement>('output[aria-label="Story form submissions"]')?.value !== "0") throw new Error("Autocomplete Enter must select instead of submitting");

    canvasElement.querySelector<HTMLButtonElement>('button[aria-label="Move earlier stop 3"]')?.click();
    await settle();
    if (entryIds().join(",") !== "entry-1,entry-3,entry-2") throw new Error("Move earlier must target the occurrence ID");
    if (document.activeElement !== canvasElement.querySelector('[data-home-destination-entry="entry-3"] input')) throw new Error("Reordering must restore focus to the moved entry");

    canvasElement.querySelector<HTMLButtonElement>('button[aria-label="Remove stop 1"]')?.click();
    await settle();
    if (entryIds().join(",") !== "entry-3,entry-2") throw new Error("Removing first must preserve surviving IDs");
    if (document.activeElement !== canvasElement.querySelector('[data-home-destination-entry="entry-3"] input')) throw new Error("Removing first must focus the displayed first entry");
  },
};

export const DestinationSixthOccurrence: Story = {
  render: () => <DestinationEditorStory initialEntries={[storyEntry("entry-1", "Tokyo"), storyEntry("entry-2", "Kyoto"), storyEntry("entry-3", "Tokyo"), storyEntry("entry-4", "Nikko")]} />,
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('button[aria-label="Add another stop"]')?.click();
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
    if (entries[4]?.getAttribute("data-home-destination-entry") !== "entry-5" || addedInput.value !== "Tokyo, Japan") throw new Error("Adding the same place must retain its fresh occurrence ID");
    const firstFiveIds = Array.from(entries).map((entry) => entry.getAttribute("data-home-destination-entry"));
    canvasElement.querySelector<HTMLButtonElement>('button[aria-label="Add another stop"]')?.click();
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
    const input = canvasElement.querySelector<HTMLInputElement>('input[aria-label="First stop"]');
    if (!input) throw new Error("First destination input is missing");
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "No Such Place Qxz");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    if (!canvasElement.querySelector('[role="alert"]') || !Array.from(canvasElement.querySelectorAll("button")).some((button) => button.textContent === "Retry")) throw new Error("Provider failure must offer retry");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    if (input.getAttribute("aria-expanded") !== "false") throw new Error("Escape must close autocomplete results");
  },
};
