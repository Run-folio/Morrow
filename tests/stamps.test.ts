import assert from "node:assert/strict";
import test from "node:test";

import {
  STAMP_COUNTRIES,
  STAMP_COUNTRIES_BY_REGION,
  STAMP_REGIONS,
  STAMP_TOPOLOGY_ALIASES,
  filterStampCountries,
  isStampCountryId,
  isStampStatus,
  legacyStampCountryId,
  nextStampStatus,
  normalizeStampCountryId,
  normalizeStampStatuses,
  stampCountryFlag,
  summarizeStampRecords,
  summarizeStampRows,
} from "../lib/easyt/stamps.ts";

test("derives truthful status and memory counts from known canonical countries", () => {
  const summary = summarizeStampRecords({
    statuses: {
      france: "visited",
      spain: "want",
      atlantis: "visited",
      italy: "planned",
    },
    memories: {
      france: "Spring in Paris",
      japan: { note: "", photoData: "data:image/jpeg;base64,japan" },
      italy: "   ",
      atlantis: "Should not count",
    },
    photos: {
      france: "data:image/jpeg;base64,duplicate-country",
      italy: "data:image/jpeg;base64,italy",
      spain: "   ",
    },
  });

  assert.deepEqual(summary, { visited: 1, want: 1, memories: 3 });
});

test("provides the same deterministic counts for dashboard-shaped rows", () => {
  const summary = summarizeStampRows(
    [
      { countryId: "france", status: "visited" },
      { countryId: "spain", status: "want" },
      { countryId: "unknown-country", status: "visited" },
    ],
    [
      { countryId: "france", note: "A real note" },
      { countryId: "japan", photoData: "data:image/jpeg;base64,japan" },
      { countryId: "unknown-country", note: "Not a canonical memory" },
    ],
  );

  assert.deepEqual(summary, { visited: 1, want: 1, memories: 2 });
});

test("preserves existing status transitions and normalizes legacy country aliases", () => {
  assert.equal(nextStampStatus(undefined, "visited"), "visited");
  assert.equal(nextStampStatus("visited", "visited"), null);
  assert.equal(nextStampStatus("want", "visited"), "visited");
  assert.equal(nextStampStatus("visited", "want"), "want");

  assert.equal(normalizeStampCountryId("United States of America"), "united-states");
  assert.equal(normalizeStampCountryId("united-states-of-america"), "united-states");
  assert.equal(normalizeStampCountryId("USA"), "united-states");
  assert.equal(normalizeStampCountryId("dominican-rep"), "dominican-rep");
  assert.equal(normalizeStampCountryId("Dominican Republic"), "dominican-rep");
  assert.equal(normalizeStampCountryId("s-o-tom-and-principe"), "s-o-tom-and-principe");
  assert.equal(normalizeStampCountryId("Atlantis"), null);
  assert.equal(isStampCountryId("united-states"), true);
  assert.equal(isStampCountryId("united-states-of-america"), false);
  assert.equal(isStampStatus("visited"), true);
  assert.equal(isStampStatus("planned"), false);
});

test("canonical status IDs win over duplicate legacy aliases and unknown values are discarded", () => {
  const normalized = normalizeStampStatuses({
    "United States of America": "visited",
    "united-states": "want",
    "dominican-rep": "visited",
    atlantis: "visited",
    france: "planned",
  });

  assert.deepEqual(normalized, {
    "united-states": "want",
    "dominican-rep": "visited",
  });
});

test("composes search, region and status filtering from one status record", () => {
  const statuses = {
    portugal: "visited",
    france: "visited",
    spain: "want",
    japan: "visited",
    "united-states": "want",
  };

  assert.deepEqual(
    filterStampCountries({ statuses, region: "Europe", status: "visited", search: "por" }).map((country) => country.name),
    ["Portugal"],
  );
  assert.deepEqual(
    filterStampCountries({ statuses, region: "Europe", status: "want", search: "sp" }).map((country) => country.name),
    ["Spain"],
  );
  assert.deepEqual(
    filterStampCountries({ statuses, status: "want", search: "USA" }).map((country) => country.name),
    ["United States"],
  );
  assert.deepEqual(
    filterStampCountries({ statuses, region: "Asia", status: "want", search: "por" }),
    [],
  );
  assert.deepEqual(
    filterStampCountries().slice(0, 3).map((country) => country.name),
    ["Afghanistan", "Albania", "Algeria"],
  );
});

test("country IDs, regions, aliases and flags form a unique canonical catalog", () => {
  const ids = STAMP_COUNTRIES.map((country) => country.id);
  const names = STAMP_COUNTRIES.map((country) => country.name);
  assert.equal(STAMP_COUNTRIES.length, 197);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(names).size, names.length);

  for (const country of STAMP_COUNTRIES) {
    assert.equal(normalizeStampCountryId(country.name), country.id);
    assert.match(country.iso2, /^[A-Z]{2}$/);
    assert.notEqual(stampCountryFlag(country.id), "🌐");
  }
  assert.equal(legacyStampCountryId("United States"), "united-states");
  assert.equal(normalizeStampCountryId("dominican-republic"), "dominican-rep");
  assert.equal(normalizeStampCountryId("antigua-and-barbuda"), "antigua-and-barb");
  assert.equal(normalizeStampCountryId("vatican-city"), "vatican");
  assert.deepEqual(
    Object.fromEntries([
      "Sao Tome and Principe",
      "Antigua and Barbuda",
      "Dominican Republic",
      "Saint Kitts and Nevis",
      "Saint Vincent and the Grenadines",
      "Vatican City",
      "Marshall Islands",
    ].map((name) => [name, normalizeStampCountryId(name)])),
    {
      "Sao Tome and Principe": "s-o-tom-and-principe",
      "Antigua and Barbuda": "antigua-and-barb",
      "Dominican Republic": "dominican-rep",
      "Saint Kitts and Nevis": "st-kitts-and-nevis",
      "Saint Vincent and the Grenadines": "st-vin-and-gren",
      "Vatican City": "vatican",
      "Marshall Islands": "marshall-is",
    },
  );

  assert.equal(
    STAMP_REGIONS.reduce((count, region) => count + STAMP_COUNTRIES_BY_REGION[region].length, 0),
    STAMP_COUNTRIES.length,
  );
  for (const [alias, canonicalName] of Object.entries(STAMP_TOPOLOGY_ALIASES)) {
    assert.equal(normalizeStampCountryId(alias), normalizeStampCountryId(canonicalName));
  }
});

test("planned and past trip-shaped input never changes explicit stamp semantics", () => {
  const pastPlannedTrip = {
    status: "planned",
    startDate: "2020-01-01",
    endDate: "2020-01-14",
    stops: [{ country: "Japan", countryCode: "JP" }],
  };
  const input = {
    statuses: { japan: "want" },
    memories: {},
    trips: [pastPlannedTrip],
  };

  assert.deepEqual(summarizeStampRecords(input), { visited: 0, want: 1, memories: 0 });
  assert.deepEqual(filterStampCountries({ statuses: input.statuses, status: "visited" }), []);
});
