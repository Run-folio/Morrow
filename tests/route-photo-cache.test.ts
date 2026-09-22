import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalPlacePhotoCacheKey,
  findRoutePhotos,
  readRoutePhotoSelection,
  resolveRoutePhotoCandidates,
  routePhotoFromUnknown,
  saveRoutePhotoSelection,
} from "../lib/easyt/route-photo-cache.ts";

const validPhoto = {
  id: "photo-1",
  src: "https://images.example.test/route.jpg",
  alt: "Mountain route",
  sourceUrl: "https://example.test/photographer",
  sourceLabel: "Photo by Example",
  downloadLocation: "https://api.example.test/download/photo-1",
};

test("route photo parsing accepts usable web images and rejects unsafe required fields", () => {
  assert.deepEqual(routePhotoFromUnknown(validPhoto), validPhoto);
  assert.equal(routePhotoFromUnknown({ ...validPhoto, src: "javascript:alert(1)" }), null);
  assert.equal(routePhotoFromUnknown({ ...validPhoto, sourceUrl: "/relative-credit" }), null);
  assert.equal(routePhotoFromUnknown({ ...validPhoto, sourceLabel: "  " }), null);
  const withoutInvalidDownload = routePhotoFromUnknown({ ...validPhoto, downloadLocation: "not a URL" });
  assert.ok(withoutInvalidDownload);
  assert.equal(withoutInvalidDownload.downloadLocation, undefined);
});

