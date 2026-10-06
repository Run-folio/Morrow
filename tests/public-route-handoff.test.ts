import assert from "node:assert/strict";
import test from "node:test";

test("public_route_handoff_retains_editorial_order_and_end_semantics", () => {
  const detail = publicRouteDetailFor("andean-highlands")!;
  const payload = routePlannerPayload(detail.planDraft, new Date(2026, 4, 10, 12));
  assert.ok(payload.routeIntent);
  assert.equal(payload.routeIntent.tripType, "unknown_legacy");
  assert.equal(payload.routeIntent.orderAuthority, "legacy_preserved");
  assert.deepEqual(payload.routeIntent.orderedStopIds, payload.destinations.map(stop => stop.id));
});
import { readFileSync } from "node:fs";
import { publicRouteDetailFor } from "../lib/easyt/public-route.ts";
import { routePlannerPayload } from "../lib/easyt/public-route-handoff.ts";
import { immersiveRouteKeys } from "../lib/easyt/immersive-homepage-routes.ts";
import { initialHandoffRouteStops } from "../lib/easyt/home-trip-handoff.ts";
import { canonicalPlaceSuggestionFor } from "../lib/easyt/place-intelligence.ts";
import { routeFamilyByKey } from "../lib/easyt/route-catalog.ts";
import { mergeStructuredTripBrief, routeConstraintsFromStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import { validateFinalPlan } from "../lib/easyt/plan-validator.ts";
import { generateRouteCandidates } from "../lib/easyt/route-candidates.ts";

test("Route Detail starts templates through the recovery boundary and leaves modified navigation to the destination tab", () => {
  const source = readFileSync(new URL("../app/journey/routes/[slug]/route-plan-link.tsx", import.meta.url), "utf8");
  assert.match(source, /beginNewTripNavigation/);
  assert.doesNotMatch(source, /clearActiveTrip/);
  assert.match(source, /event\.metaKey/);
  assert.match(source, /event\.ctrlKey/);
  assert.match(source, /event\.button !== 0/);
  assert.match(source, /inspire=/, "the destination must retain canonical template identity for new tabs");
  assert.doesNotMatch(source, /homeDraft=1&inspire=/, "inspire identity must not consume an older shared homepage handoff");
  assert.doesNotMatch(source, /localStorage\.setItem/, "Route Detail must leave shared handoff state untouched");
});

test("Plan this route carries identity, order, duration, nights and structured intent", () => {
  const detail = publicRouteDetailFor("andean-highlands");
  assert.ok(detail);
  const payload = routePlannerPayload(detail.planDraft, new Date(2026, 4, 10, 12));
  assert.equal(payload.sourceRouteKey, "andean-highlands");
  assert.equal(payload.startDate, "2026-05-10");
  assert.equal(payload.endDate, "2026-05-18");
  assert.equal(payload.datesExplicit, false);
  assert.deepEqual(payload.decisionSelections, { routeOrder: "entered", transportByLeg: {} });
  assert.deepEqual(payload.destinations.map((stop) => stop.name), ["Cusco", "Sacred Valley", "Arequipa"]);
  assert.equal(Object.values(payload.nightAllocations).reduce((sum, value) => sum + value, 0), 8);
  assert.equal(payload.structuredBrief.duration?.value, 9);
  assert.deepEqual(payload.structuredBrief.destinations.map((stop) => stop.id), payload.destinations.map((stop) => stop.id));
  const storedPayload = JSON.parse(JSON.stringify(payload)) as typeof payload;
  assert.equal(storedPayload.sourceRouteKey, payload.sourceRouteKey);
  assert.deepEqual(storedPayload.destinations.map((stop) => stop.id), payload.destinations.map((stop) => stop.id));
  assert.deepEqual(storedPayload.nightAllocations, payload.nightAllocations);
  assert.deepEqual(storedPayload.decisionSelections, payload.decisionSelections);
});

test("the reviewed Morocco route reaches Builder with canonical stops and no false Chefchaouen review", () => {
  const detail = publicRouteDetailFor("morocco-rail");
  assert.ok(detail);
  const payload = routePlannerPayload(detail.planDraft, new Date(2026, 7, 27, 12));
  assert.deepEqual(payload.destinations.map((stop) => stop.canonicalPlaceId), ["marrakech", "fes", "chefchaouen"]);
  assert.equal(payload.originCanonicalPlaceId, "marrakech");
  assert.equal(payload.structuredBrief.placeMentions?.find((mention) => mention.canonicalPlaceId === "chefchaouen")?.status, "resolved");
  assert.equal(payload.structuredBrief.placeIssues?.some((issue) => issue.sourceText.toLocaleLowerCase().includes("chefchaouen")), false);

  const stored = JSON.parse(JSON.stringify(payload)) as typeof payload;
  assert.deepEqual(stored.destinations.map((stop) => stop.canonicalPlaceId), payload.destinations.map((stop) => stop.canonicalPlaceId));
});

test('approved route handoffs retain the final overnight base without inventing a fixed departure', () => {
  for (const key of immersiveRouteKeys) {
    const detail = publicRouteDetailFor(key)!;
    const payload = JSON.parse(JSON.stringify(routePlannerPayload(detail.planDraft)));
    assert.equal(payload.journeyEnd.mode, 'unknown');
    assert.equal(payload.destinations.at(-1).name, detail.stops.at(-1)!.name);
    assert.equal(payload.structuredBrief.hardConstraints.some((constraint: { type: string }) => constraint.type === 'start-at' || constraint.type === 'end-at'), false);
    assert.equal(payload.datesExplicit, false);
  }
});

test("adding Istanbul after the reviewed Balkan route does not inherit a fixed Ohrid departure", () => {
  const detail = publicRouteDetailFor("balkans-overland");
  assert.ok(detail);
  const payload = JSON.parse(JSON.stringify(routePlannerPayload(detail.planDraft, new Date(2026, 9, 15, 12))));
  const hydrated = initialHandoffRouteStops(payload.structuredBrief.placeMentions ?? [], payload.destinations, payload.journeyEnd);
  const istanbul = canonicalPlaceSuggestionFor("Istanbul");
  const verifiedIstanbul = routeFamilyByKey["romania-bulgaria-turkey"]?.stops.find((stop) => stop.name === "Istanbul");
  assert.ok(istanbul && verifiedIstanbul);
  // Builder's canonical Add stop path appends the verified place occurrence.
  const stops = [...hydrated, {
    id: "istanbul-added", name: istanbul.name, country: istanbul.country,
    canonicalPlaceId: istanbul.canonicalPlaceId, coordinates: verifiedIstanbul.coordinates,
  }];
  assert.deepEqual(stops.map((stop) => stop.name), ["Split", "Dubrovnik", "Kotor", "Shkodër", "Tirana", "Ohrid", "Istanbul"]);
  const brief = mergeStructuredTripBrief(payload.structuredBrief, {
    destinations: [
      { name: payload.origin, role: "arrival-gateway", priority: "required" },
      ...stops.map((stop) => ({
        id: stop.id, name: stop.name, canonicalPlaceId: stop.canonicalPlaceId,
        role: payload.structuredBrief.destinations.find((destination: { id?: string }) => destination.id === stop.id)?.role ?? "preferred",
        priority: "normal" as const,
      })),
      ...(payload.journeyEnd.mode === "explicit"
        ? [{ name: payload.journeyEnd.place.name, role: "departure-gateway" as const, priority: "required" as const }]
        : []),
    ],
  });
  const constraints = routeConstraintsFromStructuredTripBrief(brief, stops.map((stop) => stop.id));
  const nights = { ...payload.nightAllocations, "catalog-balkans-overland-5": 1, "istanbul-added": 1 };
  const validation = validateFinalPlan({
    plan: {
      version: 1,
      origin: { name: payload.origin, coordinates: payload.originCoordinates },
      stops: stops.map((stop) => ({ ...stop, nights: nights[stop.id] ?? 0 })),
      totalNights: 14,
      pace: "balanced",
      startDate: payload.startDate,
      endDate: payload.endDate,
      constraints,
    },
    structuredBrief: brief,
    estimateLeg: (from, to) => ({
      mode: "road", distanceKm: 100, durationMinutes: 120,
      label: `${from.name} → ${to.name}`, note: "Fixture planning estimate.", confidence: "medium",
    }),
  });
  assert.equal(payload.sourceRouteKey, "balkans-overland");
  assert.equal(stops.reduce((sum, stop) => sum + (nights[stop.id] ?? 0), 0), 14);
  assert.equal(constraints.fixedEndStopId, undefined);
  assert.equal(validation.issues.some((issue) => issue.code === "fixed-end-broken"), false);
  assert.equal(validation.errorCount, 0, JSON.stringify(validation.issues));
  for (const ordered of [
    [...hydrated.slice(0, 3), stops.at(-1)!, ...hydrated.slice(3)],
    [...hydrated.slice(0, 2), hydrated[3]!, hydrated[2]!, ...hydrated.slice(4), stops.at(-1)!],
  ]) {
    const edited = mergeStructuredTripBrief(brief, {
      destinations: ordered.map((stop) => ({ id: stop.id, name: stop.name, canonicalPlaceId: stop.canonicalPlaceId, role: "preferred", priority: "normal" })),
    });
    const editedConstraints = routeConstraintsFromStructuredTripBrief(edited, ordered.map((stop) => stop.id));
    const candidates = generateRouteCandidates({
      origin: { name: payload.origin, coordinates: payload.originCoordinates },
      stops: ordered,
      constraints: editedConstraints,
      estimateLeg: (from, to) => ({ mode: "road", distanceKm: 100, durationMinutes: 120, label: `${from.name} → ${to.name}`, note: "Fixture planning estimate.", confidence: "medium" }),
    });
    assert.equal(editedConstraints.fixedEndStopId, undefined);
    assert.deepEqual(candidates.candidates.find((candidate) => candidate.metadata.matchesOriginalOrder)?.stops.map((stop) => stop.id), ordered.map((stop) => stop.id));
  }
});

test("reviewed route handoffs never promote generated connective prose into place intent", () => {
  for (const key of immersiveRouteKeys) {
    for (let run = 0; run < 10; run += 1) {
      const detail = publicRouteDetailFor(key)!;
      const payload = JSON.parse(JSON.stringify(routePlannerPayload(detail.planDraft)));
      const routeIds = new Set(payload.destinations.flatMap((destination: { canonicalPlaceId?: string }) => destination.canonicalPlaceId ?? []));
      const mentions = payload.structuredBrief.placeMentions ?? [];
      assert.equal(mentions.every((mention: { canonicalPlaceId?: string; routability?: string }) => Boolean(mention.canonicalPlaceId && (routeIds.has(mention.canonicalPlaceId) || mention.routability === "anchor_or_poi"))), true, `${key} run ${run + 1}`);
      assert.equal(mentions.some((mention: { sourceText: string }) => /^(?:continue|then|through|around|explore|follow|before|after|onward|via)$/i.test(mention.sourceText)), false, `${key} run ${run + 1}`);
      assert.equal(payload.structuredBrief.placeIssues?.some((issue: { sourceText: string }) => issue.sourceText.toLocaleLowerCase() === "continue"), false);
    }
  }
});
