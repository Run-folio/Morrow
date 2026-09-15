import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { selectMappedStayForStop, stayBookingForStop } from "../lib/easyt/accommodation.ts";
import { saveItineraryIdea, scheduleItineraryIdea } from "../lib/easyt/itinerary-ideas.ts";
import { composeItineraryDay } from "../lib/easyt/itinerary-day-composition.ts";
import { renameTripIdentity, tripCustomTitle, tripDisplayTitle } from "../lib/easyt/trip-display.ts";
import { createTripMutationPersistenceQueue, mergeTripMutationDocuments, newestTripMutationCanonical } from "../lib/easyt/trip-mutation-persistence.ts";
import { EasyTTripSaveConflictError } from "../lib/easyt/trip-continuity.ts";
import { canonicalTripForOwner } from "../lib/easyt/trip-promotion.ts";
import {
  cacheCanonicalTripWithRecoveryToStorage,
  loadCachedTripFromStorage,
  loadTripRecoveryFromStorage,
  saveTripRecoveryToStorage,
  type EasyTBrowserStorage,
  type TripRecoveryHandle,
} from "../lib/easyt/storage.ts";
import type { EasyTTrip, ItineraryIdea } from "../lib/easyt/trip.ts";

function trip(overrides: Partial<EasyTTrip> = {}): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "canonical-shell-trip",
    ownerId: "owner-a",
    title: "London to Tokyo",
    status: "planned",
    startDate: "2026-10-01",
    endDate: "2026-10-05",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      mustDo: "Food and culture",
      pace: "full",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      customActivities: {},
      itineraryIdeas: [],
      mapPins: [],
    },
    stops: [{ id: "tokyo", name: "Tokyo", country: "Japan", nights: 4, order: 1, latitude: 35.6762, longitude: 139.6503, arrivalDate: "2026-10-01", departureDate: "2026-10-05" }],
    legs: [],
    planItems: [{
      id: "day-1",
      dayNumber: 1,
      date: "2026-10-01",
      stopId: "tokyo",
      type: "activity",
      title: "Tokyo",
      reason: "First day",
      notes: [],
      startsAt: null,
      endsAt: null,
      bookingUrl: null,
      latitude: 35.6762,
      longitude: 139.6503,
      image: null,
      sourceUrl: null,
    }],
    recommendations: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function recovery(writeId: string): TripRecoveryHandle {
  return { ownerId: "owner-a", tripId: "canonical-shell-trip", writeId };
}

class MemoryStorage implements EasyTBrowserStorage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

function fakeRepository(initial = trip()) {
  let canonical = structuredClone(initial);
  let revision = 0;
  const submissions: EasyTTrip[] = [];
  return {
    get canonical() { return structuredClone(canonical); },
    submissions,
    persist: async (submitted: EasyTTrip) => {
      submissions.push(structuredClone(submitted));
      if (submitted.updatedAt !== canonical.updatedAt) {
        throw new EasyTTripSaveConflictError("This trip changed on another device.", structuredClone(canonical), "cloud-changed");
      }
      revision += 1;
      canonical = { ...structuredClone(submitted), updatedAt: `2026-09-01T00:00:0${revision}.000Z` };
      return structuredClone(canonical);
    },
  };
}

const idea: ItineraryIdea = {
  id: "idea-market",
  placeId: "market",
  stopId: "tokyo",
  title: "Tsukiji market",
  category: "activity",
  source: "personalised-recommendation",
  reasons: ["interest-relevance"],
};

const hotel = {
  id: "keio-plaza",
  name: "Keio Plaza Hotel",
  address: "Shinjuku, Tokyo",
  category: "Hotel",
  coordinates: [139.6949, 35.6906] as [number, number],
  mapsUrl: "https://maps.example/keio-plaza",
  availability: "check" as const,
  provider: "google-places" as const,
};

