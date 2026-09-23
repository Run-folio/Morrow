import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeRouteCountryContinuity,
  classifyCountryContinuity,
  fixedChronologyCountryContinuityProofs,
  type CountryContinuityConstraintProof,
} from "../lib/easyt/route-country-continuity.ts";
import type { PlannerStop } from "../lib/easyt/planner.ts";

const stop = (id: string, country: string, countryCode?: string): PlannerStop => ({
  id,
  name: id,
  country,
  ...(countryCode === undefined ? {} : { countryCode }),
});

test("analyzes canonical country blocks without collapsing stop occurrences", () => {
  const oneBlock = analyzeRouteCountryContinuity([
    stop("mumbai", "India", "IN"),
    stop("agra", "India", "IN"),
    stop("dubai", "United Arab Emirates", "AE"),
  ]);
  assert.equal(oneBlock.blockCount, 2);
  assert.equal(oneBlock.reentryCount, 0);

  const reentry = analyzeRouteCountryContinuity([
    stop("mumbai", "India", "IN"),
    stop("dubai", "United Arab Emirates", "AE"),
    stop("agra", "India", "IN"),
  ]);
  assert.deepEqual(reentry.blocksByCountry, { IN: 2, AE: 1 });
  assert.deepEqual(reentry.reentriesByCountry, { IN: 1 });
  assert.deepEqual(reentry.repeatedCountryCodes, ["IN"]);
  assert.deepEqual(reentry.blocks.filter((block) => block.countryCode === "IN").flatMap((block) => block.stopIds), ["mumbai", "agra"]);

  const alternating = analyzeRouteCountryContinuity([
    stop("jp-1", "Japan"),
    stop("cn-1", "CN"),
    stop("jp-2", "Japan"),
    stop("cn-2", "China"),
  ]);
  assert.equal(alternating.reentryCount, 2);
  assert.deepEqual(alternating.reentriesByCountry, { JP: 1, CN: 1 });

  const repeatedOccurrence = analyzeRouteCountryContinuity([
    { ...stop("tokyo-1", "Japan"), canonicalPlaceId: "tokyo" },
    stop("seoul", "South Korea"),
    { ...stop("tokyo-2", "Japan"), canonicalPlaceId: "tokyo" },
  ]);
  assert.deepEqual(repeatedOccurrence.blocks.filter((block) => block.countryCode === "JP").flatMap((block) => block.stopIds), ["tokyo-1", "tokyo-2"]);
});

test("treats unknown country occurrences as stable analysis barriers", () => {
  const separated = analyzeRouteCountryContinuity([
    stop("in-1", "India", "IN"),
    stop("unknown", "Unknown", "ZZ"),
    stop("in-2", "India", "IN"),
  ]);
  assert.equal(separated.knownSpanCount, 2);
  assert.deepEqual(separated.unknownCountryStopIds, ["unknown"]);
  assert.equal(separated.reentryCount, 0);
  assert.deepEqual(separated.repeatedCountryCodes, []);
  assert.deepEqual(separated.blocksByCountry, { IN: 2 });

  const suffix = analyzeRouteCountryContinuity([
    stop("unknown", "Unknown", "ZZ"),
    stop("jp-1", "Japan", "JP"),
    stop("cn", "China", "CN"),
    stop("jp-2", "Japan", "JP"),
  ]);
  assert.equal(suffix.knownSpanCount, 1);
  assert.equal(suffix.reentryCount, 1);
  assert.deepEqual(suffix.repeatedCountryCodes, ["JP"]);
});

test("uses countryCode first and otherwise resolves aliases through the shared registry", () => {
  const analysis = analyzeRouteCountryContinuity([
    stop("london", "ignored", "gb"),
    stop("edinburgh", "UK"),
    stop("paris", "France"),
  ]);
  assert.deepEqual(analysis.blocks.map((block) => block.countryCode), ["GB", "FR"]);
  assert.deepEqual(analysis.blocks[0]?.stopIds, ["london", "edinburgh"]);

  const invalidCanonicalCode = analyzeRouteCountryContinuity([stop("mystery", "India", "ZZ")]);
  assert.deepEqual(invalidCanonicalCode.unknownCountryStopIds, ["mystery"]);
  assert.equal(invalidCanonicalCode.knownStopCount, 0);
});

