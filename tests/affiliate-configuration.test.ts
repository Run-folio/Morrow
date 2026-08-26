import assert from "node:assert/strict";
import test from "node:test";

import { resolveOptionalAffiliateConfiguration, validateOptionalAffiliateUrl, warnOptionalAffiliateConfiguration } from "../lib/easyt/affiliate-configuration.ts";
import { buildBookingReadiness } from "../lib/easyt/booking-readiness.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const trip = (): EasyTTrip => ({
  schemaVersion: 1, id: "optional-config", ownerId: null, title: "Optional config", status: "draft", startDate: "2026-10-01", endDate: "2026-10-06", travellers: 2, currency: "GBP",
  brief: { origin: "London, United Kingdom", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: { paris: ["Louvre"] }, decisionSelections: { routeOrder: "entered", transportByLeg: { leg: "fastest" } } },
  stops: [
    { id: "paris", order: 0, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35, arrivalDate: "2026-10-01", departureDate: "2026-10-04", nights: 3 },
    { id: "rome", order: 1, name: "Rome", country: "Italy", latitude: 41.9, longitude: 12.49, arrivalDate: "2026-10-04", departureDate: "2026-10-07", nights: 2 },
  ],
  legs: [{ id: "leg", fromStopId: "paris", toStopId: "rome", mode: "flight", distanceKm: 1100, durationMinutes: 330, provider: "Estimate", routeMetadata: { planningEstimate: true, decisionOption: "fastest" } }],
  planItems: [], recommendations: [], createdAt: "2026-08-01", updatedAt: "2026-08-01",
});

test("unset optional partners remain disabled and quiet", () => {
  const configuration = resolveOptionalAffiliateConfiguration({
    BOOKING_AFFILIATE_ENABLED: "false",
    CAR_HIRE_AFFILIATE_ENABLED: "false",
    SAILY_AFFILIATE_ENABLED: "false",
    GROUND_TRANSPORT_AFFILIATE_ENABLED: "false",
  });
  assert.deepEqual(configuration.urls, {});
  assert.deepEqual(configuration.warnings, []);
});

test("an explicitly enabled partner with no URL emits a safe configuration warning", () => {
  const configuration = resolveOptionalAffiliateConfiguration({ CAR_HIRE_AFFILIATE_ENABLED: "true" });
  const messages: string[] = [];
  warnOptionalAffiliateConfiguration(configuration, (message) => messages.push(message));
  assert.deepEqual(configuration.urls, {});
  assert.deepEqual(configuration.warnings, [{ partner: "car_hire", configKey: "CAR_HIRE_AFFILIATE_URL", enabledKey: "CAR_HIRE_AFFILIATE_ENABLED", reason: "missing" }]);
  assert.deepEqual(messages, ["[affiliate-config] car_hire: CAR_HIRE_AFFILIATE_URL is missing while CAR_HIRE_AFFILIATE_ENABLED is enabled; the optional partner link remains disabled."]);
});

test("malformed, whitespace, and non-HTTP partner URLs are rejected without logging their values", () => {
  const configuration = resolveOptionalAffiliateConfiguration({
    BOOKING_AFFILIATE_URL: "https://",
    CAR_HIRE_AFFILIATE_URL: " javascript:alert(1)",
    SAILY_AFFILIATE_URL: "data:text/html,not-a-link",
    GROUND_TRANSPORT_AFFILIATE_URL: "https://partner.example/has whitespace",
  });
  const messages: string[] = [];
  warnOptionalAffiliateConfiguration(configuration, (message) => messages.push(message));
  assert.deepEqual(configuration.urls, {});
  assert.deepEqual(configuration.warnings.map((warning) => warning.reason), ["invalid", "invalid", "invalid", "invalid"]);
  assert.equal(messages.join(" ").includes("javascript:"), false);
  assert.equal(messages.join(" ").includes("data:text"), false);
  assert.equal(messages.every((message) => message.includes("_AFFILIATE_URL is invalid")), true);
});

test("valid HTTP(S) URLs preserve existing query parameters", () => {
  assert.equal(validateOptionalAffiliateUrl("http://partner.example/stays?campaign=approved"), "http://partner.example/stays?campaign=approved");
  assert.equal(validateOptionalAffiliateUrl("https://partner.example/car?ref=approved"), "https://partner.example/car?ref=approved");
  const configuration = resolveOptionalAffiliateConfiguration({
    BOOKING_AFFILIATE_URL: "https://partner.example/stays?campaign=approved",
    CAR_HIRE_AFFILIATE_URL: "http://partner.example/car?ref=approved",
  });
  assert.equal(configuration.urls.bookingUrl, "https://partner.example/stays?campaign=approved");
  assert.equal(configuration.urls.carHireUrl, "http://partner.example/car?ref=approved");
  assert.deepEqual(configuration.warnings, []);
});

test("a safe configured URL keeps existing contextual additions and invalid configuration falls back cleanly", () => {
  const configured = resolveOptionalAffiliateConfiguration({ BOOKING_AFFILIATE_URL: "https://partner.example/stays?campaign=approved" });
  const configuredStay = buildBookingReadiness(trip(), configured.urls).find((action) => action.id === "stay-paris");
  const configuredUrl = new URL(configuredStay?.href ?? "");
  assert.equal(configuredStay?.affiliate, true);
  assert.equal(configuredUrl.searchParams.get("campaign"), "approved");
  assert.equal(configuredUrl.searchParams.get("ss"), "Paris, France");
  assert.equal(configuredUrl.searchParams.get("checkin"), "2026-10-01");

  const rejected = resolveOptionalAffiliateConfiguration({ BOOKING_AFFILIATE_URL: "javascript:alert(1)" });
  const fallbackStay = buildBookingReadiness(trip(), rejected.urls).find((action) => action.id === "stay-paris");
  assert.equal(fallbackStay?.affiliate, false);
  assert.equal(new URL(fallbackStay?.href ?? "").hostname, "www.booking.com");
});