test("reproduces the stale header queue after an Explore save", async () => {
  const base = trip();
  const repository = fakeRepository(base);
  const exploreQueue = createTripMutationPersistenceQueue((next) => repository.persist(next));
  const staleHeaderQueue = createTripMutationPersistenceQueue((next) => repository.persist(next));
  exploreQueue.reset(base);
  staleHeaderQueue.reset(base);

  const explored = await exploreQueue.enqueue(saveItineraryIdea(base, idea), recovery("explore"));
  assert.equal(explored.updatedAt, "2026-09-01T00:00:01.000Z");
  await assert.rejects(
    () => staleHeaderQueue.enqueue(renameTripIdentity(base, "Autumn in Japan"), recovery("rename")),
    (error: unknown) => error instanceof EasyTTripSaveConflictError
      && error.canonicalTrip.updatedAt === explored.updatedAt,
  );
  assert.equal(repository.canonical.brief.itineraryIdeas?.[0]?.title, "Tsukiji market");
  assert.equal(tripCustomTitle(repository.canonical), null);
});

test("one mounted TripShell has one canonical mutation owner", () => {
  const shell = readFileSync(new URL("../components/easyt/trip-shell-client.tsx", import.meta.url), "utf8");
  const explore = readFileSync(new URL("../components/easyt/trip-explore-workspace.tsx", import.meta.url), "utf8");
  const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
  const map = readFileSync(new URL("../components/easyt/trip-map-workspace.tsx", import.meta.url), "utf8");
  const identity = shell.slice(shell.indexOf("export function TripShellIdentityAndActions"), shell.indexOf("export function TripShellTripProvider"));

  assert.match(shell, /TripShellCanonicalMutationProvider/);
  assert.doesNotMatch(identity, /useTripMutationPersistence/);
  assert.match(explore, /useTripShellMutation\(\)/);
  assert.match(itinerary, /useOptionalTripShellMutation\(\)/);
  assert.match(map, /useTripShellMutation\(\)/);
});

test("a shared queue preserves Explore, itinerary metadata, rename, Map and a second rename", async () => {
  const base = trip();
  const repository = fakeRepository(base);
  const queue = createTripMutationPersistenceQueue((next) => repository.persist(next));
  queue.reset(base);

  const explored = await queue.enqueue(saveItineraryIdea(base, idea), recovery("explore"));
  const scheduled = await queue.enqueue(scheduleItineraryIdea(explored, {
    ...idea,
    id: "idea-fuji",
    placeId: "fuji",
    title: "Mt Fuji day experience",
    startsAt: "07:00",
    provider: "viator",
    providerProductId: "FUJI11H",
    source: "live-provider-inventory",
    providerMetadata: {
      duration: { fixedMinutes: 660 },
      provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-01T00:00:00.000Z" },
    },
  }, "day-1", "afternoon"), recovery("itinerary"));
  const renamed = await queue.enqueue(renameTripIdentity(scheduled, "Japan in autumn"), recovery("rename-1"));
  const mapped = await queue.enqueue({
    ...renamed,
    brief: { ...renamed.brief, mapPins: [{ id: "pin-1", title: "Coffee", category: "restaurant", dayNumber: 1, latitude: 35.68, longitude: 139.76 }] },
  }, recovery("map"));
  const final = await queue.enqueue(renameTripIdentity(mapped, "日本の秋"), recovery("rename-2"));

  assert.deepEqual(repository.submissions.map((item) => item.updatedAt), [
    "2026-09-01T00:00:00.000Z",
    "2026-09-01T00:00:01.000Z",
    "2026-09-01T00:00:02.000Z",
    "2026-09-01T00:00:03.000Z",
    "2026-09-01T00:00:04.000Z",
  ]);
  assert.equal(tripCustomTitle(final), "日本の秋");
  assert.equal(final.brief.itineraryIdeas?.length, 2);
  assert.equal(final.brief.itineraryIdeas?.find((item) => item.id === "idea-fuji")?.providerMetadata?.duration?.fixedMinutes, 660);
  assert.equal(final.brief.itineraryIdeas?.find((item) => item.id === "idea-fuji")?.providerMetadata?.provenance.provider, "viator");
  assert.equal(final.brief.mapPins?.[0]?.title, "Coffee");
  assert.equal(final.stops[0]?.name, "Tokyo");
  assert.equal(final.startDate, base.startDate);
});

