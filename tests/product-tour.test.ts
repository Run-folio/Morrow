import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PRODUCT_TOUR_COMPLETE_KEY, shouldShowProductTourPrompt } from "../lib/easyt/product-tour.ts";

const tourSource = readFileSync(new URL("../components/easyt/easyt-product-tour.tsx", import.meta.url), "utf8");
const tourStyles = readFileSync(new URL("../components/easyt/easyt-product-tour.module.css", import.meta.url), "utf8");
const captureStory = readFileSync(new URL("../components/easyt/morrovia-trip-capture.stories.tsx", import.meta.url), "utf8");
const builderStory = readFileSync(new URL("../app/journey/new/trip-builder-route-workspace.stories.tsx", import.meta.url), "utf8");
const overviewStory = readFileSync(new URL("../components/easyt/trip-overview-workspace.stories.tsx", import.meta.url), "utf8");
const mapStory = readFileSync(new URL("../components/easyt/trip-map-workspace.stories.tsx", import.meta.url), "utf8");
const itineraryStory = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");


test("offers the Tour only until the visitor completes or dismisses it", () => {
  assert.equal(PRODUCT_TOUR_COMPLETE_KEY, "easyt-product-tour-complete");
  assert.equal(shouldShowProductTourPrompt(null), true);
  assert.equal(shouldShowProductTourPrompt(""), true);
  assert.equal(shouldShowProductTourPrompt("1"), false);
});

test("the current product tour keeps five concise traveller-facing steps", () => {
  assert.equal((tourSource.match(/label: "0[1-5] ·/g) ?? []).length, 10, "English and Spanish each provide five steps");
  for (const phrase of ["Home", "Plan your route", "Overview", "Transport", "Stay", "Itinerary", "on this device", "provider’s site", "este dispositivo", "sitio del proveedor"]) assert.ok(tourSource.includes(phrase), phrase);
  assert.doesNotMatch(tourSource, /Explore the Map|map-workspace-mobile\.jpg/);
  assert.doesNotMatch(tourSource, /\bPrep\b/);
  assert.doesNotMatch(tourSource, /understand the journey spatially|overnight bases|needs your judgement/);
});

test("examples are localised, responsive and do not present historical screenshots as current UI", () => {
  assert.match(tourSource, /current.examples.map/);
  assert.match(tourSource, /Example trip · Peru/);
  assert.match(tourSource, /Viaje de ejemplo · Perú/);
  assert.doesNotMatch(tourSource, /product-shots\/tour\/current|mobileImage|Example screens/);
  assert.match(tourStyles, /@media\(max-width:680px\)/);
});

test("all Tour capture stories consume the shared coherent Peru fixture", () => {
  for (const source of [captureStory, builderStory, overviewStory, mapStory, itineraryStory]) {
    assert.match(source, /tourTripFixture|TOUR_TRIP_PROMPT/);
  }
  assert.doesNotMatch(builderStory, /Device edits kept safe|Your session ended/);
});

test("Historical product capture files retain their original formats", () => {
  for (const name of ["describe-trip", "shape-route", "trip-workspace", "map-workspace", "itinerary-workspace"]) {
    for (const suffix of ["", "-mobile"]) {
      const asset = readFileSync(new URL(`../public/journey/product-shots/tour/current/${name}${suffix}.jpg`, import.meta.url));
      assert.equal(asset.readUInt16BE(0), 0xffd8, `${name}${suffix} is a JPEG`);
      assert.ok(asset.length > 10000, `${name}${suffix} has captured content`);
    }
  }
});

test("Tour dialog keyboard and focus behaviour remains in place", () => {
  assert.match(tourSource, /event\.key === "Escape"/);
  assert.match(tourSource, /event\.key !== "Tab"/);
  assert.match(tourSource, /lastItem\.focus\(\)/);
  assert.match(tourSource, /returnFocusRef\.current/);
});

test("Tour captures retain their reviewed asset provenance", () => {
  const root = new URL("../public/journey/product-shots/tour/", import.meta.url);
  const photos = JSON.parse(readFileSync(new URL("source/manifest.json", root), "utf8"));
  const captures = JSON.parse(readFileSync(new URL("current/manifest.json", root), "utf8"));
  const hash = (url: URL) => createHash("sha256").update(readFileSync(url)).digest("hex");
  assert.equal(captures.captures.length, 10);
  for (const photo of photos) {
    assert.equal(photo.licenseUrl, "https://unsplash.com/license");
    assert.ok(photo.sourceUrl.startsWith("https://unsplash.com/photos/"));
    assert.equal(hash(new URL(`source/${photo.key}.jpg`, root)), photo.sha256);
  }
  for (const capture of captures.captures) {
    assert.equal(hash(new URL(`current/${capture.file}`, root)), capture.sha256);
    for (const key of capture.photographs) assert.ok(photos.some((photo: { key: string }) => photo.key === key));
  }
  assert.match(tourSource, /credits\.html/);
});
