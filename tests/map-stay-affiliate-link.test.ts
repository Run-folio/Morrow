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

test("Map planning-preview accommodation keeps one disclosed, attributable, state-neutral handoff", () => {
  const accommodation = readFileSync("components/journey-itinerary-accommodation.tsx", "utf8");
  const accommodationStyles = readFileSync("components/journey-itinerary-accommodation.module.css", "utf8");
  const mapWorkspace = readFileSync("components/journey-map-planner-workspace.tsx", "utf8");
  const outbound = accommodation.match(/\{datesReady && action \? <a[\s\S]*?<ArrowUpRight \/><\/a> : null\}/)?.[0] ?? "";

  assert.match(mapWorkspace, /<JourneyItineraryAccommodation compact trip=\{customTrip\}/);
  assert.match(accommodation, /placement: "map_stay_finder", workspace_view: "map"/);
  assert.doesNotMatch(accommodation, /placement: "itinerary_accommodation"|workspace_view: "itinerary"/);
  assert.equal((outbound.match(/trackEvent\("affiliate_click"/g) ?? []).length, 1, "one click dispatches exactly one existing affiliate event");
  assert.match(outbound, /category: "accommodation", provider: action\.provider, trip_id: trip\.id, stop_id: stop\.id/);
  assert.doesNotMatch(outbound, /prompt|traveller|booking.?reference|notes|mutate|setActions|onExploreMap|readiness/i);
  assert.match(outbound, /href=\{action\.href\} target="_blank" rel=\{action\.affiliate \? "sponsored noopener noreferrer" : "noopener noreferrer"\}/);
  assert.match(outbound, /\{action\.cta\} <ArrowUpRight/);

  assert.match(accommodation, /import \{ affiliateDisclosure \} from "@\/components\/easyt\/affiliate-link"/);
  assert.equal((accommodation.match(/\{affiliateDisclosure\}/g) ?? []).length, 1, "the shared compact disclosure renders once");
  assert.match(accommodation, /actions\.some\(\(action\) => action\.affiliate\) \? <small className=\{styles\.disclosure\}>\{affiliateDisclosure\}<\/small> : null/);
  assert.match(accommodationStyles, /@media\(max-width:390px\)[^}]*[\s\S]*?\.stayActions a,\.stayActions button\{width:100%;min-height:44px\}/);
});

test("Booking.com remains a property-discovery source, never a map stay outbound action", () => {
  const localSearch = readFileSync("app/api/journey-local-search/route.ts", "utf8");
  const inventorySearch = readFileSync("app/api/journey-accommodation-search/route.ts", "utf8");
  assert.doesNotMatch(localSearch, /booking\.com\/searchresults|bookingUrl/);
  assert.doesNotMatch(inventorySearch, /bookingUrl|deep_link_url/);
  assert.match(inventorySearch, /demandapi\.booking\.com/);
  assert.match(inventorySearch, /provider: "booking-demand"/);
});
