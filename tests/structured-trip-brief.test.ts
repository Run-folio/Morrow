import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlaceMentions } from "../lib/easyt/place-intelligence.ts";
import {
  extractStructuredTripBrief,
  formatStructuredTripBriefDebug,
  mergeStructuredTripBrief,
  routeConstraintsFromStructuredTripBrief,
  routePreferencesFromStructuredBrief,
  routeScoringPreferencesFromStructuredBrief,
  structuredTripBriefFromSavedSelections,
} from "../lib/easyt/structured-trip-brief.ts";

test("capture can supply one place-intelligence result without reinterpreting the raw prompt", () => {
  const supplied = resolvePlaceMentions("Saigon");
  const brief = extractStructuredTripBrief("A private route label", "capture-fixture", supplied);
  assert.equal(brief.destinations[0]?.canonicalPlaceId, "ho-chi-minh-city");
  assert.equal(brief.destinations[0]?.sourceLabel, "Saigon");
  assert.equal(brief.source.parserVersion, "capture-fixture");
});

test("historical compatibility derives from saved selections without reparsing old prose", () => {
  const compatible = structuredTripBriefFromSavedSelections({
    duration: { value: 8, unit: "days" },
    destinations: [{ id: "saved-route-stop", name: "Saved Base", role: "must-visit", priority: "required" }],
    mustVisit: ["Saved Base"],
    travellers: 2,
  });

  assert.equal(compatible.source.rawPrompt, undefined);
  assert.deepEqual(compatible.source, { parserVersion: "saved-selection-compat-v1", inputs: ["saved"] });
  assert.equal(compatible.destinations[0]?.id, "saved-route-stop");
  assert.equal(compatible.destinations[0]?.canonicalPlaceId, undefined);
  assert.equal(compatible.mustVisit[0]?.id, "saved-route-stop");
  assert.equal(compatible.placeMentions, undefined);
  assert.equal(compatible.placeIssues, undefined);
});

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

test("regional intent is typed and preserved without fabricating route bases", () => {
  const brief = extractStructuredTripBrief(
    "3 weeks through Patagonia, Tierra del Fuego and Easter Island with nature, a relaxed pace, and no-driving.",
  );

  assert.equal(brief.duration?.value, 21);
  assert.equal(brief.pace?.value, "relaxed");
  assert.equal(brief.interests.some((interest) => interest.value === "nature"), true);
  assert.equal(brief.hardConstraints.some((constraint) => constraint.type === "no-driving"), true);
  assert.deepEqual(brief.transportPreferences, []);
  assert.deepEqual(brief.destinations.map((destination) => ({
    name: destination.name,
    canonicalPlaceId: destination.canonicalPlaceId,
    placeType: destination.placeType,
    routability: destination.routability,
    sourceLabel: destination.sourceLabel,
    routeStopId: destination.id,
    countries: destination.parentCountries,
  })), [
    {
      name: "Patagonia", canonicalPlaceId: "patagonia", placeType: "region", routability: "needs_base_selection",
      sourceLabel: "Patagonia", routeStopId: undefined, countries: ["Argentina", "Chile"],
    },
    {
      name: "Tierra del Fuego", canonicalPlaceId: "tierra-del-fuego", placeType: "sub_region", routability: "needs_base_selection",
      sourceLabel: "Tierra del Fuego", routeStopId: undefined, countries: ["Argentina", "Chile"],
    },
    {
      name: "Rapa Nui", canonicalPlaceId: "rapa-nui", placeType: "island", routability: "needs_base_selection",
      sourceLabel: "Easter Island", routeStopId: undefined, countries: ["Chile"],
    },
  ]);
  assert.equal(brief.placeIssues?.filter((issue) => issue.code === "region_requires_base").length, 3);
  assert.equal(brief.destinations.some((destination) => ["Ushuaia", "El Calafate", "Puerto Natales"].includes(destination.name)), false);
});

test("aliases deduplicate, nested places survive, and exact source wording remains available", () => {
  const aliases = extractStructuredTripBrief("Rapa Nui, Easter Island, and mainland Chile.");
  const rapaNui = aliases.placeMentions?.find((mention) => mention.canonicalPlaceId === "rapa-nui");
  assert.deepEqual(rapaNui?.sourceTexts, ["Rapa Nui", "Easter Island"]);
  assert.equal(aliases.destinations.filter((destination) => destination.canonicalPlaceId === "rapa-nui").length, 1);
  assert.deepEqual(aliases.countries.map((country) => country.value), ["Chile"]);

  const nested = extractStructuredTripBrief("The French Alps and Lake Annecy.");
  assert.equal(nested.destinations.some((destination) => destination.canonicalPlaceId === "french-alps"), true);
  const lake = nested.destinations.find((destination) => destination.canonicalPlaceId === "lake-annecy");
  assert.equal(lake?.parentCanonicalPlaceId, "french-alps");
  assert.equal(lake?.sourceLabel, "Lake Annecy");
});

test("nearby country context resolves Georgia without silently choosing in isolation", () => {
  const caucasus = extractStructuredTripBrief("Georgia and Armenia.");
  assert.equal(caucasus.placeMentions?.find((mention) => mention.sourceText === "Georgia")?.canonicalPlaceId, "georgia-country");

  const unitedStates = extractStructuredTripBrief("Georgia and Florida.");
  assert.equal(unitedStates.placeMentions?.find((mention) => mention.sourceText === "Georgia")?.canonicalPlaceId, "georgia-us-state");

  const isolated = extractStructuredTripBrief("Georgia.");
  assert.equal(isolated.placeMentions?.find((mention) => mention.sourceText === "Georgia")?.status, "ambiguous");
  assert.equal(isolated.placeIssues?.some((issue) => issue.code === "ambiguous_place" && issue.blocksRoute), true);
});

