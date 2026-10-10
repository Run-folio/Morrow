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

test('a resolved direct island without usable route geography remains a reachable region decision',()=>{
 const brief=extractStructuredTripBrief('Santorini 3 nights');
 const target=brief.placeMentions!.find(m=>m.canonicalPlaceId==='santorini')!;
 assert.equal(discoveryEntryForBrief(brief,[],target.mentionId).kind,'region');
});
test('a resolved direct city without usable route geography remains a reachable clarification',()=>{
 const brief=extractStructuredTripBrief('Sydney then Melbourne');
 const target=brief.placeMentions!.find(m=>m.canonicalPlaceId==='sydney')!;
 assert.equal(discoveryEntryForBrief(brief,['melbourne'],target.mentionId).kind,'clarification');
});
test('a different actionable occurrence of the same island cannot suppress the targeted source decision',()=>{
 const brief=extractStructuredTripBrief('Santorini 3 nights');
 const target=brief.placeMentions!.find(m=>m.canonicalPlaceId==='santorini')!;
 assert.equal((discoveryEntryForBrief as any)(brief,['santorini'],target.mentionId,['different-source-occurrence']).kind,'region');
});

test('automatic entry also recovers resolved direct sources that have no actionable geography',()=>{
 assert.equal(discoveryEntryForBrief(extractStructuredTripBrief('Santorini 3 nights'),[]).kind,'region');
 assert.equal(discoveryEntryForBrief(extractStructuredTripBrief('Sydney then Melbourne'),['melbourne']).kind,'clarification');
});
