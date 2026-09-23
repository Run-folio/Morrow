import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CircleHelp, Plane, TrainFront } from "lucide-react";

import {
  applyMapCameraRequest,
  fitMapCamera,
  focusMapCamera,
  interruptMapCamera,
  mapFocusDuration,
  shortestLongitudeDelta,
  type MapCamera,
} from "../lib/easyt/map-camera.ts";
import {
  LUCIDE_PLANE_INTRINSIC_BEARING,
  mapTransportIcon,
  mapTransportIconRotation,
} from "../components/easyt/morrovia-transport-icons.ts";
import { mapRouteFitCoordinates, mapRouteLegActivationEvent, type MapRouteLeg } from "../lib/easyt/map-spatial-context.ts";

function camera(center: [number, number] = [0, 0], zoom = 4) {
  const calls: Array<{ method: string; options?: unknown }> = [];
  const value: MapCamera = {
    stop: () => calls.push({ method: "stop" }),
    easeTo: (options) => calls.push({ method: "easeTo", options }),
    fitBounds: (_bounds, options) => calls.push({ method: "fitBounds", options }),
    getCenter: () => ({ lng: center[0], lat: center[1] }),
    getZoom: () => zoom,
  };
  return { calls, value };
}

test("scripted map focus is distance-aware, short, capped, and reduced-motion safe", () => {
  const { value } = camera([179, 0], 4);
  assert.equal(shortestLongitudeDelta(179, -179), 2);
  assert.equal(mapFocusDuration(value, [179.5, 0.2], 5, false), 260);
  assert.equal(mapFocusDuration(value, [-179, 0], 6, false), 340, "dateline neighbours use the short longitude delta");
  assert.equal(mapFocusDuration(value, [-161, 0], 8, false), 460);
  assert.equal(mapFocusDuration(value, [100, 40], 14, false), 600);
  assert.equal(mapFocusDuration(value, [100, 40], 14, true), 0);
});

test("every scripted movement stops the previous camera owner first", () => {
  const focused = camera();
  assert.equal(focusMapCamera(focused.value, { center: [12, 4], zoom: 9 }), 460);
  assert.deepEqual(focused.calls.map((call) => call.method), ["stop", "easeTo"]);
  assert.deepEqual(focused.calls[1]?.options, { center: [12, 4], zoom: 9, duration: 460 });

  const fitted = camera();
  assert.equal(fitMapCamera(fitted.value, "bounds", { maxZoom: 5 }, true), 0);
  assert.deepEqual(fitted.calls.map((call) => call.method), ["stop", "fitBounds"]);
  assert.deepEqual(fitted.calls[1]?.options, { maxZoom: 5, duration: 0 });

  const interrupted = camera();
  interruptMapCamera(interrupted.value);
  assert.deepEqual(interrupted.calls, [{ method: "stop" }]);
});

test("rapid focus replacement leaves the newest target as the final camera request", () => {
  const rapid = camera();
  focusMapCamera(rapid.value, { center: [139.6917, 35.6895], zoom: 11 });
  focusMapCamera(rapid.value, { center: [136.6562, 36.5613], zoom: 11 });
  focusMapCamera(rapid.value, { center: [135.5023, 34.6937], zoom: 11 });

  assert.deepEqual(rapid.calls.map((call) => call.method), [
    "stop", "easeTo",
    "stop", "easeTo",
    "stop", "easeTo",
  ]);
  assert.deepEqual(rapid.calls.at(-1)?.options, {
    center: [135.5023, 34.6937],
    zoom: 11,
    duration: 600,
  });
  assert.equal(Object.hasOwn(rapid.calls.at(-1)?.options as object, "complete"), false, "no stale completion callback can restore an older target");
});

test("Map transport aliases share the canonical icons and unknown stays neutral", () => {
  for (const rail of ["train", "rail", "high_speed_rail", "high-speed-rail", "highspeedrail", "intercity-rail", "metro", "metro_rail"]) {
    assert.equal(mapTransportIcon(rail), TrainFront, rail);
  }
  assert.equal(mapTransportIcon("flight"), Plane);
  assert.equal(mapTransportIcon("teleporter"), CircleHelp);
});

test("plane rotation compensates the proved Lucide baseline and other icons stay fixed", () => {
  assert.equal(LUCIDE_PLANE_INTRINSIC_BEARING, 45);
  assert.equal(mapTransportIconRotation("flight", 0), -45);
  assert.equal(mapTransportIconRotation("flight", 90), 45);
  assert.equal(mapTransportIconRotation("flight", 180), 135);
  assert.equal(mapTransportIconRotation("flight", -90), -135);
  assert.equal(mapTransportIconRotation("train", 90), null);
  assert.equal(mapTransportIconRotation("unknown", 90), null);
});

