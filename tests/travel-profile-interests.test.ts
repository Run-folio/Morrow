import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultTravelProfile,
  isTravelProfile,
  travelProfileFromUnknown,
  tripInterestsWithProfileDefaults,
  type TravelProfile,
} from "../lib/easyt/travel-profile.ts";

test("legacy profile values retain pace, hotel moves and budget without silently becoming permanent interests", () => {
  const legacy = travelProfileFromUnknown({ pace: "slow", priority: "food", hotelMoves: "few", budget: "value" });
  assert.deepEqual(legacy, { pace: "slow", usualInterests: [], hotelMoves: "few", budget: "value" });
});

test("usual interests use only the canonical trip-interest IDs", () => {
  const profile = { pace: "balanced", usualInterests: ["food", "culture"], hotelMoves: "some", budget: "mid" } as const;
  assert.equal(isTravelProfile(profile), true);
  assert.equal(isTravelProfile({ ...profile, usualInterests: ["nightlife"] }), false);
  assert.deepEqual(travelProfileFromUnknown({ ...profile, usualInterests: ["food", "coast", "unknown"] })?.usualInterests, ["food", "beach"]);
});

test("profile values default only an untouched new trip and never override trip edits", () => {
  const profile: TravelProfile = { ...defaultTravelProfile, usualInterests: ["nature", "hiking"] };
  assert.deepEqual(tripInterestsWithProfileDefaults([], profile, false), ["nature", "hiking"]);
  assert.deepEqual(tripInterestsWithProfileDefaults([], profile, true), []);
  assert.deepEqual(tripInterestsWithProfileDefaults(["culture"], profile, false), ["culture"]);
  assert.deepEqual(profile.usualInterests, ["nature", "hiking"]);
});
