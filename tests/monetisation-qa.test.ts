import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the homepage Saily handoff is attributable, disclosed and privacy-safe", () => {
  const source = readFileSync("app/journey/home/home-footer.tsx", "utf8");
  assert.match(source, /https:\/\/go\.saily\.site\/aff_c\?offer_id=101&aff_id=16085/);
  assert.match(source, /rel="sponsored noopener noreferrer"/);
  assert.match(source, /Partner link · Morrovia may earn a commission at no extra cost to you/);
  assert.match(source, /trackEvent\("affiliate_click", \{ category: "connectivity", provider: "saily", placement: "home_footer" \}\)/);
  assert.doesNotMatch(source, /tripId|trip_id|stopId|stop_id|traveller/i);
});

test("trip-readiness Saily links retain sponsored semantics and placement attribution", () => {
  const source = readFileSync("components/journey-trip-readiness.tsx", "utf8");
  assert.match(source, /"sponsored noopener noreferrer"/);
  assert.match(source, /provider: card\.partner, placement: "trip_readiness", workspace_view: "prep"/);
});

test("Prep affiliate clicks carry stable placement without raw destination data", () => {
  const source = readFileSync("components/easyt/trip-prep-workspace.tsx", "utf8");
  assert.match(source, /placement: "trip_prep_booking_readiness"/);
  assert.match(source, /workspace_view: "prep"/);
  assert.doesNotMatch(source, /trackEvent\("affiliate_click",\s*\{[^}]*\b(?:city|country|traveller|raw_prompt):/);
});

test("accommodation fallbacks are not reported as commercial clicks", () => {
  const prep = readFileSync("components/journey-trip-prep-accommodation.tsx", "utf8");
  const itinerary = readFileSync("components/journey-itinerary-accommodation.tsx", "utf8");
  assert.match(prep, /if \(action\.affiliate\) trackEvent\("affiliate_click"/);
  assert.match(itinerary, /if \(action\.affiliate\) trackEvent\("affiliate_click"/);
});

test("non-affiliate stay fallbacks are not marked sponsored", () => {
  const source = readFileSync("components/journey-local-finder.tsx", "utf8");
  assert.match(source, /rel=\{chosen\.provider === "booking-demand" \? "sponsored noopener noreferrer" : "noopener noreferrer"\}/);
});

test("stay ranking does not reference affiliate or commission inputs", () => {
  const source = readFileSync("lib/easyt/recommendations.ts", "utf8");
  assert.doesNotMatch(source, /affiliate|commission|provider|revenue/i);
});
