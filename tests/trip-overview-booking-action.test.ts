import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { affiliatePartners } from "../lib/easyt/booking-readiness.ts";

test("Overview surfaces an unresolved stay as the attributable Trip.com next action", () => {
  const source = readFileSync("components/easyt/trip-overview-workspace.tsx", "utf8");
  assert.match(source, /getBookingAction\(\{ category: "accommodation", trip, stop: missingStay \}\)/);
  assert.match(source, /href: missingStayAction\.href/);
  assert.match(source, /label: missingStayAction\.cta/);
  assert.match(source, /provider: missingStayAction\.provider/);
  assert.match(source, /affiliateCategory: missingStayAction\.category/);
  assert.equal(affiliatePartners.tripCom.accommodationUrl, "https://www.trip.com/t/pdAWQqi56W2");
});

test("Overview emits one privacy-safe generic affiliate event for Trip.com", () => {
  const source = readFileSync("components/easyt/trip-overview-workspace.tsx", "utf8");
  assert.match(source, /getBookingAction\(\{ category: "accommodation", trip, stop: missingStay \}\)/);
  assert.match(source, /trackEvent\("affiliate_click", \{ category: action\.affiliateCategory, provider: action\.provider, trip_id: trip\.id, stop_id: action\.stopId, placement: "overview_next_action", workspace_view: "overview" \}\)/);
  assert.doesNotMatch(source, /raw_prompt|traveller|country|city/);
});
