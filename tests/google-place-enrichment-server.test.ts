import assert from "node:assert/strict";
import test from "node:test";
import { googlePlaceEnrichmentProvider } from "../lib/easyt/google-place-enrichment.server.ts";

const place = { id: "ChIJtokyo-1", displayName: { text: "Tokyo National Museum" }, location: { latitude: 35.7188, longitude: 139.7759 } };

test("nearby uses a narrow mask and returns normalized results", async () => {
  let calls = 0;
  const provider = googlePlaceEnrichmentProvider("secret", async (_url, init) => {
    calls++;
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)["X-Goog-Api-Key"], "secret");
    assert.doesNotMatch((init?.headers as Record<string, string>)["X-Goog-FieldMask"], /rating|photos|websiteUri/);
    assert.deepEqual(JSON.parse(String(init?.body)).includedTypes, ["tourist_attraction", "museum", "art_gallery", "park"]);
    return Response.json({ places: [place, { ...place, id: "bad/id" }] });
  });
  assert.equal((await provider.nearby({ latitude: 35.7, longitude: 139.7, category: "see" })).length, 1);
  assert.equal(calls, 1);
});

test("details load only for selected ID and normalize optional fields", async () => {
  const provider = googlePlaceEnrichmentProvider("secret", async (url, init) => {
    assert.match(String(url), /places\/ChIJtokyo-1$/);
    assert.match((init?.headers as Record<string, string>)["X-Goog-FieldMask"], /currentOpeningHours/);
    assert.doesNotMatch((init?.headers as Record<string, string>)["X-Goog-FieldMask"], /photos|reviews/);
    return Response.json({ ...place, rating: 4.5, userRatingCount: 2300 });
  });
  assert.equal((await provider.details("ChIJtokyo-1"))?.rating, 4.5);
});

test("selected reviews retain author and direct Google source but reject unsafe URLs", async () => {
  const provider = googlePlaceEnrichmentProvider("secret", async (url, init) => {
    assert.match(String(url), /places\/ChIJtokyo-1$/);
    assert.equal((init?.headers as Record<string, string>)["X-Goog-FieldMask"], "id,reviews");
    return Response.json({ id: "ChIJtokyo-1", reviews: [
      { text: { text: "Useful visit" }, rating: 5, googleMapsUri: "https://www.google.com/maps/reviews/review-1", authorAttribution: { displayName: "Reviewer", uri: "https://www.google.com/maps/contrib/1", photoUri: "https://lh3.googleusercontent.com/avatar" } },
      { text: { text: "Unsafe" }, rating: 4, googleMapsUri: "javascript:alert(1)", authorAttribution: { displayName: "Unsafe", uri: "javascript:alert(1)" } },
    ] });
  });
  assert.deepEqual(await provider.reviews("ChIJtokyo-1"), [{
    text: "Useful visit", rating: 5, sourceUrl: "https://www.google.com/maps/reviews/review-1",
    author: { name: "Reviewer", url: "https://www.google.com/maps/contrib/1", avatarUrl: "https://lh3.googleusercontent.com/avatar" },
  }]);
});

test("selected photo fetches fresh metadata and media with its exact source and author credit", async () => {
  const calls: string[] = [];
  const provider = googlePlaceEnrichmentProvider("secret", async (url, init) => {
    calls.push(String(url));
    if (calls.length === 1) {
      assert.equal((init?.headers as Record<string, string>)["X-Goog-FieldMask"], "id,photos");
      return Response.json({ id: "ChIJtokyo-1", photos: [{
        name: "places/ChIJtokyo-1/photos/photo-1", googleMapsUri: "https://www.google.com/maps/place/photo-1",
        authorAttributions: [{ displayName: "Photographer", uri: "https://www.google.com/maps/contrib/photographer" }],
      }] });
    }
    assert.match(String(url), /places\/ChIJtokyo-1\/photos\/photo-1\/media\?maxWidthPx=960&maxHeightPx=640$/);
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
  });
  const photo = await provider.photo("ChIJtokyo-1");
  assert.equal(photo?.contentType, "image/jpeg");
  assert.equal(photo?.sourceUrl, "https://www.google.com/maps/place/photo-1");
  assert.deepEqual(photo?.attributions, [{ displayName: "Photographer", uri: "https://www.google.com/maps/contrib/photographer" }]);
  assert.equal(calls.length, 2);
});

test("optional photo/review failure does not erase base details", async () => {
  const provider = googlePlaceEnrichmentProvider("secret", async (url) => {
    if (String(url).endsWith("/media")) return new Response("missing", { status: 404 });
    if (String(url).includes("photos")) return Response.json({ id: "ChIJtokyo-1", photos: [] });
    return Response.json({ ...place, displayName: { text: "Museum" } });
  });
  assert.equal((await provider.details("ChIJtokyo-1"))?.name, "Museum");
  assert.deepEqual(await provider.reviews("ChIJtokyo-1"), []);
  assert.equal(await provider.photo("ChIJtokyo-1"), null);
});

test("provider errors, quota, timeout and malformed payload fail closed", async () => {
  for (const status of [401, 403, 429, 500]) {
    const provider = googlePlaceEnrichmentProvider("secret", async () => new Response("error", { status }));
    await assert.rejects(provider.nearby({ latitude: 35.7, longitude: 139.7, category: "eat" }));
  }
  const malformed = googlePlaceEnrichmentProvider("secret", async () => Response.json({ places: "bad" }));
  await assert.rejects(malformed.nearby({ latitude: 35.7, longitude: 139.7, category: "eat" }));
  const timeout = googlePlaceEnrichmentProvider("secret", async () => { throw new DOMException("timed out", "TimeoutError"); });
  await assert.rejects(timeout.details("ChIJtokyo-1"));
  await assert.rejects(malformed.details("invalid/id"));
});

test("an empty valid nearby response is a safe empty result", async () => {
  const provider = googlePlaceEnrichmentProvider("secret", async () => Response.json({}));
  assert.deepEqual(await provider.nearby({ latitude: 35.7, longitude: 139.7, category: "stay" }), []);
});
