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
  assert.doesNotMatch(tourSource, /Explore the Map/);
  assert.doesNotMatch(tourSource, /\bPrep\b/);
  assert.doesNotMatch(tourSource, /understand the journey spatially|overnight bases|needs your judgement/);
});

test("all five Tour steps use approved responsive product captures instead of destination photos", () => {
  const expected = ["describe-trip", "shape-route", "trip-workspace", "transport-workspace", "itinerary-workspace"];
  assert.match(tourSource, /<picture><source media="\(max-width: 680px\)" srcSet=\{[\w.]+\}/);
  assert.match(tourSource, /alt=\{screenshot\.alt\[language\]\}/);
  for (const shot of expected) {
    assert.match(tourSource, new RegExp(`/tour/2026-11-20/${shot}\\.jpg`));
    assert.match(tourSource, new RegExp(`/tour/2026-11-20/${shot}-mobile\\.jpg`));
  }
  assert.match(tourSource, /Example product screens/);
  assert.match(tourSource, /Pantallas de ejemplo del producto/);
  assert.doesNotMatch(tourSource, /tour\/source|current\.examples|tripExample/);
  assert.match(tourStyles, /@media\(max-width:680px\)/);
  assert.match(tourStyles, /object-fit:contain/);
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
  const credits = readFileSync(new URL("credits.html", root), "utf8");
  assert.match(credits, /openstreetmap\.org\/copyright/);
  assert.match(credits, /current\/manifest\.json/);
});

test("live Tour screenshot references resolve to the reviewed exact-revision fixture captures", () => {
  const root = new URL("../public/journey/product-shots/tour/", import.meta.url);
  const folder = "2026-11-20/";
  const references = [...tourSource.matchAll(/"\/journey\/product-shots\/tour\/([^"]+\.(?:jpg|png))"/g)].map(match => match[1]);
  assert.equal(references.length, 10);
  assert.equal(new Set(references).size, 10);
  assert.ok(references.every(path => path.startsWith(folder)), "earlier captures cannot be labelled as the current product");
  const manifest = JSON.parse(readFileSync(new URL(`${folder}manifest.json`, root), "utf8"));
  assert.equal(manifest.capturedAt, "2026-11-20");
  assert.equal(manifest.stagingBase, "f3751ebe3d88c55ac7cc3c92d25e3fe59f7e439a");
  assert.equal(manifest.captures.length, 10);
  assert.deepEqual(references.toSorted(), manifest.captures.map((capture: { file: string }) => folder + capture.file).toSorted());
  for (const capture of manifest.captures) {
    assert.match(capture.story, /^morrovia-05-product-patterns-/);
    const bytes = readFileSync(new URL(folder + capture.file, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), capture.sha256, capture.file);
    assert.ok(bytes.byteLength > 10000, capture.file);
    assert.equal(bytes.readUInt16BE(0), 0xffd8, capture.file);
    assert.deepEqual(capture.sourceViewport, capture.presentation === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    assert.match(capture.sourceSha256, /^[a-f0-9]{64}$/);
    if (capture.frame) {
      assert.equal(capture.width, capture.frame.right - capture.frame.left);
      assert.equal(capture.height, capture.frame.bottom - capture.frame.top);
    }
    for (const key of capture.photoKeys) assert.ok(manifest.photographs[key], key);
    if (capture.step === 4) assert.match(capture.story, /trip-workspace-transport--/);
  }
  assert.match(readFileSync(new URL("credits.html", root), "utf8"), /2026-11-20\/manifest\.json/);
});
