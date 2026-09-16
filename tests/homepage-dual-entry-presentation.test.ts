import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const captureSource = readFileSync(new URL("../components/easyt/morrovia-trip-capture.tsx", import.meta.url), "utf8");
const captureStories = readFileSync(new URL("../components/easyt/morrovia-trip-capture.stories.tsx", import.meta.url), "utf8");
const voiceSource = readFileSync(new URL("../components/easyt/voice-trip-brief.tsx", import.meta.url), "utf8");

test("wide capture is opt-in without removing the canonical capture owner", () => {
  assert.match(captureSource, /homepageEntry\?/);
  assert.match(captureSource, /VoiceTripBrief/);
  assert.match(captureSource, /MorroviaDatePicker/);
});

test("voice recognition cannot deliver a delayed transcript after Describe unmounts", () => {
  assert.match(voiceSource, /recognition\.onresult = null/);
  assert.match(voiceSource, /recognition\.onend = null/);
  assert.match(voiceSource, /!mountedRef\.current \|\| recognitionRef\.current !== recognition/);
  assert.match(captureStories, /WideHomepageDelayedVoiceAfterUnmount/);
  assert.match(captureStories, /Delayed voice result changed the unmounted Describe prompt/);
});

test("wide capture keeps one form and one primary submit", () => {
  assert.equal((captureSource.match(/<form\b/g) ?? []).length, 1);
  assert.match(captureSource, /homepageEntry\s*\?\s*<div/);
  assert.match(captureSource, /homepageEntry\.mode === "stops"\s*\?\s*homepageEntry\.destinationEntry\s*:\s*promptField/);
});

test("wide capture stories exercise keyboard and click tabs plus retained personalization", () => {
  assert.match(captureStories, /WideHomepageCapture/);
  assert.match(captureStories, /new KeyboardEvent\("keydown", \{ key: "ArrowRight"/);
  assert.match(captureStories, /getAttribute\("aria-selected"\)/);
  assert.match(captureStories, /retained interest/);
  assert.match(captureStories, /retained dates/);
});