test("selected-leg framing prefers finite routed geometry and falls back to endpoints", () => {
  const leg = {
    fromCoordinates: [135, 35],
    toCoordinates: [136, 36],
    routeGeometry: [[135, 35], [135.4, 35.8], [136, 36]],
  } as MapRouteLeg;
  assert.deepEqual(mapRouteFitCoordinates(leg), leg.routeGeometry);
  assert.deepEqual(mapRouteFitCoordinates({ ...leg, routeGeometry: [[Number.NaN, 0]] }), [[135, 35], [136, 36]]);
  assert.deepEqual(mapRouteFitCoordinates({
    ...leg,
    routeSegments: [{ mode: "train", fromCoordinates: [135, 35], toCoordinates: [136, 36], routeGeometry: [[135, 35], [135.2, 35.6], [136, 36]] }],
  }), [[135, 35], [135.2, 35.6], [136, 36]]);
});

test("transport marker pointer and keyboard activation fire once per intent", () => {
  let activations = 0;
  for (const event of [{ type: "pointerup", detail: 1 }, { type: "click", detail: 1 }]) {
    if (mapRouteLegActivationEvent(event)) activations += 1;
  }
  assert.equal(activations, 1, "the click synthesized after pointer-up is ignored");
  assert.equal(mapRouteLegActivationEvent({ type: "click", detail: 0 }), true, "Enter and Space synthesize a detail-zero click");
});

test("the Map has one replaceable camera request and explicit manual interruption paths", () => {
  const source = readFileSync(new URL("../components/journey-planner-map.tsx", import.meta.url), "utf8");
  assert.match(source, /lastCameraRequestKeyRef/);
  assert.match(source, /currentCameraRequestRef/);
  assert.match(source, /cameraRequestKey === lastCameraRequestKeyRef\.current/);
  assert.match(source, /focusMapCamera\(/);
  assert.match(source, /fitMapCamera\(/);
  assert.match(source, /applyMapCameraRequest\(/);
  assert.match(source, /kind: "leg"/);
  assert.match(source, /container\.addEventListener\("pointerdown", interrupt/);
  assert.match(source, /container\.addEventListener\("wheel", interrupt/);
  assert.match(source, /container\.addEventListener\("keydown", interruptKeyboardCamera/);
  assert.match(source, /map\.on\("dragstart", interrupt\)/);
  assert.match(source, /\["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "\+", "-", "="\]/);
  assert.match(source, /<span className="planner-map__leg-icon"[^>]*style=\{rotation[\s\S]*?<MarkerIcon \/>/);
  assert.doesNotMatch(source, /<MarkerIcon style=/);
  assert.doesNotMatch(source, /duration: (?:420|550)/);
});

test("resolved camera requests replace earlier movement and leave the newest target last", () => {
  const resolved = camera([0, 0], 4);
  const bounds = (coordinates: Array<[number, number]>) => ({ coordinates });

  applyMapCameraRequest(resolved.value, { kind: "focus", center: [12, 4], zoom: 8 }, bounds, true);
  applyMapCameraRequest(resolved.value, {
    kind: "fit",
    coordinates: [[20, 5], [24, 7]],
    padding: { top: 10, right: 20, bottom: 30, left: 40 },
    maxZoom: 9,
  }, bounds, true);

  assert.deepEqual(resolved.calls.map((call) => call.method), ["stop", "easeTo", "stop", "fitBounds"]);
  assert.deepEqual(resolved.calls.at(-1)?.options, {
    padding: { top: 10, right: 20, bottom: 30, left: 40 },
    maxZoom: 9,
    duration: 0,
  });
});

test("route geometry draws as soon as the style is ready instead of waiting for all tiles", () => {
  const source = readFileSync(new URL("../components/journey-planner-map.tsx", import.meta.url), "utf8");
  const ensureRoute = source.slice(source.indexOf("const ensureRoute = () =>"), source.indexOf("ensureRoute();", source.indexOf("const ensureRoute = () =>")));
  assert.match(ensureRoute, /hasMorroviaActiveStyle\(map as unknown as MorroviaBasemapMap\)/);
  assert.doesNotMatch(ensureRoute, /map\.loaded\(\)/);
});
