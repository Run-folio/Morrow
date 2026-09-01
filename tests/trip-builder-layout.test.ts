import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the shared Step 1 intro stays ahead of the canonical fresh-trip capture", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");
  const intro = builder.indexOf('<header className={styles.stepHero}>');
  const freshPrompt = builder.indexOf("{!hasPromptContext && hydrated && <div className={styles.initialCapture}><MorroviaTripCapture");

  assert.notEqual(intro, -1, "Step 1 intro should remain in the shared builder stack");
  assert.notEqual(freshPrompt, -1, "fresh trips should render the canonical trip capture");
  assert.ok(intro < freshPrompt, "Step 1 intro should precede the trip capture in the shared render order");
  assert.doesNotMatch(styles, /tripBriefCard|tripBriefTextarea|tripBriefInput|voiceInput/,
    "Builder CSS must not retain a parallel trip-capture presentation");
  assert.doesNotMatch(builder, /YOUR TRIP BRIEF|You can adjust anything we extract\.|>Continue<\/button>/,
    "the redundant Builder-specific prompt presentation should be removed");

  assert.equal(builder.match(/STEP 1 OF 2/g)?.length, 1,
    "the English Step 1 lockup should render from one shared source");
  assert.equal(builder.match(/Tell us the shape/g)?.length, 1,
    "the Step 1 title should not be duplicated for fresh and contextual entry states");

  const homepageHandoffHydration = builder.slice(
    builder.indexOf('if (params.get("homeDraft") === "1")'),
    builder.indexOf("} else {\n          const seed ="),
  );
  assert.match(homepageHandoffHydration, /setHasPromptContext\(true\)/,
    "homepage handoff should reuse the shared prompt-context Step 1 layout");

  const returningDraftHydration = builder.slice(
    builder.indexOf("const applySaved ="),
    builder.indexOf("const hydrate ="),
  );
  assert.match(returningDraftHydration, /setHasPromptContext\(true\)/,
    "returning drafts should reuse the prompt-context Step 1 layout");

  const stepTwo = builder.indexOf("{step === 1 && (");
  assert.ok(stepTwo > freshPrompt, "Step 2 should remain a separate builder branch after Step 1");
  assert.equal(builder.match(/STEP 2 OF 2/g)?.length, 1,
    "the Step 2 title should remain unchanged and unique");
});

test("Builder workspace height, capture width and step divider remain content-driven", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");
  const handoffShell = styles.slice(styles.indexOf(".homepageHandoff {"), styles.indexOf(".homepageHandoff .steps"));

  assert.match(builder, /<div className=\{styles\.initialCapture\}><MorroviaTripCapture/,
    "direct entry should give the canonical capture a Builder-owned wide layout wrapper");
  assert.match(styles, /\.initialCapture\{[^}]*width:100%[^}]*max-width:800px[^}]*margin:12px auto 0/,
    "the fresh capture should be centered and wider only inside the left Builder workspace");
  assert.match(styles, /\.initialCapture>form\{[^}]*max-width:none/,
    "the local wrapper should release the Homepage component's compact max width");

  assert.doesNotMatch(handoffShell, /100(?:s|d|l|v)vh/,
    "the bordered handoff shell must not force itself to viewport height");
  assert.match(handoffShell, /min-height:\s*0/,
    "short Builder states should use their natural content height");
  assert.doesNotMatch(styles, /\.pane\s*\{[^}]*min-height:\s*520px/,
    "the content pane must not retain the previous fixed minimum workspace height");

  assert.match(styles, /\.steps\{[^}]*border-bottom:1px solid var\(--line\)/,
    "the step header should own the single physical separator");
  assert.match(styles, /\.wizardBody \{[^}]*border-top:\s*0/,
    "the adjacent workspace must not stack a second border against the step header");
  assert.match(styles, /\.wizardBody:has\(\.placesSummaryRail\) \{[^}]*grid-template-columns:minmax\(0,1fr\) var\(--builder-rail-width\)/,
    "the right summary rail must remain a separate grid column");
});

