import { captureJourneyBrief } from "./journey-capture.ts";
import { createDestinationKnowledgeStore } from "./destination-knowledge.ts";
import { allocateTripNights, calendarDayAllocationsFromNights } from "./night-allocation.ts";
import { matchCatalogPlace } from "./place-catalog.ts";
import { routeFamilyByKey, type RouteConfidence, type RouteConnection, type RouteFamily } from "./route-catalog.ts";
import { routeImages } from "./route-images.ts";
import { inspirationByKey } from "./inspiration.ts";
import { mergeStructuredTripBrief, type StructuredTripBrief } from "./structured-trip-brief.ts";
import { curatedRouteKnowledgeFor, isBetaCuratedRoute, type CuratedRouteKnowledge } from "./curated-route-knowledge.ts";

export const LEGACY_PUBLIC_ROUTE_SLUGS: Readonly<Record<string, string>> = {
  "portugal-coast": "portugal-atlantic",
};

export type PublicRouteAttraction = {
  name: string;
  stopName?: string;
};

type PublicRouteEditorial = {
  eyebrow: string;
  summary: string;
  durationDays: number;
  rhythm: string;
  bestTime?: string;
  conditions?: string;
  countryContext?: string;
  attractions?: PublicRouteAttraction[];
};

const publicRouteEditorial: Readonly<Record<string, PublicRouteEditorial>> = {
  "japan-slow": {
    eyebrow: "Asia · food and mountains",
    summary: "A first-time Japan route that moves from Tokyo’s energy into a smaller mountain town, then ends with Kyoto at a human pace.",
    durationDays: 10,
    rhythm: "Unhurried",
    bestTime: "March to May or October to November",
    conditions: "Spring is mild with busy blossom periods. Autumn is cooler and usually comfortable for walking. Summer is hot and humid in the cities, while mountain conditions can change quickly.",
    countryContext: "Tokyo, the Japanese Alps and Kyoto each have a distinct rhythm. The route works best when rail days stay light and each base has time beyond its headline sights.",
    attractions: [
      { name: "Meiji Shrine and Tokyo neighbourhoods", stopName: "Tokyo" },
      { name: "Takayama old town and morning markets", stopName: "Takayama" },
      { name: "Hida folk villages and alpine scenery", stopName: "Takayama" },
      { name: "Kyoto temples and eastern hillside walks", stopName: "Kyoto" },
    ],
  },
  "portugal-atlantic": {
    eyebrow: "Europe · city to coast",
    summary: "Start with Lisbon’s colour and energy, ease into Comporta, then finish on the Algarve with nowhere to rush back from.",
    durationDays: 7,
    rhythm: "City-to-coast",
    bestTime: "April to June or September to October",
    conditions: "Late spring and early autumn are generally warm without the peak summer heat. Atlantic wind and cooler evenings are common on the coast.",
    countryContext: "Portugal works particularly well as a city-to-coast trip. Distances are manageable, food is part of the route, and each base creates a noticeably different chapter.",
    attractions: [
      { name: "Lisbon’s Alfama and riverside districts", stopName: "Lisbon" },
      { name: "Sintra’s palaces and wooded hills", stopName: "Lisbon" },
      { name: "Comporta’s dunes and rice fields", stopName: "Comporta" },
      { name: "Lagos cliffs and coastal paths", stopName: "Lagos" },
    ],
  },
  "andean-highlands": {
    eyebrow: "South America · altitude and landscapes",
    summary: "A highland route that gives your body time to adjust before its biggest days, with Cusco, the Sacred Valley and Arequipa in a calm sequence.",
    durationDays: 9,
    rhythm: "Altitude-aware",
    bestTime: "May to September",
    conditions: "The dry season brings clearer highland days and cold nights. Rain is more frequent from November to March, and conditions can shift quickly at altitude.",
    countryContext: "Peru’s highland highlights are connected by extraordinary landscapes, but altitude changes the pace. This route protects the first days and treats the Sacred Valley as a base, not a rushed excursion.",
    attractions: [
      { name: "Cusco’s historic centre", stopName: "Cusco" },
      { name: "Pisac and Ollantaytambo", stopName: "Sacred Valley" },
      { name: "Machu Picchu", stopName: "Sacred Valley" },
      { name: "Arequipa and the volcanic landscape", stopName: "Arequipa" },
    ],
  },
  "taiwan-rail": {
    eyebrow: "Asia · rail and night markets",
    summary: "A food-led route south through Taipei, Taichung and Tainan, held together by straightforward rail legs and nights left open for eating.",
    durationDays: 8,
    rhythm: "Rail-first",
    bestTime: "October to April",
    conditions: "Winters are mild in the south and cooler in Taipei. Summers are hot, humid and wet, and typhoons can disrupt travel from summer into early autumn.",
    countryContext: "Taiwan’s rail spine makes a multi-city trip unusually simple. The route pairs modern city life, tea country and historic southern streets without losing days to repeated hotel changes.",
    attractions: [
      { name: "Taipei night markets and hot springs", stopName: "Taipei" },
      { name: "Sun Moon Lake or tea country", stopName: "Taichung" },
      { name: "Taichung’s arts districts", stopName: "Taichung" },
      { name: "Tainan temples and old streets", stopName: "Tainan" },
    ],
  },
};

