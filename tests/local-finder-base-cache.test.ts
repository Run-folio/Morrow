import assert from "node:assert/strict";
import test from "node:test";
import {
  clearLocalFinderBaseCacheForTests,
  loadLocalFinderBaseResult,
  localFinderBaseCacheTtlMs,
  peekLocalFinderBaseResult,
} from "../lib/easyt/local-finder-base-cache.ts";
import { localFinderBaseQueryKey, mergeLocalFinderPlaces } from "../lib/easyt/local-finder-query.ts";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test.beforeEach(() => clearLocalFinderBaseCacheForTests());

test("successful base results survive a safe return visit without another request", async () => {
  let requestCount = 0;
  const now = () => 10_000;
  const first = await loadLocalFinderBaseResult("tokyo-stop", async () => {
    requestCount += 1;
    return ["Tokyo mapped stay"];
  }, { now });
  const second = await loadLocalFinderBaseResult("tokyo-stop", async () => {
    requestCount += 1;
    return ["Unexpected duplicate request"];
  }, { now });

  assert.deepEqual(first, ["Tokyo mapped stay"]);
  assert.deepEqual(second, first);
  assert.deepEqual(peekLocalFinderBaseResult("tokyo-stop", now()), first);
  assert.equal(requestCount, 1);
});

test("identical in-flight base requests share one provider lookup", async () => {
  const provider = deferred<string[]>();
  let requestCount = 0;
  const request = () => {
    requestCount += 1;
    return provider.promise;
  };
  const first = loadLocalFinderBaseResult("tokyo-stop", request);
  const second = loadLocalFinderBaseResult("tokyo-stop", request);

  await Promise.resolve();
  assert.equal(requestCount, 1);
  provider.resolve(["Shared stay"]);
  assert.deepEqual(await first, ["Shared stay"]);
  assert.deepEqual(await second, ["Shared stay"]);
});

test("different stop identities are never deduplicated", async () => {
  let requestCount = 0;
  const tokyo = loadLocalFinderBaseResult("tokyo-stop-1", async () => { requestCount += 1; return ["Tokyo one"]; });
  const repeatedTokyo = loadLocalFinderBaseResult("tokyo-stop-2", async () => { requestCount += 1; return ["Tokyo two"]; });

  assert.deepEqual(await tokyo, ["Tokyo one"]);
  assert.deepEqual(await repeatedTokyo, ["Tokyo two"]);
  assert.equal(requestCount, 2);
});

test("base cache expires without changing provider truth", async () => {
  let currentTime = 5_000;
  let requestCount = 0;
  const request = async () => [`Result ${++requestCount}`];
  assert.deepEqual(await loadLocalFinderBaseResult("kyoto", request, { now: () => currentTime }), ["Result 1"]);
  currentTime += localFinderBaseCacheTtlMs + 1;
  assert.deepEqual(await loadLocalFinderBaseResult("kyoto", request, { now: () => currentTime }), ["Result 2"]);
});

test("empty or unavailable payloads can remain uncached", async () => {
  let requestCount = 0;
  const request = async () => ({ places: [] as string[], unavailable: true, attempt: ++requestCount });
  const options = { shouldCache: (result: Awaited<ReturnType<typeof request>>) => result.places.length > 0 && !result.unavailable };
  await loadLocalFinderBaseResult("empty", request, options);
  await loadLocalFinderBaseResult("empty", request, options);
  assert.equal(requestCount, 2);
});

test("base request identity ignores commercial dates but remains stop scoped", () => {
  const base = { kind: "stay" as const, city: "Tokyo", country: "Japan", coordinates: [139.6917001, 35.6895001] as [number, number], locale: "en" };
  const firstStop = localFinderBaseQueryKey({ ...base, dayId: "tokyo-stop-1" });
  const coordinateNoise = localFinderBaseQueryKey({ ...base, dayId: "tokyo-stop-1", coordinates: [139.6917002, 35.6895002] });
  const repeatedStop = localFinderBaseQueryKey({ ...base, dayId: "tokyo-stop-2" });

  assert.equal(firstStop, coordinateNoise);
  assert.notEqual(firstStop, repeatedStop);
  assert.doesNotMatch(firstStop, /2026|GBP|2 rooms/);
});

test("commercial enrichment replaces only a confidently identical mapped property", () => {
  const commercial = { id: "booking-42", name: "Tokyo Garden Hotel", coordinates: [139.7, 35.69] as [number, number] };
  const sameMappedProperty = { id: "google-19", name: " Tokyo  Garden Hotel ", coordinates: [139.7004, 35.6904] as [number, number] };
  const distinctSimilarProperty = { id: "osm-20", name: "Tokyo Garden Hotel Annex", coordinates: [139.7004, 35.6904] as [number, number] };

  assert.deepEqual(mergeLocalFinderPlaces([commercial], [sameMappedProperty, distinctSimilarProperty]), [commercial, distinctSimilarProperty]);
});
