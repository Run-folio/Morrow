import {
  createDestinationKnowledgeStore,
  knownKnowledgeFact,
  unknownKnowledgeFact,
  type DestinationTransferKnowledge,
  type KnowledgeSource,
} from "../../lib/easyt/destination-knowledge.ts";
import { resolveCanonicalTransferJourney, type TransferResolutionDiagnostic } from "../../lib/easyt/multimodal-transfer-resolution.ts";
import { RoadRoutingError, type RoadRouteRequest, type RoadRouteResult, type RoadRoutingProvider } from "../../lib/easyt/road-routing.ts";
import { buildCanonicalTripLegs } from "../../lib/easyt/trip-legs.ts";
import { canonicalTransferSegments, transferJourneyModeLabel } from "../../lib/easyt/transfer-journey.ts";
import type { TransferSegment, TripLeg, TripTransferMode } from "../../lib/easyt/trip.ts";
import { TRANSFER_REALISM_FIXTURES, type TransferRealismFixture } from "./fixtures.ts";

export type TransferBenchmarkFailureCategory =
  | "A_missing_destination_knowledge"
  | "B_missing_provider_evidence"
  | "C_candidate_not_generated"
  | "D_candidate_incorrectly_rejected"
  | "E_scoring_selected_wrong_candidate"
  | "F_gateway_knowledge_missing_or_wrong"
  | "G_duration_implausible"
  | "H_provider_failure"
  | "I_presentation_wrong"
  | "J_unknown_is_appropriate";

export type TransferBenchmarkStatus = "correct" | "acceptable-not-ideal" | "clearly-wrong";

export type TransferBenchmarkFixtureResult = {
  id: string;
  region: TransferRealismFixture["region"];
  categories: readonly string[];
  route: string;
  preferredMode: TripTransferMode;
  acceptableModes: readonly TripTransferMode[];
  selectedMode: TripTransferMode;
  status: TransferBenchmarkStatus;
  durationMinutes: number | null;
  durationPlausible: boolean | null;
  gatewayCorrect: boolean | null;
  segmentIntegrity: boolean;
  presentationCorrect: boolean;
  deterministic: boolean | null;
  providerCalls: number;
  providerCallLimit: number;
  providerCallEfficient: boolean;
  duplicateProviderCalls: number;
  confidence: TripLeg["confidence"] | null;
  provenance: TripLeg["provenance"] | null;
  diagnostic: TransferResolutionDiagnostic;
  failureCategories: TransferBenchmarkFailureCategory[];
  failureOwnership: "none" | "engine" | "knowledge-or-provider" | "appropriate-uncertainty" | "mixed";
  rationale: string;
};

export type TransferBenchmarkMetrics = {
  preferredMode: { correct: number; total: number; percent: number };
  acceptableMode: { correct: number; total: number; percent: number };
  clearlyWrong: { count: number; total: number; percent: number };
  unknown: { count: number; total: number; percent: number; appropriate: number };
  durationPlausibility: { plausible: number; assessed: number; percent: number };
  gatewayComposition: { correct: number; assessed: number; percent: number };
  segmentIntegrity: { correct: number; total: number; percent: number };
  determinism: { correct: number; assessed: number; percent: number };
  providerEfficiency: {
    calls: number;
    allowedCalls: number;
    efficientFixtures: number;
    totalFixtures: number;
    duplicateCalls: number;
    percent: number;
  };
};

export type TransferBenchmarkSummary = {
  generatedBy: "canonical-transfer-realism-benchmark-v1";
  mode: "deterministic" | "live";
  fixtureCount: number;
  regions: string[];
  results: TransferBenchmarkFixtureResult[];
  statuses: Record<TransferBenchmarkStatus, number>;
  failureCategories: Partial<Record<TransferBenchmarkFailureCategory, number>>;
  metrics: TransferBenchmarkMetrics;
};

export type TransferBenchmarkProviderFactory = (fixture: TransferRealismFixture) => RoadRoutingProvider;

const checkedAt = "2026-09-01T12:00:00.000Z";

function normalized(value: string | undefined) {
  return value?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") ?? "";
}

function identity(endpoint: TransferSegment["fromEndpoint"]) {
  return endpoint.canonicalPlaceId || endpoint.providerId || `${normalized(endpoint.country)}:${normalized(endpoint.name)}`;
}

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 1_000) / 10 : 100;
}

