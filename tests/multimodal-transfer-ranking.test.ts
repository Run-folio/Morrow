import assert from "node:assert/strict";
import test from "node:test";

import {
  knownKnowledgeFact,
  unknownKnowledgeFact,
  type DestinationTransferResolutionKnowledge,
  type IntercityRailConnectionEvidence,
  type KnowledgeSource,
} from "../lib/easyt/destination-knowledge.ts";
import {
  resolveCanonicalTransferJourney,
  type TransferEvidenceProvider,
} from "../lib/easyt/multimodal-transfer-resolution.ts";
import type { RoadRouteRequest, RoadRouteResult, RoadRoutingProvider } from "../lib/easyt/road-routing.ts";
import { buildCanonicalTripLegs } from "../lib/easyt/trip-legs.ts";
import { isEasyTTrip, type TripLeg, type TripStop } from "../lib/easyt/trip.ts";

const source: KnowledgeSource = {
  id: "test:multimodal-ranking",
  label: "Deterministic multimodal ranking fixture",
  kind: "curated",
  supports: "Planning-level rail and air comparison fixtures.",
};

const endpoint = (id: string, name: string, country: string, coordinates: [number, number], order = 0): TripStop => ({
  id,
  canonicalPlaceId: id.replace(/-return$/, ""),
  order,
  name,
  country,
  longitude: coordinates[0],
  latitude: coordinates[1],
  arrivalDate: null,
  departureDate: null,
  nights: 2,
});

function leg(from: TripStop, to: TripStop, flightMinutes: number, constraints?: TripLeg["routeMetadata"]["transportConstraints"]): TripLeg {
  const distanceKm = Math.round(Math.abs((to.longitude ?? 0) - (from.longitude ?? 0)) * 111);
  return {
    id: `${from.id}:${to.id}`,
    fromStopId: from.id,
    toStopId: to.id,
    fromEndpoint: { kind: "origin", id: from.id, name: from.name, country: from.country, canonicalPlaceId: from.canonicalPlaceId, coordinates: [from.longitude!, from.latitude!] },
    toEndpoint: { kind: "stop", id: to.id, name: to.name, country: to.country, canonicalPlaceId: to.canonicalPlaceId, coordinates: [to.longitude!, to.latitude!] },
    mode: "flight",
    distanceKm,
    straightLineDistanceKm: distanceKm,
    durationMinutes: flightMinutes,
    headlineMinutes: flightMinutes,
    doorToDoorMinutes: flightMinutes,
    provider: "Deterministic door-to-door flight fixture.",
    provenance: "planning_estimate",
    confidence: "medium",
    scheduleNeedsChecking: true,
    routeMetadata: { source: "morrovia-planner", transportConstraints: constraints },
  };
}

class MatrixKnowledge implements TransferEvidenceProvider {
  private readonly railMinutes: number | null;
  private readonly changes: number | null;
  private readonly directAir: boolean;

  constructor(
    railMinutes: number | null,
    changes: number | null,
    directAir = true,
  ) {
    this.railMinutes = railMinutes;
    this.changes = changes;
    this.directAir = directAir;
  }

  findTransfer() { return undefined; }

  findIntercityRailConnection(): IntercityRailConnectionEvidence | undefined {
    if (this.railMinutes === null) return undefined;
    return {
      networkId: "fixture-network",
      networkLabel: "Reviewed fixture intercity network",
      planningMinutes: this.railMinutes,
      connectionCount: this.changes,
      confidence: "medium",
      source,
    };
  }

  forTransferResolution(): DestinationTransferResolutionKnowledge {
    return {
      canonicalId: "fixture",
      connectivity: knownKnowledgeFact([
        ...(this.directAir ? [{ mode: "air" as const, reach: "national" as const, access: "direct" as const }] : []),
      ], "static", source),
      airGateways: unknownKnowledgeFact("No gateway is needed for the ranking fixture."),
    };
  }
}

class MatrixRoadProvider implements RoadRoutingProvider {
  readonly provider = "openrouteservice" as const;
  calls = 0;
  private readonly minutes: number;
  constructor(minutes: number) { this.minutes = minutes; }
  async route(input: RoadRouteRequest): Promise<RoadRouteResult> {
    this.calls += 1;
    return {
      mode: "road",
      distanceKm: 520,
      durationMinutes: this.minutes,
      confidence: "medium",
      provenance: "routed",
      provider: "openrouteservice",
      providerCheckedAt: "2026-09-11T00:00:00.000Z",
      profile: "driving-car",
      routeGeometry: [input.origin.coordinates, input.destination.coordinates],
      attribution: "Deterministic test route.",
    };
  }
}

const matrixFrom = endpoint("matrix-a", "Matrix A", "Testland", [0, 0]);
const matrixTo = endpoint("matrix-b", "Matrix B", "Testland", [5, 0], 1);