test("homepage handoff presents a concise interpreted review without changing direct entry", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");

  assert.match(builder, /const isHomepagePromptHandoff = arrivedFromHomepage && !sourceRouteKey/,
    "the approved layout should follow shared handoff state rather than a route-only CSS selector");
  assert.match(builder, /Here’s what we understood/);
  assert.match(builder, /Check it, adjust anything that's wrong, and we'll build the best route\./);
  assert.match(builder, /Starting point/);
  assert.match(builder, /Stops \(\$\{stops\.length\}\)/);
  assert.match(builder, /Reorder or remove stops\./);

  assert.match(builder, /const \[showTripDetails, setShowTripDetails\] = useState\(false\)/,
    "Advanced should remain collapsed on first render");
  assert.match(builder, /aria-expanded=\{showTripDetails\}/,
    "Advanced should expose its disclosure state");
  assert.match(builder, /effectiveIntent\.hardConstraints\.fixedCommitments\.map/,
    "fixed commitments must stay in the canonical editor rather than being reset");

  assert.match(builder, /Your route flows well\./,
    "the valid-route state should use the approved compact status");
  assert.equal(builder.match(/function BuilderSummaryRail/g)?.length, 1,
    "both steps should render one shared summary rail component");
  assert.match(builder, /<BuilderSummaryRail step=\{step\}/,
    "the builder shell should keep the summary rail mounted from shared step state");
  assert.match(builder, /step === 0 \? \(language === "es" \? "Fechas después" : "Dates next"\)/,
    "the Places rail should announce that dates come next");
  assert.match(builder, /!\(isHomepagePromptHandoff && step === 0\)/,
    "the global footer containing Back should stay out of homepage Step 1");
  assert.doesNotMatch(builder, /builder-route-watercolor\.png/,
    "Step 1 should not render a decorative route illustration after the action area");
  assert.doesNotMatch(styles, /handoffIllustration/,
    "Step 1 should not reserve CSS space for the removed route illustration");
  const page = readFileSync(new URL("../app/journey/new/page.tsx", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/journey/layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /MorroviaFooter/,
    "the Builder page should not mount a duplicate page-local footer");
  assert.match(layout, /<MorroviaFooter \/>/,
    "the shared Journey shell should provide the normal Morrovia footer");
  assert.match(builder, /className=\{styles\.handoffContext\}><AlertTriangle/,
    "blocking context should have a visible icon rather than relying on red text");

  assert.match(styles, /\.homepageHandoff \.handoffOrigin/);
  assert.match(styles, /\.homepageHandoff \.routeCheck/);
  assert.match(styles, /\.homepageHandoff \.stepTabDone > b \{ border-color: var\(--signal\); background: var\(--signal\); color: #fff; \}/,
    "the completed Places step should retain a visible completion marker on Step 2");
  assert.match(styles, /\.timeStep \.timingWarning \{ margin-bottom: 16px; \}/,
    "a timing warning should sit clear of the persistent Builder footer");
  assert.match(styles, /@media\(max-width:520px\)[\s\S]*\.homepageHandoff \.handoffCta/,
    "the primary action should remain reachable at the narrowest supported width");
});

test("Builder spacing and healthy route copy use the focused production treatment", () => {
  const page = readFileSync(new URL("../app/journey/new/page.tsx", import.meta.url), "utf8");
  const pageStyles = readFileSync(new URL("../app/journey/new/new-trip.module.css", import.meta.url), "utf8");
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const builderStyles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");

  assert.match(page, /className=\{styles\.builderBoundary\}[\s\S]*<TripBuilder \/>/,
    "the page boundary, rather than the Builder header, should own navigation spacing");
  assert.match(builder, /data-builder-root="true"/,
    "all Builder states should expose the page-boundary hook");
  assert.match(pageStyles, /\.builderBoundary\{[^}]*padding-top:32px/,
    "desktop should use a 32px navigation-to-Builder gap");
  assert.match(pageStyles, /@media\(max-width:1024px\)\{\.builderBoundary\{padding-top:28px\}\}/,
    "tablet should use a 28px navigation-to-Builder gap");
  assert.match(pageStyles, /@media\(max-width:700px\)\{\.builderBoundary\{padding-top:22px\}\}/,
    "mobile should use a 22px navigation-to-Builder gap");

  assert.match(builderStyles, /\.placesSection \.confirmedStops\{[^}]*padding:9px 10px/,
    "the Stops field should keep compact internal breathing room");
  assert.match(builderStyles, /\.placesSection \.confirmedStops>div\{gap:8px;min-width:0\}/,
    "wrapped stop chips should retain a consistent gap without overflow");
  assert.match(builderStyles, /\.placesSection \.confirmedStops button\{[^}]*max-width:100%[^}]*white-space:normal/,
    "long stop names should wrap within the field at narrow widths");

  assert.doesNotMatch(builder, /REVIEWED ROUTE FACTS/);
  assert.doesNotMatch(builder, /You can still change the order in the route on the right whenever you like\./);
  assert.doesNotMatch(builder, /Reviewed \{currentCuratedRoute\.reviewedAt\}/);
  assert.match(builder, /ROUTE COVERAGE CHANGED/,
    "a genuine curated-route coverage change should remain visible");
  assert.match(builder, /Avoid driving is active: compare rail or flight/,
    "an actionable transport constraint warning should remain visible");
});

