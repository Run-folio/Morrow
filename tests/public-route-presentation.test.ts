import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeRouteMapFailure } from "../lib/easyt/route-map-runtime.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("published Route Detail keeps its canonical production CSS owner connected", () => {
  const page = read("app/journey/routes/[slug]/page.tsx");
  const detail = read("app/journey/routes/[slug]/route-detail-view.tsx");
  const css = read("app/journey/routes/[slug]/route-overview.module.css");

  assert.match(page, /import styles from "\.\/route-overview\.module\.css"/);
  assert.match(page, /className=\{`\$\{styles\.page\} morrovia-editorial-page`\}/);
  assert.match(detail, /import styles from "\.\/route-overview\.module\.css"/);
  for (const className of ["hero", "heroFacts", "overviewSection", "glance", "sequenceSection", "itinerarySection", "attractionsSection", "notesSection", "finalCta"]) {
    assert.match(detail, new RegExp(`styles\\.${className}`), className);
    assert.match(css, new RegExp(`\\.${className}(?:[\\s,{:]|$)`), className);
  }
  assert.match(css, /@media\s*\(max-width:\s*1080px\)/);
  assert.match(css, /@media\s*\(max-width:\s*620px\)/);
});

test("the production Route story composes the real owner at every protected review width and fallback", () => {
  const story = read("app/journey/routes/[slug]/route-detail-view.stories.tsx");
  assert.match(story, /import styles from "\.\/route-overview\.module\.css"/);
  assert.match(story, /className=\{`\$\{styles\.page\} morrovia-editorial-page`\}/);
  for (const state of ["StandardAndean", "MapUnavailableFallback", "Mobile320", "Mobile390", "Tablet768", "Desktop1024", "Desktop1440", "Desktop1680"]) {
    assert.match(story, new RegExp(`export const ${state}`), state);
  }
});

test("browser and MapLibre error events normalize to bounded Error values", () => {
  const browserEvent = new Event("error");
  const nested = normalizeRouteMapFailure({ type: "error", error: browserEvent });
  assert.equal(nested.category, "provider-resource");
  assert.equal(nested.eventType, "error");
  assert.ok(nested.error instanceof Error);
  assert.equal(nested.error.message, "The route map provider reported a resource event (error).");

  const runtime = normalizeRouteMapFailure(new TypeError("Invalid route layer"));
  assert.equal(runtime.category, "runtime");
  assert.equal(runtime.error.message, "Invalid route layer");
});

test("Route map uses the bundled worker and handles provider errors at its boundary", () => {
  const source = read("app/journey/routes/[slug]/route-live-map.tsx");
  assert.match(source, /setWorkerUrl\("\/maplibre\/maplibre-gl-worker\.mjs"\)/);
  assert.match(source, /map\.on\("error", reportFailure/);
  assert.match(source, /map\?\.off\("error", reportFailure/);
  assert.match(source, /initialise\(\)\.catch\(reportFailure\)/);
  assert.doesNotMatch(source, /throw\s+(?:event|error)/);
});
