import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Route Check keeps canonical rows and markers while presenting a comparison overlay", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../app/journey/new/trip-builder-route-workspace.tsx", import.meta.url), "utf8");

  assert.match(workspace, /const presentedTrip = preview\?\.ok \? preview\.trip : canonicalTrip/,
    "only a live drag preview may change presented row and marker order");
  assert.match(workspace, /routeCheckProposalStopIds[\s\S]*comparisonLegs=/,
    "Route Check must use a separate map comparison instead of preview order");
  assert.match(workspace, /onCommitOrder\(routeCheckProposalStopIds, "route-check"\)/,
    "Apply must use the same canonical commit boundary as drag and menu movement");
  assert.match(workspace, /onDismissRouteCheck/);
  assert.match(builder, /commitStopOrder\(order, "route-check"\)/);
  assert.match(builder, /commitStopOrder\(nextStops\.map\(\(stop\) => stop\.id\), "route-check"\)/);
  assert.doesNotMatch(builder, /apply a materially cleaner route[\s\S]*applyRecommendedOrder\(\)/,
    "Build must never silently apply a Route Check recommendation");
});

test("the map comparison layer is dashed, noninteractive and does not create markers", () => {
  const map = readFileSync(new URL("../components/journey-planner-map.tsx", import.meta.url), "utf8");
  assert.match(map, /comparisonLegs\?: readonly MapRouteLeg\[\]/);
  assert.match(map, /id: "trip-route-comparison"/);
  assert.match(map, /"line-dasharray": \[2, 2\]/);
  assert.doesNotMatch(map, /comparisonMarkers/);
  assert.match(map, /comparisonLabel/);
});
