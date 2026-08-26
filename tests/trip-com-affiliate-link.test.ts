import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Trip.com accommodation CTAs preserve sponsored new-tab protections and affiliate attribution", () => {
  const readiness = readFileSync("components/journey-booking-readiness.tsx", "utf8");
  const prep = readFileSync("components/journey-trip-prep-accommodation.tsx", "utf8");
  const itinerary = readFileSync("components/journey-itinerary-accommodation.tsx", "utf8");

  for (const source of [readiness, prep, itinerary]) {
    assert.match(source, /target="_blank" rel=\{action\.affiliate \? "sponsored noopener noreferrer" : "noopener noreferrer"\}/);
  }
  assert.match(prep, /trackEvent\("affiliate_click", \{ category: "accommodation", provider: action\.provider, trip_id: trip\.id, stop_id: stop\.id, placement: "trip_prep_accommodation", workspace_view: "prep" \}\)/);
  assert.match(itinerary, /trackEvent\("affiliate_click", \{ category: "accommodation", provider: action\.provider, trip_id: trip\.id, stop_id: stop\.id, placement: "itinerary_accommodation", workspace_view: "itinerary" \}\)/);
  assert.match(prep, /\}>\{action\.cta\} <ArrowUpRight/);
  assert.match(itinerary, /\}>\{action\.cta\} <ArrowUpRight/);
});
