import assert from "node:assert/strict";
import test from "node:test";

import {
  HOME_TRIP_DRAFT_KEY,
  createPendingIntakeReceipt,
  homepageHandoffMatchesTrip,
  homepageSubmissionFingerprint,
  mergeHandoffLocationChoice,
  projectHomepageInput,
  removeHomeTripDraftIfDurable,
  type HomeTripDraft,
  type HomepageHandoffReceipt,
} from "../lib/easyt/home-trip-handoff.ts";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";
import { defaultTripIntent, tripFromBuilder, type EasyTTrip } from "../lib/easyt/trip.ts";
import { emptyHomepageInput, selectedEntry } from "./fixtures/homepage-dual-entry.ts";
import { findCatalogPlaceById } from "../lib/easyt/place-catalog.ts";

function projectedHandoff() {
  const snapshot = emptyHomepageInput("owner-a");
  snapshot.revision = 4;
  snapshot.entries = [selectedEntry("a", "Tokyo"), selectedEntry("b", "Kyoto"), selectedEntry("c", "Tokyo")];
  snapshot.dates = { state: "selected", value: { start: "2026-10-01", end: "2026-10-12" } };
  snapshot.travellers = { state: "selected", value: 2 };
  snapshot.origin = { state: "selected", value: { name: "London", canonicalPlaceId: "london", country: "United Kingdom", coordinates: [-0.1276, 51.5072] } };
  snapshot.journeyEnd = { state: "selected", value: { mode: "explicit", place: { name: "Seoul", canonicalPlaceId: "seoul", country: "South Korea", coordinates: [126.978, 37.5665] } } };
  const result = projectHomepageInput({ snapshot, profile: null, handoffId: "handoff-a" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected homepage projection");
  const receipt: HomepageHandoffReceipt = {
    version: 1,
    ownerId: "owner-a",
    handoffId: "handoff-a",
    inputFingerprint: homepageSubmissionFingerprint(result.draft),
    tripId: "trip-reserved-a",
  };
  return { ...result.draft, homepage: { ...result.draft.homepage!, receipt } } satisfies HomeTripDraft;
}

function materialize(draft: HomeTripDraft): EasyTTrip {
  const stops = draft.destinations ?? [];
  return {
    ...tripFromBuilder({
      id: draft.homepage!.receipt!.tripId,
      origin: draft.origin ?? "",
      originCanonicalPlaceId: draft.originCanonicalPlaceId,
      originCountry: draft.originCountry,
      originProviderId: draft.originProviderId,
      originCoordinates: draft.originCoordinates,
      journeyEnd: draft.journeyEnd,
      stops,
      startDate: draft.startDate!,
      endDate: draft.endDate!,
      picks: {},
      mustDo: draft.brief ?? "",
      pace: "slow",
      hotels: "few",
      budget: draft.budget ?? "mid",
      draft: [],
      intent: {
        ...defaultTripIntent({
          travellers: draft.travellers,
          durationDays: 12,
          stopIds: stops.map((stop) => stop.id),
          journeyEnd: draft.journeyEnd,
        }),
        preferences: {
          ...defaultTripIntent().preferences,
          interests: draft.interests ?? [],
        },
      },
      structuredBrief: draft.structuredBrief,
      decisionSelections: draft.decisionSelections,
    }),
    ownerId: draft.homepage!.ownerId,
  };
}

function memoryStorage(initial: HomeTripDraft) {
  const values = new Map([[HOME_TRIP_DRAFT_KEY, JSON.stringify(initial)]]);
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
  };
}

test("a versioned homepage handoff matches only its reserved canonical initial document", () => {
  const draft = projectedHandoff();
  const trip = materialize(draft);
  assert.equal(homepageHandoffMatchesTrip(draft, trip), true);
  assert.equal(homepageHandoffMatchesTrip(draft, { ...trip, ownerId: null }), true);
  assert.equal(homepageHandoffMatchesTrip(draft, { ...trip, stops: [trip.stops[0]!, trip.stops[1]!] }), false);
  assert.equal(homepageHandoffMatchesTrip(draft, { ...trip, stops: [...trip.stops].reverse().map((stop, order) => ({ ...stop, order })) }), false);
  assert.equal(homepageHandoffMatchesTrip(draft, { ...trip, id: "trip-random" }), false);
  assert.equal(homepageHandoffMatchesTrip(draft, { ...trip, ownerId: "owner-b" }), false);
  assert.equal(homepageHandoffMatchesTrip(draft, { ...trip, brief: { ...trip.brief, mustDo: "Later traveller note" } }), false);
});

test("blank-prompt stops mode becomes durable after exact recovery and never during pending resolution or a failed write", () => {
  const draft = projectedHandoff();
  const trip = materialize(draft);
  assert.equal(draft.brief, undefined);

  const pending = memoryStorage(draft);
  assert.equal(removeHomeTripDraftIfDurable(pending, draft, trip, true, true), false);
  assert.equal(pending.values.has(HOME_TRIP_DRAFT_KEY), true);

  const failed = memoryStorage(draft);
  assert.equal(removeHomeTripDraftIfDurable(failed, draft, trip, false, false), false);
  assert.equal(failed.values.has(HOME_TRIP_DRAFT_KEY), true);

  const durable = memoryStorage(draft);
  assert.equal(removeHomeTripDraftIfDurable(durable, draft, trip, true, false), true);
  assert.equal(durable.values.has(HOME_TRIP_DRAFT_KEY), false);
});

test("a newer handoff slot is never deleted by an older durable canonical write", () => {
  const draft = projectedHandoff();
  const trip = materialize(draft);
  const newer = { ...draft, handoffId: "handoff-new", homepage: { ...draft.homepage!, revision: 5 } };
  const storage = memoryStorage(newer);
  assert.equal(removeHomeTripDraftIfDurable(storage, draft, trip, true, false), false);
  assert.equal(storage.values.has(HOME_TRIP_DRAFT_KEY), true);
});

test("occurrence enrichment targets the supplied homepage occurrence instead of a namesake", () => {
  const draft = projectedHandoff();
  const mentions = draft.locationMentions!;
  const seeds = draft.destinations!;
  const secondTokyo = mentions[2]!;
  const enriched = mergeHandoffLocationChoice(seeds, secondTokyo, {
    name: "Tokyo",
    country: "Japan",
    providerId: "provider-return",
    coordinates: [139.7, 35.6],
  }, "c");
  assert.equal(enriched[0]?.providerId, undefined);
  assert.equal(enriched[2]?.providerId, "provider-return");
  assert.deepEqual(enriched.map((stop) => stop.id), ["a", "b", "c"]);
});

test("missing optional coordinates do not delete or invalidate selected occurrences", () => {
  const draft = projectedHandoff();
  const coordinateLess = {
    ...draft,
    destinations: draft.destinations?.map(({ coordinates: _coordinates, ...stop }) => stop),
  };
  const trip = materialize(coordinateLess);
  assert.equal(trip.stops.every((stop) => stop.latitude === null && stop.longitude === null), true);
  assert.equal(homepageHandoffMatchesTrip(coordinateLess, trip), true);
});

test("a clarified planning area retains its original position through its selected base", () => {
  const japan = findCatalogPlaceById("japan");
  assert(japan);
  const snapshot = emptyHomepageInput();
  snapshot.entries = [{ id: "area-japan", text: "Japan", selection: {
    canonicalPlaceId: japan.canonicalPlaceId,
    name: japan.canonicalName,
    label: japan.canonicalName,
    country: japan.parentCountries[0] ?? "",
    placeType: japan.placeType,
    coordinates: japan.coordinates ? [...japan.coordinates] : undefined,
    routability: japan.routability,
    provenance: [{ ...japan.provenance, kind: japan.provenance.kind === "curated" ? "curated_alias" as const : "canonical" as const }],
  } }];
  const result = projectHomepageInput({ snapshot, profile: null, handoffId: "handoff-area" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const draft = {
    ...result.draft,
    homepage: { ...result.draft.homepage!, receipt: {
      version: 1 as const,
      ownerId: null,
      handoffId: "handoff-area",
      inputFingerprint: homepageSubmissionFingerprint(result.draft),
      tripId: "trip-reserved-area",
    } },
  };
  const mentionId = draft.locationMentions![0]!.mentionId;
  const structuredBrief = { ...draft.structuredBrief!, placeSelections: [{
    mentionId,
    kind: "base" as const,
    selectedCanonicalPlaceId: "tokyo",
    selectedName: "Tokyo",
    routeStopId: "tokyo-base",
    provenance: { id: "builder:tokyo", label: "Builder selection", kind: "builder" as const, supports: "Traveller selected Tokyo as the base." },
  }] };
  const trip = tripFromBuilder({
    id: "trip-reserved-area",
    origin: "London",
    stops: [{ id: "tokyo-base", name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo" }],
    startDate: "2026-10-01",
    endDate: "2026-10-08",
    picks: {},
    mustDo: "",
    pace: "slow",
    hotels: "few",
    budget: "mid",
    draft: [],
    structuredBrief,
  });
  assert.equal(homepageHandoffMatchesTrip(draft, trip), true);
});

test("pending Describe hydrates one reserved Builder document before capture and resumes it after reload", { skip: !builderBrowserTestsEnabled, timeout: 40_000 }, async () => {
  const snapshot = { ...emptyHomepageInput(), mode: "describe" as const, prompt: "Tokyo and Kyoto in Japan for one week." };
  const receipt = createPendingIntakeReceipt(snapshot, { handoffId: "pending-browser", tripId: "trip-pending-browser" });
  const view = await renderBuilder({
    query: "?homeDraft=1&handoff=pending-browser",
    draft: { version: 2, phase: "pending-interpretation", receipt },
    storedInput: { snapshot, receipt },
    captureDelayMs: 1200,
  });
  try {
    assert.match(await view.page.locator("body").innerText(), /Tokyo and Kyoto/);
    assert.equal(await view.page.locator('[aria-label="Your route"]').count(), 0);
    await view.page.getByText("Your route — Nights per stop:").waitFor({ timeout: 20_000 });
    await view.page.waitForFunction(() => Object.keys(localStorage).some((key) => key.includes("trip-pending-browser")));
    assert.equal(view.captureRequests(), 1);
    await view.page.reload();
    await view.page.getByText("Your route — Nights per stop:").waitFor({ timeout: 20_000 });
    assert.equal(view.captureRequests(), 1);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("failed pending interpretation keeps the frozen idea and retries under the same reservation", { skip: !builderBrowserTestsEnabled, timeout: 40_000 }, async () => {
  const snapshot = { ...emptyHomepageInput(), mode: "describe" as const, prompt: "Tokyo and Kyoto in Japan for one week." };
  const receipt = createPendingIntakeReceipt(snapshot, { handoffId: "pending-retry", tripId: "trip-pending-retry" });
  const view = await renderBuilder({
    query: "?homeDraft=1&handoff=pending-retry",
    draft: { version: 2, phase: "pending-interpretation", receipt },
    storedInput: { snapshot, receipt },
    captureFailures: 1,
  });
  try {
    await view.page.getByRole("button", { name: "Try again" }).waitFor();
    assert.match(await view.page.locator("body").innerText(), /Tokyo and Kyoto/);
    assert.equal(view.captureRequests(), 1);
    await view.page.getByRole("button", { name: "Try again" }).click();
    await view.page.getByText("Your route — Nights per stop:").waitFor({ timeout: 20_000 });
    assert.equal(view.captureRequests(), 2);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("direct pending intake reloads before interpretation without a fresh starter or a second trip", { skip: !builderBrowserTestsEnabled, timeout: 40_000 }, async () => {
  const snapshot = { ...emptyHomepageInput(), mode: "describe" as const, prompt: "Tokyo and Kyoto in Japan for one week." };
  const receipt = createPendingIntakeReceipt(snapshot, { handoffId: "direct-reload", tripId: "trip-direct-reload" });
  const view = await renderBuilder({ storedInput: { snapshot, receipt }, captureDelayMs: 1200 });
  try {
    await view.page.getByText(snapshot.prompt).waitFor();
    assert.equal(await view.page.getByRole("heading", { name: "New trip" }).count(), 0);
    await view.page.reload();
    await view.page.getByText(snapshot.prompt).waitFor();
    await view.page.getByText("Your route — Nights per stop:").waitFor({ timeout: 20_000 });
    await view.page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("easyt:trip-recovery:v2:") && key.includes("trip-direct-reload")));
    const reservedRecoveryIds = await view.page.evaluate(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:") && key.includes("trip-direct-reload")));
    assert.equal(reservedRecoveryIds.length, 1);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("failed pending interpretation can return to editable intake without reusing the old handoff", { skip: !builderBrowserTestsEnabled, timeout: 40_000 }, async () => {
  const snapshot = { ...emptyHomepageInput(), mode: "describe" as const, prompt: "Tokyo and Kyoto in Japan for one week." };
  const receipt = createPendingIntakeReceipt(snapshot, { handoffId: "pending-edit", tripId: "trip-pending-edit" });
  const view = await renderBuilder({
    query: "?homeDraft=1&handoff=pending-edit",
    draft: { version: 2, phase: "pending-interpretation", receipt },
    storedInput: { snapshot, receipt }, captureFailures: 1,
  });
  try {
    await view.page.getByRole("button", { name: "Edit trip idea" }).click();
    await view.page.getByRole("heading", { name: "New trip" }).waitFor();
    await view.page.waitForFunction(() => Array.from(document.querySelectorAll("textarea"))
      .some((field) => field.value === "Tokyo and Kyoto in Japan for one week."));
    const state = await view.page.evaluate(() => ({ url: location.search, handoff: localStorage.getItem("easyt-home-trip-draft") }));
    assert.equal(state.url, "");
    assert.equal(state.handoff, null);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("a failed named-place lookup offers scoped retry while a successful sibling stays intact", { skip: !builderBrowserTestsEnabled, timeout: 40_000 }, async () => {
  const snapshot = { ...emptyHomepageInput(), mode: "describe" as const, prompt: "Tokyo and Kyoto in Japan for one week." };
  const receipt = createPendingIntakeReceipt(snapshot, { handoffId: "place-retry", tripId: "trip-place-retry" });
  const view = await renderBuilder({
    storedInput: { snapshot, receipt }, geocodeFailures: { Tokyo: 1 },
    geocodeCandidates: { Kyoto: [{ name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116], canonicalPlaceId: "kyoto" }] },
  });
  try {
    await view.page.getByRole("button", { name: "Try again for Tokyo" }).waitFor({ timeout: 20_000 });
    assert.equal(view.geocodeRequests().Tokyo, 1);
    assert.equal(view.geocodeRequests().Kyoto, 1);
    await view.page.getByRole("button", { name: "Try again for Tokyo" }).click();
    await view.page.waitForFunction(() => document.body.innerText.includes("Tokyo checked"));
    assert.equal(view.geocodeRequests().Tokyo, 2);
    assert.equal(view.geocodeRequests().Kyoto, 1);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});
