import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyAnalyticsSaveError,
  cleanAnalyticsProperties,
  normalizeAnalyticsPath,
  sanitizeAnalyticsDestination,
  trackEvent,
  type LaunchAnalyticsEventMap,
} from "../lib/analytics.ts";

test("analytics paths omit query data and collapse opaque workspace IDs", () => {
  assert.equal(normalizeAnalyticsPath("/journey/home?brief=private"), "/journey/home");
  assert.equal(normalizeAnalyticsPath("/journey/trip-123/map?stay=stop-2"), "/journey/[tripId]/map");
  assert.equal(normalizeAnalyticsPath("/journey/dashboard#trips"), "/journey/dashboard");
});

test("analytics link destinations never retain query data or external paths", () => {
  assert.equal(sanitizeAnalyticsDestination("/journey/trip-123/map?token=private", "https://morrovia.com"), "/journey/[tripId]/map");
  assert.equal(sanitizeAnalyticsDestination("https://partner.example/book/private-reference?email=private", "https://morrovia.com"), "https://partner.example");
});

test("analytics payload cleaning removes empty values without changing safe coarse metadata", () => {
  assert.deepEqual(cleanAnalyticsProperties({
    stop_count: 4,
    has_dates: true,
    workspace_view: "map",
    optional: undefined,
    absent: null,
    empty: "",
  }), {
    stop_count: 4,
    has_dates: true,
    workspace_view: "map",
  });
});

test("save failures are reduced to machine-safe categories", () => {
  assert.equal(classifyAnalyticsSaveError(new TypeError("fetch failed")), "network");
  assert.equal(classifyAnalyticsSaveError(new Error("Authentication required")), "auth");
  assert.equal(classifyAnalyticsSaveError(new Error("Trip ownership mismatch")), "conflict");
  assert.equal(classifyAnalyticsSaveError(new Error("Cloud save failed")), "repository");
  assert.equal(classifyAnalyticsSaveError(new Error("Unexpected")), "unknown");
});

test("analytics is a safe no-op outside the browser and without configuration", () => {
  assert.doesNotThrow(() => trackEvent("trip_generated", {
    trip_source: "builder",
    stop_count: 3,
    duration_days: 10,
    traveller_count: 2,
    has_dates: true,
    save_state: "local",
    result: "usable",
  }));
});

const privacySafeGeneration: LaunchAnalyticsEventMap["trip_generated"] = {
  trip_source: "homepage",
  stop_count: 4,
  traveller_count: 2,
  has_dates: true,
  save_state: "local",
  result: "usable",
};
assert.equal(privacySafeGeneration.stop_count, 4);

if (false) {
  // @ts-expect-error launch payloads deliberately reject raw prompt text
  trackEvent("trip_generated", { ...privacySafeGeneration, raw_prompt: "private trip text" });
}
