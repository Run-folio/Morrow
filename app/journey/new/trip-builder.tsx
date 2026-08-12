"use client";

/**
 * EasyT — new trip builder (v2 flow: Where → When → Places → Time → Draft)
 * Self-contained client component. Drop in at app/journey/new/trip-builder.tsx
 * and render <TripBuilder /> from page.tsx.
 *
 * Wire-up points marked TODO: geocode validation, place catalog, day imagery,
 * research pass. Everything else is complete.
 */

import {
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight,
  Clock, GripVertical, MapPin, Plane, Plus, Users, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadActiveTrip, loadTripFromEasyT, saveActiveTrip } from "@/lib/easyt/storage";
import { tripFromBuilder } from "@/lib/easyt/trip";
import { buildCredibleItinerary, type PlannedDay, type PlannerPlace } from "@/lib/easyt/planner";
import { journeyMedia, type JourneyImage } from "@/lib/journey";
import styles from "./trip-builder.module.css";
import mobilePolish from "./trip-builder-mobile.module.css";
import { easytCopy, languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { inspirationByKey } from "@/lib/easyt/inspiration";
import { defaultTravelProfile, isTravelProfile, type TravelProfile } from "@/lib/easyt/travel-profile";
import { parseTripBrief } from "@/lib/easyt/trip-brief";

/* ---------------------------------------------------------------- data */

export type Place = PlannerPlace;
export type Stop = { id: string; name: string; country: string; coordinates?: [number, number] };

// TODO: replace with the live discovery API response.
const CATALOG: Record<string, Place[]> = {
  tokyo: [
    { title: "Asakusa & Senso-ji", area: "East Tokyo", type: "Landmark", cost: 0.5, tags: ["Cities"], description: "Old Tokyo atmosphere, best paired with a nearby food stop rather than a cross-city rush." },
    { title: "Meiji Jingu & Harajuku", area: "West Tokyo", type: "Culture", cost: 0.5, tags: ["Cities"], description: "A forested shrine and the city's most kinetic streets in one natural area." },
    { title: "Mt. Takao", area: "Tokyo west", type: "Nature", cost: 0.5, tags: ["Nature"], description: "A rail escape for a summit walk and a proper break from the city." },
    { title: "Tokyo Marathon", area: "Central Tokyo", type: "Anchor event", cost: 1, tags: ["Cities"], description: "A fixed date that the rest of the week has to bend around." },
    { title: "Food neighbourhood night", area: "Ginza · Shinjuku or Ebisu", type: "Food", cost: 0.5, tags: ["Food"], description: "Leave a night open for the sort of meal that changes the shape of a city." },
  ],
  "hong kong": [
    { title: "Victoria Peak", area: "Central", type: "Viewpoint", cost: 0.5, tags: ["Cities"], description: "The big skyline moment; pair it with Central and a harbour evening." },
    { title: "Star Ferry & harbour", area: "Central ↔ Tsim Sha Tsui", type: "City ritual", cost: 0.5, tags: ["Cities"], description: "A short crossing with maximum sense of place, especially close to dusk." },
    { title: "Dragon's Back", area: "Shek O", type: "Hike", cost: 0.5, tags: ["Nature", "Beach"], description: "A ridge walk finishing naturally near Big Wave Bay or Shek O." },
    { title: "Tai Kwun & old Central", area: "Central", type: "Design + culture", cost: 0.5, tags: ["Cities"], description: "Heritage, galleries and the city's steep streets in one compact stop." },
    { title: "Cantonese food night", area: "Wan Chai or Kowloon", type: "Food", cost: 0.5, tags: ["Food"], description: "Room for one flexible dinner rather than deciding the cuisine in advance." },
  ],
};

/**
 * Fast, relevant next-stop prompts. They deliberately appear only after a
 * destination has been added — an empty route should not pretend to know
 * where someone wants to go.
 */
const NEARBY_SUGGESTIONS: Record<string, string[]> = {
  tokyo: ["Nikko", "Kanazawa", "Takayama", "Kyoto"],
  japan: ["Kyoto", "Kanazawa", "Takayama", "Nikko", "Hiroshima"],
  paris: ["Versailles", "Reims", "Lyon", "Bordeaux"],
  france: ["Lyon", "Bordeaux", "Nice", "Strasbourg"],
  "mexico city": ["Puebla", "Oaxaca", "Tepoztlán", "San Miguel de Allende"],
  mexico: ["Puebla", "Oaxaca", "Mérida", "San Miguel de Allende"],
  bangkok: ["Ayutthaya", "Kanchanaburi", "Chiang Mai", "Koh Samui"],
  thailand: ["Chiang Mai", "Ayutthaya", "Kanchanaburi", "Krabi"],
  london: ["Bath", "Oxford", "Brighton", "Edinburgh"],
  "united kingdom": ["Bath", "Edinburgh", "York", "Brighton"],
  barcelona: ["Girona", "Valencia", "Madrid", "Seville"],
  madrid: ["Toledo", "Seville", "Valencia", "Barcelona"],
  spain: ["Seville", "Granada", "Valencia", "Barcelona"],
  rome: ["Florence", "Naples", "Bologna", "Sorrento"],
  italy: ["Florence", "Bologna", "Naples", "Venice"],
  "hong kong": ["Macau", "Shenzhen", "Guangzhou", "Taipei"],
  china: ["Shanghai", "Chengdu", "Xi'an", "Hong Kong"],
  "guatemala city": ["Antigua Guatemala", "Lake Atitlán", "Flores", "Semuc Champey"],
  guatemala: ["Antigua Guatemala", "Lake Atitlán", "Flores", "Tikal"],
};
const ROUTE_HINT_SUGGESTIONS: Record<string, string[]> = {
  "north-japan": ["Sapporo", "Hakodate", "Sendai"],
  "south-japan": ["Fukuoka", "Nagasaki", "Kagoshima"],
};
const FILTERS = ["All", "Food", "Nature", "Cities", "Beach"];
const STEPS = [
  { label: "Confirm", note: "Route & dates" },
  { label: "Places", note: "What matters" },
  { label: "Places", note: "Spend your days" },
  { label: "Time", note: "Make room for what matters" },
];

/** Distinct filler days — never repeat one entry verbatim. */
const OPEN_DAYS = [
  { title: "Open day", reason: "Nothing scheduled. Whatever you found yesterday gets today.", items: ["Start wherever you left off", "One walkable area, no cross-city legs", "Leave the evening open"] },
  { title: "Neighbourhood day", reason: "One district, on foot, chosen once you're on the ground.", items: ["Pick a district over breakfast", "Walk it properly rather than ticking sights", "Eat where the queue is local"] },
  { title: "Day trip, if you feel like it", reason: "Held loosely: a short rail hop, or nothing at all.", items: ["Check the weather first", "Keep it under 90 minutes each way", "Be back for an unhurried dinner"] },
  { title: "Slow morning", reason: "A deliberate gap so the trip doesn't turn into a schedule.", items: ["No alarm", "One thing only, in the afternoon", "Restock and reset"] },
  { title: "Repeat day", reason: "Go back to the one place that landed best so far.", items: ["Return somewhere you liked", "See it at a different hour", "Nothing new required"] },
];

/* ------------------------------------------------------------- helpers */

const pad = (n: number) => String(n).padStart(2, "0");
const half = (n: number) => String(n).replace(".5", "½");
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fmtLong = (value: string) => {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(d);
};
const parseTyped = (text: string) => {
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : iso(d);
};
const placesFor = (stop: Stop, discovered: Record<string, Place[]>): Place[] =>
  discovered[stop.id] ?? CATALOG[stop.name.trim().toLowerCase()] ?? [];

const suggestionsFor = (stop?: Stop) => {
  if (!stop) return [];
  const nearby = NEARBY_SUGGESTIONS[stop.name.trim().toLowerCase()]
    ?? NEARBY_SUGGESTIONS[stop.country.trim().toLowerCase()]
    ?? [];
  return nearby.filter((name) => name.toLowerCase() !== stop.name.toLowerCase());
};

/** Keep a saved custom split valid when the route or dates change. */
const rebalanceDays = (
  stops: Stop[],
  totalDays: number,
  preferred: Record<string, number>,
  recommended: Record<string, number>,
) => {
  const result = Object.fromEntries(stops.map((stop) => [
    stop.id,
    Math.max(1, Math.round(preferred[stop.id] ?? recommended[stop.id] ?? 1)),
  ])) as Record<string, number>;
  if (!stops.length || totalDays < stops.length) return result;

  let difference = totalDays - Object.values(result).reduce((sum, days) => sum + days, 0);
  while (difference < 0) {
    const donor = [...stops].sort((a, b) => result[b.id] - result[a.id])[0];
    if (!donor || result[donor.id] <= 1) break;
    result[donor.id] -= 1;
    difference += 1;
  }
  while (difference > 0) {
    const receiver = [...stops].sort((a, b) => {
      const aGap = (recommended[a.id] ?? 1) - result[a.id];
      const bGap = (recommended[b.id] ?? 1) - result[b.id];
      return bGap - aGap;
    })[0];
    if (!receiver) break;
    result[receiver.id] += 1;
    difference -= 1;
  }
  return result;
};

const MEDIA_KEYS: Record<string, string> = {
  "guatemala city": "guatemala",
  "los angeles": "los-angeles-out",
  "hong kong": "hong-kong",
  "hirayu onsen": "hirayu",
  "mt takao": "tokyo",
  "mount takao": "tokyo",
  "tianmen mountain": "zhangjiajie",
  "zhangjiajie national forest park": "wulingyuan",
};

const PLACE_IMAGE_HINTS: Record<string, string> = {
  "asakusa & senso-ji": "tokyo.jpg",
  "meiji jingu & harajuku": "imperial-palace.jpg",
  "mt. takao": "takao-summit.jpg",
  "tokyo marathon": "tokyo-marathon.jpg",
  "food neighbourhood night": "ginza-night.jpg",
  "victoria peak": "hong-kong.jpg",
  "star ferry & harbour": "star-ferry.jpg",
  "dragon's back": "dragons-back.jpg",
  "tai kwun & old central": "hong-kong-central-tram.jpg",
  "cantonese food night": "hong-kong-central-tram.jpg",
};

const mediaImagesFor = (destination: string): JourneyImage[] => {
  const normalized = destination.trim().toLowerCase();
  const key = MEDIA_KEYS[normalized] ?? normalized.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const media = journeyMedia[key] ?? journeyMedia[Object.keys(journeyMedia).find((mediaKey) =>
    mediaKey !== "los-angeles-back" && (key.includes(mediaKey) || mediaKey.includes(key)),
  ) ?? ""];
  return media ? [media.hero, ...(media.gallery ?? [])] : [];
};

const normalizeMediaText = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const placeImageFor = (place: Place, stop: Stop): JourneyImage | null => {
  if (place.image) return { src: place.image, alt: place.title, caption: place.title, sourceUrl: place.sourceUrl ?? place.image };
  const images = mediaImagesFor(stop.name);
  const filename = PLACE_IMAGE_HINTS[place.title.toLowerCase()];
  if (filename) return images.find((image) => image.src.endsWith(`/${filename}`)) ?? null;
  const words = place.title.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  return images.find((image) => words.some((word) => `${image.alt} ${image.caption}`.toLowerCase().includes(word))) ?? images[0] ?? null;
};

const dayImageFor = (day: { title: string; destination: string; items: string[] }, index: number): JourneyImage | null => {
  const images = mediaImagesFor(day.destination);
  if (!images.length) return null;
  const searchable = normalizeMediaText(`${day.title} ${day.items.join(" ")}`);
  const hinted = Object.entries(PLACE_IMAGE_HINTS).find(([title]) => searchable.includes(normalizeMediaText(title)))?.[1];
  return (hinted ? images.find((image) => image.src.endsWith(`/${hinted}`)) : null) ?? images[index % images.length];
};

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);
  return ref;
}

