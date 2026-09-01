import assert from "node:assert/strict";
import test from "node:test";

import passportIndex from "../lib/easyt/data/passport-index-visa-matrix.json" with { type: "json" };
import { countries, countryFor, searchCountries } from "../lib/easyt/country-registry.ts";
import {
  passportCountryCodeFor,
  passportCountryLabel,
  passportDestinationCountries,
  passportNationalityCountries,
} from "../lib/easyt/passport-countries.ts";
import { beginPassportCheck, emptyPassportResult, failPassportCheck } from "../lib/easyt/passport-result-state.ts";
import { touristEntryRequirementFor } from "../lib/easyt/visa-requirements.ts";

const EXPECTED_ISO_3166_1_ALPHA_2 = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ
EC EE EG EH ER ES ET
FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU
ID IE IL IM IN IO IQ IR IS IT
JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ
LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ
OM
PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA
RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ
VA VC VE VG VI VN VU
WF WS
YE YT
ZA ZM ZW
`.trim().split(/\s+/).sort();

test("canonical registry matches the complete ISO 3166-1 alpha-2 assignment set", () => {
  assert.equal(countries.length, 250);
  assert.deepEqual(countries.filter(({ iso3166_1 }) => iso3166_1).map(({ code }) => code).sort(), EXPECTED_ISO_3166_1_ALPHA_2);
  assert.deepEqual(countries.filter(({ iso3166_1 }) => !iso3166_1).map(({ code }) => code), ["XK"]);
  assert.equal(new Set(countries.map(({ code }) => code)).size, countries.length);
  assert.equal(new Set(countries.map(({ name }) => name)).size, countries.length);
});

test("destination and passport selectors derive different semantics from one canonical registry", () => {
  assert.strictEqual(passportDestinationCountries, countries);
  assert.equal(passportDestinationCountries.length, 250);
  assert.equal(passportNationalityCountries.length, 209);
  assert.ok(passportNationalityCountries.every((country) => countries.includes(country)));
  assert.ok(passportNationalityCountries.every(({ passportIssuerStatus }) => (
    passportIssuerStatus === "ordinary-passport" || passportIssuerStatus === "distinct-travel-document"
  )));
});

test("every issuer evidenced by the bundled passport source remains selectable", () => {
  const selectableCodes = new Set(passportNationalityCountries.map(({ code }) => code));
  for (const issuer of passportIndex.passportCountries) {
    assert.ok(selectableCodes.has(issuer.code), `${issuer.code} should remain a passport selection`);
  }
});

test("previously absent and existing examples remain selectable", () => {
  for (const name of [
    "Argentina", "Belgium", "Chile", "Colombia", "Czechia", "Iceland", "Peru", "Philippines", "Switzerland",
    "Guatemala", "United Kingdom", "United States", "Japan", "France",
  ]) {
    const country = countryFor(name);
    assert.ok(country, `${name} should resolve`);
    assert.ok(passportDestinationCountries.some(({ code }) => code === country.code), `${name} should be a destination`);
    assert.ok(passportNationalityCountries.some(({ code }) => code === country.code), `${name} should be a nationality`);
  }
});

test("all territory cases remain destinations while only real document identities are passports", () => {
  for (const code of ["HK", "MO", "PR", "GL", "CW", "BM", "KY", "PF"]) {
    assert.ok(passportDestinationCountries.some((country) => country.code === code), `${code} should remain selectable`);
  }

  for (const code of ["HK", "MO", "BM", "KY"]) {
    const country = countryFor(code);
    assert.ok(country);
    assert.equal(country.passportIssuerStatus, "distinct-travel-document");
    assert.ok(passportNationalityCountries.includes(country));
    assert.notEqual(passportCountryLabel(country), country.name);
  }

  for (const [code, parentCode] of Object.entries({ PR: "US", GL: "DK", CW: "NL", PF: "FR" })) {
    const country = countryFor(code);
    assert.ok(country);
    assert.equal(country.passportIssuerStatus, "parent-issued");
    assert.equal(country.passportSelectionCode, parentCode);
    assert.ok(!passportNationalityCountries.includes(country));
  }
});

test("destination-only jurisdictions never create misleading passport choices", () => {
  for (const code of ["AQ", "BV", "EH", "GS", "HM", "IO", "SJ", "TF", "UM"]) {
    const country = countryFor(code);
    assert.ok(country);
    assert.equal(country.passportIssuerStatus, "destination-only");
    assert.equal(country.passportSelectionCode, null);
    assert.ok(!passportNationalityCountries.includes(country));
  }
});

test("alias and code search resolves one canonical country without duplicates", () => {
  const expected: Record<string, string> = {
    UK: "GB",
    USA: "US",
    "Czech Republic": "CZ",
    Turkey: "TR",
    "Türkiye": "TR",
    "Republic of Korea": "KR",
    "Ivory Coast": "CI",
  };
  for (const [query, code] of Object.entries(expected)) {
    assert.equal(countryFor(query)?.code, code);
    assert.deepEqual(searchCountries(query).map((country) => country.code), [code]);
  }
});

test("legacy saved names, aliases, and current codes restore deterministically", () => {
  assert.equal(passportCountryCodeFor("United Kingdom"), "GB");
  assert.equal(passportCountryCodeFor("UK"), "GB");
  assert.equal(passportCountryCodeFor("gb"), "GB");
  assert.equal(passportCountryCodeFor("Czech Republic"), "CZ");
  assert.equal(passportCountryCodeFor("Puerto Rico"), "US");
  assert.equal(passportCountryCodeFor("Greenland"), "DK");
  assert.equal(passportCountryCodeFor("Curaçao"), "NL");
  assert.equal(passportCountryCodeFor("French Polynesia"), "FR");
  assert.equal(passportCountryCodeFor("Bermuda"), "BM");
  assert.equal(passportCountryCodeFor("Cayman Islands"), "KY");
  assert.equal(passportCountryCodeFor("Antarctica"), null);
  assert.equal(passportCountryCodeFor("not a jurisdiction"), null);
});

test("unsupported country pairs remain selectable and explicitly unknown", () => {
  assert.equal(countryFor("Guatemala")?.code, "GT");
  assert.equal(countryFor("Uzbekistan")?.code, "UZ");
  const requirement = touristEntryRequirementFor("GT", "UZ");
  assert.equal(requirement.informationState, "unsupported");
  assert.equal(requirement.status, "not-verified");
  assert.equal(requirement.statusLabel, "Entry information unavailable");
  assert.equal(requirement.permittedStay, "");
  assert.equal(requirement.dataUpdatedAt, "");
  assert.deepEqual(requirement.conditions, []);
  assert.doesNotMatch(`${requirement.visaAnswer} ${requirement.detail}`, /visa[- ]?free|visa required|\b\d+ days\b|vaccination|price|apply online/i);
});

test("passport availability is independent from visa-rule coverage", () => {
  assert.ok(!passportIndex.passportCountries.some(({ code }) => code === "BM"));
  assert.ok(passportNationalityCountries.some(({ code }) => code === "BM"));
  const requirement = touristEntryRequirementFor("BM", "GT");
  assert.equal(requirement.informationState, "unsupported");
  assert.equal(requirement.status, "not-verified");
});

test("provider failure is separate from unsupported coverage and never removes a selection", () => {
  const loading = beginPassportCheck(emptyPassportResult());
  const failed = failPassportCheck(loading, loading.requestId);
  assert.equal(failed.status, "failed");
  assert.ok(passportDestinationCountries.some((country) => country.code === "UZ"));
});

test("existing dataset-backed requirements still map through canonical codes and aliases", () => {
  const byCode = touristEntryRequirementFor("GB", "GT");
  const byLegacyName = touristEntryRequirementFor("United Kingdom", "Guatemala");
  assert.equal(byCode.informationState, "known");
  assert.equal(byCode.status, byLegacyName.status);
  assert.equal(byCode.permittedStay, byLegacyName.permittedStay);
  assert.match(byCode.sourceHref, /igm\.gob\.gt/);
});
