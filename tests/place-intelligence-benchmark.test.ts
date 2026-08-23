import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  comparablePlaceSnapshot,
  runPlaceIntelligenceBenchmarks,
  type ComparablePlaceSnapshot,
} from "../benchmarks/place-intelligence/harness.ts";
import { PLACE_INTELLIGENCE_FIXTURES } from "../benchmarks/place-intelligence/fixtures.ts";
import { resolvePlaceMentions } from "../lib/easyt/place-intelligence.ts";
import { extractStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";

const expectedCohorts = {
  "exact-place-regression": 8,
  "regions-and-planning-areas": 10,
  "islands-and-archipelagos": 6,
  "aliases-and-multilingual-names": 6,
  "nested-and-overlapping-geography": 6,
  "ambiguity-and-context": 6,
  "roles-and-negation": 6,
  "partial-unknowns": 5,
};

test("the deterministic benchmark contains 53 distinct prompts across all required cohorts", () => {
  assert.equal(PLACE_INTELLIGENCE_FIXTURES.length, 53);
  assert.equal(new Set(PLACE_INTELLIGENCE_FIXTURES.map((fixture) => fixture.id)).size, 53);
  assert.deepEqual(
    Object.fromEntries(Object.keys(expectedCohorts).map((cohort) => [cohort, PLACE_INTELLIGENCE_FIXTURES.filter((fixture) => fixture.cohort === cohort).length])),
    expectedCohorts,
  );
});

test("every fixture records complete machine and qualitative expectations", () => {
  for (const fixture of PLACE_INTELLIGENCE_FIXTURES) {
    assert.ok(fixture.prompt.trim().length > 0, `${fixture.id} needs a prompt`);
    assert.ok(fixture.expectedMentions.length > 0, `${fixture.id} needs expected place mentions`);
    assert.ok(fixture.unacceptableFailures.length >= 2, `${fixture.id} needs unacceptable failures`);
    assert.ok(fixture.acceptableVariations.length >= 2, `${fixture.id} needs acceptable variations`);
    assert.ok(fixture.qualitativeReview.trim().length > 0, `${fixture.id} needs a qualitative review question`);
    fixture.expectedMentions.forEach((mention) => {
      assert.ok(mention.sourceText.trim().length > 0, `${fixture.id} has an empty source phrase`);
      assert.ok(mention.placeTypes.length > 0, `${fixture.id}/${mention.sourceText} needs a place type`);
      assert.ok(mention.statuses.length > 0, `${fixture.id}/${mention.sourceText} needs a resolution state`);
      assert.ok(mention.routabilities.length > 0, `${fixture.id}/${mention.sourceText} needs routability`);
      assert.ok(mention.roles.length > 0, `${fixture.id}/${mention.sourceText} needs a role`);
      if (mention.statuses.includes("resolved")) assert.ok(mention.canonicalPlaceId, `${fixture.id}/${mention.sourceText} needs a stable canonical identity`);
    });
  }
});

test("the required Patagonia, Tierra del Fuego and Easter Island prompt preserves semantics", () => {
  const prompt = "3 weeks through Patagonia, Tierra del Fuego and Easter Island. We like nature, prefer a relaxed pace and do not want to drive.";
  const resolution = resolvePlaceMentions(prompt);
  const byId = new Map(resolution.mentions.map((mention) => [mention.canonicalPlaceId, mention]));

  assert.equal(byId.get("patagonia")?.placeType, "region");
  assert.equal(byId.get("patagonia")?.routability, "needs_base_selection");
  assert.deepEqual([...(byId.get("patagonia")?.parentCountries ?? [])].sort(), ["Argentina", "Chile"]);
  assert.equal(byId.get("tierra-del-fuego")?.placeType, "sub_region");
  assert.equal(byId.get("tierra-del-fuego")?.routability, "needs_base_selection");
  assert.equal(byId.get("rapa-nui")?.placeType, "island");
  assert.equal(byId.get("rapa-nui")?.routability, "needs_base_selection");
  assert.deepEqual(resolution.mentions.map((mention) => mention.sourceText), ["Patagonia", "Tierra del Fuego", "Easter Island"]);
  assert.equal(resolution.issues.some((issue) => issue.code === "region_requires_base"), true);

  const brief = extractStructuredTripBrief(prompt) as ReturnType<typeof extractStructuredTripBrief> & { placeMentions?: typeof resolution.mentions };
  assert.deepEqual(brief.placeMentions?.map((mention) => mention.canonicalPlaceId), ["patagonia", "tierra-del-fuego", "rapa-nui"]);
  assert.equal(brief.pace?.value, "relaxed");
  assert.equal(brief.interests.some((interest) => interest.value === "nature"), true);
  assert.equal(brief.hardConstraints.some((constraint) => constraint.type === "no-driving"), true);
  assert.equal(brief.destinations.some((destination) => ["El Calafate", "Puerto Natales", "Ushuaia"].includes(destination.name)), false);
});

test("the complete benchmark is deterministic", () => {
  const first = comparablePlaceSnapshot(runPlaceIntelligenceBenchmarks());
  const second = comparablePlaceSnapshot(runPlaceIntelligenceBenchmarks());
  assert.deepEqual(first, second);
});

test("exact-place regressions and the central acceptance prompt contain no machine failures", () => {
  const summary = runPlaceIntelligenceBenchmarks();
  const protectedIds = new Set(PLACE_INTELLIGENCE_FIXTURES
    .filter((fixture) => fixture.cohort === "exact-place-regression" || fixture.id === "required-central-southern-regions-and-rapa-nui")
    .map((fixture) => fixture.id));
  const failures = summary.results
    .filter((result) => protectedIds.has(result.id))
    .flatMap((result) => result.findings.filter((finding) => finding.status === "fail").map((finding) => `${result.id}:${finding.id}`));
  assert.deepEqual(failures, []);
});

test("the accepted deterministic baseline remains unchanged", () => {
  const path = fileURLToPath(new URL("../benchmarks/place-intelligence/accepted-baseline.json", import.meta.url));
  const baseline = JSON.parse(readFileSync(path, "utf8")) as ComparablePlaceSnapshot;
  assert.deepEqual(comparablePlaceSnapshot(runPlaceIntelligenceBenchmarks()), baseline);
});
