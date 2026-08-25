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
  ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronLeft, ChevronRight,
  Check, Clock, GripVertical, Lock, MapPin, Pencil, Plane, Plus, Sparkles, Train, Trash2, Users, X, CarFront, Ship, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cacheCanonicalTrip, canUseHydratedTripScope, claimGuestTripRecoveryForOwner, EASYT_BEFORE_NEW_TRIP_EVENT, EASYT_LAST_OWNER_CHANGE_EVENT, EASYT_LAST_OWNER_KEY, EasyTTripAuthError, EasyTTripPromotionConflictError, EasyTTripSaveConflictError, forgetRememberedOwner, loadActiveTrip, loadRememberedOwner, loadRequestedTrip, loadTripRecovery, markTripRecoveryState, ownerIdForBrowserRecovery, rememberLastOwner, saveTripRecovery, saveTripRecoveryToEasyT, shouldAllowNewTripNavigation, type TripRecoveryCloudTrace, type TripRecoveryHandle } from "@/lib/easyt/storage";
import { tripEditorSyncAction, tripSyncRecoveryPath, tripSyncSignInPath } from "@/lib/easyt/trip-continuity";
import { defaultTripIntent, tripFromBuilder, tripIntentForTrip, type EasyTTrip, type FixedTripCommitment, type TripDecisionSelections, type TripIntent, type TripIntentPace, type TripScheduleLocks, type TripStatus, type TripTransportMode } from "@/lib/easyt/trip";
import { assessRouteIntelligence, buildCredibleItinerary, estimateLegForConstraints, routeIntelligenceForPersistence, usableStopDays, type PlannedDay, type PlannerPlace } from "@/lib/easyt/planner";
import { cascadeTripSchedule } from "@/lib/easyt/cascade";
import { allocateTripNights, calendarDayAllocationsFromNights, tripNightsBetween, type NightAllocationStopInput } from "@/lib/easyt/night-allocation";
import { classifyAnalyticsSaveError, hasAnalyticsConsent, trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import type { JourneyImage } from "@/lib/journey";
import { mediaImagesFor, PLACE_IMAGE_HINTS } from "@/lib/easyt/itinerary-media";
import styles from "./trip-builder.module.css";
import mobilePolish from "./trip-builder-mobile.module.css";
import { easytCopy, languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { inspirationByKey } from "@/lib/easyt/inspiration";
import { publicRouteDetailFor } from "@/lib/easyt/public-route";
import { routePlannerPayload } from "@/lib/easyt/public-route-handoff";
import { defaultTravelProfile, isTravelProfile, type TravelProfile } from "@/lib/easyt/travel-profile";
import { firstTripWorkspaceHref, tripWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { captureJourneyBrief } from "@/lib/easyt/journey-capture";
import { HOME_TRIP_DRAFT_KEY, homeTripDraftTimingFlexibility, removeHomeTripDraftIfDurable, resolveHandoffBatch, routableHandoffMentions, type HomeTripDraft } from "@/lib/easyt/home-trip-handoff";
import { canBuildTrip } from "@/lib/easyt/can-build-trip";
import { createDestinationKnowledgeStore } from "@/lib/easyt/destination-knowledge";
import { extractStructuredTripBrief, mergeStructuredTripBrief, routeConstraintsFromStructuredTripBrief, routeScoringPreferencesFromStructuredBrief, structuredTripBriefFromSavedSelections, type StructuredTripBrief } from "@/lib/easyt/structured-trip-brief";
import { PLACE_INTELLIGENCE_PARSER_VERSION, PLACE_INTELLIGENCE_VERSION, selectPlaceCandidate, type PlaceIntelligenceResult, type PlaceIssue, type PlaceIssueOption, type PlaceSelection, type ResolvedPlaceMention } from "@/lib/easyt/place-intelligence";
import { appendVoiceTranscript, VoiceTripBrief } from "@/components/easyt/voice-trip-brief";
import TripItineraryWorkspace from "@/components/easyt/trip-itinerary-workspace";
import { travelProfileStorageKey } from "@/lib/easyt/private-browser-context";
import { curatedStopFor, reconcileCuratedRouteKnowledge, type CuratedRouteKnowledge } from "@/lib/easyt/curated-route-knowledge";

/* ---------------------------------------------------------------- data */

export type Place = PlannerPlace;
export type Stop = { id: string; name: string; country: string; countryCode?: string; region?: string; providerId?: string; coordinates?: [number, number]; intent?: "place" | "landmark"; locality?: string };
type StructuralSnapshot = { stops: Stop[]; allocations: Record<string, number>; startDate: string; endDate: string; locks: TripScheduleLocks; placeSelections: PlaceSelection[]; removedPlaceMentionIds: string[]; summary: string };
type CapturedLocation = ResolvedPlaceMention;
type LocationChoice = { name: string; country: string; countryCode?: string; region?: string; providerId?: string; coordinates: [number, number]; kind?: string; locality?: string };
type PlaceSelectionDraft = Omit<PlaceSelection, "mentionId" | "routeStopId">;
const routeHandoffNightKnowledge = createDestinationKnowledgeStore({ destinations: [], transfers: [] });

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
function travelStyleLabels(profile: TravelProfile, language: EasyTLanguage) {
  const labels = language === "es"
    ? {
        pace: { slow: "Ritmo tranquilo", balanced: "Ritmo equilibrado", full: "Días completos" },
        priority: { food: "Gastronomía", nature: "Naturaleza", culture: "Cultura", mix: "Un poco de todo" },
        hotelMoves: { few: "Pocas mudanzas de hotel", some: "Algunos cambios de base", open: "Abierto a moverse" },
        budget: { value: "Buena relación calidad-precio", mid: "Gama media", high: "Lo mejor disponible" },
      }
    : {
        pace: { slow: "Slow pace", balanced: "Balanced pace", full: "Full days" },
        priority: { food: "Food", nature: "Nature", culture: "Culture", mix: "A mix" },
        hotelMoves: { few: "Fewer hotel moves", some: "A few hotel moves", open: "Open to moving" },
        budget: { value: "Good value", mid: "Mid-range", high: "Best available" },
      };
  return [labels.pace[profile.pace], labels.priority[profile.priority], labels.hotelMoves[profile.hotelMoves], labels.budget[profile.budget]];
}
const half = (n: number) => String(n).replace(".5", "½");
const durationLabel = (minutes: number | null) => minutes === null ? "Transfer to confirm" : `~${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h ` : ""}${minutes % 60 ? `${minutes % 60}m` : ""}`.trim();
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

type StagingTripSyncTraceDetails = Record<string, boolean | number | string | null>;

function traceStagingTripSync(event: string, details: StagingTripSyncTraceDetails) {
  if (typeof window === "undefined" || window.location.hostname !== "staging.morrovia.com") return;
  // Staging-only diagnostics deliberately exclude trip, account and request
  // data. Write IDs and revisions are opaque coordination tokens.
  console.info(`[Morrovia staging trip sync] ${event} ${JSON.stringify(details)}`);
}

const suggestionsFor = (stop?: Stop) => {
  if (!stop) return [];
  const nearby = NEARBY_SUGGESTIONS[stop.name.trim().toLowerCase()]
    ?? NEARBY_SUGGESTIONS[stop.country.trim().toLowerCase()]
    ?? [];
  return nearby.filter((name) => name.toLowerCase() !== stop.name.toLowerCase());
};

const isOriginMention = (mention: CapturedLocation) => mention.role === "origin" || mention.role === "fixed_start";
const placeTypeLabel = (type: CapturedLocation["placeType"]) => ({
  country: "Country", "macro_region": "Macro-region", region: "Region", "sub_region": "Sub-region", island: "Island",
  archipelago: "Archipelago", city: "City", town: "Town", "natural_area": "Natural area", coast: "Coast",
  "mountain_range": "Mountain range", valley: "Valley", "travel_corridor": "Travel corridor", landmark: "Landmark",
  "transport_gateway": "Transport gateway", unknown: "Place to confirm",
}[type]);
const placeStateLabel = (mention: CapturedLocation, hasSelection: boolean) => {
  if (mention.role === "excluded") return "Excluded";
  if (hasSelection) return "Base selected";
  if (mention.status === "ambiguous") return "Needs confirmation";
  if (mention.status === "unresolved") return "Unresolved";
  if (mention.routability === "needs_base_selection" || mention.routability === "planning_area") return "Needs a base";
  if (mention.routability === "anchor_or_poi") return "Kept as an anchor";
  return "Route destination";
};

const placeImageFor = (place: Place, stop: Stop): JourneyImage | null => {
  if (place.image) return { src: place.image, alt: place.title, caption: place.title, sourceUrl: place.sourceUrl ?? place.image };
  const images = mediaImagesFor(stop.name);
  const filename = PLACE_IMAGE_HINTS[place.title.toLowerCase()];
  if (filename) return images.find((image) => image.src.endsWith(`/${filename}`)) ?? null;
  const words = place.title.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  return images.find((image) => words.some((word) => `${image.alt} ${image.caption}`.toLowerCase().includes(word))) ?? images[0] ?? null;
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
  const searchParams = useSearchParams();
  return <TripBuilderDocument key={searchParams.toString()} />;
}

function TripBuilderDocument() {
  const { data: session, isPending: sessionPending, error: sessionError } = authClient.useSession();
  const authenticatedOwnerId = session?.user?.id ?? null;
  const lastAuthenticatedOwnerIdRef = useRef<string | null>(authenticatedOwnerId);
  if (authenticatedOwnerId) lastAuthenticatedOwnerIdRef.current = authenticatedOwnerId;
  const [rememberedOwnerId, setRememberedOwnerId] = useState<string | null>(null);
  const [browserOffline, setBrowserOffline] = useState(false);
  const [browserContextReady, setBrowserContextReady] = useState(false);
  const sessionUnavailable = Boolean(sessionError
    && (typeof (sessionError as { status?: unknown }).status !== "number"
      || (sessionError as { status?: number }).status !== 401));
  const expiredSessionOwnerId = !sessionPending && !authenticatedOwnerId && !browserOffline
    ? lastAuthenticatedOwnerIdRef.current
    : null;
  const activeBrowserOwnerId = ownerIdForBrowserRecovery({
    authenticatedOwnerId: authenticatedOwnerId ?? expiredSessionOwnerId,
    sessionPending,
    browserOffline: browserOffline || sessionUnavailable,
    rememberedOwnerId,
  });
  const generationStartedRef = useRef(false);
  const generationCompletedRef = useRef(false);
  const localSaveTrackedRef = useRef(false);
  const recoveryHandleRef = useRef<TripRecoveryHandle | null>(null);
  const homeDraftRef = useRef<HomeTripDraft | null>(null);
  const hydratedOwnerScopeRef = useRef<string | null | undefined>(undefined);
  const activeBrowserOwnerIdRef = useRef(activeBrowserOwnerId);
  activeBrowserOwnerIdRef.current = activeBrowserOwnerId;
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const copy = easytCopy[language].builder;
  const ui = language === "es" ? {
    previousMonth: "Mes anterior", nextMonth: "Mes siguiente", draft: "Borrador · editable", editBrief: "Editar resumen",
    dayByDay: "Día a día", source: "Fuente ↗", previousDay: "← Día anterior", nextDay: "Siguiente día →",
    savingChanges: "Guardando cambios…", savedDevice: "Guardado en este dispositivo", exploreMap: "Explora el mapa primero y guárdalo en una cuenta cuando estés listo.", openMap: "Abrir mapa →",
    addOrigin: "Añade tu ciudad o aeropuerto de salida.", addStop: "Añade al menos una parada para continuar", typePlace: "Escribe primero una ciudad, región o lugar.", checking: "Comprobando este lugar…", unavailable: "No pudimos comprobar este lugar ahora. Inténtalo de nuevo.",
    verifyOrigin: "No pudimos verificar ese punto de partida.", originUnavailable: "No pudimos comprobar ese punto de partida ahora.", startDate: "Fecha de inicio", endDate: "Fecha de fin", pickDate: "Elige una fecha", typeIt: "O escríbela",
    day: "día", days: "días", split: "Elige exactamente cómo repartir tu tiempo entre destinos en el siguiente paso.", addStops: "Añade paradas y se repartirán entre ellas.", selected: "seleccionados", finding: "Buscando lugares y actividades reales cerca de", noSuggestions: "Aún no hay sugerencias fiables. Comprueba la ubicación o inténtalo de nuevo.",
    tripBriefLabel: "TU IDEA DE VIAJE", tripBriefTitle: "Cuéntanos sobre tu viaje.", tripBriefHelp: "Escríbelo como se lo contarías a un compañero de viaje. Extraeremos lo que importa.", tripBriefPlaceholder: "Estoy pensando en Japón y Corea del Sur durante unas dos semanas. Tokio y los Alpes japoneses, después Seúl y Busan. Nos gusta comer bien y pasar tiempo al aire libre.", tripBriefHint: "Puedes ajustar todo lo que extraigamos.", tripBriefApply: "Continuar",
    yourTime: "TU TIEMPO", shapeDays: "Organiza tus días", allocation: "Hemos sugerido una distribución inicial según tus lugares. Mueve un control y Morrovia reajustará el resto.", total: "días en total", suggested: "sugeridos", budget: "Presupuesto", budgetHelp: "Se usa para elegir dónde dormir y comer durante la investigación.", value: "Buena relación calidad-precio", valueNote: "Cómodo, sin excesos.", mid: "Gama media", midNote: "Algunos caprichos.", high: "Sin límite", highNote: "Lo mejor disponible.", route: "RUTA HASTA AHORA", departure: "Salida", routeEmpty: "Añade una parada y la ruta aparecerá aquí.", daysBudget: "PRESUPUESTO DE DÍAS", full: "COMPLETO", room: "DÍAS DISPONIBLES", overBy: "EXCESO DE", available: "días disponibles", committed: "comprometidos", open: "libres", overHint: "Hay más lugares seleccionados de los que permiten las fechas. Quita un lugar, elimina una parada o añade días.", selectedPlaces: "LUGARES SELECCIONADOS", nothingSelected: "Aún no hay nada seleccionado. El paso 03 concreta el viaje.", removePlace: "Quitar lugar", placesSelected: "lugares seleccionados", daysTotal: "días en total"
  } : {
    previousMonth: "Previous month", nextMonth: "Next month", draft: "Draft · editable", editBrief: "Edit brief", dayByDay: "Day by day", source: "Source ↗", previousDay: "← Previous day", nextDay: "Next day →", savingChanges: "Saving changes…", savedDevice: "Saved on this device", exploreMap: "Explore the map first, then save it to an account when you are ready.", openMap: "Open map view →", addOrigin: "Add the city or airport you're leaving from.", addStop: "Add at least one stop to continue", typePlace: "Type a city, region or landmark first.", checking: "Checking this place…", unavailable: "We couldn't check that place just now. Please try again.", verifyOrigin: "We couldn't verify that starting point.", originUnavailable: "We couldn't check that starting point just now.", startDate: "Start date", endDate: "End date", pickDate: "Pick a date", typeIt: "Or type it", day: "day", days: "days", split: "Choose exactly how your time is split between destinations in the next step.", addStops: "Add stops and this splits across them.", selected: "selected", finding: "Finding real places, landmarks and activities around", noSuggestions: "No reliable suggestions loaded yet. Check the location or try again shortly.", tripBriefLabel: "YOUR TRIP BRIEF", tripBriefTitle: "What are you trying to make happen?", tripBriefHelp: "Share the occasion, fixed dates, places, budget or any context that helps shape this trip.", tripBriefPlaceholder: "For example: We have three weeks in Japan, a marathon in Tokyo, and want to finish in Hong Kong without rushing.", tripBriefHint: "Optional, but useful when the trip has a lot to hold together.", tripBriefApply: "Use this brief", yourTime: "YOUR TIME", shapeDays: "Shape the days", allocation: "We've suggested a starting split from your selected places. Move a slider and Morrovia rebalances the rest.", total: "days total", suggested: "suggested", budget: "Budget band", budgetHelp: "Used to pick where to sleep and eat during research.", value: "Good value", valueNote: "Comfortable, not precious.", mid: "Mid-range", midNote: "Some splurges.", high: "No ceiling", highNote: "Best available.", route: "ROUTE SO FAR", departure: "Departure", routeEmpty: "Add a stop and the route builds here as you go.", daysBudget: "DAYS BUDGET", full: "FULL", room: "ROOM LEFT", overBy: "OVER BY", available: "days available", committed: "committed", open: "open", overHint: "More is selected than the dates allow. Remove a place, drop a stop, or add days.", selectedPlaces: "SELECTED PLACES", nothingSelected: "Nothing selected yet. Step 03 is where the trip gets specific.", removePlace: "Remove place", placesSelected: "places selected", daysTotal: "days total"
  };
  const [tripId, setTripId] = useState(() => `trip-${crypto.randomUUID()}`);
  const [tripOwnerId, setTripOwnerId] = useState<string | null>(null);
  const [tripStatus, setTripStatus] = useState<TripStatus>("draft");
  const [createdAt, setCreatedAt] = useState(() => new Date().toISOString());
  const [tripUpdatedAt, setTripUpdatedAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [tripUnavailable, setTripUnavailable] = useState(false);
  const [saveState, setSaveState] = useState<"saving" | "local" | "cloud" | "error">("saving");
  const [cloudSaveError, setCloudSaveError] = useState("");
  const [cloudConflictTrip, setCloudConflictTrip] = useState<ReturnType<typeof loadActiveTrip>>(null);
  const [cloudAuthInterrupted, setCloudAuthInterrupted] = useState(false);
  const [deviceStorageBlocked, setDeviceStorageBlocked] = useState(false);
  const [deviceRecoveryBlocked, setDeviceRecoveryBlocked] = useState(false);
  // Existing draft links may still name an old third stage; they now resolve
  // to Time instead of stranding a traveller in removed setup UI.
  const [step, setStep] = useState(0);
  const [showTripDetails, setShowTripDetails] = useState(false);
  const [showOriginEditor, setShowOriginEditor] = useState(false);
  const [showStopEditor, setShowStopEditor] = useState(false);
  const [summaryFocus, setSummaryFocus] = useState<"origin" | "stops" | "dates" | "constraints" | null>(null);
  const [generated, setGenerated] = useState(false);
  const [editingRouteStopId, setEditingRouteStopId] = useState<string | null>(null);
  const [routeNightDraft, setRouteNightDraft] = useState<Record<string, number> | null>(null);

  const today = useMemo(() => iso(new Date()), []);
  const oneWeekLater = useMemo(() => { const date = new Date(); date.setDate(date.getDate() + 6); return iso(date); }, []);
  const [origin, setOrigin] = useState("");
  const [tripBrief, setTripBrief] = useState("");
  const [originCoordinates, setOriginCoordinates] = useState<[number, number] | undefined>();
  const [originTouched, setOriginTouched] = useState(false);
  const [originError, setOriginError] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);
  const [routeHints, setRouteHints] = useState<string[]>([]);
  const [sourceRouteKey, setSourceRouteKey] = useState<string | undefined>();
  const [curatedRoute, setCuratedRoute] = useState<CuratedRouteKnowledge | undefined>();
  const [stopInput, setStopInput] = useState("");
  const [stopError, setStopError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [keptRouteKey, setKeptRouteKey] = useState<string | null>(null);
  const [locationChoices, setLocationChoices] = useState<Array<{ mention: CapturedLocation; choices: LocationChoice[] }>>([]);
  const [resolvingLocations, setResolvingLocations] = useState(false);
  const [intakeMentions, setIntakeMentions] = useState<CapturedLocation[]>([]);
  const [placeSelections, setPlaceSelections] = useState<PlaceSelection[]>([]);
  const [removedPlaceMentionIds, setRemovedPlaceMentionIds] = useState<string[]>([]);
  const [resolvingPlaceMentionId, setResolvingPlaceMentionId] = useState<string | null>(null);
  const [tripIntent, setTripIntent] = useState<TripIntent>(() => defaultTripIntent());
  const [capturedStructuredBrief, setCapturedStructuredBrief] = useState<StructuredTripBrief>(() => extractStructuredTripBrief(""));
  const [travellersManuallyEdited, setTravellersManuallyEdited] = useState(false);
  const [paceManuallyEdited, setPaceManuallyEdited] = useState(false);
  const [transportManuallyEdited, setTransportManuallyEdited] = useState(false);
  const [interestsManuallyEdited, setInterestsManuallyEdited] = useState(false);
  const [fixedCommitmentLabel, setFixedCommitmentLabel] = useState("");
  const [fixedCommitmentDate, setFixedCommitmentDate] = useState("");
  const [scheduleLocks, setScheduleLocks] = useState<TripScheduleLocks>({ stopIds: [], arrivalDates: {} });
  const [decisionSelections, setDecisionSelections] = useState<TripDecisionSelections>({ transportByLeg: {} });
  const [lastStructuralChange, setLastStructuralChange] = useState<StructuralSnapshot | null>(null);

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(oneWeekLater);
  const [datesManuallyEdited, setDatesManuallyEdited] = useState(false);
  const [picker, setPicker] = useState<"start" | "end" | null>(null);

  const [filter, setFilter] = useState("All");
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [dayAllocations, setDayAllocations] = useState<Record<string, number>>({});
  const [discoveredPlaces, setDiscoveredPlaces] = useState<Record<string, Place[]>>({});
  const [discovering, setDiscovering] = useState<Record<string, boolean>>({});

  const [budget, setBudget] = useState<"value" | "mid" | "high">("value");
  const [travelProfile, setTravelProfile] = useState<TravelProfile>(defaultTravelProfile);
  const [hasSavedTravelProfile, setHasSavedTravelProfile] = useState(false);
  const [showBudgetOverride, setShowBudgetOverride] = useState(false);
  const [hasPromptContext, setHasPromptContext] = useState(false);
  const [arrivedFromHomepage, setArrivedFromHomepage] = useState(false);
  const [buildRequested, setBuildRequested] = useState(false);
  const [openingTrip, setOpeningTrip] = useState(false);

  const pickerRef = useDismiss(Boolean(picker), () => setPicker(null));
  const locationDialogRef = useRef<HTMLElement>(null);
  const locationDialogOpen = locationChoices.length > 0;

  useEffect(() => {
    if (!locationDialogOpen) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = locationDialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
    (focusable()[0] ?? dialog)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setLocationChoices([]);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus();
    };
  }, [locationDialogOpen]);

  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  useEffect(() => {
    const updateRememberedOwner = () => setRememberedOwnerId(loadRememberedOwner());
    const updateConnectivity = () => setBrowserOffline(window.navigator.onLine === false);
    const onStorage = (event: StorageEvent) => {
      if (event.key === EASYT_LAST_OWNER_KEY) updateRememberedOwner();
    };
    updateRememberedOwner();
    updateConnectivity();
    setBrowserContextReady(true);
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    window.addEventListener(EASYT_LAST_OWNER_CHANGE_EVENT, updateRememberedOwner);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
      window.removeEventListener(EASYT_LAST_OWNER_CHANGE_EVENT, updateRememberedOwner);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!authenticatedOwnerId) return;
    rememberLastOwner(authenticatedOwnerId);
    setRememberedOwnerId(authenticatedOwnerId);
  }, [authenticatedOwnerId]);

  useEffect(() => {
    if (expiredSessionOwnerId) setCloudAuthInterrupted(true);
  }, [expiredSessionOwnerId]);

  useEffect(() => {
    if (session !== null || sessionPending || sessionError || browserOffline || expiredSessionOwnerId) return;
    forgetRememberedOwner();
    setRememberedOwnerId(null);
  }, [browserOffline, expiredSessionOwnerId, session, sessionError, sessionPending]);

  useEffect(() => {
    if (sessionPending || !browserContextReady) return;
    if (canUseHydratedTripScope(hydratedOwnerScopeRef.current, activeBrowserOwnerId)) return;
    const previousOwnerScope = hydratedOwnerScopeRef.current;
    hydratedOwnerScopeRef.current = undefined;
    recoveryHandleRef.current = null;
    setHydrated(false);
    setTripUnavailable(false);
    let active = true;
    const applySaved = (saved: ReturnType<typeof loadActiveTrip>) => {
      if (!saved || !active) return;
      setTripId(saved.id);
      setTripOwnerId(saved.ownerId);
      setTripStatus(saved.status);
      setCreatedAt(saved.createdAt);
      setTripUpdatedAt(saved.updatedAt);
      setOrigin(saved.brief.origin);
      setTripBrief(saved.brief.mustDo);
      setOriginCoordinates(saved.brief.originCoordinates);
      setSourceRouteKey(saved.brief.sourceRouteKey);
      setCuratedRoute(saved.brief.curatedRoute);
      setStops(saved.stops.map(({ id, name, country, countryCode, region, providerId, longitude, latitude }) => ({ id, name, country, countryCode, region, providerId, coordinates: longitude !== null && latitude !== null ? [longitude, latitude] : undefined })));
      setStartDate(saved.startDate);
      setEndDate(saved.endDate);
      setPicks(saved.brief.selectedPlaces);
      setDayAllocations(saved.brief.nightAllocations ?? (saved.brief.nightAllocation && saved.brief.nightAllocation.state !== "conflict"
        ? saved.brief.nightAllocation.allocations
        : saved.brief.dayAllocations ?? {}));
      setBudget(saved.brief.budgetBand);
      setTripIntent(tripIntentForTrip(saved));
      const savedStructuredBrief = saved.brief.structuredBrief ?? structuredTripBriefFromSavedSelections({
        destinations: [
          ...(saved.brief.origin ? [{ name: saved.brief.origin, role: "arrival-gateway" as const, priority: "required" as const }] : []),
          ...saved.stops.map((stop) => ({ id: stop.id, name: stop.name, role: "preferred" as const, priority: "normal" as const })),
        ],
        travellers: saved.travellers,
        dates: { start: saved.startDate, end: saved.endDate, fixed: saved.brief.intent?.timing.flexibility === "fixed" },
        pace: saved.brief.intent?.preferences.pace,
        transportPreferences: saved.brief.intent?.preferences.transportModes,
        budget: saved.brief.budgetBand,
        avoidDriving: saved.brief.intent?.hardConstraints.avoidDriving,
      });
      setCapturedStructuredBrief(savedStructuredBrief);
      setIntakeMentions(savedStructuredBrief.placeMentions ?? []);
      setPlaceSelections(savedStructuredBrief.placeSelections ?? []);
      setRemovedPlaceMentionIds(savedStructuredBrief.removedPlaceMentionIds ?? []);
      setScheduleLocks(saved.brief.scheduleLocks ?? { stopIds: [], arrivalDates: {} });
      setDecisionSelections(saved.brief.decisionSelections ?? { transportByLeg: {} });
      setHasPromptContext(true);
    };
    const hydrate = async () => {
      const params = new URLSearchParams(window.location.search);
      const activeOwnerId = activeBrowserOwnerId;
      const requestedStep = Number(params.get("step"));
      if (Number.isInteger(requestedStep) && requestedStep >= 0 && requestedStep <= 2) {
        setStep(Math.min(1, requestedStep));
      }
      const tripIdFromUrl = params.get("trip");
      const showItinerary = params.get("view") === "itinerary";
      if (!tripIdFromUrl && typeof previousOwnerScope === "string" && previousOwnerScope !== activeOwnerId) {
        if (active) {
          hydratedOwnerScopeRef.current = activeOwnerId;
          setTripUnavailable(true);
          setHydrated(true);
        }
        return;
      }
      if (tripIdFromUrl) {
        const explicitRecovery = params.get("recover") === "1";
        if (authenticatedOwnerId && explicitRecovery) {
          const claimed = claimGuestTripRecoveryForOwner(tripIdFromUrl, authenticatedOwnerId);
          if (claimed?.stored) recoveryHandleRef.current = claimed.handle;
        }
        const ownerScope = activeOwnerId;
        const requestedRecovery = explicitRecovery ? loadTripRecovery(tripIdFromUrl, ownerScope) : null;
        const requestedTrip = requestedRecovery?.trip ?? await loadRequestedTrip(tripIdFromUrl, ownerScope);
        if (!active) return;
        if (requestedTrip) {
          const matchingRecovery = requestedRecovery ?? loadTripRecovery(tripIdFromUrl, ownerScope);
          recoveryHandleRef.current = matchingRecovery
            && JSON.stringify(matchingRecovery.trip) === JSON.stringify(requestedTrip)
            ? matchingRecovery
            : null;
          applySaved(requestedTrip);
          if (showItinerary) setGenerated(true);
        } else {
          setTripUnavailable(true);
        }
      } else {
        if (activeOwnerId) {
          if (previousOwnerScope === null) {
            const claimed = claimGuestTripRecoveryForOwner(tripId, activeOwnerId);
            if (claimed?.stored) recoveryHandleRef.current = claimed.handle;
          }
        }
        try {
          const savedProfile = JSON.parse(window.localStorage.getItem(travelProfileStorageKey(activeBrowserOwnerId)) ?? "null");
          if (isTravelProfile(savedProfile)) { setBudget(savedProfile.budget); setTravelProfile(savedProfile); setHasSavedTravelProfile(true); }
        } catch { setBudget(defaultTravelProfile.budget); }
        let homeDraft: HomeTripDraft | null = null;
        if (params.get("homeDraft") === "1") {
          try { homeDraft = JSON.parse(window.localStorage.getItem(HOME_TRIP_DRAFT_KEY) ?? "null"); } catch { homeDraft = null; }
        }
        if (!homeDraft) {
          const routeDetail = publicRouteDetailFor(params.get("inspire") ?? "");
          if (routeDetail) homeDraft = routePlannerPayload(routeDetail.planDraft);
        }
        if (homeDraft?.brief || homeDraft?.origin || homeDraft?.destination || homeDraft?.destinations?.length || homeDraft?.locationMentions?.length) {
          homeDraftRef.current = homeDraft;
          setHasPromptContext(true);
          setArrivedFromHomepage(true);
          setSourceRouteKey(homeDraft.sourceRouteKey);
          setCuratedRoute(homeDraft.curatedRoute);
          if (homeDraft.decisionSelections) setDecisionSelections(homeDraft.decisionSelections);
          if (homeDraft.origin) setOrigin(homeDraft.origin);
          if (homeDraft.originCoordinates) setOriginCoordinates(homeDraft.originCoordinates);
          // `destination` is retained for drafts created before prompt-first
          // routing. New homepage drafts carry the complete verified route.
          const draftStops = homeDraft.destinations?.length ? homeDraft.destinations : homeDraft.destination ? [homeDraft.destination] : [];
          if (draftStops.length) setStops(draftStops);
          if (homeDraft.routeHints) setRouteHints(homeDraft.routeHints);
          if (homeDraft.nightAllocations) setDayAllocations(homeDraft.nightAllocations);
          if (homeDraft.startDate) setStartDate(homeDraft.startDate);
          if (homeDraft.endDate) setEndDate(homeDraft.endDate);
          if (!homeDraft.datesExplicit && homeDraft.durationDays) {
            const durationEnd = new Date(`${today}T00:00:00`);
            durationEnd.setDate(durationEnd.getDate() + Math.max(1, homeDraft.durationDays) - 1);
            setEndDate(iso(durationEnd));
          }
          if (homeDraft.datesExplicit) setDatesManuallyEdited(true);
          if (homeDraft.travellersExplicit) setTravellersManuallyEdited(true);
          if (homeDraft.interests?.length) setInterestsManuallyEdited(true);
          const regions = homeDraft.regions?.filter(Boolean) ?? [];
          setTripBrief(homeDraft.brief ?? (regions.length ? regions.join(", ") : ""));
          const homeStructuredBrief = homeDraft.structuredBrief ?? extractStructuredTripBrief(homeDraft.brief ?? "");
          const structuredTransportModes = homeStructuredBrief.transportPreferences
            .map((preference) => preference.value)
            .filter((mode): mode is TripTransportMode => mode === "flight" || mode === "train" || mode === "drive");
          const structuredInterests = homeStructuredBrief.interests.map((interest) => interest.value);
          const structuredAvoidDriving = homeStructuredBrief.hardConstraints.some((constraint) => constraint.type === "no-driving");
          setTripIntent((current) => ({
            ...current,
            timing: {
              ...current.timing,
              flexibility: homeTripDraftTimingFlexibility(homeDraft!, current.timing.flexibility),
              durationDays: homeDraft?.durationDays ?? current.timing.durationDays,
            },
            travellers: Math.max(1, Math.min(12, Math.round(
              (homeDraft?.travellersExplicit ? homeDraft.travellers : homeStructuredBrief.travellers?.value ?? homeDraft?.travellers)
                ?? current.travellers,
            ))),
            preferences: {
              ...current.preferences,
              transportModes: structuredTransportModes.length ? structuredTransportModes : current.preferences.transportModes,
              pace: homeStructuredBrief.pace?.value ?? current.preferences.pace,
              interests: homeDraft?.interests?.length ? homeDraft.interests : structuredInterests.length ? structuredInterests : current.preferences.interests,
            },
            hardConstraints: { ...current.hardConstraints, avoidDriving: structuredAvoidDriving || current.hardConstraints.avoidDriving },
          }));
          setCapturedStructuredBrief(homeStructuredBrief);
          setPlaceSelections(homeStructuredBrief.placeSelections ?? []);
          setRemovedPlaceMentionIds(homeStructuredBrief.removedPlaceMentionIds ?? []);
          const locationMentions = homeStructuredBrief.placeMentions ?? homeDraft.locationMentions ?? [];
          if (locationMentions.length) {
            setIntakeMentions(locationMentions);
            const routableMentions = routableHandoffMentions(locationMentions);
            setResolvingLocations(Boolean(routableMentions.length));
            // Let the builder render immediately. These requests enrich the
            // route after arrival instead of holding the homepage transition.
            void (async () => {
              const outcomes = await resolveHandoffBatch(routableMentions, async (mention, signal) => {
                  const country = mention.parentCountries.length === 1 ? mention.parentCountries[0] : undefined;
                  const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(mention.canonicalName)}&candidates=1${country ? `&country=${encodeURIComponent(country)}` : ""}`, { signal });
                  const payload = await response.json() as { candidates?: LocationChoice[] };
                  return { mention, choices: payload.candidates ?? [] };
              });
              const selections = outcomes.map((outcome) => outcome.value ?? { mention: outcome.item, choices: [] });
              if (!active) return;
              const uncertain = selections.filter(({ choices }) => new Set(choices.map((choice) => choice.country.toLocaleLowerCase())).size > 1);
              const uncertainKeys = new Set(uncertain.map(({ mention }) => mention.mentionId));
              const automatic = selections.filter(({ mention }) => !uncertainKeys.has(mention.mentionId));
              for (const { mention, choices } of automatic) {
                const chosen = choices[0] ?? (mention.coordinates && mention.parentCountries.length === 1 ? { name: mention.canonicalName, country: mention.parentCountries[0], coordinates: mention.coordinates } : undefined);
                if (!chosen) continue;
                if (isOriginMention(mention)) { setOrigin(chosen.name); setOriginCoordinates(chosen.coordinates); }
                else setStops((current) => current.some((stop) => stop.name.toLocaleLowerCase() === chosen.name.toLocaleLowerCase() && stop.country === chosen.country) ? current : [...current, { id: `${chosen.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${mention.order}`, name: chosen.name, country: chosen.country, countryCode: chosen.countryCode, region: chosen.region, providerId: chosen.providerId, coordinates: chosen.coordinates, intent: mention.routability === "anchor_or_poi" ? "landmark" : "place", locality: chosen.locality }]);
              }
              setLocationChoices(uncertain);
              setResolvingLocations(false);
            })();
          }
        } else {
          const seed = inspirationByKey[params.get("inspire") ?? ""];
          if (seed) {
          setHasPromptContext(true);
          setOrigin(seed.origin);
          setOriginCoordinates(seed.originCoordinates);
          setStops(seed.stops);
          // A route has its own starting level, but an account preference still
          // wins when present so the plan reflects the traveller, not the card.
          try {
            const savedProfile = JSON.parse(window.localStorage.getItem(travelProfileStorageKey(activeBrowserOwnerId)) ?? "null");
            if (isTravelProfile(savedProfile)) { setBudget(savedProfile.budget); setTravelProfile(savedProfile); setHasSavedTravelProfile(true); } else setBudget(seed.budget);
            } catch { setBudget(seed.budget); }
          }
        }
      }
      if (active) {
        hydratedOwnerScopeRef.current = activeOwnerId;
        setHydrated(true);
      }
    };
    void hydrate();
    return () => { active = false; };
  }, [activeBrowserOwnerId, authenticatedOwnerId, browserContextReady, sessionPending]);

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

  useEffect(() => {
    if (session?.user?.id && tripOwnerId && session.user.id !== tripOwnerId) {
      // Keep the first account's browser copy quarantined, but never leave it
      // visible after this tab observes a different authenticated account.
      window.location.assign("/journey/dashboard");
      return;
    }
    if (hydrated && session?.user?.id && !tripOwnerId) {
      // A recovery scope protects the local document for this account. It is
      // not cloud ownership: the first authenticated write must remain an
      // ownerless promotion until the repository creates the canonical row.
      const claimed = claimGuestTripRecoveryForOwner(tripId, session.user.id);
      if (claimed?.stored) recoveryHandleRef.current = claimed.handle;
    }
  }, [hydrated, session?.user?.id, tripId, tripOwnerId]);

  const totalDays = useMemo(() => {
    const d = Math.round((+new Date(`${endDate}T00:00:00`) - +new Date(`${startDate}T00:00:00`)) / 86400000) + 1;
    return Number.isFinite(d) && d > 0 ? d : 1;
  }, [startDate, endDate]);
  const totalNights = useMemo(() => tripNightsBetween(startDate, endDate), [startDate, endDate]);
  const currentCuratedRoute = useMemo(
    () => reconcileCuratedRouteKnowledge(curatedRoute, stops.map((stop) => stop.id)),
    [curatedRoute, stops],
  );
  const analyticsTripSource = sourceRouteKey ? "route" as const : arrivedFromHomepage ? "homepage" as const : "builder" as const;

  const effectiveIntent = useMemo<TripIntent>(() => ({
    ...tripIntent,
    timing: { ...tripIntent.timing, durationDays: totalDays },
    hardConstraints: {
      ...tripIntent.hardConstraints,
      originRequired: Boolean(origin.trim()),
      optionalStopIds: tripIntent.hardConstraints.optionalStopIds.filter((id) => stops.some((stop) => stop.id === id)),
      mustSeeStopIds: stops.filter((stop) => !tripIntent.hardConstraints.optionalStopIds.includes(stop.id)).map((stop) => stop.id),
    },
    preferences: { ...tripIntent.preferences, budgetSensitivity: budget },
  }), [tripIntent, totalDays, origin, stops, budget]);
  const effectiveStructuredBrief = useMemo(() => mergeStructuredTripBrief(capturedStructuredBrief, {
    ...(datesManuallyEdited ? { duration: { value: totalDays, unit: "days" as const, precision: "exact" as const } } : {}),
    destinations: [
      ...(origin.trim() ? [{ name: origin.trim(), role: "arrival-gateway" as const, priority: "required" as const }] : []),
      ...stops.map((stop) => {
        const selection = placeSelections.find((item) => item.routeStopId === stop.id);
        const selectedMention = selection
          ? capturedStructuredBrief.placeMentions?.find((mention) => mention.mentionId === selection.mentionId)
          : undefined;
        const prior = capturedStructuredBrief.destinations.find((destination) => destination.id === stop.id
          || destination.name.toLocaleLowerCase() === stop.name.toLocaleLowerCase());
        return {
          id: stop.id,
          name: stop.name,
          canonicalPlaceId: selection?.selectedCanonicalPlaceId ?? prior?.canonicalPlaceId,
          placeMentionId: selection?.mentionId ?? prior?.placeMentionId,
          placeType: selection?.selectedPlaceType ?? prior?.placeType ?? (selectedMention ? "town" as const : undefined),
          resolutionStatus: selection ? "resolved" as const : prior?.resolutionStatus ?? "resolved" as const,
          routability: selection ? "direct_destination" as const : prior?.routability ?? "direct_destination" as const,
          sourceLabel: prior?.sourceLabel ?? selectedMention?.sourceText,
          parentCountries: selection?.selectedParentCountries ?? prior?.parentCountries ?? (stop.country ? [stop.country] : selectedMention?.parentCountries),
          role: prior?.role ?? "preferred" as const,
          priority: prior?.priority ?? "normal" as const,
        };
      }),
    ],
    mustVisit: [...new Set([
      ...capturedStructuredBrief.mustVisit.map((destination) => destination.name),
      ...stops.filter((stop) => !effectiveIntent.hardConstraints.optionalStopIds.includes(stop.id)).map((stop) => stop.name),
    ])],
    ...(travellersManuallyEdited ? { travellers: effectiveIntent.travellers } : {}),
    ...(datesManuallyEdited ? { dates: { start: startDate, end: endDate, fixed: effectiveIntent.timing.flexibility === "fixed" } } : {}),
    ...(paceManuallyEdited ? { pace: effectiveIntent.preferences.pace } : {}),
    ...(interestsManuallyEdited ? { interests: effectiveIntent.preferences.interests } : {}),
    ...(transportManuallyEdited ? { transportPreferences: effectiveIntent.preferences.transportModes } : {}),
    ...(hasSavedTravelProfile || showBudgetOverride ? { budget } : {}),
    fixedCommitments: effectiveIntent.hardConstraints.fixedCommitments.map((commitment) => ({ label: commitment.label, date: commitment.date })),
    avoidDriving: effectiveIntent.hardConstraints.avoidDriving,
    placeSelections,
    removedPlaceMentionIds,
  }), [capturedStructuredBrief, totalDays, origin, stops, effectiveIntent, startDate, endDate, budget, datesManuallyEdited, travellersManuallyEdited, paceManuallyEdited, transportManuallyEdited, interestsManuallyEdited, hasSavedTravelProfile, showBudgetOverride, placeSelections, removedPlaceMentionIds]);
  const structuredRouteConstraints = useMemo(() => routeConstraintsFromStructuredTripBrief(effectiveStructuredBrief), [effectiveStructuredBrief]);
  const structuredScoringPreferences = useMemo(() => routeScoringPreferencesFromStructuredBrief(effectiveStructuredBrief), [effectiveStructuredBrief]);
  const intentReady = Boolean(originCoordinates && stops.length && effectiveIntent.travellers >= 1);

  useEffect(() => {
    if (!hydrated || !intentReady) return;
    if (!hasAnalyticsConsent()) return;
    const key = `morrovia:trip-intent-tracked:${tripId}`;
    if (window.localStorage.getItem(key)) return;
    trackEvent("trip_intent_created", {
      traveller_count: effectiveIntent.travellers,
      stop_count: stops.length,
      duration_days: totalDays,
      dates_flexible: effectiveIntent.timing.flexibility === "flexible",
      fixed_commitment_count: effectiveIntent.hardConstraints.fixedCommitments.length,
      avoid_driving: effectiveIntent.hardConstraints.avoidDriving,
    });
    window.localStorage.setItem(key, "1");
  }, [hydrated, intentReady, tripId, effectiveIntent, stops.length, totalDays]);

  useEffect(() => {
    if (!hydrated || step !== 1) return;
    if (!hasAnalyticsConsent()) return;
    const key = `morrovia:budget-viewed:${tripId}`;
    if (window.sessionStorage.getItem(key)) return;
    trackEvent("budget_viewed", { budget_band: budget, stop_count: stops.length, duration_days: totalDays });
    window.sessionStorage.setItem(key, "1");
  }, [budget, hydrated, step, stops.length, totalDays, tripId]);

  const selected = stops.flatMap((stop) => (picks[stop.id] ?? []).map((title) => ({ stopId: stop.id, title })));
  const contextualSuggestions = useMemo(
    () => [...(ROUTE_HINT_SUGGESTIONS[routeHints[0]] ?? []), ...(ROUTE_HINT_SUGGESTIONS[routeHints[1]] ?? []), ...suggestionsFor(stops.at(-1))]
      .filter((name, index, all) => all.indexOf(name) === index && !stops.some((stop) => stop.name.toLowerCase() === name.toLowerCase()))
      .slice(0, 4),
    [routeHints, stops],
  );
  const originMissing = originTouched && (!origin.trim() || Boolean(originError));
  const activePlaceMentions = useMemo(() => (effectiveStructuredBrief.placeMentions ?? intakeMentions)
    .filter((mention) => !(effectiveStructuredBrief.removedPlaceMentionIds ?? []).includes(mention.mentionId)), [effectiveStructuredBrief, intakeMentions]);
  const placeIssues = effectiveStructuredBrief.placeIssues ?? [];
  const blockingPlaceIssue = placeIssues.find((issue) => issue.blocksRoute);
  const placeReviewReady = !resolvingLocations && locationChoices.length === 0 && !blockingPlaceIssue;
  const stepLabels = language === "es"
    ? ["Lugares", "Tiempo"]
    : ["Places", "Time"];
  const stepNotes = language === "es"
    ? ["El viaje", "Fechas y noches"]
    : ["The trip", "Dates and nights"];
  const stepGuidance = language === "es"
    ? [
      ["Elige los lugares.", "Morrovia ya ha recogido lo que pudo de tu idea. Corrige solo lo necesario."],
      ["Define el tiempo.", "Elige las fechas y ajusta las noches antes de crear el viaje."],
    ]
    : [
      ["Choose the places.", "We’ve picked up what we can from your idea. Correct only what needs it."],
      ["Set the time.", "Set your dates, then adjust nights before we build your trip."],
    ];
  const pickedUpPreferences = useMemo(() => {
    const labels: string[] = [];
    if (effectiveStructuredBrief.duration) labels.push(`${effectiveStructuredBrief.duration.value} ${effectiveStructuredBrief.duration.unit}`);
    const capturedModes = effectiveStructuredBrief.transportPreferences.map((preference) => preference.value);
    if (capturedModes.includes("train")) labels.push(language === "es" ? "Tren preferido" : "Train preferred");
    if (capturedModes.includes("flight")) labels.push(language === "es" ? "Volar cuando convenga" : "Fly when it helps");
    const capturedPace = effectiveStructuredBrief.pace?.value;
    if (capturedPace && capturedPace !== "balanced") labels.push(language === "es" ? ({ relaxed: "Ritmo tranquilo", packed: "Ritmo intenso" }[capturedPace]) : ({ relaxed: "Relaxed pace", packed: "Full days" }[capturedPace]));
    if (effectiveStructuredBrief.hardConstraints.some((constraint) => constraint.type === "no-driving")) labels.push(language === "es" ? "Evitar coche" : "Avoid driving");
    const interestLabels = language === "es"
      ? { food: "Comida", culture: "Cultura", nature: "Naturaleza", cities: "Ciudades", beach: "Playa", hiking: "Senderismo" }
      : { food: "Food", culture: "Culture", nature: "Nature", cities: "Cities", beach: "Beach", hiking: "Hiking" };
    effectiveStructuredBrief.interests.forEach((interest) => labels.push(interestLabels[interest.value as keyof typeof interestLabels] ?? interest.value));
    return labels;
  }, [effectiveStructuredBrief, language]);
  const openSummaryEditor = (target: "origin" | "stops" | "dates" | "constraints") => {
    const targetStep = target === "dates" ? 1 : 0;
    if (step !== targetStep) setStep(targetStep);
    if (target === "origin") setShowOriginEditor(true);
    if (target === "stops") setShowStopEditor(true);
    if (target === "constraints") setShowTripDetails(true);
    setSummaryFocus(target);
    window.setTimeout(() => document.getElementById(`builder-${target}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };

  const routeIntelligence = useMemo(() => assessRouteIntelligence({
    origin: { name: origin.trim(), coordinates: originCoordinates },
    stops,
    picks,
    availableDays: totalDays,
    constraints: {
      ...structuredRouteConstraints,
      fixedCommitments: effectiveIntent.hardConstraints.fixedCommitments,
      transportModes: structuredRouteConstraints.transportModes.length ? structuredRouteConstraints.transportModes : effectiveIntent.preferences.transportModes,
      optionalStopIds: effectiveIntent.hardConstraints.optionalStopIds,
    },
    scoringPreferences: {
      pace: structuredScoringPreferences.pace ?? effectiveIntent.preferences.pace,
      preferredModes: structuredScoringPreferences.preferredModes.length
        ? structuredScoringPreferences.preferredModes
        : effectiveIntent.preferences.transportModes.map((mode) => mode === "drive" ? "road" as const : mode),
      avoidFlights: structuredScoringPreferences.avoidFlights,
    },
  }), [origin, originCoordinates, stops, picks, totalDays, effectiveIntent, structuredRouteConstraints, structuredScoringPreferences]);
  const routeKey = stops.map((stop) => stop.id).join("|");
  const routeRecommendationVisible = routeIntelligence.route.state === "recommendation" && keptRouteKey !== routeKey;
  const routeAnalyticsKey = `${tripId}:${routeKey}:${startDate}:${endDate}:${effectiveIntent.hardConstraints.fixedCommitments.length}:${effectiveIntent.hardConstraints.avoidDriving}`;
  useEffect(() => {
    if (!hydrated || routeIntelligence.route.state === "insufficient-data") return;
    if (!hasAnalyticsConsent()) return;
    const key = `morrovia:route-generated:${routeAnalyticsKey}`;
    if (window.localStorage.getItem(key)) return;
    trackEvent("route_generated", {
      stop_count: stops.length,
      duration_days: totalDays,
      has_recommendation: routeIntelligence.route.state === "recommendation",
      shortfall_days: routeIntelligence.shortfallDays,
      has_fixed_commitments: effectiveIntent.hardConstraints.fixedCommitments.length > 0,
    });
    window.localStorage.setItem(key, "1");
  }, [hydrated, routeAnalyticsKey, routeIntelligence, stops.length, totalDays, effectiveIntent.hardConstraints.fixedCommitments.length]);
  const routeCopy = language === "es" ? {
    eyebrow: "COMPROBACIÓN DE RUTA", useOrder: "Usar este orden", keepOrder: "Mantener mi orden",
    currentOrder: "Tu ruta ya tiene un buen flujo.", cleanerOrder: "es el orden más directo.",
    removesTravel: (minutes: number) => `Ahorra aproximadamente ${Math.floor(minutes / 60)} h ${minutes % 60} min de tiempo de traslado estimado.`,
    direction: "Evita retrocesos innecesarios.", heavyArrival: "El traslado de llegada ocupa gran parte del día.",
    substantialArrival: "El traslado de llegada ocupa una parte importante del día.", landmark: "Reserva un día completo para este lugar emblemático.",
    selectedPlaces: (count: number) => `${count} lugares seleccionados necesitan más que un día apresurado.`,
    lightArrival: "Deja tiempo para llegar y empezar a conocer el lugar.", usable: (days: number) => `aprox. ${days} días aprovechables`,
    shortfall: (comfortable: number) => `${comfortable} días sería un ritmo más cómodo`,
    shortfallHelp: "Ajusta el tiempo, elimina una parada o acepta que algunos días serán más intensos.",
  } : {
    eyebrow: "ROUTE CHECK", useOrder: "Use this order", keepOrder: "Keep my order",
    currentOrder: "Your route already flows well.", cleanerOrder: "is the cleaner order.",
    removesTravel: (minutes: number) => `It removes about ${Math.floor(minutes / 60)}h ${minutes % 60}m of estimated transfer time.`,
    direction: "It avoids unnecessary backtracking.", heavyArrival: "The arrival transfer takes most of the day.",
    substantialArrival: "The arrival transfer uses a meaningful part of the day.", landmark: "Keep a full day protected for this landmark.",
    selectedPlaces: (count: number) => `${count} selected places need more than a rushed day.`,
    lightArrival: "It leaves time to arrive and start experiencing the place.", usable: (days: number) => `about ${days} usable days`,
    shortfall: (comfortable: number) => `${comfortable} days would feel more comfortable`,
    shortfallHelp: "Adjust the time, remove a stop, or accept that some days will be more intensive.",
  };

  /** Existing duration guidance remains the fallback when destination knowledge is unavailable. */
  const recommendedNights = useMemo(() => {
    return Object.fromEntries(stops.map((stop) => [stop.id, routeIntelligence.durations[stop.id]?.recommendedDays ?? 1])) as Record<string, number>;
  }, [stops, routeIntelligence.durations]);
  const minimumNights = useMemo(() => {
    return Object.fromEntries(stops.map((stop) => [stop.id, routeIntelligence.durations[stop.id]?.minimumDays ?? 1])) as Record<string, number>;
  }, [stops, routeIntelligence.durations]);
  const nightAllocationStops = useMemo<NightAllocationStopInput[]>(() => {
    const required = new Set([
      ...(structuredRouteConstraints.requiredStopIds ?? []),
      ...effectiveIntent.hardConstraints.mustSeeStopIds,
    ]);
    return stops.map((stop, index) => {
      const briefDestination = effectiveStructuredBrief.destinations.find((destination) => destination.id === stop.id
        || destination.name.toLocaleLowerCase() === stop.name.toLocaleLowerCase());
      const previous = index ? stops[index - 1] : { name: origin, coordinates: originCoordinates };
      const arrivalImpact = estimateLegForConstraints(previous, stop, structuredRouteConstraints).transferImpact;
      const isLocked = scheduleLocks.stopIds.includes(stop.id) || Boolean(scheduleLocks.arrivalDates[stop.id]);
      const preferredNights = dayAllocations[stop.id];
      const curatedStop = curatedStopFor(currentCuratedRoute, stop.id);
      const routeStartingNights = sourceRouteKey && preferredNights !== undefined ? preferredNights : undefined;
      return {
        ...stop,
        required: required.has(stop.id),
        optional: effectiveIntent.hardConstraints.optionalStopIds.includes(stop.id),
        anchor: briefDestination?.role === "trip-anchor" || briefDestination?.role === "must-visit",
        preferredNights,
        fixedNights: isLocked && preferredNights !== undefined ? preferredNights : undefined,
        fallbackMinimumNights: curatedStop?.minimumNights ?? routeStartingNights ?? minimumNights[stop.id],
        fallbackIdealNights: curatedStop?.recommendedNights ?? routeStartingNights ?? recommendedNights[stop.id],
        preferenceWeight: picks[stop.id]?.length ?? 0,
        arrivalImpact,
      };
    });
  }, [stops, structuredRouteConstraints.requiredStopIds, effectiveIntent, effectiveStructuredBrief.destinations, origin, originCoordinates, scheduleLocks, dayAllocations, minimumNights, recommendedNights, picks, sourceRouteKey, currentCuratedRoute]);
  const fixedAllocationCommitments = useMemo(() => effectiveIntent.hardConstraints.fixedCommitments.map((commitment) => ({
    label: commitment.label,
    date: commitment.date,
  })), [effectiveIntent.hardConstraints.fixedCommitments]);
  const nightAllocation = useMemo(() => allocateTripNights({
    totalNights,
    stops: nightAllocationStops,
    pace: effectiveIntent.preferences.pace,
    fixedCommitments: fixedAllocationCommitments,
    knowledge: sourceRouteKey ? routeHandoffNightKnowledge : undefined,
  }), [totalNights, nightAllocationStops, effectiveIntent.preferences.pace, fixedAllocationCommitments, sourceRouteKey]);
  const allocation = useMemo(() => nightAllocation.allocations ?? Object.fromEntries(stops.map((stop) => [
    stop.id,
    Math.max(0, Math.round(dayAllocations[stop.id] ?? recommendedNights[stop.id] ?? 0)),
  ])), [nightAllocation, stops, dayAllocations, recommendedNights]);
  const calendarDayAllocations = useMemo(
    () => calendarDayAllocationsFromNights(stops.map((stop) => stop.id), allocation),
    [stops, allocation],
  );
  const compressedStops = stops.flatMap((stop) => {
    const duration = routeIntelligence.durations[stop.id];
    const days = allocation[stop.id] ?? 0;
    const usableDays = usableStopDays(days, duration?.arrivalLoad ?? "unknown");
    return duration && (days < duration.minimumDays || usableDays < 1)
      ? [{ stop, duration, days, usableDays }]
      : [];
  });
  const longTransferCount = stops.filter((stop) => routeIntelligence.durations[stop.id]?.arrivalLoad === "travel-heavy").length;
  const allocatedNights = Object.values(allocation).reduce((sum, nights) => sum + nights, 0);
  const allNightsAllocated = stops.length > 0 && allocatedNights === totalNights;
  const specificTimingIssue = compressedStops[0] ?? stops.flatMap((stop) => {
    const duration = routeIntelligence.durations[stop.id];
    return duration?.arrivalLoad === "travel-heavy" ? [{ stop, duration, days: allocation[stop.id] ?? 0, usableDays: usableStopDays(allocation[stop.id] ?? 0, duration.arrivalLoad) }] : [];
  })[0];
  const tripTimingNotice = nightAllocation.state === "conflict"
    ? nightAllocation.conflicts[0]?.message ?? "The fixed stays cannot be reconciled with the trip dates."
    : nightAllocation.state === "compromised"
      ? nightAllocation.conflicts[0]?.message ?? "Some destination minimums cannot fit inside the available nights."
      : routeIntelligence.shortfallDays > 0
    ? (language === "es" ? `Este viaje está comprimido: ${routeIntelligence.comfortableDays} días serían un ritmo más cómodo.` : `This trip is compressed: ${routeIntelligence.comfortableDays} days would feel more comfortable.`)
    : longTransferCount >= 2
      ? (language === "es" ? `${longTransferCount} traslados largos ocupan una parte importante de este viaje.` : `${longTransferCount} long transfers take a meaningful amount of time from this trip.`)
      : null;
  const restoreRecommendedOrderVisible = decisionSelections.routeOrder === "entered"
    && routeIntelligence.route.state === "recommendation"
    && (routeIntelligence.route.improvementMinutes ?? 0) >= 90;
  const routeAllocation = routeNightDraft ?? allocation;
  const routeNights = stops.reduce((total, stop) => total + (routeAllocation[stop.id] ?? 0), 0);
  const routeNightDifference = routeNights - totalNights;

  const rememberStructuralChange = (summary: string, affectedStopCount: number) => {
    setLastStructuralChange({ stops, allocations: dayAllocations, startDate, endDate, locks: scheduleLocks, placeSelections, removedPlaceMentionIds, summary });
    trackEvent("trip_refined", { change_type: summary, affected_stop_count: affectedStopCount });
  };

  const undoStructuralChange = () => {
    if (!lastStructuralChange) return;
    setStops(lastStructuralChange.stops);
    setDayAllocations(lastStructuralChange.allocations);
    setStartDate(lastStructuralChange.startDate);
    setEndDate(lastStructuralChange.endDate);
    setScheduleLocks(lastStructuralChange.locks);
    setPlaceSelections(lastStructuralChange.placeSelections);
    setRemovedPlaceMentionIds(lastStructuralChange.removedPlaceMentionIds);
    setLastStructuralChange(null);
  };

  const removeStop = (stopId: string) => {
    const stop = stops.find((item) => item.id === stopId);
    if (!stop) return;
    if (scheduleLocks.stopIds.includes(stopId)) return;
    rememberStructuralChange("remove_stop", Math.max(0, stops.length - stops.findIndex((item) => item.id === stopId) - 1));
    const linkedSelection = placeSelections.find((selection) => selection.routeStopId === stopId);
    const linkedMention = linkedSelection
      ? undefined
      : capturedStructuredBrief.placeMentions?.find((mention) => mention.canonicalName.toLocaleLowerCase() === stop.name.toLocaleLowerCase());
    if (linkedSelection) setPlaceSelections((current) => current.filter((selection) => selection.routeStopId !== stopId));
    else if (linkedMention) setRemovedPlaceMentionIds((current) => [...new Set([...current, linkedMention.mentionId])]);
    setStops((current) => current.filter((item) => item.id !== stopId));
    setDayAllocations((current) => { const next = { ...current }; delete next[stopId]; return next; });
    setScheduleLocks((current) => { const arrivalDates = { ...current.arrivalDates }; delete arrivalDates[stopId]; return { stopIds: current.stopIds.filter((id) => id !== stopId), arrivalDates }; });
    setDecisionSelections((current) => ({ ...current, routeOrder: undefined }));
  };

  const updateTravelDate = (kind: "start" | "end", value: string) => {
    const nextStart = kind === "start" ? value : startDate;
    const nextEnd = kind === "end" ? (value < startDate ? startDate : value) : (value > endDate ? value : endDate);
    if (nextStart === startDate && nextEnd === endDate) return;
    rememberStructuralChange(kind === "start" ? "change_start_date" : "change_end_date", stops.length);
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setDatesManuallyEdited(true);
  };

  const updateAllocatedDays = (stopId: string, requested: number) => {
    if (scheduleLocks.stopIds.includes(stopId) || scheduleLocks.arrivalDates[stopId]) return;
    const current = allocation[stopId] ?? 0;
    const others = stops.filter((stop) => stop.id !== stopId);
    if (!others.length) return;
    const lockedOtherNights = others
      .filter((stop) => scheduleLocks.stopIds.includes(stop.id) || Boolean(scheduleLocks.arrivalDates[stop.id]))
      .reduce((total, stop) => total + (allocation[stop.id] ?? 0), 0);
    const maximum = Math.max(0, totalNights - lockedOtherNights);
    const next = Math.max(0, Math.min(maximum, Math.round(requested)));
    const difference = next - current;
    if (!difference) return;
    const nextAllocation = { ...allocation, [stopId]: next };
    if (difference > 0) {
      let remaining = difference;
      [...others]
        .filter((stop) => !scheduleLocks.stopIds.includes(stop.id) && !scheduleLocks.arrivalDates[stop.id])
        .sort((a, b) => nextAllocation[b.id] - nextAllocation[a.id])
        .forEach((stop) => {
        const movable = Math.max(0, nextAllocation[stop.id]);
        const amount = Math.min(movable, remaining);
        nextAllocation[stop.id] -= amount;
        remaining -= amount;
      });
      if (remaining > 0) return;
    } else {
      const receiver = [...others]
        .filter((stop) => !scheduleLocks.stopIds.includes(stop.id) && !scheduleLocks.arrivalDates[stop.id])
        .sort((a, b) => (recommendedNights[b.id] ?? 1) - (recommendedNights[a.id] ?? 1))[0];
      if (!receiver) return;
      nextAllocation[receiver.id] += Math.abs(difference);
    }
    rememberStructuralChange("change_nights", others.length);
    setDayAllocations(nextAllocation);
  };

  const beginRouteEdit = (stopId: string) => {
    setEditingRouteStopId(stopId);
    setRouteNightDraft((current) => current ?? { ...allocation });
  };

  const updateRouteNightDraft = (stopId: string, requested: number) => {
    if (scheduleLocks.stopIds.includes(stopId) || scheduleLocks.arrivalDates[stopId]) return;
    setRouteNightDraft((current) => ({ ...(current ?? allocation), [stopId]: Math.max(0, Math.min(totalNights, Math.round(requested) || 0)) }));
  };

  const applyRouteNightsToDates = () => {
    if (!routeNightDraft) return;
    rememberStructuralChange("change_nights", stops.length);
    const nextEnd = new Date(`${startDate}T00:00:00`);
    nextEnd.setDate(nextEnd.getDate() + Math.max(0, routeNights));
    setDayAllocations(routeNightDraft);
    setEndDate(iso(nextEnd));
    setDatesManuallyEdited(true);
    setRouteNightDraft(null);
    setEditingRouteStopId(null);
  };

  const rebalanceRouteNightsToDates = () => {
    if (!routeNightDraft) return;
    rememberStructuralChange("change_nights", stops.length);
    const rebalanced = allocateTripNights({
      totalNights,
      stops: nightAllocationStops.map((stop) => ({ ...stop, preferredNights: routeNightDraft[stop.id] })),
      pace: effectiveIntent.preferences.pace,
      fixedCommitments: fixedAllocationCommitments,
    });
    if (rebalanced.allocations) setDayAllocations(rebalanced.allocations);
    setRouteNightDraft(null);
    setEditingRouteStopId(null);
  };

  const addStop = async (name?: string, countryOverride?: string, resolvesMentionId?: string, selectionDraft?: PlaceSelectionDraft) => {
    const value = (name ?? stopInput).trim();
    if (!value) return setStopError(ui.typePlace);
    if (stops.some((s) => s.name.toLowerCase() === value.toLowerCase())) return setStopError(`${value} is already in your route.`);
    setStopError(ui.checking);
    try {
      const targetMentionId = resolvesMentionId ?? resolvingPlaceMentionId;
      // A regional brief can legitimately cross a border (for example,
      // Patagonia into Tierra del Fuego). Do not inherit the previous stops'
      // country while the traveller is resolving one of those regional bases.
      const routeCountry = countryOverride ?? (!targetMentionId && stops.length && stops.every((stop) => stop.country === stops[0].country) ? stops[0].country : undefined);
      const nearby = stops.at(-1)?.coordinates;
      const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(value)}${routeCountry ? `&country=${encodeURIComponent(routeCountry)}` : ""}${nearby ? `&nearLat=${nearby[1]}&nearLon=${nearby[0]}` : ""}`);
      const payload = await response.json() as { result?: { name?: string; country?: string; countryCode?: string; region?: string; providerId?: string; coordinates?: [number, number]; kind?: string; locality?: string } | null };
      const resolved = payload.result;
      if (!resolved?.coordinates || !resolved.country) return setStopError(language === "es" ? `No pudimos verificar “${value}”. Prueba una ciudad, región o lugar con su país.` : `We couldn't verify “${value}”. Try a city, region or landmark with its country.`);
      const resolvedCountry = resolved.country;
      const resolvedName = resolved.name?.split(",")[0]?.trim() || value;
      const id = `${resolvedName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
      const addedStop: Stop = { id, name: resolvedName, country: resolvedCountry, countryCode: resolved.countryCode, region: resolved.region, providerId: resolved.providerId, coordinates: resolved.coordinates, locality: resolved.locality };
      rememberStructuralChange("add_stop", 1);
      setStops((current) => [...current, addedStop]);
      if (targetMentionId) {
        const targetMention = (capturedStructuredBrief.placeMentions ?? intakeMentions).find((mention) => mention.mentionId === targetMentionId);
        setPlaceSelections((current) => [{
          mentionId: targetMentionId,
          kind: selectionDraft?.kind ?? (targetMention?.status === "ambiguous" ? "ambiguity" : "base"),
          selectedCanonicalPlaceId: selectionDraft?.selectedCanonicalPlaceId ?? (resolved.providerId ? `provider:${resolved.providerId}` : `builder-base:${resolvedName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`),
          selectedName: selectionDraft?.selectedName ?? resolvedName,
          selectedPlaceType: selectionDraft?.selectedPlaceType ?? (/city/.test(resolved.kind ?? "") ? "city" : "town"),
          selectedParentCountries: selectionDraft?.selectedParentCountries ?? [resolvedCountry],
          routeStopId: id,
          provenance: selectionDraft?.provenance ?? { id: `builder:${targetMentionId}:${id}`, label: "Traveller builder selection", kind: "builder", supports: "The traveller explicitly added this route base." },
        }, ...current.filter((selection) => selection.mentionId !== targetMentionId)]);
        setResolvingPlaceMentionId(null);
      } else {
        const restoredMention = capturedStructuredBrief.placeMentions?.find((mention) => [mention.canonicalName, mention.sourceText, ...mention.aliases]
          .some((label) => label.toLocaleLowerCase() === resolvedName.toLocaleLowerCase() || label.toLocaleLowerCase() === value.toLocaleLowerCase()));
        if (restoredMention) setRemovedPlaceMentionIds((current) => current.filter((mentionId) => mentionId !== restoredMention.mentionId));
      }
      setDecisionSelections((current) => ({ ...current, routeOrder: undefined }));
      setStopInput(""); setStopError("");
      return addedStop;
    } catch {
      setStopError(ui.unavailable);
    }
  };

  const addSupportedBase = (issue: PlaceIssue, option: PlaceIssueOption) => {
    if (!option.country || !option.coordinates) {
      setResolvingPlaceMentionId(issue.mentionId);
      setShowStopEditor(true);
      setSummaryFocus("stops");
      return;
    }
    const optionCountry = option.country;
    const existingNamed = stops.find((stop) => stop.name.toLocaleLowerCase() === option.label.toLocaleLowerCase() && stop.country === optionCountry);
    const routeDestination = sourceRouteKey
      ? capturedStructuredBrief.destinations.find((destination) => destination.placeMentionId === issue.mentionId)
      : undefined;
    const routeStop = routeDestination?.id ? stops.find((stop) => stop.id === routeDestination.id) : undefined;
    const id = existingNamed?.id ?? routeStop?.id ?? `${option.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    rememberStructuralChange("select_regional_base", existingNamed ? 0 : 1);
    if (!existingNamed && routeStop) {
      setStops((current) => current.map((stop) => stop.id === routeStop.id ? {
        ...stop,
        name: option.label,
        country: optionCountry,
        coordinates: option.coordinates,
        intent: option.placeType === "landmark" || option.placeType === "natural_area" ? "landmark" : "place",
      } : stop));
    } else if (!existingNamed) setStops((current) => [...current, {
      id,
      name: option.label,
      country: optionCountry,
      coordinates: option.coordinates,
      intent: option.placeType === "landmark" || option.placeType === "natural_area" ? "landmark" : "place",
    }]);
    setPlaceSelections((current) => [{
      mentionId: issue.mentionId,
      kind: "base",
      selectedCanonicalPlaceId: option.canonicalPlaceId,
      selectedName: option.label,
      selectedPlaceType: option.placeType,
      selectedParentCountries: [optionCountry],
      routeStopId: id,
      provenance: option.provenance[0] ?? { id: `builder:${issue.mentionId}:${id}`, label: "Traveller builder selection", kind: "builder", supports: "The traveller selected this supported base." },
    }, ...current.filter((selection) => selection.mentionId !== issue.mentionId)]);
    setRemovedPlaceMentionIds((current) => current.filter((mentionId) => mentionId !== issue.mentionId));
    setDecisionSelections((current) => ({ ...current, routeOrder: undefined }));
  };

  const choosePlaceIdentity = async (mention: CapturedLocation, canonicalPlaceId: string) => {
    const result: PlaceIntelligenceResult = {
      version: PLACE_INTELLIGENCE_VERSION,
      parserVersion: PLACE_INTELLIGENCE_PARSER_VERSION,
      sequenceKind: "unordered",
      mentions: capturedStructuredBrief.placeMentions ?? intakeMentions,
      issues: capturedStructuredBrief.placeIssues ?? [],
    };
    const selectedResult = selectPlaceCandidate(result, mention.mentionId, canonicalPlaceId);
    const selectedMention = selectedResult.mentions.find((item) => item.mentionId === mention.mentionId);
    if (!selectedMention) return;
    const nextBrief = extractStructuredTripBrief(tripBrief || capturedStructuredBrief.source.rawPrompt || "", selectedResult.parserVersion, selectedResult);
    setCapturedStructuredBrief(nextBrief);
    setIntakeMentions(selectedResult.mentions);
    if (selectedMention.routability === "direct_destination" && selectedMention.canonicalPlaceId) {
      await addStop(
        selectedMention.canonicalName,
        selectedMention.parentCountries.length === 1 ? selectedMention.parentCountries[0] : undefined,
        mention.mentionId,
        {
          kind: "ambiguity",
          selectedCanonicalPlaceId: selectedMention.canonicalPlaceId,
          selectedName: selectedMention.canonicalName,
          selectedPlaceType: selectedMention.placeType,
          selectedParentCountries: selectedMention.parentCountries,
          provenance: selectedMention.provenance[0] ?? { id: `builder:${mention.mentionId}:${selectedMention.canonicalPlaceId}`, label: "Traveller ambiguity selection", kind: "builder", supports: "The traveller selected this geographic identity." },
        },
      );
    }
  };

  const applyTripBrief = async () => {
    if (!tripBrief.trim()) return;
    const capture = captureJourneyBrief(tripBrief);
    setCapturedStructuredBrief(capture.structuredBrief);
    setIntakeMentions(capture.mentions);
    setPlaceSelections([]);
    setRemovedPlaceMentionIds([]);

    setHasPromptContext(true);

    setRouteHints(capture.routeHints);
    const capturedTransportModes = capture.structuredBrief.transportPreferences
      .map((preference) => preference.value)
      .filter((mode): mode is TripTransportMode => mode === "flight" || mode === "train" || mode === "drive");

    setTripIntent((current) => ({
      ...current,
      travellers: capture.structuredBrief.travellers ? Math.max(1, Math.min(12, capture.structuredBrief.travellers.value)) : current.travellers,
      preferences: {
        ...current.preferences,
        transportModes: capturedTransportModes.length ? capturedTransportModes : current.preferences.transportModes,
        pace: capture.structuredBrief.pace?.value ?? current.preferences.pace,
        interests: capture.structuredBrief.interests.length ? capture.structuredBrief.interests.map((interest) => interest.value) : current.preferences.interests,
      },
      hardConstraints: { ...current.hardConstraints, avoidDriving: capture.structuredBrief.hardConstraints.some((constraint) => constraint.type === "no-driving") || current.hardConstraints.avoidDriving },
    }));

    const capturedOrigin = capture.mentions.find(isOriginMention);
    if (!origin.trim() && capturedOrigin) {
      setOrigin(capturedOrigin.canonicalName);
      setOriginTouched(true);
      setOriginCoordinates(undefined);
    }

    if (!stops.length) {
      for (const mention of capture.mentions.filter((item) => !isOriginMention(item)
        && item.role !== "excluded"
        && (item.status === "resolved" || item.status === "partially_resolved")
        && Boolean(item.canonicalPlaceId)
        && item.routability === "direct_destination")) {
        await addStop(mention.canonicalName, mention.parentCountries.length === 1 ? mention.parentCountries[0] : undefined);
      }
    }

    // Respect dates the traveller has actually edited. A saved, unconfirmed
    // draft is still a draft: applying a new brief should make its stated
    // duration visible rather than quietly retaining an old seven-day range.
    if (capture.durationDays && !datesManuallyEdited) {
      const date = new Date(`${startDate}T00:00:00`);
      date.setDate(date.getDate() + Math.max(1, capture.durationDays - 1));
      setEndDate(iso(date));
    }
  };

  const moveStop = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= stops.length || to >= stops.length) return;
    const moved = stops[from];
    if (scheduleLocks.stopIds.includes(moved.id) || stops.slice(Math.min(from, to), Math.max(from, to) + 1).some((stop) => scheduleLocks.stopIds.includes(stop.id))) return;
    rememberStructuralChange("reorder_stop", Math.abs(from - to) + 1);
    setStops((current) => {
      const next = [...current];
      const [moving] = next.splice(from, 1);
      next.splice(to, 0, moving);
      return next;
    });
    setDecisionSelections((current) => ({ ...current, routeOrder: "entered" }));
  };

  const applyRecommendedOrder = () => {
    if (routeIntelligence.route.state !== "recommendation") return;
    if (scheduleLocks.stopIds.length || Object.keys(scheduleLocks.arrivalDates).length) return;
    const order = routeIntelligence.route.recommendedStopIds;
    rememberStructuralChange("apply_route_order", stops.length);
    setStops((current) => order.map((id) => current.find((stop) => stop.id === id)).filter((stop): stop is Stop => Boolean(stop)));
    setDecisionSelections((current) => ({ ...current, routeOrder: "recommended" }));
    setKeptRouteKey(null);
    trackEvent("route_accepted", { method: "recommended_order", stop_count: stops.length, duration_days: totalDays });
  };

  const acceptCurrentRoute = (method: "continue" | "keep_order") => {
    if (!hasAnalyticsConsent()) {
      setDecisionSelections((current) => ({ ...current, routeOrder: method === "keep_order" ? "entered" : current.routeOrder ?? "entered" }));
      return;
    }
    const key = `morrovia:route-accepted:${tripId}:${routeKey}`;
    if (window.localStorage.getItem(key)) return;
    trackEvent("route_accepted", { method, stop_count: stops.length, duration_days: totalDays, has_recommendation: routeIntelligence.route.state === "recommendation" });
    window.localStorage.setItem(key, "1");
    setDecisionSelections((current) => ({ ...current, routeOrder: method === "keep_order" ? "entered" : current.routeOrder ?? "entered" }));
  };

  const updateIntentPreferences = (update: Partial<TripIntent["preferences"]>) => {
    if (update.pace !== undefined) setPaceManuallyEdited(true);
    if (update.interests !== undefined) setInterestsManuallyEdited(true);
    setTripIntent((current) => ({ ...current, preferences: { ...current.preferences, ...update } }));
  };

  const toggleTransportMode = (mode: TripTransportMode) => {
    setTransportManuallyEdited(true);
    setTripIntent((current) => {
      const modes = current.preferences.transportModes.includes(mode)
        ? current.preferences.transportModes.filter((item) => item !== mode)
        : [...current.preferences.transportModes, mode];
      return { ...current, preferences: { ...current.preferences, transportModes: modes.length ? modes : [mode] } };
    });
  };

  const toggleInterest = (interest: string) => {
    setInterestsManuallyEdited(true);
    setTripIntent((current) => ({ ...current, preferences: { ...current.preferences, interests: current.preferences.interests.includes(interest) ? current.preferences.interests.filter((item) => item !== interest) : [...current.preferences.interests, interest] } }));
  };

  const addFixedCommitment = () => {
    const label = fixedCommitmentLabel.trim();
    if (!label) return;
    const commitment: FixedTripCommitment = { id: `fixed-${Date.now()}`, label, date: fixedCommitmentDate || undefined };
    setTripIntent((current) => ({ ...current, hardConstraints: { ...current.hardConstraints, fixedCommitments: [...current.hardConstraints.fixedCommitments, commitment] } }));
    setFixedCommitmentLabel("");
    setFixedCommitmentDate("");
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
  const draft = useMemo<PlannedDay[]>(() => placeReviewReady ? buildCredibleItinerary({
    origin,
    originCoordinates,
    stops,
    startDate,
    allocations: calendarDayAllocations,
    picks,
    places: Object.fromEntries(stops.map((stop) => [stop.id, placesFor(stop, discoveredPlaces)])),
    constraints: structuredRouteConstraints,
  }) : [], [placeReviewReady, origin, originCoordinates, stops, startDate, calendarDayAllocations, picks, discoveredPlaces, structuredRouteConstraints]);

  const activeTripDocument = useMemo(() => {
    const built = tripFromBuilder({
      id: tripId,
      sourceRouteKey,
      curatedRoute: currentCuratedRoute,
      origin,
      stops,
      startDate,
      endDate,
      picks,
      mustDo: tripBrief,
      pace: effectiveIntent.preferences.pace === "packed" ? "full" : "slow",
      hotels: "few",
      budget,
      dayAllocations: calendarDayAllocations,
      nightAllocations: allocation,
      nightAllocation,
      draft,
      placeDetails: discoveredPlaces,
      originCoordinates,
      createdAt,
      status: tripStatus === "archived" ? "draft" : tripStatus,
      capturedIntent: intakeMentions.length ? {
        originalBrief: tripBrief,
        parserVersion: effectiveStructuredBrief.source.parserVersion,
        regions: effectiveStructuredBrief.preferredRegions.map((region) => region.value),
        routeHints,
        mentions: activePlaceMentions.map((mention) => ({
          sourceText: mention.sourceText,
          canonicalName: mention.canonicalName,
          role: isOriginMention(mention) ? "origin" as const : "stop" as const,
          order: mention.order,
          status: mention.status === "resolved" && mention.routability === "direct_destination" ? "resolved" as const : "unresolved" as const,
          intent: mention.routability === "anchor_or_poi" ? "landmark" as const : "place" as const,
          country: mention.parentCountries.length === 1 ? mention.parentCountries[0] : undefined,
        })),
      } : undefined,
      routeAssessment: routeIntelligenceForPersistence(routeIntelligence),
      intent: effectiveIntent,
      structuredBrief: effectiveStructuredBrief,
      scheduleLocks,
      decisionSelections,
    });
    const cascaded = cascadeTripSchedule({ ...built, ownerId: tripOwnerId }).trip;
    return tripOwnerId && tripUpdatedAt ? { ...cascaded, updatedAt: tripUpdatedAt } : cascaded;
  }, [tripId, tripOwnerId, tripStatus, tripUpdatedAt, sourceRouteKey, currentCuratedRoute, origin, stops, startDate, endDate, picks, tripBrief, budget, calendarDayAllocations, nightAllocation, draft, discoveredPlaces, originCoordinates, createdAt, intakeMentions, activePlaceMentions, routeHints, routeIntelligence, effectiveIntent, effectiveStructuredBrief, scheduleLocks, decisionSelections]);

  const buildInvariant = useMemo(() => canBuildTrip({
    origin,
    originCoordinates,
    stops,
    placeReviewPending: !placeReviewReady,
    placeIssues,
    routeConstraintIssues: routeIntelligence.route.constraintIssues,
    requiredStopIds: [...new Set([
      ...(structuredRouteConstraints.requiredStopIds ?? []),
      ...effectiveIntent.hardConstraints.mustSeeStopIds,
    ])],
    maximumStops: structuredRouteConstraints.maximumStops,
    startDate,
    endDate,
    durationDays: totalDays,
    expectedDurationDays: effectiveStructuredBrief.duration?.value
      ? effectiveStructuredBrief.duration.value + (effectiveStructuredBrief.duration.unit === "nights" ? 1 : 0)
      : undefined,
    structuredBriefIssues: effectiveStructuredBrief.issues,
    nightAllocation,
    allocations: allocation,
    document: activeTripDocument,
  }), [origin, originCoordinates, stops, placeReviewReady, placeIssues, routeIntelligence.route.constraintIssues, structuredRouteConstraints.requiredStopIds, structuredRouteConstraints.maximumStops, effectiveIntent.hardConstraints.mustSeeStopIds, startDate, endDate, totalDays, effectiveStructuredBrief.duration, effectiveStructuredBrief.issues, nightAllocation, allocation, activeTripDocument]);
  const gateConflict = step === 0
    ? buildInvariant.conflicts.find((conflict) => conflict.stage === "places")
    : buildInvariant.firstConflict;
  const gate = gateConflict?.message ?? "";

  const surfaceBuildConflict = () => {
    const conflict = buildInvariant.firstConflict;
    if (!conflict) return;
    setOpeningTrip(false);
    setStep(conflict.stage === "places" ? 0 : 1);
    if (conflict.stage === "places") setHasPromptContext(true);
  };

  const persistDeviceRecovery = useCallback((trip: EasyTTrip, source: "autosave" | "before-new-trip" | "build" = "autosave") => {
    const ownerId = activeBrowserOwnerId;
    if (!canUseHydratedTripScope(hydratedOwnerScopeRef.current, ownerId)
      || (trip.ownerId && trip.ownerId !== ownerId)) {
      traceStagingTripSync("recovery-write-rejected", {
        source,
        reason: "owner-scope-mismatch",
        buildWriteId: recoveryHandleRef.current?.writeId ?? null,
        currentWriteId: recoveryHandleRef.current?.writeId ?? null,
        status: trip.status,
      });
      return {
        stored: false,
        handle: { ownerId, tripId: trip.id, writeId: `scope-mismatch-${Date.now()}` },
        blockedByExistingRecovery: true,
      };
    }
    const currentHandle = recoveryHandleRef.current;
    const replacement = currentHandle?.tripId === trip.id && currentHandle.ownerId === ownerId
      ? currentHandle
      : null;
    const recovery = saveTripRecovery(trip, {
      ownerId,
      replace: replacement ?? undefined,
    });
    if (recovery.stored) recoveryHandleRef.current = recovery.handle;
    traceStagingTripSync("recovery-write", {
      source,
      previousWriteId: currentHandle?.writeId ?? null,
      currentWriteId: recovery.handle.writeId,
      writeIdChanged: currentHandle?.writeId !== recovery.handle.writeId,
      stored: recovery.stored,
      blocked: recovery.blockedByExistingRecovery,
      status: trip.status,
      revision: trip.updatedAt,
    });
    return recovery;
  }, [activeBrowserOwnerId]);

  useEffect(() => {
    const preserveBeforeNewTrip = (event: Event) => {
      if (!hydrated || (!origin.trim() && !tripBrief.trim() && !stops.length)) return;
      const recovery = persistDeviceRecovery(activeTripDocument, "before-new-trip");
      setDeviceRecoveryBlocked(recovery.blockedByExistingRecovery);
      setDeviceStorageBlocked(!recovery.stored && !recovery.blockedByExistingRecovery);
      if (shouldAllowNewTripNavigation(recovery)) {
        setSaveState("local");
        return;
      }
      event.preventDefault();
      setSaveState("error");
      setCloudSaveError(recovery.blockedByExistingRecovery
        ? (language === "es"
          ? "Resuelve primero la copia de recuperación de este dispositivo antes de empezar otro viaje."
          : "Open or resolve this device's recovery copy before starting another trip.")
        : (language === "es"
          ? "No pudimos guardar los cambios más recientes, así que no iniciamos otro viaje."
          : "The latest changes could not be saved, so Morrovia did not start another trip."));
    };
    window.addEventListener(EASYT_BEFORE_NEW_TRIP_EVENT, preserveBeforeNewTrip);
    return () => window.removeEventListener(EASYT_BEFORE_NEW_TRIP_EVENT, preserveBeforeNewTrip);
  }, [activeTripDocument, hydrated, language, origin, persistDeviceRecovery, stops.length, tripBrief]);

  useEffect(() => {
    if (!hydrated || !origin.trim() || !stops.length) return;
    traceStagingTripSync("autosave-scheduled", {
      currentWriteId: recoveryHandleRef.current?.writeId ?? null,
      status: activeTripDocument.status,
      revision: activeTripDocument.updatedAt,
    });
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      const recovery = persistDeviceRecovery(activeTripDocument, "autosave");
      if (arrivedFromHomepage) removeHomeTripDraftIfDurable(window.localStorage, homeDraftRef.current, activeTripDocument, recovery.stored, resolvingLocations);
      setDeviceRecoveryBlocked(recovery.blockedByExistingRecovery);
      setDeviceStorageBlocked(!recovery.stored && !recovery.blockedByExistingRecovery);
      setSaveState(recovery.stored ? "local" : "error");
      if (!recovery.stored && !cloudConflictTrip) {
        setCloudSaveError(recovery.blockedByExistingRecovery
          ? (language === "es"
            ? "Ya hay cambios de este dispositivo que deben resolverse antes de editar la copia en la nube."
            : "This device already has separate edits. Open that device copy to continue or resolve it explicitly.")
          : (language === "es"
            ? "El navegador bloqueó el almacenamiento. Mantén esta pestaña abierta antes de salir."
            : "Browser storage is blocked. Keep this tab open before leaving."));
      } else if (!cloudConflictTrip && (deviceStorageBlocked || deviceRecoveryBlocked)) {
        setCloudSaveError("");
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [hydrated, activeTripDocument, arrivedFromHomepage, cloudConflictTrip, deviceRecoveryBlocked, deviceStorageBlocked, language, persistDeviceRecovery, resolvingLocations]);

  const recordGeneratedTrip = () => {
    if (generationCompletedRef.current) return buildInvariant.canBuildTrip;
    if (!buildInvariant.canBuildTrip) {
      trackEvent("trip_generation_failed", {
        trip_source: analyticsTripSource,
        error_type: "invalid_result",
        is_authenticated: Boolean(session?.user),
      });
      return false;
    }
    generationCompletedRef.current = true;
    trackEvent("trip_generated", {
      trip_source: analyticsTripSource,
      trip_id: activeTripDocument.id,
      stop_count: activeTripDocument.stops.length,
      duration_days: totalDays,
      traveller_count: effectiveIntent.travellers,
      has_dates: Boolean(startDate && endDate),
      save_state: "local",
      result: "usable",
    });
    return true;
  };

  const persistGeneratedTrip = async () => {
    if (!buildInvariant.canBuildTrip) {
      surfaceBuildConflict();
      recordGeneratedTrip();
      return null;
    }
    const usableTrip = recordGeneratedTrip();
    const requestTrip: EasyTTrip = { ...activeTripDocument, status: activeTripDocument.status === "archived" ? "archived" : "planned" };
    const recovery = persistDeviceRecovery(requestTrip, "build");
    const buildWriteId = recovery.handle.writeId;
    traceStagingTripSync("build-persistence-started", {
      buildWriteId,
      currentWriteId: recoveryHandleRef.current?.writeId ?? null,
      revision: requestTrip.updatedAt,
      status: requestTrip.status,
      authenticated: Boolean(session?.user),
    });
    try {
      if (arrivedFromHomepage) removeHomeTripDraftIfDurable(window.localStorage, homeDraftRef.current, requestTrip, recovery.stored, resolvingLocations);
      setDeviceRecoveryBlocked(recovery.blockedByExistingRecovery);
      setDeviceStorageBlocked(!recovery.stored && !recovery.blockedByExistingRecovery);
      if (!recovery.stored) {
        setCloudSaveError(recovery.blockedByExistingRecovery
          ? (language === "es"
            ? "Ya existe una copia de recuperación en este dispositivo. Ábrela antes de guardar cambios desde la nube."
            : "A separate recovery copy already exists on this device. Open it before saving changes from the cloud copy.")
          : (language === "es"
            ? "Este navegador no pudo guardar los cambios más recientes. Mantén esta pestaña abierta e inténtalo de nuevo."
            : "This browser could not save the latest changes. Keep this tab open and try again."));
        setSaveState("error");
        return null;
      }
      if (usableTrip && !localSaveTrackedRef.current) {
        localSaveTrackedRef.current = true;
        trackEvent("trip_saved", {
          trip_source: analyticsTripSource,
          trip_id: activeTripDocument.id,
          save_state: "local",
          stop_count: activeTripDocument.stops.length,
          is_authenticated: Boolean(session?.user),
        });
      }
      if (cloudConflictTrip) {
        setCloudSaveError("This trip changed on another device. Open the cloud copy before trying another cloud save; your device edits remain preserved.");
        setSaveState("error");
        return null;
      }
      if (!session?.user) return requestTrip;
      const requestOwnerId = session.user.id;
      if (recovery.handle.ownerId !== requestOwnerId
        || !canUseHydratedTripScope(hydratedOwnerScopeRef.current, requestOwnerId)
        || activeBrowserOwnerIdRef.current !== requestOwnerId) {
        setCloudSaveError("The active account changed before this trip could sync. Reopen the trip from the current account; the device copy remains preserved.");
        setSaveState("error");
        return null;
      }

      setSaveState("saving");
      setCloudSaveError("");
      setCloudAuthInterrupted(false);
      const traceCloudResult: TripRecoveryCloudTrace = (result) => {
        traceStagingTripSync(`${result.phase}-response`, {
          buildWriteId,
          currentWriteId: recoveryHandleRef.current?.writeId ?? null,
          revision: result.revision,
          status: result.status,
          ownerAssigned: result.ownerAssigned,
          httpStatus: result.httpStatus ?? null,
          validTrip: result.validTrip ?? null,
        });
      };
      const saved = await saveTripRecoveryToEasyT(requestTrip, recovery.handle, fetch, traceCloudResult);
      const currentHandle = recoveryHandleRef.current;
      const recoveryOwnerMatches = currentHandle?.ownerId === recovery.handle.ownerId;
      const recoveryTripMatches = currentHandle?.tripId === recovery.handle.tripId;
      const recoveryWriteMatches = currentHandle?.writeId === recovery.handle.writeId;
      const hydratedOwnerMatches = hydratedOwnerScopeRef.current === requestOwnerId;
      const browserOwnerMatches = activeBrowserOwnerIdRef.current === requestOwnerId;
      const responseIsCurrent = recoveryOwnerMatches
        && recoveryTripMatches
        && recoveryWriteMatches
        && hydratedOwnerMatches
        && browserOwnerMatches;
      traceStagingTripSync("acknowledgement-decision", {
        buildWriteId,
        currentWriteId: currentHandle?.writeId ?? null,
        accepted: responseIsCurrent,
        recoveryOwnerMatches,
        recoveryTripMatches,
        recoveryWriteMatches,
        hydratedOwnerMatches,
        browserOwnerMatches,
        putRevision: saved.updatedAt,
      });
      if (!responseIsCurrent) {
        traceStagingTripSync("persistence-finished", {
          result: "unacknowledged",
          reason: recoveryWriteMatches ? "owner-or-trip-scope-changed" : "recovery-write-changed",
          buildWriteId,
          currentWriteId: currentHandle?.writeId ?? null,
        });
        return null;
      }
      if (saved.id !== recovery.handle.tripId || saved.ownerId !== requestOwnerId) {
        setCloudSaveError("The cloud returned a different trip document. This device copy remains preserved and was not acknowledged.");
        setSaveState("error");
        return null;
      }
      const cached = cacheCanonicalTrip(saved, recovery.handle);
      const remainingRecovery = loadTripRecovery(saved.id, recovery.handle.ownerId);
      traceStagingTripSync("canonical-cache-result", {
        buildWriteId,
        cached: cached.stored,
        recoveryResolved: cached.recoveryResolved,
        remainingWriteId: remainingRecovery?.writeId ?? null,
      });
      if (!cached.stored || remainingRecovery) {
        recoveryHandleRef.current = null;
        setDeviceRecoveryBlocked(Boolean(remainingRecovery));
        setDeviceStorageBlocked(!cached.stored);
        setCloudSaveError(remainingRecovery
          ? "A newer device edit was preserved while this version finished syncing. Open the device copy before continuing."
          : "The cloud save completed, but this browser could not keep its offline copy. Keep this tab open and try again.");
        setSaveState("error");
        return null;
      }
      recoveryHandleRef.current = null;
      setTripOwnerId(saved.ownerId);
      setTripStatus(saved.status);
      setTripUpdatedAt(saved.updatedAt);
      setCloudAuthInterrupted(false);
      setDeviceRecoveryBlocked(false);
      setDeviceStorageBlocked(false);
      setSaveState("cloud");
      traceStagingTripSync("persistence-finished", {
        result: "saved",
        reason: "canonical-acknowledged",
        buildWriteId,
        currentWriteId: null,
        putRevision: saved.updatedAt,
      });
      trackEvent("trip_saved", {
        trip_source: analyticsTripSource,
        trip_id: saved.id,
        save_state: "cloud",
        stop_count: saved.stops.length,
        is_authenticated: true,
      });
      return saved;
    } catch (error) {
      traceStagingTripSync("persistence-finished", {
        result: "error",
        reason: error instanceof Error ? error.message : "unknown-error",
        buildWriteId,
        currentWriteId: recoveryHandleRef.current?.writeId ?? null,
        errorType: classifyAnalyticsSaveError(error),
      });
      const conflictTrip = error instanceof EasyTTripSaveConflictError || error instanceof EasyTTripPromotionConflictError
        ? error.canonicalTrip
        : null;
      const authInterrupted = error instanceof EasyTTripAuthError;
      if (recovery.stored) markTripRecoveryState(recovery.handle, authInterrupted ? "auth" : conflictTrip ? "conflict" : "network");
      const responseOwnerId = recovery.handle.ownerId;
      const currentHandle = recoveryHandleRef.current;
      if (activeBrowserOwnerIdRef.current !== responseOwnerId
        || hydratedOwnerScopeRef.current !== responseOwnerId
        || currentHandle?.ownerId !== responseOwnerId
        || currentHandle.tripId !== recovery.handle.tripId) return null;
      if (conflictTrip) setCloudConflictTrip(conflictTrip);
      setCloudAuthInterrupted(authInterrupted);
      setCloudSaveError(authInterrupted
        ? "Your session expired. This trip is still saved on this device; sign in again to sync it."
        : conflictTrip
        ? "This trip changed on another device. Your edits remain on this device until you open the cloud copy."
        : "Couldn’t sync this trip. It is still saved on this device; try again when your connection recovers.");
      setSaveState("error");
      trackEvent("trip_save_failed", {
        trip_source: analyticsTripSource,
        trip_id: requestTrip.id,
        save_state: session?.user ? "cloud" : "local",
        error_type: classifyAnalyticsSaveError(error),
        is_authenticated: Boolean(session?.user),
      });
      return null;
    }
  };

  const settleUnacknowledgedBuild = () => {
    // A stale response, interrupted account scope, or failed save must never
    // leave the primary action looking active after it has stopped. The local
    // recovery document has already been written before cloud persistence.
    setOpeningTrip(false);
    setSaveState("error");
    setCloudSaveError((current) => current || "Couldn’t sync this trip. It is still saved on this device; try again when your connection recovers.");
  };

  const openBuiltTrip = () => {
    if (!buildInvariant.canBuildTrip) {
      surfaceBuildConflict();
      return;
    }
    setOpeningTrip(true);
    acceptCurrentRoute("continue");
    // Route acceptance and the draft -> planned transition are durable edits.
    // Persist from the resulting render so Build recovery, delayed autosave
    // and the cloud request all refer to one document and one write ID.
    setTripStatus("planned");
    setBuildRequested(true);
  };

  const buildTrip = () => {
    if (!buildInvariant.canBuildTrip) {
      surfaceBuildConflict();
      return;
    }
    setOpeningTrip(true);
    if ((!arrivedFromHomepage || sourceRouteKey) && !generationStartedRef.current) {
      generationStartedRef.current = true;
      trackEvent("trip_generation_started", {
        trip_source: analyticsTripSource,
        has_dates: Boolean(startDate && endDate),
        traveller_count: effectiveIntent.travellers,
        is_authenticated: Boolean(session?.user),
      });
    }
    // The traveller has supplied the facts; apply a materially cleaner route
    // before opening the editable trip, unless they already protected an order.
    if (routeRecommendationVisible && decisionSelections.routeOrder !== "entered" && !scheduleLocks.stopIds.length && !Object.keys(scheduleLocks.arrivalDates).length) {
      applyRecommendedOrder();
      setTripStatus("planned");
      setBuildRequested(true);
      return;
    }
    openBuiltTrip();
  };

  useEffect(() => {
    if (!buildRequested) return;
    setBuildRequested(false);
    if (!buildInvariant.canBuildTrip) {
      surfaceBuildConflict();
      return;
    }
    void (async () => {
      const saved = await persistGeneratedTrip();
      const resultOwnerId = saved?.ownerId ?? hydratedOwnerScopeRef.current ?? null;
      if (saved
        && canUseHydratedTripScope(hydratedOwnerScopeRef.current, activeBrowserOwnerIdRef.current)
        && resultOwnerId === activeBrowserOwnerIdRef.current) {
        window.location.assign(!saved.ownerId ? `/journey/plan?trip=${encodeURIComponent(saved.id)}` : !session?.user ? tripSyncSignInPath(saved.id) : firstTripWorkspaceHref(saved.id));
      } else settleUnacknowledgedBuild();
    })();
  }, [buildRequested, activeTripDocument, buildInvariant.canBuildTrip]);

  useEffect(() => {
    if (!hydrated || step !== 1 || buildInvariant.canAdvanceToTime) return;
    setStep(0);
  }, [buildInvariant.canAdvanceToTime, hydrated, step]);

  /* ------------------------------------------------------------ draft view */

  const ownerScopeMismatch = hydrated && (
    !canUseHydratedTripScope(hydratedOwnerScopeRef.current, activeBrowserOwnerId)
    || Boolean(tripOwnerId && tripOwnerId !== activeBrowserOwnerId)
  );
  const syncAction = tripEditorSyncAction({
    hasCloudConflict: Boolean(cloudConflictTrip),
    hasDeviceRecoveryIssue: deviceRecoveryBlocked,
    authInterrupted: cloudAuthInterrupted,
  });
  if (!hydrated || ownerScopeMismatch) {
    return <div className={`${styles.shellWide} ${mobilePolish.builder}`} aria-busy="true"><div className={styles.locationResolution} role="status">Checking the current account before opening this trip…</div></div>;
  }
  if (tripUnavailable) {
    return <div className={`${styles.shellWide} ${mobilePolish.builder}`}><aside className={styles.cloudSaveError} role="alert"><span>This trip is not available to the current browser account. Its original device copy remains preserved in its owner scope.</span></aside></div>;
  }

  if (generated && buildInvariant.canBuildTrip) {
    return (
      <TripItineraryWorkspace
        trip={activeTripDocument}
        presentation="legacy"
        language={language}
        selectedPlaceCount={selected.length}
        onEditBrief={() => { setGenerated(false); setStep(1); }}
        onOpenMap={() => {
          void (async () => {
            const saved = await persistGeneratedTrip();
            const resultOwnerId = saved?.ownerId ?? hydratedOwnerScopeRef.current ?? null;
            if (saved
              && canUseHydratedTripScope(hydratedOwnerScopeRef.current, activeBrowserOwnerIdRef.current)
              && resultOwnerId === activeBrowserOwnerIdRef.current) {
              window.location.assign(saved.ownerId && !session?.user ? tripSyncSignInPath(saved.id) : `/journey/plan?trip=${encodeURIComponent(saved.id)}`);
            } else settleUnacknowledgedBuild();
          })();
        }}
      />
    );
  }

  /* ---------------------------------------------------------- brief wizard */

  return (
    <div className={`${styles.shellWide} ${mobilePolish.builder}`}>
      {resolvingLocations ? <div className={styles.locationResolution} role="status">Checking your places…</div> : null}
      {locationChoices.length ? <div className={styles.locationOverlay} role="presentation"><section ref={locationDialogRef} tabIndex={-1} className={styles.locationDialog} role="dialog" aria-modal="true" aria-labelledby="location-dialog-title" aria-describedby="location-dialog-description"><p>ONE QUICK CHECK</p><h2 id="location-dialog-title">Which place did you mean?</h2><span id="location-dialog-description">We only ask when a place name could point to more than one location.</span>{locationChoices.map(({ mention, choices }) => <div className={styles.locationQuestion} key={mention.mentionId}><strong>{mention.sourceText}</strong><div>{choices.map((choice) => <button type="button" key={`${choice.name}-${choice.country}`} onClick={() => { if (isOriginMention(mention)) { setOrigin(choice.name); setOriginCoordinates(choice.coordinates); } else setStops((current) => [...current, { id: `${choice.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${mention.order}`, name: choice.name, country: choice.country, countryCode: choice.countryCode, region: choice.region, providerId: choice.providerId, coordinates: choice.coordinates, intent: "place", locality: choice.locality }]); setLocationChoices((current) => current.filter((item) => item.mention !== mention)); }}>{choice.name}, {choice.country}</button>)}</div></div>)}<button type="button" className={styles.locationSkip} onClick={() => setLocationChoices([])}>I’ll add these myself</button></section></div> : null}
      <nav className={styles.steps} aria-label="Trip brief progress">
        {stepLabels.map((label, i) => {
          return (
          <button type="button" key={label} onClick={() => {
            if (i === 0) { setStep(0); return; }
            if (!buildInvariant.canAdvanceToTime) { surfaceBuildConflict(); return; }
            void validateOrigin().then((valid) => { if (valid) setStep(1); });
          }} aria-current={i === step ? "step" : undefined}
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
              <header className={styles.stepHero}>
                <p>{language === "es" ? "PASO 1 DE 2" : "STEP 1 OF 2"}</p>
                <h1>{language === "es" ? "Cuéntanos la forma" : "Tell us the shape"}</h1>
                <span>{language === "es" ? "Comprueba lo que entendimos y completa cualquier detalle." : "Check what we understood and fill any gaps."}</span>
              </header>
              {!hasPromptContext && hydrated && <div className={`${styles.card} ${styles.tripBriefCard}`}>
                <span className={styles.cardLabel}><Sparkles /> {ui.tripBriefLabel}</span>
                <h2>{language === "es" ? "Cuéntanos sobre tu viaje." : "Tell us about your trip."}</h2>
                <p>{language === "es" ? "Escríbelo como se lo contarías a un compañero de viaje. Extraeremos lo que importa." : "Write it as you would tell a travel companion. We’ll pull out what matters."}</p>
                <div className={styles.tripBriefInput}>
                  <textarea className={styles.tripBriefTextarea} aria-label={ui.tripBriefLabel} value={tripBrief} maxLength={600} onChange={(event) => setTripBrief(event.target.value)} placeholder={language === "es" ? "Estoy pensando en Japón y Corea del Sur durante unas dos semanas. Tokio y los Alpes japoneses, después Seúl y Busan. Nos gusta comer bien y pasar tiempo al aire libre." : "Thinking Japan and South Korea for about two weeks. Tokyo and the Japanese Alps, then Seoul and Busan. We like good food and some time outdoors."} />
                  <VoiceTripBrief className={styles.voiceInput} language={language} onTranscript={(transcript) => setTripBrief((current) => appendVoiceTranscript(current, transcript))} />
                </div>
                <button type="button" className={styles.ghost} onClick={() => void applyTripBrief()} disabled={!tripBrief.trim()}>{language === "es" ? "Continuar" : "Continue"}</button>
                <small className={styles.hint}>{language === "es" ? "Puedes ajustar todo lo que extraigamos." : "You can adjust anything we extract."}</small>
              </div>}
              {hasSavedTravelProfile && !arrivedFromHomepage && <section className={styles.travelStyle} aria-label={language === "es" ? "Tu estilo de viaje" : "Your travel style"}>
                <div className={styles.travelStyleHead}><span>{language === "es" ? "TU ESTILO DE VIAJE" : "YOUR TRAVEL STYLE"}</span><a href="/journey/profile">{language === "es" ? "Editar" : "Edit"}</a></div>
                <div className={styles.travelStyleChips}>{travelStyleLabels(travelProfile, language).map((label) => <span key={label}>{label}</span>)}</div>
              </section>}
              {hasPromptContext && <section className={styles.tripUnderstood} aria-label={language === "es" ? "Viaje entendido" : "Trip understood"}>
                <header className={styles.tripUnderstoodHead}>
                  <span><Sparkles /> {language === "es" ? "VIAJE ENTENDIDO" : "TRIP UNDERSTOOD"}</span>
                  <h2>{language === "es" ? "Comprueba lo que entendimos." : "Check what we understood."}</h2>
                </header>
                <section id="builder-origin" className={`${styles.placesSection} ${summaryFocus === "origin" ? styles.summaryEditorOn : ""} ${originMissing ? styles.cardError : ""}`}>
                  <div className={styles.placesSectionHead}><strong>{language === "es" ? "Salida" : "Starting from"}</strong><button type="button" onClick={() => openSummaryEditor("origin")}><Pencil /> {language === "es" ? "Editar" : "Edit"}</button></div>
                  {origin ? <span className={styles.originChip}><MapPin />{origin}</span> : <p className={styles.missingPlace}>{resolvingLocations ? (language === "es" ? "Comprobando…" : "Checking…") : (language === "es" ? "Añade tu salida" : "Add your departure")}</p>}
                  {(showOriginEditor || originMissing) && <label className={styles.inlineEditor}><span className="sr-only">{copy.startFrom}</span><input value={origin} placeholder={copy.cityAirport} aria-label={copy.startFrom}
                    onChange={(e) => { setOrigin(e.target.value); setOriginTouched(true); setOriginCoordinates(undefined); setOriginError(""); }}
                    onBlur={() => { if (origin.trim() && !originCoordinates) void validateOrigin(); }} />
                    <button type="button" onClick={() => setShowOriginEditor(false)}>{language === "es" ? "Listo" : "Done"}</button></label>}
                  {(originError || originMissing) && <small className={styles.hintError}>{originError || ui.addOrigin}</small>}
                </section>

                <section id="builder-stops" className={`${styles.placesSection} ${summaryFocus === "stops" ? styles.summaryEditorOn : ""} ${stopError ? styles.cardError : ""}`}>
                  <div className={styles.placesSectionHead}><strong>{language === "es" ? "Paradas" : "Stops"}</strong><button type="button" onClick={() => openSummaryEditor("stops")}><Plus /> {language === "es" ? "Añadir parada" : "Add stop"}</button></div>
                  {stops.length > 0 && <div className={styles.confirmedStops} aria-label={language === "es" ? "Paradas confirmadas" : "Confirmed stops"}>
                    <div>{stops.map((stop, index) => <button type="button" key={stop.id} aria-label={scheduleLocks.stopIds.includes(stop.id) ? `${stop.name}, ${language === "es" ? "parada bloqueada" : "locked stop"}` : `${language === "es" ? "Quitar" : "Remove"} ${stop.name}`} disabled={scheduleLocks.stopIds.includes(stop.id)} onClick={() => removeStop(stop.id)}>{index + 1}. {stop.name} {scheduleLocks.stopIds.includes(stop.id) ? <Lock aria-hidden="true" /> : <X aria-hidden="true" />}</button>)}</div>
                  </div>}
                  {(showStopEditor || !stops.length) && <div className={styles.stopEditor}>{resolvingPlaceMentionId ? <small className={styles.baseSelectionContext}>{language === "es" ? "Añade una base para" : "Add a base for"} {activePlaceMentions.find((mention) => mention.mentionId === resolvingPlaceMentionId)?.sourceText}</small> : null}<label className={styles.inlineEditor}><span className="sr-only">{copy.addDestination}</span><input value={stopInput} placeholder={copy.destinationPlaceholder} aria-label={copy.addDestination}
                    onChange={(e) => { setStopInput(e.target.value); setStopError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStop(); } }} />
                    <button type="button" onClick={() => { setShowStopEditor(false); setResolvingPlaceMentionId(null); setStopInput(""); setStopError(""); }}>{language === "es" ? "Cancelar" : "Cancel"}</button></label>
                    {stopError && <small className={styles.hintError}>{stopError}</small>}
                    {!stopInput.trim() && contextualSuggestions.length > 0 && <div className={styles.suggestions}>{contextualSuggestions.map((name) => <button type="button" key={name} onClick={() => addStop(name)}><Plus /> {name}</button>)}</div>}
                  </div>}
                </section>

                {activePlaceMentions.length > 0 && <section className={styles.recognizedPlaces} aria-label={language === "es" ? "Geografía entendida" : "Geography understood"}>
                  <header><strong>{language === "es" ? "GEOGRAFÍA ENTENDIDA" : "GEOGRAPHY WE UNDERSTOOD"}</strong><span>{language === "es" ? "Las regiones se conservan hasta que elijas una base." : "Regions stay in your brief until you choose a base."}</span></header>
                  <div>{activePlaceMentions.map((mention) => {
                    const issue = placeIssues.find((item) => item.mentionId === mention.mentionId && item.code !== "missing_routable_destination" && item.code !== "duplicate_alias");
                    const selection = placeSelections.find((item) => item.mentionId === mention.mentionId);
                    return <article key={mention.mentionId} className={issue?.blocksRoute ? styles.recognizedPlaceNeedsAction : ""}>
                      <div className={styles.recognizedPlaceIdentity}><span><b>{mention.sourceText}</b><small>{placeTypeLabel(mention.placeType)} · {placeStateLabel(mention, Boolean(selection))}</small></span>{selection ? <em>{selection.selectedName}</em> : null}</div>
                      {mention.sourceTexts.length > 1 ? <p>{language === "es" ? "También mencionado como" : "Also mentioned as"}: {mention.sourceTexts.slice(1).join(", ")}</p> : null}
                      {issue ? <p>{issue.message}</p> : null}
                      {issue?.options.length ? <div className={styles.placeResolutionOptions}>{issue.options.map((option) => <button type="button" key={`${issue.mentionId}-${option.canonicalPlaceId}`} onClick={() => option.kind === "candidate" ? void choosePlaceIdentity(mention, option.canonicalPlaceId) : addSupportedBase(issue, option)}><Plus />{option.label}{option.country ? ` · ${option.country}` : ""}</button>)}</div> : null}
                      {issue && issue.code !== "conflicting_place_roles" ? <button type="button" className={styles.placeResolutionManual} onClick={() => { setResolvingPlaceMentionId(mention.mentionId); setStopInput(""); openSummaryEditor("stops"); }}>{issue.code === "ambiguous_place" ? (language === "es" ? "Añadirlo manualmente" : "I’ll add it myself") : issue.code === "unresolved_place" ? (language === "es" ? "Sustituir por un lugar" : "Replace with a place") : selection ? (language === "es" ? "Añadir otra base" : "Add another base") : (language === "es" ? "Elegir una base" : "Choose a base")}</button> : null}
                    </article>;
                  })}</div>
                </section>}

                {pickedUpPreferences.length > 0 && <section className={styles.pickedPreferences} aria-label={language === "es" ? "Preferencias recogidas" : "Preferences picked up"}><strong>{language === "es" ? "PREFERENCIAS RECOGIDAS" : "PREFERENCES WE PICKED UP"}</strong><div>{pickedUpPreferences.map((preference) => <span key={preference}>{preference}</span>)}</div></section>}

              <section id="builder-constraints" className={`${styles.intentPanel} ${summaryFocus === "constraints" ? styles.summaryEditorOn : ""}`} aria-label={language === "es" ? "Intención y condiciones del viaje" : "Trip intent and constraints"}>
                <button type="button" className={styles.detailsToggle} aria-expanded={showTripDetails} onClick={() => setShowTripDetails((current) => !current)}>{showTripDetails ? (language === "es" ? "Ocultar planes fijos" : "Hide fixed plans") : (effectiveIntent.hardConstraints.fixedCommitments.length ? (language === "es" ? "Planes fijos" : "Fixed plans") : (language === "es" ? "Planes fijos · Añade algo que no pueda moverse" : "Fixed plans · Add something that can’t move"))}</button>
                {showTripDetails && <>
                <header><p>{language === "es" ? "YA RESERVADO" : "ALREADY BOOKED"}</p><h3>{language === "es" ? "Mantén visible lo que no puede cambiar." : "Keep what cannot move visible."}</h3><span>{language === "es" ? "Añade una fecha o reserva fija y la protegeremos mientras se construye la ruta." : "Add a fixed date or booking and we’ll protect it while we build the route."}</span></header>
                <div className={styles.intentGrid}>
                  <section className={styles.intentHard}>
                    <p>{language === "es" ? "DEBE MANTENERSE" : "MUST KEEP"}</p>
                    <div className={styles.intentFacts}>
                      <span>{language === "es" ? "Salida" : "Origin"}<b>{origin || (language === "es" ? "Añadir" : "Add")}</b></span>
                      <span>{language === "es" ? "Ruta" : "Route"}<b>{stops.length ? `${stops.length} ${language === "es" ? "paradas" : "stops"}` : (language === "es" ? "Añadir" : "Add")}</b></span>
                      <span>{language === "es" ? "Fechas" : "Timing"}<b>{effectiveIntent.timing.flexibility === "fixed" ? (language === "es" ? "Fijas" : "Fixed") : (language === "es" ? "Flexible" : "Flexible")}</b></span>
                    </div>
                    {stops.length > 0 && <div className={styles.mustSeeStops}><span>{language === "es" ? "PARADAS IMPRESCINDIBLES" : "MUST-SEE STOPS"}</span><div>{stops.map((stop) => {
                      const mustSee = !effectiveIntent.hardConstraints.optionalStopIds.includes(stop.id);
                      return <button type="button" key={stop.id} className={mustSee ? styles.intentChoiceOn : ""} onClick={() => setTripIntent((current) => ({ ...current, hardConstraints: { ...current.hardConstraints, optionalStopIds: mustSee ? [...current.hardConstraints.optionalStopIds, stop.id] : current.hardConstraints.optionalStopIds.filter((id) => id !== stop.id) } }))}>{mustSee ? "✓ " : ""}{stop.name}{mustSee ? "" : ` · ${language === "es" ? "opcional" : "optional"}`}</button>;
                    })}</div></div>}
                    <div className={styles.intentToggle} role="group" aria-label={language === "es" ? "Flexibilidad de fechas" : "Date flexibility"}>
                      <button type="button" className={effectiveIntent.timing.flexibility === "fixed" ? styles.intentChoiceOn : ""} onClick={() => setTripIntent((current) => ({ ...current, timing: { ...current.timing, flexibility: "fixed" } }))}>{language === "es" ? "Fechas fijas" : "Dates fixed"}</button>
                      <button type="button" className={effectiveIntent.timing.flexibility === "flexible" ? styles.intentChoiceOn : ""} onClick={() => setTripIntent((current) => ({ ...current, timing: { ...current.timing, flexibility: "flexible" } }))}>{language === "es" ? "Duración flexible" : "Flexible duration"}</button>
                    </div>
                    <div className={styles.fixedCommitment}>
                      <label><span>{language === "es" ? "FECHA O RESERVA FIJA" : "FIXED DATE OR BOOKING"}</span><input value={fixedCommitmentLabel} onChange={(event) => setFixedCommitmentLabel(event.target.value)} placeholder={language === "es" ? "Ej. boda en Kioto" : "e.g. wedding in Kyoto"} /></label>
                      <input type="date" value={fixedCommitmentDate} onChange={(event) => setFixedCommitmentDate(event.target.value)} aria-label={language === "es" ? "Fecha fija" : "Fixed date"} />
                      <button type="button" onClick={addFixedCommitment} disabled={!fixedCommitmentLabel.trim()}><Plus />{language === "es" ? "Añadir" : "Add"}</button>
                    </div>
                  </section>
                  <section className={styles.intentPreferences}>
                    <p>{language === "es" ? "PREFERENCIAS" : "PREFERENCES"}</p>
                    <div className={styles.intentFieldRow}>
                      <label><span>{language === "es" ? "VIAJEROS" : "TRAVELLERS"}</span><input type="number" min="1" max="12" value={effectiveIntent.travellers} onChange={(event) => { setTravellersManuallyEdited(true); setTripIntent((current) => ({ ...current, travellers: Math.max(1, Math.min(12, Number(event.target.value) || 1)) })); }} /></label>
                      <div><span>{language === "es" ? "RITMO" : "PACE"}</span><div className={styles.intentToggle}>{(["relaxed", "balanced", "packed"] as TripIntentPace[]).map((pace) => <button type="button" key={pace} className={effectiveIntent.preferences.pace === pace ? styles.intentChoiceOn : ""} onClick={() => updateIntentPreferences({ pace })}>{language === "es" ? ({ relaxed: "Tranquilo", balanced: "Equilibrado", packed: "Intenso" }[pace]) : ({ relaxed: "Relaxed", balanced: "Balanced", packed: "Packed" }[pace])}</button>)}</div></div>
                    </div>
                    <div className={styles.intentFieldRow}>
                      <div><span>{language === "es" ? "TRANSPORTE" : "TRANSPORT"}</span><div className={styles.intentToggle}>{(["flight", "train", "drive"] as TripTransportMode[]).map((mode) => <button type="button" key={mode} className={effectiveIntent.preferences.transportModes.includes(mode) ? styles.intentChoiceOn : ""} onClick={() => toggleTransportMode(mode)}>{language === "es" ? ({ flight: "Volar", train: "Tren", drive: "Coche" }[mode]) : ({ flight: "Fly", train: "Train", drive: "Drive" }[mode])}</button>)}<button type="button" className={effectiveIntent.hardConstraints.avoidDriving ? styles.intentChoiceOn : ""} onClick={() => setTripIntent((current) => ({ ...current, hardConstraints: { ...current.hardConstraints, avoidDriving: !current.hardConstraints.avoidDriving } }))}>{language === "es" ? "Evitar coche" : "Avoid driving"}</button></div></div>
                      <div><span>{language === "es" ? "PRESUPUESTO" : "BUDGET"}</span><div className={styles.intentToggle}>{(["value", "mid", "high"] as const).map((band) => <button type="button" key={band} className={budget === band ? styles.intentChoiceOn : ""} onClick={() => { setBudget(band); updateIntentPreferences({ budgetSensitivity: band }); }}>{language === "es" ? ({ value: "Ajustado", mid: "Medio", high: "Alto" }[band]) : ({ value: "Value", mid: "Mid", high: "High" }[band])}</button>)}</div></div>
                    </div>
                    <div className={styles.intentInterestRow}><span>{language === "es" ? "INTERESES" : "INTERESTS"}</span><div>{["Food", "Culture", "Nature", "Cities", "Beach", "Hiking"].map((interest) => <button type="button" key={interest} className={effectiveIntent.preferences.interests.includes(interest.toLowerCase()) ? styles.intentChoiceOn : ""} onClick={() => toggleInterest(interest.toLowerCase())}>{language === "es" ? ({ Food: "Comida", Culture: "Cultura", Nature: "Naturaleza", Cities: "Ciudades", Beach: "Playa", Hiking: "Senderismo" }[interest]) : interest}</button>)}</div></div>
                    <label className={styles.dislikesField}><span>{language === "es" ? "EVITAR (OPCIONAL)" : "AVOID (OPTIONAL)"}</span><input value={effectiveIntent.preferences.dislikes.join(", ")} onChange={(event) => updateIntentPreferences({ dislikes: event.target.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 6) })} placeholder={language === "es" ? "Ej. traslados nocturnos, calor extremo" : "e.g. overnight transfers, extreme heat"} /></label>
                  </section>
                </div>
                <footer className={styles.intentSummary}><span>{language === "es" ? "RESUMEN ANTES DE PLANIFICAR" : "PLAN SUMMARY"}</span><p><b>{effectiveIntent.travellers} {language === "es" ? "viajeros" : "travellers"}</b> · {effectiveIntent.timing.flexibility === "fixed" ? (language === "es" ? "fechas fijas" : "fixed dates") : (language === "es" ? `${totalDays} días flexibles` : `${totalDays} flexible days`)} · <b>{stops.map((stop) => stop.name).join(" · ") || (language === "es" ? "sin paradas aún" : "no stops yet")}</b>{effectiveIntent.hardConstraints.fixedCommitments.length ? ` · ${effectiveIntent.hardConstraints.fixedCommitments.length} ${language === "es" ? "condición fija" : "fixed commitment"}${effectiveIntent.hardConstraints.fixedCommitments.length === 1 ? "" : "s"}` : ""}</p></footer>
                </>}
                {effectiveIntent.hardConstraints.fixedCommitments.length > 0 && <div className={styles.commitmentChips}>{effectiveIntent.hardConstraints.fixedCommitments.map((item) => <span key={item.id}>{item.date ? `${item.date} · ` : ""}{item.label}<button type="button" aria-label={`${language === "es" ? "Quitar" : "Remove"} ${item.label}`} onClick={() => setTripIntent((current) => ({ ...current, hardConstraints: { ...current.hardConstraints, fixedCommitments: current.hardConstraints.fixedCommitments.filter((commitment) => commitment.id !== item.id) } }))}><X /></button></span>)}</div>}
              </section>
              </section>}

              {routeIntelligence.route.state !== "insufficient-data" && stops.length > 1 && <section className={styles.routeCheck} aria-live="polite">
                <div>
                  {currentCuratedRoute && <p>{currentCuratedRoute.coverage.state === "fully-supported" ? "REVIEWED ROUTE FACTS" : "ROUTE COVERAGE CHANGED"}</p>}
                  {currentCuratedRoute && <span>{currentCuratedRoute.coverage.reason} Reviewed {currentCuratedRoute.reviewedAt}; transfer schedules still need confirmation where noted.</span>}
                  <p>{routeCopy.eyebrow}</p>
                  {routeRecommendationVisible ? <>
                    <h3>{routeIntelligence.route.recommendedStopIds.map((id) => stops.find((stop) => stop.id === id)?.name).filter(Boolean).join(" → ")} {routeCopy.cleanerOrder}</h3>
                    <span>{routeCopy.removesTravel(routeIntelligence.route.improvementMinutes ?? 0)} {routeCopy.direction}</span>
                  </> : <>
                    <h3>{effectiveIntent.hardConstraints.fixedCommitments.length ? (language === "es" ? "Tus condiciones fijas están protegidas." : "Your fixed commitments are protected.") : routeCopy.currentOrder}</h3>
                    <span>{effectiveIntent.hardConstraints.fixedCommitments.length ? (language === "es" ? "Confirma dónde encaja cada condición antes de cambiar el orden." : "Confirm where each commitment sits before changing the order.") : (language === "es" ? "Puedes cambiar el orden en la ruta de la derecha cuando quieras." : "You can still change the order in the route on the right whenever you like.")}</span>
                  </>}
                  {routeIntelligence.route.tradeoffs[0] && !effectiveIntent.hardConstraints.fixedCommitments.length && <span className={styles.routeTradeoff}>{effectiveIntent.hardConstraints.avoidDriving ? (language === "es" ? "Evitar coche está activo: compara tren o vuelo para los traslados locales antes de reservar." : "Avoid driving is active: compare rail or flight for local transfers before booking.") : (language === "es" ? "Esta ruta puede necesitar un tipo de transporte fuera de tus preferencias. Compáralo antes de reservar." : routeIntelligence.route.tradeoffs[0])}</span>}
                  {routeRecommendationVisible && <div className={styles.decisionAlternatives}>
                    <article className={decisionSelections.routeOrder === "recommended" ? styles.decisionSelected : ""}><div><b>{language === "es" ? "RECOMENDADO" : "MORROVIA RECOMMENDS"}</b><strong>{language === "es" ? "Ruta más directa" : "More direct route"}</strong></div><span>{routeIntelligence.route.recommendedStopIds.map((id) => stops.find((stop) => stop.id === id)?.name).filter(Boolean).join(" → ")}</span><small>{routeCopy.removesTravel(routeIntelligence.route.improvementMinutes ?? 0)} {language === "es" ? "Es una estimación de planificación, no un horario en vivo." : "This is a planning estimate, not a live timetable."}</small></article>
                    <article className={decisionSelections.routeOrder === "entered" ? styles.decisionSelected : ""}><div><b>{language === "es" ? "TU ORDEN" : "YOUR ORDER"}</b><strong>{language === "es" ? "Mantener la intención" : "Keep your intended sequence"}</strong></div><span>{stops.map((stop) => stop.name).join(" → ")}</span><small>{language === "es" ? "Conserva el orden que elegiste, con más tiempo de traslado estimado." : "Preserves the order you chose, with more estimated transfer time."}</small></article>
                  </div>}
                </div>
                {routeRecommendationVisible && <div className={styles.routeCheckActions}>
                  <button type="button" className={styles.primary} onClick={applyRecommendedOrder}>{routeCopy.useOrder}</button>
                  <button type="button" className={styles.ghost} onClick={() => { setKeptRouteKey(routeKey); acceptCurrentRoute("keep_order"); }}>{routeCopy.keepOrder}</button>
                </div>}
              </section>}

            </div>
          )}

          {step === 2 && (
            <div className={styles.routeStep}>
              <header className={styles.stepHero}><p>STEP 3 OF 3</p><h2>{language === "es" ? "Una ruta que tiene sentido." : "A route that makes sense."}</h2><span>{language === "es" ? "Hemos comprobado el orden y mostraremos una alternativa más directa cuando la haya. Tú decides si aplicarla." : "We’ve checked the order and will show a cleaner alternative when there is one. You choose whether to apply it."}</span></header>
              <section className={styles.routeSequence} aria-label={language === "es" ? "Ruta recomendada" : "Recommended route"}>
                {stops.map((stop, index) => {
                  const duration = routeIntelligence.durations[stop.id];
                  let routeOffset = 0;
                  for (const priorStop of stops) { if (priorStop.id === stop.id) break; routeOffset += routeAllocation[priorStop.id] ?? 0; }
                  const routeArrivalDate = new Date(`${startDate}T00:00:00`);
                  routeArrivalDate.setDate(routeArrivalDate.getDate() + routeOffset);
                  const arrival = iso(routeArrivalDate);
                  const departure = new Date(`${arrival}T00:00:00`);
                  departure.setDate(departure.getDate() + (routeAllocation[stop.id] ?? 0));
                  const next = stops[index + 1];
                  const leg = next ? estimateLegForConstraints(stop, next, structuredRouteConstraints) : null;
                  const durationReason = duration?.reason || (language === "es" ? "Tiempo suficiente para instalarte y disfrutar del lugar." : "Enough time to settle in and experience the place." );
                  return <div className={styles.routeSequenceGroup} key={stop.id}>
                    <article className={styles.routeStopCard}>
                      <span className={styles.routeNumber}>{index + 1}</span>
                      <div className={styles.routeStopPlace}><small>{(stop.country || "verified stop").toUpperCase()}</small><h3>{stop.name}</h3></div>
                      <div className={styles.routeStopTiming}><strong><Clock /> {editingRouteStopId === stop.id ? <input aria-label={`Nights in ${stop.name}`} type="number" min="0" max={totalNights} value={routeAllocation[stop.id] ?? 0} disabled={scheduleLocks.stopIds.includes(stop.id) || Boolean(scheduleLocks.arrivalDates[stop.id])} onChange={(event) => updateRouteNightDraft(stop.id, Number(event.target.value))} /> : <>{routeAllocation[stop.id] ?? 0} {(routeAllocation[stop.id] ?? 0) === 1 ? "night" : "nights"}</>}</strong><span><CalendarDays /> {fmtLong(arrival)} – {fmtLong(iso(departure))}</span></div>
                      <p>{durationReason}</p>
                      <div className={styles.routeStopActions}>{editingRouteStopId === stop.id ? <><span className={styles.routeReorderLabel}><GripVertical /> {language === "es" ? "REORDENAR" : "REORDER"}</span><div className={styles.routeEditorButtons}><button type="button" aria-label={`Move ${stop.name} up`} onClick={() => moveStop(index, index - 1)} disabled={index === 0}><ArrowUp /></button><button type="button" aria-label={`Move ${stop.name} down`} onClick={() => moveStop(index, index + 1)} disabled={index === stops.length - 1}><ArrowDown /></button><button type="button" onClick={() => removeStop(stop.id)} disabled={scheduleLocks.stopIds.includes(stop.id)}><Trash2 /> {language === "es" ? "Quitar" : "Remove"}</button></div><button type="button" onClick={() => setEditingRouteStopId(null)}><Check /> {language === "es" ? "Listo" : "Done"}</button></> : <button type="button" onClick={() => beginRouteEdit(stop.id)} disabled={scheduleLocks.stopIds.includes(stop.id) || Boolean(scheduleLocks.arrivalDates[stop.id])}><Pencil /> {language === "es" ? "Editar" : "Edit"}</button>}</div>
                    </article>
                    {leg && <div className={styles.routeTransfer}><span>{leg.mode === "train" ? <Train aria-label="Train" /> : leg.mode === "flight" ? <Plane aria-label="Flight" /> : "→"}</span><p><b>{leg.mode === "train" ? (language === "es" ? `Tren a ${next.name}` : `Train to ${next.name}`) : leg.mode === "flight" ? (language === "es" ? `Vuelo a ${next.name}` : `Flight to ${next.name}`) : (language === "es" ? `Traslado a ${next.name}` : `Transfer to ${next.name}`)}</b><small>{leg.durationMinutes ? `~${Math.floor(leg.durationMinutes / 60)}h ${leg.durationMinutes % 60}m` : (language === "es" ? "Tiempo por confirmar" : "Time to confirm")}</small></p></div>}
                  </div>;
                })}
                {routeNightDraft && <div className={styles.routeNightsWarning} role="status"><div><b>{routeNightDifference > 0 ? (language === "es" ? `${routeNightDifference} noches superan las fechas actuales.` : `${routeNightDifference} nights exceed the current dates.`) : routeNightDifference < 0 ? (language === "es" ? `${Math.abs(routeNightDifference)} noches siguen sin asignar.` : `${Math.abs(routeNightDifference)} nights are still unassigned.`) : (language === "es" ? "La nueva distribución conserva tus fechas." : "This new night split keeps your dates.")}</b><span>{routeNightDifference > 0 ? (language === "es" ? "Acepta el cambio de duración antes de continuar." : "Accept the trip-length change before continuing.") : routeNightDifference < 0 ? (language === "es" ? "Añádelas a una parada o acepta unas fechas más cortas." : "Add them to a stop or accept shorter dates.") : (language === "es" ? "Aplica esta distribución para actualizar el plan." : "Apply this split to update the plan.")}</span></div><div>{routeNightDifference !== 0 && <button type="button" onClick={rebalanceRouteNightsToDates}>{language === "es" ? "Mantener fechas" : "Keep current dates"}</button>}<button type="button" onClick={routeNightDifference === 0 ? rebalanceRouteNightsToDates : applyRouteNightsToDates}>{routeNightDifference > 0 ? (language === "es" ? "Aceptar nueva duración" : "Accept new trip length") : routeNightDifference < 0 ? (language === "es" ? "Aceptar fechas más cortas" : "Accept shorter dates") : (language === "es" ? "Aplicar noches" : "Apply nights")}</button></div></div>}
                <div className={styles.routeWhy}><Sparkles /><span><b>{language === "es" ? "Por qué este orden:" : "Why this order:"}</b> {routeIntelligence.route.summary || (language === "es" ? "La ruta reduce retrocesos y deja espacio para cada parada." : "This order reduces backtracking and leaves room for every stop.")}</span></div>
                <div className={styles.routeChoiceBar}>
                  <button type="button" className={styles.routeRecommended} onClick={applyRecommendedOrder} disabled={!routeRecommendationVisible}><Sparkles />{routeRecommendationVisible ? (language === "es" ? "Usar el orden recomendado" : "Use Morrovia’s order") : (language === "es" ? "Este orden ya funciona" : "This order already works")}</button>
                  {routeRecommendationVisible && <button type="button" className={styles.routeAlternative} onClick={() => { setKeptRouteKey(routeKey); acceptCurrentRoute("keep_order"); }}>{language === "es" ? "Mantener mi orden" : "Keep my order"}</button>}
                </div>
              </section>
              <section className={styles.routePlacesIntro}><p>{language === "es" ? "LO QUE QUIERES VIVIR" : "WHAT YOU WANT TO EXPERIENCE"}</p><h3>{language === "es" ? "Elige lo que merece tiempo." : "Choose what deserves time."}</h3><span>{language === "es" ? "Tus elecciones ajustan las noches recomendadas en el siguiente paso." : "Your choices shape the night recommendations in the next step."}</span></section>
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

          {step === 1 && (
            <div className={`${styles.stack} ${styles.timeStep}`}>
              <header className={styles.stepHero}><p>STEP 2 OF 2</p><h2>Make the time feel right.</h2><span>Set your dates, then Morrovia balances nights around the travel between stops.</span></header>
              <div className={styles.timeControls}>
                <section id="builder-dates" className={`${styles.dateConfirmSection} ${summaryFocus === "dates" ? styles.summaryEditorOn : ""}`} ref={pickerRef} aria-label={language === "es" ? "Fechas de viaje" : "Travel dates"}>
                  <div className={styles.dateRow}>{([{ key: "start" as const, label: ui.startDate, value: startDate, set: (value: string) => updateTravelDate("start", value) }, { key: "end" as const, label: ui.endDate, value: endDate, set: (value: string) => updateTravelDate("end", value) }]).map((field) => <div key={field.key} className={`${styles.card} ${picker === field.key ? styles.cardOpen : ""}`}><button type="button" className={styles.cardTrigger} aria-expanded={picker === field.key} onClick={() => setPicker(picker === field.key ? null : field.key)}><span className={styles.cardLabel}><CalendarDays /> {field.label}</span><span className={styles.cardValue}><strong>{fmtLong(field.value) || ui.pickDate}</strong><ChevronDown /></span></button>{picker === field.key && <div className={styles.popover}><Calendar language={language} value={field.value} onPick={(value) => { field.set(value); setPicker(null); }} /><label className={styles.typeIt}>{ui.typeIt}<input defaultValue={fmtLong(field.value)} onChange={(event) => { const value = parseTyped(event.target.value); if (value) field.set(value); }} /></label></div>}</div>)}</div>
                </section>
                <label className={styles.timeControl}><span>{language === "es" ? "VIAJEROS" : "TRAVELLERS"}</span><Users /><input type="number" min="1" max="12" value={effectiveIntent.travellers} onChange={(event) => { setTravellersManuallyEdited(true); setTripIntent((current) => ({ ...current, travellers: Math.max(1, Math.min(12, Number(event.target.value) || 1)) })); }} /></label>
                <section className={`${styles.timeControl} ${styles.budgetControl}`} aria-label={language === "es" ? "Presupuesto" : "Budget"}><span>{language === "es" ? "PRESUPUESTO (OPCIONAL)" : "BUDGET (OPTIONAL)"}</span><p>{language === "es" ? "Usando tu preferencia habitual." : "Using your usual preference."}</p><button type="button" onClick={() => setShowBudgetOverride((current) => !current)}>{showBudgetOverride ? (language === "es" ? "Listo" : "Done") : (language === "es" ? "Cambiar para este viaje" : "Change for this trip")}</button>{showBudgetOverride && <div className={styles.budgetChoices}>{(["value", "mid", "high"] as const).map((band) => <button type="button" key={band} className={budget === band ? styles.intentChoiceOn : ""} onClick={() => { setBudget(band); updateIntentPreferences({ budgetSensitivity: band }); }}>{language === "es" ? ({ value: "Ajustado", mid: "Medio", high: "Alto" }[band]) : ({ value: "Value", mid: "Mid", high: "High" }[band])}</button>)}</div>}</section>
                <p className={styles.timeAllocationState}><CalendarDays /> <strong>{totalNights} {language === "es" ? "noches en total" : "nights total"}</strong><span>•</span><b className={allNightsAllocated ? styles.allocationComplete : styles.allocationIncomplete}>{allNightsAllocated ? (language === "es" ? "Todas las noches asignadas" : "All nights allocated") : (language === "es" ? `${allocatedNights} de ${totalNights} noches asignadas` : `${allocatedNights} of ${totalNights} nights allocated`)}</b></p>
              </div>
              <section className={styles.routeTimePlanner} aria-labelledby="day-allocation-title">
                <header><h3 id="day-allocation-title">{language === "es" ? "Planifica tu ruta y tu tiempo" : "Plan your route and time"}</h3><p>{language === "es" ? "Arrastra para reordenar las paradas. El viaje y el tiempo aprovechable se actualizan automáticamente." : "Drag to reorder stops. Travel time and usable time update automatically."}</p></header>
                <div className={styles.routeTimeColumns}><span>STOP</span><span>TRANSFER FROM PREVIOUS</span><span>NIGHTS</span><span>USABLE TIME</span></div>
                <div className={styles.routeTimeRows}>
                  {stops.map((stop, index) => {
                    const days = allocation[stop.id] ?? 0;
                    const duration = routeIntelligence.durations[stop.id];
                    const usableDays = usableStopDays(days, duration?.arrivalLoad ?? "unknown");
                    const compressed = Boolean(duration && (days < duration.minimumDays || usableDays < 1));
                    const leg = index ? estimateLegForConstraints(stops[index - 1], stop, structuredRouteConstraints) : null;
                    const TransferIcon = leg?.mode === "flight" ? Plane : leg?.mode === "train" ? Train : leg?.mode === "ferry" ? Ship : leg?.mode === "road" ? CarFront : AlertTriangle;
                    return <div key={stop.id} draggable className={`${styles.routeTimeRow} ${dragId === stop.id ? styles.routeTimeRowDragging : ""}`} onDragStart={(event) => { setDragId(stop.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", stop.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); moveStop(stops.findIndex((item) => item.id === (dragId ?? event.dataTransfer.getData("text/plain"))), index); setDragId(null); }} onDragEnd={() => setDragId(null)}>
                      <button type="button" className={styles.routeGrip} aria-label={`Move ${stop.name}`}><GripVertical /></button>
                      <div className={styles.routeStopName}><b>{index + 1}</b><span><strong>{stop.name}</strong><small>{stop.country}</small></span></div>
                      <div className={styles.routeTransferSummary}>{leg ? <><TransferIcon /><span><strong>{durationLabel(leg.durationMinutes)}</strong><small>{leg.mode === "road" ? "By road" : leg.mode === "train" ? "By train" : leg.mode === "ferry" ? "By ferry" : leg.mode === "flight" ? "By flight" : "Mode to confirm"}</small></span></> : <span><strong>—</strong><small>Starting point</small></span>}</div>
                      <div className={styles.nightsControl}><button type="button" aria-label={`Remove a night from ${stop.name}`} disabled={days <= 0 || scheduleLocks.stopIds.includes(stop.id) || Boolean(scheduleLocks.arrivalDates[stop.id])} onClick={() => updateAllocatedDays(stop.id, days - 1)}>−</button><strong>{days}</strong><button type="button" aria-label={`Add a night to ${stop.name}`} disabled={days >= totalNights || scheduleLocks.stopIds.includes(stop.id) || Boolean(scheduleLocks.arrivalDates[stop.id])} onClick={() => updateAllocatedDays(stop.id, days + 1)}>+</button><small>nights</small></div>
                      <div className={`${styles.usableTime} ${compressed ? styles.usableTimeWarning : ""}`}><strong>~{usableDays} {usableDays === 1 ? "day" : "days"}</strong>{compressed && <AlertTriangle aria-label="Compressed stop" />}</div>
                      <div className={styles.routeMoveButtons}><button type="button" aria-label={`Move ${stop.name} up`} disabled={index === 0} onClick={() => moveStop(index, index - 1)}><ArrowUp /></button><button type="button" aria-label={`Move ${stop.name} down`} disabled={index === stops.length - 1} onClick={() => moveStop(index, index + 1)}><ArrowDown /></button></div>
                    </div>;
                  })}
                </div>
              </section>
              {routeIntelligence.route.state !== "insufficient-data" && (routeIntelligence.route.reasons.length > 0 || routeIntelligence.route.summary) ? <section className={styles.routeExplanation} aria-labelledby="route-explanation-title">
                <Sparkles aria-hidden="true" />
                <div>
                  <h3 id="route-explanation-title">{language === "es" ? "Por qué este orden" : "Why this order"}</h3>
                  <p>{routeIntelligence.route.summary}</p>
                  {routeIntelligence.route.reasons.length ? <ul>{routeIntelligence.route.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
                  {routeIntelligence.route.tradeoffs[0] ? <aside><strong>{language === "es" ? "Compromiso importante" : "Main trade-off"}</strong><span>{routeIntelligence.route.tradeoffs[0]}</span></aside> : null}
                </div>
              </section> : null}
              {tripTimingNotice && <aside className={styles.tripTimingNotice}><AlertTriangle /><p><strong>{language === "es" ? "Atención:" : "Heads up:"}</strong> {tripTimingNotice}</p></aside>}
              {gateConflict && <aside className={styles.tripTimingNotice} role="alert"><AlertTriangle /><p><strong>{language === "es" ? "No se puede crear todavía:" : "Cannot build yet:"}</strong> {gateConflict.message}</p></aside>}
              {specificTimingIssue && <aside className={styles.mobileTimingWarning} aria-live="polite"><AlertTriangle /><div><h3>{language === "es" ? `Viaje largo a ${specificTimingIssue.stop.name}` : `Long journey to ${specificTimingIssue.stop.name}`}</h3><p>{durationLabel(specificTimingIssue.duration.arrivalMinutes)} {language === "es" ? "de traslado reduce el tiempo aprovechable allí." : "transfer reduces your usable time there."}</p></div></aside>}
              {restoreRecommendedOrderVisible && <p className={styles.routeRestoreNotice}>{routeCopy.removesTravel(routeIntelligence.route.improvementMinutes ?? 0)} <button type="button" onClick={applyRecommendedOrder}>{language === "es" ? "Restaurar el orden de Morrovia" : "Restore Morrovia's order"}</button></p>}
            </div>
          )}
        </div>

        {step === 0 ? <aside className={styles.placesSummaryRail} aria-label={language === "es" ? "Resumen del viaje" : "Trip summary"}>
          <span>{language === "es" ? "TU VIAJE" : "YOUR TRIP"}</span>
          <div className={styles.placesSummaryStat}><MapPin /><div><b>{stops.length} {language === "es" ? "paradas" : "stops"}</b><small>{stops.length ? stops.map((stop) => stop.name).join(" → ") : (language === "es" ? "Añade tus primeras paradas" : "Add your first stops")}</small></div></div>
          <div className={styles.placesSummaryStat}><Users /><div><b>{effectiveIntent.travellers} {language === "es" ? (effectiveIntent.travellers === 1 ? "viajero" : "viajeros") : (effectiveIntent.travellers === 1 ? "traveller" : "travellers")}</b></div></div>
          <div className={styles.placesSummaryStat}><CalendarDays /><div><b>{language === "es" ? "Fechas en el siguiente paso" : "Dates set in the next step"}</b></div></div>
          {stops.length > 0 && <ol className={styles.placesSummaryStops}>{stops.map((stop, index) => <li key={stop.id}><b>{index + 1}</b><div><strong>{stop.name}{stop.country ? `, ${stop.country}` : ""}</strong><small>{index === 0 ? (language === "es" ? "Punto de partida" : "Starting point") : (language === "es" ? "Parada" : "Stop")}</small></div></li>)}</ol>}
          <div className={styles.placesSummaryNext}><span>{language === "es" ? "SIGUIENTE" : "NEXT"}</span><div><Clock /><p><b>{language === "es" ? "Equilibraremos las noches" : "We’ll balance nights"}</b>{language === "es" ? "según el tiempo de viaje y lo que haya cerca." : "around travel time and what’s nearby."}</p></div></div>
        </aside> : <aside className={`${styles.rail} ${styles.timeSummaryRail}`} aria-label={language === "es" ? "Consecuencias de tiempo" : "Timing consequences"}>
          <section className={styles.timingSummary}>
            <small>{language === "es" ? "TU VIAJE" : "YOUR TRIP"}</small>
            <h2>{language === "es" ? "Tu viaje de un vistazo" : "Your trip at a glance"}</h2>
            <p>{totalDays} {totalDays === 1 ? ui.day : ui.days} · {stops.length} {language === "es" ? "paradas" : "stops"} · {effectiveIntent.travellers} {language === "es" ? (effectiveIntent.travellers === 1 ? "viajero" : "viajeros") : (effectiveIntent.travellers === 1 ? "traveller" : "travellers")}</p>
            <strong><CheckCircle2 /> {allocatedNights} {language === "es" ? `de ${totalNights} noches planificadas` : `of ${totalNights} nights planned`}</strong>
          </section>
          {specificTimingIssue && <section className={styles.specificTimingWarning} aria-live="polite">
            <AlertTriangle />
            <div><h3>{language === "es" ? `Viaje largo a ${specificTimingIssue.stop.name}` : `Long journey to ${specificTimingIssue.stop.name}`}</h3><p>{durationLabel(specificTimingIssue.duration.arrivalMinutes)} {language === "es" ? "de traslado reduce el tiempo aprovechable allí." : " transfer reduces your usable time there."}</p></div>
          </section>}
        </aside>}
      </div>

      {cloudSaveError ? <aside className={styles.cloudSaveError} role="alert"><span>{cloudSaveError}</span><button type="button" onClick={syncAction === "reload-cloud" ? () => {
        if (!cloudConflictTrip) return;
        cacheCanonicalTrip(cloudConflictTrip);
        recoveryHandleRef.current = null;
        window.location.assign(tripWorkspaceHref(cloudConflictTrip.id));
      } : syncAction === "open-device" ? () => {
        window.location.assign(tripSyncRecoveryPath(activeTripDocument.id));
      } : deviceStorageBlocked ? () => {
        const recovery = persistDeviceRecovery(activeTripDocument);
        setDeviceRecoveryBlocked(recovery.blockedByExistingRecovery);
        setDeviceStorageBlocked(!recovery.stored && !recovery.blockedByExistingRecovery);
        if (recovery.stored) { setCloudSaveError(""); setSaveState("local"); }
      } : syncAction === "sign-in" ? () => {
        window.location.assign(tripSyncSignInPath(activeTripDocument.id));
      } : openBuiltTrip}>{syncAction === "reload-cloud" ? (language === "es" ? "Abrir copia en la nube" : "Open cloud copy") : syncAction === "open-device" ? (language === "es" ? "Abrir copia del dispositivo" : "Open device copy") : deviceStorageBlocked ? (language === "es" ? "Reintentar guardado" : "Try device save again") : syncAction === "sign-in" ? (language === "es" ? "Iniciar sesión de nuevo" : "Sign in again") : (language === "es" ? "Reintentar" : "Try again")}</button></aside> : null}
      {(step !== 0 || hasPromptContext) && <div className={styles.wizardFoot}>
        <button type="button" className={styles.ghost} disabled={step === 0} onClick={() => setStep(Math.max(0, step - 1))}>{copy.back}</button>
        <div className={styles.footRight}>
          <small className={styles.saveState}>{saveState === "saving" ? ui.savingChanges : saveState === "cloud" ? (language === "es" ? "Guardado en tu cuenta" : "Saved to your account") : saveState === "error" ? (language === "es" ? "No sincronizado" : "Not synced") : ui.savedDevice}</small>
          {gate && <small className={styles.gate}>{gate}</small>}
          <button type="button" className={styles.primary} disabled={Boolean(gate) || openingTrip || Boolean(cloudConflictTrip)} aria-busy={openingTrip || undefined}
            onClick={async () => {
              if (gate) return;
              if (step === 0) {
                if (!buildInvariant.canAdvanceToTime || !(await validateOrigin())) { surfaceBuildConflict(); return; }
                setStep(1);
                return;
              }
              buildTrip();
            }}>
            {openingTrip ? (language === "es" ? "Abriendo tu ruta…" : "Opening your route…") : step === 0 ? (language === "es" ? "Establecer fechas y noches" : "Set dates & nights") : (language === "es" ? "Crear viaje" : "Build trip")} {!openingTrip ? "→" : ""}
          </button>
        </div>
      </div>
      }
    </div>
  );
}
