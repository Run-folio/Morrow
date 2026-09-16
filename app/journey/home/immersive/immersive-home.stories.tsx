import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useRef, useState } from "react";
import { CanonicalPlaceAutocomplete } from "@/components/easyt/canonical-place-autocomplete";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { MorroviaTripCapture } from "@/components/easyt/morrovia-trip-capture";
import type { EasyTLanguage } from "@/lib/easyt/i18n";
import type { HomepageDestinationEntry } from "@/lib/easyt/home-trip-handoff";
import { immersiveHomepageRoutes, initialImmersiveRouteIndex } from "@/lib/easyt/immersive-homepage-routes";
import { canonicalPlaceSuggestionFor } from "@/lib/easyt/place-intelligence";
import type { TripInterest } from "@/lib/easyt/trip-interest";
import { HomeDestinationEditor } from "../home-destination-editor";
import ImmersiveHome from "./immersive-home";

const routes = immersiveHomepageRoutes();

const meta = {
  title: "Morrovia/06 Pages/Homepage dual entry",
  component: ImmersiveHome,
  args: { routes, initialIndex: initialImmersiveRouteIndex(routes) },
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/" } } },
} satisfies Meta<typeof ImmersiveHome>;

export default meta;
type Story = StoryObj<typeof meta>;

function selectedEntry(id: string, name: string): HomepageDestinationEntry {
  const selection = canonicalPlaceSuggestionFor(name);
  if (!selection) throw new Error(`Missing fixture destination: ${name}`);
  return { id, text: selection.label, selection };
}

const initialEntries = [
  selectedEntry("entry-1", "Tokyo"),
  selectedEntry("entry-2", "Kyoto"),
  selectedEntry("entry-3", "Nikko"),
  selectedEntry("entry-4", "Osaka"),
  selectedEntry("entry-5", "Hiroshima"),
];

function CompactDestinationEntry({ entries, language, nextId, onNextId, onChange, initiallyOpen = false }: {
  entries: HomepageDestinationEntry[];
  language: EasyTLanguage;
  nextId: number;
  onNextId: (value: number) => void;
  onChange: (entries: HomepageDestinationEntry[]) => void;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const editRef = useRef<HTMLButtonElement>(null);
  const first = entries[0];
  if (open) return <div>
    <HomeDestinationEditor entries={entries} language={language} createEntry={() => {
      const entry = { id: `entry-${nextId}`, text: "", selection: null };
      onNextId(nextId + 1);
      return entry;
    }} onChange={onChange} />
    <EasyTButton variant="quiet" size="small" onClick={() => { setOpen(false); requestAnimationFrame(() => editRef.current?.focus()); }}>{language === "es" ? "Cerrar destinos" : "Close destinations"}</EasyTButton>
  </div>;
  return <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "end", gap: 10 }}>
    <div><span style={{ display: "block", marginBottom: 8, font: "var(--morrovia-type-metadata)" }}>{language === "es" ? "¿Adónde quieres ir?" : "Where do you want to go?"}</span><CanonicalPlaceAutocomplete language={language} label={language === "es" ? "¿Adónde quieres ir?" : "Where do you want to go?"} value={first?.text ?? ""} placeholder={language === "es" ? "Ciudad, país o región" : "City, country or region"} onChange={(value) => onChange(entries.map((entry, index) => index === 0 ? { ...entry, text: value, selection: null } : entry))} onClear={() => onChange(entries.map((entry, index) => index === 0 ? { ...entry, text: "", selection: null } : entry))} onSelect={(selection) => onChange(entries.map((entry, index) => index === 0 ? { ...entry, text: selection.label, selection } : entry))} /></div>
    <EasyTButton ref={editRef} variant="secondary" size="small" aria-expanded={false} onClick={() => setOpen(true)}>{entries.length} {language === "es" ? "paradas · Editar" : "stops · Edit"}</EasyTButton>
  </div>;
}

function PreviewPlanner({ language = "en", loading = false, error = "", initialMode = "stops", entries: fixtureEntries = initialEntries, destinationsOpen = false }: { language?: EasyTLanguage; loading?: boolean; error?: string; initialMode?: "stops" | "describe"; entries?: HomepageDestinationEntry[]; destinationsOpen?: boolean }) {
  const [mode, setMode] = useState<"stops" | "describe">(initialMode);
  const [entries, setEntries] = useState(fixtureEntries);
  const [nextId, setNextId] = useState(6);
  const [brief, setBrief] = useState("A slow journey through Japan with food, gardens and rail travel.");
  const [dates, setDates] = useState({ start: "2027-04-03", end: "2027-04-20" });
  const [travellers, setTravellers] = useState(2);
  const [interests, setInterests] = useState<TripInterest[]>(["food", "culture"]);
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
    error={error}
    homepageEntry={{
      mode,
      onModeChange: setMode,
      destinationEntry: <CompactDestinationEntry entries={entries} language={language} nextId={nextId} onNextId={setNextId} onChange={setEntries} initiallyOpen={destinationsOpen} />,
      budget,
      onBudgetChange: setBudget,
      datesChosen: Boolean(dates.start || dates.end),
      onDatesClear: () => setDates({ start: "", end: "" }),
    }}
  />;
}

function Preview({ language = "en", loading = false, error = "" }: { language?: EasyTLanguage; loading?: boolean; error?: string }) {
  if (typeof window !== "undefined") window.localStorage.setItem("easyt-language", language);
  return <ImmersiveHome routes={routes} initialIndex={initialImmersiveRouteIndex(routes)} presentation="dual-entry" plannerSlot={<PreviewPlanner language={language} loading={loading} error={error} />} />;
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
  },
};

export const DescribeMode: Story = { render: () => <ImmersiveHome routes={routes} initialIndex={initialImmersiveRouteIndex(routes)} presentation="dual-entry" plannerSlot={<PreviewPlanner initialMode="describe" />} /> };
export const DestinationListOpen: Story = { render: () => <ImmersiveHome routes={routes} initialIndex={initialImmersiveRouteIndex(routes)} presentation="dual-entry" plannerSlot={<PreviewPlanner destinationsOpen />} /> };
export const PersonalizeOpen: Story = { render: () => <Preview />, play: async ({ canvasElement }) => { Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Personalize")?.click(); } };
export const CalendarOpen: Story = { render: () => <Preview />, play: async ({ canvasElement }) => { Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("Apr 3, 2027"))?.click(); } };
export const LongRepeatedNames: Story = { render: () => <ImmersiveHome routes={routes} initialIndex={initialImmersiveRouteIndex(routes)} presentation="dual-entry" plannerSlot={<PreviewPlanner destinationsOpen entries={[selectedEntry("long-1", "San Cristóbal de las Casas"), selectedEntry("long-2", "Tokyo"), selectedEntry("long-3", "San Cristóbal de las Casas"), selectedEntry("long-4", "Kyoto"), selectedEntry("long-5", "Tokyo")]} />} /> };
export const Spanish: Story = { render: () => <Preview language="es" /> };
export const Loading: Story = { render: () => <Preview loading /> };
export const ErrorState: Story = { render: () => <Preview error="We couldn't check this trip right now. Your details are still here." /> };
export const EmptyRoutes: Story = { render: () => <ImmersiveHome routes={[]} initialIndex={0} presentation="dual-entry" plannerSlot={<PreviewPlanner />} /> };