test("an occupied Afternoon keeps its slot activity while an 11-hour activity stays day-level through Rename and reload", async () => {
  const firstIdea = { ...idea, id: "idea-first", placeId: "first", title: "First activity" };
  const longIdea: ItineraryIdea = {
    ...idea,
    id: "idea-long",
    placeId: "long",
    title: "Mt Fuji 11-hour experience",
    provider: "viator",
    providerProductId: "FUJI11H",
    source: "live-provider-inventory",
    startsAt: "07:00",
    providerMetadata: {
      duration: { fixedMinutes: 660 },
      provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-01T00:00:00.000Z" },
    },
  };
  const base = scheduleItineraryIdea(trip(), firstIdea, "day-1", "afternoon");
  const repository = fakeRepository(base);
  const queue = createTripMutationPersistenceQueue((next) => repository.persist(next));
  queue.reset(base);

  const withSecond = await queue.enqueue(scheduleItineraryIdea(base, longIdea, "day-1", "afternoon"), recovery("second-activity"));
  const renamed = await queue.enqueue(renameTripIdentity(withSecond, "Fuji and food"), recovery("rename-after-itinerary"));
  const reloaded = JSON.parse(JSON.stringify(renamed)) as EasyTTrip;
  const composition = composeItineraryDay(reloaded, "day-1")!;

  assert.deepEqual(composition.planned.afternoon.map((item) => item.title), ["First activity"]);
  assert.deepEqual(composition.unslotted.map((item) => item.title), ["Mt Fuji 11-hour experience"]);
  assert.equal(reloaded.brief.itineraryIdeas?.find((item) => item.id === longIdea.id)?.providerMetadata?.duration?.fixedMinutes, 660);
  assert.equal(reloaded.brief.itineraryIdeas?.find((item) => item.id === longIdea.id)?.startsAt, "07:00");
  assert.equal(tripCustomTitle(reloaded), "Fuji and food");
});

test("Rename followed by Explore and Itinerary additions keeps the returned revision as each CAS base", async () => {
  const base = trip();
  const repository = fakeRepository(base);
  const queue = createTripMutationPersistenceQueue((next) => repository.persist(next));
  queue.reset(base);

  const renamed = await queue.enqueue(renameTripIdentity(base, "Tokyo details"), recovery("rename-first"));
  const saved = await queue.enqueue(saveItineraryIdea(renamed, idea), recovery("explore-after-rename"));
  const scheduled = await queue.enqueue(scheduleItineraryIdea(saved, idea, "day-1", "midday"), recovery("itinerary-after-rename"));

  assert.deepEqual(repository.submissions.map((item) => item.updatedAt), [
    "2026-09-01T00:00:00.000Z",
    "2026-09-01T00:00:01.000Z",
    "2026-09-01T00:00:02.000Z",
  ]);
  assert.equal(tripCustomTitle(scheduled), "Tokyo details");
  assert.equal(scheduled.brief.itineraryIdeas?.[0]?.dayPart, "midday");
});

