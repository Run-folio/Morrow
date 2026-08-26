import assert from "node:assert/strict";
import test from "node:test";
import {
  captureJourneyBrief,
  captureJourneyBriefWithProvider,
} from "../lib/easyt/journey-capture.ts";
import {
  createHomeTripDraft,
  HOME_TRIP_DRAFT_KEY,
  homeTripDraftTimingFlexibility,
  removeHomeTripDraftIfDurable,
  resolveHandoffBatch,
  routableHandoffMentions,
  type HomeTripDraft,
} from "../lib/easyt/home-trip-handoff.ts";
import type { PlaceIntelligenceProvider } from "../lib/easyt/place-intelligence.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";
import { PROMPT_CAPTURE_REGRESSION_CASES } from "./fixtures/prompt-capture-regression.ts";

const CALENDAR_AND_PREFERENCE_WORDS = [
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
  "Spring", "Summer", "Autumn", "Fall", "Winter", "Food", "Keep the", "Culture", "Nature", "Hiking",
];

test("private-beta prompt regression cards keep deterministic capture facts and unknowns honest", () => {
  assert.ok(PROMPT_CAPTURE_REGRESSION_CASES.length >= 15);

  for (const fixture of PROMPT_CAPTURE_REGRESSION_CASES) {
    assert.ok(fixture.rawPrompt.length > 0, `${fixture.id} needs raw traveller prose`);
    assert.ok(fixture.acceptableVariations.length > 0, `${fixture.id} needs acceptable variations`);
    assert.ok(fixture.prohibitedOutcomes.length > 0, `${fixture.id} needs prohibited outcomes`);
    assert.ok(fixture.failureBoundary, `${fixture.id} needs a failure boundary`);
    if (fixture.providerScenario) continue;

    const first = captureJourneyBrief(fixture.rawPrompt);
    const second = captureJourneyBrief(fixture.rawPrompt);
    const required = fixture.requiredHardFacts;
    const ids = first.mentions.flatMap((mention) => mention.canonicalPlaceId ? [mention.canonicalPlaceId] : []);
    const routeIds = routableHandoffMentions(first.mentions).flatMap((mention) => mention.canonicalPlaceId ? [mention.canonicalPlaceId] : []);
    const hardConstraints = first.structuredBrief.hardConstraints.map((constraint) => constraint.type);
    const softPreferences = first.structuredBrief.softPreferences.map((preference) => `${preference.type}:${preference.value}`);
    const issueCodes = first.structuredBrief.placeIssues?.map((issue) => issue.code) ?? [];
    const origin = first.mentions.find((mention) => mention.role === "origin");
    const unresolvedTexts = first.mentions.filter((mention) => mention.status === "unresolved").map((mention) => mention.sourceText);

    assert.equal(first.rawBrief, fixture.rawPrompt, `${fixture.id} changed the raw brief`);
    assert.equal(first.structuredBrief.source.rawPrompt, fixture.rawPrompt, `${fixture.id} lost source provenance`);
    assert.deepEqual(first, second, `${fixture.id} capture became nondeterministic`);
    assert.equal(required.durationDays === undefined || first.durationDays === required.durationDays, true, `${fixture.id} lost duration`);
    assert.equal(required.duration === undefined || (first.structuredBrief.duration?.value === required.duration.value && first.structuredBrief.duration.unit === required.duration.unit), true, `${fixture.id} changed stated duration`);
    assert.equal((required.canonicalPlaceIds ?? []).every((id) => ids.includes(id)), true, `${fixture.id} lost resolved geography`);
    assert.equal((required.routablePlaceIds ?? []).every((id) => routeIds.includes(id)), true, `${fixture.id} lost usable route geography`);
    assert.equal((required.hardConstraints ?? []).every((type) => hardConstraints.includes(type as typeof hardConstraints[number])), true, `${fixture.id} lost a hard constraint`);
    assert.equal((required.softPreferences ?? []).every((preference) => softPreferences.includes(preference)), true, `${fixture.id} lost a soft preference`);
    assert.equal(required.datesMustRemainUnknown !== true || (!first.structuredBrief.dates.start && !first.structuredBrief.dates.end && !first.structuredBrief.dates.fixed), true, `${fixture.id} invented fixed dates`);
    assert.equal(required.originCanonicalPlaceId === undefined || origin?.canonicalPlaceId === required.originCanonicalPlaceId, true, `${fixture.id} lost its departure origin`);
    assert.equal((required.preservedUnresolvedTexts ?? []).every((sourceText) => unresolvedTexts.includes(sourceText)), true, `${fixture.id} silently dropped reviewable text`);
    assert.equal(fixture.expectedAmbiguityWarnings.every((code) => issueCodes.includes(code as typeof issueCodes[number])), true, `${fixture.id} lost reviewable ambiguity`);
  }
});

