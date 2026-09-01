import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  appendVoiceTranscript,
  finalSpeechTranscript,
  speechFailureKind,
} from "../lib/easyt/speech-recognition.ts";
import {
  acknowledgeSpeechDisclosure,
  SPEECH_DISCLOSURE_ACKNOWLEDGEMENT_KEY,
  speechDisclosureAcknowledged,
} from "../lib/easyt/speech-disclosure.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Luna is identified as AI with a restrained limitation at the interaction boundary", () => {
  const copilot = source("components/easyt/easyt-trip-copilot.tsx");
  const itinerary = source("components/easyt/trip-itinerary-workspace.tsx");
  assert.match(copilot, /Luna · AI travel assistant/);
  assert.match(copilot, /Luna can make mistakes/);
  assert.match(copilot, /Verify important schedules, availability, prices, entry requirements and safety information/);
  assert.match(copilot, /A suggested change only takes effect after you apply it/);
  assert.match(itinerary, /Ask Luna · AI/);
});

test("Luna explains its reduced OpenAI context without overstating store false", () => {
  const copilot = source("components/easyt/easyt-trip-copilot.tsx");
  assert.match(copilot, /How Luna uses your trip/);
  assert.match(copilot, /reduced view of this trip may be sent to OpenAI/);
  assert.match(copilot, /The full canonical trip record is not sent/);
  assert.match(copilot, /store:false, but that setting does not guarantee zero provider retention/);
  assert.match(copilot, /\/journey\/privacy#ai-and-speech/);
});

test("Luna suggestions remain inert until the separate explicit Apply path", () => {
  const client = source("components/easyt/easyt-trip-copilot.tsx");
  const interpretationRoute = source("app/api/easyt/trips/[tripId]/copilot/route.ts");
  assert.match(client, /Review proposed change/);
  assert.match(client, /onClick=\{\(\) => void applyPreview\(\)\}/);
  assert.match(client, /\/copilot\/actions\/\$\{actionPath\}\/apply/);
  assert.doesNotMatch(interpretationRoute, /saveTripForOwner|applyConfirmedTripCopilotPreview/);
});

test("default trip capture removes persistent legal copy and keeps compact transparency affordances", () => {
  const capture = source("components/easyt/morrovia-trip-capture.tsx");
  const voice = source("components/easyt/voice-trip-brief.tsx");
  assert.doesNotMatch(capture, /className=\{styles\.speechDisclosure\}/);
  assert.doesNotMatch(capture, /className=\{styles\.aiDisclosure\}/);
  assert.doesNotMatch(capture, /up to 600 characters/);
  assert.match(capture, /aiLabel: "AI-assisted"/);
  assert.match(capture, /triggerLabel=\{text\.aiLabel\}/);
  assert.match(voice, /Your browser’s speech-recognition service turns what you say into editable text/);
  assert.match(voice, /browser or speech provider may process the audio/);
  assert.match(voice, /Morrovia receives the resulting transcript/);
  assert.match(voice, /linkHref="\/journey\/privacy#ai-and-speech"/);
  assert.match(capture, /linkHref="\/journey\/privacy#ai-and-speech"/);
});

test("speech disclosure gates only first use and remains reopenable", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  assert.equal(speechDisclosureAcknowledged(storage), false);
  acknowledgeSpeechDisclosure(storage);
  assert.equal(speechDisclosureAcknowledged(storage), true);
  assert.deepEqual([...values.entries()], [[SPEECH_DISCLOSURE_ACKNOWLEDGEMENT_KEY, "1"]]);

  const voice = source("components/easyt/voice-trip-brief.tsx");
  assert.match(voice, /if \(!disclosureAcknowledged\) \{[\s\S]*setDisclosureOpen\(true\)/);
  assert.match(voice, /acknowledgeSpeechDisclosure\(window\.localStorage\)/);
  assert.match(voice, /setDisclosureAcknowledged\(true\)/);
  assert.match(voice, /triggerLabel=\{text\.info\}/);
  assert.match(voice, /data-disclosure-autofocus="true"/);
  assert.match(voice, /onClick=\{confirmStart\}/);
  assert.match(voice, /const confirmStart = \(\) => \{[\s\S]*start\(\)/);
});

test("final one-shot speech results produce an editable transcript", () => {
  const transcript = finalSpeechTranscript({
    resultIndex: 1,
    results: [
      { 0: { transcript: "ignored interim" }, isFinal: false },
      { 0: { transcript: "  Lisbon and Porto " }, isFinal: true },
      { 0: { transcript: " by train " }, isFinal: true },
    ],
  });
  assert.equal(transcript, "Lisbon and Porto by train");
  assert.equal(appendVoiceTranscript("Two weeks from Madrid", transcript), "Two weeks from Madrid Lisbon and Porto by train");
  assert.equal(appendVoiceTranscript("Two weeks from Madrid  ", "then Porto"), "Two weeks from Madrid then Porto");
});

test("speech failure states are useful and do not alter existing typed text", () => {
  assert.equal(speechFailureKind("not-allowed"), "blocked");
  assert.equal(speechFailureKind("service-not-allowed"), "blocked");
  assert.equal(speechFailureKind("no-speech"), "noSpeech");
  assert.equal(speechFailureKind("network"), "unavailable");
  assert.equal(appendVoiceTranscript("Keep this typed trip", ""), "Keep this typed trip");

  const voice = source("components/easyt/voice-trip-brief.tsx");
  assert.match(voice, /Microphone access was blocked\. You can keep typing/);
  assert.match(voice, /Speech input isn’t available in this browser\. You can keep typing/);
  assert.match(voice, /We didn’t catch that\. Try again or type your trip/);
  assert.doesNotMatch(voice, /onerror[\s\S]{0,240}onTranscriptRef\.current/);
});

test("speech only updates the editable field and never submits automatically", () => {
  const voice = source("components/easyt/voice-trip-brief.tsx");
  const capture = source("components/easyt/morrovia-trip-capture.tsx");
  assert.match(voice, /onTranscriptRef\.current\(transcript\)/);
  assert.doesNotMatch(voice, /submit|requestSubmit|onSubmit/);
  assert.match(capture, /updateValue\(appendVoiceTranscript\(value, transcript\), "voice"\)/);
});

test("AI and speech content is absent from analytics and runtime logs", () => {
  const analytics = source("lib/analytics.ts");
  const voice = source("components/easyt/voice-trip-brief.tsx");
  const copilot = source("components/easyt/easyt-trip-copilot.tsx");
  const captureRoute = source("app/api/journey-capture/route.ts");
  assert.doesNotMatch(voice, /trackEvent|posthog|gtag|console\./i);
  assert.doesNotMatch(copilot, /trackEvent|posthog|gtag|console\./i);
  assert.doesNotMatch(analytics, /speech_transcript|luna_question|luna_answer|trip_prompt/);
  assert.doesNotMatch(captureRoute, /JSON\.stringify\(developmentJourneyCaptureDiagnostics/);
  assert.doesNotMatch(captureRoute, /console\.info\([^\n]*\bbrief\b/);
  assert.doesNotMatch(SPEECH_DISCLOSURE_ACKNOWLEDGEMENT_KEY, /analytics|consent|posthog/i);
});

test("contextual disclosure supports mouse, touch, keyboard dismissal and screen readers", () => {
  const feedback = source("components/easyt/morrovia-feedback.tsx");
  assert.match(feedback, /aria-haspopup="dialog"/);
  assert.match(feedback, /role="dialog"/);
  assert.match(feedback, /aria-modal="false"/);
  assert.match(feedback, /document\.addEventListener\("pointerdown"/);
  assert.match(feedback, /event\.key !== "Escape"/);
  assert.match(feedback, /aria-labelledby=\{titleId\}/);
  assert.match(feedback, /aria-describedby=\{detailId\}/);
});

test("trip submission and typed-value ownership remain unchanged", () => {
  const capture = source("components/easyt/morrovia-trip-capture.tsx");
  assert.match(capture, /if \(disabled \|\| loading \|\| !value\.trim\(\)\) return/);
  assert.match(capture, /void onSubmit\(\)/);
  assert.match(capture, /value=\{value\}/);
  assert.match(capture, /onChange=\{\(event\) => updateValue\(event\.target\.value, "text"\)\}/);
});

test("Privacy includes factual AI and speech sections and provider uncertainty", () => {
  const privacy = source("app/journey/privacy/privacy-notice.tsx");
  assert.match(privacy, /id="ai-and-speech"/);
  assert.match(privacy, /server-side OpenAI Responses API/);
  assert.match(privacy, /does not prove that provider retention is zero/);
  assert.match(privacy, /SpeechRecognition or webkitSpeechRecognition/);
  assert.match(privacy, /cannot prove that speech audio stays on-device/);
});

test("Storybook covers Luna answer, proposal, provider failure, mobile and trip-capture transparency states", () => {
  const lunaStories = source("components/easyt/easyt-trip-copilot.stories.tsx");
  const captureStories = source("components/easyt/morrovia-trip-capture.stories.tsx");
  for (const state of ["NormalAnswer", "ProposedChange", "ProviderFailure", "Mobile390"]) assert.match(lunaStories, new RegExp(`export const ${state}`));
  assert.match(captureStories, /export const AIAndSpeechTransparency/);
});
