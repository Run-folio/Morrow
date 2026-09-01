import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clearOptionalAnalyticsStorage,
  createPrivacyConsentRecord,
  hasAffiliateTrackingConsent,
  hasAnalyticsConsent,
  parsePrivacyConsent,
  PRIVACY_CONSENT_POLICY_VERSION,
  PRIVACY_CONSENT_STORAGE_KEY,
  readPrivacyConsent,
  storePrivacyConsent,
} from "../lib/privacy-consent.ts";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("fresh visitors have no decision and every optional category defaults off", () => {
  assert.deepEqual(parsePrivacyConsent(null), {
    preferences: { necessary: true, analytics: false, affiliateTracking: false },
    record: null,
    source: "none",
  });
});

test("reject optional stores the current policy version and remains rejected after reload", () => {
  const storage = new MemoryStorage();
  const record = storePrivacyConsent(storage, { analytics: false, affiliateTracking: false }, "2026-08-30T12:00:00.000Z");
  assert.equal(record.version, PRIVACY_CONSENT_POLICY_VERSION);
  assert.equal(readPrivacyConsent(storage).source, "current");
  assert.equal(hasAnalyticsConsent(storage), false);
  assert.equal(hasAffiliateTrackingConsent(storage), false);
});

test("accept optional enables both explicit categories and survives reload", () => {
  const storage = new MemoryStorage();
  storePrivacyConsent(storage, { analytics: true, affiliateTracking: true }, "2026-08-30T12:00:00.000Z");
  assert.equal(hasAnalyticsConsent(storage), true);
  assert.equal(hasAffiliateTrackingConsent(storage), true);
  assert.equal(readPrivacyConsent(storage).record?.decidedAt, "2026-08-30T12:00:00.000Z");
});

test("manage preferences persists granular choices", () => {
  const storage = new MemoryStorage();
  storePrivacyConsent(storage, { analytics: true, affiliateTracking: false });
  assert.equal(hasAnalyticsConsent(storage), true);
  assert.equal(hasAffiliateTrackingConsent(storage), false);
});

test("obsolete or malformed consent fails closed and legacy analytics consent never enables affiliate tracking", () => {
  assert.equal(parsePrivacyConsent("granted").source, "legacy-granted");
  assert.equal(parsePrivacyConsent("granted").preferences.affiliateTracking, false);
  assert.equal(parsePrivacyConsent("declined").source, "legacy-declined");
  assert.equal(parsePrivacyConsent("not-json").source, "invalid");
});

test("withdrawal clears only optional analytics state and preserves planner, auth-adjacent and preference data", () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const preserved = {
    "easyt-home-trip-draft": "private trip brief",
    "easyt:trip-recovery:v2:owner:trip": "recovery",
    "easyt-language": "es",
    "theme": "dark",
  };
  Object.entries(preserved).forEach(([key, value]) => localStorage.setItem(key, value));
  localStorage.setItem("morrovia:trip-intent-tracked:trip-1", "1");
  localStorage.setItem("ph_project_posthog", "optional-vendor-state");
  sessionStorage.setItem("morrovia:health-shown:trip-1", "1");
  sessionStorage.setItem("morrovia-stamps-expanded-regions", "[]");

  const removed = clearOptionalAnalyticsStorage({ localStorage, sessionStorage });
  assert.deepEqual(removed.localStorage.sort(), ["morrovia:trip-intent-tracked:trip-1", "ph_project_posthog"].sort());
  assert.deepEqual(removed.sessionStorage, ["morrovia:health-shown:trip-1"]);
  Object.entries(preserved).forEach(([key, value]) => assert.equal(localStorage.getItem(key), value));
  assert.equal(sessionStorage.getItem("morrovia-stamps-expanded-regions"), "[]");
});

test("optional SDK loaders are absent before consent and Omio is owned by the gated client boundary", () => {
  const rootLayout = readFileSync("app/layout.tsx", "utf8");
  const analytics = readFileSync("components/analytics.tsx", "utf8");
  const affiliate = readFileSync("components/optional-affiliate-tracking.tsx", "utf8");
  assert.doesNotMatch(rootLayout, /utt\.impactcdn\.com|transformLinks|trackImpression/);
  assert.match(rootLayout, /<OptionalAffiliateTracking \/>/);
  assert.match(analytics, /!hasConsent/);
  assert.doesNotMatch(analytics, /clarity\.ms|microsoft-clarity/);
  const analyticsOwner = readFileSync("lib/analytics.ts", "utf8");
  for (const disabled of ["capture_dead_clicks: false", "capture_exceptions: false", "capture_heatmaps: false", "capture_performance: false", "advanced_disable_flags: true"]) {
    assert.match(analyticsOwner, new RegExp(disabled.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(affiliate, /hasAffiliateTrackingConsent\(\)/);
  assert.match(affiliate, /window\.impactStat\("transformLinks"\)/);
  assert.match(affiliate, /window\.location\.reload\(\)/);
});

test("cookie settings and notice are dedicated, public and use the canonical identity", () => {
  const page = readFileSync("app/journey/cookies/page.tsx", "utf8");
  const footer = readFileSync("components/morrovia-footer.tsx", "utf8");
  assert.match(page, /<CookiePreferences \/>/);
  assert.match(page, /morroviaLegalIdentity\.operatorTradingAs/);
  assert.match(page, /Better Auth session cookie/);
  assert.match(page, /Omio Impact/);
  assert.match(footer, /href="\/journey\/cookies#cookie-settings"/);
});

test("core planner and authentication owners do not depend on optional consent", () => {
  const auth = readFileSync("auth.config.ts", "utf8");
  const storage = readFileSync("lib/easyt/storage.ts", "utf8");
  assert.doesNotMatch(auth, /privacy-consent|hasAnalyticsConsent|easyt-analytics-consent/);
  assert.doesNotMatch(storage, /privacy-consent|hasAnalyticsConsent|easyt-analytics-consent/);
});

test("stored record has one established key and explicit policy version", () => {
  const record = createPrivacyConsentRecord({ analytics: false, affiliateTracking: true }, "2026-08-30T12:00:00.000Z");
  assert.equal(PRIVACY_CONSENT_STORAGE_KEY, "easyt-analytics-consent");
  assert.equal(record.version, "2026-08-30.1");
  assert.equal(record.necessary, true);
});
