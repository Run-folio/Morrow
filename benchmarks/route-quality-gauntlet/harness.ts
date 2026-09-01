import { canBuildTrip } from "../../lib/easyt/can-build-trip.ts";
import { allocateTripNights, type NightAllocationResult } from "../../lib/easyt/night-allocation.ts";
import { validateFinalPlan } from "../../lib/easyt/plan-validator.ts";
import { assessRouteIntelligence, estimateLegForConstraints, type EstimatedLeg, type PlannerStop } from "../../lib/easyt/planner.ts";
import { tripHealth } from "../../lib/easyt/review.ts";
import { defaultTripIntent, tripFromBuilder, type BuilderDay, type EasyTTrip } from "../../lib/easyt/trip.ts";
import type { StructuredTripBrief, TripBriefDestination, TripBriefHardConstraint, TripBriefProvenance } from "../../lib/easyt/structured-trip-brief.ts";
import { transferDoorToDoorMinutes } from "../../lib/easyt/transfer-impact.ts";
import { ROUTE_QUALITY_FIXTURES, ROUTE_QUALITY_VARIANTS, routeQualityVariantFixture, type RouteQualityFixture } from "./fixtures.ts";

export type RouteQualityFinding = {
  id: string;
  layer: "route-order" | "nights" | "dates" | "transfers" | "constraints" | "health" | "builder" | "visit-base";
  status: "pass" | "fail";
  message: string;
};

export type RouteQualityResult = {
  id: string;
  name: string;
  regions: string[];
  structures: string[];
  assessment: RouteQualityFixture["assessment"];
  output: {
    enteredStopIds: string[];
    selectedStopIds: string[];
    routeState: ReturnType<typeof assessRouteIntelligence>["route"]["state"];
    enteredTransferMinutes: number | null;
    selectedTransferMinutes: number | null;
    modes: EasyTTrip["legs"][number]["mode"][];
    transferConfidence: EstimatedLeg["confidence"][];
    nightState: NightAllocationResult["state"];
    allocations: Record<string, number> | null;
    validatorIssues: string[];
    healthStatus: ReturnType<typeof tripHealth>["status"];
    healthRules: string[];
    builderOutcome: ReturnType<typeof canBuildTrip>["outcome"];
    canBuild: boolean;
    visitIds: string[];
    canonicalStopIds: string[];
    calendar: Array<{ id: string; arrivalDate: string | null; departureDate: string | null; nights: number | null }>;
  };
  findings: RouteQualityFinding[];
  trip: EasyTTrip;
};

export type RouteQualityComparison = {
  id: string;
  mutation: typeof ROUTE_QUALITY_VARIANTS[number]["mutation"];
  baseFixtureId: string;
  pass: boolean;
  observations: string[];
};