/* --------------------------------------------------------- sub-components */

export function Calendar({ value, onPick, language = "en" }: { value: string; onPick: (v: string) => void; language?: EasyTLanguage }) {
  const [view, setView] = useState(value || iso(new Date()));
  const v = new Date(`${view}T00:00:00`);
  const offset = new Date(v.getFullYear(), v.getMonth(), 1).getDay();
  const total = new Date(v.getFullYear(), v.getMonth() + 1, 0).getDate();
  const shift = (delta: number) => {
    const next = new Date(v); next.setMonth(next.getMonth() + delta, 1); setView(iso(next));
  };
  return (
    <div className={styles.calendar}>
      <div className={styles.calendarHead}>
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></button>
        <strong>{new Intl.DateTimeFormat(language === "es" ? "es" : "en", { month: "long", year: "numeric" }).format(v)}</strong>
        <button type="button" onClick={() => shift(1)} aria-label="Next month"><ChevronRight /></button>
      </div>
      <div className={styles.calendarWeekdays}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className={styles.calendarGrid}>
        {Array.from({ length: offset }, (_, i) => <span key={`p${i}`} />)}
        {Array.from({ length: total }, (_, i) => {
          const day = `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(i + 1)}`;
          return <button type="button" key={day} className={day === value ? styles.calendarDaySelected : ""} onClick={() => onPick(day)}>{i + 1}</button>;
        })}
      </div>
    </div>
  );
}

