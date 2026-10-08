import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const captureSource = readFileSync(new URL("../components/easyt/morrovia-trip-capture.tsx", import.meta.url), "utf8");
const captureStyles = readFileSync(new URL("../components/easyt/morrovia-trip-capture.module.css", import.meta.url), "utf8");
const captureStories = readFileSync(new URL("../components/easyt/morrovia-trip-capture.stories.tsx", import.meta.url), "utf8");
const voiceSource = readFileSync(new URL("../components/easyt/voice-trip-brief.tsx", import.meta.url), "utf8");
const immersiveSource = readFileSync(new URL("../app/journey/home/immersive/immersive-home.tsx", import.meta.url), "utf8");
const homeTripStarterSource = readFileSync(new URL("../app/journey/home/home-trip-starter.tsx", import.meta.url), "utf8");
const immersiveStyles = readFileSync(new URL("../app/journey/home/immersive/immersive.module.css", import.meta.url), "utf8");
const routeChaptersSource = readFileSync(new URL("../app/journey/home/immersive/route-chapters.tsx", import.meta.url), "utf8");
const immersiveStories = readFileSync(new URL("../app/journey/home/immersive/immersive-home.stories.tsx", import.meta.url), "utf8");

test("approved planner composition keeps origin and type visible and preflights before reservation", () => {
  assert.match(captureSource, /planner\?:/);
  assert.match(captureSource, /planner\.originEntry/);
  assert.match(captureSource, /planner\.tripTypeControl/);
  assert.match(captureSource, /planner\.routeSummary/);
  assert.match(homeTripStarterSource, /MorroviaConfirmationDialog/);
  assert.match(homeTripStarterSource, /homepagePreflightIssues\(submitted/);
  assert.ok(homeTripStarterSource.indexOf("homepagePreflightIssues(submitted") < homeTripStarterSource.indexOf("const committed = await reservePendingDescribeHandoff"));
  assert.doesNotMatch(homeTripStarterSource, /<JourneyEndpointsEditor/);
  const controls = readFileSync(new URL("../components/easyt/easyt-controls.tsx", import.meta.url), "utf8");
  assert.match(controls.slice(controls.indexOf("export function EasyTSegmentedControl")), /disabled=\{disabled\}/);
});

test("wide capture is opt-in without removing the canonical capture owner", () => {
  assert.match(captureSource, /homepageEntry\?/);
  assert.match(captureSource, /VoiceTripBrief/);
  assert.match(captureSource, /MorroviaDatePicker/);
});

test("voice recognition cannot deliver a delayed transcript after Describe unmounts", () => {
  assert.match(voiceSource, /recognition\.onresult = null/);
  assert.match(voiceSource, /recognition\.onend = null/);
  assert.match(voiceSource, /!mountedRef\.current \|\| disabledRef\.current \|\| recognitionRef\.current !== recognition/);
  assert.match(captureStories, /WideHomepageDelayedVoiceAfterUnmount/);
  assert.match(captureStories, /Delayed voice result changed the unmounted Describe prompt/);
});

test("voice recognition is disabled and detached when loading starts", () => {
  assert.match(voiceSource, /disabled\?: boolean/);
  assert.match(voiceSource, /disabledRef\.current/);
  assert.match(voiceSource, /recognition\.onresult = null/);
  assert.match(captureSource, /disabled=\{disabled \|\| loading\}/);
  assert.match(captureStories, /WideHomepageDelayedVoiceAfterLoading/);
  assert.match(captureStories, /Delayed voice result changed the loading Describe prompt/);
});

test("wide capture keeps one form and one primary submit", () => {
  assert.equal((captureSource.match(/<form\b/g) ?? []).length, 1);
  assert.match(captureSource, /homepageEntry\s*\?\s*<div/);
  assert.match(captureSource, /homepageEntry\.mode === "stops"\s*\?\s*<>/);
  assert.match(captureSource, /homepageEntry\.destinationEntry/);
  assert.match(captureSource, /destinationEditorOpen/);
});

test("Homepage destination intents and expanded details precede its primary action", () => {
  const plannerStart = captureSource.indexOf('<div className={styles.plannerFields} data-home-route-fields>');
  assert.ok(plannerStart >= 0, 'the connected route field owner is present');
  const planner = captureSource.slice(plannerStart, captureSource.indexOf('      </> : <>', plannerStart));
  assert.ok(planner.indexOf("planner.originEntry") < planner.indexOf("homepageEntry.destinationEditor"));
  assert.ok(planner.indexOf("homepageEntry.destinationEditor") < planner.indexOf("{homepageDates}"));
  assert.ok(planner.indexOf("{homepageDates}") < planner.indexOf("{homepagePersonalize}"));
  assert.ok(planner.indexOf("{homepagePersonalizePanel}") < planner.indexOf("{homepageAction}"));
});

test("expanded Homepage details precede the single primary action in both modes", () => {
  const cardMarkup = captureSource.slice(captureSource.indexOf("{homepageEntry ? <div"), captureSource.indexOf(": <div className={`${styles.card}"));
  const stopsPersonalization = cardMarkup.indexOf("{homepagePersonalizePanel}");
  const stopsAction = cardMarkup.indexOf("{homepageAction}");
  const describeAction = cardMarkup.indexOf("{homepageAction}", stopsAction + 1);
  const describePersonalization = cardMarkup.indexOf("{homepagePersonalizePanel}", stopsPersonalization + 1);

  assert.ok(stopsPersonalization >= 0 && describePersonalization > stopsPersonalization, "Both modes must render the expanded Personalize panel");
  assert.ok(stopsAction >= 0 && stopsPersonalization < stopsAction,
    "Stops mode must put its DOM action after the expanded Personalize panel");
  assert.ok(describeAction >= 0 && describePersonalization < describeAction,
    "Describe mode must put its DOM action after the expanded Personalize panel");
  assert.equal((cardMarkup.match(/<EasyTButton type="submit"/g) ?? []).length, 0,
    "Homepage must keep the single submit action owned by submitAction");
});

test("mobile destination editor leaves clear space before Homepage dates", () => {
  assert.match(captureStyles, /@media \(max-width: 720px\)[\s\S]*?\.wideDestinationEditor \+ \.wideDatePicker \{ margin-top: 14px; \}/);
});

test("wide capture stories exercise keyboard and click tabs plus retained personalization", () => {
  assert.match(captureStories, /WideHomepageCapture/);
  assert.match(captureStories, /new KeyboardEvent\("keydown", \{ key: "ArrowRight"/);
  assert.match(captureStories, /getAttribute\("aria-selected"\)/);
  assert.match(captureStories, /retained interest/);
  assert.match(captureStories, /retained dates/);
});

test("the connected dual-entry homepage is the only production composition", () => {
  assert.doesNotMatch(immersiveSource, /presentation\?:|plannerSlot\?:|dualEntry/);
  assert.match(immersiveSource, /<HomeTripStarter\s*\/>/);
  assert.match(immersiveSource, /<EasyTNavigation current="home" landing logoTone="light" deferPrefetch\s*\/>/);
  assert.match(immersiveSource, /<HomepageRouteInspiration routes=\{routes\} previewRoutes=\{previewRoutes\}\s*\/>[\s\S]*<HomepageHowItWorks\s*\/>[\s\S]*<RouteChapters/);
});

test("dual-entry hero is compact on desktop and may grow with open planner panels", () => {
  assert.match(immersiveStyles, /\.heroDualEntry\s*\{[^}]*min-height:\s*clamp\(650px,74svh,760px\)/);
  assert.doesNotMatch(immersiveStyles.match(/\.heroDualEntry\s*\{[^}]*\}/)?.[0] ?? "", /min-height:\s*100svh/);
  assert.doesNotMatch(immersiveStyles.match(/\.heroDualEntry\s*\{[^}]*\}/)?.[0] ?? "", /overflow:\s*(?:hidden|clip)/);
  assert.match(immersiveStyles, /\.heroDecorative\s*\{[^}]*overflow:\s*clip/);
  assert.match(immersiveStyles, /\.heroDualEntry[\s\S]*\.heroBodyDualEntry[\s\S]*width:min\(1400px,calc\(100% - 80px\)\)/);
  assert.match(immersiveSource, /Plan your route, stays and activities, all in one place\./);
  assert.match(immersiveStories, /FullComposition/);
});

test("#390 hero uses one heading with the approved two-part promise and no eyebrow", () => {
  const hero = immersiveSource.slice(immersiveSource.indexOf('<div className={styles.heroCopy}>'), immersiveSource.indexOf('<div className={styles.planner}>'));
  assert.equal((hero.match(/<h1\b/g) ?? []).length, 1);
  assert.match(hero, /<h1><span>\{es \? "Viajes con varias paradas," : "Multi-stop trips,"\}<\/span><span className=\{styles\.heroEmphasis\}>\{es \? "hechos sencillos\." : "made simple\."\}<\/span><\/h1>/);
  assert.doesNotMatch(hero, /styles\.eyebrow/);
  assert.match(hero, /Plan your route, stays and activities, all in one place\./);
  assert.match(immersiveStyles, /\.heroEmphasis\s*\{[^}]*font-family:\s*var\(--morrovia-display\)[^}]*font-style:\s*italic/);
});

