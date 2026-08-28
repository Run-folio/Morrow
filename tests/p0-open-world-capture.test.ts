import assert from "node:assert/strict";
import test from "node:test";
import { captureJourneyBrief, captureJourneyBriefFromSemanticIntent, developmentJourneyCaptureDiagnostics } from "../lib/easyt/journey-capture.ts";
import type { PlaceIntelligenceProvider, PlaceProviderCandidate } from "../lib/easyt/place-intelligence.ts";
import {
  SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
  SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
  type SemanticTripIntent,
} from "../lib/easyt/semantic-trip-intent.ts";
import { SEMANTIC_INTENT_EXTRACTION_POLICY } from "../lib/easyt/openai-semantic-intent-request.ts";
import { preferredHandoffLocationChoice } from "../lib/easyt/home-trip-handoff.ts";

const promptA = "Denver, Dallas, Puerto Vallarta and Oaxaca, starting from Paris.";
const promptB = "Cusco, Rio, Buenos Aires, Calafate and Santiago from Madrid.";

function intent(
  origin: string | null,
  destinations: Array<string | { sourceText: string; interpretedText: string }>,
): SemanticTripIntent {
  return {
    schemaVersion: SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
    rawPromptVersion: SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
    origin: { sourceText: origin, certainty: origin ? "explicit" : null },
    duration: { sourceText: null, value: null, unit: null },
    explicitDateTexts: [],
    destinationCandidates: destinations.map((destination) => ({
      sourceText: typeof destination === "string" ? destination : destination.sourceText,
      interpretedText: typeof destination === "string" ? null : destination.interpretedText,
      role: "route-stop",
      certainty: "explicit",
    })),
    pointsOfInterest: [],
    transport: { departure: { sourceText: null, mode: null }, interStop: { sourceText: null, modes: [] }, avoid: [] },
    pace: { sourceText: null, value: null },
    interests: [],
    constraints: [],
    ambiguities: [],
    unresolvedMeaningfulText: [],
  };
}

const candidate = (
  providerId: string,
  canonicalName: string,
  country: string,
  placeType: PlaceProviderCandidate["placeType"] = "city",
  coordinates?: [number, number],
): PlaceProviderCandidate => ({
  providerId,
  canonicalName,
  placeType,
  parentCountries: [country],
  ...(coordinates ? { coordinates } : {}),
  routability: placeType === "city" || placeType === "town" ? "direct_destination" : "planning_area",
});

function fixtureProvider(requests: string[]): PlaceIntelligenceProvider {
  const responses: Record<string, PlaceProviderCandidate[]> = {
    denver: [candidate("denver", "Denver", "United States", "city", [-104.984862, 39.7392364])],
    dallas: [
      candidate("dallas", "Dallas", "United States", "city", [-96.7968559, 32.7762719]),
      candidate("dallas-county", "Dallas County", "United States", "region"),
    ],
    "puerto vallarta": [candidate("puerto-vallarta", "Puerto Vallarta", "Mexico")],
    oaxaca: [candidate("oaxaca", "Oaxaca", "Mexico")],
    rio: [
      candidate("rio-italy", "Rio", "Italy", "town", [10.40, 42.81]),
      candidate("rio-de-janeiro", "Rio de Janeiro", "Brazil", "city", [-43.17, -22.91]),
      candidate("rio-us", "Rio", "United States", "town", [-78.72, 39.22]),
    ],
    "rio de janeiro": [candidate("rio-de-janeiro", "Rio de Janeiro", "Brazil")],
    calafate: [
      candidate("el-calafate", "El Calafate", "Argentina", "town", [-72.27, -50.34]),
      candidate("calafate-brazil", "Calafate", "Brazil", "town", [-43.97, -19.92]),
      candidate("calafate-chile", "Los Calafates", "Chile", "town", [-70.86, -53.03]),
    ],
    "el calafate": [candidate("el-calafate", "El Calafate", "Argentina", "town")],
  };
  return {
    id: "global-fixture",
    label: "Global fixture gazetteer",
    lookup: async (phrase) => {
      requests.push(phrase);
      return responses[phrase.toLocaleLowerCase()] ?? [];
    },
  };
}

