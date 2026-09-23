import assert from "node:assert/strict";
import test from "node:test";

import type { TransferSegment, TripLeg, EasyTTrip, TripTransportDecisionSelection } from "../lib/easyt/trip.ts";
import { buildCanonicalTripLegs } from "../lib/easyt/trip-legs.ts";
import { resolveCanonicalTransferJourney } from "../lib/easyt/multimodal-transfer-resolution.ts";
import { reviewTrip } from "../lib/easyt/review.ts";
import { canonicalTripForOwner } from "../lib/easyt/trip-promotion.ts";

const fromEndpoint = {
  kind: "stop" as const,
  id: "tokyo-occurrence",
  name: "Tokyo",
  country: "Japan",
  canonicalPlaceId: "tokyo",
  coordinates: [139.6917, 35.6895] as [number, number],
};
const toEndpoint = {
  kind: "stop" as const,
  id: "kyoto-occurrence",
  name: "Kyoto",
  country: "Japan",
  canonicalPlaceId: "kyoto",
  coordinates: [135.7681, 35.0116] as [number, number],
};

function segment(mode: "train" | "road", minutes: number, provenance: "canonical_schedule" | "routing_engine"): TransferSegment {
  return {
    id: `${fromEndpoint.id}:${toEndpoint.id}:${mode}:0`,
    mode,
    fromEndpoint,
    toEndpoint,
    distanceKm: mode === "train" ? 365 : 455,
    durationMinutes: minutes,
    provider: mode === "train" ? "Reviewed Tokaido rail evidence." : "OpenRouteService routed road estimate.",
    provenance,
    confidence: "high",
    scheduleNeedsChecking: true,
  };
}

function recommendation(): TripLeg {
  const rail = segment("train", 135, "canonical_schedule");
  const road = segment("road", 390, "routing_engine");
  return {
    id: "trip-japan-leg-2",
    fromStopId: fromEndpoint.id,
    toStopId: toEndpoint.id,
    fromEndpoint,
    toEndpoint,
    classification: "intercity",
    mode: "train",
    distanceKm: rail.distanceKm,
    durationMinutes: rail.durationMinutes,
    headlineMinutes: rail.durationMinutes,
    doorToDoorMinutes: rail.durationMinutes,
    provider: rail.provider,
    provenance: rail.provenance,
    confidence: rail.confidence,
    scheduleNeedsChecking: rail.scheduleNeedsChecking,
    warnings: [],
    segments: [rail],
    routeMetadata: {
      source: "multimodal-resolver",
      planningEstimate: true,
      multimodalResolution: {
        version: 1,
        selected: "train",
        selectedCandidateId: "rail:network:tokaido",
        candidates: [
          {
            id: "rail:network:tokaido",
            summaryMode: "train",
            segments: [rail],
            totalDurationMinutes: 135,
            distanceKm: rail.distanceKm,
            confidence: "high",
            provenance: "canonical_schedule",
            evidence: "intercity_rail_network",
            connectionCount: 0,
            score: 90,
            reasons: ["Reviewed rail evidence supports this journey."],
          },
          {
            id: "road:routed",
            summaryMode: "road",
            segments: [road],
            totalDurationMinutes: 390,
            distanceKm: road.distanceKm,
            confidence: "high",
            provenance: "routing_engine",
            evidence: "routed_road",
            connectionCount: 0,
            score: 55,
            reasons: ["A road provider returned a plausible route."],
          },
        ],
        rejected: [],
      },
    },
  };
}

