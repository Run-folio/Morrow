import assert from "node:assert/strict";
import test from "node:test";
import {
  captureJourneyBrief,
  captureJourneyBriefWithProvider,
} from "../lib/easyt/journey-capture.ts";
import type { PlaceIntelligenceProvider } from "../lib/easyt/place-intelligence.ts";
import { createHomeTripDraft, routableHandoffMentions } from "../lib/easyt/home-trip-handoff.ts";
import { EXPECTED_MIXED_GEOGRAPHY, MIXED_CENTRAL_AMERICA_PROMPT } from "./fixtures/prebeta-place-trip-state.ts";

const CENTRAL_PROMPT = "3 weeks through Patagonia, Tierra del Fuego and Easter Island. We like nature, prefer a relaxed pace and do not want to drive.";

test("homepage capture preserves mixed direct, planning-area, anchor and base-selection geography", () => {
  const capture = captureJourneyBrief(MIXED_CENTRAL_AMERICA_PROMPT);
  const draft = createHomeTripDraft({
    capture,
    handoffId: "mixed-central-america",
    datesExplicit: false,
    startDate: "",
    endDate: "",
    travellers: 2,
    travellersExplicit: true,
    interests: ["culture", "nature", "hiking"],
  });

  assert.equal(capture.durationDays, 22);
  assert.deepEqual(capture.mentions.map(({ canonicalPlaceId, placeType, routability }) => ({ canonicalPlaceId, placeType, routability })), EXPECTED_MIXED_GEOGRAPHY);
  assert.deepEqual(routableHandoffMentions(capture.mentions).map((mention) => mention.canonicalPlaceId), ["tulum", "antigua-guatemala"]);
  assert.deepEqual(capture.regions, ["Belize", "Lake Atitlán"]);
  assert.deepEqual(capture.structuredBrief.interests.map((interest) => interest.value), ["nature", "culture", "hiking"]);
  assert.equal(capture.structuredBrief.destinations.find((item) => item.canonicalPlaceId === "tikal")?.role, "trip-anchor");
  assert.equal(draft.brief, MIXED_CENTRAL_AMERICA_PROMPT);
  assert.deepEqual(draft.interests, ["culture", "nature", "hiking"]);
  assert.deepEqual(draft.locationMentions, capture.mentions);
});

test("central Patagonia capture preserves all geography and constraints without creating route-stop identities", () => {
  const capture = captureJourneyBrief(CENTRAL_PROMPT);

  assert.equal(capture.durationDays, 21);
  assert.deepEqual(capture.regions, ["Patagonia", "Tierra del Fuego", "Rapa Nui"]);
  assert.deepEqual(capture.mentions.map((mention) => ({
    sourceText: mention.sourceText,
    canonicalPlaceId: mention.canonicalPlaceId,
    placeType: mention.placeType,
    routability: mention.routability,
    countries: mention.parentCountries,
  })), [
    { sourceText: "Patagonia", canonicalPlaceId: "patagonia", placeType: "region", routability: "needs_base_selection", countries: ["Argentina", "Chile"] },
    { sourceText: "Tierra del Fuego", canonicalPlaceId: "tierra-del-fuego", placeType: "sub_region", routability: "needs_base_selection", countries: ["Argentina", "Chile"] },
    { sourceText: "Easter Island", canonicalPlaceId: "rapa-nui", placeType: "island", routability: "needs_base_selection", countries: ["Chile"] },
  ]);
  assert.equal(capture.structuredBrief.pace?.value, "relaxed");
  assert.equal(capture.structuredBrief.interests.some((interest) => interest.value === "nature"), true);
  assert.equal(capture.structuredBrief.hardConstraints.some((constraint) => constraint.type === "no-driving"), true);
  assert.equal(capture.structuredBrief.destinations.every((destination) => destination.id === undefined), true);
  assert.equal(capture.structuredBrief.destinations.some((destination) => ["Ushuaia", "El Calafate", "Puerto Natales"].includes(destination.name)), false);
});