const matrix = [
  { label: "Japan-style 3–4h direct rail beats a short flight", rail: 225, changes: 0, flight: 270, expected: "train" },
  { label: "Western Europe direct rail beats air after door-to-door friction", rail: 240, changes: 0, flight: 270, expected: "train" },
  { label: "Spain-style 5–6h direct rail beats a flight", rail: 345, changes: 0, flight: 285, expected: "train" },
  { label: "China-style 7–8h low-change rail stays competitive", rail: 450, changes: 1, flight: 390, expected: "train" },
  { label: "poor-region 8h+ rail loses to a materially faster flight", rail: 540, changes: 1, flight: 300, expected: "flight" },
  { label: "multi-change rail loses to a direct flight", rail: 420, changes: 2, flight: 360, expected: "flight" },
] as const;

for (const fixture of matrix) {
  test(fixture.label, async () => {
    const result = await resolveCanonicalTransferJourney(leg(matrixFrom, matrixTo, fixture.flight), {
      knowledge: new MatrixKnowledge(fixture.rail, fixture.changes),
    });
    assert.equal(result.leg.mode, fixture.expected);
    assert.deepEqual(result.diagnostic.candidates.map((candidate) => candidate.id).sort(), ["flight:direct-connectivity", "rail:network:fixture-network"].sort());
    assert.ok(result.diagnostic.candidates.every((candidate) => candidate.score >= 0 && candidate.score <= 100));
  });
}

test("a no-flying hard constraint removes air before scoring", async () => {
  const result = await resolveCanonicalTransferJourney(leg(matrixFrom, matrixTo, 240, {
    avoidDriving: false,
    excludedModes: ["flight"],
    preferredModes: [],
  }), { knowledge: new MatrixKnowledge(450, 1) });
  assert.equal(result.leg.mode, "train");
  assert.equal(result.diagnostic.candidates.some((candidate) => candidate.id.startsWith("flight:")), false);
});

test("an avoid-driving hard constraint prevents provider work", async () => {
  const provider = new MatrixRoadProvider(180);
  const result = await resolveCanonicalTransferJourney(leg(matrixFrom, matrixTo, 360, {
    avoidDriving: true,
    excludedModes: [],
    preferredModes: ["train"],
  }), { knowledge: new MatrixKnowledge(345, 0), provider });
  assert.equal(result.leg.mode, "train");
  assert.equal(provider.calls, 0);
  assert.equal(result.diagnostic.candidates.some((candidate) => candidate.summaryMode === "road"), false);
});

test("a road preference keeps road in the comparison instead of triggering the strong-rail shortcut", async () => {
  const provider = new MatrixRoadProvider(300);
  const result = await resolveCanonicalTransferJourney(leg(matrixFrom, matrixTo, 480, {
    avoidDriving: false,
    excludedModes: [],
    preferredModes: ["drive"],
  }), { knowledge: new MatrixKnowledge(345, 0), provider });
  assert.equal(provider.calls, 1);
  assert.equal(result.diagnostic.candidates.some((candidate) => candidate.summaryMode === "road"), true);
});

test("weak rail evidence cannot displace supported direct air", async () => {
  const result = await resolveCanonicalTransferJourney(leg(matrixFrom, matrixTo, 300), {
    knowledge: new MatrixKnowledge(null, null),
  });
  assert.equal(result.leg.mode, "flight");
  assert.equal(result.diagnostic.candidates.some((candidate) => candidate.id.startsWith("rail:")), false);
});

const japanChinaRoute = [
  endpoint("london", "London", "United Kingdom", [-0.1276, 51.5072]),
  endpoint("tokyo", "Tokyo", "Japan", [139.6917, 35.6895]),
  endpoint("kanazawa", "Kanazawa", "Japan", [136.6562, 36.5613]),
  endpoint("shirakawa-go", "Shirakawa-go", "Japan", [136.9062, 36.2579]),
  endpoint("takayama", "Takayama", "Japan", [137.252, 36.1461]),
  endpoint("hirayu", "Hirayu", "Japan", [137.505, 36.182]),
  endpoint("matsumoto", "Matsumoto", "Japan", [137.9719, 36.238]),
  endpoint("chengdu", "Chengdu", "China", [104.0665, 30.5728]),
  endpoint("zhangjiajie", "Zhangjiajie", "China", [110.4792, 29.1171]),
  endpoint("fenghuang", "Fenghuang", "China", [109.6017, 27.9483]),
  endpoint("fanjingshan", "Fanjingshan", "China", [108.698, 27.917]),
  endpoint("hong-kong", "Hong Kong", "China", [114.1694, 22.3193]),
  endpoint("london-return", "London", "United Kingdom", [-0.1276, 51.5072]),
].map((item, order) => ({ ...item, order }));

