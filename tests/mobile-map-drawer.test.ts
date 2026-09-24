import assert from "node:assert/strict";
import test from "node:test";

import { mobileMapDrawerDragDecision } from "../lib/easyt/mobile-map-drawer.ts";

test("an upward handle drag opens the drawer without an intermediate stop", () => {
  assert.equal(mobileMapDrawerDragDecision({ startX: 80, startY: 600, endX: 84, endY: 510, elapsedMs: 300, open: false }), "open");
});

test("an intentional downward handle drag collapses an open drawer", () => {
  assert.equal(mobileMapDrawerDragDecision({ startX: 80, startY: 270, endX: 82, endY: 350, elapsedMs: 250, open: true }), "collapsed");
});

test("a short fast flick can change state while a short slow gesture cannot", () => {
  assert.equal(mobileMapDrawerDragDecision({ startX: 80, startY: 600, endX: 82, endY: 574, elapsedMs: 40, open: false }), "open");
  assert.equal(mobileMapDrawerDragDecision({ startX: 80, startY: 600, endX: 82, endY: 574, elapsedMs: 400, open: false }), null);
});

test("horizontal motion and already reached states do not oscillate the drawer", () => {
  assert.equal(mobileMapDrawerDragDecision({ startX: 80, startY: 600, endX: 170, endY: 575, elapsedMs: 80, open: false }), null);
  assert.equal(mobileMapDrawerDragDecision({ startX: 80, startY: 600, endX: 80, endY: 500, elapsedMs: 200, open: true }), null);
  assert.equal(mobileMapDrawerDragDecision({ startX: 80, startY: 300, endX: 80, endY: 400, elapsedMs: 200, open: false }), null);
});
