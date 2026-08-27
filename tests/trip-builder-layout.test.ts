import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the shared Step 1 intro stays ahead of the fresh-trip prompt panel", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");
  const intro = builder.indexOf('<header className={styles.stepHero}>');
  const freshPrompt = builder.indexOf("{!hasPromptContext && hydrated && <div className={`${styles.card} ${styles.tripBriefCard}`}");

  assert.notEqual(intro, -1, "Step 1 intro should remain in the shared builder stack");
  assert.notEqual(freshPrompt, -1, "fresh trips should retain the prompt panel");
  assert.ok(intro < freshPrompt, "Step 1 intro should precede the prompt panel in the shared render order");
  assert.doesNotMatch(styles, /\.stack\s*>\s*\.tripBriefCard\s*\{[^}]*\border\s*:/,
    "CSS must not move the prompt panel ahead of the shared Step 1 intro");

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
  assert.match(builder, /builder-route-watercolor\.png" width=\{1881\} height=\{836\} sizes=/,
    "the lower route illustration should remain decorative");
  assert.ok(builder.indexOf("className={styles.handoffIllustration}") > builder.indexOf("className={styles.handoffActions}"),
    "the decorative illustration should follow the Step 1 action area");
  const page = readFileSync(new URL("../app/journey/new/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<MorroviaFooter \/>/,
    "the builder should end with the normal Morrovia footer");
  assert.match(builder, /className=\{styles\.handoffContext\}><AlertTriangle/,
    "blocking context should have a visible icon rather than relying on red text");

  assert.match(styles, /\.homepageHandoff \.handoffOrigin/);
  assert.match(styles, /\.homepageHandoff \.routeCheck/);
  assert.match(styles, /@media\(max-width:520px\)[\s\S]*\.homepageHandoff \.handoffCta/,
    "the primary action should remain reachable at the narrowest supported width");
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
  assert.match(timeStep, /Remove one night from \$\{stop\.name\}; \$\{days\} nights currently/);
  assert.match(timeStep, /Add one night to \$\{stop\.name\}; \$\{days\} nights currently/);
  assert.match(timeStep, /Use the arrow keys to move this stop/,
    "the drag control should also support keyboard reordering");

  assert.match(builder, /candidate\?\.constraintsSatisfied \|\| score\?\.state !== "scored"/,
    "warning alternatives must come from scored, constraint-safe route candidates");
  assert.match(builder, /scheduleLocks\.stopIds\.length \|\| Object\.keys\(scheduleLocks\.arrivalDates\)\.length/,
    "route alternatives must not cross schedule locks");
  assert.match(timeStep, /There isn’t a validated alternative we can safely apply from here\./);
  assert.match(timeStep, /setStep\(0\); setHasPromptContext\(true\); setSummaryFocus\("stops"\)/,
    "the Review route fallback should return to the shared Places step with state intact");

  assert.match(builder, /Your trip at a glance/);
  assert.match(builder, /of \$\{totalNights\} nights planned/);
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
