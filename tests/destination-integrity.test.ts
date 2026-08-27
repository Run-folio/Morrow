import assert from "node:assert/strict";
import test from "node:test";
import { isWithinDestinationRadius, needsDestinationConfirmation } from "../lib/easyt/destination-resolution.ts";
import { estimateLeg, findDestinationIntegrityIssues } from "../lib/easyt/planner.ts";
import { NIKKO_CANONICAL_FIXTURE } from "./fixtures/prebeta-place-trip-state.ts";

const tokyo = { id: "tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] as [number, number] };
const kanazawa = { id: "kanazawa", name: "Kanazawa", country: "Japan", coordinates: [136.6562, 36.5613] as [number, number] };
const nikko = { id: "nikko-stop", ...NIKKO_CANONICAL_FIXTURE };

test("Tokyo to Nikko remains a domestic, usable routing estimate", () => {
  const leg = estimateLeg(tokyo, nikko);
  assert.equal(leg.mode, "road");
  assert.notEqual(leg.durationMinutes, null);
  assert.equal(leg.confidence, "medium");
  assert.deepEqual(findDestinationIntegrityIssues([tokyo, nikko]), []);
});

test("Tokyo, Kanazawa and Nikko remain geographically coherent in Japan", () => {
  assert.deepEqual(findDestinationIntegrityIssues([tokyo, kanazawa, nikko]), []);
});

test("an ambiguous global name requires confirmation unless trip context can rank it", () => {
  assert.equal(needsDestinationConfirmation(["Japan", "United States"]), true);
  assert.equal(needsDestinationConfirmation(["Japan", "United States"], true), false);
});

test("Tokyo discovery results remain local to the selected destination", () => {
  assert.equal(isWithinDestinationRadius(tokyo.coordinates, [139.7671, 35.6812]), true);
  assert.equal(isWithinDestinationRadius(tokyo.coordinates, [-66.1568, -16.2902]), false);
});

test("a valid long international transfer remains supported", () => {
  const leg = estimateLeg(tokyo, { id: "london", name: "London", country: "United Kingdom", coordinates: [-0.1278, 51.5074] });
  assert.equal(leg.mode, "flight");
  assert.notEqual(leg.durationMinutes, null);
  assert.notEqual(leg.confidence, "unconfirmed");
});

test("a same-country cross-continent outlier is unconfirmed instead of routed normally", () => {
  const incorrectNikko = { id: "nikko-stop", canonicalPlaceId: "nikko", name: "Nikko", country: "Japan", coordinates: [-66.1568, -16.2902] as [number, number] };
  const issues = findDestinationIntegrityIssues([tokyo, incorrectNikko]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.stopId, "nikko-stop");
  assert.equal(issues[0]?.reason, "canonical-mismatch");
  const leg = estimateLeg(tokyo, incorrectNikko);
  assert.equal(leg.durationMinutes, null);
  assert.equal(leg.confidence, "unconfirmed");
  assert.equal(leg.mode, "unknown");
});

test("canonical identity contradictions fail closed even when the saved country also changed", () => {
  const corrupted = { id: "nikko-stop", canonicalPlaceId: "nikko", name: "Nikko", country: "Argentina", coordinates: [-68.303, -54.8019] as [number, number] };
  const leg = estimateLeg(tokyo, corrupted);
  assert.equal(leg.durationMinutes, null);
  assert.equal(leg.confidence, "unconfirmed");
  assert.equal(leg.mode, "unknown");
});
