import type { NightAllocationResult } from "./night-allocation.ts";
import type { PlaceIssue } from "./place-intelligence.ts";
import type { RouteConstraintIssue } from "./route-candidates.ts";
import type { PlanValidationReport } from "./plan-validator.ts";
import { assessPlanRealism, type PlanRealismAssessment } from "./plan-realism.ts";
import type { TransferImpact } from "./transfer-impact.ts";
import type { EasyTTrip, JourneyEndSelection } from "./trip.ts";

export type BuildTripConflictCode =
  | "origin-required"
  | "origin-unverified"
  | "end-unverified"
  | "route-empty"
  | "route-input-invalid"
  | "place-review-required"
  | "hard-route-conflict"
  | "required-stops-exceed-maximum"
  | "invalid-dates"
  | "duration-conflict"
  | "structured-brief-conflict"
  | "night-allocation-conflict"
  | "night-total-mismatch"
  | "zero-night-stop"
  | "itinerary-empty"
  | "itinerary-stop-uncovered"
  | "itinerary-day-coverage"
  | "final-plan-invalid";

export type BuildTripConflict = {
  code: BuildTripConflictCode;
  stage: "places" | "time" | "itinerary";
  message: string;
  stopIds: string[];
  source: "builder" | "place-intelligence" | "route-intelligence" | "structured-brief" | "night-allocation" | "validator" | "itinerary";
};

export type CanBuildTripInput = {
  origin: string;
  originCoordinates?: [number, number];
  journeyEnd?: JourneyEndSelection;
  stops: Array<{ id: string; name: string; country?: string; coordinates?: [number, number] }>;
  placeReviewPending?: boolean;
  placeIssues?: Array<Pick<PlaceIssue, "message" | "blocksRoute" | "mentionId">>;
  routeConstraintIssues?: RouteConstraintIssue[];
  requiredStopIds?: string[];
  maximumStops?: number;
  startDate: string;
  endDate: string;
  durationDays: number;
  expectedDurationDays?: number;
  structuredBriefIssues?: Array<{ severity: "error" | "warning"; message: string }>;
  nightAllocation: NightAllocationResult;
  allocations: Record<string, number>;
  planValidation?: Pick<PlanValidationReport, "issues">;
  transferImpacts?: readonly (TransferImpact | undefined)[];
  routeOrderFixed?: boolean;
  transferDayKeys?: readonly string[];
  document: Pick<EasyTTrip, "stops" | "planItems" | "startDate" | "endDate">;
};

function exactDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function conflict(input: Omit<BuildTripConflict, "stopIds"> & { stopIds?: string[] }): BuildTripConflict {
  return { ...input, stopIds: input.stopIds ?? [] };
}

/**
 * The single release invariant for advancing into Time and for treating a
 * generated TripDocument as saveable/navigable. Callers may inspect `stage`
 * to gate progress without pretending the later itinerary already exists.
 */
