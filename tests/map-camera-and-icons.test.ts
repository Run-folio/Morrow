import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CircleHelp, Plane, TrainFront } from "lucide-react";

import {
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

test("the Map has one replaceable camera request and explicit manual interruption paths", () => {
  const source = readFileSync(new URL("../components/journey-planner-map.tsx", import.meta.url), "utf8");
  assert.match(source, /lastCameraRequestKeyRef/);
  assert.match(source, /currentCameraRequestRef/);
  assert.match(source, /cameraRequestKey === lastCameraRequestKeyRef\.current/);
  assert.match(source, /focusMapCamera\(/);
  assert.match(source, /fitMapCamera\(/);
  assert.match(source, /new ResizeObserver[\s\S]*?\}, \[overviewMode, overviewPaddingKey, overviewRouteKey, previewMode\]\);/);
  assert.match(source, /container\.addEventListener\("pointerdown", interrupt/);
  assert.match(source, /container\.addEventListener\("wheel", interrupt/);
  assert.match(source, /container\.addEventListener\("keydown", interruptKeyboardCamera/);
  assert.match(source, /map\.on\("dragstart", interrupt\)/);
  assert.match(source, /\["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "\+", "-", "="\]/);
  assert.match(source, /<span className="planner-map__leg-icon"[^>]*style=\{rotation[\s\S]*?<MarkerIcon \/>/);
  assert.doesNotMatch(source, /<MarkerIcon style=/);
  assert.doesNotMatch(source, /duration: (?:420|550)/);
});
