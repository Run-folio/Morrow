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

const CALENDAR_AND_PREFERENCE_WORDS = [
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
  "Spring", "Summer", "Autumn", "Fall", "Winter", "Food", "Keep the", "Culture", "Nature", "Hiking",
];

test("month, season and preference language never becomes blocking geography", () => {
  for (const word of CALENDAR_AND_PREFERENCE_WORDS) {
    const capture = captureJourneyBrief(`${word} matters. Tokyo and Kyoto.`);
    const falsePlace = capture.mentions.find((mention) => mention.sourceText.replace(/[.]+$/, "") === word);
    assert.equal(falsePlace, undefined, `${word} was captured as geography`);
    assert.equal(capture.structuredBrief.placeIssues?.some((issue) => issue.sourceText.replace(/[.]+$/, "") === word && issue.blocksRoute), false, `${word} blocked the route`);
    assert.deepEqual(routableHandoffMentions(capture.mentions).map((mention) => mention.canonicalName), ["Tokyo", "Kyoto"]);
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
