import assert from "node:assert/strict";
import test from "node:test";

import { countryFlagFor, supportedPassportCountries, touristEntryRequirementFor } from "../lib/easyt/visa-requirements.ts";

test("exposes semantic passport issuers independently from the bundled visa snapshot", () => {
  assert.equal(supportedPassportCountries.length, 209);
  assert.ok(supportedPassportCountries.includes("Guatemala"));
  assert.ok(supportedPassportCountries.includes("Bermuda"));
  assert.ok(!supportedPassportCountries.includes("Puerto Rico"));
  assert.equal(countryFlagFor("United Kingdom"), "🇬🇧");
  assert.equal(countryFlagFor("Guatemala"), "🇬🇹");
});

test("does not present snapshot-only UK to Greece as a verified tourist rule", () => {
  const result = touristEntryRequirementFor("United Kingdom", "Greece");
  assert.equal(result.informationState, "stale");
  assert.equal(result.status, "not-verified");
  assert.equal(result.statusLabel, "Needs confirmation");
  assert.equal(result.permittedStay, "");
  assert.doesNotMatch(`${result.visaAnswer} ${result.detail}`, /visa[- ]?free|visa required|\b\d+ days\b/i);
  assert.match(result.sourceHref, /mfa\.gr/);
});

test("does not present inferred EU free movement as a verified tourist rule", () => {
  const result = touristEntryRequirementFor("Ireland", "Greece");
  assert.equal(result.informationState, "stale");
  assert.equal(result.status, "not-verified");
  assert.equal(result.permittedStay, "");
});

test("retains the dataset snapshot date without presenting its classification", () => {
  const result = touristEntryRequirementFor("United Kingdom", "Thailand");
  assert.equal(result.informationState, "stale");
  assert.equal(result.status, "not-verified");
  assert.equal(result.permittedStay, "");
  assert.equal(result.dataUpdatedAt, "2026-02-17");
});

test("Guatemala to Australia snapshot cannot claim an eVisa or permitted stay", () => {
  const result = touristEntryRequirementFor("Guatemala", "Australia");
  assert.equal(result.informationState, "stale");
  assert.equal(result.status, "not-verified");
  assert.equal(result.statusLabel, "Needs confirmation");
  assert.equal(result.permittedStay, "");
  assert.doesNotMatch(`${result.visaAnswer} ${result.detail}`, /e-?visa|visa required|visa[- ]?free|\b\d+ days\b/i);
  assert.match(result.sourceHref, /immi\.homeaffairs\.gov\.au/);
});

test("keeps the official source as the verification destination", () => {
  const result = touristEntryRequirementFor("United States", "Guatemala");
  assert.equal(result.informationState, "stale");
  assert.equal(result.status, "not-verified");
  assert.match(result.sourceHref, /igm\.gob\.gt/);
});