test("homepage serialization preserves the exact authoritative capture payload", () => {
  const raw = "paris, porto, rome, colusseum, pathanon, athen for 3 wks, flying from london";
  const requestBody = JSON.parse(JSON.stringify({ brief: raw })) as { brief: string };
  const capture = captureJourneyBrief(requestBody.brief);
  const draft = createHomeTripDraft({
    capture,
    handoffId: "homepage-regression",
    datesExplicit: false,
    startDate: "2026-08-25",
    endDate: "2026-08-31",
    travellers: 2,
    travellersExplicit: false,
    interests: [],
  });
  const persisted = JSON.parse(JSON.stringify(draft)) as HomeTripDraft;

  assert.equal(requestBody.brief, raw);
  assert.equal(capture.rawBrief, raw);
  assert.equal(capture.structuredBrief.source.rawPrompt, raw);
  assert.equal(persisted.brief, raw);
  assert.equal(persisted.structuredBrief?.source.rawPrompt, raw);
  assert.equal(persisted.structuredBrief?.placeMentions?.find((mention) => mention.role === "origin")?.canonicalName, "London");
  assert.equal(persisted.durationDays, 21);
  assert.deepEqual(persisted.structuredBrief?.placeMentions?.filter((mention) => mention.status === "unresolved").map((mention) => mention.sourceText), ["colusseum", "pathanon"]);
  const routable = routableHandoffMentions(persisted.structuredBrief?.placeMentions ?? []);
  assert.deepEqual(routable.filter((mention) => mention.role === "origin").map((mention) => mention.canonicalName), ["London"]);
  assert.deepEqual(routable.filter((mention) => mention.role !== "origin").map((mention) => mention.canonicalName), ["Paris", "Porto", "Rome", "Athens"]);
});

test("month, season and preference language never becomes blocking geography", () => {
  for (const word of CALENDAR_AND_PREFERENCE_WORDS) {
    const capture = captureJourneyBrief(`${word} matters. Tokyo and Kyoto.`);
    const falsePlace = capture.mentions.find((mention) => mention.sourceText.replace(/[.]+$/, "") === word);
    assert.equal(falsePlace, undefined, `${word} was captured as geography`);
    assert.equal(capture.structuredBrief.placeIssues?.some((issue) => issue.sourceText.replace(/[.]+$/, "") === word && issue.blocksRoute), false, `${word} blocked the route`);
    assert.deepEqual(routableHandoffMentions(capture.mentions).map((mention) => mention.canonicalName), ["Tokyo", "Kyoto"]);
  }
});

test("comma-delimited preferences do not become reviewable geography", () => {
  const capture = captureJourneyBrief("Paris, food, beaches, relaxed, nightlife, museums, keep it cheap, Rome");
  assert.deepEqual(capture.mentions.map((mention) => mention.canonicalName), ["Paris", "Rome"]);
  assert.deepEqual(capture.structuredBrief.placeIssues, []);
});

