import type { EstimatedLeg, PlannerStop, RoutePlanningConstraints } from "./planner.ts";

export type RouteCandidateSource =
  | "existing"
  | "permutation"
  | "nearest-neighbour"
  | "geographic"
  | "reverse"
  | "local-swap";

export type RouteConstraintIssue = {
  code:
    | "duplicate-stop-id"
    | "fixed-start-missing"
    | "fixed-end-missing"
    | "fixed-endpoint-conflict"
    | "required-stop-missing"
    | "excluded-stop-present"
    | "maximum-stops-exceeded"
    | "required-stops-exceed-maximum"
    | "fixed-commitment-conflict"
    | "forbidden-transport-mode";
  message: string;
  stopIds: string[];
};

export type RouteCandidate = {
  stops: PlannerStop[];
  source: RouteCandidateSource;
  constraintsSatisfied: true;
  constraintIssues: [];
  metadata: {
    reordered: boolean;
    candidateIndex: number;
    matchesOriginalOrder: boolean;
    generatedByMorrovia: boolean;
    derivedFromCurrentRouteIntelligence: boolean;
    routeComparisonAvailable: boolean;
    estimatedTransferMinutes: number | null;
  };
};

export type RouteCandidateGeneration = {
  candidates: RouteCandidate[];
  constraintIssues: RouteConstraintIssue[];
  strategy: "exhaustive" | "bounded";
  rawCandidateCount: number;
  rejectedCandidateCount: number;
  truncated: boolean;
};

type RouteOrigin = { name: string; coordinates?: [number, number] };
type LegEstimator = (from: RouteOrigin | PlannerStop, to: PlannerStop) => EstimatedLeg;
type CandidateSeed = { stops: PlannerStop[]; source: RouteCandidateSource };

const EXHAUSTIVE_FLEXIBLE_STOP_LIMIT = 6;
const MAX_BOUNDED_CANDIDATES = 20;

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)])
    .map((rest) => [item, ...rest]));
}

const orderKey = (stops: PlannerStop[]) => stops.map((stop) => stop.id).join("\u001f");

function sameOrder(left: PlannerStop[], right: PlannerStop[]) {
  return left.length === right.length && left.every((stop, index) => stop.id === right[index]?.id);
}

function routeEstimate(origin: RouteOrigin, stops: PlannerStop[], estimateLeg: LegEstimator) {
  const legs = origin.coordinates
    ? stops.map((stop, index) => estimateLeg(index ? stops[index - 1] : origin, stop))
    : stops.slice(1).map((stop, index) => estimateLeg(stops[index], stop));
  if (legs.some((leg) => leg.durationMinutes === null)) return { legs, minutes: null };
  return { legs, minutes: legs.reduce((total, leg) => total + (leg.durationMinutes ?? 0), 0) };
}

function fixedParts(stops: PlannerStop[], constraints: RoutePlanningConstraints | undefined) {
  const start = constraints?.fixedStartStopId ? stops.find((stop) => stop.id === constraints.fixedStartStopId) : undefined;
  const end = constraints?.fixedEndStopId ? stops.find((stop) => stop.id === constraints.fixedEndStopId) : undefined;
  const flexible = stops.filter((stop) => stop.id !== start?.id && stop.id !== end?.id);
  return { start, end, flexible };
}

function wrapFlexible(stops: PlannerStop[], start?: PlannerStop, end?: PlannerStop) {
  return [...(start ? [start] : []), ...stops, ...(end ? [end] : [])];
}

function nearestNeighbour(origin: RouteOrigin | PlannerStop, stops: PlannerStop[], estimateLeg: LegEstimator) {
  const remaining = [...stops];
  const ordered: PlannerStop[] = [];
  let previous: RouteOrigin | PlannerStop = origin;
  while (remaining.length) {
    const next = remaining
      .map((stop, index) => ({ stop, index, leg: estimateLeg(previous, stop) }))
      .sort((left, right) => {
        const leftCost = left.leg.durationMinutes ?? left.leg.distanceKm ?? Number.POSITIVE_INFINITY;
        const rightCost = right.leg.durationMinutes ?? right.leg.distanceKm ?? Number.POSITIVE_INFINITY;
        return leftCost - rightCost || left.index - right.index;
      })[0];
    if (!next) break;
    ordered.push(next.stop);
    remaining.splice(next.index, 1);
    previous = next.stop;
  }
  return ordered;
}

