"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, BedDouble, Binoculars, Building2, Castle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Flower2, House, Landmark, LocateFixed, MapPin, Menu, Mountain, PawPrint, PersonStanding, Plane, Torus, Trash2, WalletCards, Waves, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { JourneyGlobe, type JourneyMapPlace } from "@/components/journey-globe";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import { JourneyCarousel } from "@/components/journey-carousel";
import { JourneyLocalFinder, type JourneyLocalPlace } from "@/components/journey-local-finder";
import { JourneyItineraryAccommodation } from "@/components/journey-itinerary-accommodation";
import { JourneyItineraryRefinement } from "@/components/journey-itinerary-refinement";
import { PlanWorkspace } from "@/components/journey-plan-workspace";
import { JourneyPlannerStrip } from "@/components/journey-planner-strip";
import { JourneyWeather } from "@/components/journey-weather";
import EasyTTripCopilot from "@/components/easyt/easyt-trip-copilot";
import { journeyCalendar, journeyDayMedia, journeyDetails, journeyMedia, march2027Journey, type JourneyCalendarDay, type JourneyLeg, type JourneyRestaurant, type JourneyStop, type RestaurantMeal } from "@/lib/journey";
import { getCountryIntelligence } from "@/lib/country-intelligence";
import { cacheCanonicalTrip, canUseHydratedTripScope, claimGuestTripRecoveryForOwner, EASYT_BEFORE_NEW_TRIP_EVENT, EASYT_LAST_OWNER_CHANGE_EVENT, EASYT_LAST_OWNER_KEY, EasyTTripAuthError, EasyTTripPromotionConflictError, EasyTTripSaveConflictError, forgetRememberedOwner, loadActiveTrip, loadLocalTrip, loadRememberedOwner, loadTripFromEasyT, loadTripRecovery, markTripRecoveryState, ownerIdForBrowserRecovery, rememberLastOwner, saveTripRecovery, saveTripRecoveryToEasyT, shouldAllowNewTripNavigation, type TripRecoveryHandle } from "@/lib/easyt/storage";
import { tripEditorSyncAction, tripSyncRecoveryPath, tripSyncSignInPath } from "@/lib/easyt/trip-continuity";
import { requestedTripMatch } from "@/lib/easyt/trip-id-resolution";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { authClient } from "@/lib/auth-client";
import type { EasyTTrip, PlannerMapPin, PlannerPinCategory } from "@/lib/easyt/trip";
import { estimateLeg, legDecisionAlternatives, type RoutePlanningConstraints } from "@/lib/easyt/planner";
import { routeConstraintsFromStructuredTripBrief } from "@/lib/easyt/structured-trip-brief";
import { replanTripAfterDayOrder } from "@/lib/easyt/trip-replan";
import { applyRecommendation, recommendationImpact, reviewTrip, tripHealthSummary, undoRecommendation } from "@/lib/easyt/review";
import { accommodationProgress, stayBookingForStop } from "@/lib/easyt/accommodation";
import { classifyAnalyticsSaveError, hasAnalyticsConsent, trackEvent } from "@/lib/analytics";
import { parseMapWorkspaceTarget } from "@/lib/easyt/trip-workspace-links";
import { formatIsoDate, parseIsoDate } from "@/lib/easyt/trip-lifecycle";
import { deriveTripDateFacts, formatTripNights, incomingLegForPlanItem, orderedTripPlanItems, stableStopDateRange } from "@/lib/easyt/trip-facts";
import EasyTNavigation from "@/app/journey/easyt-navigation";
import styles from "@/app/journey/journey.module.css";
import mobileNav from "@/app/journey/plan-mobile-nav.module.css";
import mobileLayout from "@/app/journey/plan-mobile-layout.module.css";
import mapDocks from "@/app/journey/plan-map-docks.module.css";

const destinationIcons: Record<string, LucideIcon> = {
  plane: Plane,
  runner: PersonStanding,
  garden: Flower2,
  town: House,
  onsen: Waves,
  castle: Castle,
  panda: PawPrint,
  temple: Landmark,
  pillars: Mountain,
  gate: Torus,
  skyline: Building2,
};

type CustomPick = { id: string; title: string; area: string; type: string; duration: string; description: string; image?: string; sourceUrl?: string; coordinates?: [number, number]; country?: string };
type CustomDestination = { id: string; name: string; country?: string; coordinates?: [number, number]; kind?: string };
type CustomBrief = { origin: string; destinations: CustomDestination[]; startDate: string; duration: string; travellers: string; interests: string[]; picks: Record<string, string[]>; pickDetails?: Record<string, CustomPick[]> };
type ShapeDayTab = "plan" | "stay" | "eat" | "see";
const shapeDayTabs: ShapeDayTab[] = ["plan", "stay", "eat", "see"];
type TripHealthDetail = "accommodation" | "travel" | "activities" | "budget";

function customBriefFromEasyT(trip: EasyTTrip): CustomBrief {
  const start = parseIsoDate(trip.startDate);
  const end = parseIsoDate(trip.endDate);
  const datedDuration = start && end && end >= start ? Math.round((end.getTime() - start.getTime()) / 86400000) + 1 : 0;
  const duration = datedDuration || Math.max(0, ...trip.planItems.map((item) => item.dayNumber));
  const pickDetails = Object.fromEntries(trip.stops.map((stop) => [
    stop.id,
    trip.planItems
      .filter((item) => item.stopId === stop.id && item.type === "activity")
      .map((item) => ({
        id: item.id,
        title: item.title,
        area: stop.name,
        type: "Activity",
        duration: "Flexible",
        description: item.reason,
        image: item.image ?? undefined,
        sourceUrl: item.sourceUrl ?? undefined,
        coordinates: item.longitude !== null && item.latitude !== null ? [item.longitude, item.latitude] : undefined,
        country: stop.country,
      } satisfies CustomPick)),
  ]));

  return {
    origin: trip.brief.origin,
    destinations: trip.stops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      country: stop.country,
      coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] : undefined,
      kind: "place",
    })),
    startDate: trip.startDate,
    duration: String(duration),
    travellers: String(trip.travellers),
    interests: [],
    picks: trip.brief.selectedPlaces,
    pickDetails,
  };
}

const customCoordinates: Record<string, [number, number]> = {
  "guatemala city": [-90.5069, 14.6349], london: [-0.1276, 51.5072], japan: [139.6917, 35.6895], tokyo: [139.6917, 35.6895], "hong kong": [114.1694, 22.3193], france: [2.3522, 48.8566], spain: [2.1734, 41.3851], italy: [12.4964, 41.9028], china: [104.1954, 35.8617], thailand: [100.5018, 13.7563], mexico: [-99.1332, 19.4326], "united states": [-74.006, 40.7128], "united kingdom": [-0.1276, 51.5072], "south korea": [126.978, 37.5665], germany: [13.405, 52.52], portugal: [-9.1393, 38.7223], greece: [23.7275, 37.9838], turkey: [28.9784, 41.0082], vietnam: [105.8342, 21.0278], indonesia: [115.1889, -8.4095], australia: [151.2093, -33.8688], brazil: [-43.1729, -22.9068], morocco: [-7.9811, 31.6295], canada: [-79.3832, 43.6532], india: [77.209, 28.6139], singapore: [103.8198, 1.3521], "united arab emirates": [55.2708, 25.2048], egypt: [31.2357, 30.0444], croatia: [18.0944, 42.6507], switzerland: [8.5417, 47.3769], argentina: [-58.3816, -34.6037], peru: [-77.0428, -12.0464], cusco: [-71.9785, -13.517], "sacred valley": [-72.115, -13.308], "machu picchu": [-72.5451, -13.1631], colombia: [-74.0721, 4.711], "bogotá": [-74.0721, 4.711], bogota: [-74.0721, 4.711], medellín: [-75.5812, 6.2442], medellin: [-75.5812, 6.2442], iceland: [-21.9426, 64.1466], "new zealand": [174.7633, -36.8485], "south africa": [18.4241, -33.9249], "costa rica": [-84.0907, 9.9281], philippines: [120.9842, 14.5995], malaysia: [101.6869, 3.139], austria: [16.3738, 48.2082], netherlands: [4.9041, 52.3676], czechia: [14.4378, 50.0755], "czech republic": [14.4378, 50.0755], ireland: [-6.2603, 53.3498], norway: [10.7522, 59.9139], denmark: [12.5683, 55.6761], sweden: [18.0686, 59.3293], poland: [19.945, 50.0647], chile: [-70.6693, -33.4489], kenya: [36.8219, -1.2921], tanzania: [39.2083, -6.7924], maldives: [73.5093, 4.1755], guatemala: [-90.5069, 14.6349],
};

function customCoordinate(name: string, fallback: string): [number, number] | null { return customCoordinates[name.toLowerCase()] ?? customCoordinates[fallback.toLowerCase()] ?? null; }
function journeyTransportMode(mode: EasyTTrip["legs"][number]["mode"]): JourneyLeg["mode"] {
  if (mode === "flight") return "flight";
  if (mode === "train") return "rail";
  if (mode === "road") return "road";
  if (mode === "ferry") return "ferry";
  return "unknown";
}
function isGenericPlanningPrompt(value?: string) { return !value || /^(historic core|a standout museum|a local neighbourhood|best viewpoint|market, food hall|a nearby landscape|a seasonal|the strongest day trip|a slower local day|the place.s signature|choose .*strongest)/i.test(value); }
function isPickCompatibleWithDestination(pick: CustomPick | undefined, destination: CustomDestination) {
  if (!pick) return false;
  const destinationCountry = destination.country ?? destination.name;
  if (pick.country) return pick.country.toLocaleLowerCase() === destinationCountry.toLocaleLowerCase();
  const context = `${destination.name} ${destinationCountry}`.toLocaleLowerCase();
  return `${pick.area} ${pick.description}`.toLocaleLowerCase().includes(context);
}

function customPlaceDetails(place: CustomPick | undefined) {
  // A generated "Explore [city]" day has no practical place context yet. Showing
  // generic advice beneath its image only makes the itinerary feel repetitive.
  if (!place || new RegExp(`^explore\\s+${place.area.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}$`, "i").test(place.title.trim())) return [];

  const type = place.type.toLowerCase();
  const setting = place.area ? `around ${place.area}` : "around this place";
  const duration = place.duration || "a focused visit";
  const pacing = type.includes("food")
    ? `Make this the anchor for a proper meal, then keep the rest of the day walkable ${setting}.`
    : type.includes("nature") || type.includes("hike") || type.includes("landscape")
      ? `Start early, leave some weather buffer, and avoid adding a long transfer on either side.`
      : type.includes("beach")
        ? `Keep the surrounding time deliberately loose so weather and the pace of the day can lead.`
        : type.includes("museum") || type.includes("heritage") || type.includes("landmark") || type.includes("culture")
          ? `Give it ${duration}, then pair it only with nearby streets, food or another walkable stop.`
          : `Treat it as one focused chapter ${setting}, rather than trying to stack unrelated stops around it.`;
  const check = type.includes("nature") || type.includes("hike") || type.includes("landscape")
    ? "Check the forecast, opening conditions and the return transport before committing the day."
    : type.includes("food")
      ? "Check opening hours and whether a reservation is useful once the day and meal time are fixed."
      : "Check opening hours, closure days and any timed-entry requirement before you lock the day in.";

  return [
    { title: "Use the day well", copy: pacing },
    { title: "Before you go", copy: check },
  ];
}
function customDate(startDate: string, offset: number) { const date = parseIsoDate(startDate); if (!date) return "Date to confirm"; date.setDate(date.getDate() + offset); return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date); }
const planningBases: Record<string, string> = { peru: "Cusco", colombia: "Bogotá", japan: "Tokyo", china: "Beijing", italy: "Rome", france: "Paris", spain: "Barcelona", thailand: "Bangkok", vietnam: "Hanoi", indonesia: "Bali", "south korea": "Seoul", mexico: "Mexico City", portugal: "Lisbon", greece: "Athens", turkey: "Istanbul", "united kingdom": "London", "united states": "New York", australia: "Sydney", brazil: "Rio de Janeiro", morocco: "Marrakech", india: "Delhi", egypt: "Cairo", "new zealand": "Auckland", "south africa": "Cape Town" };
function planningBase(destination: string) { return getCountryIntelligence(destination)?.preferredFirstBase ?? planningBases[destination.toLowerCase()] ?? destination; }
function formatEstimate(minutes: number | null) { return minutes === null ? "Confirm connection" : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m approx.`; }
function connection(from: JourneyStop, to: JourneyStop, first: boolean): JourneyCalendarDay["travel"] {
  const estimate = estimateLeg({ name: from.city, country: from.country, coordinates: from.coordinates ?? undefined }, { id: to.id, name: to.city, country: to.country, coordinates: to.coordinates ?? undefined });
  return { mode: journeyTransportMode(estimate.mode), from: first ? undefined : from.city, detail: `${estimate.distanceKm ? `${estimate.distanceKm.toLocaleString()} km · ` : ""}${estimate.note}`, duration: formatEstimate(estimate.durationMinutes) };
}
function makeCustomJourney(brief: CustomBrief) {
  const totalDays = Math.max(1, Number.parseInt(brief.duration, 10) || 10);
  const allocations = brief.destinations.map(() => Math.max(2, Math.floor(totalDays / Math.max(1, brief.destinations.length))));
  let extra = totalDays - allocations.reduce((sum, value) => sum + value, 0); for (let index = 0; extra > 0; index = (index + 1) % allocations.length, extra -= 1) allocations[index] += 1;
  const stops: JourneyStop[] = [{ id: "custom-origin", city: brief.origin, country: brief.origin, date: customDate(brief.startDate, 0), coordinates: customCoordinate(brief.origin, brief.origin), theme: "transit", marker: "plane", description: "Your starting point. Journey will keep travel days visible rather than hiding them between destinations.", highlights: ["Departure", "Route begins"], aiPrompt: "What should I prepare before leaving?" }];
  const calendar: JourneyCalendarDay[] = [];
  let dayNumber = 0;
  brief.destinations.forEach((destination, destinationIndex) => {
    const picks = brief.picks[destination.id] ?? [];
    const pickDetails = brief.pickDetails?.[destination.id] ?? [];
    const country = destination.country ?? destination.name;
    const base = destination.name;
    const previousBase = destinationIndex ? brief.destinations[destinationIndex - 1].name : brief.origin;
    for (let localDay = 0; localDay < allocations[destinationIndex]; localDay += 1) {
      dayNumber += 1;
      const isArrival = localDay === 0;
      // A selected place is a finite commitment, not filler to repeat until the
      // city allocation is exhausted. Remaining days stay at the selected base.
      const picked = !isArrival && localDay - 1 < picks.length ? picks[localDay - 1] : undefined;
      const pick = picked ? pickDetails.find((entry) => entry.title === picked) : undefined;
      // Existing drafts can contain old, globally ambiguous discovery results.
      // Keep those safely at the country base rather than putting the trip on a
      // different continent while the user updates the selection.
      const isPlace = !isGenericPlanningPrompt(picked) && isPickCompatibleWithDestination(pick, destination);
      const city = isPlace ? picked! : base;
      const stopId = `custom-${destination.id}-${localDay + 1}`;
      const previousStop = stops[stops.length - 1];
      stops.push({
        id: stopId, city, country, date: customDate(brief.startDate, dayNumber - 1), coordinates: isPlace ? pick?.coordinates ?? destination.coordinates ?? customCoordinate(city, "") : destination.coordinates ?? customCoordinate(city, ""), theme: isArrival ? "city" : "mountain", marker: isArrival ? "skyline" : "temple",
        description: isPlace ? (pick?.description ?? `A focused day for ${city} in ${country}.`) : (isArrival ? `A calm arrival chapter in ${base}, with enough room to settle before the trip’s bigger days.` : `A focused day in ${base}, ${country}.`),
        highlights: isArrival ? ["Arrival", "Check in", "Local dinner"] : isPlace ? [pick?.area ?? country, pick?.type ?? "Signature place", pick?.duration ?? "Flexible"] : [country, "Local base", "Flexible"], aiPrompt: `What should I refine around ${city}?`,
      });
      calendar.push({ id: `custom-day-${dayNumber}`, date: customDate(brief.startDate, dayNumber - 1), label: `Day ${dayNumber}`, stopId, city, title: isArrival ? `Arrive in ${base}` : isPlace ? picked! : `Explore ${base}`, travel: isArrival ? connection(previousStop, stops[stops.length - 1], destinationIndex === 0) : previousStop.country === country ? connection(previousStop, stops[stops.length - 1], false) : undefined, items: isArrival ? [`Check in around ${base}`, "A gentle orientation walk in the closest district", "Choose dinner near your base"] : [isPlace ? picked! : `Explore ${base} at a slower pace`, `Pair ${isPlace ? picked! : "your base"} with one nearby supporting place`, "Reserve a restaurant or stay option directly in today’s plan"] });
    }
  });
  const legs: JourneyLeg[] = stops.slice(1).map((stop, index) => {
    const from = stops[index];
    const local = from.country === stop.country;
    const estimate = estimateLeg({ name: from.city, country: from.country, coordinates: from.coordinates ?? undefined }, { id: stop.id, name: stop.city, country: stop.country, coordinates: stop.coordinates ?? undefined });
    return { from: from.id, to: stop.id, mode: journeyTransportMode(estimate.mode), label: estimate.label, detail: `${estimate.distanceKm ? `${estimate.distanceKm.toLocaleString()} km · ` : ""}${estimate.note}`, duration: formatEstimate(estimate.durationMinutes) };
  });
  return { title: "Your Journey", dateRange: parseIsoDate(brief.startDate) ? `${customDate(brief.startDate, 0)} to ${customDate(brief.startDate, Math.max(0, totalDays - 1))}` : "Dates to confirm", stops, legs, calendar };
}

/**
 * Map Plan is a second view of the canonical EasyT document, not another
 * itinerary generator. The public `/journey` story continues to use its fixed
 * editorial dataset; only `/journey/plan` enters this path.
 */
export function makeEasyTJourney(trip: EasyTTrip) {
  const dateFacts = deriveTripDateFacts(trip);
  const origin: JourneyStop = {
    id: `${trip.id}-origin`,
    city: trip.brief.origin,
    country: trip.brief.origin,
    date: customDate(trip.startDate, 0),
    coordinates: trip.brief.originCoordinates ?? customCoordinate(trip.brief.origin, trip.brief.origin),
    theme: "transit",
    marker: "plane",
    description: "Your starting point. Travel days stay visible as part of the plan.",
    highlights: ["Departure", "Route begins"],
    aiPrompt: "What should I prepare before leaving?",
  };
  const stopById = new Map(trip.stops.map((stop) => [stop.id, stop]));
  const orderedItems = orderedTripPlanItems(trip);
  const stops: JourneyStop[] = [origin];
  const calendar: JourneyCalendarDay[] = orderedItems.map((item, index) => {
    const base = stopById.get(item.stopId) ?? trip.stops[0];
    const selectedPlaceTitles = new Set(base ? (trip.brief.selectedPlaces[base.id] ?? []) : []);
    // A generated day can pair places under a human title ("X + nearby time").
    // Coordinates are the reliable signal that it is a real mappable place.
    const isMappedPlace = item.type === "activity" && (selectedPlaceTitles.has(item.title) || (item.latitude !== null && item.longitude !== null));
    const city = isMappedPlace ? item.title : (base?.name ?? item.title);
    const country = base?.country ?? city;
    const stopId = `${trip.id}-day-${item.dayNumber}`;
    const coordinates: [number, number] | null = item.longitude !== null && item.latitude !== null
      ? [item.longitude, item.latitude]
      : base?.longitude !== null && base?.longitude !== undefined && base.latitude !== null
        ? [base.longitude, base.latitude]
        : customCoordinate(city, "");
    const previousItem = orderedItems[index - 1];
    const previousBase = previousItem ? stopById.get(previousItem.stopId) : undefined;
    const movedBase = index === 0 || previousBase?.id !== base?.id;
    const relatedLeg = movedBase ? incomingLegForPlanItem(trip, item) : null;
    const minutes = relatedLeg?.durationMinutes ?? null;
    const distanceKm = relatedLeg?.distanceKm ?? null;
    const travel = movedBase ? {
      mode: relatedLeg ? journeyTransportMode(relatedLeg.mode) : "unknown",
      from: index === 0 ? trip.brief.origin : previousBase?.name,
      detail: !relatedLeg || (relatedLeg.durationMinutes === null && relatedLeg.distanceKm === null) ? "Connection details to confirm" : `${distanceKm ? `${distanceKm.toLocaleString()} km · ` : ""}${relatedLeg.provider ?? "Saved transfer"}`,
      duration: minutes ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m` : "Timing to confirm",
    } satisfies JourneyCalendarDay["travel"] : undefined;

    stops.push({
      id: stopId,
      city,
      country,
      date: formatIsoDate(item.date, "en", { month: "short", day: "numeric" }) ?? "Date to confirm",
      coordinates,
      theme: item.type === "arrival" ? "city" : "mountain",
      marker: item.type === "arrival" ? "skyline" : "temple",
      description: item.reason,
      highlights: item.notes.slice(0, 3),
      aiPrompt: `What should I refine around ${city}?`,
    });

    return {
      id: `${trip.id}-calendar-${item.dayNumber}`,
      date: formatIsoDate(item.date, "en", { month: "short", day: "numeric" }) ?? "Date to confirm",
      label: `Day ${item.dayNumber}`,
      stopId,
      city,
      title: item.title,
      travel,
      items: item.notes.length ? item.notes : [item.title],
    };
  });
  const legs: JourneyLeg[] = stops.slice(1).map((stop, index) => {
    const from = stops[index];
    const day = calendar[index];
    return {
      from: from.id,
      to: stop.id,
      mode: day.travel?.mode ?? "unknown",
      label: `${from.city} → ${stop.city}`,
      detail: day.travel?.detail ?? "Day plan",
      duration: day.travel?.duration ?? "Local movement",
    };
  });
  return {
    title: trip.title || "Your Journey",
    dateRange: dateFacts.rangeLabel,
    stops,
    legs,
    calendar,
  };
}