export type PublicRouteConnection = {
  from: string;
  to: string;
  mode: RouteConnection["mode"] | null;
  modeLabel: string;
  planningMinutes: number | null;
  durationLabel: string;
  note: string;
  confidence: RouteConfidence | "unknown";
};

export type PublicRouteStop = {
  id: string;
  name: string;
  country: string;
  coordinates: [number, number];
  nights: number;
  days: number;
  dayStart: number;
  dayEnd: number;
  dayLabel: string;
  reason: string;
  onward: PublicRouteConnection | null;
};

export type PublicRoutePlanDraft = {
  routeKey: string;
  routeTitle: string;
  origin: string;
  originCoordinates: [number, number];
  originCanonicalPlaceId?: string;
  originCountry?: string;
  destinations: Array<{
    id: string;
    name: string;
    country: string;
    canonicalPlaceId?: string;
    coordinates: [number, number];
  }>;
  durationDays: number;
  nightAllocations: Record<string, number>;
  countries: string[];
  interests: string[];
  routeHints: string[];
  curatedRoute?: CuratedRouteKnowledge;
  structuredBrief: StructuredTripBrief;
};

export type PublicRouteDetail = {
  key: string;
  title: string;
  eyebrow: string;
  summary: string;
  heroImage: string;
  durationDays: number;
  totalNights: number;
  rhythm?: string;
  interestLabel: string;
  countries: string[];
  stops: PublicRouteStop[];
  reasons: string[];
  warnings: string[];
  bestTime?: string;
  conditions?: string;
  countryContext?: string;
  seasonalNotes: string[];
  attractions: PublicRouteAttraction[];
  sources: RouteFamily["sourceLinks"];
  confidence: RouteConfidence;
  reviewedAt: string;
  planDraft: PublicRoutePlanDraft;
  dataIssues: Array<"allocation-compromise" | "country-mismatch" | "missing-attractions" | "missing-hero" | "unknown-transfer">;
};

const unique = (values: string[]) => values.filter((value, index, all) => all.indexOf(value) === index);
const routeFamilyNightKnowledge = createDestinationKnowledgeStore({ destinations: [], transfers: [] });

export function canonicalPublicRouteSlug(slug: string) {
  return LEGACY_PUBLIC_ROUTE_SLUGS[slug] ?? slug;
}

