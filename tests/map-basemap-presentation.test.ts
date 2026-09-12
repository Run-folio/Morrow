import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { StyleSpecification } from "maplibre-gl";

import {
  MORROVIA_DETAILED_BASEMAP_SOURCE_ID,
  MORROVIA_DETAILED_BASEMAP_STYLE_URL,
  createMorroviaFallbackMapStyle,
  morroviaMapStyle,
} from "../components/easyt/morrovia-map-presentation.ts";
import {
  createMorroviaBasemapLifecycle,
  inspectMorroviaBasemap,
  isMorroviaDetailedBasemapError,
  type MorroviaBasemapMap,
  type MorroviaBasemapSnapshot,
} from "../lib/easyt/map-basemap-lifecycle.ts";

type Listener = (event: { sourceId?: string; error?: unknown; type?: string }) => void;

class FakeBasemap implements MorroviaBasemapMap {
  zoom = 4;
  styleLoaded = false;
  detailedSourceLoaded = false;
  sources = new Map<string, unknown>();
  layers: Array<{ id: string; source?: string; minzoom?: number; maxzoom?: number; layout?: { visibility?: string } }> = [];
  listeners = new Map<string, Set<Listener>>();
  setStyleCalls: Array<string | StyleSpecification> = [];

  loadDetailed(sourceLoaded = false) {
    this.styleLoaded = true;
    this.detailedSourceLoaded = sourceLoaded;
    this.sources = new Map([[MORROVIA_DETAILED_BASEMAP_SOURCE_ID, {}]]);
    this.layers = [
      { id: "road", source: MORROVIA_DETAILED_BASEMAP_SOURCE_ID, minzoom: 6 },
      { id: "places", source: MORROVIA_DETAILED_BASEMAP_SOURCE_ID, minzoom: 8 },
    ];
  }

  emit(type: string, event: Parameters<Listener>[0] = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, ...event });
  }

  getSource(id: string) { return this.sources.get(id); }
  getStyle() { return { layers: this.layers }; }
  getZoom() { return this.zoom; }
  isSourceLoaded(id: string) { return id === MORROVIA_DETAILED_BASEMAP_SOURCE_ID && this.detailedSourceLoaded; }
  isStyleLoaded() { return this.styleLoaded; }
  on(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  off(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); }
  setStyle(style: string | StyleSpecification) {
    this.setStyleCalls.push(style);
    this.styleLoaded = false;
    this.detailedSourceLoaded = false;
    if (typeof style === "string") {
      this.sources.clear();
      this.layers = [];
      return;
    }
    this.sources = new Map(Object.keys(style.sources).map((id) => [id, {}]));
    this.layers = style.layers.map((layer) => ({
      id: layer.id,
      ...("source" in layer && typeof layer.source === "string" ? { source: layer.source } : {}),
      ...(layer.minzoom !== undefined ? { minzoom: layer.minzoom } : {}),
      ...(layer.maxzoom !== undefined ? { maxzoom: layer.maxzoom } : {}),
      ...(layer.layout && "visibility" in layer.layout ? { layout: { visibility: layer.layout.visibility as string } } : {}),
    }));
  }
}

test("the production basemap always starts with a real keyless detailed style", () => {
  assert.equal(morroviaMapStyle, MORROVIA_DETAILED_BASEMAP_STYLE_URL);
  assert.equal(MORROVIA_DETAILED_BASEMAP_STYLE_URL, "https://tiles.openfreemap.org/styles/positron");
  const environment = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.doesNotMatch(environment, /NEXT_PUBLIC_CARTO_BASEMAP_KEY/);
});

test("the provider-independent fallback can never become a transparent detailed canvas", () => {
  const style = createMorroviaFallbackMapStyle();
  assert.equal(style.sources[MORROVIA_DETAILED_BASEMAP_SOURCE_ID], undefined);
  assert.ok(style.sources["morrovia-countries"]);
  const land = style.layers.find((layer) => layer.id === "morrovia-land");
  const borders = style.layers.find((layer) => layer.id === "morrovia-borders");
  assert.ok(land?.type === "fill");
  assert.equal(land.paint?.["fill-opacity"], 1);
  assert.ok(borders?.type === "line");
  assert.equal(borders.paint?.["line-opacity"], 0.92);
});

test("style.load and sourcedata prove the detailed source before marking it ready", () => {
  const map = new FakeBasemap();
  const states: MorroviaBasemapSnapshot[] = [];
  let styleReadyCount = 0;
  map.loadDetailed(false);
  const lifecycle = createMorroviaBasemapLifecycle(map, {
    timeoutMs: 0,
    onChange: (snapshot) => states.push(snapshot),
    onStyleReady: () => { styleReadyCount += 1; },
  });
  map.emit("style.load");
  assert.equal(lifecycle.getSnapshot().status, "loading");
  assert.equal(styleReadyCount, 1);
  map.detailedSourceLoaded = true;
  map.emit("sourcedata", { sourceId: MORROVIA_DETAILED_BASEMAP_SOURCE_ID });
  assert.equal(lifecycle.getSnapshot().status, "detailed");
  assert.equal(states.at(-1)?.detailedSourceLoaded, true);
  lifecycle.dispose();
});

