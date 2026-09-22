"use client";

import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  CalendarCheck2,
  CarFront,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  FileCheck2,
  HeartPulse,
  Map,
  MapPin,
  Maximize2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { accommodationProgress, stayBookingForStop } from "@/lib/easyt/accommodation";
import { itineraryImageFor } from "@/lib/easyt/itinerary-media";
import { tripHealth } from "@/lib/easyt/review";
import { formatTripDuration, formatTripNights } from "@/lib/easyt/trip-facts";
import type { EasyTTrip, TripRecommendation, TripStop } from "@/lib/easyt/trip";
import ResilientImage from "./resilient-image";
import {
  firstItineraryDayForStop,
  itineraryDayForRecommendation,
  itineraryWorkspaceHref,
  mapWorkspaceHref,
  tripBuilderHref,
} from "@/lib/easyt/trip-workspace-links";
import styles from "./trip-overview-workspace.module.css";
import { endEndpointForTrip, originEndpointForTrip } from "@/lib/easyt/trip-legs";
import { mapRouteLegsFromTrip } from "@/lib/easyt/map-spatial-context";
import type { JourneyStop } from "@/lib/journey";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import { createAbortableEffectScope } from "@/lib/easyt/abortable-effect";
import { EasyTLinkButton } from "./easyt-controls";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import { TripPreparationTaskSection, TripTravellerDetailsEditor } from "./trip-preparation";
import { useTripPrepReadiness, type TripPrepProviderStatus } from "./use-trip-prep-readiness";
import { deriveOverviewReadinessCategories, type OverviewReadinessCategory, type OverviewReadinessCategoryId } from "@/lib/easyt/trip-overview-readiness";
import type { BookingReadinessAction } from "@/lib/easyt/booking-readiness";
import type { ReadinessCard, TravelReadinessProfile } from "@/lib/easyt/travel-readiness";
import { groupTripPrepTasks } from "@/lib/easyt/trip-prep";
import { useWorkspaceOrientationReady, useWorkspaceOrientationTarget } from "./workspace-orientation";
import { sameJourneyPlace } from "@/lib/easyt/journey-endpoints";
import TripExplicitPlans from "./trip-explicit-plans";

type OverviewIssue = {
  id: string;
  message: string;
  severity: TripRecommendation["severity"];
  href: string;
  actionLabel: "Review timing" | "Review transport";
};

const progressIconByCategory: Record<OverviewReadinessCategoryId, LucideIcon> = {
  itinerary: CalendarCheck2,
  accommodation: BedDouble,
  transport: CarFront,
  passport: FileCheck2,
  insurance: ShieldCheck,
  connectivity: Smartphone,
  checklist: ClipboardCheck,
};

type TripOverviewWorkspaceProps = {
  trip: EasyTTrip;
  firstArrival?: boolean;
  initialPrepActions?: BookingReadinessAction[];
  initialPrepReadinessCards?: ReadinessCard[];
  initialPrepProfile?: TravelReadinessProfile;
  initialPrepProviderStatus?: TripPrepProviderStatus;
  now?: string;
  initialGoodTasksOpen?: boolean;
};

type ReadinessTileAction = { href: string; label: string };

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

const materialRouteRules = new Set([
  "route-integrity", "trip-dates", "stay-duration-confidence", "night-allocation-compromise",
  "destination-identity", "split-base-sequence", "driving-load", "travel-day-impact", "trip-pace",
  "missing-logistics", "connection-confidence", "recovery-time", "stop-density", "short-stop-heavy-transfer",
  "transit-to-time-ratio", "fixed-date-conflict", "schedule-lock-conflict", "route-backtracking",
  "trip-end-mismatch", "missing-transport-decision",
]);