test("the Journey shell owns one production footer and Storybook renders that component", () => {
  const layout = readFileSync(new URL("../app/journey/layout.tsx", import.meta.url), "utf8");
  const shellStyles = readFileSync(new URL("../app/journey/journey-design.css", import.meta.url), "utf8");
  const homeFooter = readFileSync(new URL("../app/journey/home/home-footer.tsx", import.meta.url), "utf8");
  const story = readFileSync(new URL("../components/morrovia-footer.stories.tsx", import.meta.url), "utf8");

  assert.equal(layout.match(/<MorroviaFooter \/>/g)?.length, 1,
    "the shared Journey layout should mount exactly one canonical footer");
  assert.match(shellStyles, /\.morroviaProductShell\s*\{[\s\S]*?display:\s*flex[\s\S]*?min-height:\s*100svh[\s\S]*?flex-direction:\s*column/,
    "the production page shell should push short-page footers to the viewport bottom");
  assert.match(shellStyles, /\.morroviaProductContent\s*\{[\s\S]*?flex:\s*1 0 auto/,
    "long page content should keep its natural scroll height");
  assert.doesNotMatch(homeFooter, /MorroviaFooter|<footer/,
    "the homepage closing content should not duplicate or nest the canonical footer");
  assert.match(story, /import MorroviaFooter from "\.\/morrovia-footer"/);
  assert.match(story, /component: MorroviaFooter/,
    "Storybook should render the exact production footer component");
});

test("the Time step uses the approved hierarchy without bypassing builder truth", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");
  const timeStart = builder.indexOf('{step === 1 && (');
  const timeEnd = builder.indexOf('{step === 0 && isHomepagePromptHandoff', timeStart);
  const timeStep = builder.slice(timeStart, timeEnd);

  assert.match(builder, /\["Places", "Dates and nights"\]/,
    "the active step label should match the approved Dates and nights copy");
  assert.match(timeStep, /<h2>Make the time feel right<\/h2>/);
  assert.match(timeStep, /Set your dates, then adjust nights around the route\./);
  assert.doesNotMatch(timeStep, /Make the time feel right\./,
    "the approved heading has no final period");

  assert.match(builder, /const \[routeInsightsOpen, setRouteInsightsOpen\] = useState\(true\)/,
    "route insights should be expanded on first render");
  assert.match(builder, /const \[timingWarningOpen, setTimingWarningOpen\] = useState\(false\)/,
    "non-blocking warnings should be collapsed on first render");
  assert.match(builder, /if \(step !== 1 \|\| !gateConflict\) return;[\s\S]*setTimingWarningOpen\(true\)[\s\S]*timingWarningRef\.current\?\.focus\(\)/,
    "blocking conflicts should expand and focus the warning");
  assert.match(timeStep, /aria-expanded=\{routeInsightsOpen\}/);
  assert.match(timeStep, /aria-expanded=\{timingWarningOpen\}/);

  for (const heading of ["Nights per stop", "STOP", "TRANSFER", "NIGHTS", "USABLE TIME"]) {
    assert.match(timeStep, new RegExp(heading));
  }
  assert.match(timeStep, /activeTripDocument\.legs\.find\(\(candidate\) => candidate\.toStopId === stop\.id\)/,
    "transfer values should use the canonical persisted leg");
  assert.match(timeStep, /leg\.doorToDoorMinutes \?\? leg\.durationMinutes/,
    "the canonical door-to-door value should remain the display source");
  assert.match(timeStep, /leg\.mode === "flight" && transferMinutes !== null \? " total" : ""/,
    "known flight transfers should be labelled as the total journey time");
  assert.match(timeStep, /The estimated door-to-door total includes airport access, check-in and security, departure buffer, flight time/,
    "flight totals should expose their calculation basis to assistive technology");
  assert.match(timeStep, /Remove one night from \$\{stop\.name\}; \$\{days\} nights currently/);
  assert.match(timeStep, /Add one night to \$\{stop\.name\}; \$\{days\} nights currently/);
  assert.match(timeStep, /Use the arrow keys to move this stop/,
    "the drag control should also support keyboard reordering");

  assert.match(builder, /candidate\?\.constraintsSatisfied \|\| score\?\.state !== "scored"/,
    "warning alternatives must come from scored, constraint-safe route candidates");
  assert.match(builder, /scheduleLocks\.stopIds\.length \|\| Object\.keys\(scheduleLocks\.arrivalDates\)\.length/,
    "route alternatives must not cross schedule locks");
  assert.doesNotMatch(timeStep, /Possible alternatives/,
    "the warning should not promise alternatives that do not exist");
  assert.match(timeStep, /setStep\(0\); setHasPromptContext\(true\); setSummaryFocus\("stops"\)/,
    "the Review route fallback should return to the shared Places step with state intact");

  assert.match(builder, /Your trip at a glance/);
  assert.match(builder, /All \$\{totalNights\} nights allocated/,
    "allocation completeness should not be described as overall trip readiness");
  assert.match(timeStep, /NIGHTS ALLOCATED/);
  assert.match(builder, /const highlyCompressedTrip = stops\.length >= 4/,
    "very short multi-stop trips should receive a deterministic strong caution");
  assert.match(builder, /\$\{stops\.length\} stops in \$\{totalDays\} days is very fast-paced\./);
  assert.match(timeStep, /Mode and timing still need checking/,
    "unknown canonical transfers should remain calm and explicit");
  assert.doesNotMatch(timeStep, /<Image/,
    "the Time step should not include decorative illustration");
  const summaryRail = builder.slice(builder.indexOf("function BuilderSummaryRail"), builder.indexOf("/* ------------------------------------------------------------- main */"));
  assert.doesNotMatch(summaryRail, /specificTimingWarning/,
    "the warning should not be duplicated in the right rail");

  assert.match(styles, /@media\(max-width:700px\)[\s\S]*\.nightsControl button \{ width: 44px; height: 44px;/,
    "night controls should keep 44px mobile targets");
  assert.match(styles, /@media\(max-width:700px\)[\s\S]*grid-template-areas: "grip stop stop" "transfer transfer transfer" "nights nights usable" "moves moves moves"/,
    "mobile rows should stack without horizontal overflow");
  assert.match(builder, /if \(step === 0\)[\s\S]*setStep\(1\)[\s\S]*buildTrip\(\);/,
    "the existing Continue and Build trip handoff should remain authoritative");
});

test("clarification presentation separates action-required geography from confirmed stay bases", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");

  assert.match(builder, /pendingReviewPlaceMentions = useMemo/);
  assert.match(builder, /geographyReviewPlaceMentions = useMemo/,
    "an in-place Add Stop clarification should not be duplicated below in Geography to review");
  assert.match(builder, /resolvedPlaceMentions = useMemo/);
  assert.match(builder, /geographyReviewPlaceMentions\.length > 0/,
    "Geography to review must disappear when no item still needs action");
  assert.match(builder, /STAY BASES CONFIRMED/);
  assert.match(builder, /staying in \$\{selection\.selectedName\}/,
    "confirmed anchors should explain where the traveller will stay");
  assert.match(builder, /placeDisplayName\(mention\)/,
    "presentation should use canonical names without mutating source text");
  assert.match(builder, /aria-label=\{`\$\{placeDisplayName\(mention\)\},/,
    "resolved relationships should have a complete screen-reader label");
  assert.match(styles, /\.resolvedPlaces article > button:focus-visible/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.resolvedPlaces > div \{ grid-template-columns: 1fr;/,
    "confirmed base cards should stack at narrow widths");
});

test("night allocation reads canonical arrival and departure transfer impacts", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");

  assert.match(builder, /transferImpactFromMetadata\(builderCanonicalLegs\[index\]\?\.routeMetadata\.transferImpact\)/,
    "arrival allocation must decode the transfer-impact payload rather than its route-metadata wrapper");
  assert.match(builder, /transferImpactFromMetadata\(builderCanonicalLegs\[index \+ 1\]\?\.routeMetadata\.transferImpact\)/,
    "departure allocation must use the following canonical leg's transfer-impact payload");
  assert.match(builder, /departureImpact: departureImpact \?\? undefined/,
    "both sides of each stay must reach the shared night allocator");
  assert.doesNotMatch(builder, /transferImpactFromMetadata\(builderCanonicalLegs\[index\]\?\.routeMetadata\)/,
    "the route-metadata wrapper is not itself a transfer impact");
});

test("manual night edits use canonical rebalance, durable stop intent and shared feedback", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const trip = readFileSync(new URL("../lib/easyt/trip.ts", import.meta.url), "utf8");
  const storage = readFileSync(new URL("../lib/easyt/storage.ts", import.meta.url), "utf8");

  assert.match(builder, /rebalanceTripNights\(\{/,
    "manual Builder edits must use the canonical night-allocation owner");
  assert.match(builder, /manualStopIds: nextManualStopIds/,
    "the edited stop must become authoritative for the pass");
  assert.match(builder, /<MorroviaStatusBanner className=\{styles\.nightBalanceNotice\}/,
    "automatic consequences and unresolved balance must reuse canonical status feedback");
  assert.doesNotMatch(builder, /sort\(\(a, b\) => nextAllocation\[b\.id\] - nextAllocation\[a\.id\]\)/,
    "the removed largest-stay donor shortcut must not return");
  assert.match(trip, /manualNightStopIds\?: string\[\]/,
    "manual stop identities must be part of the durable trip document");
  assert.match(storage, /manualNightStopIds: brief\.manualNightStopIds/,
    "device/cloud equivalence must compare manual night intent");
});
