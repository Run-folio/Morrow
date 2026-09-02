import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createHomeTripDraft } from "../lib/easyt/home-trip-handoff.ts";
import { captureJourneyBrief, captureJourneyBriefWithProvider } from "../lib/easyt/journey-capture.ts";
import {
  inferAttractionVisitSelections,
  rankAttractionVisitTargets,
  type AttractionVisitTarget,
  type PlaceSelection,
} from "../lib/easyt/place-intelligence.ts";
import { buildCredibleItinerary, type PlannerStop } from "../lib/easyt/planner.ts";
import { mergeStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";

function routeTargets(capture: ReturnType<typeof captureJourneyBrief>): AttractionVisitTarget[] {
  return capture.mentions.flatMap((mention, index) => mention.routability === "direct_destination"
    && !["origin", "fixed_start"].includes(mention.role)
    && mention.canonicalPlaceId
    ? [{
      routeStopId: `stop-${index}`,
      name: mention.canonicalName,
      canonicalPlaceId: mention.canonicalPlaceId,
      country: mention.parentCountries[0],
      coordinates: mention.coordinates,
    }]
    : []);
}

function inferredVisits(prompt: string) {
  const capture = captureJourneyBrief(prompt);
  const selections = inferAttractionVisitSelections(capture.mentions, routeTargets(capture));
  return { capture, visits: selections.filter((selection) => selection.kind === "visit") };
}

test("real Homepage capture -> StructuredTripBrief -> Builder relationship -> canonical itinerary preserves Machu Picchu without an attraction stop", () => {
  const prompt = "Starting from Madrid, visit Cusco, Sacred Valley, Machu Picchu, Arequipa and Lima";
  const capture = captureJourneyBrief(prompt);
  const homeDraft = createHomeTripDraft({
    capture,
    handoffId: "machu-home-builder",
    datesExplicit: true,
    startDate: "2026-09-01",
    endDate: "2026-09-08",
    travellers: 2,
    travellersExplicit: true,
    interests: ["culture"],
  });
  const sacredValley = capture.mentions.find((mention) => mention.canonicalPlaceId === "sacred-valley");
  const machuPicchu = capture.mentions.find((mention) => mention.canonicalPlaceId === "machu-picchu");
  assert.ok(sacredValley);
  assert.ok(machuPicchu);
  assert.equal(homeDraft.structuredBrief?.placeMentions?.some((mention) => mention.canonicalPlaceId === "machu-picchu"), true);

  const stops: PlannerStop[] = [
    { id: "cusco", name: "Cusco", country: "Peru", canonicalPlaceId: "cusco", coordinates: [-71.9675, -13.5319] },
    { id: "ollanta", name: "Ollantaytambo", country: "Peru", canonicalPlaceId: "ollantaytambo", coordinates: [-72.264, -13.2586] },
    { id: "arequipa", name: "Arequipa", country: "Peru", canonicalPlaceId: "arequipa", coordinates: [-71.5375, -16.409] },
    { id: "lima", name: "Lima", country: "Peru", canonicalPlaceId: "lima", coordinates: [-77.0428, -12.0464] },
  ];
  const sacredValleyBase: PlaceSelection = {
    mentionId: sacredValley.mentionId,
    kind: "base",
    selectedCanonicalPlaceId: "ollantaytambo",
    selectedName: "Ollantaytambo",
    selectedPlaceType: "town",
    selectedParentCountries: ["Peru"],
    routeStopId: "ollanta",
    provenance: { id: "builder:sacred-valley:ollanta", label: "Traveller builder selection", kind: "builder", supports: "The traveller selected Ollantaytambo." },
  };
  const selections = inferAttractionVisitSelections(capture.mentions, stops.map((stop) => ({
    routeStopId: stop.id,
    name: stop.name,
    canonicalPlaceId: stop.canonicalPlaceId,
    country: stop.country,
    coordinates: stop.coordinates,
  })), [sacredValleyBase]);
  const visit = selections.find((selection) => selection.mentionId === machuPicchu.mentionId);
  assert.equal(visit?.kind, "visit");
  assert.equal(visit?.routeStopId, "ollanta");
  assert.equal(visit?.selectedName, "Ollantaytambo");
  assert.equal(visit?.confidence?.level, "high");

  const structuredBrief = mergeStructuredTripBrief(capture.structuredBrief, {
    destinations: stops.map((stop) => ({ id: stop.id, name: stop.name, canonicalPlaceId: stop.canonicalPlaceId })),
    placeSelections: selections,
  });
  assert.equal(structuredBrief.placeIssues?.some((issue) => issue.mentionId === machuPicchu.mentionId && issue.blocksRoute), false);
  assert.equal(structuredBrief.destinations.some((destination) => destination.canonicalPlaceId === "machu-picchu"), true);

  const allocations = { cusco: 2, ollanta: 2, arequipa: 2, lima: 2 };
  const draft = buildCredibleItinerary({
    origin: "Madrid",
    stops,
    startDate: "2026-09-01",
    allocations,
    picks: {},
    places: { cusco: [], ollanta: [], arequipa: [], lima: [] },
  });
  const trip = tripFromBuilder({
    id: "machu-trip",
    origin: "Madrid",
    stops,
    startDate: "2026-09-01",
    endDate: "2026-09-08",
    picks: {},
    mustDo: prompt,
    pace: "slow",
    hotels: "few",
    budget: "mid",
    dayAllocations: allocations,
    draft,
    structuredBrief,
  });
  assert.deepEqual(trip.stops.map((stop) => stop.name), ["Cusco", "Ollantaytambo", "Arequipa", "Lima"]);
  assert.equal(trip.stops.some((stop) => stop.name === "Machu Picchu"), false);
  assert.equal(trip.planItems.some((item) => item.title === "Machu Picchu"), false, "a base relationship alone must not fabricate an itinerary activity");
  assert.deepEqual(JSON.parse(JSON.stringify(trip.brief.structuredBrief?.placeSelections)), trip.brief.structuredBrief?.placeSelections);
});

test("canonical containment attaches major attractions to existing route stops without creating attraction stops", () => {
  const fixtures = [
    ["Starting from London, Bangkok, Chiang Mai, Siem Reap, Angkor Wat and Phnom Penh", "Angkor Wat", "Siem Reap"],
    ["Starting from New York, Rome, Florence, Venice, Pisa and the Colosseum", "Colosseum", "Rome"],
    ["Starting from Toronto, Delhi, Jaipur, Agra, Taj Mahal and Varanasi", "Taj Mahal", "Agra"],
    ["Starting from Los Angeles, Mexico City, Oaxaca, Mérida, Tulum and Chichén Itzá", "Chichén Itzá", "Mérida"],
    ["Starting from Cairo, Amman, Wadi Musa, Petra and Aqaba", "Petra", "Wadi Musa"],
    ["Starting from Los Angeles, Las Vegas, Grand Canyon Village and Flagstaff, visit the Grand Canyon", "Grand Canyon", "Grand Canyon Village"],
  ] as const;
  for (const [prompt, attraction, base] of fixtures) {
    const result = inferredVisits(prompt);
    const mention = result.capture.mentions.find((item) => item.canonicalName === attraction);
    const visit = result.visits.find((selection) => selection.mentionId === mention?.mentionId);
    assert.ok(mention, `${attraction} remains a canonical mention`);
    assert.equal(visit?.selectedName, base, `${attraction} attaches to ${base}`);
    assert.equal(visit?.confidence?.confirmation.needed, false);
    const merged = mergeStructuredTripBrief(result.capture.structuredBrief, {
      destinations: routeTargets(result.capture).map((target) => ({ id: target.routeStopId, name: target.name, canonicalPlaceId: target.canonicalPlaceId })),
      placeSelections: result.visits,
    });
    assert.equal(merged.placeIssues?.some((issue) => issue.mentionId === mention.mentionId && issue.blocksRoute), false, `${attraction} does not remain a blocking overnight-base question`);
  }
});

test("provider locality evidence is generic, while multiple plausible gateways and proximity-only matches fail closed", () => {
  const { capture } = inferredVisits("Rome and the Colosseum");
  const source = capture.mentions.find((mention) => mention.canonicalPlaceId === "colosseum");
  assert.ok(source);
  const providerBacked = { ...source, parentRegionId: undefined, accessPlaceName: "Rome" };
  const providerCandidate = rankAttractionVisitTargets(providerBacked, [{ routeStopId: "rome", name: "Rome", canonicalPlaceId: "rome", country: "Italy" }]);
  assert.equal(providerCandidate[0]?.relationshipType, "within-stop");
  assert.equal(providerCandidate[0]?.confidence.level, "high");

  const machu = captureJourneyBrief("Machu Picchu").mentions.find((mention) => mention.canonicalPlaceId === "machu-picchu");
  assert.ok(machu);
  const ambiguousTargets = [
    { routeStopId: "ollanta", name: "Ollantaytambo", canonicalPlaceId: "ollantaytambo", country: "Peru" },
    { routeStopId: "aguas", name: "Aguas Calientes", canonicalPlaceId: "aguas-calientes", country: "Peru" },
  ];
  assert.deepEqual(inferAttractionVisitSelections([machu], ambiguousTargets), []);

  const proximityOnly = { ...machu, parentRegionId: undefined, coordinates: [-72.54, -13.16] as [number, number] };
  const proposal = rankAttractionVisitTargets(proximityOnly, [{ routeStopId: "nearby", name: "Nearby", country: "Peru", coordinates: [-72.9, -13.2] }]);
  assert.equal(proposal[0]?.confidence.level, "medium");
  assert.equal(proposal[0]?.confidence.confirmation.needed, true);
  assert.deepEqual(inferAttractionVisitSelections([proximityOnly], [proposal[0]!.target]), []);
});

test("provider failure and an unknown attraction preserve unresolved intent without fabricating a visit relationship", async () => {
  const capture = await captureJourneyBriefWithProvider("Start in Paris, then visit Mystery Temple", {
    id: "offline-provider",
    label: "Offline provider",
    lookup: async () => [],
  });
  const mystery = capture.mentions.find((mention) => mention.sourceText.includes("Mystery Temple"));
  assert.ok(mystery);
  assert.equal(mystery.status, "unresolved");
  assert.deepEqual(inferAttractionVisitSelections(capture.mentions, routeTargets(capture)), []);
  assert.equal(capture.structuredBrief.placeIssues?.some((issue) => issue.mentionId === mystery.mentionId && issue.blocksRoute), true);
});

test("base removal restores attraction review; reorder and save/reload retain a valid relationship", () => {
  const result = inferredVisits("Starting from London, Bangkok, Siem Reap, Angkor Wat and Phnom Penh");
  const visit = result.visits[0];
  assert.ok(visit?.routeStopId);
  const targets = routeTargets(result.capture);
  const structured = mergeStructuredTripBrief(result.capture.structuredBrief, {
    destinations: targets.map((target) => ({ id: target.routeStopId, name: target.name, canonicalPlaceId: target.canonicalPlaceId })),
    placeSelections: result.visits,
  });
  const reloaded = JSON.parse(JSON.stringify(structured)) as typeof structured;
  assert.equal(reloaded.placeSelections?.[0]?.routeStopId, visit.routeStopId);
  const reversed = inferAttractionVisitSelections(reloaded.placeMentions ?? [], [...targets].reverse(), reloaded.placeSelections);
  assert.equal(reversed.find((selection) => selection.kind === "visit")?.routeStopId, visit.routeStopId);

  const withoutBase = targets.filter((target) => target.routeStopId !== visit.routeStopId);
  const afterRemoval = inferAttractionVisitSelections(reloaded.placeMentions ?? [], withoutBase, reloaded.placeSelections);
  assert.equal(afterRemoval.some((selection) => selection.kind === "visit"), false);
  const reconciled = mergeStructuredTripBrief(reloaded, {
    destinations: withoutBase.map((target) => ({ id: target.routeStopId, name: target.name, canonicalPlaceId: target.canonicalPlaceId })),
    placeSelections: afterRemoval,
  });
  const attractionMention = reloaded.placeMentions?.find((mention) => mention.canonicalPlaceId === "angkor-wat");
  assert.ok(attractionMention);
  assert.equal(reconciled.placeMentions?.some((mention) => mention.mentionId === attractionMention.mentionId), true);
  assert.equal(reconciled.placeIssues?.some((issue) => issue.mentionId === attractionMention.mentionId && issue.blocksRoute), true);
});

test("Builder keeps confirmed visit relationships canonical without manufacturing planner activities", async () => {
  const source = await readFile(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  assert.match(source, /inferAttractionVisitSelections/);
  assert.match(source, /visiting from/);
  assert.match(source, /picks: effectivePicks/);
  assert.doesNotMatch(source, /visitPlannerPlaces/);
  assert.match(source, /Anchor\/base relationships stay in StructuredTripBrief/);
  assert.match(source, /nearbyBases/);
  assert.match(source, /confirmAttractionVisit/);
  assert.doesNotMatch(source, /stops\.map\([^)]*Machu Picchu/);
});
