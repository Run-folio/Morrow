import type { MapOptions } from "maplibre-gl";

import { morroviaMapStyle } from "./morrovia-map-presentation.ts";
import type { MorroviaMapSurface } from "../../lib/easyt/map-surface-policy.ts";
import { resolveMapSurfacePolicy } from "../../lib/easyt/map-surface-policy.ts";

export const MORROVIA_MAP_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
export type MorroviaMapAttributionMode = "compact" | "expanded";

export function morroviaMapOptions(
  surface: MorroviaMapSurface,
  attribution: MorroviaMapAttributionMode,
): Omit<MapOptions, "container"> {
  const policy = resolveMapSurfacePolicy(surface);
  return {
    style: morroviaMapStyle,
    attributionControl: { compact: attribution === "compact" },
    interactive: policy.panZoom,
    scrollZoom: policy.panZoom,
    dragRotate: false,
    pitchWithRotate: false,
  };
}

type MapControlOwner = {
  addControl: (control: unknown, position?: "top-right") => unknown;
};

type MapLibreControlRuntime = {
  NavigationControl: new (options: { showCompass: boolean }) => unknown;
};

export function installMorroviaMapControls(
  map: MapControlOwner,
  runtime: MapLibreControlRuntime,
  surface: MorroviaMapSurface,
) {
  if (!resolveMapSurfacePolicy(surface).zoomControl) return;
  map.addControl(new runtime.NavigationControl({ showCompass: false }), "top-right");
}
