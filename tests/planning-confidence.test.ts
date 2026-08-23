import assert from "node:assert/strict";
import test from "node:test";
import {
  knownKnowledgeFact,
  unknownKnowledgeFact,
  type KnowledgeSource,
} from "../lib/easyt/destination-knowledge.ts";
import { allocateTripNights } from "../lib/easyt/night-allocation.ts";
import {
  aggregatePlanningConfidence,
  legPlanningConfidenceFromMetadata,
  planningConfidenceFromKnowledgeFact,
} from "../lib/easyt/planning-confidence.ts";
import { estimateLeg, type EstimatedLeg, type PlannerStop } from "../lib/easyt/planner.ts";
import type { RouteCandidate } from "../lib/easyt/route-candidates.ts";
import { scoreRouteCandidates } from "../lib/easyt/route-scoring.ts";
import { extractStructuredTripBrief, structuredTripBriefPlanningConfidence } from "../lib/easyt/structured-trip-brief.ts";
import { estimateTransferImpact } from "../lib/easyt/transfer-impact.ts";

const provider: KnowledgeSource = {
  id: "provider:confidence-test",
  label: "Verified test provider",
  kind: "provider",
  supports: "A deterministic confidence fixture.",
  reviewedAt: "2026-08-20",
};

const curated: KnowledgeSource = {
  id: "curated:confidence-test",
  label: "Structured test knowledge",
  kind: "curated",
  supports: "A deterministic static fixture.",
  reviewedAt: "2026-08-20",
};

test("distinguishes verified current facts from estimated planning facts", () => {
  const verified = planningConfidenceFromKnowledgeFact(knownKnowledgeFact(120, "verified", provider), {
    scope: "dated-service",
    reason: "Provider duration.",
    asOfDate: "2026-08-23",
  });
  const estimated = planningConfidenceFromKnowledgeFact(knownKnowledgeFact(120, "estimated", curated), {
    scope: "planning-rule",
    reason: "Planner allowance.",
  });

  assert.deepEqual({ state: verified.state, freshness: verified.freshness, scope: verified.scope }, { state: "verified", freshness: "current", scope: "dated-service" });
  assert.equal(estimated.state, "estimated");
  assert.equal(estimated.level, "medium");
});

test("marks stale facts and keeps unknown facts unknown", () => {
  const staleSource = { ...provider, reviewedAt: "2024-01-01" };
  const stale = planningConfidenceFromKnowledgeFact(knownKnowledgeFact("train", "verified", staleSource), {
    scope: "general-route",
    reason: "Old connection evidence.",
    asOfDate: "2026-08-23",
    staleAfterDays: 365,
  });
  const unknown = planningConfidenceFromKnowledgeFact(unknownKnowledgeFact("No operator data is available."), {
    scope: "dated-service",
    reason: "Should not replace the unknown reason.",
  });

  assert.equal(stale.freshness, "stale");
  assert.equal(stale.level, "low");
  assert.equal(stale.confirmation.needed, true);
  assert.deepEqual({ state: unknown.state, level: unknown.level, freshness: unknown.freshness }, { state: "unknown", level: "unknown", freshness: "unknown" });
  assert.match(unknown.reason, /no operator data/i);
});

test("retains inferred traveller intent as inferred rather than explicit", () => {
  const brief = extractStructuredTripBrief("About ten days in Japan without rushing. We prefer trains where practical.");
  const confidence = structuredTripBriefPlanningConfidence(brief);

  assert.equal(brief.pace?.provenance.kind, "inferred");
  assert.equal(confidence.state, "inferred");
  assert.equal(confidence.confirmation.needed, true);
});

test("confidence aggregation reflects the weakest material input deterministically", () => {
  const verified = planningConfidenceFromKnowledgeFact(knownKnowledgeFact(1, "verified", provider), {
    scope: "general-route", reason: "Verified input.", asOfDate: "2026-08-23",
  });
  const estimated = planningConfidenceFromKnowledgeFact(knownKnowledgeFact(2, "estimated", curated), {
    scope: "planning-rule", reason: "Estimated input.",
  });
  const aggregate = aggregatePlanningConfidence([verified, estimated], {
    scope: "general-route",
    reason: "Aggregate route confidence.",
  });

  assert.equal(aggregate.state, "estimated");
  assert.equal(aggregate.level, "medium");
  assert.deepEqual(aggregate.sources.map((source) => source.id), [provider.id, curated.id]);
});

