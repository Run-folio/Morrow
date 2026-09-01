import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Trip.com accommodation CTAs preserve sponsored new-tab protections and affiliate attribution", () => {
  const prep = readFileSync("components/easyt/trip-preparation.tsx", "utf8");
  const itinerary = readFileSync("components/journey-itinerary-accommodation.tsx", "utf8");
  const mapStayFinder = readFileSync("components/journey-local-finder.tsx", "utf8");

  for (const source of [prep, itinerary]) {
    assert.match(source, /target="_blank" rel=\{action\.affiliate \? "sponsored noopener noreferrer" : "noopener noreferrer"\}/);
  }
  assert.match(prep, /placement: "overview_before_you_go"/);
  assert.match(itinerary, /trackEvent\("affiliate_click", \{ category: "accommodation", provider: action\.provider, trip_id: trip\.id, stop_id: stop\.id, placement: "map_stay_finder", workspace_view: "map" \}\)/);
  assert.match(itinerary, /\}>\{action\.cta\} <ArrowUpRight/);
  assert.match(mapStayFinder, /getAccommodationBookingUrl\(/);
  assert.match(mapStayFinder, /target="_blank" rel="sponsored noopener noreferrer"/);
  assert.match(mapStayFinder, /provider: affiliatePartners\.tripCom\.provider, placement: "map_stay_finder"/);
});