class DeterministicRoadProvider implements RoadRoutingProvider {
  readonly provider = "openrouteservice" as const;
  readonly calls: RoadRouteRequest[] = [];
  private readonly fixture: TransferRealismFixture;

  constructor(fixture: TransferRealismFixture) { this.fixture = fixture; }

  async route(input: RoadRouteRequest): Promise<RoadRouteResult> {
    this.calls.push(structuredClone(input));
    const route = this.fixture.providerRoutes?.find((candidate) =>
      normalized(candidate.fromCanonicalId) === normalized(input.origin.canonicalIdentity)
      && normalized(candidate.toCanonicalId) === normalized(input.destination.canonicalIdentity));
    if (!route || this.fixture.providerOutcome === "no-route") throw new RoadRoutingError("no_route");
    return {
      mode: "road",
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      confidence: "medium",
      provenance: "routed",
      provider: "openrouteservice",
      providerCheckedAt: checkedAt,
      profile: "driving-car",
      routeGeometry: [input.origin.coordinates, input.destination.coordinates],
      attribution: "Deterministic transfer-realism provider fixture.",
    };
  }
}

class CountingRoadProvider implements RoadRoutingProvider {
  readonly provider = "openrouteservice" as const;
  readonly calls: RoadRouteRequest[] = [];
  private readonly delegate: RoadRoutingProvider;

  constructor(delegate: RoadRoutingProvider) { this.delegate = delegate; }

  async route(input: RoadRouteRequest) {
    this.calls.push(structuredClone(input));
    return this.delegate.route(input);
  }
}

function benchmarkLeg(fixture: TransferRealismFixture) {
  return buildCanonicalTripLegs({
    tripId: `transfer-benchmark:${fixture.id}`,
    origin: {
      name: fixture.origin.name,
      country: fixture.origin.country,
      canonicalPlaceId: fixture.origin.canonicalId,
      coordinates: fixture.origin.coordinates,
    },
    stops: [{
      id: fixture.destination.canonicalId,
      order: 0,
      name: fixture.destination.name,
      country: fixture.destination.country,
      canonicalPlaceId: fixture.destination.canonicalId,
      latitude: fixture.destination.coordinates[1],
      longitude: fixture.destination.coordinates[0],
      arrivalDate: null,
      departureDate: null,
      nights: 2,
    }],
  })[0];
}

function exactFixtureKnowledge(fixture: TransferRealismFixture) {
  if (!fixture.exactTransferFixture) return undefined;
  const source: KnowledgeSource = {
    id: `benchmark:exact-transfer:${fixture.id}`,
    label: "Transfer realism exact evidence fixture",
    kind: "curated",
    supports: "Deterministic provider-normalized transfer evidence used only by the benchmark.",
    reviewedAt: "2026-09-01",
  };
  const transfer: DestinationTransferKnowledge = {
    fromCanonicalId: fixture.origin.canonicalId,
    toCanonicalId: fixture.destination.canonicalId,
    mode: knownKnowledgeFact(fixture.exactTransferFixture.mode, "static", source),
    planningMinutes: knownKnowledgeFact(fixture.exactTransferFixture.planningMinutes, "estimated", source),
    durationBasis: knownKnowledgeFact("door-to-door", "static", source),
    realisticRangeMinutes: unknownKnowledgeFact("The benchmark expectation owns the reviewed plausibility range."),
    borderFriction: unknownKnowledgeFact("No stable border allowance is asserted by this fixture."),
    note: knownKnowledgeFact(fixture.exactTransferFixture.note, "static", source),
  };
  return createDestinationKnowledgeStore({
    destinations: [],
    destinationOverrides: [
      { canonicalId: fixture.origin.canonicalId, name: fixture.origin.name },
      { canonicalId: fixture.destination.canonicalId, name: fixture.destination.name },
    ],
    transfers: [transfer],
  });
}

