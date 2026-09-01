import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createLatestJourneyCaptureRequestGate,
  requestJourneyCapture,
} from "../lib/easyt/journey-capture-client.ts";
import { captureJourneyBriefWithProvider, type JourneyCaptureResult } from "../lib/easyt/journey-capture.ts";
import { routableHandoffMentions } from "../lib/easyt/home-trip-handoff.ts";
import type { PlaceIntelligenceProvider } from "../lib/easyt/place-intelligence.ts";

const SIX_STOP_PROMPT = "Cusco, Uyuni, La Paz, Lima, Huacachina and Salta for 2 travellers.";
const SIX_STOP_NAMES = ["Cusco", "Uyuni", "La Paz", "Lima", "Huacachina", "Salta"];

const supportedPlaces = new Map([
  ["cusco", { country: "Peru", coordinates: [-71.97, -13.53] as [number, number] }],
  ["uyuni", { country: "Bolivia", coordinates: [-66.83, -20.46] as [number, number] }],
  ["la paz", { country: "Bolivia", coordinates: [-68.12, -16.5] as [number, number] }],
  ["lima", { country: "Peru", coordinates: [-77.04, -12.05] as [number, number] }],
  ["huacachina", { country: "Peru", coordinates: [-75.77, -14.09] as [number, number] }],
  ["salta", { country: "Argentina", coordinates: [-65.42, -24.79] as [number, number] }],
]);

const sufficientEvidenceProvider: PlaceIntelligenceProvider = {
  id: "parity-fixture",
  label: "Parity fixture gazetteer",
  lookup: async (phrase) => {
    const place = supportedPlaces.get(phrase.toLocaleLowerCase());
    return place ? [{
      providerId: phrase.toLocaleLowerCase().replaceAll(" ", "-"),
      canonicalName: phrase,
      aliases: [],
      placeType: "city",
      parentCountries: [place.country],
      coordinates: place.coordinates,
      routability: "direct_destination",
      matchQuality: "exact",
      rankScore: 100,
    }] : [];
  },
};