const provenance: TripBriefProvenance = { source: "prompt", kind: "explicit", confidence: "high" };
const dateAt = (start: string, offset: number) => new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function structuredBrief(fixture: RouteQualityFixture): StructuredTripBrief {
  const destinations: TripBriefDestination[] = fixture.stops.map((item) => ({
    id: item.id,
    name: item.name,
    canonicalPlaceId: `gauntlet:${item.id}`,
    resolutionStatus: "resolved",
    routability: "direct_destination",
    parentCountries: [item.country],
    role: fixture.constraints?.fixedStartStopId === item.id
      ? "arrival-gateway"
      : fixture.constraints?.fixedEndStopId === item.id
        ? "departure-gateway"
        : "must-visit",
    priority: "required",
    provenance: { ...provenance, sourceText: item.name },
  }));
  const visits: TripBriefDestination[] = (fixture.visits ?? []).map((visit) => ({
    id: visit.id,
    name: visit.name,
    canonicalPlaceId: `gauntlet:${visit.id}`,
    resolutionStatus: "resolved",
    routability: "anchor_or_poi",
    placeType: visit.kind === "natural-area" || visit.kind === "national-park" ? "natural_area" : "landmark",
    parentCanonicalPlaceId: `gauntlet:${visit.baseStopId}`,
    role: "trip-anchor",
    priority: "required",
    provenance: { ...provenance, sourceText: visit.name },
  }));
  const hardConstraints: TripBriefHardConstraint[] = [
    { type: "duration", duration: { value: fixture.days, unit: "days", precision: "exact", provenance } },
    ...fixture.stops.map((item): TripBriefHardConstraint => ({ type: "must-visit", value: item.name, provenance: { ...provenance, sourceText: item.name } })),
    ...(fixture.constraints?.fixedStartStopId ? [{ type: "start-at" as const, value: fixture.stops.find((item) => item.id === fixture.constraints?.fixedStartStopId)?.name ?? "", provenance }] : []),
    ...(fixture.constraints?.fixedEndStopId ? [{ type: "end-at" as const, value: fixture.stops.find((item) => item.id === fixture.constraints?.fixedEndStopId)?.name ?? "", provenance }] : []),
    ...(fixture.constraints?.avoidDriving ? [{ type: "no-driving" as const, value: true as const, provenance }] : []),
    ...(fixture.constraints?.excludedTransportModes?.includes("flight") ? [{ type: "no-flying" as const, value: true as const, provenance }] : []),
    ...(fixture.constraints?.fixedCommitments ?? []).map((item): TripBriefHardConstraint => ({ type: "fixed-commitment", value: item.label, date: item.date, provenance })),
  ];
  const transportPreferences: StructuredTripBrief["transportPreferences"] = (fixture.constraints?.transportModes ?? []).map((mode) => ({ value: mode, provenance }));
  return {
    version: 1,
    duration: { value: fixture.days, unit: "days", precision: "exact", provenance },
    destinations: [...destinations, ...visits],
    mustVisit: [...destinations.filter((item) => !["arrival-gateway", "departure-gateway"].includes(item.role)), ...visits],
    countries: [...new Set(fixture.stops.map((item) => item.country))].map((value) => ({ value, provenance })),
    preferredRegions: [], travellers: { value: 2, provenance }, dates: {},
    pace: { value: fixture.pace === "fast" || fixture.pace === "packed" ? "packed" : fixture.pace === "relaxed" ? "relaxed" : "balanced", provenance },
    interests: [], transportPreferences, accommodationPreferences: [],
    hardConstraints, softPreferences: [], source: { rawPrompt: fixture.name, parserVersion: "route-quality-gauntlet", inputs: ["prompt"] },
    confidence: "high", issues: [], placeMentions: [], placeIssues: [], placeSelections: [], removedPlaceMentionIds: [],
  };
}

function routeLegs(fixture: RouteQualityFixture, stops: PlannerStop[]) {
  return stops.map((stop, index) => estimateLegForConstraints(index ? stops[index - 1] : fixture.origin, stop, fixture.constraints));
}

function knownTotal(legs: EstimatedLeg[]) {
  const values = legs.map((leg) => transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes));
  return values.some((value) => value === null) ? null : sum(values as number[]);
}

function buildDraft(stops: PlannerStop[], allocations: Record<string, number>, startDate: string): BuilderDay[] {
  const days: BuilderDay[] = [];
  let day = 0;
  stops.forEach((stop, stopIndex) => {
    const count = Math.max(0, allocations[stop.id] ?? 0) + (stopIndex === stops.length - 1 ? 1 : 0);
    for (let local = 0; local < count; local += 1) {
      days.push({
        number: String(day + 1).padStart(2, "0"), date: dateAt(startDate, day), destination: stop.name,
        title: local === 0 ? `Arrive in ${stop.name}` : `Open day in ${stop.name}`,
        reason: local === 0 ? "Protected arrival and transfer day." : "Open planning time retained by the route-quality gauntlet.",
        items: [], type: local === 0 ? "arrival" : "open", coordinates: stop.coordinates,
      });
      day += 1;
    }
  });
  return days;
}

const finding = (id: string, layer: RouteQualityFinding["layer"], pass: boolean, message: string): RouteQualityFinding => ({ id, layer, status: pass ? "pass" : "fail", message });

