import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import generatedInventory from "../public/journey/immersive/published-route-stop-image-inventory.generated.json" with { type: "json" };
import editorialDecisions from "../artifacts/published-route-image-review/editorial-decisions.json" with { type: "json" };
import report from "../artifacts/published-route-image-review/report.json" with { type: "json" };
import { publicRoutePublishedFamilies } from "../lib/easyt/public-route.ts";
import { publishedRouteStopKey, reviewedPhotoMatchesStop } from "../lib/easyt/published-route-image-pipeline.ts";
import { routeStopPhoto } from "../lib/easyt/route-stop-photography.ts";

test("the generated inventory retains provider provenance, confidence and responsive hotlinks", () => {
  assert.equal(new Set(generatedInventory.map((photo) => publishedRouteStopKey(photo.place, photo.country))).size, generatedInventory.length);
  for (const photo of generatedInventory) {
    assert.ok(photo.provider === "unsplash" || photo.provider === "wikimedia");
    assert.match(photo.licenseUrl, /^https?:\/\//);
    assert.match(photo.sourceUrl, /^https?:\/\//);
    if (photo.provider === "unsplash") {
      assert.match(photo.authorUrl!, /^https:\/\/unsplash\.com\/@/);
      const downloadLocation = "providerDownloadLocation" in photo ? photo.providerDownloadLocation : null;
      assert.equal(typeof downloadLocation, "string");
      assert.match(downloadLocation as string, /^https:\/\/api\.unsplash\.com\/photos\/[^/]+\/download/);
    }
    if (photo.reviewStatus === "automatically accepted") assert.ok(photo.confidenceScore >= 80);
    else assert.equal(photo.reviewStatus, "editorially accepted");
    assert.equal(photo.pipelineVersion, 2);
    assert.ok(photo.confidenceEvidence.length);
    assert.deepEqual(photo.variants.map((variant) => variant.width), photo.provider === "wikimedia" ? [500, 960, 1920] : [384, 768, 1536]);
    assert.ok(photo.variants.every((variant) => /^https:\/\/(?:images\.unsplash\.com|(?:upload|thumb)\.wikimedia\.org)\//.test(variant.src)));
    if (photo.provider === "wikimedia") {
      assert.ok(photo.variants.every((variant) => !/\/(?:384|768|1536)px-/.test(variant.src)), photo.place);
    }
  }
});

test("completed editorial decisions promote the exact reviewed provider assets", () => {
  for (const decision of editorialDecisions) {
    if (decision.decision === "rejected") {
      assert.ok(!generatedInventory.some((photo) => photo.providerAssetId === decision.providerAssetId));
      continue;
    }
    const photo = generatedInventory.find((candidate) => `${candidate.place}, ${candidate.country}` === decision.destination);
    if (!photo) continue;
    assert.equal(photo.providerAssetId, decision.providerAssetId, decision.destination);
    assert.equal(photo.reviewStatus, "editorially accepted", decision.destination);
  }
});

test("all published routes resolve only exact destinations or explicitly attached landmarks", () => {
  const routes = publicRoutePublishedFamilies();
  assert.equal(routes.length, 25);
  for (const route of routes) {
    const used = new Map<string, string>();
    for (const stop of route.stops) {
      const photo = routeStopPhoto(route, stop);
      if (!photo) continue;
      const landmarks = route.visitIntents?.filter((visit) => visit.base === stop.name).map((visit) => visit.name) ?? [];
      assert.equal(reviewedPhotoMatchesStop({ name: stop.name, country: stop.country, attachedLandmarks: landmarks }, photo), true, `${route.key}: ${stop.name} -> ${photo.place}`);
      const previous = used.get(photo.sourceUrl);
      assert.ok(!previous || previous === publishedRouteStopKey(stop.name, stop.country), `${route.key}: duplicate source for ${previous} and ${stop.name}`);
      used.set(photo.sourceUrl, publishedRouteStopKey(stop.name, stop.country));
    }
  }
});

test("the bulk report audits every route and records the explicit substitution guards", () => {
  assert.equal(report.summary.publishedRoutes, 25);
  assert.equal(report.summary.uniquePublishedDestinations, 90);
  for (const [destination, rejected] of [
    ["Split, Croatia", "Dubrovnik"],
    ["Lima, Peru", "Cusco"],
    ["Puno, Peru", "Cusco"],
    ["La Paz, Bolivia", "Uyuni"],
    ["Windhoek, Namibia", "Sossusvlei"],
    ["Busan, South Korea", "Kyoto"],
  ]) {
    const serialized = JSON.stringify(report);
    if (serialized.includes(rejected)) assert.ok(!generatedInventory.some((photo) => `${photo.place}, ${photo.country}` === destination && photo.alt.includes(rejected)), `${destination} must not use ${rejected}`);
  }
  assert.ok(report.summary.existingReviewedCoverage + report.summary.automaticallyFilled + report.summary.manualReviewRequired + report.summary.unresolved === 90);
  assert.ok(report.incorrectSubstitutionsPrevented.some((item) => item.destination === "Split, Croatia" && item.rejectedSubject === "Dubrovnik, Croatia"));
  const script = readFileSync(new URL("../scripts/published-route-images.ts", import.meta.url), "utf8");
  assert.match(script, /`\$\{stop\.name\} \$\{stop\.country\}`/);
  assert.doesNotMatch(script, /route\.title.*query|imageQuery/);
});

test("review and unresolved output is actionable rather than a generic failure bucket", () => {
  for (const review of report.reviewRequired) {
    const candidates = [review.selectedCandidate, ...review.alternatives].filter(Boolean).slice(0, 3);
    assert.ok(candidates.length, review.destination);
    for (const candidate of candidates) {
      assert.ok(candidate!.previewUrl && candidate!.sourceUrl, review.destination);
      assert.ok(candidate!.author && candidate!.license && candidate!.licenseUrl, review.destination);
      assert.ok(Array.isArray(candidate!.evidence) && Array.isArray(candidate!.concerns), review.destination);
    }
  }
  const unresolvedItems = report.unresolved as Array<{ destination: string; category: string; providerAttempts?: { wikimedia?: unknown; unsplash?: unknown } }>;
  for (const unresolved of unresolvedItems) {
    assert.ok(unresolved.category, unresolved.destination);
    assert.ok(unresolved.providerAttempts?.wikimedia, unresolved.destination);
    assert.ok(unresolved.providerAttempts?.unsplash, unresolved.destination);
  }
  const failureCategories = report.unresolvedFailureCategories as Array<{ category: string; count: number }>;
  assert.equal(failureCategories.reduce((total, group) => total + group.count, 0), report.summary.unresolved);
});

test("editorial review remains a local file workflow with no production persistence", () => {
  const pipeline = readFileSync(new URL("../scripts/published-route-images.ts", import.meta.url), "utf8");
  const board = readFileSync(new URL("../scripts/render-published-route-image-review.ts", import.meta.url), "utf8");
  assert.match(pipeline, /editorial-decisions\.json/);
  assert.match(pipeline, /reviewedUnsplashAsset\(decision\.providerAssetId\)/);
  assert.match(pipeline, /const reviewedResult = apply && decision\?\.providerAssetId/);
  assert.match(pipeline, /"editorially accepted"/);
  assert.match(board, /Accept/);
  assert.match(board, /Reject all/);
  assert.match(board, /Prefer alternative/);
  assert.match(board, /Download editorial-decisions\.json/);
  assert.doesNotMatch(`${pipeline}\n${board}`, /repository|DATABASE_URL|\/api\/easyt/);
});
