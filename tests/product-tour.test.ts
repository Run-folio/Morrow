import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PRODUCT_TOUR_COMPLETE_KEY, shouldShowProductTourPrompt } from "../lib/easyt/product-tour.ts";

const tourSource = readFileSync(new URL("../components/easyt/easyt-product-tour.tsx", import.meta.url), "utf8");
const tourStyles = readFileSync(new URL("../components/easyt/easyt-product-tour.module.css", import.meta.url), "utf8");
const captureStory = readFileSync(new URL("../components/easyt/morrovia-trip-capture.stories.tsx", import.meta.url), "utf8");
const builderStory = readFileSync(new URL("../app/journey/new/trip-builder-review.stories.tsx", import.meta.url), "utf8");
const overviewStory = readFileSync(new URL("../components/easyt/trip-overview-workspace.stories.tsx", import.meta.url), "utf8");
const mapStory = readFileSync(new URL("../components/easyt/trip-map-workspace.stories.tsx", import.meta.url), "utf8");
const itineraryStory = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");

function pngDimensions(path: string) {
  const image = readFileSync(new URL(`../public/journey/product-shots/tour/${path}`, import.meta.url));
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

test("offers the Tour only until the visitor completes or dismisses it", () => {
  assert.equal(PRODUCT_TOUR_COMPLETE_KEY, "easyt-product-tour-complete");
  assert.equal(shouldShowProductTourPrompt(null), true);
  assert.equal(shouldShowProductTourPrompt(""), true);
  assert.equal(shouldShowProductTourPrompt("1"), false);
});

test("the current product tour keeps five concise traveller-facing steps", () => {
  assert.equal((tourSource.match(/label: "0[1-5] ·/g) ?? []).length, 10, "English and Spanish each provide five steps");
  assert.match(tourSource, /Start with a route that makes sense/);
  assert.match(tourSource, /03 · See the whole trip/);
  assert.match(tourSource, /Know what needs attention next/);
  assert.match(tourSource, /04 · Explore the Map/);
  assert.match(tourSource, /See how the whole trip connects/);
  assert.match(tourSource, /05 · Shape each day/);
  assert.match(tourSource, /Make the itinerary yours/);
  assert.match(tourSource, /map-workspace-mobile\.png/);
  assert.match(tourSource, /itinerary-workspace-mobile\.png/);
  assert.doesNotMatch(tourSource, /\bPrep\b/);
  assert.doesNotMatch(tourSource, /understand the journey spatially|overnight bases|needs your judgement/);
});

test("desktop uses landscape product media and mobile keeps a dedicated compact crop", () => {
  assert.match(tourSource, /className=\{styles\.mediaFrame\}/);
  assert.doesNotMatch(tourSource, /styles\.device/);
  assert.match(tourStyles, /\.screen\{aspect-ratio:16\/10/);
  assert.match(tourStyles.replaceAll("\n", " "), /@media\(max-width:680px\).*\.screen\{aspect-ratio:3\/4/);
  assert.match(tourStyles, /grid-template-columns:minmax\(0,1\.62fr\) minmax\(330px,1fr\)/);
});

test("all Tour capture stories consume the shared coherent Peru fixture", () => {
  for (const source of [captureStory, builderStory, overviewStory, mapStory, itineraryStory]) {
    assert.match(source, /tourTripFixture|TOUR_TRIP_PROMPT/);
  }
  assert.doesNotMatch(builderStory, /Device edits kept safe|Your session ended/);
});

test("Tour image assets match their desktop and mobile display ratios", () => {
  for (const name of ["describe-trip", "shape-route", "trip-workspace", "map-workspace", "itinerary-workspace"]) {
    assert.deepEqual(pngDimensions(`${name}.png`), { width: 1600, height: 1000 });
    assert.deepEqual(pngDimensions(`${name}-mobile.png`), { width: 750, height: 1000 });
  }
});

test("Tour dialog keyboard and focus behaviour remains in place", () => {
  assert.match(tourSource, /event\.key === "Escape"/);
  assert.match(tourSource, /event\.key !== "Tab"/);
  assert.match(tourSource, /lastItem\.focus\(\)/);
  assert.match(tourSource, /returnFocusRef\.current/);
});
