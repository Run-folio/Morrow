import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string) => readFileSync(new URL(`../app/journey/home/immersive/${name}`, import.meta.url), "utf8");

test("homepage exposes one fixed sample map rather than the obsolete Builder and Itinerary switcher", () => {
  const source = read("product-demo.tsx");
  assert.doesNotMatch(source, /DemoBuilder|DemoItinerary|EasyTSegmentedControl/);
  assert.match(source, /Sample route stops/);
  assert.match(source, /data-preview-stop/);
  assert.match(source, /href="#start-building"/);
  assert.doesNotMatch(source, /router\.push|localStorage|sessionStorage|indexedDB|fetch\(|trackEvent/);
});

test("the featured-route action labels the fixed preview without changing the real route handoff", () => {
  const source = read("route-chapters.tsx");
  assert.match(source, /Try the planner preview/);
  assert.match(source, /<RoutePlanLink draft=\{route.planDraft\}/);
  assert.match(read("immersive-home.tsx"), /<HomeTripStarter \/>/);
});

test("the homepage admits and disposes only the capability-checked map renderer", () => {
  const source = read("demo-map.tsx");
  assert.match(source, /createMapRenderer\(container\.current/);
  assert.match(source, /renderer\.kind === "unavailable"/);
  assert.match(source, /disposeRenderer\?\.\(\)/);
  assert.doesNotMatch(source, /map\?\.remove\(\)/);
});
