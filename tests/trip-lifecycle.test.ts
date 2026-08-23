import assert from "node:assert/strict";
import test from "node:test";

import { isoDateKey, parseIsoDate, tripLifecycle } from "../lib/easyt/trip-lifecycle.ts";

test("strict ISO dates reject malformed and rolled-over calendar values", () => {
  assert.equal(parseIsoDate("2026-02-31"), null);
  assert.equal(parseIsoDate("2026-2-03"), null);
  assert.equal(parseIsoDate(""), null);
  assert.equal(isoDateKey(parseIsoDate("2024-02-29")!), "2024-02-29");
  assert.equal(parseIsoDate("2025-02-29"), null);
});

test("lifecycle uses local calendar days across upcoming and active boundaries", () => {
  assert.deepEqual(
    [
      tripLifecycle("2026-08-24", "2026-08-27", new Date("2026-08-23T23:55:00")).state,
      tripLifecycle("2026-08-23", "2026-08-27", new Date("2026-08-23T08:00:00")).state,
      tripLifecycle("2026-08-21", "2026-08-27", new Date("2026-08-23T08:00:00")).state,
      tripLifecycle("2026-08-21", "2026-08-23", new Date("2026-08-23T08:00:00")).state,
      tripLifecycle("2026-08-01", "2026-08-20", new Date("2026-08-23T08:00:00")).state,
    ],
    ["upcoming", "starts-today", "in-progress", "ends-today", "ended"],
  );
  assert.equal(tripLifecycle("2026-08-24", "2026-08-27", new Date("2026-08-23T23:55:00")).daysUntilStart, 1);
});

test("lifecycle distinguishes unavailable, invalid and generically started dates", () => {
  assert.equal(tripLifecycle("", "", new Date("2026-08-23T12:00:00")).state, "unavailable");
  assert.equal(tripLifecycle("2026-02-31", "2026-03-05", new Date("2026-02-01T12:00:00")).state, "invalid");
  assert.equal(tripLifecycle("2026-08-27", "2026-08-21", new Date("2026-08-23T12:00:00")).state, "invalid");
  assert.equal(tripLifecycle("2026-08-21", "", new Date("2026-08-23T12:00:00")).state, "started");
});
