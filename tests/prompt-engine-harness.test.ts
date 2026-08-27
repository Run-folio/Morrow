import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PROMPT_ENGINE_CASES, PROMPT_ENGINE_DIMENSIONS } from "../benchmarks/prompt-engine/fixtures.ts";
import { comparablePromptEngineSnapshot, runPromptEngineHarness } from "../benchmarks/prompt-engine/harness.ts";

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
