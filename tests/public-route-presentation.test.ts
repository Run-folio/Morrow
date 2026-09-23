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
  for (const className of ["hero", "heroFacts", "whySection", "highlightsSection", "journeySection", "experiencesSection", "practicalSection", "sourcesSection", "finalCta"]) {
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

test("Storybook covers representative rich and factual routes at desktop and mobile review widths", () => {
  const story = read("app/journey/routes/[slug]/route-detail-view.stories.tsx");
  const css = read("app/journey/routes/[slug]/route-overview.module.css");
  for (const state of ["JapanReviewedDiscovery", "IndiaFactualFallback", "VietnamCambodiaReviewedDiscovery", "BalkansReviewedDiscovery", "PortugalFactualFallback", "JapanMobile390", "PortugalMobile430"]) {
    assert.match(story, new RegExp(`export const ${state}`), state);
  }
  assert.match(story, /JapanMobile390[\s\S]*morrovia390/);
  assert.match(story, /PortugalMobile430[\s\S]*morrovia430/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.highlightGrid\s*\{[^}]*grid-template-columns:1fr 1fr/);
  assert.match(css, /@media\(max-width:430px\)[\s\S]*\.journeyMap \.mapShell\s*\{[^}]*height:340px/);
  assert.match(css, /@media\(max-width:430px\)[\s\S]*\.journeyStopPhoto\s*\{[^}]*display:none/);
});

test("Route Detail follows the discovery hierarchy and absorbs the duplicated #317 controls", () => {
  const detail = read("app/journey/routes/[slug]/route-detail-view.tsx");
  const orderedIds = ["route-title", "route-why", "route-highlights", "route-journey", "route-experiences", "route-notes", "route-plan"];
  let cursor = -1;
  for (const id of orderedIds) {
    const next = detail.indexOf(`id="${id}"`);
    assert.ok(next > cursor, `${id} must follow the accepted discovery order`);
    cursor = next;
  }

  assert.match(detail, /routeDiscoveryPresentation\(detail\)/);
  assert.equal((detail.match(/<RoutePlanLink/g) ?? []).length, 2, "only hero and final conversion actions remain");
  assert.ok((detail.match(/>Plan this route<\/RoutePlanLink>/g) ?? []).length >= 2);
  assert.doesNotMatch(detail, /A starting point|routeNavigation|Shape the nights in Builder/);
  assert.doesNotMatch(detail, /RouteRelatedRoutes|relatedRouteDetails|related-routes-heading/);
  assert.doesNotMatch(detail, /photoQualification|pending editorial review|No additional route context is recorded yet/);
  assert.doesNotMatch(detail, />See [^<]+ on the map</);
});

test("journey rows and the map share one hash-compatible selection system", () => {
  const detail = read("app/journey/routes/[slug]/route-detail-view.tsx");
  const summary = read("app/journey/routes/[slug]/route-map-summary.tsx");
  const liveMap = read("app/journey/routes/[slug]/route-live-map.tsx");

  assert.equal((detail.match(/id="route-journey"/g) ?? []).length, 1);
  assert.doesNotMatch(detail, /id="route-(?:places|pacing)"/);
  assert.match(detail, /journeyStopHeading[\s\S]*href=\{`#route-map-stop-\$\{index\}`\}/);
  assert.match(detail, /journeyStopMeta[\s\S]*guide\.recommended[\s\S]*guide\.minimum/);
  assert.match(detail, /href=\{`#route-map-connection-\$\{index\}`\}/);
  assert.match(detail, /className=\{styles\.journeyConnection\}/);

  assert.equal((summary.match(/<EasyTSelect/g) ?? []).length, 1);
  assert.match(summary, /<option value="whole">Whole route<\/option>/);
  assert.doesNotMatch(summary, /<EasyTButton[^>]*>Whole route<\/EasyTButton>|icon=\{Route\}/);
  assert.match(summary, /routeMapSelectionFromHash\(location\.hash, stops\.length\)/);
  assert.match(detail, /id="route-map" tabIndex=\{-1\}/);
  assert.match(summary, /closest<HTMLElement>\("#route-map"\)/);
  assert.match(summary, /mapRegion\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(summary, /mapRegion\?\.scrollIntoView\(\{ block: "start", behavior: "instant" \}\)/);
  assert.doesNotMatch(summary, /closest<HTMLElement>\("section"\)/);
  assert.match(summary, /id=\{`route-map-stop-\$\{index\}`\}/);
  assert.match(liveMap, /marker\.type = "button"/);
  assert.match(liveMap, /setAttribute\("aria-pressed"/);
});

test("sparse why copy and practical cards use only canonical rendered content", () => {
  const detail = read("app/journey/routes/[slug]/route-detail-view.tsx");
  assert.match(detail, /showFallbackReasons/);
  assert.match(detail, /discovery\.story\.fallbackReasons\.map/);
  assert.match(detail, /const practicalCards[^=]*=/);
  assert.match(detail, /practicalCards\.map\(\(card, index\)/);
  assert.match(detail, /String\(index \+ 1\)\.padStart\(2, "0"\)/);
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