function builderProjection(capture: Awaited<ReturnType<typeof captureJourneyBriefFromSemanticIntent>>) {
  const origin = capture.mentions.find((mention) => mention.role === "origin" || mention.role === "fixed_start");
  const destinations = capture.mentions.filter((mention) => !["origin", "fixed_start", "excluded"].includes(mention.role));
  return {
    origin: origin?.canonicalName ?? null,
    destinations: destinations.map((mention) => mention.canonicalName),
    retained: destinations.map((mention) => mention.sourceText),
  };
}

test("deterministic list parsing retains every place and classifies Madrid as origin across punctuation variants", () => {
  assert.match(SEMANTIC_INTENT_EXTRACTION_POLICY, /common geographic shorthand/);
  const cases = [
    "Cusco, Rio, Buenos Aires, Calafate and Santiago from Madrid.",
    "Cusco, Rio de Janeiro, Buenos Aires, El Calafate, Santiago from Madrid.",
    "From Madrid: Cusco, Rio, Buenos Aires, Calafate, Santiago.",
    "Madrid to Cusco, Rio, Buenos Aires, Calafate and Santiago.",
  ];
  const expected = [
    ["Cusco", "Rio", "Buenos Aires", "Calafate", "Santiago", "Madrid"],
    ["Cusco", "Rio de Janeiro", "Buenos Aires", "El Calafate", "Santiago", "Madrid"],
    ["Madrid", "Cusco", "Rio", "Buenos Aires", "Calafate", "Santiago"],
    ["Madrid", "Cusco", "Rio", "Buenos Aires", "Calafate", "Santiago"],
  ];

  cases.forEach((rawPrompt, index) => {
    const capture = captureJourneyBrief(rawPrompt);
    assert.deepEqual(capture.mentions.map((mention) => mention.sourceText), expected[index]);
    assert.equal(capture.mentions.length, 6);
    assert.equal(capture.mentions.find((mention) => mention.sourceText === "Madrid")?.role, "origin");
    assert.equal(capture.mentionCoverage.expectedPlaceMentions, 6);
    assert.equal(capture.mentionCoverage.complete, true);
  });
});

test("deterministic coverage restores destinations omitted by a valid Luna response", async () => {
  const requests: string[] = [];
  const capture = await captureJourneyBriefFromSemanticIntent(
    promptA,
    intent("Paris", ["Denver", "Dallas"]),
    fixtureProvider(requests),
    {},
    { model: "gpt-5.6-luna", status: "completed" },
  );

  assert.deepEqual(capture.mentions.map((mention) => mention.sourceText), ["Denver", "Dallas", "Puerto Vallarta", "Oaxaca", "Paris"]);
  assert.deepEqual(requests, ["Denver", "Dallas", "Puerto Vallarta", "Oaxaca"]);
  assert.deepEqual(capture.mentionCoverage, {
    expectedPlaceMentions: 5,
    resolvedPlaceMentions: 5,
    routeIntentMentions: 5,
    missingFromResolution: [],
    missingFromStructuredBrief: [],
    complete: true,
  });
  assert.deepEqual(builderProjection(capture), {
    origin: "Paris",
    destinations: ["Denver", "Dallas", "Puerto Vallarta", "Oaxaca"],
    retained: ["Denver", "Dallas", "Puerto Vallarta", "Oaxaca"],
  });
  assert.equal(capture.mentions.find((mention) => mention.sourceText === "Dallas")?.status, "resolved");
  assert.equal(capture.semanticExtraction?.recoveredPlaceMentions, 2);
  const denver = capture.mentions.find((mention) => mention.sourceText === "Denver");
  assert.ok(denver);
  assert.deepEqual(preferredHandoffLocationChoice(denver, [{
    name: "Denver",
    country: "United States",
    coordinates: [-76.1371684, 40.2331483],
  }])?.coordinates, [-104.984862, 39.7392364]);
});

