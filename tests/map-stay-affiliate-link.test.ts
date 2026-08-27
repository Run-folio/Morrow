import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { affiliatePartners, getAccommodationBookingUrl } from "../lib/easyt/booking-readiness.ts";

const input = {
  stop: { id: "opaque-stop", name: "Traveller destination", country: "Traveller country" },
  dates: { checkIn: "2026-10-01", checkOut: "2026-10-04" },
  travellers: 2,
};

test("Map stay finder always uses the central generic Trip.com accommodation link", () => {
  assert.equal(getAccommodationBookingUrl(input), affiliatePartners.tripCom.accommodationUrl);
  assert.equal(getAccommodationBookingUrl(input, { provider: "trip.com", accommodationUrl: "" }), undefined);
  assert.equal(getAccommodationBookingUrl(input, { provider: "trip.com", accommodationUrl: "javascript:alert(1)" }), undefined);

  const finder = readFileSync("components/journey-local-finder.tsx", "utf8");
  const mapWorkspace = readFileSync("components/journey-map-planner-workspace.tsx", "utf8");
  assert.match(finder, /getAccommodationBookingUrl\(\{/);
  assert.match(finder, /provider: affiliatePartners\.tripCom\.provider, placement: "map_stay_finder"/);
  assert.match(finder, /tripId \? \{ trip_id: tripId \} : \{\}/);
  assert.match(finder, /stopId \? \{ stop_id: stopId \} : \{\}/);
  assert.equal((finder.match(/trackEvent\("affiliate_click"/g) ?? []).length, 1, "one outbound click emits one event");
  assert.doesNotMatch(finder, /bookingUrl|booking\.com/);
  assert.match(mapWorkspace, /JourneyLocalFinder[^\n]*tripId=\{customTrip\?\.id\} stopId=\{selectedTripStop\?\.id\}/);
});

test("Booking.com remains a property-discovery source, never a map stay outbound action", () => {
  const localSearch = readFileSync("app/api/journey-local-search/route.ts", "utf8");
  const inventorySearch = readFileSync("app/api/journey-accommodation-search/route.ts", "utf8");
  assert.doesNotMatch(localSearch, /booking\.com\/searchresults|bookingUrl/);
  assert.doesNotMatch(inventorySearch, /bookingUrl|deep_link_url/);
  assert.match(inventorySearch, /demandapi\.booking\.com/);
  assert.match(inventorySearch, /provider: "booking-demand"/);
});
