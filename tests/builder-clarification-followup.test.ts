import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  builderClarificationProgress,
  builderClarificationRemovalPlan,
  builderClarificationResumeLabel,
  orderedBuilderClarificationIds,
  shouldAutoOpenBuilderClarification,
} from "../lib/easyt/builder-clarification.ts";
import { resolvedJourneyEndPlace } from "../lib/easyt/journey-endpoints.ts";
import { placeCandidateWithinPlanningParent } from "../lib/easyt/place-intelligence.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("app/journey/home/home-trip-starter.tsx");
const builder = read("app/journey/new/trip-builder.tsx");
const builderCss = read("app/journey/new/trip-builder.module.css");
const endpoint = read("components/easyt/journey-endpoints-editor.tsx");
const endpointCss = read("components/easyt/journey-endpoints-editor.module.css");
const prompt = read("components/easyt/morrovia-trip-capture.tsx");
const promptCss = read("components/easyt/morrovia-trip-capture.module.css");
const autocomplete = read("components/easyt/canonical-place-autocomplete.tsx");
const clarification = read("components/easyt/builder-clarification-dialog.tsx");
const clarificationCss = read("components/easyt/builder-clarification-dialog.module.css");
const repository = read("lib/easyt/repository.ts");

test("1 Homepage suppresses the endpoint eyebrow", () => {
  assert.match(home, /showHeading=\{false\}/);
});

test("2 Homepage suppresses endpoint helper copy", () => {
  assert.match(home, /showHint=\{false\}/);
});

test("3 unknown End has no duplicate Not sure yet action", () => {
  const shortcuts = endpoint.slice(endpoint.indexOf("className={styles.shortcuts}"), endpoint.indexOf("</div>\n      </div>"));
  assert.doesNotMatch(shortcuts, /Not sure yet|text\.unknown|onEndModeChange\("unknown"\)/);
  assert.match(endpoint, /endPlaceholder: "Not sure yet"/);
});

test("4 End clear returns to the canonical unknown state", () => {
  assert.match(endpoint, /onClear=\{\(\) => onEndModeChange\("unknown"\)\}/);
  assert.match(autocomplete, /onClear\?\(\)|onClear\(\)/);
});

test("5 Same as start remains a canonical relationship", () => {
  const london = { name: "London", canonicalPlaceId: "city:london", country: "United Kingdom" };
  assert.deepEqual(resolvedJourneyEndPlace(london, { mode: "same_as_start" }), london);
  assert.match(endpoint, /aria-pressed=\{endSelection\.mode === "same_as_start"\}/);
});

test("6 explicit End overrides origin inference", () => {
  const end = resolvedJourneyEndPlace({ name: "London" }, { mode: "explicit", place: { name: "Seoul", canonicalPlaceId: "city:seoul" } });
  assert.equal(end?.name, "Seoul");
  assert.equal(end?.canonicalPlaceId, "city:seoul");
});

test("7 endpoints use the equal full-width desktop layout", () => {
  assert.match(endpointCss, /grid-template-columns:\s*minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(endpointCss, /\.root \{[^}]*min-width:\s*0/);
});

test("8 the desktop arrow is aligned to the field-control row", () => {
  assert.match(endpoint, /className=\{styles\.arrowSlot\}/);
  assert.match(endpointCss, /\.arrowSlot \{[^}]*grid-template-rows:\s*12px 7px 50px/);
  assert.match(endpointCss, /\.arrow \{[^}]*grid-row:\s*3;[^}]*align-self:\s*center/);
});

