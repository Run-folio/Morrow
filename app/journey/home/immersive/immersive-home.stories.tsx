import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CanonicalPlaceAutocomplete } from "@/components/easyt/canonical-place-autocomplete";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { MorroviaTripCapture } from "@/components/easyt/morrovia-trip-capture";
import type { EasyTLanguage } from "@/lib/easyt/i18n";
import type { HomepageDestinationEntry } from "@/lib/easyt/home-trip-handoff";
import { immersiveHomepageRoutes } from "@/lib/easyt/immersive-homepage-routes";
import { canonicalPlaceSuggestionFor, isOvernightBaseEligible, type CanonicalPlaceSuggestion, type PlaceRoutability } from "@/lib/easyt/place-intelligence";
import type { TripInterest } from "@/lib/easyt/trip-interest";
import type { TravelProfile } from "@/lib/easyt/travel-profile";
import { HomeDestinationEditor } from "../home-destination-editor";
import ImmersiveHome from "./immersive-home";

const routes = immersiveHomepageRoutes();
const previewRouteIndex = Math.max(0, routes.findIndex((route) => route.key === "namibia-self-drive"));

const meta = {
  title: "Morrovia/05 Product Patterns/Homepage dual entry",
  component: ImmersiveHome,
  args: { routes, initialIndex: previewRouteIndex },
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/" } } },
} satisfies Meta<typeof ImmersiveHome>;

export default meta;
type Story = StoryObj<typeof meta>;

function selectedEntry(id: string, name: string): HomepageDestinationEntry {
  const selection = canonicalPlaceSuggestionFor(name);
  if (!selection) throw new Error(`Missing fixture destination: ${name}`);
  return { id, text: selection.label, selection };
}

function planningAreaEntry(id: string, name: string): HomepageDestinationEntry {
  const provenance = canonicalPlaceSuggestionFor("Tokyo")?.provenance;
  if (!provenance) throw new Error("Missing fixture provenance");
  return { id, text: name, selection: { canonicalPlaceId: name.toLocaleLowerCase(), name, label: name, country: name, placeType: "country", routability: "planning_area", provenance } };
}

const initialEntries = [
  selectedEntry("entry-1", "Tokyo"),
  selectedEntry("entry-2", "Kyoto"),
  selectedEntry("entry-3", "Nikko"),
  selectedEntry("entry-4", "Osaka"),
  selectedEntry("entry-5", "Hiroshima"),
];

function selectionRoutability(selection: CanonicalPlaceSuggestion): PlaceRoutability {
  if (selection.routability) return selection.routability;
  if (selection.placeType === "city" || selection.placeType === "town") return "direct_destination";
  if (["continent", "country", "macro_region", "region", "sub_region", "island", "archipelago", "natural_area", "coast", "mountain_range", "valley", "travel_corridor"].includes(selection.placeType)) return "planning_area";
  return "anchor_or_poi";
}

function destinationSummary(entries: HomepageDestinationEntry[], language: EasyTLanguage) {
  const confirmed = entries.flatMap((entry) => entry.selection ? [{ selection: entry.selection, routability: selectionRoutability(entry.selection) }] : []);
  const stops = confirmed.filter(({ selection, routability }) => isOvernightBaseEligible({ placeType: selection.placeType, routability })).length;
  const areas = confirmed.filter(({ routability }) => routability === "planning_area").length;
  const unconfirmed = entries.length - stops - areas;
  const parts = [
    stops ? `${stops} ${language === "es" ? (stops === 1 ? "parada" : "paradas") : (stops === 1 ? "stop" : "stops")}` : "",
    areas ? `${areas} ${language === "es" ? (areas === 1 ? "zona de planificación" : "zonas de planificación") : (areas === 1 ? "planning area" : "planning areas")}` : "",
    unconfirmed ? `${unconfirmed} ${language === "es" ? "sin confirmar" : "unconfirmed"}` : "",
  ].filter(Boolean);
  return parts.join(" · ") || (language === "es" ? "Añade tu primera parada" : "Add your first stop");
}