test("a numeric low-confidence route remains scoreable but exposes reduced confidence", () => {
  const stops: PlannerStop[] = [
    { id: "a", name: "A", country: "Test", coordinates: [1, 0] },
    { id: "b", name: "B", country: "Test", coordinates: [2, 0] },
  ];
  const candidate: RouteCandidate = {
    stops,
    source: "existing",
    constraintsSatisfied: true,
    constraintIssues: [],
    metadata: {
      reordered: false, candidateIndex: 0, matchesOriginalOrder: true, generatedByMorrovia: false,
      derivedFromCurrentRouteIntelligence: false, routeComparisonAvailable: true, estimatedTransferMinutes: 180,
    },
  };
  const lowConfidenceEstimator = (from: { name: string }, to: PlannerStop): EstimatedLeg => ({
    mode: "train", distanceKm: 100, durationMinutes: 90, label: `${from.name} → ${to.name}`,
    note: "Unconfirmed planning estimate.", confidence: "unconfirmed",
  });
  const result = scoreRouteCandidates({
    origin: { name: "Origin", coordinates: [0, 0] },
    candidates: [candidate],
    estimateLeg: lowConfidenceEstimator,
  });

  assert.equal(result.state, "selected");
  assert.equal(result.winner?.state, "scored");
  assert.equal(result.winner?.confidence.level, "low");
  assert.equal(result.winner?.confidence.confirmation.needed, true);
});

test("distinguishes a likely route from an exact date-verified schedule", () => {
  const leg = estimateLeg(
    { id: "rome", name: "Rome", country: "Italy", coordinates: [12.4964, 41.9028] },
    { id: "florence", name: "Florence", country: "Italy", coordinates: [11.2558, 43.7696] },
  );

  assert.equal(leg.planningConfidence?.availability.scope, "general-route");
  assert.equal(leg.planningConfidence?.availability.state, "structured");
  assert.equal(leg.planningConfidence?.schedule.state, "unknown");
  assert.match(leg.planningConfidence?.schedule.reason ?? "", /no exact schedule/i);
});

test("static knowledge is never upgraded to verified solely because it has a provider source", () => {
  const confidence = planningConfidenceFromKnowledgeFact(knownKnowledgeFact("rail", "static", provider), {
    scope: "general-route",
    reason: "Static route knowledge.",
    asOfDate: "2026-08-23",
  });

  assert.equal(confidence.state, "structured");
  assert.notEqual(confidence.state, "verified");
});

test("transfer and night outputs expose concise confidence without hiding fallback estimates", () => {
  const impact = estimateTransferImpact({
    mode: "train",
    headlineMinutes: knownKnowledgeFact(90, "estimated", curated),
    international: false,
    connectionCount: 0,
  });
  const allocation = allocateTripNights({
    totalNights: 3,
    stops: [{ id: "unknown-place", name: "Unknown Place", arrivalImpact: impact }],
  });

  assert.equal(impact.claimConfidence?.headline.state, "estimated");
  assert.equal(impact.claimConfidence?.doorToDoor.state, "estimated");
  assert.notEqual(allocation.state, "conflict");
  assert.equal(allocation.stops[0]?.confidence.minimumNights.state, "estimated");
  assert.equal(allocation.stops[0]?.confidence.minimumNights.confirmation.needed, true);
});

test("new leg confidence is serializable while older metadata remains compatible", () => {
  const leg = estimateLeg(
    { id: "rome", name: "Rome", country: "Italy", coordinates: [12.4964, 41.9028] },
    { id: "florence", name: "Florence", country: "Italy", coordinates: [11.2558, 43.7696] },
  );
  const persisted = JSON.parse(JSON.stringify(leg.planningConfidence)) as unknown;

  assert.equal(legPlanningConfidenceFromMetadata(persisted)?.schedule.state, "unknown");
  assert.equal(legPlanningConfidenceFromMetadata({ planningEstimate: true }), undefined);
});