function segmentIntegrity(leg: TripLeg) {
  const segments = canonicalTransferSegments(leg);
  if (!leg.fromEndpoint || !leg.toEndpoint || !segments.length) return false;
  if (leg.mode === "mixed" && segments.length < 2) return false;
  if (identity(segments[0].fromEndpoint) !== identity(leg.fromEndpoint)) return false;
  if (identity(segments.at(-1)!.toEndpoint) !== identity(leg.toEndpoint)) return false;
  for (let index = 1; index < segments.length; index += 1) {
    if (identity(segments[index - 1].toEndpoint) !== identity(segments[index].fromEndpoint)) return false;
  }
  const durations = segments.map((segment) => segment.durationMinutes);
  const canonicalTotal = leg.doorToDoorMinutes ?? leg.durationMinutes;
  if (canonicalTotal !== null && durations.every((duration): duration is number => duration !== null)) {
    if (durations.reduce((total, duration) => total + duration, 0) !== canonicalTotal) return false;
  }
  return true;
}

function gatewayCorrect(fixture: TransferRealismFixture, leg: TripLeg) {
  if (!fixture.expectedMixed && !fixture.expectedGateway) return null;
  if (fixture.expectedMixed && leg.mode !== "mixed") return false;
  const segments = canonicalTransferSegments(leg);
  return fixture.expectedGateway
    ? segments.some((segment) => [segment.fromEndpoint, segment.toEndpoint].some((endpoint) => identity(endpoint) === normalized(fixture.expectedGateway)))
    : true;
}

function durationPlausible(fixture: TransferRealismFixture, durationMinutes: number | null) {
  const range = fixture.approximateDurationRange;
  if (!range) return null;
  return durationMinutes !== null && durationMinutes >= range.minMinutes && durationMinutes <= range.maxMinutes;
}

function presentationCorrect(leg: TripLeg) {
  const expected = leg.mode === "train" ? "Rail"
    : leg.mode === "road" ? "Road"
      : leg.mode === "flight" ? "Flight"
        : leg.mode === "ferry" ? "Ferry"
          : leg.mode === "walk" ? "Walk"
            : leg.mode === "unknown" ? "Unknown transport"
              : null;
  const label = transferJourneyModeLabel(leg);
  return expected ? label === expected : label !== "Mixed transfer" && label.includes(" + ");
}

function duplicateCalls(calls: readonly RoadRouteRequest[]) {
  const keys = calls.map((call) => `${call.origin.canonicalIdentity}>${call.destination.canonicalIdentity}:${call.profile ?? "driving-car"}`);
  return keys.length - new Set(keys).size;
}

function comparableRun(output: { leg: TripLeg; diagnostic: TransferResolutionDiagnostic; calls: readonly RoadRouteRequest[] }) {
  return {
    mode: output.leg.mode,
    durationMinutes: output.leg.durationMinutes,
    segments: canonicalTransferSegments(output.leg).map((segment) => ({
      mode: segment.mode,
      from: identity(segment.fromEndpoint),
      to: identity(segment.toEndpoint),
      durationMinutes: segment.durationMinutes,
      distanceKm: segment.distanceKm,
    })),
    diagnostic: output.diagnostic,
    calls: output.calls,
  };
}

async function resolveOnce(fixture: TransferRealismFixture, providerFactory?: TransferBenchmarkProviderFactory) {
  const provider = providerFactory
    ? new CountingRoadProvider(providerFactory(fixture))
    : new DeterministicRoadProvider(fixture);
  const result = await resolveCanonicalTransferJourney(benchmarkLeg(fixture), {
    provider,
    knowledge: exactFixtureKnowledge(fixture),
  });
  return { leg: result.leg, diagnostic: result.diagnostic, calls: provider.calls };
}

function failureCategories(
  fixture: TransferRealismFixture,
  output: ReturnType<typeof comparableRun>,
  checks: { status: TransferBenchmarkStatus; duration: boolean | null; gateway: boolean | null; segments: boolean; presentation: boolean },
): TransferBenchmarkFailureCategory[] {
  const categories = new Set<TransferBenchmarkFailureCategory>();
  const candidateModes = new Set(output.diagnostic.candidates.map((candidate) => candidate.summaryMode));
  if (checks.status === "clearly-wrong") {
    if (fixture.providerOutcome === "no-route") categories.add("H_provider_failure");
    else if (fixture.expectedMixed && !candidateModes.has("mixed")) categories.add("C_candidate_not_generated");
    else if (candidateModes.has(fixture.preferredMode)) categories.add("E_scoring_selected_wrong_candidate");
    else if (fixture.preferredMode === "train") categories.add("A_missing_destination_knowledge");
    else categories.add("B_missing_provider_evidence");
  }
  if (checks.duration === false) categories.add("G_duration_implausible");
  if (checks.gateway === false) categories.add("F_gateway_knowledge_missing_or_wrong");
  if (!checks.segments) categories.add("D_candidate_incorrectly_rejected");
  if (!checks.presentation) categories.add("I_presentation_wrong");
  if (output.mode === "unknown" && fixture.acceptableModes.includes("unknown")) categories.add("J_unknown_is_appropriate");
  return [...categories];
}

