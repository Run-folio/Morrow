import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeCommercialOutboundClick, trackEvent } from "../lib/analytics.ts";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Stay outbound clicks retain their placement and workspace in the reporting projection", () => {
  assert.deepEqual(normalizeCommercialOutboundClick("affiliate_click", {
    category: "accommodation", provider: "trip.com", placement: "stay_workspace_detail",
    workspace_view: "stay", trip_id: "trip-opaque", stop_id: "stop-opaque", destination_count: 1,
  }), {
    canonical_event: "commercial_outbound_click", source_event: "affiliate_click", partner: "trip_com",
    placement: "stay_workspace_detail", category: "accommodation", workspace_view: "stay",
    trip_id: "trip-opaque", stop_id: "stop-opaque", destination_count: 1,
  });
});

test("accepted direct itinerary activity additions and Stay choices emit one safe funnel event", () => {
  const itinerary = read("components/easyt/trip-itinerary-workspace.tsx");
  const stay = read("components/easyt/trip-stay-workspace.tsx");
  const manualAdd = itinerary.slice(itinerary.indexOf("const submitAddFlow ="), itinerary.indexOf("const submitRailNote ="));
  const stayChoice = stay.slice(stay.indexOf("const chooseStay ="), stay.indexOf("const removeStay ="));
  assert.match(manualAdd, /if \(!accepted\)[\s\S]*?return;[\s\S]*?trackEvent\("itinerary_item_added", \{[^}]*trip_id: workingTrip\.id[^}]*stop_id: active\.stopId[^}]*\}\)/);
  assert.match(stayChoice, /if \(changed\) \{[\s\S]*?trackEvent\("stay_chosen", \{[^}]*trip_id: workingTrip\.id[^}]*stop_id: context\.stop\.id[^}]*\}\)/);
  assert.doesNotMatch(`${manualAdd}\n${stayChoice}`, /raw_prompt|destination_name|provider_query|booking_url/);
});

test("PostHog initialization is limited to the production analytics environment", () => {
  const analytics = read("lib/analytics.ts");
  const component = read("components/analytics.tsx");
  assert.match(analytics, /function ensurePostHogInitialized\(\) \{[\s\S]*?analyticsEnvironment\(\) !== "production"/);
  assert.match(component, /configuredForThisEnvironment = [^;]*analyticsEnvironment\(\) === "production"/);
});

test("Build reports a failed local save before leaving the user on the builder", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  const failedRecovery = builder.slice(builder.indexOf("if (!recovery.stored) {", builder.indexOf("const persistGeneratedTrip =")), builder.indexOf("if (usableTrip && !localSaveTrackedRef.current)", builder.indexOf("const persistGeneratedTrip =")));
  assert.match(failedRecovery, /trackEvent\("trip_save_failed", \{[^}]*save_state: "local"[^}]*\}\)/);
  assert.doesNotMatch(failedRecovery, /raw_prompt|trip\.title|error\.message/);
  const cloudConflict = builder.slice(builder.indexOf("if (cloudConflictTrip) {", builder.indexOf("const persistGeneratedTrip =")), builder.indexOf("if (!session?.user) return requestTrip", builder.indexOf("const persistGeneratedTrip =")));
  assert.match(cloudConflict, /trackEvent\("trip_save_failed", \{[^}]*save_state: "cloud"[^}]*error_type: "conflict"[^}]*\}\)/);
});

test("new funnel steps respect analytics consent independently of affiliate attribution", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    for (const preferences of [
      { analytics: false, affiliateTracking: true },
      { analytics: true, affiliateTracking: false },
    ]) {
      const calls: unknown[][] = [];
      const record = createPrivacyConsentRecord(preferences, "2026-10-05T12:00:00.000Z");
      Object.defineProperty(globalThis, "window", { configurable: true, value: {
        location: { pathname: "/journey/private-trip/stay", origin: "https://morrovia.com" },
        localStorage: { getItem: (key: string) => key === PRIVACY_CONSENT_STORAGE_KEY ? JSON.stringify(record) : null },
        gtag: (...args: unknown[]) => calls.push(args),
      } });
      trackEvent("itinerary_item_added", { trip_id: "opaque-trip", stop_id: "opaque-stop", source: "manual", item_kind: "activity" });
      trackEvent("stay_chosen", { trip_id: "opaque-trip", stop_id: "opaque-stop", source: "stay_workspace" });
      trackEvent("affiliate_click", { category: "accommodation", provider: "trip.com", placement: "stay_workspace_detail", workspace_view: "stay" });
      assert.equal(calls.length, preferences.analytics ? 3 : 0);
      if (preferences.analytics) {
        assert.deepEqual(calls.map((call) => call[1]), ["itinerary_item_added", "stay_chosen", "affiliate_click"]);
        assert.equal(JSON.stringify(calls).includes("/private-trip/"), false);
        assert.equal(JSON.stringify(calls).includes("search?"), false);
      }
    }
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
