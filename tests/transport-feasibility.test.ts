import assert from "node:assert/strict";
import test from "node:test";
import {
  createDestinationKnowledgeStore,
  knownKnowledgeFact,
  type KnowledgeSource,
} from "../lib/easyt/destination-knowledge.ts";
import {
  estimateLeg,
  estimateLegForConstraints,
  type PlannerStop,
} from "../lib/easyt/planner.ts";

const stop = (
  id: string,
  longitude: number,
  country = "Testland",
  name = id,
): PlannerStop => ({ id, name, country, coordinates: [longitude, 0] });

test("hard no-driving prevents a heuristic road leg before scoring", () => {
  const from = stop("a", 0);
  const to = stop("b", 1);
  assert.equal(estimateLeg(from, to).mode, "road");

  const constrained = estimateLegForConstraints(from, to, { avoidDriving: true });
  assert.equal(constrained.mode, "unknown");
  assert.equal(constrained.durationMinutes, null);
  assert.match(constrained.note, /driving is explicitly excluded/i);
});

test("a rail preference does not fabricate rail when driving is prohibited", () => {
  const constrained = estimateLegForConstraints(stop("a", 0), stop("b", 1), {
    avoidDriving: true,
    transportModes: ["train"],
  });
  assert.equal(constrained.mode, "unknown");
  assert.doesNotMatch(constrained.note, /rail (?:service|connection) (?:is|available)/i);
});

test("unknown compliant transport remains unknown with confirmation required", () => {
  const constrained = estimateLegForConstraints(stop("a", 0), stop("b", 1), {
    excludedTransportModes: ["road"],
  });
  assert.equal(constrained.confidence, "unconfirmed");
  assert.equal(constrained.planningConfidence?.availability.state, "unknown");
  assert.equal(constrained.planningConfidence?.duration.state, "unknown");
  assert.equal(constrained.planningConfidence?.overall.state, "unknown");
  assert.equal(constrained.planningConfidence?.overall.confirmation.needed, true);
});

test("road remains available when the traveller allows driving", () => {
  const leg = estimateLegForConstraints(stop("a", 0), stop("b", 1), {
    transportModes: ["drive"],
  });
  assert.equal(leg.mode, "road");
  assert.notEqual(leg.durationMinutes, null);
});

test("soft rail preference influences scoring rather than feasibility", () => {
  const leg = estimateLegForConstraints(stop("a", 0), stop("b", 1), {
    transportModes: ["train"],
  });
  assert.equal(leg.mode, "road");
});

test("curated supported transport remains usable under no-driving", () => {
  const rome = stop("rome", 12.4964, "Italy", "Rome");
  rome.coordinates = [12.4964, 41.9028];
  const florence = stop("florence", 11.2558, "Italy", "Florence");
  florence.coordinates = [11.2558, 43.7696];

  const leg = estimateLegForConstraints(rome, florence, { avoidDriving: true });
  assert.equal(leg.mode, "train");
  assert.equal(leg.durationMinutes, 120);
  assert.equal(leg.confidence, "high");
  assert.equal(leg.planningConfidence?.availability.state, "structured");
  assert.equal(leg.planningConfidence?.schedule.state, "unknown");
  assert.equal(leg.planningConfidence?.schedule.scope, "unknown");
  assert.equal(leg.planningConfidence?.schedule.confirmation.needed, true);
});

test("ferry-only endpoint knowledge blocks road inference without inventing a ferry", () => {
  const source: KnowledgeSource = {
    id: "test:island-connectivity",
    label: "Test island connectivity",
    kind: "curated",
    supports: "Endpoint-level ferry access only.",
    reviewedAt: "2026-08-23",
  };
  const ferryConnectivity = knownKnowledgeFact([
    { mode: "ferry" as const, reach: "regional" as const, access: "direct" as const },
  ], "static", source);
  const knowledge = createDestinationKnowledgeStore({
    destinations: [],
    transfers: [],
    destinationOverrides: [
      { canonicalId: "island-a", name: "Island A", connectivity: ferryConnectivity },
      { canonicalId: "island-b", name: "Island B", connectivity: ferryConnectivity },
    ],
  });

  const leg = estimateLegForConstraints(
    stop("island-a", 0, "Archipelago", "Island A"),
    stop("island-b", 0.5, "Archipelago", "Island B"),
    undefined,
    knowledge,
  );
  assert.equal(leg.mode, "unknown");
  assert.match(leg.note, /do not establish a direct ferry service/i);
  assert.equal(leg.planningConfidence?.overall.state, "unknown");
});
