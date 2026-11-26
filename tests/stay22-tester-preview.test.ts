import assert from "node:assert/strict";
import { test } from "node:test";
import { createPrivacyConsentRecord } from "../lib/privacy-consent.ts";
import { isStay22TesterHost, isStay22Tester, stay22TesterSearch, mayLoadStay22TesterMap } from "../lib/easyt/stay22-tester-preview.ts";

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
test("preview sends the active stop, dates, and chosen adult count without trip identifiers", () => {
  const capeTown = { affiliateId: "morrovia", currency: "EUR", latitude: -33.9249, longitude: 18.4241, checkIn: "2026-12-02", checkOut: "2026-12-07", adults: 3 };
  for (const view of ["all", "map", "listview"] as const) {
    const result = stay22TesterSearch(capeTown, view, "2026-11-26");
    assert.ok(result);
    const url = new URL(result);
    assert.equal(url.origin, "https://www.stay22.com");
    assert.equal(url.searchParams.get("viewmode"), view);
    assert.equal(url.searchParams.get("maincolor"), "3025ce");
    assert.equal(url.searchParams.get("currency"), "EUR");
    assert.equal(url.searchParams.get("hideallezbutton"), "true");
    assert.equal(url.searchParams.get("lat"), "-33.9249");
    assert.equal(url.searchParams.get("lng"), "18.4241");
    assert.equal(url.searchParams.get("checkin"), "2026-12-02");
    assert.equal(url.searchParams.get("checkout"), "2026-12-07");
    assert.equal(url.searchParams.get("adults"), "3");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["adults", "aid", "checkin", "checkout", "currency", "hideallezbutton", "lat", "lng", "maincolor", ...(view === "all" ? ["listviewexpand"] : []), "viewmode", "zoom"].sort());
  }
  for (const currency of ["XYZ", "test-account-or-secret", ""]) {
    assert.equal(new URL(stay22TesterSearch({...capeTown, currency}, "all", "2026-11-26")!).searchParams.get("currency"), null);
  }
  for (const invalid of [{latitude: null}, {checkIn: null}, {checkIn: "2026-11-25"}, {checkOut: "2026-12-02"}, {affiliateId: undefined}, {adults: 0}]) {
    assert.equal(stay22TesterSearch({...capeTown, ...invalid}, "map", "2026-11-26"), null);
  }
});
test("legacy and partial consent do not authorize the rehearsal", () => {
  const raw = (analytics: boolean, affiliateTracking: boolean) => JSON.stringify(createPrivacyConsentRecord({ analytics, affiliateTracking }));
  assert.equal(mayLoadStay22TesterMap("granted"), false);
  assert.equal(mayLoadStay22TesterMap(null), false);
  assert.equal(mayLoadStay22TesterMap(raw(true, false)), false);
  assert.equal(mayLoadStay22TesterMap(raw(false, true)), false);
  assert.equal(mayLoadStay22TesterMap(raw(true, true)), true);
});
