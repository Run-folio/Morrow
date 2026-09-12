import type { StyleSpecification } from "maplibre-gl";

import {
  MORROVIA_DETAILED_BASEMAP_SOURCE_ID,
  MORROVIA_DETAILED_BASEMAP_STYLE_URL,
  morroviaMapFallbackStyle,
} from "../../components/easyt/morrovia-map-presentation.ts";

export const MORROVIA_DETAIL_ZOOM = 7.1;

export type MorroviaBasemapStatus = "loading" | "detailed" | "fallback";

type BasemapLayer = {
  id: string;
  source?: string;
  minzoom?: number;
  maxzoom?: number;
  layout?: { visibility?: string };
};

type BasemapEvent = {
  error?: unknown;
  sourceId?: string;
  type?: string;
};

type BasemapListener = (event: BasemapEvent) => void;

export type MorroviaBasemapMap = {
  getSource: (id: string) => unknown;
  getStyle: () => { layers?: BasemapLayer[] } | undefined;
  getZoom: () => number;
  isSourceLoaded: (id: string) => boolean;
  isStyleLoaded: () => boolean | undefined;
  on: (type: string, listener: BasemapListener) => unknown;
  off: (type: string, listener: BasemapListener) => unknown;
  setStyle: (style: string | StyleSpecification, options?: { diff?: boolean }) => unknown;
};

export type MorroviaBasemapSnapshot = {
  status: MorroviaBasemapStatus;
  zoom: number;
  styleLoaded: boolean;
  detailedSourcePresent: boolean;
  detailedSourceLoaded: boolean;
  visibleDetailedLayerCount: number;
  reason: string | null;
};

