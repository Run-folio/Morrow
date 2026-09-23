import { countryCodeFor } from "./country-registry.ts";
import type { FixedCommitmentConstraint } from "./fixed-commitment.ts";
import type { PlannerStop } from "./planner.ts";

export type RouteCountryBlock = {
  countryCode: string;
  stopIds: string[];
  spanIndex: number;
  startIndex: number;
  endIndex: number;
};

export type RouteCountryContinuity = {
  knownStopCount: number;
  unknownCountryStopIds: string[];
  knownSpanCount: number;
  blockCount: number;
  blocks: RouteCountryBlock[];
  blocksByCountry: Record<string, number>;
  reentriesByCountry: Record<string, number>;
  reentryCount: number;
  repeatedCountryCodes: string[];
};

export type CountryContinuityStatus =
  | "avoidable"
  | "proven-constraint-driven"
  | "unproven-protected";

export type CountryContinuityConstraintProof = {
  countryCode: string;
  kind:
    | "fixed-position-chronology"
    | "fixed-gateway-position"
    | "authoritative-protected-order"
    | "hard-transport-rejection";
  stopIds: string[];
  constraintIds: string[];
};

export type CountryContinuityAssessment = {
  countryCode: string;
  status: CountryContinuityStatus;
  blockCount: number;
  reentryCount: number;
  observedLowerBlockCount?: number;
  affectedStopIds: string[];
  legIndexes: number[];
  proof?: CountryContinuityConstraintProof;
};

export function canonicalCountryCodeForStop(stop: Pick<PlannerStop, "country" | "countryCode">) {
  return typeof stop.countryCode === "string"
    ? countryCodeFor(stop.countryCode)
    : countryCodeFor(stop.country);
}

export function analyzeRouteCountryContinuity(stops: readonly PlannerStop[]): RouteCountryContinuity {
  const blocks: RouteCountryBlock[] = [];
  const unknownCountryStopIds: string[] = [];
  let spanIndex = -1;
  let insideKnownSpan = false;
  let knownStopCount = 0;

  stops.forEach((stop, index) => {
    const countryCode = canonicalCountryCodeForStop(stop);
    if (!countryCode) {
      unknownCountryStopIds.push(stop.id);
      insideKnownSpan = false;
      return;
    }

    knownStopCount += 1;
    if (!insideKnownSpan) {
      spanIndex += 1;
      insideKnownSpan = true;
    }
    const previous = blocks.at(-1);
    if (previous?.spanIndex === spanIndex && previous.countryCode === countryCode) {
      previous.stopIds.push(stop.id);
      previous.endIndex = index;
      return;
    }
    blocks.push({
      countryCode,
      stopIds: [stop.id],
      spanIndex,
      startIndex: index,
      endIndex: index,
    });
  });

  const blocksByCountry: Record<string, number> = {};
  const spanBlocksByCountry = new Map<number, Map<string, number>>();
  for (const block of blocks) {
    blocksByCountry[block.countryCode] = (blocksByCountry[block.countryCode] ?? 0) + 1;
    const spanCounts = spanBlocksByCountry.get(block.spanIndex) ?? new Map<string, number>();
    spanCounts.set(block.countryCode, (spanCounts.get(block.countryCode) ?? 0) + 1);
    spanBlocksByCountry.set(block.spanIndex, spanCounts);
  }

  const reentriesByCountry: Record<string, number> = {};
  for (const spanCounts of spanBlocksByCountry.values()) {
    for (const [countryCode, blockCount] of spanCounts) {
      const reentries = Math.max(0, blockCount - 1);
      if (reentries) reentriesByCountry[countryCode] = (reentriesByCountry[countryCode] ?? 0) + reentries;
    }
  }
  const repeatedCountryCodes = blocks
    .map((block) => block.countryCode)
    .filter((countryCode, index, all) => Boolean(reentriesByCountry[countryCode]) && all.indexOf(countryCode) === index);

  return {
    knownStopCount,
    unknownCountryStopIds,
    knownSpanCount: spanIndex + 1,
    blockCount: blocks.length,
    blocks,
    blocksByCountry,
    reentriesByCountry,
    reentryCount: Object.values(reentriesByCountry).reduce((total, count) => total + count, 0),
    repeatedCountryCodes,
  };
}

function repeatedSpanIndexes(route: RouteCountryContinuity, countryCode: string) {
  const counts = new Map<number, number>();
  route.blocks.filter((block) => block.countryCode === countryCode).forEach((block) => {
    counts.set(block.spanIndex, (counts.get(block.spanIndex) ?? 0) + 1);
  });
  return new Set([...counts].filter(([, count]) => count > 1).map(([index]) => index));
}