function trip(selection?: TripTransportDecisionSelection): EasyTTrip {
  const leg = recommendation();
  return {
    schemaVersion: 1,
    id: "trip-japan",
    ownerId: null,
    title: "Japan",
    status: "planned",
    startDate: "2027-04-01",
    endDate: "2027-04-08",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "Tokyo",
      mustDo: "",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      intent: {
        version: 1,
        travellers: 2,
        timing: { flexibility: "fixed", durationDays: 8 },
        hardConstraints: { originRequired: true, mustSeeStopIds: [], optionalStopIds: [], fixedCommitments: [], avoidDriving: false },
        preferences: { budgetSensitivity: "mid", transportModes: ["train"], pace: "balanced", interests: [], dislikes: [] },
      },
      decisionSelections: { transportByLeg: selection === undefined ? {} : { [leg.id]: selection } },
    },
    stops: [
      { id: fromEndpoint.id, order: 0, name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2027-04-01", departureDate: "2027-04-04", nights: 3 },
      { id: toEndpoint.id, order: 1, name: "Kyoto", country: "Japan", canonicalPlaceId: "kyoto", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2027-04-04", departureDate: "2027-04-08", nights: 4 },
    ],
    legs: [leg],
    planItems: [],
    recommendations: [],
    createdAt: "2026-09-22T12:00:00.000Z",
    updatedAt: "2026-09-22T12:00:00.000Z",
  };
}

test("an endpoint-bound supported choice overrides preferences without mutating Morrovia's recommendation", async () => {
  const module = await import("../lib/easyt/transport-mode-choice.ts").catch(() => ({}));
  const choices = (module as { supportedTransportChoicesForLeg?: Function }).supportedTransportChoicesForLeg;
  const select = (module as { selectTripLegTransportChoice?: Function }).selectTripLegTransportChoice;
  const effective = (module as { effectiveTripLeg?: Function }).effectiveTripLeg;
  assert.equal(typeof choices, "function");
  assert.equal(typeof select, "function");
  assert.equal(typeof effective, "function");
  if (!choices || !select || !effective) return;

  const source = trip();
  const road = choices(source, source.legs[0]).find((item: { mode: string }) => item.mode === "road");
  assert.ok(road);
  const selected = select(source, source.legs[0].id, road.identity);
  const projected = effective(selected, selected.legs[0]);

  assert.equal(projected.mode, "road");
  assert.equal(projected.durationMinutes, 390);
  assert.equal(projected.provenance, "routing_engine");
  assert.equal(source.legs[0].mode, "train");
  assert.equal(selected.legs[0].mode, "train");
  assert.equal(selected.legs[0].provider, "Reviewed Tokaido rail evidence.");
  assert.deepEqual(selected.brief.intent?.preferences.transportModes, ["train"]);
});

test("choice identity survives reload and candidate ordering but fails closed when evidence or endpoints change", async () => {
  const module = await import("../lib/easyt/transport-mode-choice.ts");
  const source = trip();
  const road = module.supportedTransportChoicesForLeg(source, source.legs[0]).find((item) => item.mode === "road");
  assert.ok(road);
  const selected = module.selectTripLegTransportChoice(source, source.legs[0].id, road.identity);
  const reloaded = JSON.parse(JSON.stringify(selected)) as EasyTTrip;
  const diagnostic = reloaded.legs[0].routeMetadata.multimodalResolution as { candidates: unknown[] };
  diagnostic.candidates.reverse();
  assert.equal(module.effectiveTripLeg(reloaded, reloaded.legs[0]).mode, "road");

  const reindexed = JSON.parse(JSON.stringify(selected)) as EasyTTrip;
  reindexed.legs[0].id = "trip-japan-leg-3-after-reorder";
  assert.equal(module.effectiveTripLeg(reindexed, reindexed.legs[0]).mode, "road",
    "exact occurrence endpoints retain the choice when generated leg IDs are reindexed");

  diagnostic.candidates = diagnostic.candidates.filter((candidate) => (candidate as { id: string }).id !== "road:routed");
  assert.equal(module.effectiveTripLeg(reloaded, reloaded.legs[0]).mode, "train");

  const stale = JSON.parse(JSON.stringify(selected)) as EasyTTrip;
  stale.legs[0].toStopId = "kyoto-return-occurrence";
  stale.legs[0].toEndpoint = { ...toEndpoint, id: "kyoto-return-occurrence" };
  assert.equal(module.effectiveTripLeg(stale, stale.legs[0]).mode, "train");
});

test("legacy strings are honored only when they identify a current candidate with the exact leg endpoints", async () => {
  const module = await import("../lib/easyt/transport-mode-choice.ts");
  const supportedLegacy = trip("road:routed");
  assert.equal(module.effectiveTripLeg(supportedLegacy, supportedLegacy.legs[0]).mode, "road");
  const staleLegacy = trip("road:routed");
  staleLegacy.legs[0].toEndpoint = { ...toEndpoint, id: "kyoto-return-occurrence" };
  staleLegacy.legs[0].toStopId = "kyoto-return-occurrence";
  assert.equal(module.effectiveTripLeg(staleLegacy, staleLegacy.legs[0]).mode, "train");

  const heuristicLegacy = trip("fastest");
  assert.equal(module.effectiveTripLeg(heuristicLegacy, heuristicLegacy.legs[0]).mode, "train");

  const fabricatedMode = trip("flight");
  assert.equal(module.effectiveTripLeg(fabricatedMode, fabricatedMode.legs[0]).mode, "train");
});

test("clearing an explicit choice immediately restores the untouched Morrovia recommendation", async () => {
  const module = await import("../lib/easyt/transport-mode-choice.ts");
  const source = trip();
  const road = module.supportedTransportChoicesForLeg(source, source.legs[0]).find((item) => item.mode === "road");
  assert.ok(road);
  const selected = module.selectTripLegTransportChoice(source, source.legs[0].id, road.identity);
  const cleared = module.clearTripLegTransportChoice(selected, source.legs[0].id);
  assert.equal(module.effectiveTripLeg(cleared, cleared.legs[0]).mode, "train");
  assert.equal(cleared.brief.decisionSelections?.transportByLeg[source.legs[0].id], undefined);
});

test("guest to account promotion remaps the endpoint-bound choice with its occurrence IDs", async () => {
  const module = await import("../lib/easyt/transport-mode-choice.ts");
  const source = trip();
  const road = module.supportedTransportChoicesForLeg(source, source.legs[0]).find((item) => item.mode === "road");
  assert.ok(road);
  const selected = module.selectTripLegTransportChoice(source, source.legs[0].id, road.identity);
  const promoted = canonicalTripForOwner("owner-a", selected);
  const saved = promoted.brief.decisionSelections?.transportByLeg[promoted.legs[0].id];
  assert.equal(typeof saved === "string" ? null : saved?.fromEndpointId, promoted.legs[0].fromEndpoint?.id);
  assert.equal(typeof saved === "string" ? null : saved?.toEndpointId, promoted.legs[0].toEndpoint?.id);
  assert.equal(module.effectiveTripLeg(promoted, promoted.legs[0]).mode, "road");
});

test("Route Check evaluates the derived effective choice", async () => {
  const module = await import("../lib/easyt/transport-mode-choice.ts");
  const source = trip();
  const road = module.supportedTransportChoicesForLeg(source, source.legs[0]).find((item) => item.mode === "road");
  assert.ok(road);
  const selected = module.selectTripLegTransportChoice(source, source.legs[0].id, road.identity);

  assert.equal(reviewTrip(source).some((item) => item.rule === "driving-load"), false);
  assert.equal(reviewTrip(selected).some((item) => item.rule === "driving-load"), true);
});

test("real Fenghuang to Hong Kong evidence retains a selectable alternative through reload and reset", async () => {
  const module = await import("../lib/easyt/transport-mode-choice.ts");
  const fenghuang = { id: "fenghuang-occurrence", order: 0, name: "Fenghuang", country: "China", canonicalPlaceId: "fenghuang", longitude: 109.6017, latitude: 27.9483, arrivalDate: "2027-05-01", departureDate: "2027-05-04", nights: 3 };
  const hongKong = { id: "hong-kong-occurrence", order: 1, name: "Hong Kong", country: "China", canonicalPlaceId: "hong-kong", longitude: 114.1694, latitude: 22.3193, arrivalDate: "2027-05-04", departureDate: "2027-05-08", nights: 4 };
  const [baseline] = buildCanonicalTripLegs({
    tripId: "real-runtime-choice",
    origin: { name: fenghuang.name, country: fenghuang.country, canonicalPlaceId: fenghuang.canonicalPlaceId, coordinates: [fenghuang.longitude, fenghuang.latitude] },
    stops: [hongKong],
  });
  const resolved = await resolveCanonicalTransferJourney(baseline);
  const source: EasyTTrip = {
    ...trip(),
    id: "real-runtime-choice",
    title: "Fenghuang and Hong Kong",
    startDate: "2027-05-01",
    endDate: "2027-05-08",
    brief: { ...trip().brief, origin: fenghuang.name, originCountry: fenghuang.country, originCanonicalPlaceId: fenghuang.canonicalPlaceId, originCoordinates: [fenghuang.longitude, fenghuang.latitude], decisionSelections: { transportByLeg: {} } },
    stops: [fenghuang, hongKong],
    legs: [resolved.leg],
    planItems: [],
  };

  const choices = module.supportedTransportChoicesForLeg(source, source.legs[0]);
  assert.deepEqual(choices.map((choice) => [choice.candidateId, choice.mode, choice.evidence]), [
    ["rail:network:china-high-speed-intercity", "train", "intercity_rail_network"],
    ["mixed:air-gateway", "mixed", "air_gateway_composition"],
  ]);
  const alternative = choices.find((choice) => choice.candidateId === "mixed:air-gateway");
  assert.ok(alternative);
  const selected = module.selectTripLegTransportChoice(source, source.legs[0].id, alternative.identity);
  const reloaded = JSON.parse(JSON.stringify(selected)) as EasyTTrip;
  assert.equal(module.effectiveTripLeg(reloaded, reloaded.legs[0]).mode, "mixed");
  assert.equal(reloaded.legs[0].mode, "train", "Morrovia's recommendation remains intact");
  const cleared = module.clearTripLegTransportChoice(reloaded, reloaded.legs[0].id);
  assert.equal(module.effectiveTripLeg(cleared, cleared.legs[0]).mode, "train");
});