test("a workspace remount uses the acknowledged Explore revision for the next Stay CAS", async () => {
  const base = trip();
  const repository = fakeRepository(base);
  const exploreQueue = createTripMutationPersistenceQueue((next) => repository.persist(next));
  exploreQueue.reset(base);

  const explored = await exploreQueue.enqueue(
    scheduleItineraryIdea(base, idea, "day-1", "midday"),
    recovery("explore-add"),
  );
  assert.equal(explored.updatedAt, "2026-09-01T00:00:01.000Z");

  // Next can remount the client owner with the still-persisted layout prop A.
  // The acknowledged browser cache B is the authoritative same-tab baseline.
  const remountedBaseline = newestTripMutationCanonical(base, explored);
  const stayQueue = createTripMutationPersistenceQueue((next) => repository.persist(next));
  stayQueue.reset(remountedBaseline);
  const stayed = await stayQueue.enqueue(
    selectMappedStayForStop(remountedBaseline, "tokyo", hotel),
    recovery("stay-select"),
  );

  assert.deepEqual(repository.submissions.map((item) => item.updatedAt), [
    "2026-09-01T00:00:00.000Z",
    "2026-09-01T00:00:01.000Z",
  ]);
  assert.equal(stayBookingForStop(stayed, stayed.stops[0]!)?.title, "Keio Plaza Hotel");
  assert.equal(stayed.brief.itineraryIdeas?.[0]?.title, "Tsukiji market");
});

test("the hosted Explore to Stay sequence finishes canonical with no stranded recovery", async () => {
  const base = trip();
  const storage = new MemoryStorage();
  const repository = fakeRepository(base);
  cacheCanonicalTripWithRecoveryToStorage(storage, base);

  const exploreQueue = createTripMutationPersistenceQueue((next) => repository.persist(next));
  exploreQueue.reset(base);
  const exploreEdit = scheduleItineraryIdea(base, idea, "day-1", "midday");
  const exploreRecovery = saveTripRecoveryToStorage(storage, exploreEdit, {
    ownerId: "owner-a",
    writeId: "hosted-explore",
  });
  const explored = await exploreQueue.enqueue(exploreEdit, exploreRecovery.handle);
  assert.deepEqual(
    cacheCanonicalTripWithRecoveryToStorage(storage, explored, exploreRecovery.handle),
    { stored: true, recoveryResolved: true },
  );

  const staleLayoutProp = base;
  const remountedBaseline = newestTripMutationCanonical(
    staleLayoutProp,
    loadCachedTripFromStorage(storage, base.id, "owner-a"),
  );
  const stayEdit = selectMappedStayForStop(remountedBaseline, "tokyo", hotel);
  const stayRecovery = saveTripRecoveryToStorage(storage, stayEdit, {
    ownerId: "owner-a",
    writeId: "hosted-stay",
  });
  const stayQueue = createTripMutationPersistenceQueue((next) => repository.persist(next));
  stayQueue.reset(remountedBaseline);
  const stayed = await stayQueue.enqueue(stayEdit, stayRecovery.handle);
  assert.deepEqual(
    cacheCanonicalTripWithRecoveryToStorage(storage, stayed, stayRecovery.handle),
    { stored: true, recoveryResolved: true },
  );

  const freshClient = loadCachedTripFromStorage(storage, base.id, "owner-a")!;
  assert.equal(loadTripRecoveryFromStorage(storage, base.id, "owner-a"), null);
  assert.equal(freshClient.updatedAt, "2026-09-01T00:00:02.000Z");
  assert.equal(freshClient.brief.itineraryIdeas?.[0]?.dayPart, "midday");
  assert.equal(stayBookingForStop(freshClient, freshClient.stops[0]!)?.title, "Keio Plaza Hotel");
});

test("immediate Explore and Stay mutations share the returned canonical revision", async () => {
  const base = trip();
  let releaseExplore: ((saved: EasyTTrip) => void) | undefined;
  const exploreResponse = new Promise<EasyTTrip>((resolve) => { releaseExplore = resolve; });
  const submissions: EasyTTrip[] = [];
  let canonicalTrip = base;
  const queue = createTripMutationPersistenceQueue(async (submitted) => {
    submissions.push(structuredClone(submitted));
    if (submissions.length === 1) {
      canonicalTrip = await exploreResponse;
      return canonicalTrip;
    }
    assert.equal(submitted.updatedAt, canonicalTrip.updatedAt);
    canonicalTrip = { ...structuredClone(submitted), updatedAt: "2026-09-01T00:00:02.000Z" };
    return canonicalTrip;
  });
  queue.reset(base);
  const explored = scheduleItineraryIdea(base, idea, "day-1", "midday");
  const stayed = selectMappedStayForStop(explored, "tokyo", hotel);
  const first = queue.enqueue(explored, recovery("explore-immediate"));
  const second = queue.enqueue(stayed, recovery("stay-immediate"));
  await Promise.resolve();

  releaseExplore?.({ ...explored, updatedAt: "2026-09-01T00:00:01.000Z" });
  await first;
  const canonical = await second;

  assert.equal(submissions[1]?.updatedAt, "2026-09-01T00:00:01.000Z");
  assert.equal(canonical.brief.itineraryIdeas?.[0]?.dayPart, "midday");
  assert.equal(stayBookingForStop(canonical, canonical.stops[0]!)?.title, "Keio Plaza Hotel");
});

