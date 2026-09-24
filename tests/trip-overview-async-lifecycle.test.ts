import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createAbortableEffectScope, isAbortError } from "../lib/easyt/abortable-effect.ts";

function pendingRequest(scope: ReturnType<typeof createAbortableEffectScope>) {
  return new Promise<never>((_resolve, reject) => {
    scope.signal.addEventListener("abort", () => reject(scope.signal.reason), { once: true });
  });
}

test("Overview image request cleanup aborts with an explicit handled reason and cannot commit", async () => {
  const scope = createAbortableEffectScope("Overview place image request");
  let committed = false;
  const request = pendingRequest(scope)
    .then(() => scope.commit(() => { committed = true; }))
    .catch((error) => assert.equal(scope.isCancellation(error), true));

  scope.dispose();
  await request;

  assert.equal(committed, false);
  assert.equal(scope.signal.aborted, true);
  assert.equal(isAbortError(scope.signal.reason), true);
  assert.match((scope.signal.reason as Error).message, /place image request cancelled/);
});

test("a changed image dependency retires request A and only request B can update", async () => {
  const committed: string[] = [];
  const scopeA = createAbortableEffectScope("image A");
  const requestA = pendingRequest(scopeA).catch((error) => assert.equal(scopeA.isCancellation(error), true));
  scopeA.dispose();

  const scopeB = createAbortableEffectScope("image B");
  await Promise.resolve("B").then((value) => scopeB.commit(() => committed.push(value)));
  await requestA;

  scopeA.commit(() => committed.push("A"));
  assert.deepEqual(committed, ["B"]);
});

test("a genuine provider failure is not classified as cancellation and can select fallback state", () => {
  const scope = createAbortableEffectScope("Overview provider request");
  const providerError = new Error("provider unavailable");
  let fallback = false;

  if (!scope.isCancellation(providerError)) scope.commit(() => { fallback = true; });

  assert.equal(fallback, true);
  assert.equal(scope.signal.aborted, false);
});

test("Overview effects use semantic dependencies and abort stale shared-cache resolution", () => {
  const source = readFileSync("components/easyt/trip-overview-workspace.tsx", "utf8");
  assert.match(source, /resolveRoutePhotoCandidates\(imageResolutionCandidates/);
  assert.match(source, /\{ signal: controller\.signal \}/);
  assert.match(source, /if \(!next\[candidate\.cacheKey\]\)/);
  assert.match(source, /resolvedPlaceImages\[imageCacheKeysByOccurrence\[stop\.id\]\]/);
  assert.doesNotMatch(source, /representativeStay|setRepresentativeStay/);
  assert.match(source, /return \(\) => controller\.abort\(\)/);
  assert.match(source, /\}, \[imageResolutionCandidates, initialPlaceImages\]\);/);
});

test("each Map owner removes only its captured instance and ignores stale lifecycle callbacks", () => {
  const mapSource = readFileSync("components/journey-planner-map.tsx", "utf8");
  assert.match(mapSource, /map\.on\("error", handleMapError\)/);
  assert.match(mapSource, /basemapLifecycle\.handleError\(event\)/);
  assert.doesNotMatch(mapSource, /if \(previewMode\) map\.on\("error", handleMapError\)/);
  assert.match(mapSource, /value instanceof Event/);
  assert.match(mapSource, /Morrovia MapLibre resource request ended before the map finished loading/);
  assert.match(mapSource, /ownerActive && mapRef\.current === map/);
  assert.match(mapSource, /removing = true;\s*map\.remove\(\);\s*map\.off\("error", handleMapError\)/);
  assert.match(mapSource, /if \(mapRef\.current === map\) mapRef\.current = null/);
  assert.doesNotMatch(mapSource, /removalTimerRef|mapRef\.current\?\.remove/);
});

test("dashboard route previews release off-screen MapLibre owners", () => {
  const dashboardSource = readFileSync("app/journey/dashboard/dashboard-client.tsx", "utf8");
  assert.match(dashboardSource, /function TripRoutePreview/);
  assert.match(dashboardSource, /new IntersectionObserver/);
  assert.match(dashboardSource, /setOwnsMap\(Boolean\(entry\?\.isIntersecting\)\)/);
  assert.match(dashboardSource, /rootMargin: "240px 0px"/);
  assert.match(dashboardSource, /ownsMap \? <JourneyPlannerMap/);
  assert.match(dashboardSource, /routePreviewFallback/);
});

test("embedded Itinerary selection updates pins without making the map a presentation-only preview", () => {
  const mapSource = readFileSync("components/journey-planner-map.tsx", "utf8");
  assert.match(mapSource, /const routeFocusKey = presentationOnly \? null : focusCoordinates/);
  assert.match(mapSource, /const routeSelectionKey = presentationOnly \? null : selectedLegId/);
  assert.match(mapSource, /\}, \[domainSelection, interactivePlannerPinIds, plannerPins, surface\.variant\]\);/);
  assert.match(mapSource, /selectedPlannerPinIdRef\.current/);
  assert.match(mapSource, /bindMapMarkerActivation\(element,/);
  assert.match(mapSource, /if \(surface\.variant === "embedded"\) drawPins\(\)/);
});

test("the canonical full Map uses workspace policy rather than Overview preview policy", () => {
  const mapSource = readFileSync("components/journey-planner-map.tsx", "utf8");
  const workspaceSource = readFileSync("components/journey-map-planner-workspace.tsx", "utf8");
  assert.match(mapSource, /const presentationOnly = surface\.variant === "preview"/);
  assert.match(workspaceSource, /<JourneyPlannerMap/);
  assert.match(workspaceSource, /surface = \{ variant: "workspace" \}/);
});
