import assert from "node:assert/strict";
import test from "node:test";

import {
  findRoutePhotos,
  routePhotoFromUnknown,
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
  assert.deepEqual(result, { candidates: [validPhoto], configured: true });
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
    { candidates: [], configured: true },
  );
});