function ownership(categories: readonly TransferBenchmarkFailureCategory[]): TransferBenchmarkFixtureResult["failureOwnership"] {
  const material = categories.filter((category) => category !== "J_unknown_is_appropriate");
  if (!material.length) return categories.includes("J_unknown_is_appropriate") ? "appropriate-uncertainty" : "none";
  const engine = material.some((category) => /^[CDEGI]_/.test(category));
  const coverage = material.some((category) => /^[ABFH]_/.test(category));
  return engine && coverage ? "mixed" : engine ? "engine" : "knowledge-or-provider";
}

async function evaluateFixture(
  fixture: TransferRealismFixture,
  options: { mode: "deterministic" | "live"; providerFactory?: TransferBenchmarkProviderFactory },
): Promise<TransferBenchmarkFixtureResult> {
  const first = await resolveOnce(fixture, options.providerFactory);
  const second = options.mode === "deterministic" ? await resolveOnce(fixture, options.providerFactory) : null;
  const firstComparable = comparableRun(first);
  const deterministic = second ? JSON.stringify(firstComparable) === JSON.stringify(comparableRun(second)) : null;
  const acceptable = fixture.acceptableModes.includes(first.leg.mode);
  const status: TransferBenchmarkStatus = first.leg.mode === fixture.preferredMode
    ? "correct"
    : acceptable ? "acceptable-not-ideal" : "clearly-wrong";
  const duration = durationPlausible(fixture, first.leg.durationMinutes);
  const gateway = gatewayCorrect(fixture, first.leg);
  const segments = segmentIntegrity(first.leg);
  const presentation = presentationCorrect(first.leg);
  const categories = failureCategories(fixture, firstComparable, { status, duration, gateway, segments, presentation });
  return {
    id: fixture.id,
    region: fixture.region,
    categories: fixture.categories,
    route: `${fixture.origin.name} → ${fixture.destination.name}`,
    preferredMode: fixture.preferredMode,
    acceptableModes: fixture.acceptableModes,
    selectedMode: first.leg.mode,
    status,
    durationMinutes: first.leg.durationMinutes,
    durationPlausible: duration,
    gatewayCorrect: gateway,
    segmentIntegrity: segments,
    presentationCorrect: presentation,
    deterministic,
    providerCalls: first.calls.length,
    providerCallLimit: fixture.maximumProviderCalls,
    providerCallEfficient: first.calls.length <= fixture.maximumProviderCalls,
    duplicateProviderCalls: duplicateCalls(first.calls),
    confidence: first.leg.confidence ?? null,
    provenance: first.leg.provenance ?? null,
    diagnostic: first.diagnostic,
    failureCategories: categories,
    failureOwnership: ownership(categories),
    rationale: fixture.rationale,
  };
}

