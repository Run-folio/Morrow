"use client";

import Link from "next/link";
import {
  BedDouble,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Map,
  MapPin,
  Route,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { accommodationProgress, stayBookingForStop } from "@/lib/easyt/accommodation";
import { itineraryImageFor } from "@/lib/easyt/itinerary-media";
import { tripHealth, tripHealthSummary } from "@/lib/easyt/review";
import { deriveItineraryCoverage, formatTripDuration, formatTripNights } from "@/lib/easyt/trip-facts";
import { getBookingAction, omioBookingActionForLeg } from "@/lib/easyt/booking-readiness";
import { trackEvent } from "@/lib/analytics";
import type { EasyTTrip, TripRecommendation, TripStop } from "@/lib/easyt/trip";
import ResilientImage from "./resilient-image";
import {
  firstItineraryDayForStop,
  itineraryDayForRecommendation,
  itineraryWorkspaceHref,
  mapWorkspaceHref,
  shouldShowFirstTripOrientation,
} from "@/lib/easyt/trip-workspace-links";
import styles from "./trip-overview-workspace.module.css";
import { tripLegClassificationLabel } from "@/lib/easyt/trip-legs";

type OverviewAction = {
  title: string;
  detail: string;
  label: string;
  href: string;
  kind: "route" | "itinerary" | "stay" | "prep" | "ready" | "transport";
  stopId?: string;
  external?: boolean;
  affiliate?: boolean;
  transferId?: string;
  originStopId?: string;
  destinationStopId?: string;
  provider?: string;
  affiliateCategory?: string;
};

type OverviewIssue = {
  id: string;
  message: string;
  severity: "critical" | "warning";
  href: string;
};

const WORKSPACE_ORIENTATION_KEY = "morrovia-workspace-orientation-seen-v1";

function routeIssueHref(tripId: string) {
  return mapWorkspaceHref(tripId);
}

function recommendationHref(trip: EasyTTrip, recommendation: TripRecommendation) {
  const dayNumber = itineraryDayForRecommendation(trip, recommendation);
  return dayNumber ? itineraryWorkspaceHref(trip.id, dayNumber) : routeIssueHref(trip.id);
}

function openHealthIssues(trip: EasyTTrip) {
  return tripHealth(trip).issues
    .filter((issue) => issue.status === "open")
    .sort((left, right) => ({ critical: 0, warning: 1, info: 2 }[left.severity] - { critical: 0, warning: 1, info: 2 }[right.severity]));
}

/**
 * Presentation-only precedence over canonical state. This does not persist a
 * second readiness model or replace Plan Review intelligence.
 */
export function overviewActionForTrip(trip: EasyTTrip): OverviewAction {
  const coverage = deriveItineraryCoverage(trip);
  const itineraryComplete = coverage.state === "complete";
  const accommodation = accommodationProgress(trip);
  const missingStay = accommodation.stops.find((stop) => !stayBookingForStop(trip, stop));
  const missingStayAction = missingStay ? getBookingAction({ category: "accommodation", trip, stop: missingStay }) : undefined;
  const issues = openHealthIssues(trip).filter((issue) => issue.severity !== "info");
  const critical = issues.find((issue) => issue.severity === "critical");
  const prep = trip.brief.checklist ?? [];
  const prepComplete = prep.length > 0 && prep.every((item) => item.complete);

  if (critical) return {
    title: critical.message,
    detail: "Resolve this before relying on the current route or making connected bookings.",
    label: "Review route",
    href: recommendationHref(trip, critical),
    kind: "route",
  };
  if (!itineraryComplete) return {
    title: coverage.plannedDays ? "Finish shaping the itinerary" : "Start shaping the itinerary",
    detail: coverage.label,
    label: "Continue itinerary",
    href: `/journey/${encodeURIComponent(trip.id)}/itinerary`,
    kind: "itinerary",
  };
  if (missingStay && missingStayAction) return {
    title: `Find accommodation in ${missingStay.name}`,
    detail: `${accommodation.stops.length - accommodation.sortedCount} of ${accommodation.stops.length} overnight ${accommodation.stops.length === 1 ? "stop needs" : "stops need"} accommodation.`,
    label: missingStayAction.cta,
    href: missingStayAction.href,
    kind: "stay",
    stopId: missingStay.id,
    external: true,
    affiliate: true,
    provider: missingStayAction.provider,
    affiliateCategory: missingStayAction.category,
  };
  if (missingStay) return {
    title: `Find a stay in ${missingStay.name}`,
    detail: `${accommodation.stops.length - accommodation.sortedCount} of ${accommodation.stops.length} overnight ${accommodation.stops.length === 1 ? "stop needs" : "stops need"} accommodation.`,
    label: "Find a stay",
    href: mapWorkspaceHref(trip.id, missingStay.id, "stay"),
    kind: "stay",
    stopId: missingStay.id,
  };
  if (issues[0]) return {
    title: issues[0].message,
    detail: "Review the underlying route signal before treating this part of the plan as settled.",
    label: "Review route",
    href: recommendationHref(trip, issues[0]),
    kind: "route",
  };
  if (prep.length > 0 && !prepComplete) return {
    title: prep.length ? "Finish the remaining trip prep" : "Review the practical details",
    detail: prep.length
      ? `${prep.filter((item) => item.complete).length} of ${prep.length} saved prep tasks are complete.`
      : "Check entry guidance, documents and the practical details before departure.",
    label: "Review prep",
    href: `/journey/${encodeURIComponent(trip.id)}/prep`,
    kind: "prep",
  };
  const omioAction = trip.legs.map((leg) => omioBookingActionForLeg(trip, leg)).find((action) => Boolean(action));
  if (omioAction) return {
    title: omioAction.title,
    detail: omioAction.detail,
    label: omioAction.cta,
    href: omioAction.href,
    kind: "transport",
    external: true,
    affiliate: true,
    provider: omioAction.provider,
    affiliateCategory: "transport",
    transferId: omioAction.transferId,
    originStopId: omioAction.originStopId,
    destinationStopId: omioAction.destinationStopId,
  };
  return {
    title: "Your trip is looking ready",
    detail: "The route, itinerary, stays and saved prep checklist are covered.",
    label: "View itinerary",
    href: `/journey/${encodeURIComponent(trip.id)}/itinerary`,
    kind: "ready",
  };
}

function issueSummary(trip: EasyTTrip): OverviewIssue[] {
  return openHealthIssues(trip).map((issue: TripRecommendation) => ({
    id: issue.id,
    message: issue.message,
    severity: issue.severity === "critical" ? "critical" : "warning",
    href: recommendationHref(trip, issue),
  }));
}

function stopImage(trip: EasyTTrip, stop: TripStop, index: number) {
  const day = [...trip.planItems]
    .sort((left, right) => left.dayNumber - right.dayNumber)
    .find((item) => item.stopId === stop.id);
  if (day?.image) return { src: day.image, alt: day.title };
  if (!day) return null;
  const image = itineraryImageFor({ title: day.title, destination: stop.name, items: day.notes }, index);
  return image ? { src: image.src, alt: image.alt } : null;
}

export default function TripOverviewWorkspace({ trip, firstArrival = false }: { trip: EasyTTrip; firstArrival?: boolean }) {
  const [showOrientation, setShowOrientation] = useState(false);
  useEffect(() => {
    let alreadySeen = false;
    try { alreadySeen = window.localStorage.getItem(WORKSPACE_ORIENTATION_KEY) === "1"; } catch { alreadySeen = false; }
    if (!shouldShowFirstTripOrientation(firstArrival, alreadySeen)) return;
    setShowOrientation(true);
    try { window.localStorage.setItem(WORKSPACE_ORIENTATION_KEY, "1"); } catch { /* Browser storage is optional. */ }
  }, [firstArrival]);
  const action = overviewActionForTrip(trip);
  const issues = issueSummary(trip);
  const visibleIssues = issues.slice(0, 2);
  const healthSummary = tripHealthSummary(trip);
  const health = healthSummary.health;
  const accommodation = accommodationProgress(trip);
  const coverage = deriveItineraryCoverage(trip);
  const itineraryPercent = coverage.percent ?? 0;
  const stayPercent = accommodation.stops.length ? Math.round((accommodation.sortedCount / accommodation.stops.length) * 100) : 100;
  const checklist = trip.brief.checklist ?? [];
  const prepCompleteCount = checklist.filter((item) => item.complete).length;
  const prepPercent = checklist.length ? Math.round((prepCompleteCount / checklist.length) * 100) : 0;
  const orderedStops = [...trip.stops].sort((left, right) => left.order - right.order);
  const routeAssessment = trip.brief.routeAssessment?.route;
  const routeRationale = routeAssessment && routeAssessment.state !== "insufficient-data" ? routeAssessment : null;
  const actionImageStop = action.kind === "stay" ? orderedStops.find((stop) => stop.id === action.stopId) : orderedStops[0];
  const actionImage = actionImageStop ? stopImage(trip, actionImageStop, orderedStops.indexOf(actionImageStop)) : null;
  const ActionIcon = action.kind === "stay" ? BedDouble
    : action.kind === "itinerary" ? CalendarCheck2
        : action.kind === "prep" ? ShieldCheck
          : action.kind === "ready" ? CheckCircle2
            : Route;

  return (
    <section className={styles.overview} aria-label="Trip overview">
      {showOrientation ? <aside className={styles.orientation} aria-labelledby="workspace-orientation-title">
        <header><div><p>{health.isReady ? "Your trip is ready" : "Your trip is taking shape"}</p><h2 id="workspace-orientation-title">Choose what to refine next.</h2></div><button type="button" onClick={() => setShowOrientation(false)} aria-label="Dismiss workspace orientation"><X aria-hidden="true" /></button></header>
        <ul>
          <li><strong>Overview</strong><span>See the next action and anything that needs attention.</span></li>
          <li><strong>Map</strong><span>Explore stays, food and places around each stop.</span></li>
          <li><strong>Itinerary</strong><span>Shape the trip day by day.</span></li>
          <li><strong>Prep</strong><span>Keep practical tasks separate from the itinerary.</span></li>
        </ul>
      </aside> : null}
      <div className={styles.grid}>
        <article className={styles.nextAction}>
          <div className={styles.nextCopy}>
            <p>Your next step</p>
            <span className={styles.actionIcon}><ActionIcon aria-hidden="true" /></span>
            <h2>{action.title}</h2>
            <span>{action.detail}</span>
            {action.external ? <a href={action.href} target="_blank" rel="sponsored noopener noreferrer" aria-label={action.provider === "omio" ? `${action.label}, opens Omio in a new tab` : action.provider === "trip.com" ? `${action.label}, opens Trip.com in a new tab` : undefined} onClick={() => { if (action.provider === "omio") trackEvent("affiliate_link_clicked", { partner: "omio", placement: "overview_next_action", tripId: trip.id, transferId: action.transferId, originStopId: action.originStopId, destinationStopId: action.destinationStopId }); else if (action.affiliate && action.provider && action.affiliateCategory) trackEvent("affiliate_click", { category: action.affiliateCategory, provider: action.provider, trip_id: trip.id, stop_id: action.stopId, placement: "overview_next_action", workspace_view: "overview" }); }}>{action.label}<ExternalLink aria-hidden="true" /></a> : <Link href={action.href}>{action.label}<ChevronRight aria-hidden="true" /></Link>}
            {action.affiliate ? <small className={styles.affiliateDisclosure}>Partner link · Morrovia may earn a commission at no extra cost to you.</small> : null}
          </div>
          <ResilientImage
            src={actionImage?.src}
            alt={actionImage?.alt ?? ""}
            fallback={<Sparkles className={styles.nextFallback} aria-hidden="true" />}
          />
        </article>

        <article className={styles.healthCard}>
          <p>Trip health</p>
          <div className={styles.healthHeading}>
            {health.blockingCount ? <CircleAlert className={styles.healthCritical} aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            <div>
              <h2>{healthSummary.headline}</h2>
              <span>{healthSummary.detail}</span>
            </div>
          </div>
          {visibleIssues.length ? <ul>{visibleIssues.map((issue) => <li key={issue.id} className={issue.severity === "critical" ? styles.issueCritical : undefined}><CircleAlert aria-hidden="true" /><Link href={issue.href}>{issue.message}</Link></li>)}</ul> : <div className={styles.clearHealth}><ShieldCheck aria-hidden="true" />Keep live timings and entry guidance checked before booking.</div>}
          <Link href={issues[0]?.href ?? routeIssueHref(trip.id)}>Review trip<ChevronRight aria-hidden="true" /></Link>
        </article>

        <section className={styles.progressCard} aria-labelledby="overview-progress-title">
          <div className={styles.sectionHeading}>
            <div><p>Readiness at a glance</p><h2 id="overview-progress-title">Planning progress</h2></div>
            <Link href={`/journey/${encodeURIComponent(trip.id)}/prep`}>Review prep<ChevronRight aria-hidden="true" /></Link>
          </div>
          <div className={styles.progressGrid}>
            <ProgressItem icon={CalendarCheck2} label="Itinerary" detail={coverage.label} percent={itineraryPercent} complete={coverage.state === "complete"} />
            <ProgressItem icon={BedDouble} label="Stays" detail={accommodation.stops.length ? `${accommodation.sortedCount} of ${accommodation.stops.length} sorted` : "No overnight stays"} percent={stayPercent} complete={stayPercent === 100} />
            <ProgressItem icon={ShieldCheck} label="Saved checklist" detail={checklist.length ? `${prepCompleteCount} of ${checklist.length} complete` : "Review practicals"} percent={prepPercent} complete={checklist.length > 0 && prepPercent === 100} />
          </div>
        </section>

        <section className={styles.routeCard} aria-labelledby="overview-route-title">
          <div className={styles.sectionHeading}>
            <div><p>Your route</p><h2 id="overview-route-title">{orderedStops.length} {orderedStops.length === 1 ? "stop" : "stops"}, one connected trip</h2></div>
            <div className={styles.routeActions}>
              <Link href={`/journey/${encodeURIComponent(trip.id)}/itinerary`}>View itinerary<ChevronRight aria-hidden="true" /></Link>
              <Link href={`/journey/${encodeURIComponent(trip.id)}/map`}>Open map<Map aria-hidden="true" /></Link>
            </div>
          </div>
          {orderedStops.length ? <ol className={styles.routeList}>
            <li>
              <article>
                <div className={styles.stopNumber}>From</div>
                <div className={styles.stopFallback}><MapPin aria-hidden="true" /></div>
                <div><h3>{trip.brief.origin}</h3><span>Journey origin · no nights allocated</span></div>
              </article>
              {(() => {
                const arrival = trip.legs.find((item) => item.classification === "arrival" || item.fromEndpoint?.kind === "origin");
                return <div className={styles.transfer}><Route aria-hidden="true" /><span>{tripLegClassificationLabel(arrival?.classification)} · {arrival ? formatTripDuration(arrival.doorToDoorMinutes ?? arrival.durationMinutes) : "Timing to confirm"}</span><ChevronRight aria-hidden="true" /></div>;
              })()}
            </li>
            {orderedStops.map((stop, index) => {
              const image = stopImage(trip, stop, index);
              const itineraryDay = firstItineraryDayForStop(trip, stop.id);
              const next = orderedStops[index + 1];
              const leg = next ? trip.legs.find((item) => item.fromStopId === stop.id && item.toStopId === next.id) : null;
              return <li key={stop.id}>
                <Link className={styles.routeStopLink} href={itineraryWorkspaceHref(trip.id, itineraryDay)}><article>
                  <div className={styles.stopNumber}>{index + 1}</div>
                  <ResilientImage
                    src={image?.src}
                    alt={image?.alt ?? ""}
                    fallback={<div className={styles.stopFallback}><MapPin aria-hidden="true" /></div>}
                  />
                  <div><h3>{stop.name}</h3><span>{formatTripNights(stop.nights)}</span></div>
                </article></Link>
                {next ? <div className={styles.transfer}><Route aria-hidden="true" /><span>{leg ? `${tripLegClassificationLabel(leg.classification)} · ${formatTripDuration(leg.doorToDoorMinutes ?? leg.durationMinutes)}` : "Transfer to confirm"}</span><ChevronRight aria-hidden="true" /></div> : null}
              </li>;
            })}
          </ol> : <div className={styles.emptyRoute}><MapPin aria-hidden="true" /><p>Add a destination to start shaping this trip.</p></div>}
          {routeRationale ? <aside className={styles.routeRationale} aria-labelledby="overview-route-rationale-title"><Sparkles aria-hidden="true" /><div><p>Why this order</p><h3 id="overview-route-rationale-title">{health.isReady ? routeRationale.summary : "The stop order is coherent; transfer checks remain."}</h3>{routeRationale.reasons.length ? <ul>{routeRationale.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}{routeRationale.tradeoffs[0] ? <span><strong>Main trade-off:</strong> {routeRationale.tradeoffs[0]}</span> : null}</div></aside> : null}
        </section>
      </div>
    </section>
  );
}

function ProgressItem({ icon: Icon, label, detail, percent, complete }: {
  icon: typeof Clock3;
  label: string;
  detail: string;
  percent: number;
  complete: boolean;
}) {
  return <article className={styles.progressItem}>
    <Icon aria-hidden="true" />
    <div><h3>{label}</h3><span>{detail}</span></div>
    <div className={styles.progressTrack} aria-label={`${label}: ${percent}%`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div>
    <small className={complete ? styles.progressComplete : undefined}>{complete ? "Ready" : percent ? `${percent}%` : "To do"}</small>
  </article>;
}