test("capture is deterministic and projects the same single resolution into every representation", () => {
  const prompt = "Cusco, the Sacred Valley and Machu Picchu";
  const first = captureJourneyBrief(prompt);
  const second = captureJourneyBrief(prompt);

  assert.deepEqual(first, second);
  assert.equal(first.parserVersion, first.structuredBrief.source.parserVersion);
  assert.deepEqual(first.structuredBrief.placeMentions, first.mentions);
  assert.deepEqual(first.structuredBrief.placeIssues?.map((issue) => `${issue.code}|${issue.mentionId}`),
    first.mentions.flatMap((mention) => first.structuredBrief.placeIssues
      ?.filter((issue) => issue.mentionId === mention.mentionId)
      .map((issue) => `${issue.code}|${issue.mentionId}`) ?? []));
  assert.deepEqual(first.mentions.map((mention) => mention.canonicalPlaceId), ["cusco", "sacred-valley", "machu-picchu"]);
});

test("Builder capture receives an explicit Paris route as one origin and two ordered stops", async () => {
  const places = new Map([
    ["paris", { name: "Paris", country: "France", coordinates: [2.3522, 48.8566] as [number, number] }],
    ["amsterdam", { name: "Amsterdam", country: "Netherlands", coordinates: [4.9041, 52.3676] as [number, number] }],
    ["brussels", { name: "Brussels", country: "Belgium", coordinates: [4.3517, 50.8503] as [number, number] }],
  ]);
  const provider: PlaceIntelligenceProvider = {
    id: "builder-explicit-route",
    label: "Builder explicit route fixture",
    lookup: async (phrase) => {
      const place = places.get(phrase.toLocaleLowerCase());
      return place ? [{
        providerId: `provider-${phrase.toLocaleLowerCase()}`,
        canonicalName: place.name,
        aliases: [],
        placeType: "city",
        parentCountries: [place.country],
        coordinates: place.coordinates,
        routability: "direct_destination",
        matchQuality: "exact",
        rankScore: 100,
      }] : [];
    },
  };

  const capture = await captureJourneyBriefWithProvider(
    "Paris → Amsterdam → Brussels for approximately 8 days",
    provider,
  );
  const origins = capture.mentions.filter((mention) => mention.role === "origin" || mention.role === "fixed_start");
  assert.deepEqual(origins.map((mention) => mention.canonicalName), ["Paris"]);
  assert.deepEqual(
    routableHandoffMentions(capture.mentions)
      .filter((mention) => mention.role !== "origin" && mention.role !== "fixed_start")
      .map((mention) => mention.canonicalName),
    ["Amsterdam", "Brussels"],
  );
  assert.equal(capture.mentions.filter((mention) => mention.canonicalPlaceId === origins[0]?.canonicalPlaceId).length, 1);
  assert.equal(capture.durationDays, 8);
  assert.equal(capture.structuredBrief.duration?.precision, "approximate");
});

test("Builder capture preserves an explicit origin-identical opening stay and resolved return", async () => {
  const prompt = "Start in Cancún, stay overnight in Cancún, Tulum, Antigua Guatemala, Caye Caulker, Belize City and Flores, then return to Cancún for 22 days";
  const provider: PlaceIntelligenceProvider = {
    id: "endpoint-stay-fixture",
    label: "Endpoint stay fixture",
    lookup: async (phrase) => phrase.toLocaleLowerCase() === "flores" ? [{
      providerId: "flores-guatemala",
      canonicalName: "Flores",
      aliases: [],
      placeType: "city",
      parentCountries: ["Guatemala"],
      coordinates: [-89.897, 16.9294],
      routability: "direct_destination",
      matchQuality: "exact",
      rankScore: 100,
    }] : [],
  };

  const capture = await captureJourneyBriefWithProvider(prompt, provider);
  const origin = capture.mentions.find((mention) => mention.role === "fixed_start" || mention.role === "origin");
  const stays = routableHandoffMentions(capture.mentions).filter((mention) => mention !== origin && mention.role !== "fixed_end");
  assert.equal(origin?.canonicalName, "Cancún");
  assert.deepEqual(stays.map((mention) => mention.canonicalName), ["Cancún", "Tulum", "Antigua Guatemala", "Caye Caulker", "Belize City", "Flores"]);
  assert.deepEqual(capture.journeyEnd, { mode: "same_as_start" });
  assert.equal(capture.mentions.some((mention) => /return to/i.test(mention.sourceText)), false);
  assert.equal(capture.structuredBrief.placeIssues?.some((issue) => /return to/i.test(issue.sourceText)), false);
  assert.equal(capture.durationDays, 22);
});