function CompactDestinationEntry({ entries, language, disabled, createEntry, onChange, initiallyOpen = false }: {
  entries: HomepageDestinationEntry[];
  language: EasyTLanguage;
  disabled?: boolean;
  createEntry: () => HomepageDestinationEntry;
  onChange: (entries: HomepageDestinationEntry[]) => void;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const editRef = useRef<HTMLButtonElement>(null);
  const first = entries[0];
  if (open) return <div>
    <HomeDestinationEditor entries={entries} language={language} disabled={disabled} createEntry={createEntry} onChange={onChange} />
    <EasyTButton variant="quiet" size="small" disabled={disabled} onClick={() => { setOpen(false); requestAnimationFrame(() => editRef.current?.focus()); }}>{language === "es" ? "Cerrar destinos" : "Close destinations"}</EasyTButton>
  </div>;
  const updateFirst = (value: string, selection: HomepageDestinationEntry["selection"] = null) => {
    if (first) onChange(entries.map((entry, index) => index === 0 ? { ...entry, text: value, selection } : entry));
    else {
      const entry = createEntry();
      onChange([{ ...entry, text: value, selection }]);
    }
  };
  return <div data-home-preview-first-entry={first?.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "end", gap: 10 }}>
    <div><span style={{ display: "block", marginBottom: 8, font: "var(--morrovia-type-metadata)" }}>{language === "es" ? "¿Adónde quieres ir?" : "Where do you want to go?"}</span><CanonicalPlaceAutocomplete language={language} label={language === "es" ? "¿Adónde quieres ir?" : "Where do you want to go?"} value={first?.text ?? ""} placeholder={language === "es" ? "Ciudad, país o región" : "City, country or region"} disabled={disabled} onChange={(value) => updateFirst(value)} onClear={() => updateFirst("")} onSelect={(selection) => updateFirst(selection.label, selection)} /></div>
    <EasyTButton ref={editRef} variant="secondary" size="small" disabled={disabled} aria-expanded={false} onClick={() => { if (!entries.length) onChange([createEntry()]); setOpen(true); }}>{destinationSummary(entries, language)} · {language === "es" ? "Editar" : "Edit"}</EasyTButton>
  </div>;
}

function PreviewPlanner({ language = "en", loading = false, error = "", initialMode = "stops", entries: fixtureEntries = initialEntries, destinationsOpen = false, value: initialValue = "A slow journey through Japan with food, gardens and rail travel.", startDate = "2027-04-03", endDate = "2027-04-20", initialInterests = ["food", "culture"], travelProfile = null }: { language?: EasyTLanguage; loading?: boolean; error?: string; initialMode?: "stops" | "describe"; entries?: HomepageDestinationEntry[]; destinationsOpen?: boolean; value?: string; startDate?: string; endDate?: string; initialInterests?: TripInterest[]; travelProfile?: TravelProfile | null }) {
  const [mode, setMode] = useState<"stops" | "describe">(initialMode);
  const [entries, setEntries] = useState(fixtureEntries);
  const nextId = useRef(fixtureEntries.length + 1);
  const firstEntryId = useRef(`entry-${nextId.current}`);
  const createEntry = () => {
    const id = firstEntryId.current;
    firstEntryId.current = `entry-${++nextId.current}`;
    return { id, text: "", selection: null };
  };
  const [brief, setBrief] = useState(initialValue);
  const [dates, setDates] = useState({ start: startDate, end: endDate });
  const [travellers, setTravellers] = useState(2);
  const [interests, setInterests] = useState<TripInterest[]>(initialInterests);
  const [budget, setBudget] = useState<"value" | "mid" | "high" | null>(null);
  return <MorroviaTripCapture
    formId="start-building"
    allowEmptyPrompt={mode === "stops"}
    language={language}
    value={brief}
    onValueChange={setBrief}
    startDate={dates.start}
    endDate={dates.end}
    onDatesChange={setDates}
    travellers={travellers}
    onTravellersChange={setTravellers}
    interests={interests}
    onInterestsChange={setInterests}
    onSubmit={() => undefined}
    loading={loading}
    disabled={loading}
    error={error}
    travelProfile={travelProfile}
    homepageEntry={{
      mode,
      onModeChange: setMode,
      destinationEntry: <CompactDestinationEntry entries={entries} language={language} disabled={loading} createEntry={createEntry} onChange={setEntries} initiallyOpen={destinationsOpen} />,
      budget,
      onBudgetChange: setBudget,
      datesChosen: Boolean(dates.start || dates.end),
      onDatesClear: () => setDates({ start: "", end: "" }),
    }}
  />;
}

