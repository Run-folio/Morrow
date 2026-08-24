import type { RouteConfidence, RouteFamily } from "./route-catalog.ts";

/** The only route families whose editorial facts are a beta planning contract. */
export const BETA_CURATED_ROUTE_KEYS = ["japan-slow", "andean-highlands", "portugal-atlantic"] as const;

export function isBetaCuratedRoute(routeKey: string): routeKey is (typeof BETA_CURATED_ROUTE_KEYS)[number] {
  return (BETA_CURATED_ROUTE_KEYS as readonly string[]).includes(routeKey);
}

export type CuratedRouteCoverage = {
  state: "fully-supported" | "partially-supported" | "outside-supported-route";
  reason: string;
};

/**
 * The reviewed facts behind a public route. This is intentionally a compact
 * snapshot, not a second planner: it lets an editable trip retain exactly the
 * evidence it started with and makes any departure from that evidence visible.
 */
export type CuratedRouteKnowledge = {
  version: 1;
  routeKey: string;
  routeTitle: string;
  confidence: RouteConfidence;
  reviewedAt: string;
  freshness: "reviewed";
  sources: Array<{ id: string; label: string; url: string; covers: string }>;
  canonicalStopIds: string[];
  stops: Array<{
    stopId: string;
    name: string;
    country: string;
    canonicalPlaceId?: string;
    minimumNights: number;
    recommendedNights: number;
    reason: string;
    sourceIds: string[];
  }>;
  connections: Array<{
    fromStopId: string;
    toStopId: string;
    mode: "train" | "road" | "flight" | "ferry" | "unknown";
    planningMinutes: number | null;
    note: string;
    confidence: RouteConfidence | "unknown";
    sourceIds: string[];
  }>;
  coverage: CuratedRouteCoverage;
};

type CuratedRouteStopInput = {
  id: string;
  name: string;
  country: string;
  canonicalPlaceId?: string;
  nights: number;
};

const modeForTrip = (mode: RouteFamily["connections"][number]["mode"]): CuratedRouteKnowledge["connections"][number]["mode"] =>
  mode === "bus" ? "road" : mode;

export function curatedRouteKnowledgeFor(route: RouteFamily, stops: CuratedRouteStopInput[]): CuratedRouteKnowledge {
  const sources = route.sourceLinks.map((source, index) => ({ ...source, id: `${route.key}:source:${index + 1}` }));
  const sourceIds = sources.map((source) => source.id);
  const stopByName = new Map(stops.map((stop) => [stop.name, stop]));
  return {
    version: 1,
    routeKey: route.key,
    routeTitle: route.title,
    confidence: route.confidence,
    reviewedAt: route.reviewedAt,
    freshness: "reviewed",
    sources,
    canonicalStopIds: stops.map((stop) => stop.id),
    stops: route.stops.map((stop, index) => ({
      stopId: stops[index]?.id ?? `route-${route.key}-${index}`,
      name: stop.name,
      country: stop.country,
      canonicalPlaceId: stopByName.get(stop.name)?.canonicalPlaceId,
      minimumNights: stop.minimumNights,
      recommendedNights: Math.max(stop.minimumNights, stops[index]?.nights ?? stop.minimumNights),
      reason: stop.reason,
      sourceIds,
    })),
    connections: route.connections.map((connection) => ({
      fromStopId: stopByName.get(connection.from)?.id ?? connection.from,
      toStopId: stopByName.get(connection.to)?.id ?? connection.to,
      mode: modeForTrip(connection.mode),
      planningMinutes: connection.planningMinutes,
      note: connection.note,
      confidence: connection.confidence,
      sourceIds,
    })),
    coverage: { state: "fully-supported", reason: "This trip still follows the reviewed route order and bases." },
  };
}

export function reconcileCuratedRouteKnowledge(
  knowledge: CuratedRouteKnowledge | undefined,
  stopIds: readonly string[],
): CuratedRouteKnowledge | undefined {
  if (!knowledge) return undefined;
  const canonical = knowledge.canonicalStopIds;
  const exact = canonical.length === stopIds.length && canonical.every((id, index) => id === stopIds[index]);
  const hasUnsupportedStop = stopIds.some((id) => !canonical.includes(id));
  const coverage: CuratedRouteCoverage = exact
    ? { state: "fully-supported", reason: "This trip still follows the reviewed route order and bases." }
    : hasUnsupportedStop
      ? { state: "outside-supported-route", reason: "This edit adds a base outside the reviewed route. Only matching original facts remain supported." }
      : { state: "partially-supported", reason: "This edit changes the reviewed route shape. Matching base and transfer facts remain supported; changed legs need confirmation." };
  return { ...knowledge, coverage };
}

export function curatedStopFor(knowledge: CuratedRouteKnowledge | undefined, stopId: string) {
  return knowledge?.stops.find((stop) => stop.stopId === stopId);
}

export function curatedConnectionFor(knowledge: CuratedRouteKnowledge | undefined, fromStopId: string, toStopId: string) {
  return knowledge?.connections.find((connection) => connection.fromStopId === fromStopId && connection.toStopId === toStopId);
}
