import assert from "node:assert/strict";
import test from "node:test";
import { requestedTripMatch } from "../lib/easyt/trip-id-resolution.ts";

test("resolves the exact active canonical trip ID", () => {
  const activeTrip = { id: "trip-9c3ea847-d1e7-4ceb-a2ff-e9817460a5c6" };
  assert.equal(requestedTripMatch(activeTrip.id, activeTrip), activeTrip);
});

test("does not resolve an inaccessible or nonexistent ID from another active trip", () => {
  assert.equal(requestedTripMatch("trip-missing", { id: "trip-other" }), null);
  assert.equal(requestedTripMatch("trip-missing", null), null);
  assert.equal(requestedTripMatch("trip-owned", { id: "trip-owned", ownerId: "owner-b" }, "owner-a"), null);
});