const vietnamRoute = [
  endpoint("london", "London", "United Kingdom", [-0.1276, 51.5072]),
  endpoint("hanoi", "Hanoi", "Vietnam", [105.8342, 21.0278]),
  endpoint("ha-long-bay", "Ha Long Bay", "Vietnam", [107.0448, 20.9101]),
  endpoint("ninh-binh", "Ninh Binh", "Vietnam", [105.9745, 20.2506]),
  endpoint("hue", "Hue", "Vietnam", [107.5909, 16.4637]),
  endpoint("hoi-an", "Hoi An", "Vietnam", [108.338, 15.8801]),
  endpoint("ho-chi-minh-city", "Ho Chi Minh City", "Vietnam", [106.6297, 10.8231]),
  endpoint("london-return", "London", "United Kingdom", [-0.1276, 51.5072]),
].map((item, order) => ({ ...item, order }));

async function resolveRoute(route: TripStop[]) {
  const [origin, ...stops] = route;
  const legs = buildCanonicalTripLegs({
    tripId: `fixture:${stops[0]?.country}`,
    origin: { name: origin.name, country: origin.country, canonicalPlaceId: origin.canonicalPlaceId, coordinates: [origin.longitude!, origin.latitude!] },
    stops,
  });
  return Promise.all(legs.map(async (item) => (await resolveCanonicalTransferJourney(item)).leg));
}

test("the exact founder Japan and China route resolves every leg without replacing canonical identity", async () => {
  const legs = await resolveRoute(japanChinaRoute);
  assert.deepEqual(legs.map((item) => item.mode), ["flight", "train", "road", "road", "road", "road", "flight", "train", "train", "mixed", "mixed", "flight"]);
  assert.equal(legs.some((item) => item.mode === "unknown"), false);
  assert.deepEqual(legs.map((item) => item.id), buildCanonicalTripLegs({
    tripId: "fixture:Japan",
    origin: { name: japanChinaRoute[0].name, country: japanChinaRoute[0].country, canonicalPlaceId: japanChinaRoute[0].canonicalPlaceId, coordinates: [japanChinaRoute[0].longitude!, japanChinaRoute[0].latitude!] },
    stops: japanChinaRoute.slice(1),
  }).map((item) => item.id));
});

test("Fenghuang to Hong Kong compares rail and air, then explains the rail selection", async () => {
  const [from, to] = [japanChinaRoute[9], japanChinaRoute[11]];
  const [baselineLeg] = buildCanonicalTripLegs({
    tripId: "fenghuang-hong-kong",
    origin: { name: from.name, country: from.country, canonicalPlaceId: from.canonicalPlaceId, coordinates: [from.longitude!, from.latitude!] },
    stops: [to],
  });
  const result = await resolveCanonicalTransferJourney(baselineLeg);
  assert.equal(result.leg.mode, "train");
  assert.equal(result.leg.durationMinutes, 405);
  assert.equal(result.leg.confidence, "medium");
  assert.equal(result.diagnostic.candidates.some((candidate) => candidate.id === "mixed:air-gateway"), true);
  assert.equal(result.diagnostic.candidates.some((candidate) => candidate.id.startsWith("rail:")), true);
  assert.match(result.leg.provider ?? "", /Train is likely simplest here: about 6h 45m door to door/);
});

test("the exact Vietnam route resolves common corridors and compares rail with the Hoi An flight gateway", async () => {
  const legs = await resolveRoute(vietnamRoute);
  assert.deepEqual(legs.map((item) => item.mode), ["flight", "road", "road", "train", "mixed", "mixed", "flight"]);
  assert.equal(legs.some((item) => item.mode === "unknown"), false);
  const hoiAnToHcmc = legs[5];
  const diagnostic = hoiAnToHcmc.routeMetadata.multimodalResolution as { candidates: Array<{ id: string }> };
  assert.equal(diagnostic.candidates.some((candidate) => candidate.id.startsWith("rail:")), true);
  assert.equal(diagnostic.candidates.some((candidate) => candidate.id === "mixed:air-gateway"), true);
  assert.match(hoiAnToHcmc.provider ?? "", /Flying is materially faster for this leg/);
});

test("ranked derived transport remains compatible with persisted trip shape", async () => {
  const [resolved] = await resolveRoute(vietnamRoute.slice(0, 2));
  const persisted = structuredClone({ schemaVersion: 1, id: "ranking-persistence", startDate: "2026-10-01", endDate: "2026-10-03", stops: vietnamRoute.slice(0, 2), legs: [resolved], planItems: [] });
  assert.equal(isEasyTTrip(persisted), true);
  assert.equal(persisted.legs[0].id, resolved.id);
});
