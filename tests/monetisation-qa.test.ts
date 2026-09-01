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

test("Overview practical links retain sponsored semantics and placement attribution", () => {
  const source = readFileSync("components/easyt/trip-preparation.tsx", "utf8");
  assert.match(source, /"sponsored noopener noreferrer"/);
  assert.match(source, /placement: "overview_before_you_go"/);
});

test("Overview affiliate clicks carry stable placement without raw destination data", () => {
  const source = readFileSync("components/easyt/trip-preparation.tsx", "utf8");
  assert.match(source, /placement: "overview_before_you_go"/);
  assert.doesNotMatch(source, /workspace_view: "prep"/);
  assert.doesNotMatch(source, /trackEvent\("affiliate_click",\s*\{[^}]*\b(?:city|country|traveller|raw_prompt):/);
});

test("accommodation fallbacks are not reported as commercial clicks", () => {
  const prep = readFileSync("components/easyt/trip-preparation.tsx", "utf8");
  const itinerary = readFileSync("components/journey-itinerary-accommodation.tsx", "utf8");
  assert.match(prep, /else if \(action\.affiliate && action\.bookingCategory && action\.provider\)/);
  assert.match(itinerary, /if \(action\.affiliate\) trackEvent\("affiliate_click"/);
});

test("map stay handoffs are attributable Trip.com links with a disclosure", () => {
  const source = readFileSync("components/journey-local-finder.tsx", "utf8");
  assert.match(source, /rel="sponsored noopener noreferrer"/);
  assert.match(source, /provider: affiliatePartners\.tripCom\.provider, placement: "map_stay_finder"/);
  assert.match(source, /Partner link · Morrovia may earn a commission at no extra cost to you/);
});

test("stay ranking does not reference affiliate or commission inputs", () => {
  const source = readFileSync("lib/easyt/recommendations.ts", "utf8");
  assert.doesNotMatch(source, /affiliate|commission|provider|revenue/i);
});