test("review-only geography and preferences never cross the routable handoff boundary", () => {
  for (const id of ["vague-warm-asia", "ambiguous-georgia", "ambiguous-granada", "unresolved-san-jose", "unresolved-victoria", "regional-island-intent", "preferences-without-geography"]) {
    const fixture = PROMPT_CAPTURE_REGRESSION_CASES.find((item) => item.id === id);
    assert.ok(fixture, `missing ${id} fixture`);
    const capture = captureJourneyBrief(fixture.rawPrompt);
    assert.deepEqual(routableHandoffMentions(capture.mentions), [], `${id} crossed into a route without a confirmed direct destination`);
    assert.equal(capture.structuredBrief.destinations.every((destination) => !destination.id), true, `${id} fabricated a route-stop identity`);
  }
});

test("capture corpus preserves regional and long-name geography", () => {
  const cases = [
    ["Patagonia in winter", "Patagonia"],
    ["The Balkans in spring", "Balkans"],
    ["Tierra del Fuego in November", "Tierra del Fuego"],
    ["Bosnia and Herzegovina in autumn", "Bosnia and Herzegovina"],
    ["The Sacred Valley with food as a priority", "Sacred Valley"],
  ] as const;
  for (const [prompt, canonicalName] of cases) {
    const capture = captureJourneyBrief(prompt);
    assert.equal(capture.mentions.some((mention) => mention.canonicalName === canonicalName && mention.canonicalPlaceId), true, prompt);
  }
});

test("safe typo resolutions remain eligible for the built route", () => {
  const capture = captureJourneyBrief("Barcelon and Madrid");
  const typo = capture.mentions.find((mention) => mention.sourceText === "Barcelon");
  assert.equal(typo?.status, "partially_resolved");
  assert.equal(typo?.canonicalName, "Barcelona");
  assert.deepEqual(routableHandoffMentions(capture.mentions).map((mention) => mention.canonicalName), ["Barcelona", "Madrid"]);
});

test("duration-only handoff stays flexible and preserves the exact source brief", () => {
  const raw = "  Two weeks in Tokyo and Kyoto.\nKeep food flexible.  ";
  const capture = captureJourneyBrief(raw);
  const draft = createHomeTripDraft({
    capture,
    handoffId: "handoff-duration",
    datesExplicit: false,
    startDate: "2026-10-01",
    endDate: "2026-10-07",
    travellers: 2,
    travellersExplicit: false,
    interests: ["food"],
  });
  assert.equal(capture.rawBrief, raw);
  assert.equal(capture.structuredBrief.source.rawPrompt, raw);
  assert.equal(draft.brief, raw);
  assert.equal(draft.durationDays, 14);
  assert.equal(draft.startDate, undefined);
  assert.equal(draft.endDate, undefined);
  assert.equal(draft.datesExplicit, false);
  assert.equal(homeTripDraftTimingFlexibility(draft, "fixed"), "flexible");
});

test("partial provider failure settles independently and leaves unknown unknown", async () => {
  const provider: PlaceIntelligenceProvider = {
    id: "partial-fixture",
    label: "Partial fixture",
    timeoutMs: 20,
    lookup: async (phrase) => {
      if (phrase === "Mystery Coast") return [{ providerId: "coast-1", canonicalName: "Mystery Coast", placeType: "coast", parentCountries: ["Exampleland"] }];
      if (phrase === "Hidden Bay") throw new Error("provider failed");
      return new Promise(() => undefined);
    },
  };
  const started = Date.now();
  const capture = await captureJourneyBriefWithProvider("Mystery Coast, Hidden Bay and Lost Ridge", provider);
  assert.ok(Date.now() - started < 500, "a hung lookup pinned the capture batch");
  assert.equal(capture.mentions.find((mention) => mention.sourceText === "Mystery Coast")?.canonicalPlaceId, "partial-fixture:coast-1");
  for (const phrase of ["Hidden Bay", "Lost Ridge"]) {
    const mention = capture.mentions.find((item) => item.sourceText === phrase);
    assert.equal(mention?.status, "unresolved");
    assert.equal(mention?.canonicalPlaceId, undefined);
  }
});

