import assert from "node:assert/strict";
import test from "node:test";
import {
  extractStructuredTripBrief,
  formatStructuredTripBriefDebug,
  mergeStructuredTripBrief,
  routeConstraintsFromStructuredTripBrief,
  routePreferencesFromStructuredBrief,
  routeScoringPreferencesFromStructuredBrief,
} from "../lib/easyt/structured-trip-brief.ts";

test("explicit prompt preserves gateways, exact nights and a must-visit anchor", () => {
  const brief = extractStructuredTripBrief("10 nights. Start in Bangkok, definitely Angkor Wat, finish in Vietnam. Two travellers. Prefer ground transport where sensible.");
  assert.deepEqual({ value: brief.duration?.value, unit: brief.duration?.unit, precision: brief.duration?.precision }, { value: 10, unit: "nights", precision: "exact" });
  assert.equal(brief.destinations.find((place) => place.role === "arrival-gateway")?.name, "Bangkok");
  assert.equal(brief.destinations.find((place) => place.role === "departure-gateway")?.name, "Vietnam");
  assert.equal(brief.mustVisit.some((place) => place.name === "Angkor Wat"), true);
  assert.equal(brief.travellers?.value, 2);
  assert.equal(brief.transportPreferences.some((preference) => preference.value === "ground"), true);
  assert.equal(brief.hardConstraints.some((constraint) => constraint.type === "duration"), true);
});

test("the same natural-language intent produces an identical comprehensive brief", () => {
  const prompt = "About 12 nights in Japan. Start in Tokyo, Kyoto is essential, finish in Osaka. Two travellers want a relaxed pace, food, trains, an affordable trip, no driving and no more than 4 stops.";
  const first = extractStructuredTripBrief(prompt);
  const second = extractStructuredTripBrief(prompt);

  assert.deepEqual(first, second);
  assert.deepEqual(first.countries.map((country) => country.value), ["Japan"]);
  assert.equal(first.duration?.value, 12);
  assert.equal(first.duration?.unit, "nights");
  assert.equal(first.duration?.precision, "approximate");
  assert.equal(first.travellers?.value, 2);
  assert.equal(first.pace?.value, "relaxed");
  assert.equal(first.interests.some((interest) => interest.value === "food"), true);
  assert.equal(first.transportPreferences.some((preference) => preference.value === "train"), true);
  assert.equal(first.budget?.value, "value");
  assert.equal(first.budget?.provenance.kind, "inferred");
  assert.equal(first.mustVisit.some((place) => place.name === "Kyoto"), true);
  assert.equal(first.hardConstraints.some((constraint) => constraint.type === "no-driving"), true);
  assert.equal(first.hardConstraints.some((constraint) => constraint.type === "maximum-stops" && constraint.value === 4), true);
});

test("loose language remains approximate and separates inferred pace and region", () => {
  const brief = extractStructuredTripBrief("We have about two weeks and want to see Japan without rushing. Tokyo is essential and we'd love some time in the mountains.");
  assert.equal(brief.duration?.value, 14);
  assert.equal(brief.duration?.precision, "approximate");
  assert.equal(brief.pace?.value, "relaxed");
  assert.equal(brief.pace?.provenance.kind, "inferred");
  assert.equal(brief.mustVisit.some((place) => place.name === "Tokyo"), true);
  assert.equal(brief.preferredRegions.some((region) => region.value === "Mountains"), true);
});

test("no driving is hard while a train preference remains soft", () => {
  const brief = extractStructuredTripBrief("I don't want to drive, and I'd prefer trains instead of flights when practical.");
  assert.equal(brief.hardConstraints.some((constraint) => constraint.type === "no-driving"), true);
  assert.equal(brief.softPreferences.some((preference) => preference.type === "transport" && preference.value === "train"), true);
  assert.equal(brief.hardConstraints.some((constraint) => constraint.type === "must-visit"), false);
  assert.deepEqual(routePreferencesFromStructuredBrief(brief).transportModes, ["train"]);
  assert.equal(routeScoringPreferencesFromStructuredBrief(brief).avoidFlights, true);
  assert.deepEqual(routeScoringPreferencesFromStructuredBrief(brief).preferredModes, ["train"]);
});