test("provider capture deduplicates lookups per identity and preserves canonical and unknown intent when the provider fails", async () => {
  let calls = 0;
  const unavailableProvider: PlaceIntelligenceProvider = {
    id: "offline-capture-fixture",
    label: "Offline capture fixture",
    lookup: async () => {
      calls += 1;
      throw new Error("offline");
    },
  };

  const capture = await captureJourneyBriefWithProvider(
    "Venice, Mystery Coast and Mystery Coast",
    unavailableProvider,
  );

  assert.equal(calls, 2, "one coordinate lookup for Venice and one deduplicated lookup for Mystery Coast");
  assert.equal(capture.mentions.find((mention) => mention.canonicalPlaceId === "venice")?.coordinates, undefined);
  const unresolved = capture.mentions.filter((mention) => mention.normalizedPhrase === "mystery coast");
  assert.equal(unresolved.length, 2);
  assert.equal(unresolved.every((mention) => mention.status === "unresolved" && mention.canonicalPlaceId === undefined), true);
  assert.deepEqual(capture.structuredBrief.placeMentions, capture.mentions);
  assert.equal(capture.structuredBrief.destinations.some((destination) => destination.name === "Mystery Coast" && destination.resolutionStatus === "unresolved"), true);
  assert.equal(capture.structuredBrief.placeIssues?.filter((issue) => issue.code === "unresolved_place").length, 2);
});

test("P0 Central America prompt preserves one origin, seven destination intents and overland preference", () => {
  const prompt = "Start in London and travel to Cancún, Tulum, Mexico City, Antigua, Lake Atitlán, Tikal and Belize. We would prefer to travel overland where practical.";
  const capture = captureJourneyBrief(prompt);
  const origin = capture.mentions.filter((mention) => mention.role === "origin" || mention.role === "fixed_start");
  const destinations = capture.mentions.filter((mention) => !["origin", "fixed_start", "excluded"].includes(mention.role));

  assert.deepEqual(origin.map((mention) => mention.canonicalPlaceId), ["london"]);
  assert.deepEqual(destinations.map((mention) => mention.sourceText), ["Cancún", "Tulum", "Mexico City", "Antigua", "Lake Atitlán", "Tikal", "Belize"]);
  assert.deepEqual(destinations.map((mention) => mention.canonicalPlaceId), ["cancun", "tulum", "mexico-city", "antigua-guatemala", "lake-atitlan", "tikal", "belize"]);
  assert.deepEqual(capture.structuredBrief.transportPreferences.map((preference) => preference.value), ["ground"]);
  assert.equal(capture.mentions.some((mention) => mention.normalizedPhrase === "overland"), false);
  assert.equal(capture.mentions.some((mention) => mention.canonicalName === "Guatemala City"), false);
  assert.equal(capture.mentionCoverage.complete, true);
  assert.deepEqual(capture.mentionCoverage.missingFromResolution, []);
  assert.deepEqual(capture.mentionCoverage.missingFromStructuredBrief, []);
  assert.deepEqual(capture.structuredBrief.placeIssues?.filter((issue) => issue.blocksRoute).map((issue) => issue.sourceText), ["Lake Atitlán", "Tikal", "Belize"]);
});

test("provider-enriched capture maps one fixed result through the shared brief boundary", async () => {
  let calls = 0;
  const fixedProvider: PlaceIntelligenceProvider = {
    id: "fixed-gazetteer",
    label: "Fixed gazetteer fixture",
    lookup: async (phrase) => {
      calls += 1;
      assert.equal(phrase, "Mystery Coast");
      return [{
        providerId: "area-42",
        canonicalName: "Mystery Coast Planning Area",
        aliases: ["Mystery Coast"],
        placeType: "coast",
        parentCountries: ["Exampleland"],
        routability: "needs_base_selection",
      }];
    },
  };

  const capture = await captureJourneyBriefWithProvider("Mystery Coast", fixedProvider);
  const mention = capture.mentions[0];

  assert.equal(calls, 1);
  assert.equal(mention.canonicalPlaceId, "fixed-gazetteer:area-42");
  assert.equal(mention.status, "partially_resolved");
  assert.equal(mention.provenance[0]?.kind, "provider");
  assert.equal(capture.regions[0], "Mystery Coast Planning Area");
  assert.deepEqual(capture.structuredBrief.placeMentions, capture.mentions);
  assert.equal(capture.structuredBrief.destinations[0]?.canonicalPlaceId, "fixed-gazetteer:area-42");
  assert.equal(capture.structuredBrief.placeIssues?.some((issue) => issue.code === "region_requires_base"), true);
});
