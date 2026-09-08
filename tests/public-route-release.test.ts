import assert from "node:assert/strict";
import test from "node:test";

import { inspirationByKey } from "../lib/easyt/inspiration.ts";
import { checkPublicRouteRelease, assertPublicRouteReleaseReady } from "../lib/easyt/public-route-release.ts";
import { routeImages } from "../lib/easyt/route-images.ts";
import { routeFamilyByKey, type RouteFamily } from "../lib/easyt/route-catalog.ts";

function reviewedJapan(): RouteFamily {
  const route = structuredClone(routeFamilyByKey["japan-slow"]!);
  route.stops.forEach((stop) => { stop.recommendedNights = stop.minimumNights + 1; });
  route.connections.forEach((connection) => { connection.sourceLabels = [route.sourceLinks[0]!.label]; connection.confidence = "medium"; });
  route.release = {
    routeOrderRationale: "A city opening, mountain pause, then cultural finish keeps the long rail days separate.",
    editorialOwner: "editorial@example.test",
    editorialReviewer: "review@example.test",
    explicitUnknowns: [],
    image: { asset: routeImages[route.key]!, rights: "owned" },
  };
  return route;
}

test("the supported beta route audit records real missing release metadata without changing route data", () => {
  for (const key of ["andean-highlands", "portugal-atlantic"] as const) {
    const report = checkPublicRouteRelease(routeFamilyByKey[key]!);
    assert.equal(report.status, "incomplete");
    for (const code of ["recommended-nights", "route-order-rationale", "explicit-unknowns", "editorial-owner", "editorial-reviewer", "image-rights"] as const) {
      assert.equal(report.blockers.some((issue) => issue.code === code), true, `${key} should expose missing ${code}`);
    }
  }
});

test("a fully reviewed route passes only with evidence-backed connection assumptions", () => {
  const route = reviewedJapan();
  const report = assertPublicRouteReleaseReady(route);
  assert.equal(report.status, "ready");
  assert.equal(report.reviewedAssumptions.length, 4);
  assert.equal(report.blockers.length, 0);
  assert.equal(inspirationByKey[route.key]?.stops.length, route.stops.length);
});

test("an explicit connection unknown is visible as verification work rather than a fabricated reviewed fact", () => {
  const route = reviewedJapan();
  route.connections = [];
  route.release!.explicitUnknowns = route.stops.slice(1).map((stop, index) => ({
    kind: "connection", reference: `${route.stops[index]!.name} → ${stop.name}`, reason: "Current transfer evidence is not yet attached.",
  }));
  const report = assertPublicRouteReleaseReady(route);
  assert.equal(report.status, "ready-with-verification");
  assert.equal(report.needsVerification.length, 4);
  assert.equal(report.reviewedAssumptions.length, 0);
});

test("missing connection evidence cannot be upgraded to a reviewed practical claim", () => {
  const route = reviewedJapan();
  route.connections[0]!.sourceLabels = [];
  const report = checkPublicRouteRelease(route);
  assert.equal(report.status, "incomplete");
  assert.equal(report.blockers.some((issue) => issue.code === "connection-evidence"), true);
  assert.throws(() => assertPublicRouteReleaseReady(route), /connection-evidence/);
});

test("the owner cannot self-certify the required independent review", () => {
  const route = reviewedJapan();
  route.release!.editorialReviewer = `  ${route.release!.editorialOwner!.toUpperCase()}  `;
  assert.ok(checkPublicRouteRelease(route).blockers.some(issue => issue.code === "editorial-reviewer"));
});