test("route photo lookup survives one failed query and filters malformed candidates", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("provider unavailable");
    return new Response(JSON.stringify({
      image: { ...validPhoto, src: "bad-url" },
      candidates: [{ src: "missing-required-fields" }, validPhoto],
      configured: true,
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await findRoutePhotos(["first query", "second query"]);
  assert.equal(calls, 2);
  assert.deepEqual(result, { candidates: [validPhoto], configured: true, status: "resolved" });
});

test("route photo lookup settles unavailable after malformed provider responses", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response("not json", {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  assert.deepEqual(
    await findRoutePhotos(["malformed query"]),
    { candidates: [], configured: true, status: "unavailable" },
  );
});

class MemoryStorage implements Storage {
  #values = new Map<string, string>();
  get length() { return this.#values.size; }
  clear() { this.#values.clear(); }
  getItem(key: string) { return this.#values.get(key) ?? null; }
  key(index: number) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key: string) { this.#values.delete(key); }
  setItem(key: string, value: string) { this.#values.set(key, value); }
}

test("canonical place cache identity does not depend on route position or display spelling", () => {
  const first = canonicalPlacePhotoCacheKey({
    canonicalPlaceId: "geo:123",
    name: "Marrakech",
    country: "Morocco",
    coordinates: [-8.008, 31.63],
  });
  const repeated = canonicalPlacePhotoCacheKey({
    canonicalPlaceId: " GEO:123 ",
    name: "Marrakesh",
    country: "Morocco",
    coordinates: [-8.01, 31.64],
  });
  assert.equal(first, repeated);
  assert.equal(
    canonicalPlacePhotoCacheKey({ name: "  Almaty ", country: "KAZAKHSTAN" }),
    canonicalPlacePhotoCacheKey({ name: "almaty", country: "kazakhstan" }),
  );
});

test("the shared cache retains valid imagery but ignores and evicts persisted empty choices", () => {
  const storage = new MemoryStorage();
  saveRoutePhotoSelection("place:one", { kind: "photo", photo: validPhoto }, storage);
  storage.setItem("morrovia:route-photo:place:two", JSON.stringify({ kind: "empty" }));

  assert.deepEqual(readRoutePhotoSelection("place:one", storage), { kind: "photo", photo: validPhoto });
  assert.equal(readRoutePhotoSelection("place:two", storage), null);
  assert.equal(storage.getItem("morrovia:route-photo:place:two"), null);

  saveRoutePhotoSelection("place:two", { kind: "empty" }, storage);
  assert.equal(storage.getItem("morrovia:route-photo:place:two"), null);
});

test("candidate resolution commits successful siblings without waiting for a failed batch", async () => {
  const storage = new MemoryStorage();
  let releaseFailure!: () => void;
  const slowFailure = new Promise<void>((resolve) => { releaseFailure = resolve; });
  const committed: string[] = [];

  const resolving = resolveRoutePhotoCandidates([
    { occurrenceIds: ["slow"], cacheKey: "slow", queries: ["slow"] },
    { occurrenceIds: ["fast", "repeat"], cacheKey: "fast", queries: ["fast"] },
  ], (candidate, selection) => {
    if (selection.kind === "photo") committed.push(...candidate.occurrenceIds);
  }, {
    storage,
    trackPhoto: () => undefined,
    findPhotos: async (queries) => {
      if (queries[0] === "slow") {
        await slowFailure;
        throw new TypeError("provider failed");
      }
      return { candidates: [validPhoto], configured: true, status: "resolved" };
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(committed, ["fast", "repeat"]);
  releaseFailure();
  await resolving;
  assert.deepEqual(readRoutePhotoSelection("fast", storage), { kind: "photo", photo: validPhoto });
  assert.equal(readRoutePhotoSelection("slow", storage), null);
});

test("navigation and reload reuse the same positive choice without another lookup", async () => {
  const storage = new MemoryStorage();
  const candidate = { occurrenceIds: ["first-visit"], cacheKey: "same-place", queries: ["same place"] };
  let lookups = 0;
  let firstSelection: unknown;
  await resolveRoutePhotoCandidates([candidate], (_candidate, selection) => { firstSelection = selection; }, {
    storage,
    trackPhoto: () => undefined,
    findPhotos: async () => {
      lookups += 1;
      return { candidates: [validPhoto], configured: true, status: "resolved" };
    },
  });

  let reloadedSelection: unknown;
  await resolveRoutePhotoCandidates([{ ...candidate, occurrenceIds: ["after-navigation"] }], (_candidate, selection) => { reloadedSelection = selection; }, {
    storage,
    findPhotos: async () => {
      throw new Error("cached selections must not re-fetch");
    },
  });

  assert.equal(lookups, 1);
  assert.deepEqual(reloadedSelection, firstSelection);
});

test("Dubai to Almaty to Samarkand and back to Dubai shares canonical positive choices", async () => {
  const storage = new MemoryStorage();
  const places = [
    { name: "Dubai", country: "United Arab Emirates", canonicalPlaceId: "dubai" },
    { name: "Almaty", country: "Kazakhstan", canonicalPlaceId: "almaty" },
    { name: "Samarkand", country: "Uzbekistan", canonicalPlaceId: "samarkand" },
  ];
  const [dubai, almaty, samarkand] = places.map(canonicalPlacePhotoCacheKey);
  const candidates = [
    { occurrenceIds: ["origin-dubai", "return-dubai"], cacheKey: dubai!, queries: ["Dubai UAE travel"] },
    { occurrenceIds: ["almaty"], cacheKey: almaty!, queries: ["Almaty Kazakhstan travel"] },
    { occurrenceIds: ["samarkand"], cacheKey: samarkand!, queries: ["Samarkand Uzbekistan travel"] },
  ];
  const selections = new Map<string, string>();
  let lookups = 0;
  await resolveRoutePhotoCandidates(candidates, (candidate, selection) => {
    if (selection.kind === "photo") candidate.occurrenceIds.forEach((id) => selections.set(id, selection.photo.src));
  }, {
    storage,
    trackPhoto: () => undefined,
    findPhotos: async (queries) => {
      lookups += 1;
      return { candidates: [{ ...validPhoto, src: `https://images.example.test/${encodeURIComponent(queries[0]!)}.jpg` }], configured: true, status: "resolved" };
    },
  });
  assert.equal(lookups, 3);
  assert.equal(selections.get("origin-dubai"), selections.get("return-dubai"));
  assert.ok(selections.get("almaty"));
  assert.ok(selections.get("samarkand"));

  await resolveRoutePhotoCandidates(candidates, (candidate, selection) => {
    if (selection.kind === "photo") candidate.occurrenceIds.forEach((id) => assert.equal(selection.photo.src, selections.get(id)));
  }, {
    storage,
    findPhotos: async () => { throw new Error("navigation and reload must reuse positive decisions"); },
  });
});

test("a no-result is neutral for this render and a later lookup can populate imagery", async () => {
  const storage = new MemoryStorage();
  const candidate = { occurrenceIds: ["fallback"], cacheKey: "no-photo", queries: ["no photo"] };
  let selection: unknown;
  await resolveRoutePhotoCandidates([candidate], (_candidate, value) => { selection = value; }, {
    storage,
    findPhotos: async () => ({ candidates: [], configured: true, status: "no-result" }),
  });
  assert.deepEqual(selection, { kind: "empty" });
  assert.equal(readRoutePhotoSelection(candidate.cacheKey, storage), null);

  await resolveRoutePhotoCandidates([candidate], (_candidate, value) => { selection = value; }, {
    storage,
    trackPhoto: () => undefined,
    findPhotos: async () => ({ candidates: [validPhoto], configured: true, status: "resolved" }),
  });
  assert.deepEqual(selection, { kind: "photo", photo: validPhoto });
  assert.deepEqual(readRoutePhotoSelection(candidate.cacheKey, storage), selection);
});

test("a later provider failure cannot replace a known positive image", async () => {
  const storage = new MemoryStorage();
  const candidate = { occurrenceIds: ["first", "repeat"], cacheKey: "same-destination", queries: ["same destination"] };
  saveRoutePhotoSelection(candidate.cacheKey, { kind: "photo", photo: validPhoto }, storage);
  const selected: unknown[] = [];
  await resolveRoutePhotoCandidates([candidate], (_candidate, selection) => { selected.push(selection); }, {
    storage,
    findPhotos: async () => { throw new Error("positive cache must not re-fetch"); },
  });
  assert.deepEqual(selected, [{ kind: "photo", photo: validPhoto }]);
  assert.deepEqual(readRoutePhotoSelection(candidate.cacheKey, storage), { kind: "photo", photo: validPhoto });
});

test("navigation retires the stale consumer without aborting the shared cache owner", async () => {
  const storage = new MemoryStorage();
  const controller = new AbortController();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let staleCommits = 0;
  const firstVisit = resolveRoutePhotoCandidates([
    { occurrenceIds: ["visit-one"], cacheKey: "shared-in-flight", queries: ["shared"] },
  ], () => { staleCommits += 1; }, {
    storage,
    signal: controller.signal,
    trackPhoto: () => undefined,
    findPhotos: async () => {
      await pending;
      return { candidates: [validPhoto], configured: true, status: "resolved" };
    },
  });

  controller.abort();
  release();
  await firstVisit;
  assert.equal(staleCommits, 0);
  assert.deepEqual(readRoutePhotoSelection("shared-in-flight", storage), { kind: "photo", photo: validPhoto });

  let nextVisit: unknown;
  await resolveRoutePhotoCandidates([
    { occurrenceIds: ["visit-two"], cacheKey: "shared-in-flight", queries: ["shared"] },
  ], (_candidate, selection) => { nextVisit = selection; }, {
    storage,
    findPhotos: async () => { throw new Error("completed shared lookup must be cached"); },
  });
  assert.deepEqual(nextVisit, { kind: "photo", photo: validPhoto });
});
