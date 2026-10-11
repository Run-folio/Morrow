import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalPlacePhotoCacheKey,
  findRoutePhotos,
  discardFailedRoutePhoto,
  readRoutePhotoSelection,
  resolveRoutePhotoCandidates,
  resolveDistinctRoutePhotoCandidates,
  routePhotoFromUnknown,
  saveRoutePhotoSelection,
} from "../lib/easyt/route-photo-cache.ts";

test('different destination identities do not reuse one Commons asset, but repeat occurrences share it',async()=>{
 const first={...validPhoto,id:'File:Shared.jpg',provider:'wikimedia' as const,src:'https://upload.wikimedia.org/wikipedia/commons/a/ab/shared-800.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:Shared.jpg',author:'A',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'};
 const resized={...first,src:'https://upload.wikimedia.org/wikipedia/commons/a/ab/shared-1200.jpg'};
 const alternate={...first,id:'File:Alternate.jpg',src:'https://upload.wikimedia.org/wikipedia/commons/a/ab/alternate.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:Alternate.jpg'};
 const selected=new Map<string,string>();
 await resolveDistinctRoutePhotoCandidates([
  {cacheKey:'manila',occurrenceIds:['start','return'],queries:['Manila']},
  {cacheKey:'cebu',occurrenceIds:['cebu'],queries:['Cebu']},
 ],(candidate,selection)=>{if(selection.kind==='photo')candidate.occurrenceIds.forEach(id=>selected.set(id,selection.photo.id!));},{storage:null,trackPhoto:()=>undefined,
  findPhotos:async(_queries,_signal,_place,excluded)=>({candidates:[first,resized,alternate].filter(photo=>!excluded?.includes(photo.sourceUrl)),configured:true,status:'resolved'})});
 assert.equal(selected.get('start'),'File:Shared.jpg');
 assert.equal(selected.get('return'),'File:Shared.jpg');
 assert.equal(selected.get('cebu'),'File:Alternate.jpg');
 const editedSelections:string[]=[];
 await resolveDistinctRoutePhotoCandidates([{cacheKey:'coron',occurrenceIds:['new-stop'],queries:['Coron']}],
  (_candidate,selection)=>{if(selection.kind==='photo')editedSelections.push(selection.photo.id!);},
  {storage:null,trackPhoto:()=>undefined,reservedSources:[first.src,first.sourceUrl],
   findPhotos:async(_queries,_signal,_place,excluded)=>({candidates:[resized,alternate].filter(photo=>!excluded?.includes(photo.sourceUrl)),configured:true,status:'resolved'})});
 assert.deepEqual(editedSelections,['File:Alternate.jpg'],'trip edits reserve already displayed destination assets');
});

test("Wikimedia cache round-trips full rights and rejects missing licence metadata", () => {
  const photo = { src: "https://upload.wikimedia.org/wikipedia/commons/a/ab/photo.jpg", sourceUrl: "https://commons.wikimedia.org/wiki/File:Photo.jpg", sourceLabel: "Author · CC BY 4.0", provider: "wikimedia" as const, author: "Author", authorUrl: "https://commons.wikimedia.org/wiki/User:Author", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" };
  assert.deepEqual(routePhotoFromUnknown(photo), photo);
  assert.equal(routePhotoFromUnknown({ ...photo, licenseUrl: undefined }), null);
  const thumbnail = "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Photo.jpg/1200px-Photo.jpg";
  assert.equal(routePhotoFromUnknown({ ...photo, src: thumbnail })?.src, thumbnail);
  assert.equal(routePhotoFromUnknown({ ...photo, src: "https://thumb.wikimedia.org/other/Photo.jpg" }), null);
  assert.equal(routePhotoFromUnknown({ ...photo, src: "https://upload.wikimedia.org/wikipedia/en/a/ab/Photo.jpg" }), null);
});

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

test("place lookup passes disambiguating region and type in its single API request", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input), "http://localhost");
    assert.equal(url.searchParams.get("place"), "Portland");
    assert.equal(url.searchParams.get("country"), "United States");
    assert.equal(url.searchParams.get("region"), "Oregon");
    assert.equal(url.searchParams.get("placeType"), "city");
    return Response.json({ image: null, candidates: [], configured: true, reason: "no-result" });
  };
  const result = await findRoutePhotos(["Portland United States travel", "Portland landmark"], undefined,
    { name: "Portland", country: "United States", region: "Oregon", placeType: "city", coordinates: [-122.6765, 45.5231] });
  assert.equal(result.status, "no-result");
  assert.equal(calls, 1);
});
test('a selected district and stable canonical identity reach the photo endpoint', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async input => {
    const params = new URL(String(input), 'http://localhost').searchParams;
    assert.equal(params.get('place'), 'Shenzhen');
    assert.equal(params.get('region'), 'Guangdong');
    assert.equal(params.get('district'), 'Maoming Shi');
    assert.equal(params.get('canonicalPlaceId'), 'reference:geonames:1795566');
    assert.equal(params.get('lon'), '111.11793');
    return Response.json({ image: null, candidates: [], configured: true, reason: 'no-result' });
  };
  const result = await findRoutePhotos(['Shenzhen China travel'], undefined, { name: 'Shenzhen', country: 'China',
    region: 'Guangdong', administrativeHierarchy: ['Guangdong', 'Maoming Shi'],
    canonicalPlaceId: 'reference:geonames:1795566', coordinates: [111.11793, 22.1823] });
  assert.equal(result.status, 'no-result');
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

test("failed positive recovery targets only its identity and never erases a newer choice", async () => {
  const storage = new MemoryStorage(), key = "failed-positive-recovery";
  saveRoutePhotoSelection(key, { kind: "photo", photo: validPhoto }, storage);
  saveRoutePhotoSelection("unrelated-image", { kind: "photo", photo: validPhoto }, storage);
  discardFailedRoutePhoto(key, validPhoto.src, storage);
  assert.equal(readRoutePhotoSelection(key, storage), null);
  assert.ok(readRoutePhotoSelection("unrelated-image", storage));
  let selected: unknown;
  const recovered = { ...validPhoto, src: "https://images.example.test/recovered.jpg" };
  await resolveRoutePhotoCandidates([{ cacheKey: key, occurrenceIds: ["first", "repeat"], queries: ["destination"], excludedSources: [validPhoto.src] }], (_, value) => { selected = value; }, {
    storage, trackPhoto: () => undefined, findPhotos: async (_, __, ___, excluded) => {
      assert.ok(excluded?.includes(validPhoto.src));return { candidates: [validPhoto, recovered], configured: true, status: "resolved" };
    },
  });
  assert.deepEqual(selected, { kind: "photo", photo: recovered });
  discardFailedRoutePhoto(key, validPhoto.src, storage);
  assert.deepEqual(readRoutePhotoSelection(key, storage), selected);
});

test("a failed old in-flight URL cannot overwrite a recovered cache selection", async () => {
  const storage = new MemoryStorage(), key = "old-inflight-failed-recovery";
  let release!: () => void;const pending = new Promise<void>(resolve => { release = resolve; });
  const candidate = { cacheKey: key, occurrenceIds: ["first"], queries: ["destination"] };
  let oldCommits = 0;
  const old = resolveRoutePhotoCandidates([candidate], () => { oldCommits++; }, { storage, trackPhoto: () => undefined, findPhotos: async () => { await pending;return { candidates: [validPhoto], configured: true, status: "resolved" }; } });
  discardFailedRoutePhoto(key, validPhoto.src, storage);
  const recovered = { ...validPhoto, src: "https://images.example.test/newer-recovery.jpg" };
  await resolveRoutePhotoCandidates([{ ...candidate, excludedSources: [validPhoto.src] }], () => {}, { storage, trackPhoto: () => undefined, findPhotos: async () => ({ candidates: [recovered], configured: true, status: "resolved" }) });
  release();await old;assert.equal(oldCommits, 0);
  assert.deepEqual(readRoutePhotoSelection(key, storage), { kind: "photo", photo: recovered });
});

test("photo cache keeps repeat visits together and separates changed selection context", () => {
  const first = canonicalPlacePhotoCacheKey({
    canonicalPlaceId: "geo:123",
    name: "Marrakech",
    country: "Morocco",
    coordinates: [-8.008, 31.63],
  });
  const repeated = canonicalPlacePhotoCacheKey({
    canonicalPlaceId: " GEO:123 ",
    name: "Marrakech",
    country: "Morocco",
    coordinates: [-8.008, 31.63],
  });
  assert.equal(first, repeated);
  assert.notEqual(first, canonicalPlacePhotoCacheKey({ canonicalPlaceId: "geo:123", name: "Marrakech",
    country: "Morocco", region: "Different region", coordinates: [-8.008, 31.63] }));
  assert.notEqual(first, canonicalPlacePhotoCacheKey({ canonicalPlaceId: "geo:123", name: "Marrakech",
    country: "Morocco", coordinates: [-8.01, 31.64] }));
  assert.equal(
    canonicalPlacePhotoCacheKey({ name: "  Almaty ", country: "KAZAKHSTAN" }),
    canonicalPlacePhotoCacheKey({ name: "almaty", country: "kazakhstan" }),
  );
});

test("the shared cache retains valid imagery but ignores and evicts persisted empty choices", () => {
  const storage = new MemoryStorage();
  saveRoutePhotoSelection("place:one", { kind: "photo", photo: validPhoto }, storage);
  storage.setItem("morrovia:route-photo:v5:place:two", JSON.stringify({ kind: "empty" }));

  assert.deepEqual(readRoutePhotoSelection("place:one", storage), { kind: "photo", photo: validPhoto });
  assert.equal(readRoutePhotoSelection("place:two", storage), null);
  assert.equal(storage.getItem("morrovia:route-photo:v5:place:two"), null);

  saveRoutePhotoSelection("place:two", { kind: "empty" }, storage);
  assert.equal(storage.getItem("morrovia:route-photo:v3:place:two"), null);
});

test('a previously cached place photo is revalidated after district safeguards change', () => {
  const storage = new MemoryStorage();
  storage.setItem('morrovia:route-photo:v2:district-place', JSON.stringify({ kind: 'photo', photo: validPhoto }));
  assert.equal(readRoutePhotoSelection('district-place', storage), null);
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

test("Wikimedia browser positives require the same reusable licence and matching URL as provider selections", () => {
  const photo = { src: "https://upload.wikimedia.org/wikipedia/commons/a/ab/photo.jpg", sourceUrl: "https://commons.wikimedia.org/wiki/File:Photo.jpg",
    sourceLabel: "Author · Licence", provider: "wikimedia", author: "Author" };
  for (const [license, licenseUrl] of [
    ["CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/"],
    ["CC BY-ND 4.0", "https://creativecommons.org/licenses/by-nd/4.0/"],
    ["CC BY-SA 4.0", "https://creativecommons.org/licenses/by/4.0/"],
    ["CC BY 4.0", "https://creativecommons.org/licenses/by/3.0/"],
    ["CC BY 99.0", "https://creativecommons.org/licenses/by/99.0/"],
    ["CC0", "https://creativecommons.org/publicdomain/mark/1.0/"],
  ]) assert.equal(routePhotoFromUnknown({ ...photo, license, licenseUrl }), null);
  for (const [license, licenseUrl] of [
    ["CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"],
    ["CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/"],
    ["CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"],
    ["Public domain", "https://creativecommons.org/publicdomain/mark/1.0/"],
  ]) assert.ok(routePhotoFromUnknown({ ...photo, license, licenseUrl }));
});