test("manual zoom repeatedly crosses the detail threshold without style reloads", () => {
  const map = new FakeBasemap();
  const traces: Array<[string, number, number]> = [];
  map.loadDetailed(true);
  const lifecycle = createMorroviaBasemapLifecycle(map, {
    timeoutMs: 0,
    onTrace: (event, snapshot) => traces.push([event, snapshot.zoom, snapshot.visibleDetailedLayerCount]),
  });
  map.emit("style.load");
  for (const zoom of [5.2, 7.2, 12, 6.8, 14, 4.5, 9.5]) {
    map.zoom = zoom;
    map.emit("zoomend");
  }
  assert.equal(lifecycle.getSnapshot().status, "detailed");
  assert.equal(map.setStyleCalls.length, 0, "ordinary camera movement never replaces the style");
  assert.deepEqual(traces.filter(([event]) => event === "zoomend").map(([, zoom]) => zoom), [5.2, 7.2, 12, 6.8, 14, 4.5, 9.5]);
  lifecycle.dispose();
});

test("a missing detailed source or visible layer falls back once instead of leaving white", () => {
  const map = new FakeBasemap();
  map.zoom = 11;
  map.styleLoaded = true;
  const lifecycle = createMorroviaBasemapLifecycle(map, { timeoutMs: 0 });
  map.emit("style.load");
  assert.equal(lifecycle.getSnapshot().status, "fallback");
  assert.equal(map.setStyleCalls.length, 1);
  assert.equal(typeof map.setStyleCalls[0], "object");
  map.emit("zoomend");
  assert.equal(map.setStyleCalls.length, 1, "fallback is stable across later camera events");
  lifecycle.dispose();
});

test("a detailed source whose layers end at the city threshold cannot silently reveal a white canvas", () => {
  const map = new FakeBasemap();
  map.loadDetailed(true);
  map.layers = [{ id: "overview-only", source: MORROVIA_DETAILED_BASEMAP_SOURCE_ID, maxzoom: 7 }];
  const lifecycle = createMorroviaBasemapLifecycle(map, { timeoutMs: 0 });
  map.emit("style.load");
  assert.equal(lifecycle.getSnapshot().status, "detailed");
  map.zoom = 9;
  map.emit("zoomend");
  assert.equal(lifecycle.getSnapshot().status, "fallback");
  assert.equal(map.setStyleCalls.length, 1);
  lifecycle.dispose();
});

test("provider errors recover to local geography and an explicit retry restores detail", () => {
  const map = new FakeBasemap();
  const states: string[] = [];
  let styleReadyCount = 0;
  map.loadDetailed(false);
  const lifecycle = createMorroviaBasemapLifecycle(map, {
    timeoutMs: 0,
    onChange: ({ status }) => states.push(status),
    onStyleReady: () => { styleReadyCount += 1; },
  });
  assert.equal(lifecycle.handleError({ sourceId: MORROVIA_DETAILED_BASEMAP_SOURCE_ID, error: new Error("tile failed") }), true);
  assert.equal(lifecycle.getSnapshot().status, "fallback");
  map.emit("style.load");
  assert.equal(styleReadyCount, 1, "overlay owners are notified after fallback style load");

  lifecycle.retry();
  assert.equal(map.setStyleCalls.at(-1), MORROVIA_DETAILED_BASEMAP_STYLE_URL);
  map.loadDetailed(true);
  map.emit("style.load");
  assert.equal(lifecycle.getSnapshot().status, "detailed");
  assert.equal(styleReadyCount, 2, "overlay owners are notified after detailed style recovery");
  assert.ok(states.includes("fallback"));
  assert.equal(states.at(-1), "detailed");
  lifecycle.dispose();
});

test("route overlay errors cannot replace the basemap or selection lifecycle", () => {
  const map = new FakeBasemap();
  map.loadDetailed(true);
  const lifecycle = createMorroviaBasemapLifecycle(map, { timeoutMs: 0 });
  map.emit("style.load");
  assert.equal(lifecycle.handleError({ sourceId: "trip-route", error: new Error("route source failed") }), false);
  assert.equal(lifecycle.getSnapshot().status, "detailed");
  assert.equal(map.setStyleCalls.length, 0);
  assert.equal(isMorroviaDetailedBasemapError({ error: { url: "https://tiles.openfreemap.org/planet/9/1/1.pbf" } }), true);
  lifecycle.dispose();
});

test("the MapLibre owner rehydrates overlays after style recovery without touching camera inputs", () => {
  const source = readFileSync(new URL("../components/journey-planner-map.tsx", import.meta.url), "utf8");
  assert.match(source, /createMorroviaBasemapLifecycle/);
  assert.match(source, /map\.on\("error", handleMapError\)/);
  assert.match(source, /\[basemapStyleRevision,[\s\S]*routeFocusKey,[\s\S]*spatialLegs, stops\]\);/);
  assert.match(source, /Try detailed map again/);
  assert.match(source, /data-basemap-status=\{basemapStatus\}/);
  assert.doesNotMatch(source, /setStyle\([^)]*zoom/);
  const snapshot = inspectMorroviaBasemap(new FakeBasemap(), "loading");
  assert.equal(snapshot.zoom, 4);
});
