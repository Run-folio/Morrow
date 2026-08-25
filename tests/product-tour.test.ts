import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_TOUR_COMPLETE_KEY, shouldShowProductTourPrompt } from "../lib/easyt/product-tour.ts";

test("offers the Tour only until the visitor completes or dismisses it", () => {
  assert.equal(PRODUCT_TOUR_COMPLETE_KEY, "easyt-product-tour-complete");
  assert.equal(shouldShowProductTourPrompt(null), true);
  assert.equal(shouldShowProductTourPrompt(""), true);
  assert.equal(shouldShowProductTourPrompt("1"), false);
});
