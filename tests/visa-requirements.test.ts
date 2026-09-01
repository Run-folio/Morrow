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

test("shows the dataset-backed UK to Greece tourist rule", () => {
  const result = touristEntryRequirementFor("United Kingdom", "Greece");
  assert.equal(result.status, "visa-free");
  assert.match(result.visaAnswer, /Not required/);
  assert.match(result.permittedStay, /90 days in any 180-day period/);
  assert.match(result.sourceHref, /mfa\.gr/);
});

test("uses free movement rather than a tourist visa for EU and EEA passports", () => {
  const result = touristEntryRequirementFor("Ireland", "Greece");
  assert.equal(result.status, "visa-free");
  assert.match(result.permittedStay, /3 months/);
});

test("uses the dataset for all current passport and destination options", () => {
  const result = touristEntryRequirementFor("United Kingdom", "Thailand");
  assert.equal(result.status, "visa-free");
  assert.match(result.permittedStay, /60 days/);
  assert.equal(result.dataUpdatedAt, "2026-02-17");
});

test("keeps the official source as the verification destination", () => {
  const result = touristEntryRequirementFor("United States", "Guatemala");
  assert.equal(result.status, "visa-free");
  assert.match(result.sourceHref, /igm\.gob\.gt/);
});