test("9 stacked endpoints remove the horizontal arrow", () => {
  assert.match(endpointCss, /@media \(max-width: 620px\)[\s\S]*?\.fields \{ grid-template-columns: 1fr;[\s\S]*?\.arrowSlot \{ display: none; \}/);
});

test("10 prompt textarea uses the canonical field states and full-surface hit target", () => {
  assert.match(promptCss, /\.promptField:hover \{ border-color: var\(--morrovia-ink-soft\)/);
  assert.match(promptCss, /\.promptField:focus-within[\s\S]*?box-shadow: var\(--morrovia-focus-shadow\)/);
  assert.match(promptCss, /\.textareaField textarea::placeholder \{ color: var\(--morrovia-muted\)/);
  assert.match(promptCss, /cursor: text/);
  assert.match(prompt, /onMouseDown=\{\(event\) =>[\s\S]*?textareaRef\.current\?\.focus\(\)/);
});

test("11 four unresolved countries produce one ordered dialog session, not four cards", () => {
  assert.deepEqual(orderedBuilderClarificationIds([
    { id: "bulgaria", order: 0 }, { id: "romania", order: 1 }, { id: "georgia", order: 2 }, { id: "albania", order: 3 },
  ]), ["bulgaria", "romania", "georgia", "albania"]);
  assert.equal((builder.match(/<BuilderClarificationDialog/g) ?? []).length, 1);
  assert.doesNotMatch(builder, /geographyReviewPlaceMentions\.map\(/);
});

test("12 clarification order follows prompt order and only deduplicates identities", () => {
  assert.deepEqual(orderedBuilderClarificationIds([
    { id: "albania", order: 3 }, { id: "bulgaria", order: 0 }, { id: "georgia", order: 2 }, { id: "bulgaria", order: 0 },
  ]), ["bulgaria", "georgia", "albania"]);
});

test("13 progress is bounded and human-readable", () => {
  assert.equal(builderClarificationProgress(0, 4), "1 of 4");
  assert.equal(builderClarificationProgress(3, 4), "4 of 4");
  assert.equal(builderClarificationProgress(8, 4), "4 of 4");
});

test("14 a country can retain several distinct selected places", () => {
  assert.match(builder, /const multiPlacePlanningMention = Boolean\(targetMention && placeMentionSupportsMultipleSelections\(targetMention\)\)/);
  assert.match(builder, /multiPlacePlanningMention\s*\? selection\.mentionId !== targetMentionId \|\| selection\.selectedCanonicalPlaceId !== nextSelection\.selectedCanonicalPlaceId/);
});

test("15 adding the first place does not auto-complete its parent", () => {
  const addStop = builder.slice(builder.indexOf("const addStop = async"), builder.indexOf("const addSupportedBase"));
  assert.doesNotMatch(addStop, /setCompletedPlanningAreaMentionIds/);
  assert.match(builder, /onDone=\{\(\) => \{[\s\S]*?completePlanningArea\(activeClarificationMention\)/);
});

test("16 Done completes the current parent then advances", () => {
  assert.match(builder, /onDone=\{\(\) => \{[\s\S]*?completePlanningArea\(activeClarificationMention\);[\s\S]*?advanceClarificationSession\(\)/);
  assert.match(builder, /Done with \$\{clarificationParentName\}/);
});

test("17 Back changes only the local dialog index and preserves choices", () => {
  assert.match(builder, /onBack=\{clarificationIndex > 0 \? \(\) => setClarificationIndex/);
  const backLine = builder.match(/onBack=\{[^\n]+/)?.[0] ?? "";
  assert.doesNotMatch(backLine, /setPlaceSelections|setStops|setCompletedPlanningAreaMentionIds/);
});

test("18 Finish later preserves selections and unresolved parent state", () => {
  const dismiss = builder.slice(builder.indexOf("const dismissClarificationSession"), builder.indexOf("const advanceClarificationSession"));
  assert.match(dismiss, /setClarificationDismissed\(true\)/);
  assert.doesNotMatch(dismiss, /setPlaceSelections|setStops|setCompletedPlanningAreaMentionIds|setRemovedPlaceMentionIds/);
});

test("19 dismissal exposes one compact resumable status", () => {
  assert.match(builder, /!clarificationOpen && pendingClarificationIds\.length > 0 && <BuilderClarificationResume/);
  assert.equal(builderClarificationResumeLabel(3), "3 areas still need shaping");
  assert.match(clarification, /Continue|actionLabel/);
});

test("20 resume starts with the first still-unresolved item", () => {
  assert.match(builder, /setClarificationSessionIds\(pendingClarificationIds\)/);
  assert.match(builder, /preferredMentionId \? pendingClarificationIds\.indexOf\(preferredMentionId\) : 0/);
});

test("21 the task region disappears when no unresolved item remains", () => {
  assert.match(builder, /pendingClarificationIds\.length > 0 && <BuilderClarificationResume/);
  assert.match(builder, /setClarificationSessionIds\(\[\]\)/);
});

test("22 completed parent intent remains reopenable", () => {
  assert.match(builder, /resolvedPlanningAreaMentions\.map/);
  assert.match(builder, /onClick=\{\(\) => reopenPlanningArea\(mention\)\}/);
  assert.match(builder, /"Edit places"/);
});

test("23 selected concrete places remain in the normal ordered route-stop list", () => {
  assert.match(builder, /stops\.map\(\(stop, index\) =>/);
  assert.match(builder, /routeStopId: id/);
  assert.match(builder, /resolvedPlanningAreaMentions/);
});

test("24 area search rejects candidates outside the canonical parent", () => {
  const bulgaria = { canonicalName: "Bulgaria", placeType: "country" as const, parentCountries: ["Bulgaria"] };
  assert.equal(placeCandidateWithinPlanningParent({ canonicalName: "Sofia", placeType: "city", parentCountries: ["Bulgaria"], coordinates: [23.32, 42.69] }, bulgaria), true);
  assert.equal(placeCandidateWithinPlanningParent({ canonicalName: "Bucharest", placeType: "city", parentCountries: ["Romania"], coordinates: [26.1, 44.43] }, bulgaria), false);
  assert.match(builder, /parentConstraint: clarificationUsesNearbyBases \? undefined : planningParentForMention\(activeClarificationMention\)/);
});

test("25 provider search failure preserves parent intent and selections", () => {
  const failed = autocomplete.slice(autocomplete.indexOf(".catch((error)"), autocomplete.indexOf(".finally(() => setProviderSearching"));
  assert.match(failed, /setProviderSuggestions\(\[\]\)/);
  assert.match(failed, /setProviderFailed\(true\)/);
  assert.doesNotMatch(failed, /onChange|onSelect|placeSelections|removedPlaceMentionIds/);
});

test("26 reviewed route shapes add canonical places without completing the parent", () => {
  const applyShape = builder.slice(builder.indexOf("const applyGuidedPlanningShape"), builder.indexOf("const confirmAttractionVisit"));
  assert.match(applyShape, /for \(const suggestion of shape\.places\)/);
  assert.match(builder, /canonicalPlaceId: suggestion\.canonicalPlaceId/);
  assert.doesNotMatch(applyShape, /completePlanningArea|setCompletedPlanningAreaMentionIds/);
});

test("27 genuine ambiguity uses its own question variant", () => {
  assert.match(builder, /`Which \$\{activeProviderClarification\?\.mention\.sourceText \?\? activeClarificationMention\?\.sourceText \?\? "place"\} did you mean\?`/);
  assert.match(builder, /const clarificationIsAmbiguity/);
});

test("28 selecting a broad ambiguity transitions in place instead of closing the session", () => {
  assert.match(builder, /choosePlaceIdentity\(activeClarificationMention, option\.canonicalPlaceId\)/);
  assert.match(builder, /if \(\["city", "town", "transport_gateway"\]\.includes\(option\.placeType\)\) advanceClarificationSession\(\)/);
});

test("29 landmark intent remains separate from its practical base selection", () => {
  assert.match(builder, /`Where would you like to stay for \$\{clarificationParentName\}\?`/);
  assert.match(builder, /nearbyAnchor: clarificationUsesNearbyBases \? activeNearbyBaseAnchor : undefined/);
  assert.match(builder, /relationshipType: "visit-from-base"/);
  assert.match(builder, /kind: targetMention\?\.routability === "anchor_or_poi" \? "visit" : "base"/);
});

test("30 manually adding a broad area opens the same clarification dialog", () => {
  const begin = builder.slice(builder.indexOf("const beginPlanningAreaClarification"), builder.indexOf("const cancelTransientPlanningClarification"));
  assert.match(begin, /setClarificationSessionIds\(\[appended\.mention\.mentionId\]\)/);
  assert.match(begin, /setClarificationOpen\(true\)/);
});

test("31 endpoint changes do not reset broad-area selections", () => {
  const endHandlers = builder.slice(builder.indexOf("const changeJourneyEndInput"), builder.indexOf("const selectOriginBase"));
  assert.match(endHandlers, /setJourneyEnd/);
  assert.doesNotMatch(endHandlers, /setPlaceSelections|setCompletedPlanningAreaMentionIds|setStops/);
});

test("32 an endpoint equal to a selected stop still uses one canonical route stop", () => {
  assert.match(builder, /isDuplicatePlaceIdentity\(stops,/);
  assert.match(builder, /canonicalPlaceId: selectedCanonicalPlaceId \?\? resolved\.canonicalPlaceId/);
  assert.doesNotMatch(builder, /setStops\([^\n]*journeyEnd/);
});

test("33 Product Tour prevents and displaces clarification auto-open", () => {
  assert.equal(shouldAutoOpenBuilderClarification({ hydrated: true, placesStep: true, arrivedFromHomepage: true, resolving: false, itemCount: 4, alreadyOpened: false, explicitlyDismissed: false, competingModal: true, recoveryBlocked: false }), false);
  assert.match(builder, /clarificationMustYield = productTourOpen/);
});

test("34 recovery and conflict state prevent auto-open", () => {
  assert.equal(shouldAutoOpenBuilderClarification({ hydrated: true, placesStep: true, arrivedFromHomepage: true, resolving: false, itemCount: 4, alreadyOpened: false, explicitlyDismissed: false, competingModal: false, recoveryBlocked: true }), false);
  assert.match(builder, /cloudSaveError \|\| cloudConflictTrip \|\| deviceRecoveryBlocked \|\| deviceStorageBlocked \|\| pendingStopRemoval/);
});

test("35 an account or trip scope switch clears stale modal state", () => {
  assert.match(builder, /const scope = `\$\{activeBrowserOwnerId \?\? "guest"\}:\$\{tripId\}`[\s\S]*?setClarificationOpen\(false\)[\s\S]*?setClarificationSessionIds\(\[\]\)[\s\S]*?\}, \[activeBrowserOwnerId, tripId\]\)/);
});

test("36 reload persistence continues through the canonical structured brief", () => {
  assert.match(builder, /setPlaceSelections\(savedStructuredBrief\.placeSelections \?\? \[\]\)/);
  assert.match(builder, /setCompletedPlanningAreaMentionIds\(completedPlanningAreasForBrief\(savedStructuredBrief\)\)/);
  assert.match(builder, /structuredBrief: effectiveStructuredBrief/);
});

test("37 stale cross-tab saves retain repository compare-and-swap protection", () => {
  assert.match(repository, /incoming updatedAt remains the compare-and-swap token/);
  assert.match(repository, /pg_advisory_xact_lock/);
  assert.match(repository, /where id = \$\{document\.id\}[\s\S]*?document ->> 'updatedAt' = \$\{trip\.updatedAt\}/);
});

test("38 the 390px clarification is a usable bottom sheet", () => {
  assert.match(clarificationCss, /@media \(max-width: 620px\)/);
  assert.match(clarificationCss, /place-items: end stretch/);
  assert.match(clarificationCss, /morrovia-mobile-dock-offset/);
  assert.match(clarificationCss, /\.footer > div button \{ min-height: 44px/);
  assert.doesNotMatch(clarificationCss, /overflow-x:\s*auto/);
});

test("39 dialog close restores focus safely", () => {
  assert.match(clarification, /const returnFocus = document\.activeElement/);
  assert.match(clarification, /returnFocus\?\.focus\(\)/);
  assert.match(builder, /clarificationResumeRef\.current\?\.focus\(\)/);
});

test("40 Escape dismisses without mutating canonical work", () => {
  const keyboard = clarification.slice(clarification.indexOf("const onKeyDown"), clarification.indexOf("document.addEventListener"));
  assert.match(keyboard, /event\.key === "Escape"/);
  assert.match(keyboard, /dismissRef\.current\(\)/);
  assert.doesNotMatch(keyboard, /onRemove|onDone|onSelect|setPlace/);
});

test("41 removing an area cascades only to children solely owned by that parent", () => {
  const plan = builderClarificationRemovalPlan({
    mentionId: "bulgaria",
    selections: [
      { mentionId: "bulgaria", routeStopId: "sofia" },
      { mentionId: "bulgaria", routeStopId: "plovdiv" },
      { mentionId: "conference", routeStopId: "plovdiv" },
    ],
    existingStopIds: ["sofia", "plovdiv"],
  });
  assert.equal(plan.ownershipKnown, true);
  assert.deepEqual(plan.removableStopIds, ["sofia"]);
  assert.deepEqual(plan.preservedStopIds, ["plovdiv"]);
});

test("42 endpoints, booked or fixed children remain when their broad parent is removed", () => {
  const plan = builderClarificationRemovalPlan({
    mentionId: "thailand",
    selections: [
      { mentionId: "thailand", routeStopId: "bangkok" },
      { mentionId: "thailand", routeStopId: "krabi" },
    ],
    existingStopIds: ["bangkok", "krabi"],
    independentStopIds: ["bangkok"],
    protectedStopIds: ["krabi"],
  });
  assert.equal(plan.ownershipKnown, true);
  assert.deepEqual(plan.removableStopIds, []);
  assert.deepEqual(plan.preservedStopIds, ["bangkok", "krabi"]);
});

test("43 stale child ownership fails closed", () => {
  const plan = builderClarificationRemovalPlan({
    mentionId: "albania",
    selections: [{ mentionId: "albania", routeStopId: "missing-stop" }],
    existingStopIds: [],
  });
  assert.equal(plan.ownershipKnown, false);
  assert.deepEqual(plan.removableStopIds, []);
  assert.match(builder, /activeClarificationRemovalPlan\?\.ownershipKnown/);
});

test("44 preserved children shed a removed parent relationship without losing the stop", () => {
  assert.match(builder, /const priorParentWasRemoved/);
  assert.match(builder, /placeMentionId: selection\?\.mentionId \?\? \(priorParentWasRemoved \? undefined : prior\?\.placeMentionId\)/);
  assert.match(builder, /removePlanningArea\(activeClarificationMention, activeClarificationRemovalPlan\)/);
});