function Composition({ language = "en", planner, compositionRoutes = routes }: { language?: EasyTLanguage; planner: ReactNode; compositionRoutes?: typeof routes }) {
  useEffect(() => {
    const previous = window.localStorage.getItem("easyt-language");
    window.localStorage.setItem("easyt-language", language);
    window.dispatchEvent(new CustomEvent("easyt-language-change", { detail: language }));
    return () => {
      if (previous === null) window.localStorage.removeItem("easyt-language");
      else window.localStorage.setItem("easyt-language", previous);
      window.dispatchEvent(new CustomEvent("easyt-language-change", { detail: previous === "es" ? "es" : "en" }));
    };
  }, [language]);
  return <ImmersiveHome routes={compositionRoutes} initialIndex={previewRouteIndex} presentation="dual-entry" plannerSlot={planner} />;
}

function Preview({ language = "en", loading = false, error = "" }: { language?: EasyTLanguage; loading?: boolean; error?: string }) {
  return <Composition language={language} planner={<PreviewPlanner language={language} loading={loading} error={error} />} />;
}

export const FullComposition: Story = {
  render: () => <Preview />,
  play: async ({ canvasElement }) => {
    if (canvasElement.querySelectorAll('header[data-easyt-app]').length !== 1) throw new Error("Expected one shared navigation");
    if (canvasElement.querySelectorAll('#routes').length !== 1) throw new Error("Expected one inspiration routes anchor");
    if (!canvasElement.querySelector('#start-building')) throw new Error("Planner form is missing");
    if (!Array.from(canvasElement.querySelectorAll("button")).some((button) => button.textContent?.includes("5 stops · Edit"))) throw new Error("Collapsed five-stop summary is missing");
    for (const selector of ["#route-story", "#product", "#booking-support", "#closing"]) if (!canvasElement.querySelector(selector)) throw new Error(`${selector} is missing`);
    const story = canvasElement.querySelector('#route-story');
    if (!story) throw new Error('Retained Route Story is missing');
    const original = story.textContent;
    for (const link of canvasElement.querySelectorAll<HTMLAnchorElement>('#routes a')) {
      link.focus();
      link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      if (story.textContent !== original) throw new Error('Card focus/hover changed Route Story');
      link.addEventListener("click", (event) => event.preventDefault(), { once: true });
      link.click();
      if (story.textContent !== original) throw new Error('Card click changed Route Story');
    }
    const describeTab = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Describe it");
    if (!describeTab) throw new Error("Describe mode trigger is missing");
    describeTab.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const brief = canvasElement.querySelector<HTMLTextAreaElement>('textarea[name="trip-brief"]');
    if (!brief) throw new Error("Describe mode did not open");
    const retainedBrief = brief.value;
    const stopsTab = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Add stops");
    if (!stopsTab) throw new Error("Stops mode trigger is missing");
    stopsTab.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const edit = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("5 stops · Edit"));
    if (!edit) throw new Error("Destination editor trigger is missing");
    edit.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (canvasElement.querySelectorAll("[data-home-destination-entry]").length !== 5) throw new Error("Destination editor did not retain all five stops");
    const close = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Close destinations");
    if (!close) throw new Error("Destination editor close control is missing");
    close.click();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    const restoredEdit = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("5 stops · Edit"));
    if (!restoredEdit || document.activeElement !== restoredEdit) throw new Error("Closing the editor did not restore focus to its remounted trigger");
    describeTab.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (canvasElement.querySelector<HTMLTextAreaElement>('textarea[name="trip-brief"]')?.value !== retainedBrief) throw new Error("Mode changes did not retain the trip description");
  },
};

