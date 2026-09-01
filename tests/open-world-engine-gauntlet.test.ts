import assert from "node:assert/strict";
import test from "node:test";
import { runOpenWorldEngineGauntlet } from "../benchmarks/open-world-engine-gauntlet/harness.ts";

test("open-world gauntlet preserves correct resolution and truthful uncertainty through Homepage to Builder", async () => {
  const summary = await runOpenWorldEngineGauntlet();

  assert.equal(summary.totalPrompts, 17);
  assert.equal(summary.totalPlaceMentions, 51);
  assert.equal(summary.automaticallyResolved, 41);
  assert.equal(summary.correctlyUnresolved, 10);
  assert.equal(summary.incorrectlyUnresolved, 0);
  assert.equal(summary.incorrectlyResolved, 0);
  assert.equal(summary.duplicateIdentitiesCollapsed, 2);
  assert.equal(summary.duplicateIdentityFailures, 0);
  assert.equal(summary.captureSchemaLosses, 0);
  assert.deepEqual(summary.failuresByRootCause, {});
  assert.equal(summary.results.every((result) => result.correct), true);
});

test("provider ambiguity is reranked only after trusted route context exists", async () => {
  const summary = await runOpenWorldEngineGauntlet();
  const belize = summary.results.find((result) => result.id === "route-context-belize-san-pedro");
  const centralAmerica = summary.results.find((result) => result.id === "central-america-two-contextual-names");

  assert.equal(belize?.mentions.find((mention) => mention.sourceText === "San Pedro")?.selected?.country, "Belize");
  assert.equal(centralAmerica?.mentions.find((mention) => mention.sourceText === "Granada")?.selected?.country, "Nicaragua");
  assert.equal(centralAmerica?.mentions.find((mention) => mention.sourceText === "León")?.selected?.country, "Nicaragua");
  assert.equal(belize?.mentions.every((mention) => mention.builderState === "resolved-stop"), true);
  assert.equal(centralAmerica?.mentions.every((mention) => mention.builderState === "resolved-stop"), true);
});

test("stable OSM identity collapses provider-specific display labels", async () => {
  const summary = await runOpenWorldEngineGauntlet();
  const fixture = summary.results.find((result) => result.id === "obscure-japan-provider-label-variants");
  const kiso = fixture?.mentions.find((mention) => mention.sourceText === "Kiso Fukushima");

  assert.equal(fixture?.duplicateChecks[0]?.actualCount, 1);
  assert.equal(kiso?.selected?.name, "Kiso-Fukushima");
  assert.equal(kiso?.confirmationRequired, false);
});

test("genuinely distinct namesakes and broad intent continue to fail closed", async () => {
  const summary = await runOpenWorldEngineGauntlet();
  for (const id of ["springfield-control", "cambridge-control", "city-region-collision"]) {
    const mention = summary.results.find((result) => result.id === id)?.mentions[0];
    assert.equal(mention?.builderState, "review", id);
    assert.equal(mention?.confirmationRequired, true, id);
    assert.equal(mention?.selected, null, id);
  }
  const broad = summary.results.find((result) => result.id === "generic-regional-intent")
    ?.mentions.find((mention) => mention.sourceText === "wine country");
  assert.equal(broad?.builderState, "review");
  assert.equal(broad?.confirmationRequired, true);
});

test("known South America baseline remains six resolved and zero to confirm", async () => {
  const summary = await runOpenWorldEngineGauntlet();
  const fixture = summary.results.find((result) => result.id === "south-america-known-regression");

  assert.equal(fixture?.mentions.length, 6);
  assert.equal(fixture?.mentions.every((mention) => mention.builderState === "resolved-stop"), true);
  assert.equal(fixture?.mentions.some((mention) => mention.confirmationRequired), false);
  assert.deepEqual(fixture?.mentions.map((mention) => mention.selected?.name), ["Cusco", "Uyuni", "La Paz", "Lima", "Huacachina", "Salta"]);
});