function recordValue(value: unknown, key: string) {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function errorEvidence(value: unknown) {
  const nested = recordValue(value, "error");
  return [
    recordValue(value, "sourceId"),
    recordValue(value, "message"),
    recordValue(value, "url"),
    recordValue(nested, "message"),
    recordValue(nested, "url"),
  ].filter((item): item is string => typeof item === "string").join(" ");
}

export function isMorroviaDetailedBasemapError(value: unknown) {
  const sourceId = recordValue(value, "sourceId");
  if (sourceId === MORROVIA_DETAILED_BASEMAP_SOURCE_ID || sourceId === "ne2_shaded") return true;
  return /tiles\.openfreemap\.org/i.test(errorEvidence(value));
}

function layerIsVisibleAtZoom(layer: BasemapLayer, zoom: number) {
  if (layer.source !== MORROVIA_DETAILED_BASEMAP_SOURCE_ID) return false;
  if (layer.layout?.visibility === "none") return false;
  if (layer.minzoom !== undefined && zoom < layer.minzoom) return false;
  if (layer.maxzoom !== undefined && zoom >= layer.maxzoom) return false;
  return true;
}

function hasDetailedLayers(map: MorroviaBasemapMap) {
  return map.getStyle()?.layers?.some((layer) => layer.source === MORROVIA_DETAILED_BASEMAP_SOURCE_ID) ?? false;
}

export function inspectMorroviaBasemap(map: MorroviaBasemapMap, status: MorroviaBasemapStatus, reason: string | null = null): MorroviaBasemapSnapshot {
  const style = map.getStyle();
  const zoom = map.getZoom();
  const styleLoaded = Boolean(map.isStyleLoaded());
  const detailedSourcePresent = Boolean(map.getSource(MORROVIA_DETAILED_BASEMAP_SOURCE_ID));
  let detailedSourceLoaded = false;
  if (detailedSourcePresent) {
    try {
      detailedSourceLoaded = map.isSourceLoaded(MORROVIA_DETAILED_BASEMAP_SOURCE_ID);
    } catch {
      detailedSourceLoaded = false;
    }
  }
  return {
    status,
    zoom,
    styleLoaded,
    detailedSourcePresent,
    detailedSourceLoaded,
    visibleDetailedLayerCount: (style?.layers ?? []).filter((layer) => layerIsVisibleAtZoom(layer, zoom)).length,
    reason,
  };
}

export function createMorroviaBasemapLifecycle(map: MorroviaBasemapMap, options: {
  detailedStyle?: string;
  fallbackStyle?: StyleSpecification;
  timeoutMs?: number;
  onChange?: (snapshot: MorroviaBasemapSnapshot) => void;
  onStyleReady?: () => void;
  onTrace?: (event: string, snapshot: MorroviaBasemapSnapshot) => void;
} = {}) {
  const detailedStyle = options.detailedStyle ?? MORROVIA_DETAILED_BASEMAP_STYLE_URL;
  const fallbackStyle = options.fallbackStyle ?? morroviaMapFallbackStyle;
  const timeoutMs = options.timeoutMs ?? 12_000;
  let status: MorroviaBasemapStatus = "loading";
  let reason: string | null = null;
  let disposed = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const snapshot = () => inspectMorroviaBasemap(map, status, reason);
  const publish = (event: string) => {
    if (disposed) return;
    const current = snapshot();
    options.onChange?.(current);
    options.onTrace?.(event, current);
  };
  const clearLoadTimeout = () => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
  };
  const useFallback = (nextReason: string) => {
    if (disposed || status === "fallback") return;
    clearLoadTimeout();
    status = "fallback";
    reason = nextReason;
    publish("fallback-requested");
    map.setStyle(fallbackStyle, { diff: false });
  };
  const armLoadTimeout = () => {
    clearLoadTimeout();
    if (timeoutMs <= 0) return;
    timeout = setTimeout(() => useFallback("The detailed basemap did not become ready in time."), timeoutMs);
  };
  const markDetailedReady = (event: string) => {
    if (status === "fallback") return;
    const current = inspectMorroviaBasemap(map, status, reason);
    if (!current.detailedSourcePresent || !current.detailedSourceLoaded) return;
    clearLoadTimeout();
    status = "detailed";
    reason = null;
    publish(event);
  };
  const handleStyleLoad: BasemapListener = () => {
    if (status === "fallback") {
      options.onStyleReady?.();
      publish("fallback-style.load");
      return;
    }
    const current = snapshot();
    if (!current.detailedSourcePresent || !hasDetailedLayers(map)) {
      useFallback("The detailed basemap style loaded without a usable source and visible layers.");
      return;
    }
    options.onStyleReady?.();
    publish("detailed-style.load");
    markDetailedReady("detailed-style.ready");
  };
  const handleSourceData: BasemapListener = (event) => {
    if (event.sourceId === MORROVIA_DETAILED_BASEMAP_SOURCE_ID) markDetailedReady("detailed-sourcedata.ready");
  };
  const handleIdle: BasemapListener = () => markDetailedReady("detailed-idle.ready");
  const handleZoomEnd: BasemapListener = () => {
    const current = snapshot();
    options.onTrace?.("zoomend", current);
    if (status === "fallback" || current.zoom < MORROVIA_DETAIL_ZOOM || !current.styleLoaded) return;
    if (!current.detailedSourcePresent || current.visibleDetailedLayerCount === 0) {
      useFallback("The detailed basemap source or layers disappeared after zooming in.");
    }
  };

  map.on("style.load", handleStyleLoad);
  map.on("sourcedata", handleSourceData);
  map.on("idle", handleIdle);
  map.on("zoomend", handleZoomEnd);
  armLoadTimeout();
  publish("initial");

  return {
    getSnapshot: snapshot,
    handleError(value: unknown) {
      if (disposed || status === "fallback" || !isMorroviaDetailedBasemapError(value)) return false;
      useFallback("The detailed basemap provider could not load its style or tiles.");
      return true;
    },
    retry() {
      if (disposed) return;
      status = "loading";
      reason = null;
      publish("retry-requested");
      armLoadTimeout();
      map.setStyle(detailedStyle, { diff: false });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearLoadTimeout();
      map.off("style.load", handleStyleLoad);
      map.off("sourcedata", handleSourceData);
      map.off("idle", handleIdle);
      map.off("zoomend", handleZoomEnd);
    },
  };
}

export type MorroviaBasemapLifecycle = ReturnType<typeof createMorroviaBasemapLifecycle>;