export const DescribeMode: Story = { render: () => <Composition planner={<PreviewPlanner initialMode="describe" />} /> };
const emptyPlanner = <Composition planner={<PreviewPlanner entries={[]} value="" startDate="" endDate="" initialInterests={[]} />} />;
export const EmptyPlanner: Story = { render: () => emptyPlanner };
export const EmptyEntryAllocation: Story = { render: () => emptyPlanner, play: async ({ canvasElement }) => {
  const input = canvasElement.querySelector<HTMLInputElement>('input[aria-label="Where do you want to go?"]');
  if (!input) throw new Error("Empty planner destination input is missing");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Tok");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (!canvasElement.querySelector('[data-home-preview-first-entry="entry-1"]') || input.value !== "Tok") throw new Error("First typing did not allocate and retain an entry");
} };
export const DestinationListOpen: Story = { render: () => <Composition planner={<PreviewPlanner destinationsOpen />} /> };
export const PersonalizeOpen: Story = { render: () => <Preview />, play: async ({ canvasElement }) => { const trigger = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Personalize"); if (!trigger) throw new Error("Personalize trigger is missing"); trigger.click(); await new Promise((resolve) => setTimeout(resolve, 0)); if (!canvasElement.querySelector('[aria-label="What matters most?"]')) throw new Error("Personalize panel did not open"); } };
export const CalendarOpen: Story = { render: () => <Preview />, play: async ({ canvasElement }) => { const trigger = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("Apr 3, 2027")); if (!trigger) throw new Error("Start date trigger is missing"); trigger.click(); await new Promise((resolve) => setTimeout(resolve, 0)); if (!canvasElement.querySelector('[role="dialog"]')) throw new Error("Calendar dialog did not open"); } };
export const MixedDestinationSummary: Story = { render: () => <Composition planner={<PreviewPlanner entries={[selectedEntry("mixed-1", "Tokyo"), planningAreaEntry("mixed-2", "Japan"), { id: "mixed-3", text: "Somewhere coastal", selection: null }]} />} />, play: async ({ canvasElement }) => { if (!canvasElement.textContent?.includes("1 stop · 1 planning area · 1 unconfirmed · Edit")) throw new Error("Mixed destination summary is incorrect"); } };
export const LongRepeatedNames: Story = { render: () => <Composition planner={<PreviewPlanner destinationsOpen entries={[selectedEntry("long-1", "San Cristóbal de las Casas"), selectedEntry("long-2", "Tokyo"), selectedEntry("long-3", "San Cristóbal de las Casas"), selectedEntry("long-4", "Kyoto"), selectedEntry("long-5", "Tokyo")]} />} /> };
export const Spanish: Story = { render: () => <Preview language="es" /> };
export const Loading: Story = { render: () => <Preview loading />, play: async ({ canvasElement }) => {
  const interactive = Array.from(canvasElement.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>("#start-building input, #start-building textarea, #start-building button"));
  const enabled = interactive.filter((element) => !element.disabled);
  if (enabled.length) throw new Error(`Loading state left ${enabled.length} planner control(s) enabled`);
} };
export const ErrorState: Story = { render: () => <Preview error="We couldn't check this trip right now. Your details are still here." /> };
export const Guest: Story = { render: () => <Preview /> };
export const ProfileDefaults: Story = { render: () => <Composition planner={<PreviewPlanner initialInterests={["nature", "hiking"]} travelProfile={{ pace: "slow", usualInterests: ["nature", "hiking"], hotelMoves: "few", budget: "mid" }} />} /> };
export const EmptyRoutes: Story = { render: () => <Composition compositionRoutes={[]} planner={<PreviewPlanner />} /> };
