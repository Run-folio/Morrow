import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/journey-place-enrichment/route.ts", import.meta.url), "utf8");
const detail = readFileSync(new URL("../components/easyt/map-place-enrichment.tsx", import.meta.url), "utf8");

test("all selected-only Places modes retain the authenticated no-store server boundary", () => {
  assert.match(route, /await requireEasyTOwner\(\)/);
  assert.match(route, /const noStore = \{ "Cache-Control": "private, no-store" \}/);
  for (const mode of ["nearby", "details", "resolve", "reviews", "photo"]) {
    assert.match(route, new RegExp(`mode === "${mode}"`));
  }
  assert.match(route, /provider\.reviews\(id\)/);
  assert.match(route, /provider\.photo\(id\)/);
  assert.match(route, /resolveGooglePlaceReference\(reference, provider\)/);
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY/);
});

test("selected media is credited at its source and current opening state is not a future-day promise", () => {
  assert.match(detail, /Open now \(at lookup\)/);
  assert.match(detail, /View source photo/);
  assert.match(detail, /View review on Google Maps/);
  assert.match(detail, /review\.author\.name/);
  assert.doesNotMatch(detail, /dangerouslySetInnerHTML/);
});
