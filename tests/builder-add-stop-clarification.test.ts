import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PLACE_INTELLIGENCE_PARSER_VERSION,
  PLACE_INTELLIGENCE_VERSION,
  appendSelectedPlanningAreaMention,
  placeCandidateWithinPlanningParent,
  placeSuggestionRequiresBaseSelection,
  type CanonicalPlaceSuggestion,
  type PlaceIntelligenceResult,
  type PlanningParentConstraint,
} from "../lib/easyt/place-intelligence.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const builder = read("app/journey/new/trip-builder.tsx");
const styles = read("app/journey/new/trip-builder.module.css");
const geocode = read("app/api/journey-geocode/route.ts");
const autocomplete = read("components/easyt/canonical-place-autocomplete.tsx");
const dialog = read("components/easyt/builder-clarification-dialog.tsx");

const emptyResult = (): PlaceIntelligenceResult => ({
  version: PLACE_INTELLIGENCE_VERSION,
  parserVersion: PLACE_INTELLIGENCE_PARSER_VERSION,
  sequenceKind: "unordered",
  mentions: [],
  issues: [],
});
const suggestion = (input: Partial<CanonicalPlaceSuggestion> & Pick<CanonicalPlaceSuggestion, "canonicalPlaceId" | "name" | "country" | "placeType">): CanonicalPlaceSuggestion => ({
  label: `${input.name}, ${input.country}`,
  provenance: [{ id: `provider:${input.canonicalPlaceId}`, label: "Provider fixture", kind: "provider", supports: "Fixture identity." }],
  ...input,
});

const scotland = suggestion({ canonicalPlaceId: "region:scotland", name: "Scotland", country: "United Kingdom", placeType: "region", routability: "planning_area" });
const iran = suggestion({ canonicalPlaceId: "country:iran", name: "Iran", country: "Iran", placeType: "country", routability: "planning_area" });
const georgiaCountry = suggestion({ canonicalPlaceId: "country:georgia", name: "Georgia", country: "Georgia", placeType: "country", routability: "planning_area" });
const georgiaState = suggestion({ canonicalPlaceId: "region:us-georgia", name: "Georgia", country: "United States", region: "Georgia", placeType: "region", routability: "planning_area" });
const florence = suggestion({ canonicalPlaceId: "city:florence", name: "Florence", country: "Italy", region: "Tuscany", placeType: "city", routability: "direct_destination" });

test("1 Scotland is recognised as a valid planning-area mention", () => {
  const appended = appendSelectedPlanningAreaMention(emptyResult(), scotland);
  assert.equal(appended.mention.status, "resolved");
  assert.equal(appended.mention.requiresBaseSelection, true);
});

test("2 Scotland produces the canonical base-selection issue, not an unresolved-place issue", () => {
  const issues = appendSelectedPlanningAreaMention(emptyResult(), scotland).result.issues;
  assert.equal(issues.some((issue) => issue.code === "region_requires_base"), true);
  assert.equal(issues.some((issue) => issue.code === "unresolved_place"), false);
});

test("3 Add Stop transitions a recognised planning area into the shared dialog owner", () => {
  assert.match(builder, /placeSuggestionRequiresBaseSelection\(canonicalSuggestion\)[\s\S]*?beginPlanningAreaClarification\(canonicalSuggestion\)/);
  const begin = builder.slice(builder.indexOf("const beginPlanningAreaClarification"), builder.indexOf("const cancelTransientPlanningClarification"));
  assert.match(begin, /setClarificationSessionIds\(\[appended\.mention\.mentionId\]\)/);
  assert.match(begin, /setClarificationOpen\(true\)/);
});

test("4 Scotland base search remains hard-bound to the selected parent", () => {
  assert.match(builder, /parentConstraint: clarificationUsesNearbyBases \? undefined : planningParentForMention\(activeClarificationMention\)/);
  assert.match(geocode, /filter\(\(candidate\) => !planningParent \|\| placeCandidateWithinPlanningParent\(candidate, planningParent\)\)/);
});

test("5 Glasgow is accepted within Scotland", () => {
  const parent: PlanningParentConstraint = { canonicalName: "Scotland", placeType: "region", parentCountries: ["United Kingdom"] };
  assert.equal(placeCandidateWithinPlanningParent({ canonicalName: "Glasgow", placeType: "city", parentCountries: ["United Kingdom"], parentRegionId: "Scotland", coordinates: [-4.25, 55.86] }, parent), true);
});

