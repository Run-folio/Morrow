import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { GLOBAL_ROUTING_FIXTURES } from "../benchmarks/global-routing/fixtures.ts";
import {
  comparableGlobalRoutingSnapshot,
  runGlobalRoutingBenchmark,
  type ComparableGlobalRoutingSnapshot,
} from "../benchmarks/global-routing/harness.ts";

const requiredRegions = [
  "central-america", "south-america", "north-america", "western-europe",
  "balkans", "scandinavia", "uk-ireland", "north-africa", "southern-africa",
  "east-africa", "middle-east", "central-asia", "india-nepal", "southeast-asia",
  "china", "japan", "korea", "indonesia", "australia-new-zealand", "pacific",
];

const normalized = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

test("the benchmark contains 51 distinct full-trip fixtures across every required region", () => {
  assert.equal(GLOBAL_ROUTING_FIXTURES.length, 51);
  assert.equal(new Set(GLOBAL_ROUTING_FIXTURES.map((fixture) => fixture.id)).size, 51);
  assert.deepEqual([...new Set(GLOBAL_ROUTING_FIXTURES.map((fixture) => fixture.region))].sort(), [...requiredRegions].sort());
  assert.equal(GLOBAL_ROUTING_FIXTURES.filter((fixture) => fixture.p0).length, 1);
  assert.ok(GLOBAL_ROUTING_FIXTURES.filter((fixture) => fixture.crossSurface).length >= 8);
  assert.ok(GLOBAL_ROUTING_FIXTURES.some((fixture) => fixture.origin === null));
  assert.ok(GLOBAL_ROUTING_FIXTURES.some((fixture) => fixture.originAlsoOvernight));
  assert.ok(GLOBAL_ROUTING_FIXTURES.some((fixture) => fixture.routeOrder.length && fixture.origin
    && normalized(fixture.destinations.find((place) => place.key === fixture.routeOrder.at(-1))?.canonicalName ?? "") === normalized(fixture.origin.canonicalName)));
});

test("every fixture carries source-grounded expectations and explicit failure boundaries", () => {
  for (const fixture of GLOBAL_ROUTING_FIXTURES) {
    const prompt = normalized(fixture.prompt);
    assert.ok(fixture.prompt.trim(), `${fixture.id} needs a prompt`);
    assert.ok(fixture.destinations.length, `${fixture.id} needs destination intent`);
    assert.ok(fixture.allowedUncertainty.length, `${fixture.id} needs allowed uncertainty`);
    assert.ok(fixture.forbiddenOutcomes.length >= 3, `${fixture.id} needs forbidden outcomes`);
    for (const place of [...(fixture.origin ? [fixture.origin] : []), ...fixture.destinations]) {
      assert.ok(prompt.includes(normalized(place.sourceText)), `${fixture.id}/${place.sourceText} must be grounded in the prompt`);
      assert.ok(place.key && place.canonicalName && place.placeType && place.routability, `${fixture.id}/${place.sourceText} needs entity and taxonomy expectations`);
    }
    fixture.routeOrder.forEach((key) => assert.ok(fixture.destinations.some((place) => place.key === key), `${fixture.id}/${key} is not a destination`));
    fixture.expectedAmbiguities.forEach((key) => assert.equal(fixture.destinations.find((place) => place.key === key)?.semanticRole === "ambiguous"
      || fixture.destinations.find((place) => place.key === key)?.semanticRole === "planning-area", true, `${fixture.id}/${key} needs an ambiguity expectation`));
    fixture.anchorBaseRelationships.forEach(({ anchorKey, baseKey }) => {
      assert.ok(fixture.destinations.some((place) => place.key === anchorKey), `${fixture.id}/${anchorKey} anchor is missing`);
      if (baseKey) assert.ok(fixture.routeOrder.includes(baseKey), `${fixture.id}/${baseKey} selected base is not operational`);
    });
  }
});

test("deterministic mode is network-free, repeatable and contains no hard failure", async () => {
  const first = await runGlobalRoutingBenchmark();
  const second = await runGlobalRoutingBenchmark();
  assert.deepEqual(comparableGlobalRoutingSnapshot(first), comparableGlobalRoutingSnapshot(second));
  assert.equal(first.mode, "deterministic");
  assert.equal(first.fixtureCount, 51);
  assert.equal(first.outcomes["HARD FAILURE"], 0);
  assert.deepEqual(first.p0RegressionFailures, []);
  assert.ok(first.outcomes["PASS WITH EXPECTED UNCERTAINTY"] > 0);
  assert.ok(first.unknownTransferCount > 0);
  assert.ok(first.unresolvedPlaceCount > 0);
});

test("the Central America P0 invariant retains 8/8 intent and canonical origin participation", async () => {
  const summary = await runGlobalRoutingBenchmark({ fixtures: GLOBAL_ROUTING_FIXTURES.filter((fixture) => fixture.p0) });
  const result = summary.results[0]!;
  assert.equal(result.outcome, "PASS WITH EXPECTED UNCERTAINTY");
  assert.equal(result.output.mentionCoverage.expectedPlaceMentions, 8);
  assert.equal(result.output.mentionCoverage.complete, true);
  assert.deepEqual(result.output.mentionCoverage.missingFromResolution, []);
  assert.deepEqual(result.output.mentionCoverage.missingFromStructuredBrief, []);
  assert.deepEqual(result.output.routeEndpoints, ["London", "Cancún", "Tulum", "Mexico City", "Antigua Guatemala"]);
  assert.equal(result.output.routeEndpoints.includes("Guatemala City"), false);
  assert.equal(result.output.crossSurfaceConsistent, true);
  assert.deepEqual(result.diagnostics, []);
});

test("selected production surfaces keep consuming canonical trip legs", () => {
  const source = (relative: string) => readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
  assert.match(source("app/journey/new/trip-builder.tsx"), /buildCanonicalTripLegs/);
  assert.match(source("components/easyt/trip-overview-workspace.tsx"), /trip\.legs/);
  assert.match(source("components/easyt/trip-itinerary-workspace.tsx"), /routeEndpointForLeg\(trip, leg/);
  const map = source("components/journey-map-planner-workspace.tsx");
  assert.match(map, /mapRouteLegsFromTrip\(customTrip\)/);
  assert.match(map, /Shape the day/);
  assert.match(source("lib/easyt/trip-copilot.server.ts"), /buildTripCopilotProjection\(options\.trip/);
});

test("the reviewed deterministic baseline remains unchanged", async () => {
  const path = fileURLToPath(new URL("../benchmarks/global-routing/baseline.json", import.meta.url));
  const baseline = JSON.parse(readFileSync(path, "utf8")) as ComparableGlobalRoutingSnapshot;
  assert.deepEqual(comparableGlobalRoutingSnapshot(await runGlobalRoutingBenchmark()), baseline);
});