function titleCase(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizedPlaceName(value: string) {
  return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function formatPlanningMinutes(minutes: number | null) {
  if (!minutes) return "Transport to confirm";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const timing = `${hours ? `${hours}h` : ""}${hours && remainder ? " " : ""}${remainder ? `${remainder}m` : ""}`;
  return `Approx. ${timing}`;
}

function connectionFor(route: RouteFamily, from: string, to: string): PublicRouteConnection {
  const connection = route.connections.find((item) => item.from === from && item.to === to);
  if (!connection) {
    return {
      from,
      to,
      mode: null,
      modeLabel: "Transfer",
      planningMinutes: null,
      durationLabel: "Transport to confirm",
      note: "No reviewed transfer allowance is currently attached to this leg.",
      confidence: "unknown",
    };
  }
  return {
    from,
    to,
    mode: connection.mode,
    modeLabel: titleCase(connection.mode),
    planningMinutes: connection.planningMinutes,
    durationLabel: formatPlanningMinutes(connection.planningMinutes),
    note: connection.note,
    confidence: connection.confidence,
  };
}

function planDraftFor(route: RouteFamily, detail: Omit<PublicRouteDetail, "planDraft">): PublicRoutePlanDraft {
  const seed = inspirationByKey[route.key];
  const first = route.stops[0]!;
  const last = route.stops.at(-1)!;
  const middle = route.stops.slice(1, -1).map((stop) => stop.name);
  const prompt = middle.length
    ? `${detail.durationDays} days. Start in ${first.name}, continue through ${middle.join(", ")}, and finish in ${last.name}.`
    : `${detail.durationDays} days. Start in ${first.name} and finish in ${last.name}.`;
  const captured = captureJourneyBrief(prompt);
  const originName = seed?.origin ?? first.name;
  const canonicalOrigin = matchCatalogPlace(originName);
  const destinations = route.stops.map((stop, index) => {
    const canonical = matchCatalogPlace(stop.name);
    const mention = captured.mentions.find((item) => (Boolean(canonical?.canonicalPlaceId) && item.canonicalPlaceId === canonical?.canonicalPlaceId)
      || normalizedPlaceName(item.canonicalName) === normalizedPlaceName(stop.name));
    return {
      id: seed?.stops[index]?.id ?? `route-${route.key}-${index}`,
      name: stop.name,
      canonicalPlaceId: canonical?.canonicalPlaceId,
      placeMentionId: mention?.mentionId,
      placeType: canonical?.placeType,
      resolutionStatus: mention?.status ?? (canonical ? "resolved" as const : undefined),
      routability: canonical?.routability,
      sourceLabel: canonical?.provenance.label,
      parentCountries: canonical ? [...canonical.parentCountries] : [stop.country],
      role: index === 0 ? "arrival-gateway" as const : index === route.stops.length - 1 ? "departure-gateway" as const : "preferred" as const,
      priority: "normal" as const,
    };
  });
  const pace = publicRouteEditorial[route.key]?.rhythm === "Unhurried" || publicRouteEditorial[route.key]?.rhythm === "Altitude-aware"
    ? "relaxed" as const
    : undefined;
  const mergedBrief = mergeStructuredTripBrief(captured.structuredBrief, {
    duration: { value: detail.durationDays, unit: "days", precision: "approximate" },
    destinations,
    countries: detail.countries,
    pace,
    interests: route.interests,
  });
  const hasOperationalRoute = route.stops.every((stop) => Boolean(stop.country)
    && Number.isFinite(stop.coordinates[0])
    && Number.isFinite(stop.coordinates[1]));
  const structuredBrief: StructuredTripBrief = {
    ...mergedBrief,
    placeIssues: (mergedBrief.placeIssues ?? []).map((issue) => hasOperationalRoute
      && (issue.code === "unresolved_place" || issue.code === "region_requires_base")
      ? {
          ...issue,
          severity: "warning" as const,
          blocksRoute: false,
          message: `${issue.message} Morrovia will keep the reviewed route stop and coordinates unless you choose a different base.`,
        }
      : issue),
  };
  return {
    routeKey: route.key,
    routeTitle: route.title,
    origin: originName,
    originCoordinates: [...(seed?.originCoordinates ?? first.coordinates)] as [number, number],
    originCanonicalPlaceId: canonicalOrigin?.canonicalPlaceId,
    originCountry: canonicalOrigin?.parentCountries[0] ?? first.country,
    destinations: route.stops.map((stop, index) => ({
      id: seed?.stops[index]?.id ?? `route-${route.key}-${index}`,
      name: stop.name,
      country: stop.country,
      canonicalPlaceId: destinations[index]?.canonicalPlaceId,
      coordinates: [...stop.coordinates] as [number, number],
    })),
    durationDays: detail.durationDays,
    nightAllocations: Object.fromEntries(detail.stops.map((stop) => [stop.id, stop.nights])),
    countries: [...detail.countries],
    interests: [...route.interests],
    routeHints: route.stops.map((stop) => stop.reason),
    ...(isBetaCuratedRoute(route.key) ? {
      curatedRoute: curatedRouteKnowledgeFor(route, detail.stops.map((stop) => ({
        id: stop.id,
        name: stop.name,
        country: stop.country,
        canonicalPlaceId: destinations.find((destination) => destination.id === stop.id)?.canonicalPlaceId,
        nights: stop.nights,
      }))),
    } : {}),
    structuredBrief,
  };
}

export function publicRouteDetailFor(inputSlug: string): PublicRouteDetail | null {
  const key = canonicalPublicRouteSlug(inputSlug);
  const route = routeFamilyByKey[key];
  const seed = inspirationByKey[key];
  if (!route || !seed || !route.stops.length || route.stops.some((stop) => !stop.country
    || !Number.isFinite(stop.coordinates[0]) || !Number.isFinite(stop.coordinates[1]))) return null;
  const editorial = publicRouteEditorial[key];
  const durationDays = editorial?.durationDays ?? route.suggestedDays.ideal;
  const totalNights = Math.max(0, durationDays - 1);
  const allocation = allocateTripNights({
    totalNights,
    pace: editorial?.rhythm === "Unhurried" || editorial?.rhythm === "Altitude-aware" ? "relaxed" : "balanced",
    stops: route.stops.map((stop, index) => ({
      id: seed.stops[index]?.id ?? `route-${key}-${index}`,
      name: stop.name,
      country: stop.country,
      required: true,
      fallbackMinimumNights: stop.minimumNights,
      fallbackIdealNights: stop.minimumNights + 1,
    })),
    // RouteFamily stay guidance is the public editorial contract. Destination
    // knowledge must not silently override it on this read-only surface.
    knowledge: routeFamilyNightKnowledge,
  });
  if (allocation.state === "conflict" || !allocation.allocations) return null;
  const stopIds = route.stops.map((_, index) => seed.stops[index]?.id ?? `route-${key}-${index}`);
  const calendarDays = calendarDayAllocationsFromNights(stopIds, allocation.allocations);
  let dayCursor = 1;
  const stops = route.stops.map((stop, index): PublicRouteStop => {
    const id = stopIds[index];
    const days = calendarDays[id] ?? 0;
    const dayStart = dayCursor;
    const dayEnd = dayCursor + Math.max(0, days - 1);
    dayCursor = dayEnd + 1;
    const next = route.stops[index + 1];
    return {
      id,
      name: stop.name,
      country: stop.country,
      coordinates: [...stop.coordinates] as [number, number],
      nights: allocation.allocations?.[id] ?? 0,
      days,
      dayStart,
      dayEnd,
      dayLabel: dayStart === dayEnd ? `Day ${dayStart}` : `Days ${dayStart}–${dayEnd}`,
      reason: stop.reason,
      onward: next ? connectionFor(route, stop.name, next.name) : null,
    };
  });
  const countries = unique(route.stops.map((stop) => stop.country));
  const warnings = unique([
    ...allocation.conflicts.map((conflict) => conflict.message),
    ...stops.flatMap((stop) => stop.onward?.confidence === "needs-review" ? [stop.onward.note] : []),
    ...(stops.some((stop) => stop.onward?.confidence === "unknown") ? ["Transport between some bases still needs confirmation."] : []),
  ]).slice(0, 3);
  const attractions = editorial?.attractions ?? (route.highlights ?? []).map((name) => ({ name }));
  const dataIssues: PublicRouteDetail["dataIssues"] = [];
  if (allocation.state === "compromised") dataIssues.push("allocation-compromise");
  if (countries.join("|") !== unique(route.countries).join("|")) dataIssues.push("country-mismatch");
  if (!attractions.length) dataIssues.push("missing-attractions");
  if (!(routeImages[key] ?? "")) dataIssues.push("missing-hero");
  if (stops.some((stop) => stop.onward?.confidence === "unknown")) dataIssues.push("unknown-transfer");
  const detailWithoutDraft: Omit<PublicRouteDetail, "planDraft"> = {
    key,
    title: route.title,
    eyebrow: editorial?.eyebrow ?? `${titleCase(route.region)} · ${route.interests.slice(0, 2).join(" and ")}`,
    summary: editorial?.summary ?? route.bestFor,
    heroImage: routeImages[key] ?? "",
    durationDays,
    totalNights,
    rhythm: editorial?.rhythm,
    interestLabel: route.interests.slice(0, 2).map(titleCase).join(" · "),
    countries,
    stops,
    reasons: route.stops.map((stop) => stop.reason).slice(0, 3),
    warnings,
    bestTime: editorial?.bestTime,
    conditions: editorial?.conditions,
    countryContext: editorial?.countryContext,
    seasonalNotes: [...route.seasonalNotes],
    attractions: attractions.map((attraction) => ({ ...attraction })),
    sources: route.sourceLinks.map((source) => ({ ...source })),
    confidence: route.confidence,
    reviewedAt: route.reviewedAt,
    dataIssues,
  };
  return { ...detailWithoutDraft, planDraft: planDraftFor(route, detailWithoutDraft) };
}

export function publicRouteSitemapKeys() {
  return publicRoutePublishedFamilies().map((route) => route.key);
}

/**
 * The single hard publication boundary shared by Discover, Route Detail and
 * the sitemap. Admin controls may further hide these routes, but cannot make
 * an ineligible or unresolved route public.
 */
export function publicRoutePublishedFamilies() {
  return Object.values(routeFamilyByKey).filter((route) => (
    isIndexablePublicRoute({ confidence: route.confidence, stops: route.stops, sources: route.sourceLinks })
    && publicRouteDetailFor(route.key) !== null
  ));
}

export function isPublishedPublicRouteKey(key: string) {
  const route = routeFamilyByKey[key];
  return Boolean(
    route
    && isIndexablePublicRoute({ confidence: route.confidence, stops: route.stops, sources: route.sourceLinks })
    && publicRouteDetailFor(key),
  );
}

export function isIndexablePublicRoute(route: {
  confidence: RouteConfidence;
  stops: readonly unknown[];
  sources: readonly unknown[];
}) {
  return route.confidence !== "needs-review" && route.stops.length >= 2 && route.sources.length > 0;
}

export function publicRouteEditorialKeys() {
  return Object.keys(publicRouteEditorial);
}
