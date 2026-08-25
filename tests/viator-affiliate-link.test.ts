import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the Viator CTA uses sponsored new-tab link protections", () => {
  const source = readFileSync("components/journey-booking-readiness.tsx", "utf8");
  assert.match(source, /target="_blank" rel=\{action\.affiliate \? "sponsored noopener noreferrer" : "noopener noreferrer"\}/);
  assert.match(source, /trackEvent\("affiliate_link_clicked", \{ partner: "viator", placement: "trip_prep_booking_readiness", tripId: action\.tripId, stopId: action\.stopId \}\)/);
});