function issueSummary(trip: EasyTTrip): OverviewIssue[] {
  return openHealthIssues(trip).filter((issue) => issue.severity === "critical" || materialRouteRules.has(issue.rule)).map((issue: TripRecommendation) => ({
    id: issue.id,
    message: issue.message,
    severity: issue.severity,
    href: recommendationHref(trip, issue),
    actionLabel: ["missing-logistics", "connection-confidence", "missing-transport-decision"].includes(issue.rule)
      || /transfer|transport|connection/i.test(issue.message)
      ? "Review transport"
      : "Review timing",
  }));
}

function routeRationaleCopy(route: NonNullable<EasyTTrip["brief"]["routeAssessment"]>["route"]) {
  return route.reasons.find((reason) => !/entered order ranks first under (?:the )?current route criteria/i.test(reason))
    ?? route.summary;
}

function stopImage(trip: EasyTTrip, stop: TripStop, index: number) {
  const days = [...trip.planItems]
    .sort((left, right) => left.dayNumber - right.dayNumber)
    .filter((item) => item.stopId === stop.id);
  const imagedDay = days.find((item) => Boolean(item.image));
  if (imagedDay?.image) return { src: imagedDay.image, alt: imagedDay.title };
  const day = days[0];
  if (!day) return null;
  const image = itineraryImageFor({ title: day.title, destination: stop.name, items: day.notes }, index);
  return image ? { src: image.src, alt: image.alt } : null;
}

function conciseTransferLabel(leg: EasyTTrip["legs"][number] | null | undefined) {
  if (!leg) return null;
  const minutes = leg.doorToDoorMinutes ?? leg.durationMinutes;
  if (!minutes) return "Transfer to confirm";
  const duration = formatTripDuration(minutes);
  return leg.mode === "flight" ? `${duration} by air` : `${duration} transfer`;
}