export function canBuildTrip(input: CanBuildTripInput) {
  const conflicts: BuildTripConflict[] = [];
  const stopIds = input.stops.map((stop) => stop.id);
  const uniqueStopIds = new Set(stopIds);

  if (!input.origin.trim()) conflicts.push(conflict({ code: "origin-required", stage: "places", message: "Add the city or airport you are leaving from.", source: "builder" }));
  if (input.origin.trim() && (!input.originCoordinates || input.originCoordinates.some((value) => !Number.isFinite(value)))) {
    conflicts.push(conflict({ code: "origin-unverified", stage: "time", message: "Confirm the departure location before building the trip.", source: "builder" }));
  }
  if (input.journeyEnd?.mode === "explicit"
    && (!input.journeyEnd.place.coordinates || input.journeyEnd.place.coordinates.some((value) => !Number.isFinite(value)))) {
    conflicts.push(conflict({ code: "end-unverified", stage: "places", message: "Choose the ending place from the suggestions, or select Not sure yet.", source: "builder" }));
  }
  if (!input.stops.length) conflicts.push(conflict({ code: "route-empty", stage: "places", message: "Add at least one destination before building the trip.", source: "builder" }));
  if (uniqueStopIds.size !== stopIds.length || input.stops.some((stop) => !stop.id.trim() || !stop.name.trim() || !stop.country?.trim()
    || !stop.coordinates || stop.coordinates.some((value) => !Number.isFinite(value)))) {
    conflicts.push(conflict({ code: "route-input-invalid", stage: "places", message: "Confirm every route destination before continuing.", stopIds, source: "builder" }));
  }

  const blockingPlaceIssues = input.placeIssues?.filter((issue) => issue.blocksRoute) ?? [];
  if (input.placeReviewPending || blockingPlaceIssues.length) {
    conflicts.push(conflict({
      code: "place-review-required",
      stage: "places",
      message: input.placeReviewPending ? "Finish checking your places before continuing." : blockingPlaceIssues[0].message,
      source: "place-intelligence",
    }));
  }

  const routeIssue = input.routeConstraintIssues?.[0];
  if (routeIssue) conflicts.push(conflict({ code: routeIssue.code === "required-stops-exceed-maximum" ? "required-stops-exceed-maximum" : "hard-route-conflict", stage: "places", message: routeIssue.message, stopIds: routeIssue.stopIds, source: "route-intelligence" }));
  const required = [...new Set(input.requiredStopIds ?? [])];
  if (input.maximumStops !== undefined && required.length > input.maximumStops
    && !input.routeConstraintIssues?.some((issue) => issue.code === "required-stops-exceed-maximum")) {
    conflicts.push(conflict({
      code: "required-stops-exceed-maximum",
      stage: "places",
      message: `The ${required.length} required stops cannot fit within the maximum of ${input.maximumStops}.`,
      stopIds: required,
      source: "structured-brief",
    }));
  }

  const start = exactDate(input.startDate);
  const end = exactDate(input.endDate);
  const actualDuration = start && end ? Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1 : 0;
  if (!start || !end || end < start || input.durationDays < 1 || actualDuration !== input.durationDays
    || input.document.startDate !== input.startDate || input.document.endDate !== input.endDate) {
    conflicts.push(conflict({ code: "invalid-dates", stage: "time", message: "Choose a valid trip date range before building.", source: "builder" }));
  } else if (input.expectedDurationDays !== undefined && input.expectedDurationDays !== input.durationDays) {
    conflicts.push(conflict({ code: "duration-conflict", stage: "time", message: `The ${input.expectedDurationDays}-day brief does not match the ${input.durationDays}-day date range.`, source: "structured-brief" }));
  }
  const structuredError = input.structuredBriefIssues?.find((issue) => issue.severity === "error");
  if (structuredError) conflicts.push(conflict({ code: "structured-brief-conflict", stage: "time", message: structuredError.message, source: "structured-brief" }));

  if (input.nightAllocation.state === "conflict") {
    conflicts.push(conflict({ code: "night-allocation-conflict", stage: "time", message: input.nightAllocation.conflicts[0]?.message ?? "The trip nights contradict its fixed stays.", stopIds, source: "night-allocation" }));
  } else {
    const allocated = stopIds.reduce((total, stopId) => total + Math.max(0, Math.round(input.allocations[stopId] ?? 0)), 0);
    const totalNights = Math.max(0, input.durationDays - 1);
    if (allocated !== totalNights || input.nightAllocation.totalAllocatedNights !== totalNights) {
      conflicts.push(conflict({ code: "night-total-mismatch", stage: "time", message: `${allocated} allocated nights do not reconcile with the ${totalNights}-night trip.`, stopIds, source: "night-allocation" }));
    }
    const zeroNightStopIds = stopIds.filter((stopId) => Math.max(0, Math.round(input.allocations[stopId] ?? 0)) === 0);
    if (zeroNightStopIds.length) conflicts.push(conflict({ code: "zero-night-stop", stage: "time", message: "Every retained destination needs at least one night; remove a stop or add time.", stopIds: zeroNightStopIds, source: "night-allocation" }));
  }

  const finalPlanError = input.planValidation?.issues.find((item) => item.severity === "error");
  if (finalPlanError) conflicts.push(conflict({
    code: "final-plan-invalid",
    stage: "itinerary",
    message: finalPlanError.message,
    stopIds: finalPlanError.stopIds,
    source: "validator",
  }));

  if (!input.document.planItems.length) conflicts.push(conflict({ code: "itinerary-empty", stage: "itinerary", message: "The generated itinerary is empty.", stopIds, source: "itinerary" }));
  const documentStopIds = new Set(input.document.stops.map((stop) => stop.id));
  const coveredStopIds = new Set(input.document.planItems.map((item) => item.stopId));
  const invalidDocumentStops = input.document.stops.map((stop) => stop.id).filter((stopId) => !uniqueStopIds.has(stopId));
  const invalidPlanStops = input.document.planItems.map((item) => item.stopId).filter((stopId) => !uniqueStopIds.has(stopId));
  const uncovered = [...new Set([
    ...stopIds.filter((stopId) => !documentStopIds.has(stopId) || !coveredStopIds.has(stopId)),
    ...invalidDocumentStops,
    ...invalidPlanStops,
  ])];
  if (uncovered.length || input.document.stops.length !== input.stops.length) conflicts.push(conflict({ code: "itinerary-stop-uncovered", stage: "itinerary", message: "Every retained destination, and only a retained destination, must appear in the generated itinerary.", stopIds: uncovered, source: "itinerary" }));
  const dayNumbers = input.document.planItems.map((item) => item.dayNumber);
  const expectedDays = Array.from({ length: Math.max(0, input.durationDays) }, (_, index) => index + 1);
  const expectedDates = start ? expectedDays.map((_, index) => new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10)) : [];
  if (dayNumbers.length !== expectedDays.length || expectedDays.some((day) => !dayNumbers.includes(day))
    || input.document.planItems.some((item, index) => item.date !== expectedDates[index])) {
    conflicts.push(conflict({ code: "itinerary-day-coverage", stage: "itinerary", message: "The itinerary must cover every trip day exactly once.", stopIds, source: "itinerary" }));
  }

  const validationWarnings = input.planValidation?.issues.filter((item) => item.severity === "warning") ?? [];
  const realism: PlanRealismAssessment | null = input.planValidation
    ? assessPlanRealism({
        validation: input.planValidation,
        nightAllocation: input.nightAllocation,
        transferImpacts: input.transferImpacts,
        routeOrderFixed: input.routeOrderFixed,
        retainedStopIds: stopIds,
        retainedStopNights: stopIds.map((stopId) => input.allocations[stopId] ?? 0),
        transferDayKeys: input.transferDayKeys,
      })
    : null;
  const outcome = conflicts.length
    ? "impossible" as const
    : input.nightAllocation.state === "compromised"
      ? "constrained-compromise" as const
      : validationWarnings.length
        ? "valid-but-poor" as const
        : "valid" as const;
  return {
    canBuildTrip: conflicts.length === 0,
    canAdvanceToTime: !conflicts.some((item) => item.stage === "places"),
    conflicts,
    firstConflict: conflicts[0],
    qualityClassification: conflicts.length ? "impossible" as const : realism?.classification ?? (validationWarnings.length ? "reasonable with trade-offs" as const : "reasonable" as const),
    realismReasons: realism?.reasons ?? [],
    outcome,
    compromises: [
      ...(input.nightAllocation.state === "compromised" ? input.nightAllocation.conflicts.map((item) => item.message) : []),
      ...validationWarnings.map((item) => item.message),
    ],
  };
}
