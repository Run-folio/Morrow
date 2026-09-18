import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const captureSource = readFileSync(new URL("../components/easyt/morrovia-trip-capture.tsx", import.meta.url), "utf8");
const captureStyles = readFileSync(new URL("../components/easyt/morrovia-trip-capture.module.css", import.meta.url), "utf8");
const captureStories = readFileSync(new URL("../components/easyt/morrovia-trip-capture.stories.tsx", import.meta.url), "utf8");
const voiceSource = readFileSync(new URL("../components/easyt/voice-trip-brief.tsx", import.meta.url), "utf8");
const immersiveSource = readFileSync(new URL("../app/journey/home/immersive/immersive-home.tsx", import.meta.url), "utf8");
const immersiveStyles = readFileSync(new URL("../app/journey/home/immersive/immersive.module.css", import.meta.url), "utf8");
const routeChaptersSource = readFileSync(new URL("../app/journey/home/immersive/route-chapters.tsx", import.meta.url), "utf8");
const immersiveStories = readFileSync(new URL("../app/journey/home/immersive/immersive-home.stories.tsx", import.meta.url), "utf8");

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
  assert.match(immersiveSource, /<HomepageRouteInspiration routes=\{routes\}\s*\/>[\s\S]*<HomepageHowItWorks\s*\/>[\s\S]*<RouteChapters/);
});

test("dual-entry hero is full-height, wide, and may grow with open planner panels", () => {
  assert.match(immersiveStyles, /\.heroDualEntry\s*\{[^}]*min-height:\s*100svh/);
  assert.doesNotMatch(immersiveStyles.match(/\.heroDualEntry\s*\{[^}]*\}/)?.[0] ?? "", /overflow:\s*(?:hidden|clip)/);
  assert.match(immersiveStyles, /\.heroDecorative\s*\{[^}]*overflow:\s*clip/);
  assert.match(immersiveStyles, /\.heroDualEntry[\s\S]*\.heroBodyDualEntry[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(immersiveSource, /Plan multi-stop trips with suggested routes, places to stay and things to do\. Then make the plan your own\./);
  assert.match(immersiveStories, /FullComposition/);
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
  assert.match(immersiveStories, /<ImmersiveHome routes=\{routes\} initialIndex=\{previewRouteIndex\}\s*\/>/);
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
  assert.match(captureStyles, /\.wideMainRow \{ grid-template-columns: 1fr; \}/);
  assert.match(captureStyles, /\.wideSegmentGroup \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); \}/);
});
