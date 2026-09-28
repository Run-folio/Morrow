import type { EasyTTrip, TripRecommendation } from "./trip.ts";
import { mapWorkspaceHref, transportWorkspaceHref, tripWorkspaceHref } from "./trip-workspace-links.ts";

export type OverviewIssue = {
  id: string;
  title: string;
  details: string[];
  findings: { message: string; severity: TripRecommendation["severity"] }[];
  severity: TripRecommendation["severity"];
  href: string;
  actionLabel: "Review route" | "Review transfers";
  reviewLegIds: string[];
};

export type RouteCheckFinding = { id: string; text: string; severity: OverviewIssue["severity"] };
export type RouteCheckAction = { href: string; label: OverviewIssue["actionLabel"] };
const severityOrder = { critical: 0, warning: 1, info: 2 };

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
  return {
    id: issue.id,
    title: issue.message,
    details: [],
    findings: [{ message: issue.message, severity: issue.severity }],
    severity: issue.severity,
    href: routeIssueHref(trip.id),
    actionLabel: "Review route",
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
  const sortedTransferDetails = [...transferDetails].sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);
  const distinctTransferDetails = sortedTransferDetails.filter((issue, index) =>
    sortedTransferDetails.findIndex((candidate) => candidate.message === issue.message) === index);
  const transferNotice: OverviewIssue | null = transferTitle ? {
    id: transferTitle.id,
    title: transferTitle.rule === "route-integrity"
      ? transferTitle.message.replace(/ before Morrovia can assess the full route\.$/, "")
      : transferTitle.message,
    details: distinctTransferDetails.map((issue) => issue.message),
    findings: [
      { message: transferTitle.rule === "route-integrity"
        ? transferTitle.message.replace(/ before Morrovia can assess the full route\.$/, "")
        : transferTitle.message, severity: transferTitle.severity },
      ...distinctTransferDetails.map((issue) => ({ message: issue.message, severity: issue.severity })),
    ],
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
  return [...critical, ...others];
}

function conciseFinding(message: string) {
  if (message === "The saved route does not yet represent the complete journey from its origin.") {
    return "Journey origin isn’t fully represented";
  }
  const usableDays = message.match(/^Travel leaves only ([\d.]+) usable days in (.+)\.$/);
  if (usableDays) return `${usableDays[2]} has only ${usableDays[1]} usable days`;
  const tripEnd = message.match(/^The final stop ends on (\d{4}-\d{2}-\d{2}), not at the end of the trip\.$/);
  if (tripEnd) return `Final stop ends on ${tripEnd[1]}, not on trip end`;
  return message;
}

/** A display-only summary; canonical findings and destination links remain owned above. */
export function presentRouteCheckSummary(issues: readonly OverviewIssue[], primaryHref: string) {
  const findings = issues.flatMap((issue) => issue.findings.map((finding, index) => ({
    id: `${issue.id}-${index}`,
    text: conciseFinding(finding.message),
    severity: finding.severity,
  } satisfies RouteCheckFinding)));
  findings.sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);
  const visibleCount = findings.length > 3
    ? Math.max(3, findings.filter((finding) => finding.severity === "critical").length)
    : findings.length;
  const actions: RouteCheckAction[] = [];
  for (const issue of issues) {
    if (issue.href !== primaryHref && !actions.some((action) => action.href === issue.href)) {
      actions.push({ href: issue.href, label: issue.actionLabel });
    }
  }
  return { visible: findings.slice(0, visibleCount), remaining: findings.slice(visibleCount), actions };
}