export function evaluateRouteQualityFixture(fixture: RouteQualityFixture): RouteQualityResult {
  const enteredStopIds = fixture.stops.map((item) => item.id);
  const assessment = assessRouteIntelligence({
    origin: fixture.origin, stops: fixture.stops, picks: {}, availableDays: fixture.days,
    constraints: fixture.constraints,
    scoringPreferences: { pace: fixture.pace, preferredModes: fixture.constraints?.transportModes?.map((mode) => mode === "drive" ? "road" : mode) },
  });
  const selectedStopIds = assessment.route.state === "recommendation" ? assessment.route.recommendedStopIds : enteredStopIds;
  const byId = new Map(fixture.stops.map((item) => [item.id, item]));
  const selectedStops = selectedStopIds.map((id) => byId.get(id)).filter((item): item is RouteQualityFixture["stops"][number] => Boolean(item));
  const persistedAssessment = assessment.route.state === "recommendation"
    ? assessRouteIntelligence({
        origin: fixture.origin, stops: selectedStops, picks: {}, availableDays: fixture.days,
        constraints: fixture.constraints,
        scoringPreferences: { pace: fixture.pace, preferredModes: fixture.constraints?.transportModes?.map((mode) => mode === "drive" ? "road" : mode) },
      })
    : assessment;
  const enteredLegs = routeLegs(fixture, fixture.stops);
  const selectedLegs = routeLegs(fixture, selectedStops);
  const nightAllocation = allocateTripNights({
    totalNights: fixture.days - 1,
    pace: fixture.pace,
    fixedCommitments: fixture.constraints?.fixedCommitments,
    stops: selectedStops.map((stop, index) => ({
      ...stop,
      required: true,
      arrivalImpact: selectedLegs[index]?.transferImpact,
      departureImpact: selectedLegs[index + 1]?.transferImpact,
    })),
  });
  const allocations = nightAllocation.state === "conflict" || !nightAllocation.allocations
    ? Object.fromEntries(selectedStops.map((stop) => [stop.id, 0]))
    : nightAllocation.allocations;
  const startDate = "2027-05-01";
  const endDate = dateAt(startDate, fixture.days - 1);
  const brief = structuredBrief(fixture);
  const trip = tripFromBuilder({
    id: `route-quality-${fixture.id}`,
    origin: fixture.origin.name,
    originCountry: fixture.origin.country,
    originCanonicalPlaceId: `gauntlet-origin:${fixture.origin.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    originProviderId: `gauntlet-origin:${fixture.id}`,
    originCoordinates: fixture.origin.coordinates,
    stops: selectedStops.map((stop) => ({ ...stop, canonicalPlaceId: `gauntlet:${stop.id}`, providerId: `gauntlet:${stop.id}` })),
    startDate, endDate, picks: {}, mustDo: (fixture.visits ?? []).map((visit) => visit.name).join(", "),
    pace: fixture.pace === "fast" || fixture.pace === "packed" ? "full" : "slow", hotels: "few", budget: "mid",
    nightAllocations: allocations, nightAllocation, draft: buildDraft(selectedStops, allocations, startDate),
    structuredBrief: brief, routeAssessment: persistedAssessment,
    intent: {
      ...defaultTripIntent({ durationDays: fixture.days, stopIds: selectedStopIds, pace: fixture.pace === "fast" || fixture.pace === "packed" ? "packed" : fixture.pace ?? "balanced" }),
      hardConstraints: {
        originRequired: true, mustSeeStopIds: selectedStopIds, optionalStopIds: [],
        fixedCommitments: (fixture.constraints?.fixedCommitments ?? []).map((item, index) => ({ id: `fixed-${index}`, label: item.label, date: item.date })),
        avoidDriving: Boolean(fixture.constraints?.avoidDriving),
      },
    },
  });
  const validation = validateFinalPlan({
    plan: {
      version: 1, origin: fixture.origin,
      stops: trip.stops.map((stop) => ({
        id: stop.id, name: stop.name, country: stop.country,
        coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] : undefined,
        nights: stop.nights ?? 0, arrivalDate: stop.arrivalDate, departureDate: stop.departureDate,
        fixedNights: fixture.stops.find((item) => item.id === stop.id)?.fixedNights,
        required: true, anchor: fixture.stops.find((item) => item.id === stop.id)?.anchor,
      })),
      totalNights: fixture.days - 1, pace: fixture.pace, startDate, endDate, constraints: fixture.constraints,
    },
    structuredBrief: brief, nightAllocation,
  });
  const health = tripHealth(trip);
  const build = canBuildTrip({
    origin: fixture.origin.name, originCoordinates: fixture.origin.coordinates,
    stops: selectedStops.map((stop) => ({ id: stop.id, name: stop.name, country: stop.country, coordinates: stop.coordinates })),
    placeReviewPending: false, placeIssues: [], routeConstraintIssues: assessment.route.constraintIssues,
    requiredStopIds: fixture.constraints?.requiredStopIds ?? selectedStopIds,
    startDate, endDate, durationDays: fixture.days, expectedDurationDays: fixture.days,
    structuredBriefIssues: brief.issues, nightAllocation, allocations,
    planValidation: validation, transferImpacts: selectedLegs.map((leg) => leg.transferImpact),
    routeOrderFixed: Boolean(fixture.constraints?.fixedCommitments?.length), document: trip,
  });

  const findings: RouteQualityFinding[] = [];
  findings.push(finding("canonical-stop-set", "route-order",
    selectedStopIds.length === enteredStopIds.length && new Set(selectedStopIds).size === enteredStopIds.length && enteredStopIds.every((id) => selectedStopIds.includes(id)),
    "Every requested canonical stop appears exactly once."));
  if (fixture.expected.fixedStartStopId) findings.push(finding("fixed-start", "constraints", selectedStopIds[0] === fixture.expected.fixedStartStopId, "The fixed first stop remains first."));
  if (fixture.expected.fixedEndStopId) findings.push(finding("fixed-end", "constraints", selectedStopIds.at(-1) === fixture.expected.fixedEndStopId, "The fixed final stop remains last."));
  if (fixture.expected.routeShouldImprove) {
    const enteredMinutes = knownTotal(enteredLegs);
    const selectedMinutes = knownTotal(selectedLegs);
    const timeTradeoff = enteredMinutes !== null && selectedMinutes !== null ? Math.max(0, selectedMinutes - enteredMinutes) : Number.POSITIVE_INFINITY;
    findings.push(finding("route-improvement", "route-order",
      assessment.route.state === "recommendation" && selectedStopIds.join("|") !== enteredStopIds.join("|")
        && (selectedMinutes === null || enteredMinutes === null || selectedMinutes <= enteredMinutes
          || (timeTradeoff <= 60 && timeTradeoff / Math.max(1, enteredMinutes) <= 0.05)),
      "The selected recommendation removes the known avoidable reversal without a material transfer-time regression."));
  }
  if (fixture.expected.preserveEnteredOrder) findings.push(finding("protected-order", "constraints", selectedStopIds.join("|") === enteredStopIds.join("|"), "A fixed commitment holds the reviewed order."));
  findings.push(finding("night-total", "nights", nightAllocation.state !== "conflict" && sum(Object.values(allocations)) === fixture.days - 1, "Allocated nights exactly match the trip window."));
  findings.push(finding("positive-retained-stays", "nights", selectedStopIds.every((id) => allocations[id] > 0), "Every retained overnight stop receives at least one night."));
  const fixedProtected = fixture.stops.filter((item) => item.fixedNights !== undefined).every((item) => allocations[item.id] === item.fixedNights);
  findings.push(finding("fixed-nights", "constraints", fixedProtected, "Linked fixed nights remain unchanged."));
  const stopCalendarContinuous = trip.stops.every((stop, index) => index === 0 || trip.stops[index - 1].departureDate === stop.arrivalDate)
    && trip.stops[0]?.arrivalDate === startDate && trip.stops.at(-1)?.departureDate === endDate;
  findings.push(finding("stop-calendar", "dates", stopCalendarContinuous, "Stop stays form one continuous arrival/departure calendar."));
  const expectedPlanDates = Array.from({ length: fixture.days }, (_, index) => dateAt(startDate, index));
  findings.push(finding("itinerary-calendar", "dates",
    trip.planItems.length === fixture.days && trip.planItems.every((item, index) => item.dayNumber === index + 1 && item.date === expectedPlanDates[index]),
    "The itinerary covers each calendar day exactly once."));
  const prohibitedModes = new Set<EasyTTrip["legs"][number]["mode"]>(fixture.expected.prohibitedModes ?? []);
  findings.push(finding("transport-constraints", "transfers", trip.legs.every((leg) => !prohibitedModes.has(leg.mode)), "Canonical legs do not use a prohibited transport mode."));
  const visitIds = (fixture.visits ?? []).map((visit) => visit.id);
  findings.push(finding("visit-base-separation", "visit-base",
    visitIds.every((id) => !trip.stops.some((stop) => stop.id === id))
      && (fixture.visits ?? []).every((visit) => trip.stops.some((stop) => stop.id === visit.baseStopId))
      && visitIds.every((id) => brief.mustVisit.some((item) => item.id === id)),
    "Attractions remain canonical visit intent linked to an overnight base rather than inflating the stop list."));
  if (fixture.expected.healthMustNeedReview) findings.push(finding("truthful-health", "health", health.status !== "ready", "Known route uncertainty or compression remains visible in Trip Health."));
  if (assessment.route.state === "recommendation") findings.push(finding("accepted-route-health", "health", !health.issues.some((item) => item.status === "open" && item.rule === "route-backtracking"), "Trip Health evaluates the accepted reviewed order instead of the stale pre-acceptance assessment."));
  findings.push(finding("builder-source", "builder", build.canBuildTrip === fixture.expected.canBuild, `Builder outcome matches the expected ${fixture.expected.canBuild ? "buildable" : "blocked"} state.`));

  return {
    id: fixture.id, name: fixture.name, regions: fixture.regions, structures: fixture.structures, assessment: fixture.assessment,
    output: {
      enteredStopIds, selectedStopIds, routeState: assessment.route.state,
      enteredTransferMinutes: knownTotal(enteredLegs), selectedTransferMinutes: knownTotal(selectedLegs),
      modes: trip.legs.map((leg) => leg.mode), transferConfidence: selectedLegs.map((leg) => leg.confidence),
      nightState: nightAllocation.state, allocations: nightAllocation.allocations,
      validatorIssues: validation.issues.map((item) => item.code), healthStatus: health.status,
      healthRules: health.issues.filter((item) => item.status === "open").map((item) => item.rule),
      builderOutcome: build.outcome, canBuild: build.canBuildTrip, visitIds, canonicalStopIds: trip.stops.map((item) => item.id),
      calendar: trip.stops.map((item) => ({ id: item.id, arrivalDate: item.arrivalDate, departureDate: item.departureDate, nights: item.nights })),
    },
    findings, trip,
  };
}

function comparisons(baseResults: RouteQualityResult[], variantResults: RouteQualityResult[]): RouteQualityComparison[] {
  return ROUTE_QUALITY_VARIANTS.map((variant) => {
    const base = baseResults.find((item) => item.id === variant.baseFixtureId)!;
    const changed = variantResults.find((item) => item.id === variant.id)!;
    const observations: string[] = [];
    let pass = changed.findings.every((item) => item.status === "pass");
    if (variant.mutation === "duration") {
      const total = sum(Object.values(changed.output.allocations ?? {}));
      pass &&= total === routeQualityVariantFixture(variant).days - 1;
      observations.push(`${total} nights reconcile to the changed duration without changing ${changed.output.selectedStopIds.length} canonical stops.`);
    }
    if (variant.mutation === "pace") observations.push(`Allocation ${JSON.stringify(changed.output.allocations)} was recomputed deterministically for ${variant.pace} pace.`);
    if (variant.mutation === "transport") {
      const forbidsRoad = variant.constraints?.avoidDriving || variant.constraints?.excludedTransportModes?.includes("road");
      if (forbidsRoad) pass &&= !changed.output.modes.includes("road");
      observations.push(`Canonical modes: ${changed.output.modes.join(", ")}.`);
    }
    if (variant.mutation === "direction") {
      const fixture = routeQualityVariantFixture(variant);
      pass &&= changed.output.selectedStopIds[0] === fixture.constraints?.fixedStartStopId && changed.output.selectedStopIds.at(-1) === fixture.constraints?.fixedEndStopId;
      observations.push(`Direction is held by endpoints ${changed.output.selectedStopIds[0]} → ${changed.output.selectedStopIds.at(-1)}.`);
    }
    if (variant.mutation === "add-stop" || variant.mutation === "remove-stop") {
      const expected = routeQualityVariantFixture(variant).stops.map((item) => item.id);
      pass &&= expected.every((id) => changed.output.selectedStopIds.includes(id)) && changed.output.selectedStopIds.length === expected.length;
      observations.push(`Stop mutation retained exactly ${changed.output.selectedStopIds.join(", ")}.`);
    }
    if (variant.mutation === "add-attraction") {
      pass &&= base.output.selectedStopIds.join("|") === changed.output.selectedStopIds.join("|")
        && JSON.stringify(base.output.allocations) === JSON.stringify(changed.output.allocations);
      observations.push("Adding a linked attraction preserved route order and overnight allocation.");
    }
    return { id: variant.id, mutation: variant.mutation, baseFixtureId: variant.baseFixtureId, pass, observations };
  });
}

export function runRouteQualityGauntlet() {
  const results = ROUTE_QUALITY_FIXTURES.map(evaluateRouteQualityFixture);
  const variantResults = ROUTE_QUALITY_VARIANTS.map((variant) => evaluateRouteQualityFixture(routeQualityVariantFixture(variant)));
  const comparisonResults = comparisons(results, variantResults);
  const failedFindings = [...results, ...variantResults].flatMap((result) => result.findings.filter((item) => item.status === "fail").map((item) => ({ fixtureId: result.id, ...item })));
  return {
    version: "route-quality-gauntlet-v1" as const,
    fixtureCount: results.length,
    adversarialVariantCount: variantResults.length,
    results,
    variantResults,
    comparisons: comparisonResults,
    failedFindings,
    comparisonFailures: comparisonResults.filter((item) => !item.pass),
    measurements: {
      routeOrderFailures: failedFindings.filter((item) => item.layer === "route-order").length,
      nightsAllocationFailures: failedFindings.filter((item) => item.layer === "nights").length,
      transferQualityFailures: failedFindings.filter((item) => item.layer === "transfers").length,
      constraintViolations: failedFindings.filter((item) => item.layer === "constraints").length,
      dateCalendarFailures: failedFindings.filter((item) => item.layer === "dates").length,
      healthWarningFailures: failedFindings.filter((item) => item.layer === "health").length,
      builderFailures: failedFindings.filter((item) => item.layer === "builder").length,
      visitBaseFailures: failedFindings.filter((item) => item.layer === "visit-base").length,
      subjectiveButValidAlternatives: results.filter((item) => Boolean(item.assessment.reasonableAlternatives)).length,
      transportKnowledgeLimitations: results.filter((item) => Boolean(item.assessment.knowledgeBoundary)).length,
    },
  };
}

export function comparableRouteQualitySnapshot(summary: ReturnType<typeof runRouteQualityGauntlet>) {
  return {
    results: summary.results.map((item) => ({ id: item.id, output: item.output, failures: item.findings.filter((finding) => finding.status === "fail") })),
    variants: summary.variantResults.map((item) => ({ id: item.id, output: item.output, failures: item.findings.filter((finding) => finding.status === "fail") })),
    comparisons: summary.comparisons,
    measurements: summary.measurements,
  };
}