export function classifyCountryContinuity(input: {
  route: RouteCountryContinuity;
  viableAlternatives: readonly RouteCountryContinuity[];
  proofs?: readonly CountryContinuityConstraintProof[];
}): CountryContinuityAssessment[] {
  return input.route.repeatedCountryCodes.map((countryCode) => {
    const currentBlocks = input.route.blocksByCountry[countryCode] ?? 0;
    const currentReentries = input.route.reentriesByCountry[countryCode] ?? 0;
    const lowerAlternatives = input.viableAlternatives.filter((alternative) =>
      (alternative.reentriesByCountry[countryCode] ?? 0) < currentReentries);
    const observedLowerBlockCount = lowerAlternatives.length
      ? Math.min(...lowerAlternatives.map((alternative) => alternative.blocksByCountry[countryCode] ?? 0))
      : undefined;
    const proof = input.proofs?.find((item) => item.countryCode === countryCode);
    const repeatedSpans = repeatedSpanIndexes(input.route, countryCode);
    const affectedBlocks = input.route.blocks.filter((block) =>
      block.countryCode === countryCode && repeatedSpans.has(block.spanIndex));
    const firstBlockBySpan = new Set<number>();
    const legIndexes = affectedBlocks.flatMap((block) => {
      if (!firstBlockBySpan.has(block.spanIndex)) {
        firstBlockBySpan.add(block.spanIndex);
        return [];
      }
      return [block.startIndex];
    });

    return {
      countryCode,
      status: observedLowerBlockCount !== undefined
        ? "avoidable" as const
        : proof
          ? "proven-constraint-driven" as const
          : "unproven-protected" as const,
      blockCount: currentBlocks,
      reentryCount: currentReentries,
      ...(observedLowerBlockCount === undefined ? {} : { observedLowerBlockCount }),
      affectedStopIds: affectedBlocks.flatMap((block) => block.stopIds),
      legIndexes,
      ...(observedLowerBlockCount === undefined && proof ? { proof } : {}),
    };
  });
}

export function fixedGatewayCountryContinuityProofs(
  stops: readonly PlannerStop[],
  constraints: { fixedStartStopId?: string; fixedEndStopId?: string } | undefined,
): CountryContinuityConstraintProof[] {
  if (!constraints?.fixedStartStopId || !constraints.fixedEndStopId) return [];
  const start = stops.find((stop) => stop.id === constraints.fixedStartStopId);
  const end = stops.find((stop) => stop.id === constraints.fixedEndStopId);
  if (!start || !end || start.id === end.id) return [];
  const countryCode = canonicalCountryCodeForStop(start);
  if (!countryCode || canonicalCountryCodeForStop(end) !== countryCode) return [];
  const between = stops.filter((stop) => {
    if (stop.id === start.id || stop.id === end.id) return false;
    const code = canonicalCountryCodeForStop(stop);
    return Boolean(code && code !== countryCode);
  });
  if (!between.length) return [];
  return [{
    countryCode,
    kind: "fixed-gateway-position",
    stopIds: [start.id, ...between.map((stop) => stop.id), end.id],
    constraintIds: [`fixed-start:${start.id}`, `fixed-end:${end.id}`],
  }];
}

const canonicalDate = (value: string | undefined) => value && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  ? value
  : null;

export function fixedChronologyCountryContinuityProofs(
  stops: readonly PlannerStop[],
  commitments: readonly FixedCommitmentConstraint[] | undefined,
): CountryContinuityConstraintProof[] {
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const linked = (commitments ?? []).flatMap((commitment) => {
    const date = canonicalDate(commitment.date);
    const stop = commitment.stopId ? byId.get(commitment.stopId) : undefined;
    return date && stop ? [{ commitment, date, stop }] : [];
  }).sort((left, right) => left.date.localeCompare(right.date) || left.stop.id.localeCompare(right.stop.id));
  if (linked.length < 3 || new Set(linked.map((item) => item.date)).size !== linked.length) return [];

  const continuity = analyzeRouteCountryContinuity(linked.map((item) => item.stop));
  return continuity.repeatedCountryCodes.map((countryCode) => ({
    countryCode,
    kind: "fixed-position-chronology" as const,
    stopIds: linked.map((item) => item.stop.id),
    constraintIds: linked.map((item) => `fixed-commitment:${item.stop.id}:${item.date}`),
  }));
}

export function hardTransportCountryContinuityProofs(
  rejections: readonly {
    countryCode: string;
    stopIds: string[];
    issueCodes: readonly string[];
    constraintIds: string[];
  }[],
): CountryContinuityConstraintProof[] {
  return rejections.flatMap((rejection) => rejection.issueCodes.some((code) =>
    code === "forbidden-transport-mode" || code === "maximum-transfer-time-exceeded")
    ? [{
      countryCode: rejection.countryCode,
      kind: "hard-transport-rejection" as const,
      stopIds: [...rejection.stopIds],
      constraintIds: [...rejection.constraintIds],
    }]
    : []);
}
