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

type MapControlOwner<Control> = {
  addControl(control: Control, position?: "top-right"): unknown;
};

type MapLibreControlRuntime<Control> = {
  NavigationControl: new (options: { showCompass: boolean }) => Control;
};

export function installMorroviaMapControls<Control>(
  map: MapControlOwner<Control>,
  runtime: MapLibreControlRuntime<Control>,
  surface: MorroviaMapSurface,
) {
  if (!resolveMapSurfacePolicy(surface).zoomControl) return;
  map.addControl(new runtime.NavigationControl({ showCompass: false }), "top-right");
}

/** Native MapLibre credits remain visible initially. OSMF permits collapse
 * after five seconds; keep the native disclosure and source links intact. */
export function installMorroviaMapAttribution(map: {
  getContainer(): HTMLElement;
  on(event: 'styledata' | 'sourcedata', listener: () => void): unknown;
  off(event: 'styledata' | 'sourcedata', listener: () => void): unknown;
}) {
  const container = map.getContainer();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let presented = false;
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const showInitially = () => {
    const attribution = container.querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
    if (presented || !attribution?.querySelector('.maplibregl-ctrl-attrib-inner')?.textContent?.trim()) return;
    presented = true;
    timer = setTimeout(() => {
      timer = undefined;
      if (attribution.contains(document.activeElement) || attribution.matches(':hover')) return;
      if (attribution.classList.contains('maplibregl-compact-show')) attribution.querySelector<HTMLElement>('.maplibregl-ctrl-attrib-button')?.click();
    }, 5000);
  };
  const containInteraction = (event: Event) => {
    if (!(event.target instanceof Element) || !event.target.closest('.maplibregl-ctrl-attrib')) return;
    cancel(); // A deliberate disclosure choice is never overturned by the timer.
    event.stopPropagation();
  };
  for (const event of ['pointerdown', 'pointerup', 'click', 'keydown']) container.addEventListener(event, containInteraction);
  map.on('styledata', showInitially);
  map.on('sourcedata', showInitially);
  showInitially();
  return () => {
    cancel();
    map.off('styledata', showInitially);
    map.off('sourcedata', showInitially);
    for (const event of ['pointerdown', 'pointerup', 'click', 'keydown']) container.removeEventListener(event, containInteraction);
  };
}
