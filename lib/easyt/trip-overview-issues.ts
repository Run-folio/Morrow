import type { EasyTTrip, TripRecommendation } from "./trip.ts";
import { itineraryDayForRecommendation, itineraryWorkspaceHref, mapWorkspaceHref, transportWorkspaceHref, tripWorkspaceHref } from "./trip-workspace-links.ts";

export type OverviewIssue = {
  id: string;
  title: string;
  details: string[];
  severity: TripRecommendation["severity"];
  href: string;
  actionLabel: "Review timing" | "Review transfers";
  reviewLegIds: string[];
};

const materialRouteRules = new Set([
  "route-integrity", "trip-dates", "stay-duration-confidence", "night-allocation-compromise",
  "destination-identity", "split-base-sequence", "driving-load", "travel-day-impact", "trip-pace",
  "missing-logistics", "connection-confidence", "recovery-time", "stop-density", "short-stop-heavy-transfer",
  "transit-to-time-ratio", "fixed-date-conflict", "schedule-lock-conflict", "route-backtracking",
  "trip-end-mismatch", "missing-transport-decision",
]);

type LegIntegrityIssue = { legId: string | null; message: string };

function transportIssue(issue: TripRecommendation) {
  return ["missing-logistics", "connection-confidence", "missing-transport-decision", "driving-load"].includes(issue.rule)
    || /transfer|transport|connection/i.test(issue.message);
}

function issueLegIds(trip: EasyTTrip, issue: TripRecommendation, integrity: readonly LegIntegrityIssue[]) {
  const ids = issue.rule === "route-integrity"
    ? integrity.map((item) => item.legId)
    : [issue.proposedChange?.legId];
  const canonical = new Set(trip.legs.map((leg) => leg.id));
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && canonical.has(id)))];
}

function routeIssueHref(tripId: string) {
  return mapWorkspaceHref(tripId, null, "plan", null, null, null, tripWorkspaceHref(tripId));
}

function nonTransportIssue(trip: EasyTTrip, issue: TripRecommendation): OverviewIssue {
  const dayNumber = itineraryDayForRecommendation(trip, issue);
  return {
    id: issue.id,
    title: issue.message,
    details: [],
    severity: issue.severity,
    href: dayNumber ? itineraryWorkspaceHref(trip.id, dayNumber) : routeIssueHref(trip.id),
    actionLabel: "Review timing",
    reviewLegIds: [],
  };
}

/** Presentation only: canonical recommendations and TripLeg IDs remain the owners. */
export function presentOverviewIssues(
  trip: EasyTTrip,
  recommendations: readonly TripRecommendation[],
  integrity: readonly LegIntegrityIssue[],
): OverviewIssue[] {
  const issues = recommendations.filter((issue) => issue.status === "open"
    && (issue.severity === "critical" || materialRouteRules.has(issue.rule)));
  const transferIssues = issues.filter(transportIssue);
  const reviewLegIds = [...new Set(transferIssues.flatMap((issue) => issueLegIds(trip, issue, integrity)))];
  const transferTitle = transferIssues.find((issue) => issue.rule === "route-integrity") ?? transferIssues[0];
  const integrityLegIds = new Set(integrity.map((item) => item.legId).filter((id): id is string => Boolean(id)));
  const transferDetails = transferIssues.filter((issue) => {
    if (issue === transferTitle) return false;
    const legId = issue.proposedChange?.legId;
    const sameLegAlreadyCounted = transferTitle?.rule === "route-integrity"
      && (issue.rule === "missing-logistics" || issue.rule === "connection-confidence")
      && typeof legId === "string" && integrityLegIds.has(legId);
    return !sameLegAlreadyCounted || issue.severity === "critical";
  });
  const transferNotice: OverviewIssue | null = transferTitle ? {
    id: transferTitle.id,
    title: transferTitle.rule === "route-integrity"
      ? transferTitle.message.replace(/ before Morrovia can assess the full route\.$/, "")
      : transferTitle.message,
    details: [...new Set(transferDetails.map((issue) => issue.message))],
    severity: transferIssues.some((issue) => issue.severity === "critical")
      ? "critical" : transferIssues.some((issue) => issue.severity === "warning") ? "warning" : "info",
    href: transportWorkspaceHref(trip.id, reviewLegIds[0], reviewLegIds.length > 1 ? reviewLegIds : []),
    actionLabel: "Review transfers",
    reviewLegIds,
  } : null;

  const presented: OverviewIssue[] = [];
  for (const issue of issues) {
    if (transportIssue(issue)) {
      if (transferNotice && !presented.includes(transferNotice)) presented.push(transferNotice);
    } else {
      presented.push(nonTransportIssue(trip, issue));
    }
  }
  const critical = presented.filter((issue) => issue.severity === "critical");
  const others = presented.filter((issue) => issue.severity !== "critical");
  return [...critical, ...others.slice(0, Math.max(0, 2 - critical.length))];
}
