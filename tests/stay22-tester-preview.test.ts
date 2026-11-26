import assert from "node:assert/strict";
import { test } from "node:test";
import { createPrivacyConsentRecord } from "../lib/privacy-consent.ts";
import { isStay22TesterHost, isStay22Tester, stay22TesterSample, mayLoadStay22TesterMap } from "../lib/easyt/stay22-tester-preview.ts";

const origin = "https://staging.morrovia.com";
const email = "tester@example.test";
const user = { id: "tester", email, emailVerified: true };

test("tester preview fails closed unless both deployment and request use the canonical staging origin", () => {
  assert.equal(isStay22TesterHost(origin, origin), true);
  assert.equal(isStay22TesterHost(origin, "https://morrovia.com"), false);
  assert.equal(isStay22TesterHost("https://morrovia.com", origin), false);
  assert.equal(isStay22TesterHost(undefined, origin), false);
});
test("only the configured verified account is eligible", () => {
  assert.equal(isStay22Tester(user, email), true);
  assert.equal(isStay22Tester(null, email), false);
  assert.equal(isStay22Tester({ ...user, emailVerified: false }, email), false);
  assert.equal(isStay22Tester({ ...user, email: "other@example.test" }, email), false);
  assert.equal(isStay22Tester(user, undefined), false);
});
test("rehearsal sends only a fixed future Kyoto sample for two adults", () => {
  const result = stay22TesterSample("morrovia", new Date("2026-11-26T02:00:00Z"));
  assert.ok(result);
  assert.equal(result.checkIn, "2026-12-26");
  assert.equal(result.checkOut, "2026-12-28");
  for (const [view, href] of [["all", result.wideUrl], ["listview", result.narrowUrl]]) {
    const url = new URL(href);
    assert.equal(url.origin, "https://www.stay22.com");
    assert.equal(url.searchParams.get("viewmode"), view);
    assert.equal(url.searchParams.get("lat"), "35.0116");
    assert.equal(url.searchParams.get("adults"), "2");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["adults", "aid", "checkin", "checkout", "lat", "lng", ...(view === "all" ? ["listviewexpand"] : []), "viewmode", "zoom"].sort());
  }
  assert.equal(stay22TesterSample(undefined), null);
});
test("legacy and partial consent do not authorize the rehearsal", () => {
  const raw = (analytics: boolean, affiliateTracking: boolean) => JSON.stringify(createPrivacyConsentRecord({ analytics, affiliateTracking }));
  assert.equal(mayLoadStay22TesterMap("granted"), false);
  assert.equal(mayLoadStay22TesterMap(null), false);
  assert.equal(mayLoadStay22TesterMap(raw(true, false)), false);
  assert.equal(mayLoadStay22TesterMap(raw(false, true)), false);
  assert.equal(mayLoadStay22TesterMap(raw(true, true)), true);
});
