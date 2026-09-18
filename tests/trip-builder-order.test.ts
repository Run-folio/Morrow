import assert from "node:assert/strict";
import test from "node:test";

import { builderStopOrderFingerprint, validateBuilderStopOrder } from "../lib/easyt/trip-builder-order.ts";

const stops = [
  { id: "tokyo-1", place: "Tokyo" },
  { id: "kyoto-1", place: "Kyoto" },
  { id: "tokyo-2", place: "Tokyo" },
];

test("accepts an exact occurrence-ID permutation with repeated destinations", () => {
  const result = validateBuilderStopOrder(stops, ["tokyo-2", "kyoto-1", "tokyo-1"]);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.stops.map((stop) => stop.id), ["tokyo-2", "kyoto-1", "tokyo-1"]);
});

test("rejects duplicate, missing and unknown occurrence IDs", () => {
  assert.deepEqual(validateBuilderStopOrder(stops, ["tokyo-1", "tokyo-1", "tokyo-2"]), { ok: false, reason: "duplicate-id" });
  assert.deepEqual(validateBuilderStopOrder(stops, ["tokyo-1", "kyoto-1"]), { ok: false, reason: "length-mismatch" });
  assert.deepEqual(validateBuilderStopOrder(stops, ["tokyo-1", "kyoto-1", "osaka-1"]), { ok: false, reason: "unknown-id" });
});

test("rejects stale source and locked-stop displacement", () => {
  assert.deepEqual(validateBuilderStopOrder(stops, ["kyoto-1", "tokyo-1", "tokyo-2"], { expectedFingerprint: "stale" }), { ok: false, reason: "stale-source" });
  assert.deepEqual(validateBuilderStopOrder(stops, ["kyoto-1", "tokyo-1", "tokyo-2"], {
    expectedFingerprint: builderStopOrderFingerprint(stops), lockedStopIds: ["kyoto-1"],
  }), { ok: false, reason: "locked-stop" });
});

test("treats unchanged and globally fixed orders as non-mutations", () => {
  assert.deepEqual(validateBuilderStopOrder(stops, stops.map(({ id }) => id)), { ok: false, reason: "same-order" });
  assert.deepEqual(validateBuilderStopOrder(stops, ["kyoto-1", "tokyo-1", "tokyo-2"], { fixedOrder: true }), { ok: false, reason: "fixed-order" });
});
