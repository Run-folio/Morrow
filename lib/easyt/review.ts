import type { EasyTTrip, TripChange, TripRecommendation } from "./trip.ts";
import { findDestinationIntegrityIssues, type EstimatedLeg, type PlannerStop, type RoutePlanningConstraints } from "./planner.ts";
import { validateFinalPlan, type PlanLegEstimator, type PlanValidationIssueCode } from "./plan-validator.ts";
import type { PlaceIssue } from "./place-intelligence.ts";
import { legPlanningConfidenceFromMetadata } from "./planning-confidence.ts";
import { routeConstraintsFromStructuredTripBrief } from "./structured-trip-brief.ts";
import { transferDoorToDoorMinutes, transferImpactFromMetadata } from "./transfer-impact.ts";
import { deriveItineraryCoverage, deriveTripDateFacts, incomingLegForPlanItem, orderedTripPlanItems, transferSeverity } from "./trip-facts.ts";
import { isoDateKey, parseIsoDate } from "./trip-lifecycle.ts";

const recommendation = (
  trip: EasyTTrip,
  input: Omit<TripRecommendation, "id" | "status" | "checkedAt">,
  index: number,
): TripRecommendation => ({
  ...input,
  id: `${trip.id}-review-${index + 1}-${input.rule}`,
  status: "open",
  checkedAt: new Date().toISOString(),
});