function responseFetcher(capture: JourneyCaptureResult) {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { brief: SIX_STOP_PROMPT });
    return new Response(JSON.stringify(capture), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

function interpretationSemantics(capture: JourneyCaptureResult) {
  return {
    mentions: capture.mentions.map((mention) => ({
      sourceText: mention.sourceText,
      normalizedPhrase: mention.normalizedPhrase,
      canonicalName: mention.canonicalName,
      canonicalPlaceId: mention.canonicalPlaceId,
      status: mention.status,
      routability: mention.routability,
      confidence: {
        state: mention.confidence.state,
        level: mention.confidence.level,
        confirmationNeeded: mention.confidence.confirmation.needed,
      },
    })),
    destinations: capture.structuredBrief.destinations.map((destination) => ({
      name: destination.name,
      canonicalPlaceId: destination.canonicalPlaceId,
      resolutionStatus: destination.resolutionStatus,
      placeMentionId: destination.placeMentionId,
    })),
  };
}

test("Homepage and direct Builder use the same canonical capture request contract", () => {
  const homepage = readFileSync(new URL("../app/journey/home/home-trip-starter.tsx", import.meta.url), "utf8");
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");

  assert.match(homepage, /requestJourneyCapture\(tripBrief,/);
  assert.match(builder, /composeJourneyCaptureBrief\(/,
    "manual Builder controls should adapt into the shared capture request");
  assert.match(builder, /requestJourneyCapture\(brief,/);
  assert.doesNotMatch(builder, /captureJourneyBrief\(tripBrief\)/,
    "direct Builder capture must not bypass provider-enriched interpretation");
});

test("six-stop interpretation remains identical across entry points, cold/warm calls and repetition", async () => {
  const canonical = await captureJourneyBriefWithProvider(SIX_STOP_PROMPT, sufficientEvidenceProvider);
  const fetcher = responseFetcher(canonical);
  const expected = interpretationSemantics(canonical);

  for (let pass = 0; pass < 8; pass += 1) {
    const homepage = await requestJourneyCapture(SIX_STOP_PROMPT, { fetcher });
    const directBuilder = await requestJourneyCapture(SIX_STOP_PROMPT, { fetcher });
    assert.deepEqual(interpretationSemantics(homepage), expected);
    assert.deepEqual(interpretationSemantics(directBuilder), expected);
  }

  assert.deepEqual(canonical.mentions.map((mention) => mention.sourceText), SIX_STOP_NAMES,
    "capture must preserve the traveller's source order");
  assert.deepEqual(routableHandoffMentions(canonical.mentions).map((mention) => mention.canonicalName), SIX_STOP_NAMES,
    "all supported route stops must survive the capture-to-Builder boundary");
  assert.equal(canonical.mentions.every((mention) => mention.status === "resolved"), true);
  assert.equal(canonical.mentionCoverage.complete, true);
});

test("a delayed stale capture cannot replace a newer complete interpretation", async () => {
  const oldCapture = await captureJourneyBriefWithProvider("Cusco", sufficientEvidenceProvider);
  const newCapture = await captureJourneyBriefWithProvider(SIX_STOP_PROMPT, sufficientEvidenceProvider);
  let releaseOld: (() => void) | undefined;
  const oldBlocked = new Promise<void>((resolve) => { releaseOld = resolve; });
  const gate = createLatestJourneyCaptureRequestGate();
  let committed: string[] = [];

  const submit = async (brief: string, capture: JourneyCaptureResult, delayed = false) => {
    const request = gate.begin();
    const payload = await requestJourneyCapture(brief, {
      signal: request.signal,
      fetcher: async () => {
        if (delayed) await oldBlocked;
        return new Response(JSON.stringify(capture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });
    if (request.isCurrent()) committed = payload.mentions.map((mention) => mention.canonicalName);
    request.finish();
  };

  const oldSubmission = submit("Cusco", oldCapture, true);
  await submit(SIX_STOP_PROMPT, newCapture);
  releaseOld?.();
  await oldSubmission;

  assert.deepEqual(committed, SIX_STOP_NAMES);
});

test("genuinely ambiguous provider evidence still fails closed", async () => {
  const ambiguousProvider: PlaceIntelligenceProvider = {
    id: "ambiguous-fixture",
    label: "Ambiguous fixture gazetteer",
    lookup: async (phrase) => [
      { providerId: "first", canonicalName: phrase, placeType: "city", parentCountries: ["Country A"], coordinates: [1, 1], routability: "direct_destination", matchQuality: "exact", rankScore: 80 },
      { providerId: "second", canonicalName: phrase, placeType: "city", parentCountries: ["Country B"], coordinates: [40, 40], routability: "direct_destination", matchQuality: "exact", rankScore: 80 },
    ],
  };
  const capture = await captureJourneyBriefWithProvider("Springfield", ambiguousProvider);

  assert.equal(capture.mentions[0]?.status, "ambiguous");
  assert.equal(capture.mentions[0]?.canonicalPlaceId, undefined);
  assert.equal(capture.structuredBrief.placeIssues?.some((issue) => issue.code === "ambiguous_place" && issue.blocksRoute), true);
  assert.deepEqual(routableHandoffMentions(capture.mentions), []);
});

test("Homepage and direct Builder preserve the same recognised-region semantics", async () => {
  const provider: PlaceIntelligenceProvider = {
    id: "region-parity-fixture",
    label: "Region parity fixture",
    lookup: async (phrase) => phrase === "Scotland" ? [
      { providerId: "scotland-gb", canonicalName: "Scotland", placeType: "region", parentCountries: ["United Kingdom"], coordinates: [-4.11, 56.78], routability: "planning_area", matchQuality: "exact", rankScore: 80, geographicSignificance: 0.9 },
      { providerId: "scotland-texas", canonicalName: "Scotland", placeType: "town", parentCountries: ["United States"], parentRegionId: "Texas", coordinates: [-98.47, 33.66], routability: "direct_destination", matchQuality: "exact", rankScore: 145 },
    ] : [],
  };
  const brief = "Scotland";
  const canonical = await captureJourneyBriefWithProvider(brief, provider);
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { brief });
    return new Response(JSON.stringify(canonical), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const homepage = await requestJourneyCapture(brief, { fetcher });
  const directBuilder = await requestJourneyCapture(brief, { fetcher });

  assert.deepEqual(interpretationSemantics(homepage), interpretationSemantics(directBuilder));
  assert.equal(homepage.mentions[0]?.canonicalName, "Scotland");
  assert.equal(homepage.mentions[0]?.routability, "planning_area");
  assert.equal(homepage.mentions[0]?.requiresBaseSelection, true);
  assert.deepEqual(routableHandoffMentions(homepage.mentions), []);
});