test("Homepage planner gives its two entry modes and compact destination a clear hierarchy", () => {
  assert.match(captureStyles, /\.modeTab \{[^}]*min-height: 48px[^}]*font: 700 14px\/1\.2 var\(--morrovia-ui\)/);
  assert.match(captureStyles, /\.modeTab\[aria-selected="true"\]::after \{[^}]*height: 3px[^}]*background: var\(--morrovia-action\)/);
  assert.match(captureSource, /className=\{styles\.destinationLabel\}[\s\S]*text\.destinationLabel[\s\S]*homepageEntry\.destinationEntry/);
  assert.match(captureSource, /icon=\{homepageEntry \? Search : undefined\}/);
  assert.match(homeTripStarterSource, /Add your first stop/);
});

test("Route Chapters always retains the independent lower story without recreating the route selector", () => {
  assert.doesNotMatch(routeChaptersSource, /showIntroduction|<section id="routes"/);
  assert.match(routeChaptersSource, /<section id="route-story"/);
  assert.match(routeChaptersSource, /\{children\?\.\(route, change, index\)\}/);
  assert.match(routeChaptersSource, /chapter = "route-story"/);
});

test("full composition story protects one nav, planner, anchors, and route-story independence", () => {
  assert.match(immersiveStories, /FullComposition/);
  assert.match(immersiveStories, /querySelectorAll\([^)]*header\[data-easyt-app\]/);
  assert.match(immersiveStories, /querySelectorAll\([^)]*#routes/);
  assert.match(immersiveStories, /querySelector\([^)]*#start-building/);
  for (const anchor of ["#route-story", "#product", "#booking-support", "#closing"]) assert.match(immersiveStories, new RegExp(anchor.replace("#", "#")));
  assert.match(immersiveStories, /Card focus\/hover changed Route Story/);
  assert.match(immersiveStories, /Card click changed Route Story/);
});

test("homepage stories use the real connected owner and canonical hierarchy", () => {
  assert.match(immersiveStories, /title: "Morrovia\/05 Product Patterns\/Homepage dual entry"/);
  assert.doesNotMatch(immersiveStories, /initialImmersiveRouteIndex/);
  assert.match(immersiveStories, /const previewRouteIndex =/);
  assert.match(immersiveStories, /const previewRoutes = discoveryCatalogue\(\)/);
  assert.match(immersiveStories, /args: \{ routes, previewRoutes, initialIndex: previewRouteIndex \}/);
  assert.match(immersiveStories, /<ImmersiveHome routes=\{routes\} previewRoutes=\{previewRoutes\} initialIndex=\{previewRouteIndex\}\s*\/>/);
  assert.doesNotMatch(immersiveStories, /PreviewPlanner|plannerSlot|presentation="dual-entry"/);
});

test("wide capture disables every opt-in control while loading", () => {
  assert.match(captureSource, /className=\{styles\.modeTab\}[\s\S]*disabled=\{disabled \|\| loading\}/);
  assert.match(captureSource, /className=\{styles\.wideDatePicker\}[\s\S]*disabled=\{disabled \|\| loading\}/);
  assert.match(captureSource, /className=\{styles\.personalizeToggle\}[\s\S]*disabled=\{disabled \|\| loading\}/);
  assert.match(captureSource, /className=\{styles\.destinationToggle\}[\s\S]*disabled=\{disabled \|\| loading\}/);
  assert.match(captureSource, /aria-pressed=\{homepageEntry\.budget === budget\}[\s\S]*disabled=\{disabled \|\| loading\}/);
});

test("wide capture stacks its compact segment group before it overflows", () => {
  assert.match(captureStyles, /@media \(max-width: 1100px\) and \(min-width: 721px\)/);
  assert.match(captureStyles, /\.wideHomeLayout \{ grid-template-columns: minmax\(0, 1fr\); grid-template-areas: "controls" "action"; \}/);
  assert.match(captureStyles, /\.wideHomeLayoutPersonalized \{ grid-template-areas: "controls" "personalize" "action"; \}/);
  assert.match(captureStyles, /@media \(max-width: 720px\)[\s\S]*?\.wideHomeLayoutPersonalized \{ grid-template-areas: "controls" "personalize" "action"; \}/);
  assert.match(captureStyles, /\.wideSegmentGroup \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); \}/);
});

test("expanded Homepage personalization keeps labels and controls on one desktop grid", () => {
  assert.match(captureStyles, /\.personalizePanel \{[^}]*align-items:start/);
  assert.match(captureStyles, /--homepage-personalize-control-height:50px/);
  assert.match(captureStyles, /\.personalizeEndpoints :global\(\[class\*="journey-endpoints-editor_fields"\]\) \{ align-items:start; \}/);
  assert.match(captureStyles, /\.budgetChoices button \{ min-height:var\(--homepage-personalize-control-height\);/);
});

test("Homepage inspiration and How it works retain the wide page-local container", () => {
  assert.match(immersiveStyles, /\.inspiration,\.howItWorks \{ width:min\(1400px,calc\(100% - 48px\)\);/);
  assert.match(immersiveStyles, /\.inspirationGrid \{ display:grid; grid-template-columns:repeat\(7,minmax\(0,1fr\)\);/);
  assert.match(immersiveStyles, /\.howSteps \{ display:grid; grid-template-columns:repeat\(3,minmax\(0,1fr\)\);/);
});
