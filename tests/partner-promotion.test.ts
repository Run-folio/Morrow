import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { affiliatePartners } from "../lib/easyt/booking-readiness.ts";
import { partnerPromotionForAction, partnerPromotions } from "../lib/easyt/partner-promotion.ts";

const omioAction = { provider: "omio", href: affiliatePartners.omio.transportUrl };

test("NEW10 is active before and at its final advertised instant, then expires automatically", () => {
  assert.equal(partnerPromotionForAction(omioAction, new Date("2026-11-30T22:58:59.999Z"))?.code, "NEW10");
  assert.equal(partnerPromotionForAction(omioAction, new Date("2026-11-30T22:59:00.000Z"))?.code, "NEW10");
  assert.equal(partnerPromotionForAction(omioAction, new Date("2026-11-30T22:59:00.001Z")), null);
  assert.equal(partnerPromotions.omioNewCustomer.expiresAt, "2026-11-30T23:59:00+01:00");
});

test("the web promotion is complete, cautious and excludes the app-only code", () => {
  const promotion = partnerPromotions.omioNewCustomer;
  assert.deepEqual(promotion.maximumPurchase, { amount: 80, currency: "EUR" });
  assert.equal(promotion.discountPercent, 10);
  assert.equal(promotion.newCustomersOnly, true);
  assert.equal(promotion.termsUrl, "https://www.omio.com/coupon");
  assert.equal(JSON.stringify(promotion).includes("APPNEW10"), false);

  const component = readFileSync("components/easyt/partner-promotion.tsx", "utf8");
  assert.match(component, /New to Omio\? Save \{promotion\.discountPercent\}%/);
  assert.match(component, /purchases up to €\{promotion\.maximumPurchase\.amount\}/);
  assert.match(component, /First-time Omio customers only/);
  assert.match(component, /Valid until 30 Nov 2026/);
  assert.match(component, /aria-label="Omio promotion terms, opens in a new tab"/);
  assert.doesNotMatch(component, /APPNEW10/);
});

test("promotion follows the actual outbound provider and requires a safe URL", () => {
  assert.equal(partnerPromotionForAction(omioAction, new Date("2026-11-01T00:00:00Z"))?.provider, "omio");
  assert.equal(partnerPromotionForAction({ provider: "trip.com", href: affiliatePartners.tripCom.carRentalUrl }), null);
  assert.equal(partnerPromotionForAction({ provider: "google", href: "https://www.google.com/travel/flights" }), null);
  assert.equal(partnerPromotionForAction({ provider: "omio", href: "" }), null);
  assert.equal(partnerPromotionForAction({ provider: "omio", href: "javascript:alert(1)" }), null);
  assert.equal(partnerPromotionForAction(null), null);
});

test("promotion resolution never rewrites the approved outbound Omio URL", () => {
  const before = { ...omioAction };
  partnerPromotionForAction(omioAction, new Date("2026-11-01T00:00:00Z"));
  assert.deepEqual(omioAction, before);
  assert.equal(omioAction.href, "https://omio.sjv.io/2RBeqD");
  assert.equal(new URL(omioAction.href).search, "");
});

test("promotion rendering adds no affiliate analytics or trip mutation handlers", () => {
  const component = readFileSync("components/easyt/partner-promotion.tsx", "utf8");
  assert.doesNotMatch(component, /trackEvent|onClick|mutat|saveTrip/);
  assert.match(component, /window\.setTimeout\(\(\) => setCurrentNow\(new Date\(\)\), delay\)/);
  const termsAnchor = component.match(/<a href=\{promotion\.termsUrl\}[\s\S]*?<\/a>/)?.[0] ?? "";
  assert.doesNotMatch(termsAnchor, /sponsored|affiliate|onClick/);
});

test("Storybook uses production owners for active, expired, provider and 390px states", () => {
  const story = readFileSync("components/easyt/partner-promotion.stories.tsx", "utf8");
  assert.match(story, /MorroviaAffiliateLink action=\{omioTransportAction\}/);
  assert.match(story, /<small>\{affiliateDisclosure\}<\/small>/);
  assert.match(story, /ActiveOmioNewCustomerOffer/);
  assert.match(story, /ExpiredOffer/);
  assert.match(story, /NonOmioProvider/);
  assert.match(story, /defaultViewport: "mobile390"/);
});
