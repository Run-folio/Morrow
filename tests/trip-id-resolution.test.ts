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

test("logout and account switching cannot expose another owner's browser fallback", () => {
  const ownedTrip = { id: "trip-owned", ownerId: "owner-a" };
  assert.equal(requestedTripMatch(ownedTrip.id, ownedTrip), null);
  assert.equal(requestedTripMatch(ownedTrip.id, ownedTrip, "owner-b"), null);
  assert.equal(requestedTripMatch(ownedTrip.id, ownedTrip, "owner-a"), ownedTrip);
});

test("an unclaimed browser trip survives refresh before and after its owner is attached", () => {
  const localTrip = { id: "trip-local", ownerId: null };
  assert.equal(requestedTripMatch(localTrip.id, localTrip), localTrip);
  assert.equal(requestedTripMatch(localTrip.id, localTrip, "owner-a"), localTrip);

  const promotedTrip = { ...localTrip, ownerId: "owner-a" };
  assert.equal(requestedTripMatch(promotedTrip.id, promotedTrip, "owner-a"), promotedTrip);
});
