import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../components/easyt/builder-clarification-dialog.tsx", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../lib/easyt/i18n.ts", import.meta.url), "utf8");
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
  assert.match(dialog, /discoveryText\.searchSpecific/);
  assert.match(dialog, /discoveryText\.seeMore/);
  assert.match(dialog, /countryDiscoveryContinueLabel/);
  assert.match(i18n, /Search for somewhere specific/);
  assert.match(i18n, /See more places/);
  assert.match(i18n, /Continue with/);
});

test("responsive Storybook covers discovery at required widths", () => {
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    assert.match(stories, new RegExp(`morrovia${width}`));
  }
  assert.match(stories, /CountryDiscovery/);
});

test("natural-area clarification keeps reviewed canonical nearby bases alongside provider results", () => {
  assert.match(builder, /regionalBaseSuggestions\(activeClarificationMention\)/);
  assert.match(builder, /canonicalPlaceSuggestionSuitableAsNearbyBase\(activeNearbyBaseAnchor/);
  assert.match(builder, /\[\.\.\.clarificationModelSuggestions, \.\.\.\(activeNearbyDiscovery\?\.suggestions \?\? \[\]\)\]/);
});

test("canonical Discovery review preserves a fixed non-Australian route anchor while previewing new bases", async () => {
  const { fixture } = await import('./helpers/discovery-fixture.ts');
  const { buildDiscoveryReview } = await import('../lib/easyt/discovery-review.ts');
  const input = fixture('Australia', ['sydney', 'melbourne']);
  const before = JSON.stringify(input.trip);
  const review = buildDiscoveryReview({ ...input, constraints: { fixedEndStopId: 'fixed-london', requiredStopIds: ['fixed-london'] } });
  assert.ok(review.candidates.candidates.length > 0);
  assert.ok(review.candidates.candidates.every(candidate => candidate.stops.at(-1)?.id === 'fixed-london'));
  assert.equal(JSON.stringify(input.trip), before);
  assert.equal(review.primaryAction.baseCount, 1);
  assert.equal(review.primaryAction.visitCount, 0);
});

test("Discovery retains its open review on a save failure while yielding to actual competing dialogs", async () => {
  const { shouldYieldBuilderClarification } = await import('../lib/easyt/builder-clarification.ts');
  assert.equal(shouldYieldBuilderClarification({ discoveryDraftOpen: true, saveBlocked: true, competingModal: false }), false);
  assert.equal(shouldYieldBuilderClarification({ discoveryDraftOpen: true, saveBlocked: true, competingModal: true }), true);
  assert.equal(shouldYieldBuilderClarification({ discoveryDraftOpen: false, saveBlocked: true, competingModal: false }), true);
});
