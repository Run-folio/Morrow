import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveMapCameraRequest,
  resolveMapInsets,
  resolveMapSurfacePolicy,
} from "../lib/easyt/map-surface-policy.ts";

test("surface variants expose only their intended interaction", () => {
  assert.deepEqual(resolveMapSurfacePolicy({ variant: "preview" }), { panZoom: false, domainSelection: false, zoomControl: false });
  assert.deepEqual(resolveMapSurfacePolicy({ variant: "embedded", interaction: "selection-only" }), { panZoom: false, domainSelection: true, zoomControl: false });
  assert.deepEqual(resolveMapSurfacePolicy({ variant: "embedded", interaction: "pan-zoom" }), { panZoom: true, domainSelection: true, zoomControl: true });
  assert.deepEqual(resolveMapSurfacePolicy({ variant: "workspace" }), { panZoom: true, domainSelection: true, zoomControl: true });
});

test("occlusions clamp without erasing a 320px map", () => {
  assert.deepEqual(resolveMapInsets({
    width: 320,
    height: 420,
    safe: 16,
    occlusions: { left: 440, right: 0, top: 0, bottom: 0 },
  }), { top: 16, right: 16, bottom: 16, left: 144 });
});

test("connection targets use only selected geometry", () => {
  const request = resolveMapCameraRequest(
    { kind: "leg", id: "leg-a-b", coordinates: [[1, 2], [3, 4]] },
    { top: 20, right: 200, bottom: 20, left: 20 },
  );
  assert.deepEqual(request, {
    kind: "fit",
    coordinates: [[1, 2], [3, 4]],
    padding: { top: 20, right: 200, bottom: 20, left: 20 },
    maxZoom: 9,
  });
});

test("single and empty targets degrade to intentional camera requests", () => {
  const padding = { top: 16, right: 16, bottom: 16, left: 16 };
  assert.deepEqual(resolveMapCameraRequest({ kind: "route", coordinates: [[10, 20]] }, padding), {
    kind: "focus",
    center: [10, 20],
    zoom: 8,
  });
  assert.deepEqual(resolveMapCameraRequest({ kind: "collection", ids: [], coordinates: [] }, padding), { kind: "none" });
  assert.deepEqual(resolveMapCameraRequest({ kind: "stop", id: "invalid", coordinates: [Number.NaN, 20] }, padding), { kind: "none" });
});