test("excludes external origin and journey end by accepting planned stops only", () => {
  const origin = stop("madrid-origin", "Spain", "ES");
  const journeyEnd = stop("madrid-end", "Spain", "ES");
  const plannedStops = [stop("mumbai", "India", "IN"), stop("agra", "India", "IN")];
  const analysis = analyzeRouteCountryContinuity(plannedStops);

  assert.equal(analysis.knownStopCount, 2);
  assert.equal(analysis.blocks.some((block) => block.stopIds.includes(origin.id) || block.stopIds.includes(journeyEnd.id)), false);
});

test("classifies repeated blocks from positive alternatives or typed proof only", () => {
  const current = analyzeRouteCountryContinuity([
    stop("mumbai", "India", "IN"),
    stop("dubai", "United Arab Emirates", "AE"),
    stop("agra", "India", "IN"),
  ]);
  const lowerBlock = analyzeRouteCountryContinuity([
    stop("mumbai", "India", "IN"),
    stop("agra", "India", "IN"),
    stop("dubai", "United Arab Emirates", "AE"),
  ]);
  const gatewayProof: CountryContinuityConstraintProof = {
    countryCode: "IN",
    kind: "fixed-gateway-position",
    provenReentryCount: 1,
    stopIds: ["mumbai", "dubai", "agra"],
    constraintIds: ["fixed-start:mumbai", "fixed-end:agra"],
  };

  const avoidable = classifyCountryContinuity({ route: current, viableAlternatives: [current, lowerBlock] });
  assert.equal(avoidable[0]?.status, "avoidable");
  assert.equal(avoidable[0]?.observedLowerBlockCount, 1);
  assert.deepEqual(avoidable[0]?.legIndexes, [2]);

  const proven = classifyCountryContinuity({ route: current, viableAlternatives: [current], proofs: [gatewayProof] });
  assert.equal(proven[0]?.status, "proven-constraint-driven");
  assert.deepEqual(proven[0]?.proof, gatewayProof);

  const protectedOnly = classifyCountryContinuity({ route: current, viableAlternatives: [current] });
  assert.equal(protectedOnly[0]?.status, "unproven-protected");
  assert.equal(protectedOnly[0]?.proof, undefined);
});

test("an observed lower-block route takes precedence over supplied proof", () => {
  const current = analyzeRouteCountryContinuity([
    stop("jp-1", "Japan", "JP"),
    stop("cn", "China", "CN"),
    stop("jp-2", "Japan", "JP"),
  ]);
  const lowerBlock = analyzeRouteCountryContinuity([
    stop("jp-1", "Japan", "JP"),
    stop("jp-2", "Japan", "JP"),
    stop("cn", "China", "CN"),
  ]);
  const contradictedProof: CountryContinuityConstraintProof = {
    countryCode: "JP",
    kind: "authoritative-protected-order",
    provenReentryCount: 1,
    stopIds: ["jp-1", "cn", "jp-2"],
    constraintIds: ["explicit-order"],
  };

  assert.equal(classifyCountryContinuity({
    route: current,
    viableAlternatives: [current, lowerBlock],
    proofs: [contradictedProof],
  })[0]?.status, "avoidable");
});

