import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createAbortableEffectScope, isAbortError } from "../lib/easyt/abortable-effect.ts";

function pendingRequest(scope: ReturnType<typeof createAbortableEffectScope>) {
  return new Promise<never>((_resolve, reject) => {
    scope.signal.addEventListener("abort", () => reject(scope.signal.reason), { once: true });
  });
}

async function settleCancellation(scope: ReturnType<typeof createAbortableEffectScope>) {
  let escaped = false;
  const request = pendingRequest(scope).catch((error) => {
    if (!scope.isCancellation(error)) escaped = true;
  });
  scope.dispose();
  await request;
  return escaped;
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

test("representative-stay request cleanup and dependency replacement stay handled", async () => {
  const first = createAbortableEffectScope("Overview representative stay request A");
  assert.equal(await settleCancellation(first), false);

  const committed: string[] = [];
  const second = createAbortableEffectScope("Overview representative stay request B");
  second.commit(() => committed.push("provider stay"));
  assert.deepEqual(committed, ["provider stay"]);
});

test("a genuine provider failure is not classified as cancellation and can select fallback state", () => {
  const scope = createAbortableEffectScope("Overview provider request");
  const providerError = new Error("provider unavailable");
  let fallback = false;

  if (!scope.isCancellation(providerError)) scope.commit(() => { fallback = true; });

  assert.equal(fallback, true);
  assert.equal(scope.signal.aborted, false);
});

test("Overview effects use semantic dependencies, stale guards, and the shared cancellation scope", () => {
  const source = readFileSync("components/easyt/trip-overview-workspace.tsx", "utf8");
  assert.match(source, /createAbortableEffectScope\("Overview place image request"\)/);
  assert.match(source, /createAbortableEffectScope\("Overview representative stay request"\)/);
  assert.match(source, /scope\.commit\(\(\) => setResolvedPlaceImages/);
  assert.match(source, /scope\.commit\(\(\) => setRepresentativeStay/);
  assert.doesNotMatch(source, /return \(\) => controller\.abort\(\)/);
  assert.match(source, /\}, \[imageResolutionCandidates\]\);/);
});

test("Map preview cleanup preserves a Strict Mode remount without changing full Map cleanup", () => {
  const mapSource = readFileSync("components/journey-planner-map.tsx", "utf8");
  assert.match(mapSource, /removalTimerRef/);
  assert.match(mapSource, /if \(previewMode\) map\.on\("error", handleMapError\)/);
  assert.match(mapSource, /value instanceof Event/);
  assert.match(mapSource, /Morrovia MapLibre resource request ended before the map finished loading/);
  assert.match(mapSource, /if \(!previewMode\) \{\s*removeMap\(\);\s*return;/);
  assert.match(mapSource, /mapRef\.current\?\.remove\(\)/);
});

test("Itinerary preview selection does not recreate map pins or redraw route data", () => {
  const mapSource = readFileSync("components/journey-planner-map.tsx", "utf8");
  assert.match(mapSource, /const routeFocusKey = previewMode \? null : focusCoordinates/);
  assert.match(mapSource, /const routeSelectionKey = previewMode \? null : selectedLegId/);
  assert.match(mapSource, /\}, \[plannerPins, previewMode\]\);/);
  assert.match(mapSource, /selectedPlannerPinIdRef\.current/);
  assert.match(mapSource, /if \(previewMode\) \{[\s\S]*element\.addEventListener\("pointerdown", selectPin\)/);
  assert.match(mapSource, /element\.addEventListener\("mousedown", selectPin\)/);
  assert.match(mapSource, /element\.addEventListener\("click", selectPin\)/);
  assert.match(mapSource, /else \{\s*element\.addEventListener\("click", selectPin\)/);
});

test("the canonical full Map does not inherit Overview preview mode", () => {
  const mapSource = readFileSync("components/journey-planner-map.tsx", "utf8");
  const workspaceSource = readFileSync("components/journey-map-planner-workspace.tsx", "utf8");
  assert.match(mapSource, /previewMode = false/);
  assert.match(workspaceSource, /<JourneyPlannerMap/);
  assert.doesNotMatch(workspaceSource, /<JourneyPlannerMap[\s\S]{0,800}\bpreviewMode\b/);
});