export default function TripOverviewWorkspace({
  trip,
  firstArrival = false,
  initialPrepActions,
  initialPrepReadinessCards,
  initialPrepProfile,
  initialPrepProviderStatus,
  now,
  initialGoodTasksOpen = false,
}: TripOverviewWorkspaceProps) {
  const [travellerDetailsOpen, setTravellerDetailsOpen] = useState(false);
  const [beforeGoOpen, setBeforeGoOpen] = useState(initialGoodTasksOpen);
  const [resolvedPlaceImages, setResolvedPlaceImages] = useState<Record<string, { src: string; alt: string }>>({});
  const prepReadiness = useTripPrepReadiness({
    trip,
    initialActions: initialPrepActions,
    initialReadinessCards: initialPrepReadinessCards,
    initialProfile: initialPrepProfile,
    initialProviderStatus: initialPrepProviderStatus,
    now,
  });
  const nextOrientationTarget = useWorkspaceOrientationTarget("overview", "overview-next");
  const progressOrientationTarget = useWorkspaceOrientationTarget("overview", "overview-progress");
  useWorkspaceOrientationReady("overview", Boolean(trip.stops.length && trip.planItems.length));
  const materialRouteIssues = issueSummary(trip);
  const visibleIssues = materialRouteIssues.slice(0, 2);
  const accommodation = accommodationProgress(trip);
  const prepProviderStatus = prepReadiness.providerUnavailable
    ? "unavailable"
    : prepReadiness.providersAvailable
      ? "available"
      : "loading";
  const readinessCategories = useMemo(() => deriveOverviewReadinessCategories({
    trip,
    prepTasks: prepReadiness.tasks,
    providerStatus: prepProviderStatus,
  }), [prepProviderStatus, prepReadiness.tasks, trip]);
  const planningCategories = readinessCategories.filter((category) => ["itinerary", "accommodation", "transport"].includes(category.id));
  const outstandingPrepGroups = useMemo(
    () => groupTripPrepTasks(prepReadiness.tasks.filter((task) => task.status !== "complete")),
    [prepReadiness.tasks],
  );
  const mustTasks = outstandingPrepGroups.must;
  const goodTasks = [...outstandingPrepGroups.good, ...outstandingPrepGroups.nice];
  const orderedStops = useMemo(() => [...trip.stops].sort((left, right) => left.order - right.order), [trip.stops]);
  const routeAssessment = trip.brief.routeAssessment?.route;
  const routeRationale = routeAssessment && routeAssessment.state !== "insufficient-data" ? routeAssessment : null;
  const itineraryCategory = planningCategories.find((category) => category.id === "itinerary");
  const criticalRouteIssue = materialRouteIssues.find((issue) => issue.severity === "critical");
  const primaryAction = criticalRouteIssue
    ? { href: criticalRouteIssue.href, label: "Review route" }
    : {
        href: `/journey/${encodeURIComponent(trip.id)}/itinerary`,
        label: firstArrival || itineraryCategory?.status === "to-do" || itineraryCategory?.percent === 0
          ? "Plan my days"
          : itineraryCategory?.status === "complete" ? "Review itinerary" : "Continue planning",
      };
  const origin = originEndpointForTrip(trip);
  const journeyEnd = endEndpointForTrip(trip);
  const lastRouteStop = orderedStops.at(-1);
  const journeyEndIsLastStop = Boolean(journeyEnd && lastRouteStop && sameJourneyPlace({
    name: journeyEnd.name,
    country: journeyEnd.country,
    canonicalPlaceId: journeyEnd.canonicalPlaceId,
    providerId: journeyEnd.providerId,
    coordinates: journeyEnd.coordinates ?? undefined,
  }, {
    name: lastRouteStop.name,
    country: lastRouteStop.country,
    canonicalPlaceId: lastRouteStop.canonicalPlaceId,
    providerId: lastRouteStop.providerId,
    coordinates: lastRouteStop.longitude !== null && lastRouteStop.latitude !== null
      ? [lastRouteStop.longitude, lastRouteStop.latitude]
      : undefined,
  }));
  const originLongitude = origin.coordinates?.[0] ?? null;
  const originLatitude = origin.coordinates?.[1] ?? null;
  const overviewMapStops = useMemo<JourneyStop[]>(() => [{
    id: origin.id,
    city: origin.name,
    country: origin.country ?? "Journey origin",
    date: "From",
    coordinates: originLongitude !== null && originLatitude !== null ? [originLongitude, originLatitude] : null,
    theme: "transit",
    marker: "plane",
    description: "Journey origin",
    highlights: ["Journey origin"],
    aiPrompt: `Explain the arrival journey from ${origin.name}.`,
  }, ...orderedStops.map((stop) => ({
    id: stop.id,
    city: stop.name,
    country: stop.country,
    date: stop.arrivalDate ?? "Date to confirm",
    coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] as [number, number] : null,
    theme: "city" as const,
    marker: "skyline" as const,
    description: `Saved stop in ${stop.name}.`,
    highlights: [],
    aiPrompt: `What should I prioritise in ${stop.name}?`,
  }))], [orderedStops, origin.country, origin.id, origin.name, originLatitude, originLongitude]);
  const overviewMapLegs = useMemo(() => mapRouteLegsFromTrip(trip), [trip.brief, trip.id, trip.legs, trip.stops]);
  const imageResolutionCandidates = useMemo(() => [
    { id: origin.id, name: origin.name, country: origin.country ?? "", coordinates: origin.coordinates },
    ...orderedStops.flatMap((stop, index) => stopImage(trip, stop, index)
      ? []
      : [{
          id: stop.id,
          name: stop.name,
          country: stop.country,
          coordinates: stop.longitude !== null && stop.latitude !== null
            ? [stop.longitude, stop.latitude] as [number, number]
            : undefined,
        }]),
  ], [orderedStops, origin.country, origin.id, origin.name, trip.planItems]);

  useEffect(() => {
    if (!imageResolutionCandidates.length) return;
    const scope = createAbortableEffectScope("Overview place image request");
    const resolveImages = async () => {
      try {
        const entries = await Promise.all(imageResolutionCandidates.map(async (candidate) => {
          const params = new URLSearchParams({ title: candidate.name, country: candidate.country });
          if (candidate.coordinates) {
            params.set("lon", String(candidate.coordinates[0]));
            params.set("lat", String(candidate.coordinates[1]));
          }
          const response = await fetch(`/api/journey-place?${params}`, { signal: scope.signal });
          if (!response.ok) return null;
          const payload = await response.json() as { place?: { image?: string; alt?: string } | null };
          return payload.place?.image ? [candidate.id, { src: payload.place.image, alt: payload.place.alt ?? `View of ${candidate.name}` }] as const : null;
        }));
        const resolved = entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
        if (resolved.length) scope.commit(() => setResolvedPlaceImages((current) => ({ ...current, ...Object.fromEntries(resolved) })));
      } catch (error) {
        if (scope.isCancellation(error)) return;
        // The established local/persisted-image fallback remains truthful.
      }
    };
    void resolveImages();
    return scope.dispose;
  }, [imageResolutionCandidates]);

  const openTravellerDetails = () => {
    setTravellerDetailsOpen(true);
    window.requestAnimationFrame(() => document.getElementById("overview-traveller-details")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const progressAction = (category: OverviewReadinessCategory): ReadinessTileAction | null => {
    if (category.id === "itinerary") return { href: `/journey/${encodeURIComponent(trip.id)}/itinerary`, label: "Open itinerary" };
    if (category.id === "accommodation" && !accommodation.stops.length) return null;
    if (category.id === "accommodation") return {
      href: mapWorkspaceHref(trip.id, accommodation.stops.find((stop) => !stayBookingForStop(trip, stop))?.id, "stay"),
      label: "View stays",
    };
    if (category.id === "transport") return { href: mapWorkspaceHref(trip.id), label: "Review transport" };
    return null;
  };

  return (
    <section className={styles.overview} aria-label="Trip overview">
      <div className={styles.grid}>
        <section ref={nextOrientationTarget} className={styles.routeCard} aria-labelledby="overview-route-title">
          <div className={styles.routeIntro}>
            <div>
              <p>Your route</p>
              <h2 id="overview-route-title">Your route is ready to shape</h2>
              <span>Here’s your trip at a glance. Review the route, check the timing and start planning your days.</span>
            </div>
            <div className={styles.routeActions}>
              <EasyTLinkButton href={primaryAction.href} size="small">{primaryAction.label}<ArrowRight aria-hidden="true" /></EasyTLinkButton>
              <EasyTLinkButton href={`/journey/${encodeURIComponent(trip.id)}/map`} size="small" variant="secondary" icon={Map}>Explore on map</EasyTLinkButton>
              <EasyTLinkButton href={tripBuilderHref(trip.id, trip.ownerId)} size="small" variant="quiet" icon={SlidersHorizontal}>Adjust route</EasyTLinkButton>
            </div>
          </div>
          <div className={styles.routeComposition}>
            <div className={styles.routeJourney}>
              {orderedStops.length ? <ol className={styles.routeList} aria-label={`Trip route from ${trip.brief.origin}${journeyEnd ? ` to ${journeyEnd.name}` : ""}`} tabIndex={0}>
                {[
                  { id: origin.id, name: origin.name, image: resolvedPlaceImages[origin.id], meta: "Journey origin", href: `/journey/${encodeURIComponent(trip.id)}/map`, transfer: conciseTransferLabel(trip.legs.find((item) => item.classification === "arrival" || item.fromEndpoint?.kind === "origin")) },
                  ...orderedStops.map((stop, index) => {
                    const next = orderedStops[index + 1];
                    const leg = next
                      ? trip.legs.find((item) => item.fromStopId === stop.id && item.toStopId === next.id)
                      : journeyEnd ? trip.legs.find((item) => item.fromStopId === stop.id && item.toStopId === journeyEnd.id) : null;
                    return { id: stop.id, name: stop.name, image: stopImage(trip, stop, index) ?? resolvedPlaceImages[stop.id], meta: `${formatTripNights(stop.nights)}${journeyEndIsLastStop && index === orderedStops.length - 1 ? " · Journey end" : ""}`, href: itineraryWorkspaceHref(trip.id, firstItineraryDayForStop(trip, stop.id)), transfer: conciseTransferLabel(leg) };
                  }),
                  ...(journeyEnd && !journeyEndIsLastStop ? [{ id: journeyEnd.id, name: journeyEnd.name, image: resolvedPlaceImages[journeyEnd.id], meta: "Journey end", href: `/journey/${encodeURIComponent(trip.id)}/map`, transfer: null }] : []),
                ].map((step, index, steps) => <li key={step.id} className={styles.routeStep}>
                  <Link className={styles.routeStopLink} href={step.href}><article>
                    <div className={styles.stopNumber}>{index + 1}</div>
                    <ResilientImage src={step.image?.src} alt={step.image?.alt ?? ""} fallback={<div className={styles.stopFallback}><MapPin aria-hidden="true" /></div>} />
                    <div className={styles.stopOverlay}><h3>{step.name}</h3><span>{step.meta}</span></div>
                  </article></Link>
                  {step.transfer ? <div className={styles.transfer}><ArrowRight aria-hidden="true" /><span>{step.transfer}</span></div> : <div className={styles.transferSpacer} aria-hidden="true" />}
                  {index < steps.length - 1 ? <ChevronRight className={styles.routeDirection} aria-hidden="true" /> : null}
                </li>)}
              </ol> : <div className={styles.emptyRoute}><MapPin aria-hidden="true" /><p>Add a destination to start shaping this trip.</p></div>}
              {routeRationale ? <aside className={styles.routeRationale} aria-labelledby="overview-route-rationale-title"><Sparkles aria-hidden="true" /><div><p id="overview-route-rationale-title">Why this order</p><span>{routeRationaleCopy(routeRationale)}</span></div><EasyTLinkButton href={`/journey/${encodeURIComponent(trip.id)}/itinerary`} size="small" variant="quiet">View detailed itinerary<ChevronRight aria-hidden="true" /></EasyTLinkButton></aside> : null}
            </div>
            {overviewMapStops.filter((stop) => stop.coordinates).length > 1 ? <aside className={styles.routeMapPreview} aria-label="Whole-trip map preview">
              <JourneyPlannerMap stops={overviewMapStops} legs={overviewMapLegs} selectedId="" plannerPins={[]} focusCoordinates={null} draftPinCoordinates={null} pinPlacementMode={false} overviewMode previewMode overviewPadding={{ top: 34, right: 34, bottom: 34, left: 34 }} onMapPinDrop={() => undefined} onPlannerPinSelect={() => undefined} onSelect={() => undefined} />
              <EasyTLinkButton className={styles.routeMapAction} href={`/journey/${encodeURIComponent(trip.id)}/map`} size="small" variant="secondary">View full map<Maximize2 aria-hidden="true" /></EasyTLinkButton>
            </aside> : null}
          </div>
          {visibleIssues.length ? <ul className={styles.routeIssues} aria-label="Route and timing checks">{visibleIssues.map((issue) => <li key={issue.id} className={issue.severity === "critical" ? styles.issueCritical : issue.severity === "info" ? styles.issueInfo : undefined}><CircleAlert aria-hidden="true" /><span>{issue.message}</span><Link href={issue.href}>{issue.actionLabel}<ChevronRight aria-hidden="true" /></Link></li>)}</ul> : null}
        </section>

        <section ref={progressOrientationTarget} className={styles.arrangeCard} aria-labelledby="overview-progress-title">
          <div className={styles.sectionHeading}>
            <div><p>Next to arrange</p><h2 id="overview-progress-title">Keep building your trip</h2><span className={styles.sectionDetail}>A few key things to sort next. You’re making useful progress.</span></div>
          </div>
          <div className={styles.arrangeGrid}>
            {planningCategories.map((category) => {
              const tileAction = progressAction(category);
              return <ArrangeItem
                key={category.id}
                icon={progressIconByCategory[category.id]}
                label={category.label}
                detail={category.detail}
                status={category.status}
                action={tileAction}
              />;
            })}
          </div>
        </section>

        <TripExplicitPlans trip={trip} variant="overview" />

        <section className={styles.beforeGo} id="before-you-go" aria-labelledby="overview-before-go-title">
          <details className={styles.beforeGoDisclosure} open={beforeGoOpen} onToggle={(event) => setBeforeGoOpen(event.currentTarget.open)}>
            <summary>
              <div className={styles.beforeGoHeading}><p>Before you go</p><h2 id="overview-before-go-title">Get ready for a smoother trip</h2><span className={styles.sectionDetail}>Practical details stay quiet until you’re ready for them.</span></div>
              <div className={styles.beforeGoCounts}>
                <span className={styles.mustCount}>{mustTasks.length} must do</span>
                <span>{goodTasks.length} good to do</span>
                <ChevronDown aria-hidden="true" />
              </div>
            </summary>
            <div className={styles.beforeGoContent}>
              {prepProviderStatus !== "available" ? <div className={styles.beforeGoStatus}>
                {prepProviderStatus === "unavailable"
                  ? <MorroviaSectionStatus state="error" title="Some guidance is unavailable" detail="Your saved trip is unchanged. Retry before relying on the provider-backed task list." onRetry={prepReadiness.retryProviders} />
                  : <MorroviaSectionStatus title="Checking practical tasks" detail="Your saved trip tasks remain visible while current guidance loads." />}
              </div> : null}
              {mustTasks.length || goodTasks.length ? <div className={styles.beforeGoGrid}>
                <TripPreparationTaskSection id="overview-must" title="Must do" icon={Sparkles} tasks={mustTasks} tripId={trip.id} onOpenTravellerDetails={openTravellerDetails} />
                <TripPreparationTaskSection id="overview-good" title="Good to do" icon={HeartPulse} tasks={goodTasks} tripId={trip.id} onOpenTravellerDetails={openTravellerDetails} showPartnerPromotion promotionNow={now ? new Date(now) : undefined} />
              </div> : <div className={styles.beforeGoEmpty}><CheckCircle2 aria-hidden="true" /><div><strong>No outstanding practical tasks</strong><span>Keep official guidance and booking details checked before departure.</span></div></div>}
              {travellerDetailsOpen ? <div id="overview-traveller-details"><TripTravellerDetailsEditor ownerId={trip.ownerId} profile={prepReadiness.profile} onClose={() => setTravellerDetailsOpen(false)} onSave={prepReadiness.setProfile} /></div> : null}
            </div>
          </details>
        </section>
      </div>
    </section>
  );
}

const progressStatusLabel: Record<OverviewReadinessCategory["status"], string> = {
  complete: "Ready",
  "in-progress": "Started",
  "to-do": "To do",
  "needs-review": "Needs review",
};

function ArrangeItem({ icon: Icon, label, detail, status, action }: {
  icon: LucideIcon;
  label: string;
  detail: string;
  status: OverviewReadinessCategory["status"];
  action: ReadinessTileAction | null;
}) {
  const className = `${styles.arrangeItem} ${action ? styles.arrangeItemInteractive : ""}`;
  const content = <>
    <div className={styles.arrangeIcon}><Icon aria-hidden="true" /></div>
    <div className={styles.arrangeCopy}>
      <div className={styles.arrangeTitle}><h3>{label}</h3><small className={`${styles.progressStatus} ${styles[`progressStatus-${status}`]}`}>{progressStatusLabel[status]}</small></div>
      <span>{detail}</span>
      {action ? <strong>{action.label}<ArrowRight aria-hidden="true" /></strong> : null}
    </div>
    {action ? <ChevronRight className={styles.arrangeChevron} aria-hidden="true" /> : null}
  </>;

  if (!action) return <article className={className}>{content}</article>;
  return <Link className={className} href={action.href} aria-label={`${action.label}: ${label}`}>{content}</Link>;
}