function stablePlaceIssueToken(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function placeIssueMessage(issue: PlaceIssue) {
  const suppliedMessage = "message" in issue && typeof issue.message === "string" ? issue.message.trim() : "";
  const suppliedReason = "reason" in issue && typeof issue.reason === "string" ? issue.reason.trim() : "";
  if (suppliedMessage || suppliedReason) return suppliedMessage || suppliedReason;
  const place = issue.sourceText.trim() ? `“${issue.sourceText.trim()}”` : "this place";
  if (issue.code === "ambiguous_place") return `Confirm which place ${place} refers to before relying on the route.`;
  if (issue.code === "unresolved_place") return `Confirm ${place} before relying on the route.`;
  if (issue.code === "region_requires_base") return `Choose a practical base for ${place} before relying on the route.`;
  if (issue.code === "missing_routable_destination") return "Add at least one routable destination before relying on the route.";
  return `Review ${place} before relying on the route.`;
}

function placeIssueSeverity(issue: PlaceIssue): TripRecommendation["severity"] {
  if (issue.severity === "info") return "info";
  if (issue.severity === "error") return issue.blocksRoute ? "critical" : "warning";
  return "warning";
}

function placeIssueEvidence(issue: PlaceIssue) {
  const place = issue.sourceText.trim() ? `“${issue.sourceText.trim()}”` : "This place mention";
  const issueKind = issue.code.replaceAll("_", " ");
  const routeImpact = issue.blocksRoute
    ? "Resolve it before relying on the current route."
    : "The original place intent remains saved in the trip brief.";
  const optionCount = issue.options?.length ?? 0;
  const options = optionCount
    ? ` ${optionCount} deterministic option${optionCount === 1 ? " is" : "s are"} available for confirmation.`
    : "";
  return `${place} is retained as ${issueKind}. ${routeImpact}${options}`;
}

/**
 * Conservative, explainable checks for the saved-trip review surface.
 * These are planning signals, not live timetable, visa, or booking claims.
 */
export function reviewTrip(trip: EasyTTrip): TripRecommendation[] {
  const results: TripRecommendation[] = [];
  const orderedStops = [...trip.stops].sort((left, right) => left.order - right.order);
  const plannerStops = orderedStops.map((stop): PlannerStop => ({
    id: stop.id,
    name: stop.name,
    country: stop.country,
    canonicalPlaceId: stop.canonicalPlaceId,
    countryCode: stop.countryCode,
    region: stop.region,
    providerId: stop.providerId,
    coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] : undefined,
  }));
  const plannerStopById = new Map(plannerStops.map((stop) => [stop.id, stop]));
  let validationConstraints: RoutePlanningConstraints = {};
  const persistedLegEstimator: PlanLegEstimator = (from, to) => {
    const fromStopId = "id" in from ? from.id : undefined;
    const persisted = fromStopId ? trip.legs.find((leg) => leg.fromStopId === fromStopId && leg.toStopId === to.id) : undefined;
    if (!persisted || persisted.mode === "walk") return {
      mode: "unknown",
      distanceKm: null,
      durationMinutes: null,
      label: `${from.name} → ${to.name}`,
      note: "No persisted transport fact is available for this connection.",
      confidence: "unconfirmed",
    };
    const supportedMode: EstimatedLeg["mode"] = persisted.mode;
    const savedConfidence = persisted.routeMetadata.routingConfidence;
    const confidence: EstimatedLeg["confidence"] = savedConfidence === "high" || savedConfidence === "medium" || savedConfidence === "unconfirmed"
      ? savedConfidence
      : persisted.mode === "unknown" || persisted.durationMinutes === null
        ? "unconfirmed"
        : "medium";
    return {
      mode: supportedMode,
      distanceKm: persisted.distanceKm,
      durationMinutes: persisted.durationMinutes,
      label: `${from.name} → ${to.name}`,
      note: persisted.provider ?? "Saved planning estimate.",
      confidence,
      transferImpact: transferImpactFromMetadata(persisted.routeMetadata.transferImpact),
      planningConfidence: legPlanningConfidenceFromMetadata(persisted.routeMetadata.planningConfidence),
    };
  };
  const intent = trip.brief.intent;
  const structuredConstraints: RoutePlanningConstraints = trip.brief.structuredBrief
    ? routeConstraintsFromStructuredTripBrief(trip.brief.structuredBrief)
    : {};
  const requiredStopIds = structuredConstraints.requiredStopIds?.length
    ? structuredConstraints.requiredStopIds
    : intent?.hardConstraints.mustSeeStopIds ?? [];
  const optionalStopIds = intent?.hardConstraints.optionalStopIds ?? [];
  const planningFixedCommitments = structuredConstraints.fixedCommitments?.length
    ? structuredConstraints.fixedCommitments
    : intent?.hardConstraints.fixedCommitments ?? [];
  const avoidDriving = structuredConstraints.avoidDriving ?? intent?.hardConstraints.avoidDriving ?? false;
  validationConstraints = {
    ...structuredConstraints,
    requiredStopIds,
    optionalStopIds,
    avoidDriving,
    excludedTransportModes: avoidDriving ? ["road"] : structuredConstraints.excludedTransportModes,
    fixedCommitments: planningFixedCommitments,
  };
  const dateFacts = deriveTripDateFacts(trip);
  const coverage = deriveItineraryCoverage(trip);
  const dateNights = dateFacts.durationDays === null ? 0 : Math.max(0, dateFacts.durationDays - 1);
  const finalValidation = validateFinalPlan({
    plan: {
      version: 1,
      origin: { name: trip.brief.origin, coordinates: trip.brief.originCoordinates },
      stops: orderedStops.map((stop) => ({
        ...(plannerStopById.get(stop.id) as PlannerStop),
        nights: Math.max(0, stop.nights ?? 0),
        arrivalDate: stop.arrivalDate,
        departureDate: stop.departureDate,
        required: requiredStopIds.includes(stop.id),
        optional: optionalStopIds.includes(stop.id),
      })),
      totalNights: dateNights,
      pace: intent?.preferences.pace ?? (trip.brief.pace === "slow" ? "relaxed" : "packed"),
      startDate: trip.startDate,
      endDate: trip.endDate,
      constraints: validationConstraints,
      scheduleLocks: trip.brief.scheduleLocks,
    },
    estimateLeg: persistedLegEstimator,
  });
  const surfacedCriticCodes = new Set<PlanValidationIssueCode>([
    "hard-constraint-violation",
    "required-stop-missing",
    "fixed-start-broken",
    "fixed-end-broken",
    "total-nights-mismatch",
    "duplicate-stop",
    "transport-restriction-conflict",
  ]);
  const hasUnknownNights = trip.stops.some((stop) => stop.nights === null);
  const surfacedCriticIssues = dateFacts.state === "valid"
    ? finalValidation.issues.filter((item) => surfacedCriticCodes.has(item.code) && !(hasUnknownNights && item.code === "total-nights-mismatch"))
    : [];
  if (dateFacts.state !== "valid") {
    results.push(recommendation(trip, {
      rule: "trip-dates",
      severity: "critical",
      message: dateFacts.state === "invalid" ? "Review the trip dates before relying on this plan." : "Add valid trip dates before relying on this plan.",
      evidence: dateFacts.state === "invalid" ? "The saved dates are malformed or reversed." : "A complete start and end date is not saved.",
      affectedDays: [],
      confidence: "high",
      proposedChange: null,
    }, results.length));
  }
  if (hasUnknownNights) {
    results.push(recommendation(trip, {
      rule: "stay-duration-confidence",
      severity: "info",
      message: "At least one stop still needs a confirmed number of nights.",
      evidence: "Missing stay duration remains unknown and is not treated as a zero-night stop.",
      affectedDays: trip.planItems.filter((item) => trip.stops.some((stop) => stop.id === item.stopId && stop.nights === null)).map((item) => item.dayNumber),
      confidence: "high",
      proposedChange: null,
    }, results.length));
  }
  const nightAllocation = trip.brief.nightAllocation;
  if (nightAllocation && nightAllocation.state !== "allocated") {
    const firstConflict = nightAllocation.conflicts[0];
    const affectedStopIds = new Set(nightAllocation.conflicts.flatMap((conflict) => conflict.stopIds));
    results.push(recommendation(trip, {
      rule: "night-allocation-compromise",
      severity: nightAllocation.state === "conflict" ? "critical" : "warning",
      message: nightAllocation.state === "conflict"
        ? "The fixed stays cannot be reconciled with the trip's available nights."
        : "The trip fits exactly, but at least one destination minimum is compromised.",
      evidence: firstConflict?.message ?? "Review the structured night-allocation conflicts before booking accommodation.",
      affectedDays: trip.planItems.filter((item) => affectedStopIds.has(item.stopId)).map((item) => item.dayNumber),
      confidence: "high",
      proposedChange: null,
    }, results.length));
  }
  const realisticMinutes = (leg: EasyTTrip["legs"][number]) => transferDoorToDoorMinutes(
    transferImpactFromMetadata(leg.routeMetadata.transferImpact),
    leg.durationMinutes,
  );
  const destinationIntegrityIssues = findDestinationIntegrityIssues(trip.stops.map((stop) => ({
    id: stop.id,
    country: stop.country,
    canonicalPlaceId: stop.canonicalPlaceId,
    coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] as [number, number] : undefined,
  })));
  destinationIntegrityIssues.forEach((issue) => {
    const stop = trip.stops.find((item) => item.id === issue.stopId);
    const neighbour = trip.stops.find((item) => item.id === issue.neighbouringStopId);
    results.push(recommendation(trip, {
      rule: "destination-identity",
      severity: "critical",
      message: `Check ${stop?.name ?? "this destination"} before trusting the route.`,
      evidence: issue.reason === "canonical-mismatch"
        ? `${stop?.name ?? "This stop"} has saved country or coordinate facts that contradict its canonical place identity. Confirm the intended place before using travel estimates.`
        : `${stop?.name ?? "This stop"} and ${neighbour?.name ?? "the previous stop"} are both set in ${issue.country}, but their saved coordinates are ${issue.distanceKm.toLocaleString()} km apart. Confirm the intended place before using travel estimates.`,
      affectedDays: trip.planItems.filter((item) => item.stopId === issue.stopId).map((item) => item.dayNumber),
      confidence: "medium",
      proposedChange: null,
    }, results.length));
  });
  const dayStopSequence = [...trip.planItems]
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .reduce<string[]>((sequence, item) => sequence.at(-1) === item.stopId ? sequence : [...sequence, item.stopId], []);
  const returnedStopId = dayStopSequence.find((stopId, index) => dayStopSequence.indexOf(stopId) !== index);
  if (returnedStopId) {
    const stop = trip.stops.find((item) => item.id === returnedStopId);
    results.push(recommendation(trip, {
      rule: "split-base-sequence",
      severity: "warning",
      message: `${stop?.name ?? "One base"} appears in separate parts of the itinerary, which creates an extra return transfer.`,
      evidence: "The day order now leaves this base and comes back to it later. Keep that return intentionally or regroup the route.",
      affectedDays: trip.planItems.filter((item) => item.stopId === returnedStopId).map((item) => item.dayNumber),
      confidence: "high",
      proposedChange: null,
    }, results.length));
  }
  const longLeg = trip.legs
    .map((leg) => ({ leg, minutes: realisticMinutes(leg) ?? 0 }))
    .filter(({ leg, minutes }) => leg.mode === "road" && minutes >= 300)
    .sort((a, b) => b.minutes - a.minutes)[0];

  if (longLeg) {
    const affectedDays = trip.planItems
      .filter((item) => item.type === "arrival" || item.type === "transport")
      .filter((item) => item.stopId === longLeg.leg.toStopId)
      .map((item) => item.dayNumber);
    results.push(recommendation(trip, {
      rule: "driving-load",
      severity: transferSeverity(longLeg.minutes) === "critical" ? "critical" : "warning",
      message: `${Math.floor(longLeg.minutes / 60)}h ${longLeg.minutes % 60}m of estimated road travel may dominate this transfer day.`,
      evidence: `${longLeg.leg.provider ?? "Planning estimate"}; ${longLeg.leg.distanceKm ? `${longLeg.leg.distanceKm.toLocaleString()} km` : "distance not confirmed"}.`,
      affectedDays,
      confidence: "high",
      proposedChange: { action: "add-stopover-or-compare-rail", legId: longLeg.leg.id },
    }, results.length));
  }

  const dayDominatingLeg = trip.legs
    .map((leg) => ({ leg, minutes: realisticMinutes(leg) }))
    .filter((item): item is { leg: EasyTTrip["legs"][number]; minutes: number } => item.minutes !== null && item.minutes >= 300)
    .sort((left, right) => right.minutes - left.minutes)[0];
  if (dayDominatingLeg) {
    const destination = trip.stops.find((stop) => stop.id === dayDominatingLeg.leg.toStopId)?.name ?? "the next stop";
    results.push(recommendation(trip, {
      rule: "travel-day-impact",
      severity: transferSeverity(dayDominatingLeg.minutes) === "critical" ? "critical" : "warning",
      message: `The transfer into ${destination} consumes ${transferSeverity(dayDominatingLeg.minutes) === "critical" ? "a full travel day or more" : "most of the travel day"}.`,
      evidence: `${Math.floor(dayDominatingLeg.minutes / 60)}h ${dayDominatingLeg.minutes % 60}m realistic door-to-door planning impact; verify the actual service and access time before booking.`,
      affectedDays: trip.planItems.filter((item) => item.stopId === dayDominatingLeg.leg.toStopId).map((item) => item.dayNumber),
      confidence: "medium",
      proposedChange: null,
    }, results.length));
  }

  const oneNightStops = trip.stops.filter((stop) => stop.nights === 1);
  if (oneNightStops.length >= 3 || (trip.brief.pace === "slow" && oneNightStops.length >= 2)) {
    results.push(recommendation(trip, {
      rule: "trip-pace",
      severity: oneNightStops.length >= 4 ? "warning" : "info",
      message: `${oneNightStops.length} stops are currently one-night stays, which leaves little recovery time between transfers.`,
      evidence: oneNightStops.map((stop) => stop.name).join(", "),
      affectedDays: trip.planItems.filter((item) => oneNightStops.some((stop) => stop.id === item.stopId)).map((item) => item.dayNumber),
      confidence: "high",
      proposedChange: { action: "suggest-extra-night", stopIds: oneNightStops.map((stop) => stop.id) },
    }, results.length));
  }

  const unestimatedLeg = trip.legs.find((leg) => leg.durationMinutes === null || leg.distanceKm === null);
  if (unestimatedLeg) {
    results.push(recommendation(trip, {
      rule: "missing-logistics",
      severity: "info",
      message: "At least one connection still needs a confirmed route estimate before the plan is travel-ready.",
      evidence: unestimatedLeg.provider ?? "No distance or duration is stored for this leg.",
      affectedDays: trip.planItems.filter((item) => item.stopId === unestimatedLeg.toStopId).map((item) => item.dayNumber),
      confidence: "high",
      proposedChange: { action: "resolve-leg", legId: unestimatedLeg.id },
    }, results.length));
  }

  const orderedDays = orderedTripPlanItems(trip);
  const missingTransition = orderedDays.find((day, index) => {
    const previous = orderedDays[index - 1];
    return previous && previous.stopId !== day.stopId && !incomingLegForPlanItem(trip, day);
  });
  if (missingTransition) {
    const destination = trip.stops.find((stop) => stop.id === missingTransition.stopId)?.name ?? "the next stop";
    results.push(recommendation(trip, {
      rule: "connection-confidence",
      severity: "info",
      message: `The connection into ${destination} still needs a saved transport leg before Morrovia can judge the day realistically.`,
      evidence: "No persisted mode, distance, or duration is available for this itinerary transition.",
      affectedDays: [missingTransition.dayNumber],
      confidence: "high",
      proposedChange: null,
    }, results.length));
  }

  const unknownLeg = trip.legs.find((leg) => leg.mode === "unknown");
  if (unknownLeg) {
    const destination = trip.stops.find((stop) => stop.id === unknownLeg.toStopId)?.name ?? "the next stop";
    results.push(recommendation(trip, {
      rule: "connection-confidence",
      severity: "info",
      message: `The connection into ${destination} still needs a travel mode before Morrovia can judge the day realistically.`,
      evidence: "No rail, road, ferry or flight mode has been confirmed for this leg.",
      affectedDays: trip.planItems.filter((item) => item.stopId === unknownLeg.toStopId).map((item) => item.dayNumber),
      confidence: "high",
      proposedChange: { action: "resolve-leg", legId: unknownLeg.id },
    }, results.length));
  }

  const transportDays = new Set(trip.planItems.filter((item) => item.type === "transport" || item.type === "arrival").map((item) => item.dayNumber));
  const consecutiveTransfers = [...transportDays].some((day) => transportDays.has(day + 1));
  if (consecutiveTransfers) {
    results.push(recommendation(trip, {
      rule: "recovery-time",
      severity: trip.brief.pace === "slow" ? "warning" : "info",
      message: "Two travel-heavy days sit back to back, leaving little room to arrive, recover and explore.",
      evidence: "Morrovia found consecutive arrival or transport days in the current plan.",
      affectedDays: [...transportDays].sort((a, b) => a - b),
      confidence: "medium",
      proposedChange: { action: "suggest-extra-night", stopIds: trip.stops.filter((stop) => stop.nights === 1).map((stop) => stop.id) },
    }, results.length));
  }

  const plannedDays = coverage.plannedDays;
  const totalDays = coverage.expectedDays;
  if (totalDays !== null && plannedDays < totalDays) {
    results.push(recommendation(trip, {
      rule: "plan-coverage",
      severity: "warning",
      message: `${totalDays - plannedDays} day${totalDays - plannedDays === 1 ? " is" : "s are"} not represented in the day-by-day plan.`,
      evidence: `${plannedDays} planned day${plannedDays === 1 ? "" : "s"} across a ${totalDays}-day trip.`,
      affectedDays: [],
      confidence: "high",
      proposedChange: { action: "add-open-days", count: totalDays - plannedDays },
    }, results.length));
  }

  const openDays = trip.planItems.filter((item) => item.type === "open").length;
  if (trip.brief.pace === "slow" && totalDays !== null && totalDays >= 5 && openDays === 0) {
    results.push(recommendation(trip, {
      rule: "flex-space",
      severity: "info",
      message: "This slow-paced trip has no deliberately open day or half-day to absorb weather, delays or a place worth lingering in.",
      evidence: `${totalDays} scheduled days and no open planning day currently recorded.`,
      affectedDays: [],
      confidence: "medium",
      proposedChange: { action: "add-open-days", count: 1 },
    }, results.length));
  }

  if (totalDays !== null && trip.stops.length >= 3 && totalDays < trip.stops.length * 2) {
    results.push(recommendation(trip, {
      rule: "stop-density",
      severity: totalDays < trip.stops.length ? "critical" : "warning",
      message: `${trip.stops.length} stops in ${totalDays} days leaves very little usable time at each base.`,
      evidence: "This counts the arrival and transfer time that each additional base creates.",
      affectedDays: trip.planItems.map((item) => item.dayNumber),
      confidence: "high",
      proposedChange: null,
    }, results.length));
  }

  orderedTripPlanItems(trip).forEach((day) => {
    const inbound = incomingLegForPlanItem(trip, day);
    if (!inbound) return;
    const stop = trip.stops.find((item) => item.id === day.stopId);
    if (!stop) return;
    const minutes = inbound ? realisticMinutes(inbound) ?? 0 : 0;
    if (stop.nights !== null && stop.nights <= 1 && minutes >= 240) {
      results.push(recommendation(trip, {
        rule: "short-stop-heavy-transfer",
        severity: transferSeverity(minutes) === "critical" ? "critical" : "warning",
        message: `${stop.name} has ${stop.nights === 0 ? "no overnight" : "one night"} after a ${Math.floor(minutes / 60)}h transfer.`,
        evidence: "The transfer uses a large share of the time this stop is meant to provide.",
        affectedDays: [day.dayNumber],
        confidence: "high",
        proposedChange: { action: "suggest-extra-night", stopIds: [stop.id] },
      }, results.length));
    }
    if (stop.nights !== null && minutes >= Math.max(360, (stop.nights + 1) * 300)) {
      results.push(recommendation(trip, {
        rule: "transit-to-time-ratio",
        severity: "warning",
        message: `The transfer into ${stop.name} is large relative to the time planned there.`,
        evidence: `${Math.floor(minutes / 60)}h ${minutes % 60}m estimated transit for ${Math.max(0, stop.nights)} planned nights.`,
        affectedDays: [day.dayNumber],
        confidence: "high",
        proposedChange: { action: "suggest-extra-night", stopIds: [stop.id] },
      }, results.length));
    }
  });

  const outOfRangeCommitments = dateFacts.state === "valid" && dateFacts.start && dateFacts.end
    ? planningFixedCommitments.filter((item) => {
      const commitment = parseIsoDate(item.date);
      return commitment ? commitment < dateFacts.start! || commitment > dateFacts.end! : Boolean(item.date);
    })
    : [];
  if (outOfRangeCommitments.length) {
    results.push(recommendation(trip, {
      rule: "fixed-date-conflict",
      severity: "critical",
      message: `${outOfRangeCommitments.map((item) => item.label).join(", ")} falls outside the current trip dates.`,
      evidence: `Trip dates are ${trip.startDate} to ${trip.endDate}.`,
      affectedDays: [],
      confidence: "high",
      proposedChange: null,
    }, results.length));
  }

  for (const conflict of trip.brief.cascadeStatus?.conflicts ?? []) {
    results.push(recommendation(trip, {
      rule: "schedule-lock-conflict",
      severity: "critical",
      message: conflict,
      evidence: "A protected arrival date conflicts with the connected route schedule.",
      affectedDays: [],
      confidence: "high",
      proposedChange: null,
    }, results.length));
  }

  const route = trip.brief.routeAssessment?.route;
  if (route?.state === "recommendation" && (route.improvementMinutes ?? 0) >= 90) {
    results.push(recommendation(trip, {
      rule: "route-backtracking",
      severity: "warning",
      message: "This stop order has avoidable backtracking.",
      evidence: route.reasons.join(" ") || route.summary,
      affectedDays: trip.planItems.map((item) => item.dayNumber),
      confidence: "high",
      proposedChange: null,
    }, results.length));
  }

  const finalStop = [...trip.stops].sort((a, b) => a.order - b.order).at(-1);
  const expectedDeparture = dateFacts.end ? new Date(dateFacts.end) : null;
  expectedDeparture?.setDate(expectedDeparture.getDate() + 1);
  const expectedDepartureKey = expectedDeparture ? isoDateKey(expectedDeparture) : "";
  if (dateFacts.state === "valid" && finalStop?.departureDate && parseIsoDate(finalStop.departureDate) && finalStop.departureDate !== expectedDepartureKey) {
    results.push(recommendation(trip, {
      rule: "trip-end-mismatch",
      severity: finalStop.departureDate > expectedDepartureKey ? "critical" : "warning",
      message: `The final stop ends on ${finalStop.departureDate}, not at the end of the trip.`,
      evidence: `Trip end is ${trip.endDate}; check the final stay and departure plan.`,
      affectedDays: trip.planItems.filter((item) => item.stopId === finalStop.id).map((item) => item.dayNumber),
      confidence: "high",
      proposedChange: null,
    }, results.length));
  }

  const unconfirmedMajorLeg = trip.legs.find((leg) => (leg.distanceKm ?? 0) >= 150 && Boolean(leg.routeMetadata?.planningEstimate) && !leg.routeMetadata?.decisionOption);
  if (unconfirmedMajorLeg) {
    const destination = trip.stops.find((stop) => stop.id === unconfirmedMajorLeg.toStopId)?.name ?? "the next stop";
    results.push(recommendation(trip, {
      rule: "missing-transport-decision",
      severity: "warning",
      message: `Choose how you will travel into ${destination} before booking the rest of the trip.`,
      evidence: "Morrovia has a planning estimate, not a confirmed transport decision or live timetable.",
      affectedDays: trip.planItems.filter((item) => item.stopId === unconfirmedMajorLeg.toStopId).map((item) => item.dayNumber),
      confidence: "high",
      proposedChange: { action: "resolve-leg", legId: unconfirmedMajorLeg.id },
    }, results.length));
  }

  surfacedCriticIssues.forEach((item) => {
    results.push(recommendation(trip, {
      rule: `post-generation-${item.code}`,
      severity: item.severity === "error" ? "critical" : "warning",
      message: item.message,
      evidence: `Independent final-plan validation (${finalValidation.configVersion}); ${item.repairability === "automatic" ? "a bounded targeted repair is supported" : "manual resolution is required"}.`,
      affectedDays: trip.planItems.filter((planItem) => item.stopIds.includes(planItem.stopId)).map((planItem) => planItem.dayNumber),
      confidence: "high",
      proposedChange: null,
    }, results.length));
  });
  [...(trip.brief.structuredBrief?.placeIssues ?? [])]
    .sort((left, right) => {
      const leftKey = `${left.code}:${left.mentionId}`;
      const rightKey = `${right.code}:${right.mentionId}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    })
    .forEach((issue) => {
      const canonicalPlaceId = issue.canonicalPlaceId;
      const affectedStopIds = canonicalPlaceId
        ? new Set(trip.stops.filter((stop) => stop.id === canonicalPlaceId || stop.canonicalPlaceId === canonicalPlaceId || stop.providerId === canonicalPlaceId).map((stop) => stop.id))
        : new Set<string>();
      const codeToken = stablePlaceIssueToken(issue.code) || "place-issue";
      const mentionToken = stablePlaceIssueToken(issue.mentionId) || "mention";
      results.push(recommendation(trip, {
        rule: `place-intelligence-${codeToken}-${mentionToken}`,
        severity: placeIssueSeverity(issue),
        message: placeIssueMessage(issue),
        evidence: placeIssueEvidence(issue),
        affectedDays: trip.planItems.filter((item) => affectedStopIds.has(item.stopId)).map((item) => item.dayNumber),
        confidence: issue.confidence.level === "high" ? "high" : "medium",
        proposedChange: null,
      }, results.length));
    });
  return results;
}

export type TripHealth = {
  issues: TripRecommendation[];
  openIssueCount: number;
  blockingCount: number;
  cautionCount: number;
  status: "blocked" | "needs-review" | "ready";
  isReady: boolean;
};

export function tripHealth(trip: EasyTTrip): TripHealth {
  const current = reviewTrip(trip).map((item) => ({ ...item, status: trip.recommendations.find((saved) => saved.id === item.id)?.status ?? item.status }));
  const openIssues = current.filter((item) => item.status === "open");
  const blockingCount = openIssues.filter((item) => item.severity === "critical").length;
  const cautionCount = openIssues.filter((item) => item.severity === "warning").length;
  const hasUnresolvedTransport = openIssues.some((item) => item.rule === "destination-identity" || item.rule === "missing-transport-decision" || item.rule === "missing-logistics" || item.rule === "connection-confidence");
  const hasUnknownStayDuration = openIssues.some((item) => item.rule === "stay-duration-confidence");
  const hasUnresolvedPlaceIntent = (trip.brief.structuredBrief?.placeIssues ?? []).some((issue) => issue.blocksRoute);
  const hasCompleteItinerary = deriveItineraryCoverage(trip).state === "complete";
  const hasValidDates = deriveTripDateFacts(trip).state === "valid";
  const isReady = blockingCount === 0 && !hasUnresolvedTransport && !hasUnknownStayDuration && !hasUnresolvedPlaceIntent && hasCompleteItinerary && hasValidDates;
  const status = blockingCount ? "blocked" : !isReady || openIssues.length ? "needs-review" : "ready";
  return { issues: current, openIssueCount: openIssues.length, blockingCount, cautionCount, status, isReady };
}

export function tripHealthSummary(trip: EasyTTrip) {
  const health = tripHealth(trip);
  return {
    health,
    issueCount: health.openIssueCount,
    status: health.status,
    headline: health.openIssueCount
      ? `${health.openIssueCount} ${health.openIssueCount === 1 ? "thing" : "things"} to review`
      : "Trip looks good",
    detail: health.blockingCount
      ? "Resolve the blocking issue first"
      : health.openIssueCount
        ? "Start with the highest-priority checks"
        : "No critical route issues found",
  };
}

export function recommendationImpact(item: TripRecommendation) {
  const action = item.proposedChange?.action;
  if (item.rule.startsWith("place-intelligence-")) return "Keeps the original place intent visible until it is resolved; no route stop is added or changed automatically.";
  if (action === "add-open-days") return "Adds open planning days so the day-by-day plan covers the full trip.";
  if (action === "suggest-extra-night") return "Flags the affected stops for an extra night; no bookings are changed automatically.";
  if (action === "add-stopover-or-compare-rail") return "Marks the transfer for a stopover or rail comparison; the route remains unchanged until you choose one.";
  if (action === "resolve-leg") return "Keeps the route in place while recording that this connection needs a confirmed estimate.";
  if (item.rule === "stop-density") return "Remove an optional stop, add days, or accept a faster-paced route before booking.";
  if (item.rule === "fixed-date-conflict") return "Change the trip dates or move the fixed commitment into the travel window.";
  if (item.rule === "schedule-lock-conflict") return "Move the locked arrival, change the surrounding nights, or keep the gap intentionally.";
  if (item.rule === "route-backtracking") return "Reorder the route in the builder if the suggested sequence still suits your must-see stops.";
  if (item.rule === "trip-end-mismatch") return "Adjust the final stay or the overall trip end so your departure day is explicit.";
  return "Records your decision without changing booked items.";
}

export function applyRecommendation(trip: EasyTTrip, recommendationId: string): EasyTTrip {
  const recommendation = trip.recommendations.find((item) => item.id === recommendationId) ?? reviewTrip(trip).find((item) => item.id === recommendationId);
  if (!recommendation) return trip;
  let nextItems = trip.planItems;
  let summary = recommendationImpact(recommendation);
  if (recommendation.proposedChange?.action === "add-open-days") {
    const count = Number(recommendation.proposedChange.count) || 0;
    const lastDay = trip.planItems.reduce((max, item) => Math.max(max, item.dayNumber), 0);
    const stopId = trip.stops[trip.stops.length - 1]?.id ?? "unassigned";
    const additions = Array.from({ length: count }, (_, index) => {
      const dayNumber = lastDay + index + 1;
      const date = new Date(`${trip.startDate}T00:00:00`);
      date.setDate(date.getDate() + dayNumber - 1);
      return { id: `${trip.id}-review-open-${dayNumber}`, stopId, dayNumber, date: date.toISOString().slice(0, 10), type: "open" as const, title: "Open planning day", reason: "Added by Plan Review to cover the full trip without inventing bookings.", notes: ["Keep this day flexible until the route is confirmed."], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null };
    });
    nextItems = [...trip.planItems, ...additions];
    summary = `Added ${count} open planning day${count === 1 ? "" : "s"}.`;
  }
  const change: TripChange = { id: `${recommendation.id}-${Date.now()}`, recommendationId: recommendation.id, action: "apply", summary, changedAt: new Date().toISOString() };
  const recommendations = trip.recommendations.some((item) => item.id === recommendation.id)
    ? trip.recommendations.map((item) => item.id === recommendation.id ? { ...item, status: "applied" as const } : item)
    : [...trip.recommendations, { ...recommendation, status: "applied" as const }];
  return { ...trip, planItems: nextItems, recommendations, changeHistory: [...(trip.changeHistory ?? []), change], updatedAt: new Date().toISOString() };
}

export function undoRecommendation(trip: EasyTTrip, recommendationId: string): EasyTTrip {
  const recommendation = trip.recommendations.find((item) => item.id === recommendationId);
  if (!recommendation) return trip;
  const planItems = recommendation.proposedChange?.action === "add-open-days" ? trip.planItems.filter((item) => !item.id.startsWith(`${trip.id}-review-open-`)) : trip.planItems;
  const change: TripChange = { id: `${recommendationId}-${Date.now()}`, recommendationId, action: "undo", summary: "Reopened this recommendation; no booked items were changed.", changedAt: new Date().toISOString() };
  return { ...trip, planItems, recommendations: trip.recommendations.map((item) => item.id === recommendationId ? { ...item, status: "open" } : item), changeHistory: [...(trip.changeHistory ?? []), change], updatedAt: new Date().toISOString() };
}