test("does not use an alternative that moves known stops across an unknown barrier", () => {
  const current = analyzeRouteCountryContinuity([
    stop("in-1", "India", "IN"),
    stop("ae", "United Arab Emirates", "AE"),
    stop("in-2", "India", "IN"),
    stop("unknown", "Unknown"),
    stop("in-3", "India", "IN"),
  ]);
  const barrierCrossing = analyzeRouteCountryContinuity([
    stop("in-1", "India", "IN"),
    stop("ae", "United Arab Emirates", "AE"),
    stop("unknown", "Unknown"),
    stop("in-2", "India", "IN"),
    stop("in-3", "India", "IN"),
  ]);

  const assessment = classifyCountryContinuity({
    route: current,
    viableAlternatives: [current, barrierCrossing],
  });
  assert.equal(assessment[0]?.status, "unproven-protected");
  assert.equal(assessment[0]?.observedLowerBlockCount, undefined);
});

test("does not let a partial chronology proof claim every re-entry for a country", () => {
  const stops = [
    stop("a-1", "India", "IN"),
    stop("b-1", "United Arab Emirates", "AE"),
    stop("a-2", "India", "IN"),
    stop("c", "China", "CN"),
    stop("a-3", "India", "IN"),
    stop("b-2", "United Arab Emirates", "AE"),
    stop("a-4", "India", "IN"),
  ];
  const route = analyzeRouteCountryContinuity(stops);
  const proofs = fixedChronologyCountryContinuityProofs(stops, [
    { label: "First India stay", date: "2026-10-01", stopId: "a-1" },
    { label: "UAE stay", date: "2026-10-02", stopId: "b-1" },
    { label: "Second India stay", date: "2026-10-03", stopId: "a-2" },
  ]);

  assert.equal(route.reentriesByCountry.IN, 3);
  assert.equal(proofs[0]?.provenReentryCount, 1);
  assert.equal(classifyCountryContinuity({ route, viableAlternatives: [route], proofs })[0]?.status, "unproven-protected");
});

test("does not apply chronology proof from another occurrence span", () => {
  const stops = [
    stop("a-1", "India", "IN"),
    stop("b-1", "United Arab Emirates", "AE"),
    stop("unknown", "Unknown"),
    stop("a-2", "India", "IN"),
    stop("b-2", "United Arab Emirates", "AE"),
    stop("a-3", "India", "IN"),
  ];
  const route = analyzeRouteCountryContinuity(stops);
  const proofs = fixedChronologyCountryContinuityProofs(stops, [
    { label: "First India stay", date: "2026-10-01", stopId: "a-1" },
    { label: "First UAE stay", date: "2026-10-02", stopId: "b-1" },
    { label: "Second India stay", date: "2026-10-03", stopId: "a-2" },
  ]);
  const assessment = classifyCountryContinuity({ route, viableAlternatives: [route], proofs })[0];

  assert.equal(route.reentriesByCountry.IN, 1);
  assert.equal(proofs[0]?.provenReentryCount, 1);
  assert.deepEqual(assessment?.affectedStopIds, ["a-2", "a-3"]);
  assert.deepEqual(proofs[0]?.stopIds, ["a-1", "b-1", "a-2"]);
  assert.equal(assessment?.status, "unproven-protected");
});

test("deduplicates the same dated occurrence before proving fixed chronology", () => {
  const stops = [
    stop("india-north", "India", "IN"),
    stop("uae", "United Arab Emirates", "AE"),
    stop("india-south", "India", "IN"),
  ];
  const proof = fixedChronologyCountryContinuityProofs(stops, [
    { label: "North booking", date: "2026-09-01", stopId: "india-north" },
    { label: "North arrival lock", date: "2026-09-01", stopId: "india-north" },
    { label: "UAE booking", date: "2026-09-05", stopId: "uae" },
    { label: "South booking", date: "2026-09-09", stopId: "india-south" },
  ]);

  assert.equal(proof[0]?.kind, "fixed-position-chronology");
  assert.deepEqual(proof[0]?.stopIds, ["india-north", "uae", "india-south"]);
  assert.deepEqual(fixedChronologyCountryContinuityProofs(stops, [
    { label: "North booking", date: "2026-09-01", stopId: "india-north" },
    { label: "UAE booking", date: "2026-09-01", stopId: "uae" },
    { label: "South booking", date: "2026-09-09", stopId: "india-south" },
  ]), []);
});
