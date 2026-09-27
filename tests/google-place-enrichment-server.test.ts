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
    return Response.json({ ...place, rating: 4.5, userRatingCount: 2300 });
  });
  assert.equal((await provider.details("ChIJtokyo-1"))?.rating, 4.5);
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