function globalConstraintIssues(stops: PlannerStop[], constraints?: RoutePlanningConstraints) {
  const issues: RouteConstraintIssue[] = [];
  const duplicateIds = stops.filter((stop, index) => stops.findIndex((item) => item.id === stop.id) !== index).map((stop) => stop.id);
  if (duplicateIds.length) issues.push({ code: "duplicate-stop-id", message: "Route candidates require a stable, unique ID for every stop.", stopIds: [...new Set(duplicateIds)] });

  if (constraints?.fixedStartStopId && !stops.some((stop) => stop.id === constraints.fixedStartStopId)) {
    issues.push({ code: "fixed-start-missing", message: "The required starting stop is not present in the route input.", stopIds: [constraints.fixedStartStopId] });
  }
  if (constraints?.fixedEndStopId && !stops.some((stop) => stop.id === constraints.fixedEndStopId)) {
    issues.push({ code: "fixed-end-missing", message: "The required departure stop is not present in the route input.", stopIds: [constraints.fixedEndStopId] });
  }
  if (stops.length > 1 && constraints?.fixedStartStopId && constraints.fixedStartStopId === constraints.fixedEndStopId) {
    issues.push({ code: "fixed-endpoint-conflict", message: "A multi-stop route cannot use the same stop as both fixed start and fixed end.", stopIds: [constraints.fixedStartStopId] });
  }

  const requiredStopIds = [...new Set(constraints?.requiredStopIds ?? [])];
  const missingRequired = requiredStopIds.filter((id) => !stops.some((stop) => stop.id === id));
  if (missingRequired.length) issues.push({ code: "required-stop-missing", message: "One or more required destinations are missing from the route input.", stopIds: missingRequired });
  const presentExcluded = (constraints?.excludedStopIds ?? []).filter((id) => stops.some((stop) => stop.id === id));
  if (presentExcluded.length) issues.push({ code: "excluded-stop-present", message: "A destination explicitly excluded by the traveller is still present in the route input.", stopIds: presentExcluded });
  if (constraints?.maximumStops !== undefined && requiredStopIds.length > constraints.maximumStops) {
    issues.push({ code: "required-stops-exceed-maximum", message: `The ${requiredStopIds.length} required stops cannot fit within the maximum of ${constraints.maximumStops}.`, stopIds: requiredStopIds });
  }
  if (constraints?.maximumStops !== undefined && stops.length > constraints.maximumStops) {
    issues.push({ code: "maximum-stops-exceeded", message: `The route has ${stops.length} stops but the hard maximum is ${constraints.maximumStops}; no destination was removed automatically.`, stopIds: stops.map((stop) => stop.id) });
  }
  return issues;
}

function candidateIssues(
  origin: RouteOrigin,
  stops: PlannerStop[],
  constraints: RoutePlanningConstraints | undefined,
  estimateLeg: LegEstimator,
) {
  const issues: RouteConstraintIssue[] = [];
  if (constraints?.fixedStartStopId && stops[0]?.id !== constraints.fixedStartStopId) {
    issues.push({ code: "fixed-start-missing", message: "Candidate does not preserve the fixed starting stop.", stopIds: [constraints.fixedStartStopId] });
  }
  if (constraints?.fixedEndStopId && stops.at(-1)?.id !== constraints.fixedEndStopId) {
    issues.push({ code: "fixed-end-missing", message: "Candidate does not preserve the fixed departure stop.", stopIds: [constraints.fixedEndStopId] });
  }
  const missingRequired = (constraints?.requiredStopIds ?? []).filter((id) => !stops.some((stop) => stop.id === id));
  if (missingRequired.length) issues.push({ code: "required-stop-missing", message: "Candidate omits a required destination.", stopIds: missingRequired });
  const presentExcluded = (constraints?.excludedStopIds ?? []).filter((id) => stops.some((stop) => stop.id === id));
  if (presentExcluded.length) issues.push({ code: "excluded-stop-present", message: "Candidate retains an explicitly excluded destination.", stopIds: presentExcluded });
  if (constraints?.maximumStops !== undefined && stops.length > constraints.maximumStops) {
    issues.push({ code: "maximum-stops-exceeded", message: "Candidate exceeds the supplied hard maximum stop count.", stopIds: stops.map((stop) => stop.id) });
  }

  const forbiddenModes = new Set<EstimatedLeg["mode"]>(constraints?.excludedTransportModes ?? []);
  if (constraints?.avoidDriving) forbiddenModes.add("road");
  if (forbiddenModes.size) {
    const { legs } = routeEstimate(origin, stops, estimateLeg);
    const conflicts = legs.filter((leg) => forbiddenModes.has(leg.mode));
    if (conflicts.length) {
      issues.push({
        code: "forbidden-transport-mode",
        message: `Existing route data establishes ${conflicts.map((leg) => leg.mode).filter((mode, index, all) => all.indexOf(mode) === index).join(" or ")} on this ordering, which conflicts with a hard transport constraint.`,
        stopIds: stops.map((stop) => stop.id),
      });
    }
  }
  return issues;
}

