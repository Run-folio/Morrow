import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { affiliateClickEventForAction } from "../lib/easyt/affiliate-click.ts";
import { affiliatePartners, getCurrentPartnerAction } from "../lib/easyt/booking-readiness.ts";

test("the homepage Saily handoff is attributable, disclosed and privacy-safe", () => {
  const home = readFileSync("app/journey/home/home-footer.tsx", "utf8");
  const link = readFileSync("components/easyt/affiliate-link.tsx", "utf8");
  const event = readFileSync("lib/easyt/affiliate-click.ts", "utf8");
  const action = getCurrentPartnerAction("connectivity");
  assert.ok(action);
  assert.equal(action.href, affiliatePartners.saily.connectivityUrl);
  assert.equal(action.href, "https://go.saily.site/aff_c?offer_id=101&aff_id=16085");
  assert.deepEqual(affiliateClickEventForAction(action, { placement: "homepage_connectivity" }), {
    name: "affiliate_click",
    properties: {
      category: "connectivity",
      provider: "saily",
      placement: "homepage_connectivity",
      trip_id: undefined,
      stop_id: undefined,
      workspace_view: undefined,
      destination_count: undefined,
    },
  });
  assert.match(home, /getCurrentPartnerAction\(category\)/);
  assert.match(home, /<MorroviaAffiliateLink action=\{action\} context=\{\{ placement \}\}/);
  assert.match(home, /<small className=\{styles\.partnerDisclosure\}>\{affiliateDisclosure\}<\/small>/);
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="sponsored noopener noreferrer"/);
  assert.match(link, /Partner link · Morrovia may earn a commission at no extra cost to you/);
  assert.match(link, /Booking, payment and provider terms apply on the partner’s site/);
  assert.match(link, /trackEvent\(event\.name, event\.properties\)/);
  assert.match(event, /name: "affiliate_click"/);
  assert.doesNotMatch(event, /raw_prompt|traveller|booking_reference|notes/i);
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
  const link = readFileSync("components/easyt/affiliate-link.tsx", "utf8");
  assert.match(source, /rel="sponsored noopener noreferrer"/);
  assert.match(source, /provider: affiliatePartners\.tripCom\.provider, placement: "map_stay_finder"/);
  assert.match(source, /<small>\{affiliateDisclosure\}<\/small>/);
  assert.match(link, /Partner link · Morrovia may earn a commission at no extra cost to you/);
});

test("stay ranking does not reference affiliate or commission inputs", () => {
  const source = readFileSync("lib/easyt/recommendations.ts", "utf8");
  assert.doesNotMatch(source, /affiliate|commission|provider|revenue/i);
});