function RadioGroup<T extends string>({ label, help, value, options, onChange }: {
  label: string; help: string; value: T;
  options: { value: T; label: string; note: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className={styles.group}>
      <legend>{label}</legend>
      <p className={styles.groupHelp}>{help}</p>
      <div className={styles.groupGrid} style={{ gridTemplateColumns: `repeat(${options.length},1fr)` }}>
        {options.map((opt) => {
          const on = opt.value === value;
          return (
            <button type="button" key={opt.value} role="radio" aria-checked={on}
              className={`${styles.radioCard} ${on ? styles.radioCardOn : ""}`} onClick={() => onChange(opt.value)}>
              <span className={styles.radioDot} />
              <span>
                <strong>{opt.label}</strong>
                <small>{opt.note}</small>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------- main */

export default function TripBuilder() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const copy = easytCopy[language].builder;
  const ui = language === "es" ? {
    previousMonth: "Mes anterior", nextMonth: "Mes siguiente", draft: "Borrador · editable", editBrief: "Editar resumen",
    dayByDay: "Día a día", source: "Fuente ↗", previousDay: "← Día anterior", nextDay: "Siguiente día →",
    savingChanges: "Guardando cambios…", savedDevice: "Guardado en este dispositivo", exploreMap: "Explora el mapa primero y guárdalo en una cuenta cuando estés listo.", openMap: "Abrir mapa →",
    addOrigin: "Añade tu ciudad o aeropuerto de salida.", addStop: "Añade al menos una parada para continuar", typePlace: "Escribe primero una ciudad, región o lugar.", checking: "Comprobando este lugar…", unavailable: "No pudimos comprobar este lugar ahora. Inténtalo de nuevo.",
    verifyOrigin: "No pudimos verificar ese punto de partida.", originUnavailable: "No pudimos comprobar ese punto de partida ahora.", startDate: "Fecha de inicio", endDate: "Fecha de fin", pickDate: "Elige una fecha", typeIt: "O escríbela",
    day: "día", days: "días", split: "Elige exactamente cómo repartir tu tiempo entre destinos en el siguiente paso.", addStops: "Añade paradas y se repartirán entre ellas.", selected: "seleccionados", finding: "Buscando lugares y actividades reales cerca de", noSuggestions: "Aún no hay sugerencias fiables. Comprueba la ubicación o inténtalo de nuevo.",
    tripBriefLabel: "TU IDEA DE VIAJE", tripBriefTitle: "¿Qué quieres hacer realidad?", tripBriefHelp: "Cuéntanos la ocasión, las fechas fijas, los lugares, el presupuesto o cualquier contexto que ayude a dar forma a este viaje.", tripBriefPlaceholder: "Por ejemplo: Tenemos tres semanas en Japón, una maratón en Tokio y queremos terminar en Hong Kong sin prisas.", tripBriefHint: "Opcional, pero útil cuando el viaje tiene mucho que encajar.", tripBriefApply: "Usar esta idea",
    yourTime: "TU TIEMPO", shapeDays: "Organiza tus días", allocation: "Hemos sugerido una distribución inicial según tus lugares. Mueve un control y EasyT reajustará el resto.", total: "días en total", suggested: "sugeridos", budget: "Presupuesto", budgetHelp: "Se usa para elegir dónde dormir y comer durante la investigación.", value: "Buena relación calidad-precio", valueNote: "Cómodo, sin excesos.", mid: "Gama media", midNote: "Algunos caprichos.", high: "Sin límite", highNote: "Lo mejor disponible.", route: "RUTA HASTA AHORA", departure: "Salida", routeEmpty: "Añade una parada y la ruta aparecerá aquí.", daysBudget: "PRESUPUESTO DE DÍAS", full: "COMPLETO", room: "DÍAS DISPONIBLES", overBy: "EXCESO DE", available: "días disponibles", committed: "comprometidos", open: "libres", overHint: "Hay más lugares seleccionados de los que permiten las fechas. Quita un lugar, elimina una parada o añade días.", selectedPlaces: "LUGARES SELECCIONADOS", nothingSelected: "Aún no hay nada seleccionado. El paso 03 concreta el viaje.", removePlace: "Quitar lugar", placesSelected: "lugares seleccionados", daysTotal: "días en total"
  } : {
    previousMonth: "Previous month", nextMonth: "Next month", draft: "Draft · editable", editBrief: "Edit brief", dayByDay: "Day by day", source: "Source ↗", previousDay: "← Previous day", nextDay: "Next day →", savingChanges: "Saving changes…", savedDevice: "Saved on this device", exploreMap: "Explore the map first, then save it to an account when you are ready.", openMap: "Open map view →", addOrigin: "Add the city or airport you're leaving from.", addStop: "Add at least one stop to continue", typePlace: "Type a city, region or landmark first.", checking: "Checking this place…", unavailable: "We couldn't check that place just now. Please try again.", verifyOrigin: "We couldn't verify that starting point.", originUnavailable: "We couldn't check that starting point just now.", startDate: "Start date", endDate: "End date", pickDate: "Pick a date", typeIt: "Or type it", day: "day", days: "days", split: "Choose exactly how your time is split between destinations in the next step.", addStops: "Add stops and this splits across them.", selected: "selected", finding: "Finding real places, landmarks and activities around", noSuggestions: "No reliable suggestions loaded yet. Check the location or try again shortly.", tripBriefLabel: "YOUR TRIP BRIEF", tripBriefTitle: "What are you trying to make happen?", tripBriefHelp: "Share the occasion, fixed dates, places, budget or any context that helps shape this trip.", tripBriefPlaceholder: "For example: We have three weeks in Japan, a marathon in Tokyo, and want to finish in Hong Kong without rushing.", tripBriefHint: "Optional, but useful when the trip has a lot to hold together.", tripBriefApply: "Use this brief", yourTime: "YOUR TIME", shapeDays: "Shape the days", allocation: "We've suggested a starting split from your selected places. Move a slider and EasyT rebalances the rest.", total: "days total", suggested: "suggested", budget: "Budget band", budgetHelp: "Used to pick where to sleep and eat during research.", value: "Good value", valueNote: "Comfortable, not precious.", mid: "Mid-range", midNote: "Some splurges.", high: "No ceiling", highNote: "Best available.", route: "ROUTE SO FAR", departure: "Departure", routeEmpty: "Add a stop and the route builds here as you go.", daysBudget: "DAYS BUDGET", full: "FULL", room: "ROOM LEFT", overBy: "OVER BY", available: "days available", committed: "committed", open: "open", overHint: "More is selected than the dates allow. Remove a place, drop a stop, or add days.", selectedPlaces: "SELECTED PLACES", nothingSelected: "Nothing selected yet. Step 03 is where the trip gets specific.", removePlace: "Remove place", placesSelected: "places selected", daysTotal: "days total"
  };
  const [tripId, setTripId] = useState(() => `trip-${crypto.randomUUID()}`);
  const [createdAt, setCreatedAt] = useState(() => new Date().toISOString());
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<"saving" | "local">("saving");
  const [step, setStep] = useState(0);
  const [generated, setGenerated] = useState(false);
  const [activeDay, setActiveDay] = useState(0);
  const [draftImages, setDraftImages] = useState<Record<string, JourneyImage>>({});

  const today = useMemo(() => iso(new Date()), []);
  const oneWeekLater = useMemo(() => { const date = new Date(); date.setDate(date.getDate() + 6); return iso(date); }, []);
  const [origin, setOrigin] = useState("");
  const [tripBrief, setTripBrief] = useState("");
  const [originCoordinates, setOriginCoordinates] = useState<[number, number] | undefined>();
  const [originTouched, setOriginTouched] = useState(false);
  const [originError, setOriginError] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);
  const [routeHints, setRouteHints] = useState<string[]>([]);
  const [stopInput, setStopInput] = useState("");
  const [stopError, setStopError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(oneWeekLater);
  const [datesConfirmed, setDatesConfirmed] = useState(false);
  const [picker, setPicker] = useState<"start" | "end" | null>(null);

  const [filter, setFilter] = useState("All");
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [dayAllocations, setDayAllocations] = useState<Record<string, number>>({});
  const [discoveredPlaces, setDiscoveredPlaces] = useState<Record<string, Place[]>>({});
  const [discovering, setDiscovering] = useState<Record<string, boolean>>({});

  const [budget, setBudget] = useState<"value" | "mid" | "high">("value");
  const [travelProfile, setTravelProfile] = useState<TravelProfile>(defaultTravelProfile);

  const pickerRef = useDismiss(Boolean(picker), () => setPicker(null));

  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    let active = true;
    const applySaved = (saved: ReturnType<typeof loadActiveTrip>) => {
      if (!saved || !active) return;
      setTripId(saved.id);
      setCreatedAt(saved.createdAt);
      setOrigin(saved.brief.origin);
      setTripBrief(saved.brief.mustDo);
      setOriginCoordinates(saved.brief.originCoordinates);
      setStops(saved.stops.map(({ id, name, country, longitude, latitude }) => ({ id, name, country, coordinates: longitude !== null && latitude !== null ? [longitude, latitude] : undefined })));
      setStartDate(saved.startDate);
      setEndDate(saved.endDate);
      setPicks(saved.brief.selectedPlaces);
      setDayAllocations(saved.brief.dayAllocations ?? {});
      setBudget(saved.brief.budgetBand);
    };
    const hydrate = async () => {
      const params = new URLSearchParams(window.location.search);
      const tripIdFromUrl = params.get("trip");
      const showItinerary = params.get("view") === "itinerary";
      if (tripIdFromUrl) {
        try {
          const cloudTrip = await loadTripFromEasyT(tripIdFromUrl);
          if (cloudTrip) {
            applySaved(cloudTrip);
            saveActiveTrip(cloudTrip);
            if (showItinerary) setGenerated(true);
          } else {
            const localTrip = loadActiveTrip();
            if (localTrip?.id === tripIdFromUrl) { applySaved(localTrip); if (showItinerary) setGenerated(true); }
          }
        } catch {
          const localTrip = loadActiveTrip();
          if (localTrip?.id === tripIdFromUrl) { applySaved(localTrip); if (showItinerary) setGenerated(true); }
        }
      } else {
        try {
          const savedProfile = JSON.parse(window.localStorage.getItem("easyt-travel-profile") ?? "null");
          if (isTravelProfile(savedProfile)) { setBudget(savedProfile.budget); setTravelProfile(savedProfile); }
        } catch { setBudget(defaultTravelProfile.budget); }
        let homeDraft: { origin?: string; originCoordinates?: [number, number]; destination?: Stop; destinations?: Stop[]; routeHints?: string[]; regions?: string[]; startDate?: string; endDate?: string; brief?: string } | null = null;
        if (params.get("homeDraft") === "1") {
          try { homeDraft = JSON.parse(window.localStorage.getItem("easyt-home-trip-draft") ?? "null"); } catch { homeDraft = null; }
        }
        if (homeDraft?.brief || homeDraft?.origin || homeDraft?.destination || homeDraft?.destinations?.length) {
          if (homeDraft.origin) setOrigin(homeDraft.origin);
          if (homeDraft.originCoordinates) setOriginCoordinates(homeDraft.originCoordinates);
          // `destination` is retained for drafts created before prompt-first
          // routing. New homepage drafts carry the complete verified route.
          const draftStops = homeDraft.destinations?.length ? homeDraft.destinations : homeDraft.destination ? [homeDraft.destination] : [];
          if (draftStops.length) setStops(draftStops);
          if (homeDraft.routeHints) setRouteHints(homeDraft.routeHints);
          if (homeDraft.startDate) setStartDate(homeDraft.startDate);
          if (homeDraft.endDate) setEndDate(homeDraft.endDate);
          const regions = homeDraft.regions?.filter(Boolean) ?? [];
          setTripBrief(homeDraft.brief ?? (regions.length ? regions.join(", ") : ""));
          window.localStorage.removeItem("easyt-home-trip-draft");
        } else {
          const seed = inspirationByKey[params.get("inspire") ?? ""];
          if (seed) {
          setOrigin(seed.origin);
          setOriginCoordinates(seed.originCoordinates);
          setStops(seed.stops);
          // A route has its own starting level, but an account preference still
          // wins when present so the plan reflects the traveller, not the card.
          try {
            const savedProfile = JSON.parse(window.localStorage.getItem("easyt-travel-profile") ?? "null");
            if (isTravelProfile(savedProfile)) { setBudget(savedProfile.budget); setTravelProfile(savedProfile); } else setBudget(seed.budget);
            } catch { setBudget(seed.budget); }
          }
        }
      }
      if (active) setHydrated(true);
    };
    void hydrate();
    return () => { active = false; window.removeEventListener("easyt-language-change", updateLanguage); };
  }, []);

  useEffect(() => {
    stops.forEach((stop) => {
      if (!stop.coordinates || discoveredPlaces[stop.id] || discovering[stop.id]) return;
      setDiscovering((current) => ({ ...current, [stop.id]: true }));
      const [lon, lat] = stop.coordinates;
      fetch(`/api/journey-discover?destination=${encodeURIComponent(stop.name)}&country=${encodeURIComponent(stop.country)}&lat=${lat}&lon=${lon}`)
        .then((response) => response.json())
        .then((payload: { places?: Place[] }) => setDiscoveredPlaces((current) => ({ ...current, [stop.id]: payload.places ?? [] })))
        .catch(() => setDiscoveredPlaces((current) => ({ ...current, [stop.id]: [] })))
        .finally(() => setDiscovering((current) => ({ ...current, [stop.id]: false })));
    });
  }, [stops, discoveredPlaces, discovering]);

  const totalDays = useMemo(() => {
    const d = Math.round((+new Date(`${endDate}T00:00:00`) - +new Date(`${startDate}T00:00:00`)) / 86400000) + 1;
    return Number.isFinite(d) && d > 0 ? d : 1;
  }, [startDate, endDate]);

  const committed = useMemo(() => stops.length + stops.reduce((sum, stop) => {
    const titles = picks[stop.id] ?? [];
    return sum + placesFor(stop, discoveredPlaces).filter((p) => titles.includes(p.title)).reduce((a, p) => a + p.cost, 0);
  }, 0), [stops, picks, discoveredPlaces]);

  const openDays = Math.max(0, totalDays - committed);
  const over = committed > totalDays;
  const selected = stops.flatMap((stop) => (picks[stop.id] ?? []).map((title) => ({ stopId: stop.id, title })));
  const contextualSuggestions = useMemo(
    () => [...(ROUTE_HINT_SUGGESTIONS[routeHints[0]] ?? []), ...(ROUTE_HINT_SUGGESTIONS[routeHints[1]] ?? []), ...suggestionsFor(stops.at(-1))]
      .filter((name, index, all) => all.indexOf(name) === index && !stops.some((stop) => stop.name.toLowerCase() === name.toLowerCase()))
      .slice(0, 4),
    [routeHints, stops],
  );
  const originMissing = originTouched && (!origin.trim() || Boolean(originError));
  const stepLabels = language === "es"
    ? ["Confirmar", "Fechas", "Lugares", "Tiempo"]
    : ["Confirm", "Dates", "Places", "Time"];
  const stepNotes = language === "es"
    ? ["Ruta y fechas", "Define el ritmo", "Elige lo importante", "Haz sitio para todo"]
    : ["Route & dates", "Set the rhythm", "Choose what matters", "Make room for it all"];
  const stepGuidance = language === "es"
    ? [
      ["Comprueba lo esencial.", "Confirma cada lugar y las fechas antes de que Morrovia dé forma al viaje."],
      ["Elige lo que importa.", "Marca los lugares y experiencias para los que quieres dejar tiempo."],
      ["Elige lo que importa.", "EasyT deja espacio para el resto."],
      ["Haz que los días encajen.", "Podrás editar cada detalle más adelante."],
    ]
    : [
      ["Check the essentials.", "Confirm every place and the dates before Morrovia starts shaping the trip."],
      ["Choose what matters.", "Pick the places and experiences worth making room for."],
      ["Choose what matters.", "EasyT leaves room for the rest."],
      ["Make the days fit.", "You can edit every detail later."],
    ];
  const gate = step === 0 ? (!origin.trim() ? ui.addOrigin : !stops.length ? ui.addStop : !datesConfirmed ? (language === "es" ? "Confirma tus fechas para continuar" : "Confirm your dates to continue") : "") : "";

  /** A transparent default: selected activity volume influences the recommended split. */
  const recommendedDays = useMemo(() => {
    if (!stops.length) return {} as Record<string, number>;
    const allocation = Object.fromEntries(stops.map((stop) => [stop.id, 1])) as Record<string, number>;
    let remaining = Math.max(0, totalDays - stops.length);
    const ranked = [...stops].sort((a, b) => {
      const score = (stop: Stop) => (picks[stop.id] ?? []).length + Math.min(2, placesFor(stop, discoveredPlaces).length / 5);
      return score(b) - score(a);
    });
    for (let index = 0; remaining > 0; index += 1, remaining -= 1) allocation[ranked[index % ranked.length].id] += 1;
    return allocation;
  }, [stops, totalDays, picks, discoveredPlaces]);

  const allocation = useMemo(
    () => rebalanceDays(stops, totalDays, dayAllocations, recommendedDays),
    [stops, totalDays, dayAllocations, recommendedDays],
  );

  const updateAllocatedDays = (stopId: string, requested: number) => {
    const current = allocation[stopId] ?? 1;
    const others = stops.filter((stop) => stop.id !== stopId);
    if (!others.length) return;
    const maximum = Math.max(1, totalDays - others.length);
    const next = Math.max(1, Math.min(maximum, requested));
    const difference = next - current;
    if (!difference) return;
    const nextAllocation = { ...allocation, [stopId]: next };
    if (difference > 0) {
      let remaining = difference;
      [...others].sort((a, b) => nextAllocation[b.id] - nextAllocation[a.id]).forEach((stop) => {
        const movable = Math.max(0, nextAllocation[stop.id] - 1);
        const amount = Math.min(movable, remaining);
        nextAllocation[stop.id] -= amount;
        remaining -= amount;
      });
    } else {
      const receiver = [...others].sort((a, b) => (recommendedDays[b.id] ?? 1) - (recommendedDays[a.id] ?? 1))[0];
      nextAllocation[receiver.id] += Math.abs(difference);
    }
    setDayAllocations(nextAllocation);
  };

  const addStop = async (name?: string) => {
    const value = (name ?? stopInput).trim();
    if (!value) return setStopError(ui.typePlace);
    if (stops.some((s) => s.name.toLowerCase() === value.toLowerCase())) return setStopError(`${value} is already in your route.`);
    setStopError(ui.checking);
    try {
      const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(value)}`);
      const payload = await response.json() as { result?: { name?: string; country?: string; coordinates?: [number, number] } | null };
      if (!payload.result?.coordinates || !payload.result.country) return setStopError(language === "es" ? `No pudimos verificar “${value}”. Prueba una ciudad, región o lugar con su país.` : `We couldn't verify “${value}”. Try a city, region or landmark with its country.`);
      const resolvedName = payload.result.name?.split(",")[0]?.trim() || value;
      const id = `${resolvedName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
      setStops((current) => [...current, { id, name: resolvedName, country: payload.result!.country!, coordinates: payload.result!.coordinates }]);
      setStopInput(""); setStopError("");
    } catch {
      setStopError(ui.unavailable);
    }
  };

  const applyTripBrief = async () => {
    const parsed = parseTripBrief(tripBrief);
    if (!tripBrief.trim()) return;

    setRouteHints(parsed.routeHints);

    if (!origin.trim() && parsed.origin) {
      setOrigin(parsed.origin);
      setOriginTouched(true);
      setOriginCoordinates(undefined);
    }

    if (!stops.length) {
      for (const stop of parsed.stops) await addStop(stop);
    }

    // Respect a date range the traveller has already chosen. The default range
    // is the only one the brief is allowed to replace automatically.
    if (parsed.durationDays && endDate === oneWeekLater) {
      const date = new Date(`${startDate}T00:00:00`);
      date.setDate(date.getDate() + Math.max(1, parsed.durationDays - 1));
      setEndDate(iso(date));
    }
  };

  const moveStop = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= stops.length || to >= stops.length) return;
    setStops((current) => {
      const next = [...current];
      const [moving] = next.splice(from, 1);
      next.splice(to, 0, moving);
      return next;
    });
  };

  const validateOrigin = async () => {
    if (!origin.trim()) { setOriginTouched(true); setOriginError(ui.addOrigin); return false; }
    try {
      const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(origin.trim())}`);
      const payload = await response.json() as { result?: { name?: string; coordinates?: [number, number] } | null };
      if (!payload.result?.coordinates) { setOriginTouched(true); setOriginError(ui.verifyOrigin); return false; }
      setOriginCoordinates(payload.result.coordinates);
      setOriginError("");
      return true;
    } catch {
      setOriginError(ui.originUnavailable);
      return false;
    }
  };
  const togglePick = (stopId: string, title: string) => {
    const current = picks[stopId] ?? [];
    setPicks({ ...picks, [stopId]: current.includes(title) ? current.filter((t) => t !== title) : [...current, title] });
  };

  /** Selected real places are grouped into achievable days; each move gets a visible estimate. */
  const draft = useMemo<PlannedDay[]>(() => buildCredibleItinerary({
    origin,
    originCoordinates,
    stops,
    startDate,
    allocations: allocation,
    picks,
    places: Object.fromEntries(stops.map((stop) => [stop.id, placesFor(stop, discoveredPlaces)])),
  }), [origin, originCoordinates, stops, startDate, allocation, picks, discoveredPlaces]);

  const activeTripDocument = useMemo(() => tripFromBuilder({
    id: tripId,
    origin,
    stops,
    startDate,
    endDate,
    picks,
    mustDo: tripBrief,
    pace: "slow",
    hotels: "few",
    budget,
    dayAllocations: allocation,
    draft,
    placeDetails: discoveredPlaces,
    originCoordinates,
    createdAt,
  }), [tripId, origin, stops, startDate, endDate, picks, tripBrief, budget, allocation, draft, discoveredPlaces, originCoordinates, createdAt]);

  useEffect(() => {
    if (!hydrated || !origin.trim() || !stops.length) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      saveActiveTrip(activeTripDocument);
      setSaveState("local");
    }, 450);
    return () => window.clearTimeout(timer);
  }, [hydrated, activeTripDocument]);

  // Generated itineraries are not limited to the small editorial media pack.
  // Resolve a real contextual image for every planned day, then retain the
  // local media pack as a fast first choice when it exists.
  useEffect(() => {
    if (!generated || !draft.length) return;
    let active = true;
    const controller = new AbortController();
    void Promise.all(draft.map(async (day) => {
      if (dayImageFor(day, Number(day.number) - 1)) return null;
      const stop = stops.find((candidate) => candidate.name === day.destination);
      const title = day.placeTitle ?? day.destination;
      const response = await fetch(`/api/journey-place?title=${encodeURIComponent(title)}&area=${encodeURIComponent(day.destination)}&country=${encodeURIComponent(stop?.country ?? "")}`, { signal: controller.signal });
      const payload = await response.json() as { place?: { image?: string; sourceUrl?: string } | null };
      if (!payload.place?.image) return null;
      return [day.number, {
        src: payload.place.image,
        alt: title,
        caption: day.destination,
        sourceUrl: payload.place.sourceUrl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      } satisfies JourneyImage] as const;
    })).then((results) => {
      if (!active) return;
      setDraftImages((current) => ({ ...current, ...Object.fromEntries(results.filter((result): result is readonly [string, JourneyImage] => Boolean(result))) }));
    }).catch(() => undefined);
    return () => { active = false; controller.abort(); };
  }, [draft, generated, stops]);

  const index = Math.min(activeDay, Math.max(0, draft.length - 1));
  const active = draft[index];
  const activeImage = active ? dayImageFor(active, index) ?? draftImages[active.number] ?? null : null;

  /* ------------------------------------------------------------ draft view */

  if (generated && active) {
    return (
      <div className={`${styles.shellWide} ${mobilePolish.builder}`}>
        <div className={styles.draftHead}>
          <div>
            <p className={styles.eyebrow}>{ui.draft}</p>
            <h2>{origin} to {stops.map((s) => s.name).join(" & ")}</h2>
          </div>
          <button type="button" className={styles.primary} onClick={() => { setGenerated(false); setStep(3); }}>{ui.editBrief}</button>
        </div>

        <div className={styles.draftSummary}>
          <span><CalendarDays /> {totalDays} days</span>
          <span><Clock /> {stops.length} destinations · custom split</span>
          <span><MapPin /> {selected.length} {ui.placesSelected}</span>
        </div>

        <div className={styles.draftBody}>
          <div className={styles.timeline}>
            <div className={styles.timelineHead}>
              <strong>{ui.dayByDay}</strong>
              <small>{draft.length} DAYS</small>
            </div>
            {draft.map((day, i) => (
              <button type="button" key={day.number}
                className={`${styles.timelineRow} ${i === index ? styles.timelineRowOn : ""}`}
                onClick={() => setActiveDay(i)}>
                <b>{day.number}</b>
                <span>
                  <em>{day.destination}</em>
                  <strong>{day.title}</strong>
                </span>
                <small>{day.date}</small>
              </button>
            ))}
          </div>

          <section className={styles.dayDetail}>
            <div className={styles.dayMeta}>
              <p><span>{active.date}</span> · DAY {active.number}</p>
              <span><MapPin /> {active.destination}</span>
            </div>
            <h3>{active.title}</h3>
            <p className={styles.dayReason}>{active.reason}</p>

            {activeImage ? (
              <figure className={styles.dayImage}>
                <img src={activeImage.src} alt={activeImage.alt} />
                <figcaption><span>{activeImage.caption}</span><a href={activeImage.sourceUrl} target="_blank" rel="noreferrer">{ui.source}</a></figcaption>
              </figure>
            ) : (
              <div className={`${styles.dayImage} ${styles.dayImageFallback}`} role="img" aria-label={`Image for ${active.title}`}>
                <span>{active.destination}</span>
              </div>
            )}

            <ol className={styles.dayItems}>
              {active.items.map((text, i) => (
                <li key={i}><b>{pad(i + 1)}</b>{text}</li>
              ))}
            </ol>
            <div className={styles.dayNav}>
              <button type="button" disabled={index === 0} onClick={() => setActiveDay(index - 1)}>{ui.previousDay}</button>
              <button type="button" disabled={index >= draft.length - 1} onClick={() => setActiveDay(index + 1)}>{ui.nextDay}</button>
            </div>
          </section>
        </div>

        <div className={styles.draftFoot}>
          <button type="button" className={styles.primary} onClick={() => {
            saveActiveTrip(activeTripDocument);
            window.location.assign(`/journey/plan?trip=${encodeURIComponent(activeTripDocument.id)}`);
          }}>{ui.openMap}</button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------- brief wizard */

  return (
    <div className={`${styles.shellWide} ${mobilePolish.builder}`}>
      <nav className={styles.steps} aria-label="Trip brief progress">
        {stepLabels.map((label, i) => {
          return (
          <button type="button" key={label} onClick={() => setStep(i)}
            className={`${styles.stepTab} ${i === step ? styles.stepTabOn : ""} ${i < step ? styles.stepTabDone : ""}`}>
            <b>{i < step ? "✓" : pad(i + 1)}</b>
            <span><span>{label}</span><small>{stepNotes[i]}</small></span>
          </button>
          );
        })}
      </nav>

      <p className={styles.builderReassurance}>
        <strong>{stepGuidance[step][0]}</strong>
        <span>{stepGuidance[step][1]}</span>
      </p>
      <div className={styles.wizardBody}>
        <div className={styles.pane}>
          {step === 0 && (
            <div className={styles.stack}>
              <div className={`${styles.card} ${styles.tripBriefCard}`}>
                <span className={styles.cardLabel}><MapPin /> {ui.tripBriefLabel}</span>
                <h2>{ui.tripBriefTitle}</h2>
                <p>{ui.tripBriefHelp}</p>
                <textarea className={styles.tripBriefTextarea} aria-label={ui.tripBriefLabel} value={tripBrief} maxLength={600} onChange={(event) => setTripBrief(event.target.value)} placeholder={ui.tripBriefPlaceholder} />
                <button type="button" className={styles.ghost} onClick={() => void applyTripBrief()} disabled={!tripBrief.trim()}>{ui.tripBriefApply}</button>
                <small className={styles.hint}>{ui.tripBriefHint}</small>
              </div>
              <div className={`${styles.card} ${originMissing ? styles.cardError : ""}`}>
                <span className={styles.cardLabel}><Plane /> {copy.startFrom}</span>
                <input value={origin} placeholder={copy.cityAirport} aria-label={copy.startFrom}
                  onChange={(e) => { setOrigin(e.target.value); setOriginTouched(true); setOriginCoordinates(undefined); setOriginError(""); }}
                  onBlur={() => { if (origin.trim() && !originCoordinates) void validateOrigin(); }} />
                <small className={originMissing ? styles.hintError : styles.hint}>
                  {originError || (originMissing ? ui.addOrigin : "")}
                </small>
              </div>

              <div className={`${styles.card} ${stopError ? styles.cardError : ""}`}>
                <span className={styles.cardLabel}><MapPin /> {copy.addDestination}</span>
                <input value={stopInput} placeholder={copy.destinationPlaceholder} aria-label={copy.addDestination}
                  onChange={(e) => { setStopInput(e.target.value); setStopError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStop(); } }} />
                <small className={stopError ? styles.hintError : styles.hint}>
                  {stopError}
                </small>
                {!stopInput.trim() && contextualSuggestions.length > 0 && (
                  <div className={styles.suggestions}>
                    {contextualSuggestions.map((name) => (
                      <button type="button" key={name} onClick={() => addStop(name)}><Plus /> {name}</button>
                    ))}
                  </div>
                )}
              </div>

              <div className={`${styles.card} ${styles.confirmDatesCard} ${!datesConfirmed ? styles.cardAttention : ""}`}>
                <span className={styles.cardLabel}><CalendarDays /> {language === "es" ? "CUÁNDO VIAJAS" : "WHEN YOU’RE TRAVELLING"}</span>
                <div className={styles.confirmDatesGrid}>
                  {([
                    { key: "start" as const, label: ui.startDate, value: startDate, set: (value: string) => { setStartDate(value); if (value > endDate) setEndDate(value); setDatesConfirmed(true); } },
                    { key: "end" as const, label: ui.endDate, value: endDate, set: (value: string) => { setEndDate(value < startDate ? startDate : value); setDatesConfirmed(true); } },
                  ]).map((field) => <label key={field.key}><span>{field.label}</span><input type="date" value={field.value} min={field.key === "end" ? startDate : today} onChange={(event) => field.set(event.target.value)} /></label>)}
                </div>
                <div className={styles.confirmDatesFoot}><p className={styles.confirmDatesNote}>{datesConfirmed ? <><strong>{totalDays} {totalDays === 1 ? ui.day : ui.days}</strong> · {language === "es" ? "listo para planificar" : "ready to plan"}</> : (language === "es" ? "Revisa o cambia estas fechas para confirmarlas." : "Review or change these dates to confirm them.")}</p>{!datesConfirmed && <button type="button" className={styles.confirmDatesButton} onClick={() => setDatesConfirmed(true)}>{language === "es" ? "Confirmar fechas" : "Confirm dates"}</button>}</div>
              </div>

              {stops.length > 0 && <div className={styles.confirmedStops} aria-label={language === "es" ? "Paradas confirmadas" : "Confirmed stops"}>
                <span>{language === "es" ? "PARADAS CONFIRMADAS" : "CONFIRMED STOPS"}</span>
                <div>{stops.map((stop, index) => <button type="button" key={stop.id} onClick={() => setStops((current) => current.filter((item) => item.id !== stop.id))}>{index + 1}. {stop.name} <X aria-hidden="true" /></button>)}</div>
              </div>}

            </div>
          )}

          {step === 1 && (
            <div className={styles.stack} ref={pickerRef}>
              <div className={styles.dateRow}>
                {([
                  { key: "start" as const, label: ui.startDate, value: startDate, set: (v: string) => { setStartDate(v); if (v > endDate) setEndDate(v); } },
                  { key: "end" as const, label: ui.endDate, value: endDate, set: (v: string) => setEndDate(v < startDate ? startDate : v) },
                ]).map((field) => (
                  <div key={field.key} className={`${styles.card} ${picker === field.key ? styles.cardOpen : ""}`}>
                    <button type="button" className={styles.cardTrigger} aria-expanded={picker === field.key}
                      onClick={() => setPicker(picker === field.key ? null : field.key)}>
                      <span className={styles.cardLabel}><CalendarDays /> {field.label}</span>
                      <span className={styles.cardValue}>
                        <strong>{fmtLong(field.value) || ui.pickDate}</strong>
                        <ChevronDown />
                      </span>
                    </button>
                    {picker === field.key && (
                      <div className={styles.popover}>
                        <Calendar language={language} value={field.value} onPick={(v) => { field.set(v); setPicker(null); }} />
                        <label className={styles.typeIt}>{ui.typeIt}
                          <input defaultValue={fmtLong(field.value)}
                            onChange={(e) => { const v = parseTyped(e.target.value); if (v) field.set(v); }} />
                        </label>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className={styles.lengthNote}>
                <strong>{totalDays} {totalDays === 1 ? ui.day : ui.days}</strong>
                <span>{stops.length ? ui.split : ui.addStops}</span>
              </p>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className={styles.filters}>
                {FILTERS.map((label) => (
                  <button type="button" key={label} onClick={() => setFilter(label)}
                    className={`${styles.filter} ${filter === label ? styles.filterOn : ""}`}>{label}</button>
                ))}
              </div>
              <div className={styles.panels}>
                {stops.map((stop, si) => {
                  const titles = picks[stop.id] ?? [];
                  const list = placesFor(stop, discoveredPlaces).filter((p) => filter === "All" || p.tags.includes(filter));
                  return (
                    <section key={stop.id}>
                      <div className={styles.panelHead}>
                        <div>
                          <small>{pad(si + 1)} · {(stop.country || "verified stop").toUpperCase()}</small>
                          <h3>{stop.name}</h3>
                        </div>
                        <small className={titles.length ? styles.countOn : ""}>{titles.length} selected</small>
                      </div>
                      <div className={styles.placeList}>
                        {discovering[stop.id] && <p className={styles.railEmptyText}>{ui.finding} {stop.name}…</p>}
                        {!discovering[stop.id] && !list.length && <p className={styles.railEmptyText}>{ui.noSuggestions}</p>}
                        {list.map((place) => {
                          const on = titles.includes(place.title);
                          const image = placeImageFor(place, stop);
                          return (
                            <button type="button" key={place.title} aria-pressed={on}
                              className={`${styles.placeCard} ${on ? styles.placeCardOn : ""}`}
                              onClick={() => togglePick(stop.id, place.title)}>
                              {image ? <span className={styles.placeThumb}><img src={image.src} alt="" /></span> : <span className={styles.placeThumbFallback}>{place.title.slice(0, 1)}</span>}
                              <span className={styles.placeBox}>{on ? "✓" : "+"}</span>
                              <span className={styles.placeText}>
                                <small>{place.area} · {place.type}</small>
                                <strong>{place.title}</strong>
                                <span>{place.description}</span>
                              </span>
                              <span className={styles.placeCost}>{on ? "−" : "+"}{half(place.cost)} {ui.day}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className={styles.stack}>
              <section className={styles.allocationPanel} aria-labelledby="day-allocation-title">
                <div className={styles.allocationHead}>
                  <div>
                    <p>{ui.yourTime}</p>
                    <h3 id="day-allocation-title">{ui.shapeDays}</h3>
                    <span>{ui.allocation}</span>
                  </div>
                  <strong>{totalDays} {ui.daysTotal}</strong>
                </div>
                <div className={styles.allocationList}>
                  {stops.map((stop) => {
                    const days = allocation[stop.id] ?? 1;
                    const suggestion = recommendedDays[stop.id] ?? 1;
                    return (
                      <label className={styles.allocationRow} key={stop.id}>
                        <span><strong>{stop.name}</strong><small>{(picks[stop.id] ?? []).length} {ui.placesSelected} · {ui.suggested} {suggestion} {suggestion === 1 ? ui.day : ui.days}</small></span>
                        <input type="range" min="1" max={Math.max(1, totalDays - Math.max(0, stops.length - 1))} value={days}
                          onChange={(event) => updateAllocatedDays(stop.id, Number(event.target.value))}
                          aria-label={`${stop.name}: ${days} days`} />
                        <b>{days}<small>{days === 1 ? ui.day : ui.days}</small></b>
                      </label>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </div>

        <aside className={styles.rail} aria-label={ui.route}>
          <div className={styles.railBlock}>
            <small className={styles.railLabel}>{ui.route}</small>
            <div className={styles.railRoute}>
              {[{ name: origin.trim() || (language === "es" ? "Añade tu origen" : "Add your origin"), note: ui.departure, origin: true }].map((node, i) => (
                <div key={`${node.name}-${i}`} className={styles.railNode}>
                  <span className={styles.railMarker}>
                    <span className={node.origin ? styles.railDotOrigin : styles.railDot} />
                    {stops.length > 0 && <span className={styles.railLine} />}
                  </span>
                  <span>
                    <strong className={node.origin ? styles.railNameMuted : ""}>{node.name}</strong>
                    <small>{node.note}</small>
                  </span>
                </div>
              ))}
              {stops.map((stop, i) => (
                <div key={stop.id} draggable
                  className={`${styles.railNode} ${styles.railNodeEditable} ${dragId === stop.id ? styles.railNodeDragging : ""}`}
                  onDragStart={(event) => { setDragId(stop.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", stop.id); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); const from = stops.findIndex((item) => item.id === (dragId ?? event.dataTransfer.getData("text/plain"))); moveStop(from, i); setDragId(null); }}
                  onDragEnd={() => setDragId(null)}>
                  <span className={styles.railMarker}>
                    <span className={styles.railDot} />
                    {i < stops.length - 1 && <span className={styles.railLine} />}
                  </span>
                    <span>
                      <span className={styles.railNodeHead}><GripVertical className={styles.railGrip} aria-hidden /><strong>{stop.name}</strong></span>
                      <small>{(picks[stop.id] ?? []).length} {ui.selected} · {allocation[stop.id] ?? 1} {(allocation[stop.id] ?? 1) === 1 ? ui.day : ui.days}</small>
                      <span className={styles.railNodeActions}>
                        <button type="button" onClick={() => setStops(stops.filter((item) => item.id !== stop.id))} aria-label={`${language === "es" ? "Quitar" : "Remove"} ${stop.name}`}><X /></button>
                      </span>
                    </span>
                </div>
              ))}
              {!stops.length && <p className={styles.railEmpty}>{ui.routeEmpty}</p>}
            </div>
          </div>

          <div className={styles.railBlock}>
            <div className={styles.railBudgetHead}>
              <small className={styles.railLabel}>{ui.daysBudget}</small>
              <small className={over ? styles.railOver : ""}>
                {over ? `${ui.overBy} ${half(committed - totalDays)}` : openDays === 0 ? ui.full : ui.room}
              </small>
            </div>
            <div className={styles.budgetTrack}>
              <span className={over ? styles.budgetFillOver : styles.budgetFill}
                style={{ width: `${Math.min(100, (committed / Math.max(1, totalDays)) * 100)}%` }} />
            </div>
            <p className={styles.budgetLine}>{totalDays} {ui.available} · {half(committed)} {ui.committed} · {half(openDays)} {ui.open}</p>
            {over && <p className={styles.railOver}>{ui.overHint}</p>}
          </div>

          <div className={styles.railBlock}>
            <small className={styles.railLabel}>{ui.selectedPlaces}</small>
            {selected.length ? (
              <div className={styles.chips}>
                {selected.map((entry) => (
                  <span key={`${entry.stopId}-${entry.title}`} className={styles.chip}>
                    {entry.title}
                    <button type="button" onClick={() => togglePick(entry.stopId, entry.title)} aria-label={ui.removePlace}><X /></button>
                  </span>
                ))}
              </div>
            ) : <p className={styles.railEmptyText}>{ui.nothingSelected}</p>}
          </div>
        </aside>
      </div>

      <div className={styles.wizardFoot}>
        <button type="button" className={styles.ghost} disabled={step === 0} onClick={() => setStep(Math.max(0, step - 1))}>{copy.back}</button>
        <div className={styles.footRight}>
          <small className={styles.saveState}>{saveState === "saving" ? ui.savingChanges : ui.savedDevice}</small>
          {gate && <small className={styles.gate}>{gate}</small>}
          <button type="button" className={styles.primary} disabled={Boolean(gate)}
            onClick={async () => {
              if (gate) return;
              if (step === 0 && !(await validateOrigin())) return;
              if (step === 3) { setGenerated(true); setActiveDay(0); } else setStep(step + 1);
            }}>
            {step === 3 ? copy.buildDraft : copy.continue} →
          </button>
        </div>
      </div>
    </div>
  );
}
