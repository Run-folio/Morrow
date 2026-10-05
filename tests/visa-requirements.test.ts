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

test("only the reviewed British citizen tourist pilot has dated, scoped entry answers", () => {
  const cases = [
    { destination: "Kazakhstan", stay: /30 days.*90 days.*180-day/i, source: /gov\.uk\/foreign-travel-advice\/kazakhstan\/entry-requirements/ },
    { destination: "Uzbekistan", stay: /30 days/i, source: /gov\.uk\/foreign-travel-advice\/uzbekistan\/entry-requirements/ },
    { destination: "Kyrgyzstan", stay: /30 calendar days.*60-day/i, source: /gov\.uk\/foreign-travel-advice\/kyrgyzstan\/entry-requirements/ },
  ];
  for (const { destination, stay, source } of cases) {
    const result = touristEntryRequirementFor("GB", destination, "en", new Date("2026-10-05T12:00:00Z"));
    assert.equal(result.informationState, "known", destination);
    assert.equal(result.status, "visa-free", destination);
    assert.match(result.permittedStay, stay, destination);
    assert.match(result.sourceHref, source, destination);
    assert.match(result.detail, /full British citizen passport/i, destination);
    assert.match(result.detail, /tourism/i, destination);
    assert.doesNotMatch(result.detail, /from the UK|departure point/i, destination);
    assert.equal(result.dataUpdatedAt, "2026-10-05", destination);
    assert.equal(result.reviewDueAt, "2026-11-04", destination);
    assert.ok(result.conditions.length > 0, destination);
  }
});

test("an overdue pilot rule downgrades without retaining a visa or stay claim", () => {
  const result = touristEntryRequirementFor("GB", "KZ", "en", new Date("2026-11-05T00:00:00Z"));
  assert.equal(result.status, "not-verified");
  assert.notEqual(result.informationState, "known");
  assert.equal(result.permittedStay, "");
  assert.match(result.sourceHref, /gov\.uk\/foreign-travel-advice\/kazakhstan\/entry-requirements/);
});

test("reviewed and unverified answers remain understandable in Spanish", () => {
  const reviewed = touristEntryRequirementFor("GB", "UZ", "es", new Date("2026-10-05T12:00:00Z"));
  assert.equal(reviewed.informationState, "known");
  assert.match(reviewed.visaAnswer, /sin visado/i);
  assert.match(reviewed.detail, /pasaporte completo de ciudadano británico/i);
  assert.match(reviewed.detail, /turismo/i);
  const unverified = touristEntryRequirementFor("GT", "AU", "es");
  assert.equal(unverified.status, "not-verified");
  assert.match(unverified.detail, /no hemos verificado/i);
});

test("unreviewed passport pairs stay unverified with an honest source handoff", () => {
  const destinationSource = touristEntryRequirementFor("GT", "KZ");
  assert.equal(destinationSource.status, "not-verified");
  assert.equal(destinationSource.permittedStay, "");
  assert.match(destinationSource.sourceHref, /gov\.kz\/memleket\/entities\/mfa/);
  assert.doesNotMatch(destinationSource.sourceHref, /foreign-travel-advice\/kazakhstan/);

  const missingSource = touristEntryRequirementFor("GT", "AQ");
  assert.equal(missingSource.status, "not-verified");
  assert.equal(missingSource.sourceHref, "");
  assert.match(missingSource.detail, /official/i);
});
