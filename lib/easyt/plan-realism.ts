import type { NightAllocationResult } from "./night-allocation.ts";
import type { PlanValidationIssueCode, PlanValidationReport } from "./plan-validator.ts";
import type { TransferImpact } from "./transfer-impact.ts";

export type PlanRealismClassification =
  | "reasonable"
  | "reasonable with trade-offs"
  | "exhausting but feasible"
  | "unreasonable"
  | "impossible"
  | "unknown due to insufficient transport evidence";

export type PlanRealismAssessment = {
  classification: PlanRealismClassification;
  issueCodes: PlanValidationIssueCode[];
  reasons: string[];
};

export type AssessPlanRealismInput = {
  validation: Pick<PlanValidationReport, "issues">;
  nightAllocation?: NightAllocationResult;
  transferImpacts?: readonly (TransferImpact | undefined)[];
  /** True only when the traveller or a protected booking requires this order. */
  routeOrderFixed?: boolean;
  retainedStopNights?: readonly number[];
  retainedStopIds?: readonly string[];
  /** Stable itinerary-day keys; repeated keys expose multiple transfers on one usable day. */
  transferDayKeys?: readonly string[];
};

const unique = <T>(values: readonly T[]) => [...new Set(values)];

/**
 * Classify planner quality from the same authoritative facts used by scoring,
 * allocation and final validation. This does not make a poor plan valid and
 * does not infer schedules, modes, dates or prices that the evidence lacks.
 */
export function assessPlanRealism(input: AssessPlanRealismInput): PlanRealismAssessment {
  const issues = input.validation.issues;
  const issueCodes = unique(issues.map((issue) => issue.code));
  const reasons = unique(issues.map((issue) => issue.message));
  const zeroNightStops = input.retainedStopNights?.filter((nights) => nights <= 0).length ?? 0;

  if (issues.some((issue) => issue.severity === "error") || input.nightAllocation?.state === "conflict" || zeroNightStops) {
    return {
      classification: "impossible",
      issueCodes,
      reasons: unique([
        ...reasons,
        ...(zeroNightStops ? [`${zeroNightStops} retained stop${zeroNightStops === 1 ? " has" : "s have"} no overnight stay.`] : []),
      ]),
    };
  }

  const impacts = input.transferImpacts ?? [];
  const unknownImpacts = impacts.filter((impact) => impact?.doorToDoor.status === "unknown").length;
  const unsupportedOnly = issueCodes.length > 0 && issueCodes.every((code) => code === "unsupported-transfer");
  if ((unknownImpacts > 0 || issueCodes.includes("unsupported-transfer")) && (unsupportedOnly || issueCodes.length === 0)) {
    return {
      classification: "unknown due to insufficient transport evidence",
      issueCodes,
      reasons: reasons.length ? reasons : ["At least one consequential transfer lacks supported door-to-door evidence."],
    };
  }

  const fullDayTransfers = impacts.filter((impact) => impact?.usableDayLoss.classification === "full-day-or-more").length;
  const mostDayTransfers = impacts.filter((impact) => impact?.usableDayLoss.classification === "most-of-day").length;
  const extremePacing = issueCodes.includes("extreme-pacing");
  const minimumConflict = issueCodes.includes("minimum-stay-conflict");
  const oneNightAnchor = issueCodes.includes("one-night-anchor-after-large-transfer") || issues.some((issue) => {
    if (issue.code !== "below-minimum-stay" || issue.evidence.anchor !== true || issue.evidence.allocatedNights !== 1) return false;
    const stopIndex = input.retainedStopIds?.findIndex((stopId) => issue.stopIds.includes(stopId)) ?? -1;
    const arrival = stopIndex >= 0 ? impacts[stopIndex] : undefined;
    return arrival?.usableDayLoss.classification === "substantial"
      || arrival?.usableDayLoss.classification === "most-of-day"
      || arrival?.usableDayLoss.classification === "full-day-or-more";
  });
  const backtracking = issueCodes.includes("unnecessary-backtracking");
  const compromised = input.nightAllocation?.state === "compromised";
  const allocationCompromises = input.nightAllocation?.conflicts.filter((conflict) => conflict.severity === "warning") ?? [];
  const repeatedTransferDay = (input.transferDayKeys ?? []).some((key, index, all) => all.indexOf(key) !== index);

  if (oneNightAnchor || repeatedTransferDay || (extremePacing && (fullDayTransfers + mostDayTransfers > 0)) || fullDayTransfers >= 2) {
    return { classification: "unreasonable", issueCodes, reasons };
  }
  if (backtracking) {
    if (input.routeOrderFixed) return { classification: "reasonable with trade-offs", issueCodes, reasons };
    return { classification: "unreasonable", issueCodes, reasons };
  }
  if (extremePacing || minimumConflict || allocationCompromises.length >= 2 || fullDayTransfers > 0 || mostDayTransfers >= 2) {
    return { classification: "exhausting but feasible", issueCodes, reasons };
  }
  if (issues.length || compromised || mostDayTransfers > 0) {
    return { classification: "reasonable with trade-offs", issueCodes, reasons };
  }
  return { classification: "reasonable", issueCodes, reasons: [] };
}
