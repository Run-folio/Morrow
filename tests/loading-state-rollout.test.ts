import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("approved loading primitives retain one semantic announcement and reduced-motion support", () => {
  const primitive = read("components/easyt/morrovia-loading-states.tsx");
  const css = read("components/easyt/morrovia-loading-states.module.css");
  assert.match(primitive, /role=\{failed \? "alert" : "status"\}/);
  assert.match(primitive, /aria-hidden="true" className=\{`\$\{styles\.skeleton/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.skeleton \{ animation: none/);
});

test("homepage and Builder use truthful pending controls and preserve save-state feedback", () => {
  const homepage = read("app/journey/home/home-trip-starter.tsx");
  const builder = read("app/journey/new/trip-builder.tsx");
  const capture = read("components/easyt/morrovia-trip-capture.tsx");
  assert.match(homepage, /<MorroviaTripCapture/);
  assert.match(builder, /<MorroviaTripCapture/);
  assert.match(capture, /<EasyTButton type="submit" size="large" loading=\{loading\}/);
  assert.match(capture, /checking: "Understanding your trip…"/);
  assert.match(builder, /loading=\{openingTrip\}/);
  assert.match(builder, /disabled=\{Boolean\(gate\) \|\| openingTrip/);
  assert.match(builder, /<MorroviaSaveStatus state=\{visibleSaveState\}/);
});

test("dashboard and device-trip transitions use known-layout or bounded shared states", () => {
  const dashboard = read("app/journey/dashboard/loading.tsx");
  const resolver = read("components/easyt/trip-shell-resolver.tsx");
  assert.match(dashboard, /Loading your trips…/);
  assert.match(dashboard, /<MorroviaSkeleton/);
  assert.match(resolver, /<MorroviaSectionStatus title="Opening your route" detail="Loading the trip saved on this device before its workspace opens\."/);
});

test("provider-backed stay, place, activity, and Overview sections keep usable content during a retry", () => {
  const finder = read("components/journey-local-finder.tsx");
  const attractions = read("components/journey-itinerary-refinement.tsx");
  const readiness = read("components/easyt/use-trip-prep-readiness.ts");
  const overview = read("components/easyt/trip-overview-workspace.tsx");
  assert.match(finder, /const retainExistingResults = searchVersion > 0 && loadedResultKeyRef\.current === resultKey/);
  assert.match(finder, /title=\{kind === "stay" \? "Checking stay options" : "Finding places nearby"\}/);
  assert.match(finder, /loading && !displayPlaces\.length \? <div className=\{styles\.localLoadingSkeletons\}/);
  assert.match(attractions, /const retryingCurrentStop = searchVersion > 0 && loadedStopIdRef\.current === stop\.id/);
  assert.match(attractions, /new AbortController\(\)/);
  assert.match(attractions, /title="Attractions are unavailable"/);
  assert.match(attractions, /<MorroviaSkeleton height=\{54\} radius="card"/);
  assert.doesNotMatch(readiness, /setActions\(\[\]\);/);
  assert.doesNotMatch(readiness, /setReadinessCards\(\[\]\);\s*setReadinessStatus\("loading"\)/);
  assert.match(readiness, /createAbortableEffectScope\("Overview booking readiness request"\)/);
  assert.match(overview, /<MorroviaSectionStatus/);
});

test("compact provider docks retain usable small-screen targets and do not add a new Map lifecycle", () => {
  const journeyCss = read("app/journey/journey.module.css");
  const mapWorkspace = read("components/journey-map-planner-workspace.tsx");
  assert.match(journeyCss, /@media\(max-width:420px\)/);
  assert.match(journeyCss, /\.restaurantActions a,.restaurantActions button\{justify-content:center;min-height:44px/);
  assert.match(mapWorkspace, /<MorroviaSectionStatus title="Opening your route" detail="Loading the saved trip context before the map becomes interactive\."/);
  assert.doesNotMatch(mapWorkspace, /MorroviaMapLoading/);
});