function summarizeMetrics(results: readonly TransferBenchmarkFixtureResult[]): TransferBenchmarkMetrics {
  const preferred = results.filter((result) => result.selectedMode === result.preferredMode).length;
  const acceptable = results.filter((result) => result.acceptableModes.includes(result.selectedMode)).length;
  const wrong = results.filter((result) => result.status === "clearly-wrong").length;
  const unknown = results.filter((result) => result.selectedMode === "unknown");
  const duration = results.filter((result) => result.durationPlausible !== null);
  const durationCorrect = duration.filter((result) => result.durationPlausible).length;
  const gateways = results.filter((result) => result.gatewayCorrect !== null);
  const gatewayCorrectCount = gateways.filter((result) => result.gatewayCorrect).length;
  const segments = results.filter((result) => result.segmentIntegrity).length;
  const deterministic = results.filter((result) => result.deterministic !== null);
  const deterministicCorrect = deterministic.filter((result) => result.deterministic).length;
  const providerCalls = results.reduce((total, result) => total + result.providerCalls, 0);
  const allowedCalls = results.reduce((total, result) => total + result.providerCallLimit, 0);
  const efficientFixtures = results.filter((result) => result.providerCallEfficient).length;
  const duplicates = results.reduce((total, result) => total + result.duplicateProviderCalls, 0);
  return {
    preferredMode: { correct: preferred, total: results.length, percent: percent(preferred, results.length) },
    acceptableMode: { correct: acceptable, total: results.length, percent: percent(acceptable, results.length) },
    clearlyWrong: { count: wrong, total: results.length, percent: percent(wrong, results.length) },
    unknown: { count: unknown.length, total: results.length, percent: percent(unknown.length, results.length), appropriate: unknown.filter((result) => result.acceptableModes.includes("unknown")).length },
    durationPlausibility: { plausible: durationCorrect, assessed: duration.length, percent: percent(durationCorrect, duration.length) },
    gatewayComposition: { correct: gatewayCorrectCount, assessed: gateways.length, percent: percent(gatewayCorrectCount, gateways.length) },
    segmentIntegrity: { correct: segments, total: results.length, percent: percent(segments, results.length) },
    determinism: { correct: deterministicCorrect, assessed: deterministic.length, percent: percent(deterministicCorrect, deterministic.length) },
    providerEfficiency: {
      calls: providerCalls,
      allowedCalls,
      efficientFixtures,
      totalFixtures: results.length,
      duplicateCalls: duplicates,
      percent: percent(efficientFixtures, results.length),
    },
  };
}

export async function runTransferRealismBenchmark(options: {
  fixtures?: readonly TransferRealismFixture[];
  mode?: "deterministic" | "live";
  providerFactory?: TransferBenchmarkProviderFactory;
} = {}): Promise<TransferBenchmarkSummary> {
  const fixtures = options.fixtures ?? TRANSFER_REALISM_FIXTURES;
  const mode = options.mode ?? "deterministic";
  const results: TransferBenchmarkFixtureResult[] = [];
  for (const fixture of fixtures) results.push(await evaluateFixture(fixture, { mode, providerFactory: options.providerFactory }));
  const statuses = { correct: 0, "acceptable-not-ideal": 0, "clearly-wrong": 0 } satisfies Record<TransferBenchmarkStatus, number>;
  const failureCategories: Partial<Record<TransferBenchmarkFailureCategory, number>> = {};
  results.forEach((result) => {
    statuses[result.status] += 1;
    result.failureCategories.forEach((category) => { failureCategories[category] = (failureCategories[category] ?? 0) + 1; });
  });
  return {
    generatedBy: "canonical-transfer-realism-benchmark-v1",
    mode,
    fixtureCount: fixtures.length,
    regions: [...new Set(fixtures.map((fixture) => fixture.region))].sort(),
    results,
    statuses,
    failureCategories,
    metrics: summarizeMetrics(results),
  };
}

export function comparableTransferBenchmarkSnapshot(summary: TransferBenchmarkSummary) {
  return {
    generatedBy: summary.generatedBy,
    fixtureCount: summary.fixtureCount,
    regions: summary.regions,
    statuses: summary.statuses,
    failureCategories: summary.failureCategories,
    metrics: summary.metrics,
    results: summary.results.map((result) => ({
      id: result.id,
      route: result.route,
      selectedMode: result.selectedMode,
      status: result.status,
      durationMinutes: result.durationMinutes,
      durationPlausible: result.durationPlausible,
      gatewayCorrect: result.gatewayCorrect,
      segmentIntegrity: result.segmentIntegrity,
      presentationCorrect: result.presentationCorrect,
      deterministic: result.deterministic,
      providerCalls: result.providerCalls,
      providerCallEfficient: result.providerCallEfficient,
      duplicateProviderCalls: result.duplicateProviderCalls,
      confidence: result.confidence,
      provenance: result.provenance,
      diagnostic: result.diagnostic,
      failureCategories: result.failureCategories,
      failureOwnership: result.failureOwnership,
    })),
  };
}
