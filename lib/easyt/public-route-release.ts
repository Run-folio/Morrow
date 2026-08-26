import { inspirationByKey } from "./inspiration.ts";
import { routeImages } from "./route-images.ts";
import { routeFamilies, type RouteFamily, type RouteEditorialUnknown } from "./route-catalog.ts";

export type PublicRouteReleaseIssueCode =
  | "canonical-identity"
  | "builder-handoff"
  | "stops"
  | "recommended-nights"
  | "route-order-rationale"
  | "connection-assumption"
  | "connection-evidence"
  | "provenance"
  | "confidence"
  | "reviewed-at"
  | "image-rights"
  | "editorial-owner"
  | "editorial-reviewer"
  | "explicit-unknowns";

export type PublicRouteReleaseIssue = {
  code: PublicRouteReleaseIssueCode;
  detail: string;
};

export type PublicRouteReleaseReport = {
  routeKey: string;
  status: "ready" | "ready-with-verification" | "incomplete";
  blockers: PublicRouteReleaseIssue[];
  needsVerification: string[];
  reviewedAssumptions: string[];
};

const connectionReference = (from: string, to: string) => `${from} → ${to}`;
const validUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

function validReviewDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function matchesUnknown(unknowns: readonly RouteEditorialUnknown[] | undefined, kind: RouteEditorialUnknown["kind"], reference: string) {
  return unknowns?.some((unknown) => unknown.kind === kind && unknown.reference === reference && Boolean(unknown.reason.trim())) ?? false;
}

/**
 * Editorial release gate only. It does not change Discover, Route Detail, or
 * Builder availability; incomplete catalogue records remain visible for review
 * until their missing facts are actually supplied.
 */
export function checkPublicRouteRelease(route: RouteFamily): PublicRouteReleaseReport {
  const blockers: PublicRouteReleaseIssue[] = [];
  const needsVerification: string[] = [];
  const reviewedAssumptions: string[] = [];
  const release = route.release;
  const sourceLabels = new Set(route.sourceLinks.map((source) => source.label));
  const seed = inspirationByKey[route.key];

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route.key) || !route.title.trim()) blockers.push({ code: "canonical-identity", detail: "Route key or title is missing a canonical public identity." });
  if (!seed || seed.stops.length !== route.stops.length || seed.stops.some((stop, index) => stop.name !== route.stops[index]?.name || stop.country !== route.stops[index]?.country)) blockers.push({ code: "builder-handoff", detail: "The builder seed does not match the canonical route stops in order." });

  if (route.stops.length < 2 || route.stops.some((stop) => !stop.name.trim() || !stop.country.trim() || !Number.isFinite(stop.coordinates[0]) || !Number.isFinite(stop.coordinates[1]) || stop.minimumNights < 1 || !stop.reason.trim())) blockers.push({ code: "stops", detail: "Every route stop needs a name, country, coordinates, minimum nights, and route role rationale." });
  if (route.stops.some((stop) => !Number.isInteger(stop.recommendedNights) || (stop.recommendedNights ?? 0) < stop.minimumNights)) blockers.push({ code: "recommended-nights", detail: "Every stop needs an explicit reviewed recommended-night value at or above its minimum." });
  if (!release?.routeOrderRationale?.trim()) blockers.push({ code: "route-order-rationale", detail: "The route needs an explicit rationale for its published order." });

  if (!route.sourceLinks.length || route.sourceLinks.some((source) => !source.label.trim() || !source.covers.trim() || !validUrl(source.url))) blockers.push({ code: "provenance", detail: "Route provenance needs a labelled HTTP(S) source link and coverage statement." });
  if (!["high", "medium", "needs-review"].includes(route.confidence)) blockers.push({ code: "confidence", detail: "The route needs an explicit confidence classification." });
  if (!validReviewDate(route.reviewedAt)) blockers.push({ code: "reviewed-at", detail: "The route needs a valid ISO last-reviewed date." });

  const expectedConnections = route.stops.slice(0, -1).map((stop, index) => [stop.name, route.stops[index + 1]!.name] as const);
  for (const [from, to] of expectedConnections) {
    const reference = connectionReference(from, to);
    const connection = route.connections.find((item) => item.from === from && item.to === to);
    if (!connection) {
      if (matchesUnknown(release?.explicitUnknowns, "connection", reference)) needsVerification.push(`${reference}: explicitly unknown connection.`);
      else blockers.push({ code: "connection-assumption", detail: `${reference} needs a reviewed connection assumption or an explicit unknown.` });
      continue;
    }
    const hasEvidence = Boolean(connection.sourceLabels?.length) && connection.sourceLabels!.every((label) => sourceLabels.has(label));
    if (connection.confidence === "needs-review") {
      if (hasEvidence) needsVerification.push(`${reference}: evidence is present but the planning assumption still needs verification.`);
      else if (matchesUnknown(release?.explicitUnknowns, "connection", reference)) needsVerification.push(`${reference}: explicitly needs verification.`);
      else blockers.push({ code: "connection-evidence", detail: `${reference} is marked needs-review without source evidence or an explicit unknown.` });
    } else if (!hasEvidence) {
      blockers.push({ code: "connection-evidence", detail: `${reference} cannot be a reviewed ${connection.confidence}-confidence assumption without linked provenance.` });
    } else {
      reviewedAssumptions.push(`${reference}: ${connection.confidence}-confidence connection supported by route provenance.`);
    }
  }

  if (!release?.explicitUnknowns) blockers.push({ code: "explicit-unknowns", detail: "The editor must explicitly record remaining unknowns, even when there are none." });
  if (!release?.editorialOwner?.trim()) blockers.push({ code: "editorial-owner", detail: "The route needs an editorial owner." });
  if (!release?.editorialReviewer?.trim()) blockers.push({ code: "editorial-reviewer", detail: "The route needs an editorial reviewer." });
  const image = release?.image;
  if (!routeImages[route.key] || !image || image.asset !== routeImages[route.key] || !["owned", "licensed", "public-domain"].includes(image.rights) || (image.rights !== "owned" && (!image.attribution?.trim() || !image.sourceUrl || !validUrl(image.sourceUrl)))) blockers.push({ code: "image-rights", detail: "The published hero needs matching rights status and, when not owned, attribution and a source link." });

  const status = blockers.length ? "incomplete" : needsVerification.length ? "ready-with-verification" : "ready";
  return { routeKey: route.key, status, blockers, needsVerification, reviewedAssumptions };
}

export function publicRouteReleaseReports() {
  return routeFamilies.map(checkPublicRouteRelease);
}

export function assertPublicRouteReleaseReady(route: RouteFamily) {
  const report = checkPublicRouteRelease(route);
  if (report.blockers.length) throw new Error(`${route.key} is not release-ready: ${report.blockers.map((issue) => issue.code).join(", ")}`);
  return report;
}
