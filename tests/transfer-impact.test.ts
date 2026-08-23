import assert from "node:assert/strict";
import test from "node:test";
import { generateRouteCandidates } from "../lib/easyt/route-candidates.ts";
import { knownKnowledgeFact, type KnowledgeSource } from "../lib/easyt/destination-knowledge.ts";
import { estimateLeg } from "../lib/easyt/planner.ts";
import {
  estimateTransferImpact,
  transferDoorToDoorMinutes,
  transferHeadlineMinutes,
} from "../lib/easyt/transfer-impact.ts";

const verifiedSource: KnowledgeSource = {
  id: "provider:test-schedule",
  label: "Verified test schedule",
  kind: "provider",
  supports: "Headline duration and explicit border-friction fixtures for deterministic tests.",
  reviewedAt: "2026-08-23",
};

const headline = (minutes: number) => knownKnowledgeFact(minutes, "verified", verifiedSource);

test("a short rail journey has less realistic impact than a same-duration flight", () => {
  const rail = estimateTransferImpact({ mode: "train", headlineMinutes: headline(90), international: false, connectionCount: 0 });
  const flight = estimateTransferImpact({ mode: "flight", headlineMinutes: headline(90), international: false, connectionCount: 0 });

  assert.equal(transferHeadlineMinutes(rail), 90);
  assert.equal(transferHeadlineMinutes(flight), 90);
  assert.ok((transferDoorToDoorMinutes(flight) ?? 0) > (transferDoorToDoorMinutes(rail) ?? 0));
  assert.ok((transferDoorToDoorMinutes(flight) ?? 0) - 90 >= 120);
  assert.equal(flight.doorToDoor.confidence, "estimated");
  assert.equal(flight.doorToDoor.status === "known" ? flight.doorToDoor.value.precision : null, "estimated-range");
});

test("flight impact exposes airport access, processing, waiting and arrival overhead", () => {
  const impact = estimateTransferImpact({ mode: "flight", headlineMinutes: headline(120), international: false, connectionCount: 0 });
  const byId = new Map(impact.components.map((component) => [component.id, component]));
  const border = byId.get("border-immigration");

  assert.equal(byId.get("origin-local")?.timing.status, "known");
  assert.equal(byId.get("check-in-security")?.timing.status, "known");
  assert.equal(byId.get("waiting-buffer")?.timing.status, "known");
  assert.equal(byId.get("arrival-local")?.timing.status, "known");
  assert.equal(border?.timing.status === "known" ? border.timing.value.planningMinutes : null, 0);
});

test("explicit border friction widens cross-border impact without claiming certainty", () => {
  const borderFriction = knownKnowledgeFact("variable" as const, "static", verifiedSource);
  const domestic = estimateTransferImpact({ mode: "flight", headlineMinutes: headline(120), international: false, connectionCount: 0 });
  const crossBorder = estimateTransferImpact({ mode: "flight", headlineMinutes: headline(120), international: true, borderFriction, connectionCount: 0 });
  const border = crossBorder.components.find((component) => component.id === "border-immigration");

  assert.deepEqual(border?.timing.status === "known" ? border.timing.value.rangeMinutes : null, { minimum: 45, maximum: 120 });
  assert.ok((transferDoorToDoorMinutes(crossBorder) ?? 0) > (transferDoorToDoorMinutes(domestic) ?? 0));
  assert.equal(crossBorder.doorToDoor.confidence, "estimated");
});

test("long daytime and overnight transfers distinguish clock time from usable-day loss", () => {
  const daytime = estimateTransferImpact({ mode: "train", headlineMinutes: headline(600), international: false, connectionCount: 0, occursOvernight: false });
  const overnight = estimateTransferImpact({ mode: "train", headlineMinutes: headline(600), international: false, connectionCount: 0, occursOvernight: true });

  assert.equal(daytime.usableDayLoss.classification, "full-day-or-more");
  assert.equal(daytime.usableDayLoss.estimatedDayFraction, 1);
  assert.equal(overnight.usableDayLoss.classification, "substantial");
  assert.equal(overnight.usableDayLoss.estimatedDayFraction, 0.5);
  assert.equal(transferDoorToDoorMinutes(daytime), transferDoorToDoorMinutes(overnight));
});

test("unknown headline and connection data remain visible and use legacy fallback only when supplied", () => {
  const unknown = estimateTransferImpact({ mode: "ferry", international: true });

  assert.equal(unknown.headline.status, "unknown");
  assert.equal(unknown.doorToDoor.status, "unknown");
  assert.equal(unknown.usableDayLoss.classification, "unknown");
  assert.equal(transferDoorToDoorMinutes(unknown), null);
  assert.equal(transferDoorToDoorMinutes(unknown, 240), 240);
  assert.ok(unknown.assumptions.some((assumption) => /unknown border/i.test(assumption)));
});

test("curated door-to-door allowances are preserved without fabricated headline components", () => {
  const leg = estimateLeg(
    { id: "rome", name: "Rome", country: "Italy", coordinates: [12.4964, 41.9028] },
    { id: "florence", name: "Florence", country: "Italy", coordinates: [11.2558, 43.7696] },
  );

  assert.equal(leg.durationMinutes, 120);
  assert.equal(transferDoorToDoorMinutes(leg.transferImpact), 120);
  assert.equal(leg.transferImpact?.headline.status, "unknown");
  assert.equal(leg.transferImpact?.components.every((component) => component.timing.status === "unknown"), true);
  assert.equal(leg.transferImpact?.doorToDoor.confidence, "estimated");
});

test("no-driving remains a hard candidate constraint after impact enrichment", () => {
  const origin = { name: "Origin", coordinates: [0, 0] as [number, number] };
  const stops = [
    { id: "a", name: "A", country: "Test", coordinates: [0.1, 0] as [number, number] },
    { id: "b", name: "B", country: "Test", coordinates: [0.2, 0] as [number, number] },
  ];
  const highConfidenceRoadEstimator: typeof estimateLeg = (from, to) => ({
    ...estimateLeg(from, to),
    mode: "road",
    confidence: "high",
  });
  const result = generateRouteCandidates({
    origin,
    stops,
    constraints: { avoidDriving: true },
    estimateLeg: highConfidenceRoadEstimator,
  });

  assert.equal(result.candidates.length, 0);
  assert.ok(result.constraintIssues.some((issue) => issue.code === "forbidden-transport-mode"));
});

test("transfer impact is deterministic", () => {
  const input = { mode: "road" as const, headlineMinutes: headline(270), international: false, connectionCount: 0 };
  assert.deepEqual(estimateTransferImpact(input), estimateTransferImpact(input));
});