export type JourneyMapPlannerWorkspaceProps = {
  trip?: EasyTTrip | null;
  presentation?: "focused" | "shell";
};

const emptyJourneyStop: JourneyStop = { id: "empty", city: "Trip", country: "", date: "Date to confirm", coordinates: null, theme: "transit", marker: "plane", description: "", highlights: [], aiPrompt: "" };
const emptyJourneyDay: JourneyCalendarDay = { id: "empty", date: "Date to confirm", label: "", stopId: "empty", city: "Trip", title: "Itinerary to confirm", items: [] };

export function JourneyMapPlannerWorkspace({
  trip: providedTrip = null,
  presentation = "focused",
}: JourneyMapPlannerWorkspaceProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionPending, error: sessionError } = authClient.useSession();
  const authenticatedOwnerId = session?.user?.id ?? null;
  const [rememberedOwnerId, setRememberedOwnerId] = useState<string | null>(null);
  const [browserOffline, setBrowserOffline] = useState(false);
  const sessionUnavailable = Boolean(sessionError
    && (typeof (sessionError as { status?: unknown }).status !== "number"
      || (sessionError as { status?: number }).status !== 401));
  const activeBrowserOwnerId = ownerIdForBrowserRecovery({
    authenticatedOwnerId,
    sessionPending,
    browserOffline: browserOffline || sessionUnavailable,
    rememberedOwnerId,
  });
  const isShellPresentation = presentation === "shell";
  const isPlanningPreview = isShellPresentation || pathname === "/journey/plan";
  const renderOwnerId = activeBrowserOwnerId
    ?? (sessionPending && providedTrip ? providedTrip.ownerId : null);
  const plannerDocumentIdentity = JSON.stringify([
    renderOwnerId,
    providedTrip?.id ?? searchParams.get("trip") ?? null,
  ]);
  const initialMapTarget = providedTrip ? parseMapWorkspaceTarget(providedTrip, searchParams) : null;
  const firstProvidedItem = providedTrip?.planItems.slice().sort((left, right) => left.dayNumber - right.dayNumber)
    .find((item) => item.stopId === initialMapTarget?.stopId)
    ?? providedTrip?.planItems.slice().sort((left, right) => left.dayNumber - right.dayNumber)[0];
  const [selectedDayId, setSelectedDayId] = useState(firstProvidedItem ? `${providedTrip?.id}-calendar-${firstProvidedItem.dayNumber}` : "day-03");
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [selectedId, setSelectedId] = useState(firstProvidedItem ? `${providedTrip?.id}-day-${firstProvidedItem.dayNumber}` : "tokyo");
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<{ restaurant: JourneyRestaurant; meal?: RestaurantMeal }>();
  const [localFinderKind, setLocalFinderKind] = useState<"restaurant" | "stay">(initialMapTarget?.mode === "stay" ? "stay" : "restaurant");
  const [shapeDayTab, setShapeDayTab] = useState<ShapeDayTab>(initialMapTarget?.mode ?? "plan");
  const [customBrief, setCustomBrief] = useState<CustomBrief | null>(() => providedTrip ? customBriefFromEasyT(providedTrip) : null);
  const [customTrip, setCustomTrip] = useState<EasyTTrip | null>(providedTrip);
  const [planHydrated, setPlanHydrated] = useState(Boolean(providedTrip) || !isPlanningPreview);
  const [explicitTripIssue, setExplicitTripIssue] = useState<"auth" | "missing" | null>(null);
  const [resolvedCoordinates, setResolvedCoordinates] = useState<Record<string, [number, number]>>({});
  const [placeMedia, setPlaceMedia] = useState<Record<string, { image?: string; alt?: string; description?: string; sourceUrl?: string; sourceLabel?: string; coordinates?: [number, number] }>>({});
  const [cloudSaveState, setCloudSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [cloudSaveError, setCloudSaveError] = useState("");
  const [cloudConflictTrip, setCloudConflictTrip] = useState<EasyTTrip | null>(null);
  const [cloudAuthInterrupted, setCloudAuthInterrupted] = useState(false);
  const [recoveryBlockedByExisting, setRecoveryBlockedByExisting] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "saving" | "error">("idle");
  const [exportError, setExportError] = useState("");
  const [autoSaveRequested, setAutoSaveRequested] = useState(false);
  const [draggedDayId, setDraggedDayId] = useState<string | null>(null);
  const [draggedActivity, setDraggedActivity] = useState<{ dayNumber: number; index: number } | null>(null);
  const [activityDraft, setActivityDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState<{ dayNumber: number; index: number } | null>(null);
  const [editingNoteDraft, setEditingNoteDraft] = useState("");
  const [pinDraft, setPinDraft] = useState("");
  const [pinCategory, setPinCategory] = useState<PlannerPinCategory>("activity");
  const [pinPlacementMode, setPinPlacementMode] = useState(false);
  const [pinCoordinates, setPinCoordinates] = useState<[number, number] | null>(null);
  const [selectedPlannerPin, setSelectedPlannerPin] = useState<PlannerMapPin | null>(null);
  const [pinEditDraft, setPinEditDraft] = useState("");
  const [mapMode, setMapMode] = useState<"overview" | "detail">("detail");
  const [localMapPlaces, setLocalMapPlaces] = useState<JourneyLocalPlace[]>([]);
  const [selectedLocalPlaceId, setSelectedLocalPlaceId] = useState<string | null>(null);
  const [plannerWarning, setPlannerWarning] = useState("");
  const [lastPlannerTrip, setLastPlannerTrip] = useState<EasyTTrip | null>(null);
  const [undoMessage, setUndoMessage] = useState("");
  const [mapCoachVisible, setMapCoachVisible] = useState(false);
  const [destinationExpanded, setDestinationExpanded] = useState(false);
  const [tripStatusExpanded, setTripStatusExpanded] = useState(false);
  const [tripHealthDetail, setTripHealthDetail] = useState<TripHealthDetail | null>(null);
  const healthDetailCloseRef = useRef<HTMLButtonElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hasMounted = useRef(false);
  const recoveryHandleRef = useRef<TripRecoveryHandle | null>(null);
  const hydratedOwnerScopeRef = useRef<string | null | undefined>(providedTrip ? providedTrip.ownerId : undefined);
  const hydratedDocumentIdentityRef = useRef<string | undefined>(providedTrip ? plannerDocumentIdentity : undefined);
  const previousDocumentIdentityRef = useRef(plannerDocumentIdentity);
  const activeBrowserOwnerIdRef = useRef(activeBrowserOwnerId);
  activeBrowserOwnerIdRef.current = activeBrowserOwnerId;
  const appliedDeepLinkRef = useRef<string | null>(null);
  const journey = useMemo(() => {
    const base = customTrip
      ? makeEasyTJourney(customTrip)
      : customBrief
        ? makeCustomJourney(customBrief)
        : ({ title: march2027Journey.title, dateRange: march2027Journey.dateRange, stops: march2027Journey.stops, legs: march2027Journey.legs, calendar: journeyCalendar });
    return customBrief ? { ...base, stops: base.stops.map((stop) => ({ ...stop, coordinates: resolvedCoordinates[stop.id] ?? stop.coordinates, description: placeMedia[stop.id]?.description ?? stop.description })) } : base;
  }, [customBrief, customTrip, resolvedCoordinates, placeMedia]);
  const isCustomJourney = Boolean(customBrief);
  // The persisted EasyT trip is the canonical planner document. The legacy
  // compatibility brief enriches its display data, but must not decide whether
  // a saved trip receives the current Shape-the-day workspace.
  const hasCanonicalPlanner = isPlanningPreview && Boolean(customTrip);
  const planCopy = language === "es"
    ? { backToItinerary: "Volver al itinerario", myTrips: "Mis viajes", export: "Exportar", exportPdf: "Exportar PDF", preparing: "Preparando…", menu: "Menú del viaje", review: "REVISIÓN DEL PLAN", signal: "señal de planificación", noWarnings: "Sin avisos inmediatos", checks: "Comprobaciones definidas", affects: "Afecta", overallPlan: "todo el plan", confidence: "de confianza", apply: "Aplicar", undo: "Deshacer", coverage: "La ruta tiene cobertura para todos los días y no hay señales de trayectos largos por carretera. Aun así, comprueba horarios y cierres antes de reservar.", travelConnection: "Conexión de viaje", localTransfer: "Traslado local", editingHint: "Arrastra días en la cronología o actividades abajo. Las sugerencias se mantienen hasta que las elimines.", scheduleHealth: "RITMO DEL DÍA", needsCheck: "Necesita una revisión", comfortable: "Ritmo cómodo", dayClear: "No hay trayectos largos ni demasiadas actividades para este día.", moveDay: "MOVER ESTE DÍA", earlier: "Antes", later: "Después", editActivity: "Editar tu actividad personalizada", yours: "TUYA", addActivity: "Añadir una actividad personalizada", add: "Añadir", notes: "NOTAS PARA MÍ", dayOnly: "Solo para este día", editNote: "Editar nota", save: "Guardar", cancel: "Cancelar", addNote: "Añade una nota para ti", addNoteButton: "Añadir nota", mapPins: "PINES EN EL MAPA", addPin: "Añadir pin", chooseLocation: "1. Elige una ubicación", chooseAnother: "Cambiar ubicación", clickMap: "Haz clic en el mapa…", locationSelected: "Ubicación seleccionada", detailedMap: "abre el mapa detallado", chooseCategory: "2. Elige una categoría y ponle nombre", namePlace: "Nombra este lugar", savePin: "Guardar pin", pinHelp: "Primero haz clic en el punto exacto. Después elegirás su categoría y nombre.", selectedPin: "PIN SELECCIONADO", renamePin: "Cambiar nombre del pin", saveName: "Guardar nombre", removeSelectedPin: "Eliminar pin seleccionado", pinsAria: "Pines del mapa", findPlaces: "Buscar lugares para este día", onTheGo: "SOBRE LA MARCHA", findNearby: "Encuentra lugares cerca", tripOverview: "VISTA DEL VIAJE", localDetail: "DETALLE LOCAL", zoomInto: "Acercar a", viewOverview: "Ver vista del viaje", pause: "Pausar recorrido", play: "Reproducir recorrido", meal: "Comida", savedRestaurant: "restaurante guardado", next: "Siguiente" }
    : { backToItinerary: "Back to itinerary", myTrips: "Trips", export: "Export", exportPdf: "Export PDF", preparing: "Preparing…", menu: "Trip menu", review: "PLAN REVIEW", signal: "planning signal", noWarnings: "No immediate warnings", checks: "Deterministic checks", affects: "Affects", overallPlan: "the overall plan", confidence: "confidence", apply: "Apply", undo: "Undo", coverage: "The route currently has coverage for every day and no long road transfer signal. Live schedules and closures still need checking before booking.", travelConnection: "Travel connection", localTransfer: "Local transfer", editingHint: "Drag days in the timeline, or activities below. Suggestions stay intact unless you remove them.", scheduleHealth: "SCHEDULE HEALTH", needsCheck: "Needs a quick check", comfortable: "Comfortable pace", dayClear: "No long transfer or crowded activity signal for this day.", moveDay: "MOVE THIS DAY", earlier: "Earlier", later: "Later", editActivity: "Edit your custom activity", yours: "YOURS", addActivity: "Add a custom activity", add: "Add", notes: "NOTES TO SELF", dayOnly: "For this day only", editNote: "Edit note", save: "Save", cancel: "Cancel", addNote: "Add a note to yourself", addNoteButton: "Add note", mapPins: "MAP PINS", addPin: "Add pin", chooseLocation: "1. Choose a location", chooseAnother: "Change location", clickMap: "Click the map…", locationSelected: "Location selected", detailedMap: "opens the detailed map", chooseCategory: "2. Choose a category and name it", namePlace: "Name this place", savePin: "Save pin", pinHelp: "Click the exact spot first. You’ll choose its category and name next.", selectedPin: "SELECTED PIN", renamePin: "Rename selected pin", saveName: "Save name", removeSelectedPin: "Remove selected pin", pinsAria: "Map pins", findPlaces: "Find places for this day", onTheGo: "ON THE GO", findNearby: "Find nearby places", tripOverview: "TRIP OVERVIEW", localDetail: "LOCAL DETAIL", zoomInto: "Zoom into", viewOverview: "View trip overview", pause: "Pause journey sequence", play: "Play journey sequence", meal: "Meal", savedRestaurant: "saved restaurant", next: "Next" };
  const healthCopy = language === "es"
    ? { title: "SALUD DEL VIAJE", ready: "Listo para reservar", blocking: "bloqueos", cautions: "avisos", info: "información", blockingLabel: "bloqueo", cautionLabel: "aviso" }
    : { title: "TRIP HEALTH", ready: "Ready to book", blocking: "blocking", cautions: "cautions", info: "information", blockingLabel: "blocking", cautionLabel: "caution" };
  const pinCategoryLabel = (category: PlannerPinCategory) => language === "es"
    ? ({ restaurant: "Restaurante", stay: "Alojamiento", activity: "Actividad", transport: "Transporte", custom: "Personalizado" }[category])
    : category;
  const mapCoach = language === "es"
    ? { eyebrow: "Empieza aquí", title: "Primero, mira el día.", detail: "Cambia de día en la cronología y usa “Encuentra lugares cerca” cuando necesites algo. Los pines y notas se abren solo cuando quieras personalizar.", dismiss: "Entendido" }
    : { eyebrow: "Start here", title: "First, look at the day.", detail: "Move between days in the timeline and use Find nearby when you need something. Pins and notes open only when you want to personalise the plan.", dismiss: "Got it" };
  const editTripHref = customTrip
    ? `/journey/new?trip=${encodeURIComponent(customTrip.id)}&view=itinerary`
    : "/journey/new";
  const selected = useMemo(
    () => journey.stops.find((stop) => stop.id === selectedId) ?? journey.stops[0] ?? emptyJourneyStop,
    [selectedId, journey.stops],
  );
  const selectedDay = journey.calendar.find((day) => day.id === selectedDayId) ?? journey.calendar[0] ?? emptyJourneyDay;
  const selectedDayIndex = journey.calendar.findIndex((day) => day.id === selectedDay.id);
  const selectedPlanItem = customTrip?.planItems.find((item) => `${customTrip.id}-calendar-${item.dayNumber}` === selectedDay.id);
  const selectedTripStop = customTrip?.stops.find((stop) => stop.id === selectedPlanItem?.stopId);
  const selectedLeg = customTrip && selectedPlanItem ? incomingLegForPlanItem(customTrip, selectedPlanItem) ?? undefined : undefined;
  const selectedStayDates = customTrip && selectedTripStop ? stableStopDateRange(selectedTripStop, customTrip) : null;
  const transportAlternatives = useMemo(() => {
    if (!customTrip || !selectedLeg) return [];
    const destination = customTrip.stops.find((stop) => stop.id === selectedLeg.toStopId);
    const originStop = customTrip.stops.find((stop) => stop.id === selectedLeg.fromStopId);
    if (!destination) return [];
    const constraints: RoutePlanningConstraints = customTrip.brief.structuredBrief
      ? routeConstraintsFromStructuredTripBrief(customTrip.brief.structuredBrief)
      : customTrip.brief.intent?.hardConstraints.avoidDriving
        ? { avoidDriving: true, excludedTransportModes: ["road"] }
        : {};
    return legDecisionAlternatives(
      originStop ? { id: originStop.id, name: originStop.name, country: originStop.country, coordinates: originStop.longitude !== null && originStop.latitude !== null ? [originStop.longitude, originStop.latitude] : undefined } : { name: customTrip.brief.origin, country: customTrip.brief.origin, coordinates: customTrip.brief.originCoordinates },
      { id: destination.id, name: destination.name, country: destination.country, coordinates: destination.longitude !== null && destination.latitude !== null ? [destination.longitude, destination.latitude] : undefined },
      constraints,
    );
  }, [customTrip, selectedLeg]);
  const selectedActivities = selectedPlanItem?.notes ?? selectedDay.items;
  const selectedDayNotes = selectedPlanItem ? customTrip?.brief.dayNotes?.[selectedPlanItem.dayNumber] ?? [] : [];
  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);
  useEffect(() => {
    const updateRememberedOwner = () => setRememberedOwnerId(loadRememberedOwner());
    updateRememberedOwner();
    const updateConnectivity = () => setBrowserOffline(window.navigator.onLine === false);
    updateConnectivity();
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    window.addEventListener(EASYT_LAST_OWNER_CHANGE_EVENT, updateRememberedOwner);
    const onStorage = (event: StorageEvent) => {
      if (event.key === EASYT_LAST_OWNER_KEY) updateRememberedOwner();
    };
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
    if (session !== null || sessionPending || sessionError || browserOffline) return;
    forgetRememberedOwner();
    setRememberedOwnerId(null);
  }, [browserOffline, session, sessionError, sessionPending]);
  useEffect(() => {
    if (isPlanningPreview && window.localStorage.getItem("easyt-map-coach-dismissed") !== "1") setMapCoachVisible(true);
  }, [isPlanningPreview]);
  useEffect(() => { setSelectedPlannerPin(null); }, [selectedDayId]);
  const selectedScheduleSignals = useMemo(() => {
    const signals: string[] = [];
    if (selectedActivities.length >= 4) signals.push(`${selectedActivities.length} activities: keep travel tight.`);
    const hours = Number.parseInt(selectedDay.travel?.duration ?? "", 10);
    if (Number.isFinite(hours) && hours >= 4) signals.push(`Long transfer: allow at least ${hours + 1} hours door to door.`);
    return signals;
  }, [selectedActivities.length, selectedDay.travel?.duration]);
  const healthSummary = useMemo(() => customTrip ? tripHealthSummary(customTrip) : null, [customTrip]);
  const health = healthSummary?.health ?? null;
  const accommodation = useMemo(() => customTrip ? accommodationProgress(customTrip) : null, [customTrip]);
  const reviewRecommendations = health?.issues ?? [];
  const displayRecommendations = [...reviewRecommendations].sort((left, right) => ({ critical: 0, warning: 1, info: 2 }[left.severity] - { critical: 0, warning: 1, info: 2 }[right.severity]));
  const priorityRecommendations = displayRecommendations.slice(0, 3);
  const remainingRecommendations = displayRecommendations.slice(3);
  const tripIssueCount = healthSummary?.issueCount ?? 0;
  const canonicalStripStops = useMemo(() => customTrip?.stops.map((stop) => {
    const items = customTrip.planItems.filter((item) => item.stopId === stop.id).sort((a, b) => a.dayNumber - b.dayNumber);
    const first = items[0];
    const last = items[items.length - 1];
    const imageKey = first ? `${customTrip.id}-day-${first.dayNumber}` : "";
    return {
      id: stop.id,
      name: stop.name,
      dayLabel: first ? first.dayNumber === last?.dayNumber ? `Day ${first.dayNumber}` : `Day ${first.dayNumber}–${last?.dayNumber}` : formatTripNights(stop.nights),
      image: (imageKey ? placeMedia[imageKey]?.image : undefined) ?? first?.image ?? undefined,
      active: stop.id === selectedPlanItem?.stopId,
    };
  }) ?? [], [customTrip, placeMedia, selectedPlanItem?.stopId]);
  const activityCount = customTrip?.planItems.filter((item) => item.type === "activity").length ?? 0;
  const unresolvedTransport = reviewRecommendations.some((item) => item.status === "open" && (item.rule === "missing-transport-decision" || item.rule === "missing-logistics" || item.rule === "connection-confidence"));
  const unsortedAccommodationStops = customTrip && accommodation ? accommodation.stops.filter((stop) => !stayBookingForStop(customTrip, stop)).map((stop) => stop.name) : [];
  const transportIssues = reviewRecommendations.filter((item) => item.status === "open" && (item.rule === "missing-transport-decision" || item.rule === "missing-logistics" || item.rule === "connection-confidence"));
  useEffect(() => {
    if (!isPlanningPreview || isShellPresentation || !customTrip || !health) return;
    if (!hasAnalyticsConsent()) return;
    const key = `morrovia:health-shown:${customTrip.id}:${health.blockingCount}:${health.cautionCount}:${health.openIssueCount}`;
    if (window.sessionStorage.getItem(key)) return;
    trackEvent("health_check_shown", { blocking_count: health.blockingCount, caution_count: health.cautionCount, issue_count: health.openIssueCount });
    window.sessionStorage.setItem(key, "1");
  }, [isPlanningPreview, isShellPresentation, customTrip, health]);
  useEffect(() => {
    if (!isPlanningPreview || isShellPresentation || !customTrip || !health?.isReady) return;
    if (!hasAnalyticsConsent()) return;
    const key = `morrovia:trip-ready:${customTrip.id}`;
    if (window.localStorage.getItem(key)) return;
    trackEvent("trip_ready", { stop_count: customTrip.stops.length, duration_days: customTrip.planItems.length });
    window.localStorage.setItem(key, "1");
  }, [isPlanningPreview, isShellPresentation, customTrip, health]);
  const customPlace = useMemo(() => {
    if (!customBrief) return undefined;
    return customBrief.destinations.flatMap((destination) => customBrief.pickDetails?.[destination.id] ?? [])
      .find((place) => place.title === selected.city && (!place.country || place.country.toLowerCase() === selected.country.toLowerCase()));
  }, [customBrief, selected.city, selected.country]);
  // The original Journey is deliberately editorial. Generated trips only show
  // guidance grounded in the actual place the traveller selected — never the
  // generic country-level boilerplate that made every day read the same.
  const details = isCustomJourney ? customPlaceDetails(customPlace) : (journeyDetails[selected.id] ?? []);
  const media = isCustomJourney ? undefined : journeyMedia[selected.id];
  const customImage = placeMedia[selected.id]?.image
    ? { src: placeMedia[selected.id]!.image!, alt: placeMedia[selected.id]?.alt ?? selected.city, caption: selected.city, sourceUrl: placeMedia[selected.id]?.sourceUrl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(selected.city.replace(/ /g, "_"))}`, sourceLabel: placeMedia[selected.id]?.sourceLabel }
    : customPlace?.image
      ? { src: customPlace.image, alt: selected.city, caption: selected.city, sourceUrl: customPlace.sourceUrl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(selected.city.replace(/ /g, "_"))}` }
      : Object.entries(placeMedia).map(([stopId, item]) => {
        const stop = journey.stops.find((candidate) => candidate.id === stopId);
        return stop?.country === selected.country && item.image
          ? { src: item.image, alt: selected.country, caption: `${selected.country} · journey reference`, sourceUrl: item.sourceUrl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(selected.country.replace(/ /g, "_"))}` }
          : undefined;
      }).find(Boolean);
  const dayMedia = journeyDayMedia[selectedDay.id];
  const images = isCustomJourney ? (customImage ? [customImage] : []) : (dayMedia?.length ? dayMedia : media ? [media.hero, ...(media.gallery ?? [])] : []);
  const mapPreviewImage = images.find((image) => image.src !== images[0]?.src);
  const customMapPlace: JourneyMapPlace | undefined = isCustomJourney && selected.coordinates ? { name: selected.city, coordinates: selected.coordinates, address: `${selected.city}, ${selected.country}`, image: customImage, summary: selected.description } : undefined;
  const DestinationIcon = destinationIcons[selected.marker] ?? Landmark;
  const handleRestaurantSelect = useCallback((restaurant?: JourneyRestaurant, meal?: RestaurantMeal) => {
    setSelectedRestaurant(restaurant ? { restaurant, meal } : undefined);
  }, []);

  const savePlannerRecovery = useCallback((trip: EasyTTrip, ownerId: string | null) => {
    if (!canUseHydratedTripScope(hydratedOwnerScopeRef.current, ownerId)) {
      setRecoveryBlockedByExisting(true);
      setCloudSaveError("This trip belongs to a different browser account scope. Reopen it from the current account before editing.");
      setCloudSaveState("error");
      return {
        stored: false,
        handle: { ownerId, tripId: trip.id, writeId: `scope-mismatch-${Date.now()}` },
        blockedByExistingRecovery: true,
      };
    }
    const currentHandle = recoveryHandleRef.current;
    const replacement = currentHandle?.tripId === trip.id
      && currentHandle.ownerId === ownerId
      && (!trip.ownerId || trip.ownerId === ownerId)
      ? currentHandle
      : null;
    const recovery = saveTripRecovery(trip, {
      ownerId: replacement ? replacement.ownerId : ownerId,
      replace: replacement ?? undefined,
    });
    if (recovery.stored) {
      recoveryHandleRef.current = recovery.handle;
      setRecoveryBlockedByExisting(false);
      return recovery;
    }
    setRecoveryBlockedByExisting(recovery.blockedByExistingRecovery);
    setCloudSaveError(recovery.blockedByExistingRecovery
      ? "This device already has a different unsynced copy of this trip. Open the device copy to resolve it before saving this version. This latest change is only in this tab."
      : "Browser storage is blocked. This latest change is only in this tab; keep it open and try again after storage is available.");
    setCloudSaveState("error");
    return recovery;
  }, []);

  const cacheSavedTrip = useCallback((trip: EasyTTrip, recovery: TripRecoveryHandle) => {
    const currentBeforeCache = recoveryHandleRef.current;
    const isCurrentRecovery = currentBeforeCache?.ownerId === recovery.ownerId
      && currentBeforeCache.tripId === recovery.tripId
      && currentBeforeCache.writeId === recovery.writeId
      && hydratedOwnerScopeRef.current === recovery.ownerId
      && activeBrowserOwnerIdRef.current === recovery.ownerId;
    const cached = cacheCanonicalTrip(trip, recovery);
    const remainingRecovery = loadTripRecovery(trip.id, recovery.ownerId);
    const safeCanonicalResult = isCurrentRecovery && cached.stored && !remainingRecovery;
    if (safeCanonicalResult) {
      recoveryHandleRef.current = null;
    } else if (isCurrentRecovery && remainingRecovery) {
      // A cross-tab edit won the recovery race. Keep the cloud response as a
      // clean cache, but require the newer device document to be opened.
      recoveryHandleRef.current = null;
      setRecoveryBlockedByExisting(true);
      setCloudSaveError("A newer device edit was preserved while this version finished syncing. Open the device copy before continuing.");
      setCloudSaveState("error");
    }
    return { ...cached, isCurrentRecovery: safeCanonicalResult };
  }, []);

  useEffect(() => {
    const preserveBeforeNewTrip = (event: Event) => {
      if (!customTrip || !hasUnsavedChanges) return;
      const recovery = savePlannerRecovery(customTrip, activeBrowserOwnerId ?? customTrip.ownerId);
      if (!shouldAllowNewTripNavigation(recovery)) event.preventDefault();
    };
    window.addEventListener(EASYT_BEFORE_NEW_TRIP_EVENT, preserveBeforeNewTrip);
    return () => window.removeEventListener(EASYT_BEFORE_NEW_TRIP_EVENT, preserveBeforeNewTrip);
  }, [activeBrowserOwnerId, customTrip, hasUnsavedChanges, savePlannerRecovery]);

  const updatePlannerTrip = useCallback((update: (trip: EasyTTrip) => EasyTTrip, message = "Edit saved") => {
    if (!customTrip) return;
    const base: EasyTTrip = {
      ...customTrip,
      brief: {
        ...customTrip.brief,
        dayNotes: { ...(customTrip.brief.dayNotes ?? {}) },
        customActivities: { ...(customTrip.brief.customActivities ?? {}) },
        mapPins: [...(customTrip.brief.mapPins ?? [])],
      },
      planItems: customTrip.planItems.map((item) => ({ ...item, notes: [...item.notes] })),
    };
    // Keep the last cloud updatedAt as the compare-and-swap token until the
    // repository returns a new canonical revision after a successful save.
    const next = update(base);
    setLastPlannerTrip(customTrip);
    setUndoMessage(message);
    setCustomTrip(next);
    setCustomBrief(customBriefFromEasyT(next));
    const recovery = savePlannerRecovery(next, activeBrowserOwnerId ?? next.ownerId);
    if (recovery.stored && !cloudConflictTrip) {
      setCloudSaveError("");
      setCloudSaveState("idle");
    }
    if (!cloudConflictTrip) setCloudAuthInterrupted(false);
    setHasUnsavedChanges(true);
  }, [activeBrowserOwnerId, cloudConflictTrip, customTrip, savePlannerRecovery]);

  useEffect(() => {
    if (!lastPlannerTrip) return;
    const timer = window.setTimeout(() => {
      setLastPlannerTrip(null);
      setUndoMessage("");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [lastPlannerTrip, undoMessage]);

  const handleAttractionSelection = useCallback((stopId: string, title: string, selected: boolean) => {
    updatePlannerTrip((trip) => ({
      ...trip,
      brief: {
        ...trip.brief,
        selectedPlaces: {
          ...trip.brief.selectedPlaces,
          [stopId]: selected
            ? [...(trip.brief.selectedPlaces[stopId] ?? []), title]
            : (trip.brief.selectedPlaces[stopId] ?? []).filter((place) => place !== title),
        },
      },
    }), selected ? "Place added to trip" : "Place removed from trip");
  }, [updatePlannerTrip]);

  const undoPlannerEdit = () => {
    if (!lastPlannerTrip) return;
    setCustomTrip(lastPlannerTrip);
    setCustomBrief(customBriefFromEasyT(lastPlannerTrip));
    const recovery = savePlannerRecovery(lastPlannerTrip, activeBrowserOwnerId ?? lastPlannerTrip.ownerId);
    if (recovery.stored && !cloudConflictTrip) {
      setCloudSaveError("");
      setCloudSaveState("idle");
    }
    setHasUnsavedChanges(true);
    setLastPlannerTrip(null);
    setUndoMessage("");
  };

  const moveDay = useCallback((fromDayId: string, toDayId: string) => {
    if (!customTrip || fromDayId === toDayId) return;
    const sourceIndex = journey.calendar.findIndex((day) => day.id === fromDayId);
    const targetIndex = journey.calendar.findIndex((day) => day.id === toDayId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    let returnedStopName = "";
    updatePlannerTrip((trip) => {
      const ordered = [...trip.planItems].sort((a, b) => a.dayNumber - b.dayNumber);
      const [moved] = ordered.splice(sourceIndex, 1);
      ordered.splice(targetIndex, 0, moved);
      const notes = trip.brief.dayNotes ?? {};
      const customActivities = trip.brief.customActivities ?? {};
      const reorderedNotes = Object.fromEntries(ordered.map((item, index) => [index + 1, notes[item.dayNumber] ?? []]));
      const reorderedActivities = Object.fromEntries(ordered.map((item, index) => [index + 1, customActivities[item.dayNumber] ?? []]));
      const next = {
        ...trip,
        brief: { ...trip.brief, dayNotes: reorderedNotes, customActivities: reorderedActivities },
        planItems: ordered.map((item, index) => ({
          ...item,
          dayNumber: index + 1,
          date: new Date(+new Date(`${trip.startDate}T00:00:00`) + index * 86400000).toISOString().slice(0, 10),
        })),
      };
      const replanned = replanTripAfterDayOrder(next, next.planItems);
      if (replanned.state === "needs-route-edit") {
        returnedStopName = trip.stops.find((stop) => stop.id === replanned.returnedStopId)?.name ?? "an earlier stop";
        return next;
      }
      return replanned.trip;
    }, "Day order updated");
    setPlannerWarning(returnedStopName
      ? language === "es"
        ? `Este cambio vuelve a ${returnedStopName}. Mantén ese regreso intencionadamente o edita la ruta antes de reservar.`
        : `This move returns to ${returnedStopName}. Keep that return intentionally, or edit the route before booking.`
      : language === "es"
        ? "El orden de los días cambió. Morrovia recalculó la ruta y los traslados estimados; revisa los traslados destacados antes de reservar."
        : "Day order changed. Morrovia recalculated the route and transfer estimates; check the highlighted transfers before booking.");
  }, [customTrip, journey.calendar, language, updatePlannerTrip]);

  const moveActivity = useCallback((from: { dayNumber: number; index: number }, to: { dayNumber: number; index: number }) => {
    updatePlannerTrip((trip) => {
      const planItems = trip.planItems.map((item) => ({ ...item, notes: [...item.notes] }));
      const source = planItems.find((item) => item.dayNumber === from.dayNumber);
      const target = planItems.find((item) => item.dayNumber === to.dayNumber);
      if (!source || !target || !source.notes[from.index]) return trip;
      const [activity] = source.notes.splice(from.index, 1);
      const targetIndex = source === target && from.index < to.index ? to.index - 1 : to.index;
      target.notes.splice(Math.max(0, targetIndex), 0, activity);
      const customActivities = { ...(trip.brief.customActivities ?? {}) };
      const sourceCustom = [...(customActivities[from.dayNumber] ?? [])];
      if (sourceCustom.includes(activity)) {
        const customIndex = sourceCustom.indexOf(activity);
        sourceCustom.splice(customIndex, 1);
        customActivities[from.dayNumber] = sourceCustom;
        customActivities[to.dayNumber] = [...(customActivities[to.dayNumber] ?? []), activity];
      }
      return { ...trip, brief: { ...trip.brief, customActivities }, planItems };
    }, "Activity moved");
    setPlannerWarning(from.dayNumber === to.dayNumber ? "Activity order updated." : "Activity moved to a different day. Morrovia has recalculated the travel sequence.");
  }, [updatePlannerTrip]);

  const addActivity = () => {
    const title = activityDraft.trim();
    if (!title || !selectedPlanItem) return;
    updatePlannerTrip((trip) => ({ ...trip, brief: { ...trip.brief, customActivities: { ...(trip.brief.customActivities ?? {}), [selectedPlanItem.dayNumber]: [...(trip.brief.customActivities?.[selectedPlanItem.dayNumber] ?? []), title] } }, planItems: trip.planItems.map((item) => item.dayNumber === selectedPlanItem.dayNumber ? { ...item, notes: [...item.notes, title] } : item) }));
    setActivityDraft("");
  };

  const addDayNote = () => {
    const note = noteDraft.trim();
    if (!note || !selectedPlanItem) return;
    updatePlannerTrip((trip) => ({ ...trip, brief: { ...trip.brief, dayNotes: { ...(trip.brief.dayNotes ?? {}), [selectedPlanItem.dayNumber]: [...(trip.brief.dayNotes?.[selectedPlanItem.dayNumber] ?? []), note] } } }));
    setNoteDraft("");
  };

  const beginNoteEdit = (dayNumber: number, index: number, note: string) => {
    setEditingNote({ dayNumber, index });
    setEditingNoteDraft(note);
  };

  const saveNoteEdit = () => {
    if (!editingNote || !editingNoteDraft.trim()) return;
    updatePlannerTrip((trip) => ({
      ...trip,
      brief: {
        ...trip.brief,
        dayNotes: {
          ...(trip.brief.dayNotes ?? {}),
          [editingNote.dayNumber]: (trip.brief.dayNotes?.[editingNote.dayNumber] ?? []).map((note, index) => index === editingNote.index ? editingNoteDraft.trim() : note),
        },
      },
    }), "Note updated");
    setEditingNote(null);
    setEditingNoteDraft("");
  };

  const renameActivity = useCallback((location: { dayNumber: number; index: number }, title: string) => {
    updatePlannerTrip((trip) => ({
      ...trip,
      brief: {
        ...trip.brief,
        customActivities: {
          ...(trip.brief.customActivities ?? {}),
          [location.dayNumber]: (trip.brief.customActivities?.[location.dayNumber] ?? []).map((activity) => activity === trip.planItems.find((item) => item.dayNumber === location.dayNumber)?.notes[location.index] ? title : activity),
        },
      },
      planItems: trip.planItems.map((plan) => plan.dayNumber === location.dayNumber ? { ...plan, notes: plan.notes.map((activity, activityIndex) => activityIndex === location.index ? title : activity) } : plan),
    }));
  }, [updatePlannerTrip]);

  const removeActivity = useCallback((location: { dayNumber: number; index: number }, title: string) => {
    updatePlannerTrip((trip) => ({
      ...trip,
      brief: {
        ...trip.brief,
        customActivities: {
          ...(trip.brief.customActivities ?? {}),
          [location.dayNumber]: (trip.brief.customActivities?.[location.dayNumber] ?? []).filter((activity) => activity !== title),
        },
      },
      planItems: trip.planItems.map((plan) => plan.dayNumber === location.dayNumber ? { ...plan, notes: plan.notes.filter((_, activityIndex) => activityIndex !== location.index) } : plan),
    }));
  }, [updatePlannerTrip]);

  const removeDayNote = useCallback((location: { dayNumber: number; index: number }) => {
    updatePlannerTrip((trip) => ({
      ...trip,
      brief: {
        ...trip.brief,
        dayNotes: {
          ...(trip.brief.dayNotes ?? {}),
          [location.dayNumber]: (trip.brief.dayNotes?.[location.dayNumber] ?? []).filter((_, noteIndex) => noteIndex !== location.index),
        },
      },
    }), "Note removed");
  }, [updatePlannerTrip]);

  const startActivityDrag = useCallback((location: { dayNumber: number; index: number }) => {
    setDraggedActivity(location);
    setDraggedDayId(null);
  }, []);

  const dropActivity = useCallback((event: DragEvent<HTMLLIElement>, target: { dayNumber: number; index: number }) => {
    event.preventDefault();
    if (draggedActivity) moveActivity(draggedActivity, target);
    setDraggedActivity(null);
  }, [draggedActivity, moveActivity]);

  const endActivityDrag = useCallback(() => setDraggedActivity(null), []);

  const selectRelativeDay = useCallback((direction: "previous" | "next") => {
    const index = direction === "previous" ? selectedDayIndex - 1 : selectedDayIndex + 1;
    const day = journey.calendar[index];
    if (!day) return;
    setIsPlaying(false);
    setSelectedDayId(day.id);
    setSelectedId(day.stopId);
  }, [journey.calendar, selectedDayIndex]);

  const selectShapeDayTab = (tab: ShapeDayTab) => {
    setShapeDayTab(tab);
    setSelectedLocalPlaceId(null);
    if (tab === "stay" || tab === "eat") setLocalFinderKind(tab === "stay" ? "stay" : "restaurant");
  };

  const onShapeDayTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, tab: ShapeDayTab) => {
    const currentIndex = shapeDayTabs.indexOf(tab);
    const nextIndex = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? Math.min(shapeDayTabs.length - 1, currentIndex + 1)
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? Math.max(0, currentIndex - 1)
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? shapeDayTabs.length - 1
            : null;
    if (nextIndex === null) return;
    event.preventDefault();
    selectShapeDayTab(shapeDayTabs[nextIndex]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  };

  const addPin = () => {
    const title = pinDraft.trim();
    if (!title || !pinCoordinates || !selectedPlanItem) return;
    const coordinates = pinCoordinates;
    const pin: PlannerMapPin = { id: `pin-${Date.now()}`, title, category: pinCategory, dayNumber: selectedPlanItem.dayNumber, longitude: coordinates[0], latitude: coordinates[1] };
    updatePlannerTrip((trip) => ({ ...trip, brief: { ...trip.brief, mapPins: [...(trip.brief.mapPins ?? []), pin] } }), "Map pin added");
    setSelectedPlannerPin(pin);
    setMapMode("detail");
    setPinDraft("");
    setPinCoordinates(null);
    setPinPlacementMode(false);
  };

  const selectPlannerPin = (pin: PlannerMapPin) => {
    setSelectedPlannerPin(pin);
    setPinEditDraft(pin.title);
    // A pin must always lead somewhere visible. The detailed map will centre
    // on its exact coordinates, including pins added on a different day.
    setMapMode("detail");
  };

  const savePinEdit = () => {
    if (!selectedPlannerPin || !pinEditDraft.trim()) return;
    const title = pinEditDraft.trim();
    const nextPin = { ...selectedPlannerPin, title };
    updatePlannerTrip((trip) => ({ ...trip, brief: { ...trip.brief, mapPins: (trip.brief.mapPins ?? []).map((pin) => pin.id === nextPin.id ? nextPin : pin) } }), "Map pin updated");
    setSelectedPlannerPin(nextPin);
  };

  const saveLocalVenue = useCallback((venue: { name: string; coordinates: [number, number] }, category: "restaurant" | "stay") => {
    if (!customTrip || !selectedPlanItem) return;
    const id = `venue-${selectedPlanItem.dayNumber}-${category}-${venue.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const stop = customTrip.stops.find((item) => item.id === selectedPlanItem.stopId);
    const stayBookingId = stop ? `stay-${stop.id}` : undefined;
    updatePlannerTrip((trip) => ({
      ...trip,
      brief: {
        ...trip.brief,
        customActivities: { ...(trip.brief.customActivities ?? {}), [selectedPlanItem.dayNumber]: (trip.brief.customActivities?.[selectedPlanItem.dayNumber] ?? []).includes(venue.name) ? (trip.brief.customActivities?.[selectedPlanItem.dayNumber] ?? []) : [...(trip.brief.customActivities?.[selectedPlanItem.dayNumber] ?? []), venue.name] },
        mapPins: (trip.brief.mapPins ?? []).some((pin) => pin.id === id) ? (trip.brief.mapPins ?? []) : [...(trip.brief.mapPins ?? []), { id, title: venue.name, category, dayNumber: selectedPlanItem.dayNumber, longitude: venue.coordinates[0], latitude: venue.coordinates[1] }],
        bookings: category === "stay" && stop && stayBookingId ? [
          ...(trip.brief.bookings ?? []).filter((booking) => booking.id !== stayBookingId),
          { id: stayBookingId, type: "stay", title: venue.name, date: stop.arrivalDate, confirmation: null, url: null },
        ] : trip.brief.bookings,
      },
      planItems: trip.planItems.map((item) => item.dayNumber === selectedPlanItem.dayNumber ? { ...item, notes: item.notes.includes(venue.name) ? item.notes : [...item.notes, venue.name] } : item),
    }), `${category === "restaurant" ? "Restaurant" : "Stay"} added to the day`);
  }, [customTrip, selectedPlanItem, updatePlannerTrip]);

  const removeLocalVenue = useCallback((venue: { name: string; coordinates: [number, number] }, category: "restaurant" | "stay") => {
    if (!customTrip || !selectedPlanItem) return;
    const id = `venue-${selectedPlanItem.dayNumber}-${category}-${venue.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const stop = customTrip.stops.find((item) => item.id === selectedPlanItem.stopId);
    updatePlannerTrip((trip) => ({
      ...trip,
      brief: {
        ...trip.brief,
        customActivities: { ...(trip.brief.customActivities ?? {}), [selectedPlanItem.dayNumber]: (trip.brief.customActivities?.[selectedPlanItem.dayNumber] ?? []).filter((item) => item !== venue.name) },
        mapPins: (trip.brief.mapPins ?? []).filter((pin) => pin.id !== id),
        bookings: category === "stay" && stop ? (trip.brief.bookings ?? []).filter((booking) => booking.id !== `stay-${stop.id}`) : trip.brief.bookings,
      },
      planItems: trip.planItems.map((item) => item.dayNumber === selectedPlanItem.dayNumber ? { ...item, notes: item.notes.filter((note) => note !== venue.name) } : item),
    }), `${category === "restaurant" ? "Restaurant" : "Stay"} removed from the day`);
  }, [customTrip, selectedPlanItem, updatePlannerTrip]);

  const changeRecommendation = useCallback((recommendationId: string, action: "apply" | "undo") => {
    if (!customTrip) return;
    const recommendation = reviewRecommendations.find((item) => item.id === recommendationId);
    const source = { ...customTrip, recommendations: reviewRecommendations };
    const changed = action === "apply" ? applyRecommendation(source, recommendationId) : undoRecommendation(source, recommendationId);
    const next = { ...changed, updatedAt: customTrip.updatedAt };
    setCustomTrip(next);
    const recovery = savePlannerRecovery(next, activeBrowserOwnerId ?? next.ownerId);
    if (action === "apply") {
      const repairCategory = recommendation?.rule ?? "unknown";
      trackEvent("health_issue_resolved", { rule: repairCategory });
      trackEvent("route_repair_applied", { trip_id: customTrip.id, repair_count: 1, repair_category: repairCategory, source: "map" });
    }
    if (!recovery.stored) return;
    if (session?.user && !cloudConflictTrip) {
      setCloudSaveState("saving");
      void saveTripRecoveryToEasyT(next, recovery.handle)
        .then((saved) => {
          const cached = cacheSavedTrip(saved, recovery.handle);
          if (!cached.isCurrentRecovery) return;
          setCustomTrip(saved);
          setCloudAuthInterrupted(false);
          setCloudSaveState("saved");
        })
        .catch((error) => {
          const conflictTrip = error instanceof EasyTTripSaveConflictError || error instanceof EasyTTripPromotionConflictError
            ? error.canonicalTrip
            : null;
          const authInterrupted = error instanceof EasyTTripAuthError;
          markTripRecoveryState(recovery.handle, authInterrupted ? "auth" : conflictTrip ? "conflict" : "network");
          if (recoveryHandleRef.current?.writeId !== recovery.handle.writeId
            || hydratedOwnerScopeRef.current !== recovery.handle.ownerId
            || activeBrowserOwnerIdRef.current !== recovery.handle.ownerId) return;
          setCloudConflictTrip(conflictTrip);
          setCloudAuthInterrupted(authInterrupted);
          setCloudSaveError(authInterrupted
            ? "Your session expired. Your edits are still safe on this device; sign in again to sync them."
            : conflictTrip
            ? "This trip changed on another device. Your edits are still on this device; reload the cloud copy before editing again."
            : "Couldn’t save this trip just now. Your plan is still safe on this device.");
          setCloudSaveState("error");
          trackEvent("trip_save_failed", { trip_source: "route", trip_id: next.id, save_state: "cloud", error_type: classifyAnalyticsSaveError(error), is_authenticated: true });
        });
    }
  }, [activeBrowserOwnerId, cacheSavedTrip, cloudConflictTrip, customTrip, reviewRecommendations, savePlannerRecovery, session?.user]);

  const chooseTransportAlternative = (option: (typeof transportAlternatives)[number]) => {
    if (!selectedLeg) return;
    updatePlannerTrip((trip) => ({
      ...trip,
      brief: { ...trip.brief, decisionSelections: { routeOrder: trip.brief.decisionSelections?.routeOrder, transportByLeg: { ...(trip.brief.decisionSelections?.transportByLeg ?? {}), [selectedLeg.id]: option.id } } },
      legs: trip.legs.map((leg) => leg.id === selectedLeg.id ? { ...leg, mode: option.mode, durationMinutes: option.estimatedMinutes, provider: `${option.label} planning estimate; verify live service and price.`, routeMetadata: { ...leg.routeMetadata, decisionOption: option.id, planningEstimate: true } } : leg),
    }), `${option.label} selected`);
    trackEvent("trip_refined", { change_type: "transport_alternative", affected_stop_count: 1 });
  };

  const savePlan = useCallback(async () => {
    if (!customTrip) return;
    if (cloudConflictTrip) {
      setCloudSaveError("This trip changed on another device. Reload the cloud copy before trying another cloud save; your device edit remains preserved.");
      setCloudSaveState("error");
      return;
    }
    const reviewedTrip = { ...customTrip, recommendations: reviewTrip(customTrip) };
    const recovery = savePlannerRecovery(reviewedTrip, activeBrowserOwnerId ?? customTrip.ownerId);
    if (!recovery.stored) return;
    if (!session?.user) {
      router.push(tripSyncSignInPath(customTrip.id));
      return;
    }
    setCloudSaveState("saving");
    setCloudSaveError("");
    setCloudAuthInterrupted(false);
    try {
      const saved = await saveTripRecoveryToEasyT(reviewedTrip, recovery.handle);
      const cached = cacheSavedTrip(saved, recovery.handle);
      if (!cached.isCurrentRecovery) return;
      setCustomTrip(saved);
      setCustomBrief(customBriefFromEasyT(saved));
      setCloudSaveState("saved");
      setHasUnsavedChanges(false);
      trackEvent("trip_saved", { trip_source: "route", trip_id: saved.id, save_state: "cloud", stop_count: saved.stops.length, is_authenticated: true });
      router.replace(`/journey/plan?trip=${encodeURIComponent(saved.id)}`);
    } catch (error) {
      const conflictTrip = error instanceof EasyTTripSaveConflictError || error instanceof EasyTTripPromotionConflictError
        ? error.canonicalTrip
        : null;
      const authInterrupted = error instanceof EasyTTripAuthError;
      markTripRecoveryState(recovery.handle, authInterrupted ? "auth" : conflictTrip ? "conflict" : "network");
      if (recoveryHandleRef.current?.writeId !== recovery.handle.writeId
        || hydratedOwnerScopeRef.current !== recovery.handle.ownerId
        || activeBrowserOwnerIdRef.current !== recovery.handle.ownerId) return;
      setCloudConflictTrip(conflictTrip);
      setCloudAuthInterrupted(authInterrupted);
      setCloudSaveState("error");
      setCloudSaveError(authInterrupted
        ? "Your session expired. Your edits are still safe on this device; sign in again to sync them."
        : conflictTrip
        ? "This trip changed on another device. Your edits are still on this device; reload the cloud copy before editing again."
        : "Couldn’t save this trip just now. Your plan is still safe on this device.");
      trackEvent("trip_save_failed", { trip_source: "route", trip_id: customTrip.id, save_state: "cloud", error_type: classifyAnalyticsSaveError(error), is_authenticated: true });
    }
  }, [activeBrowserOwnerId, cacheSavedTrip, cloudConflictTrip, customTrip, router, savePlannerRecovery, session?.user]);

  const exportPlan = useCallback(async () => {
    if (!customTrip || !session?.user) return;
    if (cloudConflictTrip) {
      setExportState("error");
      setExportError("Reload the cloud copy before exporting; your device edit remains preserved.");
      return;
    }
    setExportState("saving");
    setExportError("");
    const reviewedTrip = { ...customTrip, recommendations: reviewTrip(customTrip) };
    const recovery = savePlannerRecovery(reviewedTrip, session.user.id);
    if (!recovery.stored) {
      setExportState("error");
      setExportError(recovery.blockedByExistingRecovery
        ? "Open the existing device copy before exporting this version."
        : "Browser storage is unavailable, so this version was not exported.");
      return;
    }
    try {
      // Export must work for a freshly created local trip too. Persist the
      // current document first, then export the canonical saved version.
      const saved = await saveTripRecoveryToEasyT(reviewedTrip, recovery.handle);
      const cached = cacheSavedTrip(saved, recovery.handle);
      if (!cached.isCurrentRecovery) {
        setExportState("error");
        setExportError("A newer device edit is preserved. Open that copy before exporting.");
        return;
      }
      setCustomTrip(saved);
      setCustomBrief(customBriefFromEasyT(saved));
      setCloudSaveState("saved");
      setHasUnsavedChanges(false);
      const response = await fetch(`/api/easyt/trips/${encodeURIComponent(saved.id)}/pdf`, { cache: "no-store" });
      if (!response.ok) throw new Error("The PDF could not be prepared.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${saved.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "easyt-trip"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportState("idle");
    } catch (error) {
      const conflictTrip = error instanceof EasyTTripSaveConflictError || error instanceof EasyTTripPromotionConflictError
        ? error.canonicalTrip
        : null;
      markTripRecoveryState(recovery.handle, error instanceof EasyTTripAuthError ? "auth" : conflictTrip ? "conflict" : "network");
      const isCurrentRecovery = recoveryHandleRef.current?.writeId === recovery.handle.writeId
        && hydratedOwnerScopeRef.current === recovery.handle.ownerId
        && activeBrowserOwnerIdRef.current === recovery.handle.ownerId;
      if (conflictTrip && isCurrentRecovery) {
        setCloudConflictTrip(conflictTrip);
        setCloudSaveState("error");
        setCloudSaveError("This trip changed on another device. Your edits are still on this device; reload the cloud copy before exporting.");
      }
      if (error instanceof EasyTTripAuthError && isCurrentRecovery) {
        setCloudAuthInterrupted(true);
        setCloudSaveState("error");
        setCloudSaveError("Your session expired. Your edits are still safe on this device; sign in again before exporting.");
      }
      setExportState("error");
      setExportError(error instanceof Error ? error.message : "The PDF could not be prepared.");
    }
  }, [cacheSavedTrip, cloudConflictTrip, customTrip, savePlannerRecovery, session?.user]);

  const reloadCloudCopy = useCallback(() => {
    if (!cloudConflictTrip) return;
    recoveryHandleRef.current = null;
    setRecoveryBlockedByExisting(true);
    cacheCanonicalTrip(cloudConflictTrip);
    setCustomTrip(cloudConflictTrip);
    setCustomBrief(customBriefFromEasyT(cloudConflictTrip));
    setCloudConflictTrip(null);
    setCloudAuthInterrupted(false);
    setCloudSaveError("The cloud copy is open. Your separate device edits remain preserved until you open or explicitly discard them.");
    setCloudSaveState("error");
    setHasUnsavedChanges(false);
    router.replace(`/journey/plan?trip=${encodeURIComponent(cloudConflictTrip.id)}`);
  }, [cloudConflictTrip, router]);

  const resumeCloudSignIn = useCallback(() => {
    if (!customTrip) return;
    router.push(tripSyncSignInPath(customTrip.id));
  }, [customTrip, router]);

  const openDeviceRecovery = useCallback(() => {
    if (!customTrip) return;
    router.push(tripSyncRecoveryPath(customTrip.id));
  }, [customTrip, router]);
  const syncAction = tripEditorSyncAction({
    hasCloudConflict: Boolean(cloudConflictTrip),
    hasDeviceRecoveryIssue: recoveryBlockedByExisting,
    authInterrupted: cloudAuthInterrupted,
  });

  useEffect(() => {
    hasMounted.current = true;
    let cancelled = false;
    const hydratePlan = async () => {
      if (!isPlanningPreview) return;
      const documentIdentityChanged = previousDocumentIdentityRef.current !== plannerDocumentIdentity;
      previousDocumentIdentityRef.current = plannerDocumentIdentity;
      // Quarantine the previous document synchronously before any account- or
      // URL-scoped async lookup. The autosave effect also checks this ref.
      hydratedOwnerScopeRef.current = undefined;
      hydratedDocumentIdentityRef.current = undefined;
      recoveryHandleRef.current = null;
      setAutoSaveRequested(false);
      setCustomTrip(null);
      setCustomBrief(null);
      setHasUnsavedChanges(false);
      setPlanHydrated(false);
      setRecoveryBlockedByExisting(false);
      setExplicitTripIssue(null);
      if (documentIdentityChanged) {
        // These values can contain traveller-entered text or a full prior trip.
        // Clear them before tagging/rendering a different owner or document.
        setIsPlaying(false);
        setSelectedRestaurant(undefined);
        setResolvedCoordinates({});
        setPlaceMedia({});
        setCloudSaveState("idle");
        setCloudSaveError("");
        setCloudConflictTrip(null);
        setCloudAuthInterrupted(false);
        setExportState("idle");
        setExportError("");
        setDraggedDayId(null);
        setDraggedActivity(null);
        setActivityDraft("");
        setNoteDraft("");
        setEditingNote(null);
        setEditingNoteDraft("");
        setPinDraft("");
        setPinCategory("activity");
        setPinPlacementMode(false);
        setPinCoordinates(null);
        setSelectedPlannerPin(null);
        setPinEditDraft("");
        setLocalMapPlaces([]);
        setSelectedLocalPlaceId(null);
        setPlannerWarning("");
        setLastPlannerTrip(null);
        setUndoMessage("");
        setDestinationExpanded(false);
        setTripStatusExpanded(false);
        setTripHealthDetail(null);
      }
      if (providedTrip) {
        if (authenticatedOwnerId && providedTrip.ownerId && providedTrip.ownerId !== authenticatedOwnerId) {
          setPlanHydrated(true);
          return;
        }
        hydratedOwnerScopeRef.current = providedTrip.ownerId;
        hydratedDocumentIdentityRef.current = plannerDocumentIdentity;
        setCustomTrip(providedTrip);
        setCustomBrief(customBriefFromEasyT(providedTrip));
        setPlanHydrated(true);
        return;
      }
      if (sessionPending) return;
      try {
        const params = new URLSearchParams(window.location.search);
        const tripId = params.get("trip");
        const saveRequested = params.get("save") === "1";
        const recoveryRequested = params.get("recover") === "1";
        let activeTrip: EasyTTrip | null = null;
        let loadedFromCloud = false;
        let verifiedOwnerId = authenticatedOwnerId;
        let activeOwnerId = activeBrowserOwnerId ?? undefined;
        if (recoveryRequested && !verifiedOwnerId && !activeOwnerId && !sessionUnavailable && !browserOffline) {
          const currentSession = await authClient.getSession().catch(() => null);
          if (cancelled) return;
          verifiedOwnerId = currentSession?.data?.user?.id ?? null;
          activeOwnerId = verifiedOwnerId ?? undefined;
          if (verifiedOwnerId) {
            rememberLastOwner(verifiedOwnerId);
            setRememberedOwnerId(verifiedOwnerId);
          }
        }
        const storageOwnerId = activeOwnerId ?? null;
        const localTrip = tripId
          ? loadLocalTrip(tripId, storageOwnerId)
          : loadActiveTrip(storageOwnerId);
        if (recoveryRequested && tripId) {
          // A remembered offline owner may read its own recovery, but only a
          // live authenticated owner may claim a guest document.
          if (verifiedOwnerId) claimGuestTripRecoveryForOwner(tripId, verifiedOwnerId);
          const activeRecovery = loadTripRecovery(tripId, storageOwnerId);
          if (activeRecovery) {
            recoveryHandleRef.current = activeRecovery;
            activeTrip = activeRecovery.trip;
            setCloudConflictTrip(null);
            setCloudAuthInterrupted(false);
            setCloudSaveError("");
            setCloudSaveState("idle");
          }
        }
        if (!activeTrip && tripId) {
          try {
            const cloudTrip = await loadTripFromEasyT(tripId);
            if (cloudTrip) {
              activeTrip = cloudTrip;
              loadedFromCloud = true;
            }
          } catch { /* fall back to the local canonical copy */ }
          if (cancelled) return;
        }
        if (loadedFromCloud && activeTrip && tripId && !recoveryRequested) {
          const preservedRecovery = loadTripRecovery(tripId, storageOwnerId);
          if (preservedRecovery) {
            setRecoveryBlockedByExisting(true);
            setCloudSaveError("The cloud copy is open. Your separate device edits remain preserved until you open or explicitly discard them.");
            setCloudSaveState("error");
          }
        }
        if (!activeTrip && (!tripId || localTrip?.id === tripId)) {
          activeTrip = tripId
            ? requestedTripMatch(tripId, localTrip, activeOwnerId)
            : requestedTripMatch(localTrip?.id ?? "", localTrip, activeOwnerId);
        }
        if (!activeTrip && activeOwnerId && localTrip?.ownerId && localTrip.ownerId !== activeOwnerId) {
          setCustomTrip(null);
          setCustomBrief(null);
          setHasUnsavedChanges(false);
          if (tripId) setExplicitTripIssue("missing");
          return;
        }
        if (activeTrip) {
          const documentScope = loadedFromCloud ? activeTrip.ownerId : storageOwnerId;
          if (!loadedFromCloud && !recoveryHandleRef.current) {
            const matchingRecovery = loadTripRecovery(activeTrip.id, documentScope);
            if (matchingRecovery && JSON.stringify(matchingRecovery.trip) === JSON.stringify(activeTrip)) {
              recoveryHandleRef.current = matchingRecovery;
            }
          }
          hydratedOwnerScopeRef.current = documentScope;
          hydratedDocumentIdentityRef.current = plannerDocumentIdentity;
          setCustomTrip(activeTrip);
          setCustomBrief(customBriefFromEasyT(activeTrip));
          setAutoSaveRequested(saveRequested);
          const stayStopId = params.get("stay");
          const stayPlanItem = stayStopId ? activeTrip.planItems.find((item) => item.stopId === stayStopId) : undefined;
          if (stayStopId && stayPlanItem) {
            setSelectedId(stayStopId);
            setSelectedDayId(`${activeTrip.id}-calendar-${stayPlanItem.dayNumber}`);
            setShapeDayTab("stay");
            setLocalFinderKind("stay");
            setMapMode("detail");
          }
          setHasUnsavedChanges(false);
          return;
        }
        if (tripId) {
          setCustomTrip(null);
          setCustomBrief(null);
          setExplicitTripIssue(activeOwnerId ? "missing" : "auth");
          return;
        }
        // Older local drafts remain readable during migration, but new plans no
        // longer write this compatibility payload.
        try {
          const stored = window.localStorage.getItem("journey:planned-trip");
          const parsed = stored ? JSON.parse(stored) : null;
          if (parsed?.brief?.destinations?.length) setCustomBrief(parsed.brief as CustomBrief);
        } catch { /* A static Journey remains available if a local draft is malformed. */ }
      } finally {
        if (!cancelled) setPlanHydrated(true);
      }
    };
    void hydratePlan();
    return () => { cancelled = true; };
  }, [activeBrowserOwnerId, authenticatedOwnerId, browserOffline, isPlanningPreview, plannerDocumentIdentity, providedTrip, searchParams, sessionPending, sessionUnavailable]);

  useEffect(() => {
    if (!isPlanningPreview || !autoSaveRequested || !customTrip || !session?.user || cloudSaveState !== "idle"
      || !canUseHydratedTripScope(hydratedOwnerScopeRef.current, session.user.id)) return;
    void savePlan();
  }, [autoSaveRequested, cloudSaveState, customTrip, isPlanningPreview, savePlan, session?.user]);

  useEffect(() => {
    if (!customBrief || isShellPresentation) return;
    const generated = customTrip ? makeEasyTJourney(customTrip) : makeCustomJourney(customBrief);
    const firstDay = generated.calendar[0];
    if (firstDay) {
      setSelectedDayId(firstDay.id);
      setSelectedId(firstDay.stopId);
    }
  }, [customBrief, customTrip, isShellPresentation]);

  useEffect(() => {
    if (!isShellPresentation || !customTrip) return;
    const queryKey = `${customTrip.id}?${searchParams.toString()}`;
    if (appliedDeepLinkRef.current === queryKey) return;
    appliedDeepLinkRef.current = queryKey;
    const target = parseMapWorkspaceTarget(customTrip, searchParams);
    const item = customTrip.planItems
      .filter((candidate) => candidate.stopId === target.stopId)
      .sort((left, right) => left.dayNumber - right.dayNumber)[0]
      ?? customTrip.planItems.slice().sort((left, right) => left.dayNumber - right.dayNumber)[0];
    if (item) {
      setSelectedDayId(`${customTrip.id}-calendar-${item.dayNumber}`);
      setSelectedId(`${customTrip.id}-day-${item.dayNumber}`);
    }
    setShapeDayTab(target.mode);
    setLocalFinderKind(target.mode === "stay" ? "stay" : "restaurant");
    setSelectedLocalPlaceId(null);
    setMapMode("detail");
  }, [customTrip, isShellPresentation, searchParams]);

  useEffect(() => {
    if (!customBrief) return;
    const generated = customTrip ? makeEasyTJourney(customTrip) : makeCustomJourney(customBrief);
    let active = true;
    Promise.all(generated.stops.slice(1).map(async (stop) => {
      const country = stop.id === "custom-origin" ? "" : stop.country;
      const response = await fetch(`/api/journey-place?title=${encodeURIComponent(stop.city)}&country=${encodeURIComponent(country)}`);
      const payload = await response.json() as { place?: { image?: string; alt?: string; description?: string; sourceUrl?: string; sourceLabel?: string; coordinates?: [number, number] } | null };
      return [stop.id, payload.place] as const;
    })).then((results) => {
      if (!active) return;
      setPlaceMedia(Object.fromEntries(results.filter((entry): entry is [string, NonNullable<typeof entry[1]>] => Boolean(entry[1]))));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [customBrief, customTrip]);

  useEffect(() => {
    if (!customBrief) return;
    const places = (customTrip ? makeEasyTJourney(customTrip) : makeCustomJourney(customBrief)).stops;
    if (!places.length) return;
    let active = true;
    Promise.all(places.filter((place) => !place.coordinates).map(async (place) => {
      // The origin is entered as a city/place, not a country. Supplying
      // `London, London` makes Nominatim correctly reject London, UK.
      const country = place.id === "custom-origin" ? "" : place.country;
      const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(place.city)}&country=${encodeURIComponent(country)}`);
      const payload = await response.json() as { result?: { coordinates?: [number, number] } | null };
      return [place.id, payload.result?.coordinates] as const;
    })).then((results) => {
      if (!active) return;
      setResolvedCoordinates((current) => ({ ...current, ...Object.fromEntries(results.filter((entry): entry is [string, [number, number]] => Boolean(entry[1]))) }));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [customBrief, customTrip]);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 720px)").matches) return;
    const frame = window.requestAnimationFrame(() => {
      const track = trackRef.current;
      const activeDay = track?.querySelector<HTMLElement>(`[data-day-id="${selectedDayId}"]`);
      if (!track || !activeDay) return;
      const trackBox = track.getBoundingClientRect();
      const dayBox = activeDay.getBoundingClientRect();
      const delta = (dayBox.left + dayBox.width / 2) - (trackBox.left + trackBox.width / 2);
      track.scrollBy({ left: delta, behavior: "smooth" });
    });
    setSelectedRestaurant(undefined);
    return () => window.cancelAnimationFrame(frame);
  }, [selectedDayId]);

  useEffect(() => {
    if (!isPlaying || !journey.calendar.length) return;
    const timer = window.setTimeout(() => {
      if (selectedDayIndex === journey.calendar.length - 1) {
        setIsPlaying(false);
      } else {
        const nextDay = journey.calendar[selectedDayIndex + 1];
        setSelectedDayId(nextDay.id);
        setSelectedId(nextDay.stopId);
      }
    }, 1550);
    return () => window.clearTimeout(timer);
  }, [isPlaying, selectedDayIndex, journey.calendar]);

  useEffect(() => {
    if (!tripHealthDetail) return;
    const frame = window.requestAnimationFrame(() => healthDetailCloseRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTripHealthDetail(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [tripHealthDetail]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!journey.calendar.length) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        setIsPlaying(false);
        const nextDay = journey.calendar[Math.min(selectedDayIndex + 1, journey.calendar.length - 1)];
        setSelectedDayId(nextDay.id);
        setSelectedId(nextDay.stopId);
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        setIsPlaying(false);
        const previousDay = journey.calendar[Math.max(selectedDayIndex - 1, 0)];
        setSelectedDayId(previousDay.id);
        setSelectedId(previousDay.stopId);
      }
      if (event.key === " ") {
        if (target?.matches("button")) return;
        event.preventDefault();
        setIsPlaying((playing) => !playing);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedDayIndex, journey.calendar]);

  const renderReviewItem = (item: (typeof reviewRecommendations)[number]) => <article key={item.id} className={`${styles.reviewItem} ${styles[`review${item.severity[0].toUpperCase()}${item.severity.slice(1)}`]} ${item.status !== "open" ? styles.reviewResolved : ""}`}>
    <div><b>{item.status === "open" ? item.severity === "critical" ? healthCopy.blockingLabel : item.severity === "warning" ? healthCopy.cautionLabel : healthCopy.info : item.status}</b><strong>{item.message}</strong></div>
    {item.status !== "open" ? <div className={styles.reviewActions}><button type="button" onClick={() => changeRecommendation(item.id, "undo")}>{planCopy.undo}</button></div> : null}
    <details className={styles.reviewDetails}><summary>{language === "es" ? "Ver detalles" : "View details"}</summary><small>{planCopy.affects} {item.affectedDays.length ? item.affectedDays.map((day) => `${language === "es" ? "día" : "day"} ${day}`).join(", ") : planCopy.overallPlan}</small><p className={styles.reviewImpact}>{recommendationImpact(item)}</p><p>{item.evidence}</p><small>{item.confidence} {planCopy.confidence}</small>{item.status === "open" && item.proposedChange ? <div className={styles.reviewActions}><button type="button" onClick={() => changeRecommendation(item.id, "apply")}>{planCopy.apply}</button></div> : null}</details>
  </article>;

  const documentScopeMismatch = Boolean(customTrip
    && (!canUseHydratedTripScope(hydratedOwnerScopeRef.current, renderOwnerId)
      || hydratedDocumentIdentityRef.current !== plannerDocumentIdentity));

  if (isPlanningPreview && (!planHydrated || documentScopeMismatch)) {
    return (
      <>
        {!isShellPresentation ? <div className={styles.productNavigation}>
        <EasyTNavigation current="prototype" storageOwnerId={activeBrowserOwnerId} />
        </div> : null}
        <main className={`${styles.journey} ${styles.planLoading}`} aria-busy="true">
        <span className={styles.planLoadingSpinner} aria-hidden="true" />
        <p>Loading your journey…</p>
        </main>
      </>
    );
  }

  if (isPlanningPreview && (explicitTripIssue || (customTrip && journey.calendar.length === 0))) {
    const needsAuth = explicitTripIssue === "auth";
    return (
      <>
        {!isShellPresentation ? <div className={styles.productNavigation}><EasyTNavigation current="prototype" storageOwnerId={activeBrowserOwnerId} /></div> : null}
        <main className={`${styles.journey} ${styles.planUnavailable}`}>
          <h1>{needsAuth ? "Sign in to open this trip" : customTrip ? "This trip has no planned days yet" : "This trip is unavailable"}</h1>
          <p>{needsAuth ? "The requested trip is not available on this device. Sign in to check the saved cloud copy." : customTrip ? "Add or regenerate itinerary days before using the map workspace." : "It may have been removed, or you may not have access to it."}</p>
          <Link href={needsAuth ? `/journey/login?next=${encodeURIComponent(`/journey/plan?trip=${searchParams.get("trip") ?? ""}`)}` : customTrip ? `/journey/new?trip=${encodeURIComponent(customTrip.id)}&view=itinerary` : "/journey/dashboard"}>{needsAuth ? "Sign in" : customTrip ? "Edit itinerary" : "Back to trips"}</Link>
        </main>
      </>
    );
  }

  return (
    <>
      {!hasCanonicalPlanner ? <div className={styles.productNavigation}>
        <EasyTNavigation current="prototype" storageOwnerId={activeBrowserOwnerId} />
      </div> : null}
      <main className={`${styles.journey} ${mobileLayout.plan} ${mapDocks.plan} ${hasCanonicalPlanner ? styles.canonicalPlanner : ""} ${isShellPresentation ? styles.shellPlanner : ""}`}>
      {hasCanonicalPlanner ? (
        <>
          <div className={`${styles.mapOverviewLayer} ${mapMode === "overview" ? styles.mapLayerActive : styles.mapLayerHidden}`}>
            <JourneyGlobe
              stops={journey.stops}
              legs={journey.legs}
              selectedId={selectedId}
              selectedDayId={selectedDayId}
              activeItems={selectedDay.items}
              previewImage={mapPreviewImage}
              detailImageSrc={images[0]?.src}
              dayPlace={customMapPlace}
              restaurant={selectedRestaurant}
              plannerPins={customTrip?.brief.mapPins ?? []}
              pinPlacementMode={pinPlacementMode}
              onMapPinDrop={(coordinates) => { setPinCoordinates(coordinates); setPinPlacementMode(false); }}
              onPlannerPinSelect={selectPlannerPin}
              onZoomIntoDetail={() => setMapMode("detail")}
              variant="planner"
              onSelect={(id) => {
                setIsPlaying(false);
                setSelectedId(id);
                const matchingDay = journey.calendar.find((day) => day.stopId === id);
                if (matchingDay) setSelectedDayId(matchingDay.id);
              }}
            />
          </div>
          {mapMode === "detail" ? <div className={styles.mapDetailLayer}>
            <JourneyPlannerMap
              stops={journey.stops}
              legs={journey.legs}
              selectedId={selectedId}
              plannerPins={customTrip?.brief.mapPins ?? []}
              localPlaces={shapeDayTab === "stay" || shapeDayTab === "eat" ? localMapPlaces : []}
              selectedLocalPlaceId={selectedLocalPlaceId}
              focusOffset={isShellPresentation ? [56, 0] : [210, 0]}
              focusZoom={isShellPresentation ? 12 : undefined}
              focusCoordinates={selectedPlannerPin ? [selectedPlannerPin.longitude, selectedPlannerPin.latitude] : null}
              draftPinCoordinates={pinCoordinates}
              pinPlacementMode={pinPlacementMode}
              onMapPinDrop={(coordinates) => { setPinCoordinates(coordinates); setPinPlacementMode(false); }}
              onPlannerPinSelect={selectPlannerPin}
              onLocalPlaceSelect={(place) => setSelectedLocalPlaceId(place.id)}
              onSelect={(id) => {
                setIsPlaying(false);
                setSelectedId(id);
                const matchingDay = journey.calendar.find((day) => day.stopId === id);
                if (matchingDay) setSelectedDayId(matchingDay.id);
              }}
            />
          </div> : null}
        </>
      ) : (
        <>
          <JourneyGlobe
            stops={journey.stops}
            legs={journey.legs}
            selectedId={selectedId}
            selectedDayId={selectedDayId}
            activeItems={selectedDay.items}
            previewImage={mapPreviewImage}
            detailImageSrc={images[0]?.src}
            dayPlace={customMapPlace}
            restaurant={selectedRestaurant}
            variant="story"
            onSelect={(id) => {
              setIsPlaying(false);
              setSelectedId(id);
              const matchingDay = journey.calendar.find((day) => day.stopId === id)
                ?? (id === "los-angeles-out" ? journey.calendar[0] : undefined);
              if (matchingDay) setSelectedDayId(matchingDay.id);
            }}
          />
          <div className={styles.vignette} />
          <div className={styles.grain} />
        </>
      )}
      {hasCanonicalPlanner && mapCoachVisible ? <aside className={styles.mapCoach} role="status"><small>{mapCoach.eyebrow}</small><strong>{mapCoach.title}</strong><p>{mapCoach.detail}</p><button type="button" onClick={() => { window.localStorage.setItem("easyt-map-coach-dismissed", "1"); setMapCoachVisible(false); }}>{mapCoach.dismiss}</button></aside> : null}

      {hasCanonicalPlanner && customTrip ? <JourneyPlannerStrip
        summary={`${journey.calendar.length} days · ${customTrip.stops.length} stops · ${customTrip.travellers} ${customTrip.travellers === 1 ? "traveller" : "travellers"}`}
        stops={canonicalStripStops}
        addStopHref={`/journey/new?trip=${encodeURIComponent(customTrip.id)}`}
        fullTripHref={isShellPresentation ? `/journey/plan?trip=${encodeURIComponent(customTrip.id)}` : editTripHref}
        fullTripLabel={isShellPresentation ? "Fullscreen map" : "View full trip"}
        presentation={isShellPresentation ? "integrated" : "focused"}
        onSelectStop={(stopId) => {
          const firstItem = customTrip.planItems.filter((item) => item.stopId === stopId).sort((a, b) => a.dayNumber - b.dayNumber)[0];
          if (!firstItem) return;
          setIsPlaying(false);
          setSelectedDayId(`${customTrip.id}-calendar-${firstItem.dayNumber}`);
          setSelectedId(`${customTrip.id}-day-${firstItem.dayNumber}`);
          setSelectedLocalPlaceId(null);
          setMapMode("detail");
        }}
        overflow={isShellPresentation ? <>
          <button type="button" onClick={() => setIsPlaying((playing) => !playing)}>{isPlaying ? planCopy.pause : planCopy.play}</button>
          <Link href={`/journey/plan?trip=${encodeURIComponent(customTrip.id)}`}>Fullscreen map</Link>
        </> : <>
          <button type="button" onClick={() => setIsPlaying((playing) => !playing)}>{isPlaying ? planCopy.pause : planCopy.play}</button>
          <Link href={`/journey/plan-next?trip=${encodeURIComponent(customTrip.id)}`}>New map view</Link>
          <Link href={`/journey/prep?trip=${encodeURIComponent(customTrip.id)}`}>Trip prep</Link>
          <Link href="/journey/dashboard">{planCopy.myTrips}</Link>
          {session?.user ? <button type="button" onClick={() => void exportPlan()} disabled={exportState === "saving"}>{exportState === "saving" ? planCopy.preparing : planCopy.exportPdf}</button> : null}
        </>}
      /> : <header className={styles.topbar}>
          <div className={styles.headerRow}>
          {isPlanningPreview ? <Link href={editTripHref} className={styles.back}>← {language === "es" ? "Volver" : "Back"}</Link> : <Link href="/" className={styles.back}>← Shaun Whiting</Link>}
          <div className={styles.titleLockup}><span>{journey.title}</span><small>{journey.dateRange}</small></div>
          <details className={mobileNav.menu}>
            <summary aria-label={planCopy.menu}><Menu aria-hidden="true" /></summary>
            <div>
              {isPlanningPreview ? <Link href={editTripHref}>← {language === "es" ? "Volver" : "Back"}</Link> : null}
              {isPlanningPreview && customTrip ? <Link href={`/journey/plan-next?trip=${encodeURIComponent(customTrip.id)}`}>Try the new map view</Link> : null}
              {isPlanningPreview && customTrip ? <Link href={`/journey/prep?trip=${encodeURIComponent(customTrip.id)}`}>Trip prep</Link> : null}
              <Link href="/journey/dashboard">{planCopy.myTrips}</Link>
              {isPlanningPreview && customTrip && session?.user ? <button type="button" onClick={() => void exportPlan()} disabled={exportState === "saving"}>{exportState === "saving" ? planCopy.preparing : planCopy.exportPdf}</button> : null}
            </div>
          </details>
          <nav className={`${styles.headerActions} ${mobileNav.actions}`} aria-label="Morrovia account navigation">
            {hasCanonicalPlanner ? <button type="button" className={`${styles.journeyPlayback} ${isPlaying ? styles.playing : ""}`} onClick={() => setIsPlaying((playing) => !playing)} aria-label={isPlaying ? planCopy.pause : planCopy.play}><span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>{isPlaying ? planCopy.pause : (language === "es" ? "Viaje" : "Journey")}</button> : null}
            {isPlanningPreview && customTrip ? <Link href={`/journey/plan-next?trip=${encodeURIComponent(customTrip.id)}`} className={styles.myTripsLink}>New map view</Link> : null}
            {isPlanningPreview && customTrip ? <Link href={`/journey/prep?trip=${encodeURIComponent(customTrip.id)}`} className={styles.myTripsLink}>Trip prep</Link> : null}
            <Link href="/journey/dashboard" className={styles.myTripsLink}>{planCopy.myTrips}</Link>
            {isPlanningPreview && customTrip && session?.user ? <button type="button" className={styles.exportPlanLink} onClick={() => void exportPlan()} disabled={exportState === "saving"}>{exportState === "saving" ? planCopy.preparing : planCopy.export}</button> : null}
          </nav>
        </div>
        <nav className={styles.timeline} aria-label="Trip itinerary">
          <div className={styles.track} ref={trackRef} style={{ gridTemplateColumns: `repeat(${journey.calendar.length}, minmax(132px, 1fr))` }}>
            {journey.calendar.map((day, index) => {
              const active = day.id === selectedDayId;
              return (
                <button
                  key={day.id}
                  data-day-id={day.id}
                  draggable={Boolean(isPlanningPreview && customTrip)}
                  onDragStart={() => { setDraggedDayId(day.id); setDraggedActivity(null); }}
                  onDragOver={(event) => { if (isPlanningPreview && customTrip) event.preventDefault(); }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedActivity) moveActivity(draggedActivity, { dayNumber: index + 1, index: 999 });
                    else if (draggedDayId) moveDay(draggedDayId, day.id);
                    setDraggedDayId(null); setDraggedActivity(null);
                  }}
                  onDragEnd={() => { setDraggedDayId(null); setDraggedActivity(null); }}
                  onClick={() => { setIsPlaying(false); setSelectedDayId(day.id); setSelectedId(day.stopId); }}
                  className={`${styles.stop} ${active ? styles.active : ""}`}
                  aria-current={active ? "step" : undefined}
                >
                  <span className={styles.stopNode}><i /></span>
                  <span className={styles.stopDate}>{day.date} · {day.label}</span>
                  <strong>{day.city}</strong>
                  {index < journey.calendar.length - 1 ? <span className={styles.segment} /> : null}
                </button>
              );
            })}
          </div>
        </nav>
      </header>}

      <section className={`${styles.destination} ${hasCanonicalPlanner ? `${styles.destinationWithPinDock} ${styles.canonicalPlannerDestination}` : ""} ${hasCanonicalPlanner && !destinationExpanded ? styles.destinationCompact : ""}`} aria-live="polite">
        <motion.div
          key={selected.id}
          initial={hasMounted.current ? { opacity: 0, x: -7, filter: "blur(2px)" } : false}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          transition={{ type: "spring", stiffness: 260, damping: 30, mass: .65 }}
        >
            <div className={styles.destinationIntro}>
              <div className={styles.destinationLine} />
              <div className={styles.introTop}>
                <p className={styles.kicker}>{selectedDay.date} <span /> {selected.country}</p>
                {selected.coordinates ? <JourneyWeather city={selected.city} coordinates={selected.coordinates} date={selectedDay.date} /> : <span className={styles.weatherUnavailable}>Weather appears once this stop is mapped.</span>}
              </div>
              <div className={styles.destinationTitle}><h1>{selected.city}</h1><span aria-hidden="true"><DestinationIcon /></span></div>
              {hasCanonicalPlanner ? <button type="button" className={styles.destinationToggle} aria-expanded={destinationExpanded} onClick={() => setDestinationExpanded((expanded) => !expanded)}>{destinationExpanded ? (language === "es" ? "Cerrar" : "Close") : (language === "es" ? "Detalles" : "Details")}</button> : null}
              <p className={styles.description}>{selected.description}</p>
              {isPlanningPreview && selectedTripStop ? <dl className={styles.destinationFacts} aria-label={`${selected.city} stay details`}>
                <div><dt>Arrival</dt><dd>{formatIsoDate(selectedTripStop.arrivalDate, "en", { month: "short", day: "numeric" }) ?? "To confirm"}</dd></div>
                <div><dt>Nights</dt><dd>{selectedTripStop.nights ?? "To confirm"}</dd></div>
                <div><dt>Check out</dt><dd>{formatIsoDate(selectedTripStop.departureDate, "en", { month: "short", day: "numeric" }) ?? "To confirm"}</dd></div>
              </dl> : null}
              {isPlanningPreview && selectedDay.travel ? <div className={styles.destinationTransfer}><small>{selectedDay.travel.mode === "flight" ? planCopy.travelConnection : planCopy.localTransfer}</small><strong>{selectedDay.travel.from ? `${selectedDay.travel.from} → ${selectedDay.city}` : selectedDay.travel.detail}</strong><span>{selectedDay.travel.duration} · {selectedDay.travel.detail}</span></div> : null}
              {!isCustomJourney ? <div className={styles.highlights}>
                {selected.highlights.map((highlight, index) => <span key={highlight}><b>0{index + 1}</b>{highlight}</span>)}
              </div> : null}
            </div>
            {images.length ? <>
              <JourneyCarousel images={images} city={selectedDay.city} storyKey={selectedDay.id} />
              {details.length ? <details className={styles.exploreMore} open>
                <summary><span>{isCustomJourney && customPlace ? `Plan around ${customPlace.title}` : `Know ${selected.city}`}</span><b>Quick guide</b></summary>
                <div className={styles.exploreContent}>
                  {details.map((detail) => <article key={detail.title}><h3>{detail.title}</h3><p>{detail.copy}</p></article>)}
                </div>
              </details> : null}
            </> : null}
            {!images.length && details.length ? <div className={styles.detailSections}>
              {details.map((detail) => <details key={detail.title} open={isCustomJourney}><summary>{detail.title}<span>+</span></summary><p>{detail.copy}</p></details>)}
            </div> : null}
        </motion.div>
      </section>

      <aside className={`${styles.itineraryPanel} ${hasCanonicalPlanner ? `${styles.itineraryWithFinder} ${styles.canonicalPlannerStatus}` : ""} ${hasCanonicalPlanner && tripStatusExpanded ? styles.tripStatusExpanded : ""} ${tripHealthDetail ? styles.healthDetailOpen : ""}`} aria-live="polite">
        {hasCanonicalPlanner ? <button type="button" className={styles.tripStatusToggle} aria-expanded={tripStatusExpanded} onClick={() => { setTripHealthDetail(null); setTripStatusExpanded((expanded) => !expanded); }}><span>{language === "es" ? "Estado del viaje" : "Trip status"}</span><strong>{tripIssueCount} {language === "es" ? "problemas" : tripIssueCount === 1 ? "issue" : "issues"}</strong></button> : null}
        {hasCanonicalPlanner ? <section className={styles.plannerHealthSummary} aria-label={healthCopy.title}>
          {tripHealthDetail ? <div className={styles.healthDetail} role="dialog" aria-modal="false" aria-labelledby="trip-health-detail-title">
            <header><button ref={healthDetailCloseRef} type="button" onClick={() => setTripHealthDetail(null)} aria-label="Back to trip health summary"><ChevronLeft aria-hidden="true" /> Summary</button><button type="button" onClick={() => setTripHealthDetail(null)} aria-label="Close trip health details"><X aria-hidden="true" /></button></header>
            {tripHealthDetail === "accommodation" ? <><BedDouble aria-hidden="true" /><small>ACCOMMODATION</small><h2 id="trip-health-detail-title">{accommodation?.complete ? "Every stay is sorted" : `${unsortedAccommodationStops.length} ${unsortedAccommodationStops.length === 1 ? "stay needs" : "stays need"} attention`}</h2><p>{accommodation?.complete ? "Accommodation is recorded for each overnight stop." : "Choose a stay or confirm availability before the rest of the trip is booked."}</p>{unsortedAccommodationStops.length ? <ul>{unsortedAccommodationStops.map((name) => <li key={name}>{name}</li>)}</ul> : null}<button type="button" className={styles.healthDetailAction} onClick={() => { setTripHealthDetail(null); setShapeDayTab("stay"); setLocalFinderKind("stay"); }}>Review stays <ArrowRight aria-hidden="true" /></button></> : null}
            {tripHealthDetail === "travel" ? <><Clock3 aria-hidden="true" /><small>TRAVEL TIME</small><h2 id="trip-health-detail-title">{unresolvedTransport ? `${transportIssues.length || 1} transfer ${transportIssues.length === 1 ? "decision" : "decisions"} to review` : "Travel time is well paced"}</h2><p>{unresolvedTransport ? "Confirm the unresolved legs before booking so the route still protects useful time at each stop." : "No unresolved transport decision is currently affecting this trip."}</p>{transportIssues.length ? <ul>{transportIssues.slice(0, 3).map((issue) => <li key={issue.id}>{issue.message}</li>)}</ul> : null}<button type="button" className={styles.healthDetailAction} onClick={() => { setTripHealthDetail(null); setTripStatusExpanded(true); }}>Review route <ArrowRight aria-hidden="true" /></button></> : null}
            {tripHealthDetail === "activities" ? <><Binoculars aria-hidden="true" /><small>THINGS TO DO</small><h2 id="trip-health-detail-title">{activityCount ? `${activityCount} ${activityCount === 1 ? "activity" : "activities"} planned` : "This trip still needs day detail"}</h2><p>{activityCount ? "Your selected places are attached to the day plan. Keep enough room around transfers and arrival days." : "Start with the selected destination and add one useful anchor to the current day."}</p><button type="button" className={styles.healthDetailAction} onClick={() => { setTripHealthDetail(null); setShapeDayTab(activityCount ? "plan" : "see"); }}>Plan this day <ArrowRight aria-hidden="true" /></button></> : null}
            {tripHealthDetail === "budget" ? <><WalletCards aria-hidden="true" /><small>BUDGET</small><h2 id="trip-health-detail-title">{customTrip?.brief.budgetBand ? "Budget preference saved" : "Set a budget preference"}</h2><p>{customTrip?.brief.budgetBand ? `Morrovia is using your ${customTrip.brief.budgetBand === "value" ? "good value" : customTrip.brief.budgetBand === "mid" ? "mid-range" : "no ceiling"} preference when shaping recommendations.` : "A budget preference helps Morrovia prioritise suitable stays and places without inventing live prices."}</p><button type="button" className={styles.healthDetailAction} onClick={() => router.push(editTripHref)}>Review budget <ArrowRight aria-hidden="true" /></button></> : null}
          </div> : <><header><small>{healthCopy.title}</small><strong className={health?.status === "ready" ? styles.healthReady : styles.healthAttention}>{health?.status === "ready" ? <CheckCircle2 aria-hidden="true" /> : null}{health?.status === "ready" ? (language === "es" ? "En orden" : "On track") : `${health?.openIssueCount ?? 0} ${language === "es" ? "revisiones" : "to review"}`}</strong><span>{health?.status === "ready" ? (language === "es" ? "Tu viaje se ve bien" : "Your trip looks good") : (language === "es" ? "Empieza por lo más importante" : "Start with the highest-priority checks")}</span></header>
          <div className={styles.healthRows}>
            <button type="button" onClick={() => setTripHealthDetail("accommodation")}><BedDouble aria-hidden="true" /><span><strong>Accommodation</strong><small>{accommodation ? `${accommodation.sortedCount} of ${accommodation.stops.length} stays sorted` : "No overnight stays"}</small></span><CheckCircle2 className={accommodation?.complete ? styles.rowReady : styles.rowAttention} aria-hidden="true" /><ChevronRight className={styles.healthRowDisclosure} aria-hidden="true" /></button>
            <button type="button" onClick={() => setTripHealthDetail("travel")}><Clock3 aria-hidden="true" /><span><strong>Travel time</strong><small>{unresolvedTransport ? "Needs a decision" : "Well paced"}</small></span><CheckCircle2 className={unresolvedTransport ? styles.rowAttention : styles.rowReady} aria-hidden="true" /><ChevronRight className={styles.healthRowDisclosure} aria-hidden="true" /></button>
            <button type="button" onClick={() => setTripHealthDetail("activities")}><Binoculars aria-hidden="true" /><span><strong>Things to do</strong><small>{activityCount} planned</small></span><CheckCircle2 className={activityCount ? styles.rowReady : styles.rowAttention} aria-hidden="true" /><ChevronRight className={styles.healthRowDisclosure} aria-hidden="true" /></button>
            <button type="button" onClick={() => setTripHealthDetail("budget")}><WalletCards aria-hidden="true" /><span><strong>Budget</strong><small>{customTrip?.brief.budgetBand ? "Preference saved" : "Not set"}</small></span><CheckCircle2 className={customTrip?.brief.budgetBand ? styles.rowReady : styles.rowAttention} aria-hidden="true" /><ChevronRight className={styles.healthRowDisclosure} aria-hidden="true" /></button>
          </div>
          <button type="button" className={styles.healthDetailsButton} aria-expanded={tripStatusExpanded} onClick={() => setTripStatusExpanded((expanded) => !expanded)}>{tripStatusExpanded ? "Hide details" : "View details"}</button></>}
        </section> : null}
        <motion.div
          className={styles.itineraryContent}
          key={selectedDay.id}
          initial={hasMounted.current ? { opacity: 0, x: 8 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: .32, ease: [0.22, 1, 0.36, 1] }}
        >
          {!isPlanningPreview || !customTrip ? <><p className={styles.itineraryEyebrow}>{selectedDay.date} <span /> {selectedDay.label}</p><h2>{selectedDay.title}</h2><p className={styles.itineraryLocation}>{selectedDay.city}</p></> : null}
          {isPlanningPreview && customTrip ? <section className={styles.reviewPanel} aria-label={healthCopy.title}>
            <div className={styles.reviewHeader}><div><small>{healthCopy.title}</small><strong>{health?.status === "ready" ? healthCopy.ready : health?.blockingCount ? `${health.blockingCount} ${healthCopy.blocking}` : `${health?.openIssueCount ?? 0} ${language === "es" ? "revisiones" : "to review"}`}</strong></div><span>{planCopy.checks}</span></div>
            {reviewRecommendations.length ? <div className={styles.reviewList}>
              {priorityRecommendations.map(renderReviewItem)}
              {remainingRecommendations.length ? <details className={styles.moreReviewItems}><summary>{language === "es" ? `${remainingRecommendations.length} más comprobaciones` : `${remainingRecommendations.length} more trip checks`}</summary><div>{remainingRecommendations.map(renderReviewItem)}</div></details> : null}
            </div> : <p className={styles.reviewEmpty}>{planCopy.coverage}</p>}
          </section> : null}
          {isPlanningPreview && customTrip ? <JourneyItineraryAccommodation compact trip={customTrip} currentStopId={selected.id} onExploreMap={(stop) => {
            const firstStopDay = customTrip.planItems.find((item) => item.stopId === stop.id);
            if (firstStopDay) setSelectedDayId(`${customTrip.id}-calendar-${firstStopDay.dayNumber}`);
            setSelectedId(stop.id);
            setMapMode("detail");
            setLocalFinderKind("stay");
            setShapeDayTab("stay");
          }} /> : null}
          {isPlanningPreview && customTrip && selectedLeg && transportAlternatives.length > 1 ? <details className={styles.transportChoices} aria-label={language === "es" ? "Alternativas de transporte" : "Transport alternatives"}>
            <summary><span><small>{language === "es" ? "DECISIÓN DE TRASLADO" : "TRANSFER DECISION"}</small><strong>{language === "es" ? "Elige el compromiso que te conviene" : "Choose the trade-off that suits you"}</strong></span><b>{language === "es" ? "Revisar opciones" : "Review options"}</b></summary>
            <div className={styles.transportChoiceList}>{transportAlternatives.map((option) => {
              const selectedOption = customTrip.brief.decisionSelections?.transportByLeg[selectedLeg.id] === option.id;
              return <button type="button" key={option.id} className={selectedOption ? styles.transportChoiceSelected : ""} onClick={() => chooseTransportAlternative(option)}><span><b>{option.label}</b>{option.recommended ? <em>{language === "es" ? "RECOMENDADO" : "RECOMMENDED"}</em> : null}</span><small>{option.estimatedMinutes ? `${Math.floor(option.estimatedMinutes / 60)}h ${option.estimatedMinutes % 60}m` : (language === "es" ? "Tiempo por verificar" : "Time to verify")}{option.timeImpactMinutes && option.timeImpactMinutes > 0 ? ` · +${Math.floor(option.timeImpactMinutes / 60)}h ${option.timeImpactMinutes % 60}m` : ""} · {option.costImpact}</small><p>{option.tradeoff}</p>{option.recommendationReason ? <i>{option.recommendationReason}</i> : null}</button>;
            })}</div>
          </details> : null}
        </motion.div>
      </aside>

      {isPlanningPreview && customTrip && selectedPlanItem && shapeDayTab === "plan" ? <aside className={`${styles.pinDock} ${pinCoordinates || selectedPlannerPin ? styles.pinDockExpanded : ""}`} aria-label={planCopy.pinsAria}>
        <button type="button" className={styles.addPinUtility} aria-pressed={pinPlacementMode} onClick={() => { setMapMode("detail"); setSelectedPlannerPin(null); setPinDraft(""); setPinCoordinates(null); setPinPlacementMode(true); }}>
          <MapPin aria-hidden="true" /><span>{pinPlacementMode ? planCopy.clickMap : planCopy.addPin}</span><b>{(customTrip.brief.mapPins ?? []).filter((pin) => pin.dayNumber === selectedPlanItem.dayNumber).length}</b>
        </button>
        {pinPlacementMode ? <div className={styles.pinPlacementHint} role="status"><span>{planCopy.clickMap}</span><button type="button" onClick={() => setPinPlacementMode(false)} aria-label={planCopy.cancel}><X aria-hidden="true" /></button></div> : null}
        {pinCoordinates ? <div className={styles.pinComposer}>
          <div className={styles.pinPlacement}><span>{planCopy.locationSelected}</span><span><button type="button" onClick={() => { setPinCoordinates(null); setPinPlacementMode(false); }}>{planCopy.cancel}</button><button type="button" onClick={() => { setPinCoordinates(null); setPinPlacementMode(true); }}>{planCopy.chooseAnother}</button></span></div>
          <small className={styles.pinHint}>{planCopy.chooseCategory}</small>
          <div className={styles.pinCategories}>{(["restaurant", "stay", "activity", "transport", "custom"] as PlannerPinCategory[]).map((category) => <button key={category} type="button" aria-pressed={pinCategory === category} onClick={() => setPinCategory(category)}>{pinCategoryLabel(category)}</button>)}</div>
          <form onSubmit={(event) => { event.preventDefault(); addPin(); }}><input autoFocus value={pinDraft} onChange={(event) => setPinDraft(event.target.value)} placeholder={planCopy.namePlace} /><button type="submit" disabled={!pinDraft.trim()}>{planCopy.savePin}</button></form>
        </div> : null}
        {selectedPlannerPin ? <div className={styles.selectedPinDetail}><small>{planCopy.selectedPin}</small><form onSubmit={(event) => { event.preventDefault(); savePinEdit(); }}><input value={pinEditDraft} onChange={(event) => setPinEditDraft(event.target.value)} aria-label={planCopy.renamePin} /><button type="submit" disabled={!pinEditDraft.trim()}>{planCopy.saveName}</button></form><span>{pinCategoryLabel(selectedPlannerPin.category)} · {language === "es" ? "Día" : "Day"} {selectedPlannerPin.dayNumber}</span><button type="button" onClick={() => { updatePlannerTrip((trip) => ({ ...trip, brief: { ...trip.brief, mapPins: (trip.brief.mapPins ?? []).filter((item) => item.id !== selectedPlannerPin.id) } }), "Map pin removed"); setSelectedPlannerPin(null); }}>{planCopy.removeSelectedPin}</button></div> : null}
      </aside> : null}

      {hasCanonicalPlanner && selected.coordinates ? <aside className={`${styles.finderDock} ${shapeDayTab === "stay" ? styles.finderDockStay : shapeDayTab === "eat" ? styles.finderDockEat : shapeDayTab === "see" ? styles.finderDockSee : ""}`} aria-label={planCopy.findPlaces}>
        <header className={styles.shapeDayHeader}><small>{language === "es" ? `EN ${selected.city.toLocaleUpperCase()}` : `AT ${selected.city.toLocaleUpperCase()}`}</small><span><strong>Shape the day</strong>{selectedTripStop?.nights ? <em>{selectedTripStop.nights} {selectedTripStop.nights === 1 ? "night" : "nights"}</em> : null}</span><div className={styles.finderTabs} role="tablist" aria-label="Shape the day">
          {shapeDayTabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={shapeDayTab === tab} aria-pressed={shapeDayTab === tab} tabIndex={shapeDayTab === tab ? 0 : -1} className={shapeDayTab === tab ? styles.finderTabActive : ""} onClick={() => selectShapeDayTab(tab)} onKeyDown={(event) => onShapeDayTabKeyDown(event, tab)}>{tab === "plan" ? "Plan" : tab === "stay" ? "Stay" : tab === "eat" ? "Eat" : "See"}</button>)}
        </div>{customTrip ? <details className={styles.mobileTripStatus} open={tripStatusExpanded} onToggle={(event) => setTripStatusExpanded(event.currentTarget.open)}><summary><span>{language === "es" ? "Estado del viaje" : "Trip status"}</span><b>{tripIssueCount} {language === "es" ? "problemas" : tripIssueCount === 1 ? "issue" : "issues"}</b></summary></details> : null}</header>
        {shapeDayTab === "plan" ? <PlanWorkspace
          context={{ selectedDay, selectedStop: selected, selectedDayIndex, totalDays: journey.calendar.length, planItem: selectedPlanItem, transfer: selectedDay.travel, savedRestaurant: selectedRestaurant }}
          schedule={{ signals: selectedScheduleSignals, warning: plannerWarning }}
          activity={{
            items: selectedActivities,
            customItems: customTrip?.brief.customActivities?.[selectedPlanItem?.dayNumber ?? -1] ?? [],
            draft: activityDraft,
            dragged: draggedActivity,
            onDraftChange: setActivityDraft,
            onAdd: addActivity,
            onRename: renameActivity,
            onRemove: removeActivity,
            onMove: moveActivity,
            onDragStart: startActivityDrag,
            onDragOver: (event) => event.preventDefault(),
            onDrop: dropActivity,
            onDragEnd: endActivityDrag,
          }}
          notes={{ items: selectedDayNotes, draft: noteDraft, editing: editingNote, editingDraft: editingNoteDraft, onDraftChange: setNoteDraft, onAdd: addDayNote, onBeginEdit: (location, note) => beginNoteEdit(location.dayNumber, location.index, note), onEditingDraftChange: setEditingNoteDraft, onSaveEdit: saveNoteEdit, onCancelEdit: () => setEditingNote(null), onRemove: removeDayNote }}
          navigation={{
            previousDay: selectedDayIndex > 0 ? journey.calendar[selectedDayIndex - 1] : undefined,
            nextDay: selectedDayIndex < journey.calendar.length - 1 ? journey.calendar[selectedDayIndex + 1] : undefined,
            onMoveDay: (direction) => moveDay(selectedDay.id, journey.calendar[direction === "earlier" ? selectedDayIndex - 1 : selectedDayIndex + 1]?.id ?? selectedDay.id),
            onPreviousDay: () => selectRelativeDay("previous"),
            onNextDay: () => selectRelativeDay("next"),
          }}
          copy={planCopy}
        /> : null}
        {shapeDayTab === "see" && customTrip ? <div className={styles.shapeDaySee}><JourneyItineraryRefinement key={selectedPlanItem?.stopId} compact trip={customTrip} stop={customTrip.stops.find((stop) => stop.id === selectedPlanItem?.stopId)} onSelectionChange={handleAttractionSelection} onExploreMap={() => setMapMode("detail")} /></div> : null}
        {(shapeDayTab === "stay" || shapeDayTab === "eat") ? <JourneyLocalFinder key={`${selectedDay.id}-${localFinderKind}`} tripId={customTrip?.id} stopId={selectedTripStop?.id} kind={localFinderKind} city={selected.city} country={selected.country} dayId={selectedDay.id} coordinates={selected.coordinates} staySearch={selectedStayDates ? { ...selectedStayDates, adults: Math.max(1, customTrip?.travellers ?? 1), rooms: 1 } : undefined} selectedPlaceId={selectedLocalPlaceId} onPlaceSelect={(place) => { setSelectedLocalPlaceId(place.id); setMapMode("detail"); }} onPlacesChange={setLocalMapPlaces} onRestaurantSelect={handleRestaurantSelect} onSavePlace={saveLocalVenue} onRemovePlace={removeLocalVenue} /> : null}
      </aside> : null}

      {hasCanonicalPlanner ? <aside className={styles.mapAssistant}><EasyTTripCopilot compact surface="map" dayCount={journey.calendar.length} destination={selected.city} /></aside> : null}
      {hasCanonicalPlanner ? <div className={styles.mapFocusControl}>
        <button type="button" onClick={() => setMapMode((mode) => mode === "overview" ? "detail" : "overview")} aria-label={mapMode === "overview" ? `${language === "es" ? "Enfocar destino" : "Fit destination"}: ${selected.city}` : planCopy.viewOverview} title={mapMode === "overview" ? `${language === "es" ? "Enfocar destino" : "Fit destination"}: ${selected.city}` : planCopy.viewOverview}>
          <LocateFixed aria-hidden="true" />
        </button>
      </div> : null}
      {isPlanningPreview && lastPlannerTrip ? <div className={styles.undoToast} role="status"><span>{undoMessage}</span><button type="button" onClick={undoPlannerEdit}>{planCopy.undo}</button></div> : null}
      {exportState === "error" ? <p className={styles.savePlanError}>{exportError || (language === "es" ? "No se pudo preparar el PDF." : "The PDF could not be prepared.")}</p> : null}
      {cloudSaveState === "error" ? <p className={styles.savePlanError}>{cloudSaveError || (language === "es" ? "No se pudo guardar este viaje ahora. Tu plan sigue seguro en este dispositivo." : "Couldn’t save this trip just now. Your plan is still safe on this device.")} <button type="button" onClick={syncAction === "reload-cloud" ? reloadCloudCopy : syncAction === "open-device" ? openDeviceRecovery : syncAction === "sign-in" ? resumeCloudSignIn : () => void savePlan()}>{syncAction === "reload-cloud" ? (language === "es" ? "Recargar copia en la nube" : "Reload cloud copy") : syncAction === "open-device" ? (language === "es" ? "Abrir copia del dispositivo" : "Open device copy") : syncAction === "sign-in" ? (language === "es" ? "Iniciar sesión de nuevo" : "Sign in again") : (language === "es" ? "Reintentar" : "Try again")}</button></p> : null}

      </main>
    </>
  );
}

export default function JourneyPage() {
  return <JourneyMapPlannerWorkspace />;
}