function boundedSeeds(origin: RouteOrigin, flexible: PlannerStop[], start: PlannerStop | undefined, end: PlannerStop | undefined, estimateLeg: LegEstimator) {
  const seeds: CandidateSeed[] = [];
  const add = (stops: PlannerStop[], source: RouteCandidateSource) => seeds.push({ stops: wrapFlexible(stops, start, end), source });
  add(flexible, "existing");
  add([...flexible].reverse(), "reverse");
  add(nearestNeighbour(start ?? origin, flexible, estimateLeg), "nearest-neighbour");
  add([...flexible].sort((a, b) => (a.coordinates?.[0] ?? 0) - (b.coordinates?.[0] ?? 0)), "geographic");
  add([...flexible].sort((a, b) => (b.coordinates?.[0] ?? 0) - (a.coordinates?.[0] ?? 0)), "geographic");
  add([...flexible].sort((a, b) => (a.coordinates?.[1] ?? 0) - (b.coordinates?.[1] ?? 0)), "geographic");
  add([...flexible].sort((a, b) => (b.coordinates?.[1] ?? 0) - (a.coordinates?.[1] ?? 0)), "geographic");
  for (let index = 0; index < flexible.length - 1 && seeds.length < MAX_BOUNDED_CANDIDATES; index += 1) {
    const swapped = [...flexible];
    [swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]];
    add(swapped, "local-swap");
  }
  return seeds.slice(0, MAX_BOUNDED_CANDIDATES);
}

/**
 * Generates viable route orders only. It deliberately applies no route score:
 * selection remains the responsibility of the existing route-intelligence
 * layer and, later, the dedicated scoring boundary.
 */
export function generateRouteCandidates(input: {
  origin: RouteOrigin;
  stops: PlannerStop[];
  constraints?: RoutePlanningConstraints;
  estimateLeg: LegEstimator;
}): RouteCandidateGeneration {
  const strategy = input.stops.length <= EXHAUSTIVE_FLEXIBLE_STOP_LIMIT ? "exhaustive" : "bounded";
  const globalIssues = globalConstraintIssues(input.stops, input.constraints);
  if (globalIssues.length) {
    return { candidates: [], constraintIssues: globalIssues, strategy, rawCandidateCount: 0, rejectedCandidateCount: 0, truncated: strategy === "bounded" };
  }

  const { start, end, flexible } = fixedParts(input.stops, input.constraints);
  const original = [...input.stops];
  let seeds: CandidateSeed[];
  if (input.constraints?.fixedCommitments?.length) {
    seeds = [{ stops: original, source: "existing" }];
  } else if (input.stops.length <= EXHAUSTIVE_FLEXIBLE_STOP_LIMIT) {
    seeds = permutations(flexible).map((middle) => {
      const stops = wrapFlexible(middle, start, end);
      return { stops, source: sameOrder(stops, original) ? "existing" as const : "permutation" as const };
    });
  } else {
    seeds = boundedSeeds(input.origin, flexible, start, end, input.estimateLeg);
    if (!sameOrder(seeds[0]?.stops ?? [], original)) seeds.unshift({ stops: original, source: "existing" });
  }

  const deduplicated = seeds.filter((seed, index, all) => all.findIndex((item) => orderKey(item.stops) === orderKey(seed.stops)) === index);
  const constraintIssues: RouteConstraintIssue[] = [];
  const viable = deduplicated.flatMap((seed) => {
    const issues = candidateIssues(input.origin, seed.stops, input.constraints, input.estimateLeg);
    issues.forEach((issue) => {
      const key = `${issue.code}:${issue.stopIds.join("|")}`;
      if (!constraintIssues.some((item) => `${item.code}:${item.stopIds.join("|")}` === key)) constraintIssues.push(issue);
    });
    if (issues.length) return [];
    const estimate = routeEstimate(input.origin, seed.stops, input.estimateLeg);
    return [{
      stops: seed.stops,
      source: seed.source,
      constraintsSatisfied: true as const,
      constraintIssues: [] as [],
      metadata: {
        reordered: !sameOrder(seed.stops, original),
        candidateIndex: 0,
        matchesOriginalOrder: sameOrder(seed.stops, original),
        generatedByMorrovia: seed.source !== "existing",
        derivedFromCurrentRouteIntelligence: seed.source === "nearest-neighbour",
        routeComparisonAvailable: estimate.minutes !== null,
        estimatedTransferMinutes: estimate.minutes,
      },
    }];
  }).map((candidate, candidateIndex) => ({ ...candidate, metadata: { ...candidate.metadata, candidateIndex } }));

  if (input.constraints?.fixedCommitments?.length && !viable.length) {
    constraintIssues.push({ code: "fixed-commitment-conflict", message: "The entered order is protected by a fixed commitment but conflicts with another hard route constraint.", stopIds: original.map((stop) => stop.id) });
  }

  return {
    candidates: viable,
    constraintIssues,
    strategy,
    rawCandidateCount: seeds.length,
    rejectedCandidateCount: deduplicated.length - viable.length,
    truncated: strategy === "bounded",
  };
}
