import assert from "node:assert/strict";
import test from "node:test";
import { starterSwipeAction, starterSwipeAxis } from "../lib/easyt/starter-activity-swipe.ts";

test("defer near-origin gestures and reserve vertical or diagonal intent for native scroll", () => {
  assert.equal(starterSwipeAxis("pending", 8, 3), "pending");
  assert.equal(starterSwipeAxis("pending", 15, 15), "vertical");
  assert.equal(starterSwipeAxis("pending", 9, 20), "vertical");
  assert.equal(starterSwipeAxis("vertical", 100, 20), "vertical");
  assert.equal(starterSwipeAction("vertical", 110, 290), null);
});

test("horizontal intent stays locked but commits only deliberate travel and reverses as expected", () => {
  assert.equal(starterSwipeAxis("pending", 15, 6), "horizontal");
  assert.equal(starterSwipeAxis("horizontal", 15, 20), "horizontal");
  assert.equal(starterSwipeAction("horizontal", 68, 290), null);
  assert.equal(starterSwipeAction("horizontal", 70, 290), "save");
  assert.equal(starterSwipeAction("horizontal", -70, 290), "skip");
  assert.equal(starterSwipeAction("horizontal", 61, 250), null);
  assert.equal(starterSwipeAction("horizontal", 62, 250), "save");
  assert.equal(starterSwipeAction("horizontal", 92, 600), "save");
  assert.equal(starterSwipeAction("pending", 100, 290), null);
});
