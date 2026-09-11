import assert from "node:assert/strict";
import test from "node:test";
import { createMorroviaMapStyle } from "../components/easyt/morrovia-map-presentation.ts";

test("missing basemap credentials keep local geography visible at every zoom without remote requests", () => {
  const style = createMorroviaMapStyle();
  assert.equal(style.sources.carto, undefined);
  assert.ok(!style.layers.some(layer => layer.type === "raster"));
  const land = style.layers.find(layer => layer.id === "morrovia-land");
  assert.ok(land?.type === "fill");
  assert.equal(land.paint?.["fill-opacity"], 1);
});
test("configured basemap credentials retain the canonical progressive detailed map", () => {
  const style = createMorroviaMapStyle("test/key");
  const source = style.sources.carto;
  assert.ok(source.type === "raster");
  assert.ok(source.tiles?.[0].endsWith("?key=test%2Fkey"));
  assert.ok(style.layers.some(layer => layer.id === "carto-light"));
  const land = style.layers.find(layer => layer.id === "morrovia-land");
  assert.ok(land?.type === "fill");
  assert.ok(Array.isArray(land.paint?.["fill-opacity"]));
  assert.equal((land.paint?.["fill-opacity"] as unknown[]).at(-1), 0.12);
  const borders = style.layers.find(layer => layer.id === "morrovia-borders");
  assert.ok(borders?.type === "line");
  assert.equal((borders.paint?.["line-opacity"] as unknown[]).at(-1), 0.18);
});