test("provider regression cards retain partial results and bound degraded lookups", async () => {
  const fixture = (scenario: "partial-response" | "timeout") => {
    const found = PROMPT_CAPTURE_REGRESSION_CASES.find((item) => item.providerScenario === scenario);
    assert.ok(found, `missing ${scenario} fixture`);
    return found;
  };
  const partialResponse = fixture("partial-response");
  const partialProvider: PlaceIntelligenceProvider = {
    id: "partial-response-fixture",
    label: "Partial response fixture",
    timeoutMs: 20,
    lookup: async (phrase) => phrase === "Mystery Coast"
      ? [{ providerId: "coast-1", canonicalName: "Mystery Coast", placeType: "coast", parentCountries: ["Exampleland"] }]
      : [],
  };
  const partial = await captureJourneyBriefWithProvider(partialResponse.rawPrompt, partialProvider);
  assert.equal(partial.rawBrief, partialResponse.rawPrompt);
  assert.equal(partial.structuredBrief.source.rawPrompt, partialResponse.rawPrompt);
  assert.equal(partial.mentions.find((mention) => mention.sourceText === "Mystery Coast")?.canonicalPlaceId, "partial-response-fixture:coast-1");
  assert.equal(partial.mentions.find((mention) => mention.sourceText === "Hidden Bay")?.status, "unresolved");

  const timeout = fixture("timeout");
  const slowProvider: PlaceIntelligenceProvider = {
    id: "timeout-fixture",
    label: "Timeout fixture",
    timeoutMs: 20,
    lookup: async () => new Promise(() => undefined),
  };
  const started = Date.now();
  const timedOut = await captureJourneyBriefWithProvider(timeout.rawPrompt, slowProvider);
  assert.ok(Date.now() - started < 500, "slow provider lookup pinned the capture batch");
  assert.equal(timedOut.rawBrief, timeout.rawPrompt);
  assert.equal(timedOut.structuredBrief.source.rawPrompt, timeout.rawPrompt);
  assert.equal(timedOut.mentions.every((mention) => mention.status === "unresolved" && !mention.canonicalPlaceId), true);
});

test("builder enrichment batch aborts a hung lookup without losing completed results", async () => {
  const outcome = await resolveHandoffBatch(["Tokyo", "Kyoto"], async (place, signal) => {
    if (place === "Tokyo") return "Tokyo, Japan";
    return new Promise<string>((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  }, 20);
  assert.deepEqual(outcome.map(({ item, value, status }) => ({ item, value, status })), [
    { item: "Tokyo", value: "Tokyo, Japan", status: "resolved" },
    { item: "Kyoto", value: undefined, status: "timeout" },
  ]);
});

test("reload-safe handoff draft is deleted only after exact brief and full route are durable", () => {
  const raw = "From London to Barcelon and Madrid";
  const capture = captureJourneyBrief(raw);
  const draft = createHomeTripDraft({ capture, handoffId: "reload-handoff", datesExplicit: false, startDate: "2026-09-01", endDate: "2026-09-07", travellers: 2, travellersExplicit: false, interests: [] });
  const values = new Map([[HOME_TRIP_DRAFT_KEY, JSON.stringify(draft)]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => { values.delete(key); } };
  const trip = (stops: string[], originalBrief = raw) => ({
    brief: { origin: "London", capturedIntent: { originalBrief } },
    stops: stops.map((name) => ({ name })),
  }) as EasyTTrip;

  assert.equal(removeHomeTripDraftIfDurable(storage, draft, trip(["Barcelona", "Madrid"]), true, true), false);
  assert.ok(storage.getItem(HOME_TRIP_DRAFT_KEY), "reload must still find a pending handoff");
  const reloadedDraft = JSON.parse(storage.getItem(HOME_TRIP_DRAFT_KEY)!) as HomeTripDraft;
  assert.equal(removeHomeTripDraftIfDurable(storage, reloadedDraft, trip(["Barcelona"]), true, false), false);
  assert.equal(removeHomeTripDraftIfDurable(storage, reloadedDraft, trip(["Barcelona", "Madrid"], `${raw} `), true, false), false);
  assert.equal(removeHomeTripDraftIfDurable(storage, reloadedDraft, trip(["Barcelona", "Madrid"]), true, false), true);
  assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), null);
});