test("regional anchors and exclusions project into the canonical brief", () => {
  const anchor = extractStructuredTripBrief("Cusco, the Sacred Valley and Machu Picchu.");
  assert.equal(anchor.destinations.find((destination) => destination.canonicalPlaceId === "machu-picchu")?.role, "trip-anchor");
  assert.equal(anchor.preferredRegions.some((region) => region.value === "Sacred Valley"), true);

  const exclusion = extractStructuredTripBrief("Skip Venice but include the Dolomites.");
  assert.equal(exclusion.destinations.some((destination) => destination.canonicalPlaceId === "venice"), false);
  assert.equal(exclusion.placeMentions?.find((mention) => mention.canonicalPlaceId === "venice")?.role, "excluded");
  assert.equal(exclusion.hardConstraints.some((constraint) => constraint.type === "excluded-destination" && constraint.value === "Venice"), true);
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

test("duration capture covers the exploratory range without treating duration as a segment gate", () => {
  const cases = [
    ["One week in Japan with Tokyo and Kyoto.", 7],
    ["Two weeks in Japan with Tokyo and Kyoto.", 14],
    ["Four weeks in Japan with Tokyo and Kyoto.", 28],
    ["Six weeks in Japan with Tokyo and Kyoto.", 42],
    ["Eight weeks in Japan with Tokyo and Kyoto.", 56],
    ["Twelve weeks in Japan with Tokyo and Kyoto.", 84],
  ] as const;

  for (const [prompt, days] of cases) {
    const brief = extractStructuredTripBrief(prompt);
    assert.deepEqual(brief.duration && { value: brief.duration.value, unit: brief.duration.unit, precision: brief.duration.precision }, {
      value: days,
      unit: "days",
      precision: "exact",
    });
    assert.equal(brief.hardConstraints.some((constraint) => constraint.type === "duration"), true);
  }
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

test("hyphenated no-driving language remains a hard transport constraint", () => {
  const brief = extractStructuredTripBrief("A no-driving trip through the Greek Islands.");
  assert.equal(brief.hardConstraints.some((constraint) => constraint.type === "no-driving"), true);
  assert.equal(routePreferencesFromStructuredBrief(brief).avoidDriving, true);
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

test("builder base selection wins operationally while preserving broad prompt geography", () => {
  const base = extractStructuredTripBrief("Patagonia and Buenos Aires.");
  const patagonia = base.placeMentions?.find((mention) => mention.canonicalPlaceId === "patagonia");
  assert.ok(patagonia);
  const provenance = base.placeIssues?.find((issue) => issue.mentionId === patagonia.mentionId)?.options[0]?.provenance[0]
    ?? patagonia.provenance[0];
  assert.ok(provenance);

  const merged = mergeStructuredTripBrief(base, {
    destinations: [{
      id: "stop-el-calafate",
      name: "El Calafate",
      canonicalPlaceId: "el-calafate",
      placeMentionId: patagonia.mentionId,
      placeType: "town",
      resolutionStatus: "resolved",
      routability: "direct_destination",
    }],
    placeSelections: [{
      mentionId: patagonia.mentionId,
      kind: "base",
      selectedCanonicalPlaceId: "el-calafate",
      selectedName: "El Calafate",
      routeStopId: "stop-el-calafate",
      provenance,
    }],
  });

  assert.equal(merged.destinations.some((destination) => destination.canonicalPlaceId === "patagonia" && !destination.id), true);
  assert.equal(merged.destinations.some((destination) => destination.name === "El Calafate" && destination.id === "stop-el-calafate"), true);
  assert.equal(merged.destinations.find((destination) => destination.name === "El Calafate")?.provenance.source, "builder");
  assert.equal(merged.placeIssues?.some((issue) => issue.mentionId === patagonia.mentionId && issue.code === "region_requires_base"), false);
  assert.equal(merged.placeMentions?.some((mention) => mention.canonicalPlaceId === "patagonia"), true);
});

test("place removals are explicit and do not erase the captured mention", () => {
  const base = extractStructuredTripBrief("The French Alps and Lake Annecy.");
  const alps = base.placeMentions?.find((mention) => mention.canonicalPlaceId === "french-alps");
  assert.ok(alps);

  const merged = mergeStructuredTripBrief(base, { removedPlaceMentionIds: [alps.mentionId] });
  assert.deepEqual(merged.removedPlaceMentionIds, [alps.mentionId]);
  assert.equal(merged.destinations.some((destination) => destination.canonicalPlaceId === "french-alps"), false);
  assert.equal(merged.preferredRegions.some((region) => region.value === "French Alps"), false);
  assert.equal(merged.placeMentions?.some((mention) => mention.canonicalPlaceId === "french-alps"), true);
  assert.equal(merged.placeIssues?.some((issue) => issue.mentionId === alps.mentionId), false);
});

test("canonical geographic identity alone never becomes a route-stop constraint", () => {
  const base = extractStructuredTripBrief("Tokyo is essential.");
  const withoutRouteStop = routeConstraintsFromStructuredTripBrief(base);
  assert.deepEqual(withoutRouteStop.requiredStopIds, []);

  const withRouteStop = mergeStructuredTripBrief(base, {
    destinations: [{ id: "route-stop-tokyo", name: "Tokyo", canonicalPlaceId: "tokyo" }],
    mustVisit: ["Tokyo"],
  });
  assert.deepEqual(routeConstraintsFromStructuredTripBrief(withRouteStop).requiredStopIds, ["route-stop-tokyo"]);
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
