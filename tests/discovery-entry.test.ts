import assert from "node:assert/strict";
import test from "node:test";
import { extractStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import { discoveryEntryForBrief } from "../lib/easyt/discovery-entry.ts";

for (const [prompt, kind, step] of [
  ["Australia", "country", "directions"],
  ["Tajikistan", "country", "places"],
  ["Africa", "continent", "directions"],
  ["Taj Mahal", "landmark", "bases"],
  ["Lake Atitlán", "natural-area", "bases"],
  ["Kruger National Park", "natural-area", "bases"],
] as const) {
  test(`${prompt} enters ${kind} at ${step}`, () => {
    const entry = discoveryEntryForBrief(extractStructuredTripBrief(prompt), []);
    assert.equal(entry.kind, kind);
    assert.equal(entry.step, step);
  });
}

test("a precise actionable route skips Discovery", () => {
  assert.equal(discoveryEntryForBrief(extractStructuredTripBrief("Sydney then Melbourne, 10 days"), ["sydney", "melbourne"]).kind, "skip");
});

test("an already actionable targeted mention skips within a mixed brief", () => {
  const brief = extractStructuredTripBrief("Australia and Sydney");
  const sydney = brief.placeMentions?.find(mention => mention.canonicalPlaceId === "sydney");
  assert.ok(sydney);
  assert.equal(discoveryEntryForBrief(brief, ["sydney"], sydney.mentionId).kind, "skip");
});

test("a supported sparse country remains a country entry", () => {
  assert.equal(discoveryEntryForBrief(extractStructuredTripBrief("Eritrea"), []).kind, "country");
});

test("an unsupported draft version uses exceptional recovery", () => {
  const brief = extractStructuredTripBrief("Australia");
  const mentionId = brief.placeMentions![0].mentionId;
  brief.discoveryDraftByMentionId = { [mentionId]: { version: 2 } as never };
  assert.equal(discoveryEntryForBrief(brief, []).kind, "legacy-recovery");
});