test("semantic lookup interpretations resolve colloquial names without replacing source evidence", async () => {
  const requests: string[] = [];
  const capture = await captureJourneyBriefFromSemanticIntent(
    promptB,
    intent(null, [
      { sourceText: "Rio", interpretedText: "Rio de Janeiro" },
      { sourceText: "Calafate", interpretedText: "El Calafate" },
      "Santiago",
    ]),
    fixtureProvider(requests),
  );

  assert.deepEqual(requests, ["Rio de Janeiro", "El Calafate"]);
  assert.deepEqual(capture.mentions.map((mention) => mention.sourceText), ["Cusco", "Rio", "Buenos Aires", "Calafate", "Santiago", "Madrid"]);
  assert.deepEqual(capture.mentions.map((mention) => mention.canonicalName), ["Cusco", "Rio de Janeiro", "Buenos Aires", "El Calafate", "Santiago", "Madrid"]);
  assert.deepEqual(capture.mentions.filter((mention) => mention.role !== "origin").map((mention) => mention.role), ["preferred", "preferred", "preferred", "preferred", "preferred"]);
  assert.deepEqual(capture.mentionCoverage, {
    expectedPlaceMentions: 6,
    resolvedPlaceMentions: 6,
    routeIntentMentions: 6,
    missingFromResolution: [],
    missingFromStructuredBrief: [],
    complete: true,
  });
  assert.deepEqual(builderProjection(capture), {
    origin: "Madrid",
    destinations: ["Cusco", "Rio de Janeiro", "Buenos Aires", "El Calafate", "Santiago"],
    retained: ["Cusco", "Rio", "Buenos Aires", "Calafate", "Santiago"],
  });
});

test("provider failure cannot reduce the deterministic destination inventory", async () => {
  const unavailable: PlaceIntelligenceProvider = { id: "offline", label: "Offline fixture", lookup: async () => [] };
  for (const [rawPrompt, semantic, count] of [
    [promptA, intent("Paris", ["Denver", "Dallas"]), 5],
    [promptB, intent(null, ["Rio", "Calafate", "Santiago"]), 6],
  ] as const) {
    const capture = await captureJourneyBriefFromSemanticIntent(rawPrompt, semantic, unavailable);
    assert.equal(capture.mentions.length, count);
    assert.equal(capture.structuredBrief.placeMentions?.length, count);
    assert.equal(capture.mentionCoverage.complete, true);
    assert.deepEqual(capture.mentionCoverage.missingFromResolution, []);
    assert.deepEqual(capture.mentionCoverage.missingFromStructuredBrief, []);
  }
});

test("development diagnostics trace every geographic span without logging the complete prompt", async () => {
  const semantic = intent("Paris", ["Denver", "Dallas"]);
  const capture = await captureJourneyBriefFromSemanticIntent(promptA, semantic, fixtureProvider([]));
  const diagnostics = developmentJourneyCaptureDiagnostics(semantic, capture);
  const serialized = JSON.stringify(diagnostics);

  assert.equal(serialized.includes(promptA), false);
  assert.deepEqual(diagnostics.mentions.map((mention) => mention.sourceText), ["Denver", "Dallas", "Puerto Vallarta", "Oaxaca", "Paris"]);
  assert.deepEqual(diagnostics.mentions.filter((mention) => !mention.lunaExtracted).map((mention) => mention.sourceText), ["Puerto Vallarta", "Oaxaca"]);
  assert.equal(diagnostics.mentions.every((mention) => mention.mentionCoverage.expected
    && mention.mentionCoverage.resolution && mention.mentionCoverage.structuredBrief), true);
  assert.deepEqual(diagnostics.mentions.find((mention) => mention.sourceText === "Dallas")?.resolverCandidates
    .map((candidate) => candidate.canonicalName), ["Dallas", "Dallas County"]);
});

test("twenty variable semantic captures retain every origin and destination", async () => {
  for (let run = 0; run < 10; run += 1) {
    const a = await captureJourneyBriefFromSemanticIntent(
      promptA,
      run % 2 ? intent("Paris", ["Denver", "Dallas"]) : intent(null, ["Puerto Vallarta", "Oaxaca"]),
      fixtureProvider([]),
    );
    const b = await captureJourneyBriefFromSemanticIntent(
      promptB,
      run % 2
        ? intent(null, [{ sourceText: "Rio", interpretedText: "Rio de Janeiro" }, { sourceText: "Calafate", interpretedText: "El Calafate" }, "Santiago"])
        : intent("Madrid", ["Cusco", "Buenos Aires"]),
      fixtureProvider([]),
    );
    assert.deepEqual(builderProjection(a), {
      origin: "Paris",
      destinations: ["Denver", "Dallas", "Puerto Vallarta", "Oaxaca"],
      retained: ["Denver", "Dallas", "Puerto Vallarta", "Oaxaca"],
    });
    assert.deepEqual(builderProjection(b).retained, ["Cusco", "Rio", "Buenos Aires", "Calafate", "Santiago"]);
    assert.equal(builderProjection(b).origin, "Madrid");
    assert.equal(a.mentionCoverage.complete && b.mentionCoverage.complete, true);
  }
});
