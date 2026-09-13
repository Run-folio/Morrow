import assert from "node:assert/strict";
import test from "node:test";

import { qualityControlledLocalPlaces, type LocalPlaceResult } from "../lib/easyt/local-place-results.ts";

function place(overrides: Partial<LocalPlaceResult> = {}): LocalPlaceResult {
  return {
    id: "osm-1",
    name: "Sushi Dai",
    address: "Toyosu Market, Tokyo",
    category: "restaurant",
    coordinates: [139.785, 35.644],
    distanceKm: 1.2,
    provider: "openstreetmap",
    ...overrides,
  };
}

test("strong canonical restaurant identity wins over an exact weak fallback duplicate", () => {
  const results = qualityControlledLocalPlaces([
    place(),
    place({ id: "google-ChIJ123", provider: "google-places", rating: 4.6, reviewCount: 1842, priceLevel: "PRICE_LEVEL_MODERATE" }),
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.id, "google-ChIJ123");
  assert.equal(results[0]?.rating, 4.6);
});

test("similar restaurant names and repeated provider identities retain conservative semantics", () => {
  const results = qualityControlledLocalPlaces([
    place(),
    place({ id: "osm-2", name: "Sushi Daiwa", coordinates: [139.78505, 35.64405] }),
    place({ id: "osm-3", coordinates: [139.8, 35.66] }),
  ]);
  assert.deepEqual(results.map((result) => result.id), ["osm-1", "osm-2", "osm-3"]);
});

test("malformed and generic unnamed candidates are rejected without inventing metadata", () => {
  const results = qualityControlledLocalPlaces([
    place({ id: "blank", name: "  " }),
    place({ id: "generic", name: "Restaurant" }),
    place({ id: "valid", name: "Tempura Kondo" }),
  ]);
  assert.deepEqual(results.map((result) => result.id), ["valid"]);
  assert.equal(results[0]?.rating, undefined);
  assert.equal(results[0]?.reviewCount, undefined);
  assert.equal(results[0]?.image, undefined);
});

test("quality control does not impose a two-or-three result ceiling and images remain optional", () => {
  const fixtures = Array.from({ length: 10 }, (_, index) => place({ id: `google-${index}`, name: `Tokyo restaurant ${index + 1}`, coordinates: [139.7 + index * 0.01, 35.6], provider: "google-places" }));
  assert.equal(qualityControlledLocalPlaces(fixtures).length, 10);
});