test("6 Scotland and Glasgow cannot become two independent stops", () => {
  assert.match(builder, /beginPlanningAreaClarification\(canonicalSuggestion\);\s*return;/);
  assert.match(builder, /mentionId: targetMentionId,[\s\S]*?routeStopId: id/);
});

test("7 the Scotland planning relationship is retained when its base is selected", () => {
  assert.match(builder, /kind: selectionDraft\?\.kind[\s\S]*?\? "base"/);
  assert.match(builder, /selectedName: selectionDraft\?\.selectedName \?\? resolvedName/);
});

test("8 cancelling a transient Add Stop clarification removes its mention and selections", () => {
  assert.match(builder, /cancelTransientPlanningClarification[\s\S]*?placeMentions: mentions[\s\S]*?placeSelections:/);
  assert.match(builder, /setPlaceSelections\(\(current\) => current\.filter\(\(selection\) => selection\.mentionId !== mentionId\)\)/);
  assert.match(builder, /originBeforePlanningClarificationRef\.current = \{[\s\S]*?name: origin/);
  assert.match(builder, /replaceJourneyOrigin\(previousOrigin \?\? \{ name: "" \}\)/);
});

test("9 Iran enters the same inline base-selection semantics", () => {
  const appended = appendSelectedPlanningAreaMention(emptyResult(), iran);
  assert.equal(appended.mention.canonicalName, "Iran");
  assert.equal(appended.result.issues.some((issue) => issue.code === "region_requires_base"), true);
});

test("10 Shiraz is accepted within Iran", () => {
  assert.equal(placeCandidateWithinPlanningParent({ canonicalName: "Shiraz", placeType: "city", parentCountries: ["Iran"], parentRegionId: "Fars", coordinates: [52.58, 29.61] }, { canonicalName: "Iran", placeType: "country", parentCountries: ["Iran"] }), true);
});

test("11 foreign candidates never satisfy the Iran parent", () => {
  assert.equal(placeCandidateWithinPlanningParent({ canonicalName: "Taipei", placeType: "city", parentCountries: ["Taiwan"], coordinates: [121.56, 25.04] }, { canonicalName: "Iran", placeType: "country", parentCountries: ["Iran"] }), false);
});

test("12 Georgia country and Georgia state remain materially distinct identities", () => {
  assert.notEqual(georgiaCountry.canonicalPlaceId, georgiaState.canonicalPlaceId);
  assert.notEqual(georgiaCountry.country, georgiaState.country);
  assert.match(autocomplete, /showPlaceType \? ` · \$\{placeTypeLabel\(suggestion\.placeType\)\}`/);
});

test("13 choosing Georgia country creates a country-bound base flow", () => {
  const mention = appendSelectedPlanningAreaMention(emptyResult(), georgiaCountry).mention;
  assert.equal(mention.placeType, "country");
  assert.deepEqual(mention.parentCountries, ["Georgia"]);
});

test("14 Tbilisi is accepted for Georgia country", () => {
  assert.equal(placeCandidateWithinPlanningParent({ canonicalName: "Tbilisi", placeType: "city", parentCountries: ["Georgia"], parentRegionId: "Tbilisi", coordinates: [44.8, 41.72] }, { canonicalName: "Georgia", placeType: "country", parentCountries: ["Georgia"] }), true);
});

test("15 choosing Georgia US state creates a state-bound base flow", () => {
  const mention = appendSelectedPlanningAreaMention(emptyResult(), georgiaState).mention;
  assert.equal(mention.placeType, "region");
  assert.deepEqual(mention.parentCountries, ["United States"]);
});

test("16 Atlanta is accepted for Georgia state while Tbilisi is rejected", () => {
  const parent: PlanningParentConstraint = { canonicalName: "Georgia", placeType: "region", parentCountries: ["United States"] };
  assert.equal(placeCandidateWithinPlanningParent({ canonicalName: "Atlanta", placeType: "city", parentCountries: ["United States"], parentRegionId: "Georgia", coordinates: [-84.39, 33.75] }, parent), true);
  assert.equal(placeCandidateWithinPlanningParent({ canonicalName: "Tbilisi", placeType: "city", parentCountries: ["Georgia"], parentRegionId: "Tbilisi", coordinates: [44.8, 41.72] }, parent), false);
});

test("17 Florence remains a direct, one-step Add Stop result", () => {
  assert.equal(placeSuggestionRequiresBaseSelection(florence), false);
  assert.match(builder, /setStops\(\(current\) => replaceableRouteStopId/);
});

test("18 genuine invalid input retains canonical error semantics", () => {
  assert.match(builder, /invalid=\{Boolean\(stopError\)\}/);
  assert.match(builder, /className=\{styles\.hintError\} role="alert"/);
  assert.match(styles, /\.cardError\s*\{[^}]*var\(--signal\)/);
});

test("19 needs-base clarification is neutral, focus-managed, and not aria-invalid", () => {
  const clarification = builder.slice(builder.indexOf("inlineStopBaseMention ?"), builder.indexOf(": <>\n                    {resolvingPlaceMentionId"));
  assert.match(clarification, /autoFocus/);
  assert.match(clarification, /role="status"/);
  assert.doesNotMatch(clarification, /styles\.cardError|className=\{styles\.hintError\}/);
  assert.match(clarification, /invalid=\{Boolean\(baseSearchErrors\[inlineStopBaseMention\.mentionId\]\)\}/);
  assert.match(styles, /\.inlinePlanningClarification\{[^}]*var\(--morrovia-lilac\)/);
});

test("20 pending geography blocks Step 2 until a base or broad-area completion clears it", () => {
  assert.match(builder, /const blockingPlaceIssue = placeIssues\.find\(\(issue\) => issue\.blocksRoute && !selectedMentionIds\.has\(issue\.mentionId\)\)/);
  assert.match(builder, /const nextSelection: PlaceSelection = \{[\s\S]*?mentionId: targetMentionId/);
  assert.match(builder, /setPlaceSelections\(\(current\) => \[nextSelection,/);
  assert.match(builder, /setTransientPlanningMentionId\(\(current\) => current === targetMentionId \? null : current\)/);
  assert.match(builder, /const completePlanningArea = \(mention: CapturedLocation\) =>/);
  assert.match(builder, /setCompletedPlanningAreaMentionIds\(\(current\) => \[\.\.\.new Set\(\[\.\.\.current, mention\.mentionId\]\)\]\)/);
});

test("21 route shapes are review-only until the traveller explicitly applies them", () => {
  assert.match(dialog, /Review these places before adding them\. Nothing changes until you confirm\./);
  assert.match(dialog, /aria-expanded=\{reviewing\}/);
  assert.match(builder, /applyGuidedPlanningShape\(activeClarificationMention, guided\)/);
  assert.doesNotMatch(dialog.slice(dialog.indexOf("const reviewing ="), dialog.indexOf("onApplyShape\?\.\(shape\)")), /setStops|setPlaceSelections/);
});

test("22 applying a route shape adds every proposed canonical place", () => {
  assert.match(builder, /for \(const suggestion of shape\.places\)[\s\S]*?await addGuidedPlanningPlace\(mention, suggestion\)/);
  assert.match(builder, /canonicalPlaceId: suggestion\.canonicalPlaceId/);
  assert.match(builder, /provenance: suggestion\.provenance/);
});

test("23 applying places does not mark the planning area complete", () => {
  const applyShape = builder.slice(builder.indexOf("const applyGuidedPlanningShape"), builder.indexOf("const confirmAttractionVisit"));
  assert.doesNotMatch(applyShape, /completePlanningArea|setCompletedPlanningAreaMentionIds/);
  assert.match(builder, /Done with \$\{clarificationParentName\}/);
});

test("24 completed countries retain the existing explicit reopen path", () => {
  assert.match(builder, /reopenPlanningArea\(mention\)/);
  assert.match(builder, /Add or change places/);
  assert.match(builder, /setCompletedPlanningAreaMentionIds\(\(current\) => current\.filter/);
});

test("25 sequential guidance keeps scoped search without adding another preference model", () => {
  assert.match(builder, /parentConstraint: clarificationUsesNearbyBases \? undefined : planningParentForMention\(activeClarificationMention\)/);
  assert.match(builder, /nearbyAnchor: clarificationUsesNearbyBases \? activeNearbyBaseAnchor : undefined/);
  assert.doesNotMatch(dialog, /toggleInterest|setTripIntent|setTravelProfile|areaGuidanceInterests/);
});

test("26 guidance uses progressive disclosure and native keyboard-operable controls", () => {
  assert.match(dialog, /<button type="button" aria-expanded=\{reviewing\}/);
  assert.match(dialog, /setReviewingShapeId\(reviewing \? null : shape\.id\)/);
  const dialogStyles = read("components/easyt/builder-clarification-dialog.module.css");
  assert.match(dialogStyles, /\.shapes article > button:focus-visible/);
  assert.match(dialogStyles, /\.suggestions > div button:focus-visible/);
});
