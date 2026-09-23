import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../components/easyt/builder-clarification-dialog.tsx", import.meta.url), "utf8");
const stories = readFileSync(new URL("../components/easyt/builder-clarification-dialog.stories.tsx", import.meta.url), "utf8");

test("country discovery is a draft on StructuredTripBrief and commits through canonical Add stop", () => {
  assert.match(builder, /buildCountryDiscovery\(activeClarificationMention/);
  assert.match(builder, /countryDiscoveryChoices/);
  assert.match(builder, /updateCountryDiscoveryChoice/);
  assert.match(builder, /await addGuidedPlanningPlace\(activeClarificationMention, candidate\)/);
  assert.match(builder, /countryCode: countryCodeFor\(canonicalSuggestion\.country\)/);
});

test("recommendation-first clarification exposes selected cards and subordinate search", () => {
  assert.match(dialog, /aria-pressed=\{selected\}/);
  assert.match(dialog, /Search for somewhere specific/);
  assert.match(dialog, /See more places/);
  assert.match(dialog, /Continue with/);
});

test("responsive Storybook covers discovery at required widths", () => {
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    assert.match(stories, new RegExp(`morrovia${width}`));
  }
  assert.match(stories, /CountryDiscovery/);
});