test("structured hard constraints resolve to stable route stop IDs", () => {
  const prompt = extractStructuredTripBrief("Start in Bangkok, Angkor Wat is a must, and finish in Ho Chi Minh City. No driving.");
  const merged = mergeStructuredTripBrief(prompt, {
    destinations: [
      { id: "bangkok", name: "Bangkok", role: "arrival-gateway", priority: "required" },
      { id: "angkor", name: "Angkor Wat", role: "must-visit", priority: "required" },
      { id: "hcmc", name: "Ho Chi Minh City", role: "departure-gateway", priority: "required" },
    ],
    mustVisit: ["Angkor Wat"],
    maximumStops: 3,
    avoidDriving: true,
  });
  const constraints = routeConstraintsFromStructuredTripBrief(merged);
  assert.equal(constraints.fixedStartStopId, "bangkok");
  assert.equal(constraints.fixedEndStopId, "hcmc");
  assert.deepEqual(constraints.requiredStopIds, ["angkor"]);
  assert.equal(constraints.maximumStops, 3);
  assert.deepEqual(constraints.excludedTransportModes, ["road"]);
});

test("missing information remains unknown", () => {
  const brief = extractStructuredTripBrief("I want to visit Cambodia and Vietnam.");
  assert.equal(brief.duration, undefined);
  assert.equal(brief.travellers, undefined);
  assert.equal(brief.dates.start, undefined);
  assert.equal(brief.dates.end, undefined);
  assert.equal(brief.budget, undefined);
  assert.equal(brief.pace, undefined);
  assert.deepEqual(brief.countries.map((country) => country.value), ["Cambodia", "Vietnam"]);
  assert.deepEqual(brief.destinations.map((place) => place.name), ["Cambodia", "Vietnam"]);
});

test("budget remains unknown when the traveller has not supplied a usable preference", () => {
  const brief = extractStructuredTripBrief("Tokyo and Kyoto. Tell me what budget I might need.");
  assert.equal(brief.budget, undefined);
  assert.equal(brief.softPreferences.some((preference) => preference.type === "budget"), false);
});

test("explicit builder duration overrides approximate prompt duration", () => {
  const prompt = extractStructuredTripBrief("Probably around 10 days in Japan.");
  const merged = mergeStructuredTripBrief(prompt, { duration: { value: 12, unit: "nights" } });
  assert.deepEqual({ value: merged.duration?.value, unit: merged.duration?.unit, source: merged.duration?.provenance.source }, { value: 12, unit: "nights", source: "builder" });
});

test("incompatible fixed duration and dates return a structured issue", () => {
  const prompt = extractStructuredTripBrief("Exactly 7 nights in Japan.");
  const merged = mergeStructuredTripBrief(prompt, { dates: { start: "2026-10-01", end: "2026-10-13", fixed: true } });
  assert.equal(merged.issues.some((issue) => issue.code === "DURATION_DATE_MISMATCH" && issue.severity === "error"), true);
});

test("fixed commitments survive unrelated merges and reach route planning", () => {
  const withBooking = mergeStructuredTripBrief(extractStructuredTripBrief("Start in Tokyo and finish in Kyoto."), {
    fixedCommitments: [{ label: "Tokyo Marathon", date: "2027-03-07" }],
  });
  const updated = mergeStructuredTripBrief(withBooking, { travellers: 2 });
  const constraints = routeConstraintsFromStructuredTripBrief(updated);

  assert.deepEqual(constraints.fixedCommitments, [{ label: "Tokyo Marathon", date: "2027-03-07" }]);
  assert.equal(updated.hardConstraints.some((constraint) => constraint.type === "fixed-commitment"), true);
});

test("debug format exposes provenance without becoming production UI", () => {
  const brief = mergeStructuredTripBrief(extractStructuredTripBrief("Tokyo is essential."), { travellers: 2 });
  const debug = formatStructuredTripBriefDebug(brief);
  assert.match(debug, /Must visit: Tokyo/);
  assert.match(debug, /Travellers: 2 — builder\/explicit/);
  assert.match(debug, /Budget: unknown/);
});