test("canonical baseline selection is owner-scoped, monotonic and accepts normalized output", () => {
  const rendered = trip();
  const normalized = {
    ...rendered,
    title: "Server-normalized title",
    updatedAt: "2026-09-01T00:00:01.000Z",
  };
  const older = { ...rendered, updatedAt: "2025-09-01T00:00:00.000Z" };
  const wrongOwner = { ...normalized, ownerId: "owner-b", updatedAt: "2026-09-01T00:00:02.000Z" };

  assert.deepEqual(newestTripMutationCanonical(rendered, older, normalized, wrongOwner), normalized);
  assert.equal(newestTripMutationCanonical(normalized, rendered).updatedAt, normalized.updatedAt);
});

test("rename identity preserves normalization, clearing and the geographic fallback", () => {
  const base = trip();
  const renamed = renameTripIdentity(base, "  Café   日本  ");
  assert.equal(tripCustomTitle(renamed), "Café 日本");
  assert.deepEqual(renamed.stops, base.stops);
  assert.deepEqual(renamed.planItems, base.planItems);
  assert.equal(tripDisplayTitle(renameTripIdentity(renamed, "")), "Japan");
});

test("clean signed-in rename acknowledges only its exact recovery and reloads canonical B", async () => {
  const base = trip();
  const storage = new MemoryStorage();
  const repository = fakeRepository(base);
  const queue = createTripMutationPersistenceQueue((next) => repository.persist(next));
  queue.reset(base);
  const renamed = renameTripIdentity(base, "Autumn escape");
  const write = saveTripRecoveryToStorage(storage, renamed, { ownerId: "owner-a", writeId: "rename-a" });

  const saved = await queue.enqueue(renamed, write.handle);
  const acknowledgement = cacheCanonicalTripWithRecoveryToStorage(storage, saved, write.handle);

  assert.deepEqual(acknowledgement, { stored: true, recoveryResolved: true });
  assert.equal(loadTripRecoveryFromStorage(storage, base.id, "owner-a"), null);
  assert.equal(loadCachedTripFromStorage(storage, base.id, "owner-a")?.updatedAt, "2026-09-01T00:00:01.000Z");
  assert.equal(tripCustomTitle(loadCachedTripFromStorage(storage, base.id, "owner-a")!), "Autumn escape");
});

test("an older acknowledgement cannot consume a newer same-device recovery", () => {
  const base = trip();
  const storage = new MemoryStorage();
  const first = saveTripRecoveryToStorage(storage, renameTripIdentity(base, "First"), { ownerId: "owner-a", writeId: "rename-first" });
  const secondTrip = renameTripIdentity(base, "Second");
  const second = saveTripRecoveryToStorage(storage, secondTrip, { ownerId: "owner-a", replace: first.handle, writeId: "rename-second" });
  const firstCanonical = { ...renameTripIdentity(base, "First"), updatedAt: "2026-09-01T00:00:01.000Z" };

  assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage, firstCanonical, first.handle), { stored: true, recoveryResolved: false });
  assert.equal(loadTripRecoveryFromStorage(storage, base.id, "owner-a")?.writeId, second.handle.writeId);
  assert.equal(tripCustomTitle(loadTripRecoveryFromStorage(storage, base.id, "owner-a")!.trip), "Second");
});

