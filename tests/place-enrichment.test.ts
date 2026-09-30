import assert from "node:assert/strict";
import test from "node:test";
import { isEnrichedPlace, isEnrichedReview, normalizeEnrichedPlace, normalizeEnrichedReview, placeEnrichmentEnabled, placeEnrichmentTypes, priceLevelLabel, validPlaceEnrichmentQuery } from "../lib/easyt/place-enrichment.ts";
import { safeGooglePhotoSourceUrl } from "../lib/easyt/google-place-photo.ts";

const rawPlace = {
  id: "ChIJtokyo-1",
  displayName: { text: "Tokyo National Museum" },
  location: { latitude: 35.7188, longitude: 139.7759 },
  primaryTypeDisplayName: { text: "Museum" },
  formattedAddress: "13-9 Uenokoen, Tokyo",
  googleMapsUri: "https://maps.google.com/?cid=123",
  rating: 4.5,
  userRatingCount: 2300,
  currentOpeningHours: { openNow: true, weekdayDescriptions: ["Monday: Closed", "Tuesday: 9:30 AM–5:00 PM"] },
  websiteUri: "https://www.tnm.jp/",
  photos: [{ name: "places/ChIJtokyo-1/photos/photo-1" }],
};

test("normalizes a useful place and optional detail without leaking raw provider payload", () => {
  assert.deepEqual(normalizeEnrichedPlace(rawPlace), {
    providerPlaceId: "ChIJtokyo-1", name: "Tokyo National Museum", coordinates: [139.7759, 35.7188],
    category: "Museum", address: "13-9 Uenokoen, Tokyo", mapsUrl: "https://maps.google.com/?cid=123",
    rating: 4.5, ratingCount: 2300, openNow: true,
    hours: ["Monday: Closed", "Tuesday: 9:30 AM–5:00 PM"], website: "https://www.tnm.jp/", hasPhoto: true,
  });
});

test("drops malformed identities and coordinates; omits unavailable and unsafe optional data", () => {
  assert.equal(normalizeEnrichedPlace({ ...rawPlace, id: "bad/id" }), null);
  assert.equal(normalizeEnrichedPlace({ ...rawPlace, location: { latitude: 92, longitude: 139 } }), null);
  assert.deepEqual(normalizeEnrichedPlace({ ...rawPlace, rating: 9, userRatingCount: -1, websiteUri: "javascript:alert(1)", googleMapsUri: "https://evil.test", currentOpeningHours: {}, photos: [] }), {
    providerPlaceId: "ChIJtokyo-1", name: "Tokyo National Museum", coordinates: [139.7759, 35.7188],
    category: "Museum", address: "13-9 Uenokoen, Tokyo",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Tokyo+National+Museum&query_place_id=ChIJtokyo-1",
  });
});

test("bounds categories and destination coordinates before any provider request", () => {
  assert.deepEqual(placeEnrichmentTypes("eat"), ["restaurant", "cafe"]);
  assert.equal(validPlaceEnrichmentQuery({ latitude: 35.7, longitude: 139.7, category: "see" }), true);
  assert.equal(validPlaceEnrichmentQuery({ latitude: 91, longitude: 139.7, category: "see" }), false);
  assert.equal(validPlaceEnrichmentQuery({ latitude: 35.7, longitude: 139.7, category: "all" }), false);
});

test("client accepts only normalized endpoint results", () => {
  const normalized = normalizeEnrichedPlace(rawPlace);
  assert.equal(isEnrichedPlace(normalized), true);
  assert.equal(isEnrichedPlace({ ...normalized, mapsUrl: "javascript:alert(1)" }), false);
  assert.equal(isEnrichedPlace({ ...normalized, coordinates: [999, 35] }), false);
});

test("feature requires an explicit server flag and an API key", () => {
  assert.equal(placeEnrichmentEnabled({ flag: undefined, key: "secret" }), false);
  assert.equal(placeEnrichmentEnabled({ flag: "enabled", key: undefined }), false);
  assert.equal(placeEnrichmentEnabled({ flag: "enabled", key: "secret" }), true);
});

test("price levels become useful copy only when recognized", () => {
  assert.equal(priceLevelLabel("PRICE_LEVEL_MODERATE"), "Moderate");
  assert.equal(priceLevelLabel("PRICE_LEVEL_UNSPECIFIED"), undefined);
  assert.equal(priceLevelLabel("unexpected"), undefined);
});

test("review text, author and source are bounded; unsafe outbound URLs are dropped", () => {
  const normalized = normalizeEnrichedReview({ text: { text: "A useful visit" }, rating: 5, googleMapsUri: "https://www.google.com/maps/reviews/1", authorAttribution: { displayName: "A traveller", uri: "https://www.google.com/maps/contrib/1", photoUri: "https://lh3.googleusercontent.com/avatar" } });
  assert.equal(isEnrichedReview(normalized), true);
  assert.equal(normalized?.author.name, "A traveller");
  assert.equal(normalizeEnrichedReview({ text: { text: "Unsafe" }, googleMapsUri: "https://attacker.test/review", authorAttribution: { displayName: "A traveller" } }), null);
  assert.equal(normalizeEnrichedReview({ text: { text: "Unsafe" }, googleMapsUri: "javascript:alert(1)", authorAttribution: { displayName: "A traveller" } }), null);
  assert.equal(safeGooglePhotoSourceUrl("https://www.google.com/maps/place/photo"), "https://www.google.com/maps/place/photo");
  assert.equal(safeGooglePhotoSourceUrl("https://attacker.test/photo"), null);
});
