import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createAbortableEffectScope } from "../lib/easyt/abortable-effect.ts";
import type { ActivityInventoryItem } from "../lib/easyt/activity-inventory.ts";
import {
  dedupeExploreResults,
  exploreResultForActivity,
  exploreResultForPlace,
  exploreResultsPresentation,
  exploreSourcePlan,
  streamExploreDiscoveryLane,
  type ExploreDiscoveryLaneSnapshot,
  type ExploreResult,
} from "../lib/easyt/explore.ts";
import { scheduleItineraryIdea } from "../lib/easyt/itinerary-ideas.ts";
import { defaultTripIntent, type EasyTTrip } from "../lib/easyt/trip.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function trip(): EasyTTrip {
  const intent = defaultTripIntent({ stopIds: ["athens", "tokyo"], durationDays: 2 });
  return {
    schemaVersion: 1,
    id: "provider-lanes-trip",
    ownerId: null,
    title: "Athens and Tokyo",
    status: "draft",
    startDate: "2026-09-10",
    endDate: "2026-09-11",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      mustDo: "",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      intent: { ...intent, preferences: { ...intent.preferences, interests: ["culture", "food"] } },
    },
    stops: [
      { id: "athens", canonicalPlaceId: "athens-gr", order: 0, name: "Athens", country: "Greece", latitude: 37.9838, longitude: 23.7275, arrivalDate: "2026-09-10", departureDate: "2026-09-11", nights: 1 },
      { id: "tokyo", canonicalPlaceId: "tokyo-jp", order: 1, name: "Tokyo", country: "Japan", latitude: 35.6762, longitude: 139.6503, arrivalDate: "2026-09-11", departureDate: "2026-09-12", nights: 1 },
    ],
    legs: [],
    planItems: [
      { id: "day-1", stopId: "athens", dayNumber: 1, date: "2026-09-10", type: "activity", title: "Athens", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-2", stopId: "tokyo", dayNumber: 2, date: "2026-09-11", type: "activity", title: "Tokyo", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    ],
    recommendations: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function organicResult(base: EasyTTrip, stopId = "athens", id = "acropolis", title = "Acropolis") {
  const stop = base.stops.find((candidate) => candidate.id === stopId)!;
  return exploreResultForPlace(stop, {
    id,
    title,
    area: stop.name,
    type: "Historic site",
    tags: ["Culture"],
    description: `A useful local idea in ${stop.name}.`,
    coordinates: [stop.longitude!, stop.latitude!],
    qualityScore: 10,
  });
}

function commercialResult(base: EasyTTrip, stopId = "athens", id = "ticket", title = "Acropolis entry ticket") {
  const stop = base.stops.find((candidate) => candidate.id === stopId)!;
  const item: ActivityInventoryItem = {
    provider: "viator",
    source: "viator",
    providerProductId: id,
    title,
    destination: { canonicalPlaceId: stop.canonicalPlaceId!, label: stop.name },
    productUrl: `https://www.viator.com/tours/${id}`,
    rating: 4.8,
    provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-13T00:00:00.000Z" },
  };
  return exploreResultForActivity(stop, item, base);
}

test("organic suggestions settle while the Viator promise remains unresolved and can be scheduled immediately", async () => {
  const base = trip();
  const organic = organicResult(base);
  const provider = deferred<ExploreResult[]>();
  const organicSnapshots: ExploreDiscoveryLaneSnapshot[] = [];
  const providerSnapshots: ExploreDiscoveryLaneSnapshot[] = [];
  const providerRun = streamExploreDiscoveryLane([() => provider.promise], (snapshot) => providerSnapshots.push(snapshot));

  await streamExploreDiscoveryLane([() => Promise.resolve([organic])], (snapshot) => organicSnapshots.push(snapshot));

  assert.equal(organicSnapshots.at(-1)?.status, "ready");
  assert.deepEqual(organicSnapshots.at(-1)?.results.map((result) => result.title), ["Acropolis"]);
  assert.equal(providerSnapshots.at(-1)?.status, "loading");
  const scheduled = scheduleItineraryIdea(base, organic.idea, "day-1", "morning");
  assert.equal(scheduled.brief.itineraryIdeas?.[0]?.dayId, "day-1");
  provider.resolve([]);
  await providerRun;
});

test("a failed commercial lane does not change a successful organic lane", async () => {
  const base = trip();
  const organicSnapshots: ExploreDiscoveryLaneSnapshot[] = [];
  const providerSnapshots: ExploreDiscoveryLaneSnapshot[] = [];
  await Promise.all([
    streamExploreDiscoveryLane([() => Promise.resolve([organicResult(base)])], (snapshot) => organicSnapshots.push(snapshot)),
    streamExploreDiscoveryLane([() => Promise.reject(new Error("Viator unavailable"))], (snapshot) => providerSnapshots.push(snapshot)),
  ]);
  assert.equal(organicSnapshots.at(-1)?.status, "ready");
  assert.equal(organicSnapshots.at(-1)?.results.length, 1);
  assert.equal(providerSnapshots.at(-1)?.status, "degraded");
  assert.equal(providerSnapshots.at(-1)?.results.length, 0);
});

test("partial provider failures stay silent whenever useful recommendations remain", () => {
  for (const statuses of [
    ["ready", "degraded"],
    ["degraded", "ready"],
    ["degraded", "degraded"],
    ["loading", "degraded"],
  ] as const) {
    assert.equal(exploreResultsPresentation(1, statuses), "results");
    assert.equal(exploreResultsPresentation(27, statuses), "results");
  }
});

test("blocking provider failure and genuine empty remain distinct", () => {
  assert.equal(exploreResultsPresentation(0, ["degraded"]), "unavailable");
  assert.equal(exploreResultsPresentation(0, ["empty", "degraded"]), "unavailable");
  assert.equal(exploreResultsPresentation(0, ["empty", "ready"]), "empty");
  assert.equal(exploreResultsPresentation(0, ["empty"]), "empty");
  assert.equal(exploreResultsPresentation(0, ["loading", "degraded"]), "loading");
});

test("the fast lane publishes one organic source without waiting for another organic source", async () => {
  const base = trip();
  const slowerSource = deferred<ExploreResult[]>();
  const snapshots: ExploreDiscoveryLaneSnapshot[] = [];
  const run = streamExploreDiscoveryLane([
    () => Promise.resolve([organicResult(base)]),
    () => slowerSource.promise,
  ], (snapshot) => snapshots.push(snapshot));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(snapshots.at(-1)?.status, "loading");
  assert.deepEqual(snapshots.at(-1)?.results.map((result) => result.title), ["Acropolis"]);
  slowerSource.resolve([organicResult(base, "athens", "agora", "Ancient Agora")]);
  await run;
  assert.equal(snapshots.at(-1)?.status, "ready");
  assert.deepEqual(snapshots.at(-1)?.results.map((result) => result.title), ["Acropolis", "Ancient Agora"]);
});

test("delayed Viator results appear after organic results without returning the organic lane to loading", async () => {
  const base = trip();
  const provider = deferred<ExploreResult[]>();
  const organicStatuses: string[] = [];
  let organic: ExploreResult[] = [];
  let commercial: ExploreResult[] = [];
  const combined: string[][] = [];
  const providerRun = streamExploreDiscoveryLane([() => provider.promise], (snapshot) => {
    commercial = snapshot.results;
    combined.push(dedupeExploreResults([...organic, ...commercial]).map((result) => result.title));
  });
  await streamExploreDiscoveryLane([() => Promise.resolve([organicResult(base)])], (snapshot) => {
    organicStatuses.push(snapshot.status);
    organic = snapshot.results;
    combined.push(dedupeExploreResults([...organic, ...commercial]).map((result) => result.title));
  });
  const organicStatusCount = organicStatuses.length;
  assert.deepEqual(combined.at(-1), ["Acropolis"]);

  provider.resolve([commercialResult(base, "athens", "cape-sounion", "Cape Sounion sunset tour")]);
  await providerRun;

  assert.equal(organicStatuses.length, organicStatusCount);
  assert.equal(organicStatuses.at(-1), "ready");
  assert.deepEqual(combined.at(-1), ["Acropolis", "Cape Sounion sunset tour"]);
});

test("a late provider response from a disposed context cannot overwrite the current destination", async () => {
  const base = trip();
  const oldProvider = deferred<ExploreResult[]>();
  const oldScope = createAbortableEffectScope("old Athens commercial lane");
  let visible: ExploreResult[] = [];
  const oldRun = streamExploreDiscoveryLane([() => oldProvider.promise], (snapshot) => oldScope.commit(() => { visible = snapshot.results; }));
  oldScope.dispose();

  const currentScope = createAbortableEffectScope("current Tokyo commercial lane");
  await streamExploreDiscoveryLane(
    [() => Promise.resolve([commercialResult(base, "tokyo", "tokyo-walk", "Tokyo evening walk")])],
    (snapshot) => currentScope.commit(() => { visible = snapshot.results; }),
  );
  oldProvider.resolve([commercialResult(base, "athens", "athens-walk", "Athens evening walk")]);
  await oldRun;

  assert.deepEqual(visible.map((result) => [result.stopId, result.title]), [["tokyo", "Tokyo evening walk"]]);
  currentScope.dispose();
});

test("rapid context switching never mixes old category results into the new lane", async () => {
  const base = trip();
  const oldRequest = deferred<ExploreResult[]>();
  const oldScope = createAbortableEffectScope("old For you lane");
  const committed: string[] = [];
  const oldRun = streamExploreDiscoveryLane([() => oldRequest.promise], (snapshot) => oldScope.commit(() => {
    committed.splice(0, committed.length, ...snapshot.results.map((result) => result.title));
  }));
  oldScope.dispose();
  const currentScope = createAbortableEffectScope("current Tours lane");
  await streamExploreDiscoveryLane([() => Promise.resolve([commercialResult(base, "athens", "current", "Current tour")])], (snapshot) => currentScope.commit(() => {
    committed.splice(0, committed.length, ...snapshot.results.map((result) => result.title));
  }));
  oldRequest.resolve([commercialResult(base, "athens", "stale", "Stale tour")]);
  await oldRun;
  assert.deepEqual(committed, ["Current tour"]);
  currentScope.dispose();
});

test("provider fetching remains intentional by category", () => {
  const base = trip();
  assert.deepEqual(exploreSourcePlan("food", base), { mapped: true, dayTrips: false, restaurants: true, tours: false });
  assert.deepEqual(exploreSourcePlan("outdoors", base), { mapped: true, dayTrips: false, restaurants: false, tours: false });
  assert.deepEqual(exploreSourcePlan("tours", base), { mapped: false, dayTrips: false, restaurants: false, tours: true });
  assert.deepEqual(exploreSourcePlan("day-trips", base), { mapped: false, dayTrips: true, restaurants: false, tours: true });
  assert.equal(exploreSourcePlan("for-you", base).dayTrips, true);
});

test("obvious entry-ticket duplicates enrich the organic card without replacing its canonical idea", () => {
  const base = trip();
  const organic = organicResult(base);
  const commercial = commercialResult(base);
  const [enriched] = dedupeExploreResults([organic, commercial]);
  assert.equal(dedupeExploreResults([organic, commercial]).length, 1);
  assert.equal(enriched?.identity, organic.identity);
  assert.equal(enriched?.idea.source, organic.idea.source);
  assert.equal(enriched?.provider, "viator");
  assert.equal(enriched?.providerUrl, commercial.providerUrl);
  assert.equal(enriched?.coordinates, organic.coordinates);
  assert.equal(dedupeExploreResults([organic, commercial, commercial]).length, 1);
});

test("deduplication preserves legitimate distinct tours, product variants and repeated-stop activities", () => {
  const base = trip();
  const organic = organicResult(base);
  const guidedTour = commercialResult(base, "athens", "guided", "Acropolis guided tour");
  const secondGuidedTour = commercialResult(base, "athens", "guided-private", "Acropolis guided tour");
  const repeatedStopTicket = commercialResult(base, "tokyo", "ticket", "Acropolis entry ticket");
  assert.equal(dedupeExploreResults([organic, guidedTour, secondGuidedTour, repeatedStopTicket]).length, 4);
});

test("the split lanes retain canonical affiliate disclosure and tracking owners", () => {
  const workspace = readFileSync(new URL("../components/easyt/trip-explore-workspace.tsx", import.meta.url), "utf8");
  const inventory = readFileSync(new URL("../components/easyt/live-activity-inventory.tsx", import.meta.url), "utf8");
  assert.match(workspace, /MorroviaAffiliateLink/);
  assert.match(workspace, /trackEvent\("explore_provider_handoff"/);
  assert.match(workspace, /affiliateDisclosure/);
  assert.match(inventory, /MorroviaAffiliateLink/);
  assert.match(inventory, /affiliateDisclosure/);
  assert.doesNotMatch(workspace, /affiliate_click/);
});