test("guest rename remains device-local without inventing an account conflict", () => {
  const storage = new MemoryStorage();
  const guest = trip({ ownerId: null });
  const renamed = renameTripIdentity(guest, "Guest 日本 trip");
  const write = saveTripRecoveryToStorage(storage, renamed, { ownerId: null, writeId: "guest-rename" });

  assert.equal(write.stored, true);
  assert.equal(write.blockedByExistingRecovery, false);
  assert.equal(loadTripRecoveryFromStorage(storage, guest.id, null)?.state, "pending");
  assert.equal(tripCustomTitle(loadTripRecoveryFromStorage(storage, guest.id, null)!.trip), "Guest 日本 trip");
});

test("guest promotion preserves the custom title, itinerary additions and provider duration", () => {
  const guest = trip({ ownerId: null });
  const scheduled = scheduleItineraryIdea(renameTripIdentity(guest, "Guest Fuji trip"), {
    ...idea,
    id: "idea-fuji-promotion",
    placeId: "fuji-promotion",
    title: "Mt Fuji 11-hour experience",
    provider: "viator",
    providerProductId: "FUJI-PROMOTION",
    source: "live-provider-inventory",
    providerMetadata: {
      duration: { fixedMinutes: 660 },
      provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-01T00:00:00.000Z" },
    },
  }, "day-1", "afternoon");
  const promoted = canonicalTripForOwner("owner-a", scheduled);
  const promotedIdea = promoted.brief.itineraryIdeas?.find((candidate) => candidate.id === "idea-fuji-promotion");

  assert.equal(promoted.ownerId, "owner-a");
  assert.equal(tripCustomTitle(promoted), "Guest Fuji trip");
  assert.equal(promotedIdea?.dayId, "day-1");
  assert.equal(promotedIdea?.dayPart, null);
  assert.equal(promotedIdea?.providerMetadata?.duration?.fixedMinutes, 660);
  assert.equal(promotedIdea?.providerMetadata?.provenance.provider, "viator");
});

test("Map undo reverts only Map-authored paths and retains a later Rename revision", () => {
  const base = trip();
  const mapped = { ...base, brief: { ...base.brief, mapPins: [{ id: "pin-1", title: "Coffee", category: "restaurant" as const, dayNumber: 1, latitude: 35.68, longitude: 139.76 }] } };
  const renamedAfterMap = { ...renameTripIdentity(mapped, "Later title"), updatedAt: "2026-09-01T00:00:02.000Z" };
  const undone = mergeTripMutationDocuments(mapped, base, renamedAfterMap);

  assert.equal(tripCustomTitle(undone), "Later title");
  assert.deepEqual(undone.brief.mapPins, []);
  assert.equal(undone.updatedAt, renamedAfterMap.updatedAt);
});

test("stale server props and storage events cannot reset the canonical queue", () => {
  const persistence = readFileSync(new URL("../components/easyt/use-trip-mutation-persistence.ts", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/easyt/trip-shell-client.tsx", import.meta.url), "utf8");

  assert.match(persistence, /sameDocument && !canonicalTripRevisionCanReplace\(current, initialTrip\)/);
  assert.match(persistence, /loadCachedTrip\(initialTrip\.id, initialTrip\.ownerId\)/);
  assert.match(persistence, /sameDocument && pendingSavesRef\.current\.size > 0/);
  assert.match(shell, /if \(mutation\.hasPendingSaves\(\)\) return/);
  assert.match(shell, /mutation\.adoptCanonicalTrip\(cached\)/);
  assert.match(shell, /EASYT_ACTIVE_TRIP_CHANGE_EVENT[\s\S]*mutation\.adoptDeviceTrip\(next\)/);
  assert.match(persistence, /localRecoveryWriteRef\.current \|\| pendingSavesRef\.current\.size > 0/);
  assert.doesNotMatch(shell, /setActiveTrip/);
});
