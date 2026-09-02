import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PROMPT_ENGINE_CASES, PROMPT_ENGINE_DIMENSIONS } from "../benchmarks/prompt-engine/fixtures.ts";
import { comparablePromptEngineSnapshot, runPromptEngineHarness } from "../benchmarks/prompt-engine/harness.ts";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";

test("prompt engine gauntlet has 16 complete, reviewable cases", () => {
  assert.equal(PROMPT_ENGINE_CASES.length, 16);
  assert.equal(new Set(PROMPT_ENGINE_CASES.map((scenario) => scenario.id)).size, 16);
  for (const scenario of PROMPT_ENGINE_CASES) {
    assert.ok(scenario.rawPrompt.trim());
    assert.ok(scenario.acceptableVariations.length >= 1);
    assert.ok(scenario.prohibitedOutcomes.length >= 2);
    assert.ok(scenario.reviewNotes.length >= 1);
  }
});

test("deterministic prompt capture and recorded plan boundary match the baseline", () => {
  const first = comparablePromptEngineSnapshot(runPromptEngineHarness());
  const second = comparablePromptEngineSnapshot(runPromptEngineHarness());
  assert.deepEqual(first, second);
  const path = fileURLToPath(new URL("../benchmarks/prompt-engine/baseline.json", import.meta.url));
  assert.deepEqual(first, JSON.parse(readFileSync(path, "utf8")));
  assert.equal(Object.keys(first.dimensions).length, PROMPT_ENGINE_DIMENSIONS.length);
});

test("Spanish aliases retain one origin and the ordered Japanese route intent", () => {
  const scenario = PROMPT_ENGINE_CASES.find((item) => item.id === "spanish-aliases-and-origin");
  assert.ok(scenario);
  const capture = captureJourneyBrief(scenario.rawPrompt);
  const brief = capture.structuredBrief;
  const aliases = Object.fromEntries((brief.placeMentions ?? []).map((mention) => [mention.sourceText, mention.canonicalPlaceId]));

  assert.deepEqual(aliases, {
    Londres: "london",
    Japón: "japan",
    Tokio: "tokyo",
    Kioto: "kyoto",
    Osaka: "osaka",
  });
  assert.equal(brief.placeMentions?.find((mention) => mention.canonicalPlaceId === "london")?.role, "origin");
  const startAt = brief.hardConstraints.find((constraint) => constraint.type === "start-at");
  assert.ok(startAt && "value" in startAt);
  assert.equal(startAt.value, "London");
  assert.deepEqual(brief.destinations
    .filter((destination) => destination.routability === "direct_destination" && destination.role !== "arrival-gateway")
    .map((destination) => destination.canonicalPlaceId), ["tokyo", "kyoto", "osaka"]);
  assert.equal(new Set(brief.placeMentions?.map((mention) => mention.canonicalPlaceId)).size, brief.placeMentions?.length);
  assert.equal(brief.placeIssues?.some((issue) => issue.code === "region_requires_base"), false);
  assert.equal(brief.placeIssues?.some((issue) => issue.code === "ambiguous_place"), false);
  assert.equal(brief.hardConstraints.some((constraint) => constraint.type === "no-driving"), true);
});
