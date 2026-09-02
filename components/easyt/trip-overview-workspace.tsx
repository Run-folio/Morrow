"use client";

import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  CalendarCheck2,
  CarFront,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  HeartPulse,
  MapPin,
  Maximize2,
  Route,
  ShieldCheck,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { accommodationProgress, stayBookingForStop } from "@/lib/easyt/accommodation";
import { itineraryImageFor } from "@/lib/easyt/itinerary-media";
import { tripHealth, tripHealthSummary } from "@/lib/easyt/review";
import { deriveItineraryCoverage, deriveTripDateFacts, formatTripDuration, formatTripNights, stableStopDateRange } from "@/lib/easyt/trip-facts";
import { getBookingAction, omioBookingActionForLeg } from "@/lib/easyt/booking-readiness";
import { trackEvent } from "@/lib/analytics";
import type { EasyTTrip, TripRecommendation, TripStop } from "@/lib/easyt/trip";
import ResilientImage from "./resilient-image";
import {
  firstItineraryDayForStop,
  itineraryDayForRecommendation,
  itineraryWorkspaceHref,
  mapWorkspaceHref,
} from "@/lib/easyt/trip-workspace-links";
import styles from "./trip-overview-workspace.module.css";
import { endEndpointForTrip, originEndpointForTrip } from "@/lib/easyt/trip-legs";
import { mapRouteLegsFromTrip } from "@/lib/easyt/map-spatial-context";
import type { JourneyStop } from "@/lib/journey";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import { createAbortableEffectScope } from "@/lib/easyt/abortable-effect";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import { affiliateDisclosure } from "./affiliate-link";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import { TripPreparationTaskSection, TripTravellerDetailsEditor } from "./trip-preparation";
import { useTripPrepReadiness, type TripPrepProviderStatus } from "./use-trip-prep-readiness";
import { deriveOverviewReadinessCategories, type OverviewReadinessCategory, type OverviewReadinessCategoryId } from "@/lib/easyt/trip-overview-readiness";
import type { BookingReadinessAction } from "@/lib/easyt/booking-readiness";
import type { ReadinessCard, TravelReadinessProfile } from "@/lib/easyt/travel-readiness";
import { groupTripPrepTasks } from "@/lib/easyt/trip-prep";
import { useWorkspaceOrientationReady, useWorkspaceOrientationTarget } from "./workspace-orientation";
import { sameJourneyPlace } from "@/lib/easyt/journey-endpoints";
import { MorroviaPartnerPromotion } from "./partner-promotion";

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

type OverviewStayResult = {
  id: string;
  name: string;
  address: string;
  rating?: number;
  price?: { total: number; currency: string };
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
};

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
    title: prep.length ? "Finish the remaining practical tasks" : "Review the practical details",
    detail: prep.length
      ? `${prep.filter((item) => item.complete).length} of ${prep.length} saved practical tasks are complete.`
      : "Check entry guidance, documents and the practical details before departure.",
    label: "Review tasks",
    href: "#before-you-go",
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
    detail: "The route, itinerary, stays and saved practical checklist are covered.",
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

function representativeStayFromPayload(value: unknown): OverviewStayResult | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { properties?: unknown }).properties)) return null;
  const candidate = (value as { properties: unknown[] }).properties[0];
  if (!candidate || typeof candidate !== "object") return null;
  const property = candidate as Record<string, unknown>;
  if (typeof property.id !== "string" || !property.id.startsWith("booking-") || typeof property.name !== "string" || !property.name.trim() || typeof property.address !== "string") return null;
  const rating = typeof property.rating === "number" && Number.isFinite(property.rating) ? property.rating : undefined;
  const rawPrice = property.price && typeof property.price === "object" ? property.price as Record<string, unknown> : null;
  const price = rawPrice && typeof rawPrice.total === "number" && Number.isFinite(rawPrice.total) && typeof rawPrice.currency === "string" && rawPrice.currency.trim()
    ? { total: rawPrice.total, currency: rawPrice.currency }
    : undefined;
  return { id: property.id, name: property.name.trim(), address: property.address.trim(), ...(rating !== undefined ? { rating } : {}), ...(price ? { price } : {}) };
}

export default function TripOverviewWorkspace({
  trip,
  initialPrepActions,
  initialPrepReadinessCards,
  initialPrepProfile,
  initialPrepProviderStatus,
  now,
}: TripOverviewWorkspaceProps) {
  const [travellerDetailsOpen, setTravellerDetailsOpen] = useState(false);
  const [representativeStay, setRepresentativeStay] = useState<OverviewStayResult | null>(null);
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
  const action = overviewActionForTrip(trip);
  const issues = issueSummary(trip);
  const visibleIssues = issues.slice(0, 2);
  const healthSummary = tripHealthSummary(trip);
  const health = healthSummary.health;
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
  const outstandingPrepGroups = useMemo(
    () => groupTripPrepTasks(prepReadiness.tasks.filter((task) => task.status !== "complete")),
    [prepReadiness.tasks],
  );
  const mustTasks = outstandingPrepGroups.must;
  const goodTasks = [...outstandingPrepGroups.good, ...outstandingPrepGroups.nice];
  const orderedStops = useMemo(() => [...trip.stops].sort((left, right) => left.order - right.order), [trip.stops]);
  const routeAssessment = trip.brief.routeAssessment?.route;
  const routeRationale = routeAssessment && routeAssessment.state !== "insufficient-data" ? routeAssessment : null;
  const actionImageStop = action.kind === "stay" ? orderedStops.find((stop) => stop.id === action.stopId) : orderedStops[0];
  const actionImage = actionImageStop ? stopImage(trip, actionImageStop, orderedStops.indexOf(actionImageStop)) ?? resolvedPlaceImages[actionImageStop.id] : null;
  const staySearchDates = action.kind === "stay" && actionImageStop ? stableStopDateRange(actionImageStop, trip) : null;
  const tripDates = deriveTripDateFacts(trip);
  const routeCountries = [...new Set(orderedStops.map((stop) => stop.country?.trim()).filter((country): country is string => Boolean(country)))];
  const routeHeading = tripDates.durationDays
    ? `${tripDates.durationDays} ${tripDates.durationDays === 1 ? "day" : "days"}, ${orderedStops.length} ${orderedStops.length === 1 ? "stop" : "stops"}${routeCountries.length === 1 ? ` across ${routeCountries[0]}` : ""}`
    : `${orderedStops.length} ${orderedStops.length === 1 ? "stop" : "stops"}, one connected trip`;
  const routeEnd = orderedStops.at(-1)?.name;
  const routeDetail = routeEnd
    ? `${trip.brief.origin} to ${routeEnd} · ${trip.legs.length} ${trip.legs.length === 1 ? "transfer" : "transfers"}`
    : `${trip.legs.length} ${trip.legs.length === 1 ? "transfer" : "transfers"}`;
  const ActionIcon = action.kind === "stay" ? BedDouble
    : action.kind === "itinerary" ? CalendarCheck2
        : action.kind === "prep" ? ShieldCheck
          : action.kind === "ready" ? CheckCircle2
            : Route;
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
    { id: origin.id, name: origin.name, country: origin.country ?? "" },
    ...orderedStops.flatMap((stop, index) => stopImage(trip, stop, index)
      ? []
      : [{ id: stop.id, name: stop.name, country: stop.country }]),
  ], [orderedStops, origin.country, origin.id, origin.name, trip.planItems]);

  useEffect(() => {
    if (!imageResolutionCandidates.length) return;
    const scope = createAbortableEffectScope("Overview place image request");
    const resolveImages = async () => {
      try {
        const entries = await Promise.all(imageResolutionCandidates.map(async (candidate) => {
          const response = await fetch(`/api/journey-place?title=${encodeURIComponent(candidate.name)}&country=${encodeURIComponent(candidate.country)}`, { signal: scope.signal });
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

  useEffect(() => {
    const stop = action.kind === "stay" ? actionImageStop : undefined;
    const dateRange = staySearchDates;
    if (!stop || !dateRange || typeof stop.latitude !== "number" || typeof stop.longitude !== "number") {
      setRepresentativeStay(null);
      return;
    }
    const scope = createAbortableEffectScope("Overview representative stay request");
    const params = new URLSearchParams({
      lat: String(stop.latitude),
      lon: String(stop.longitude),
      checkIn: dateRange.checkIn,
      checkOut: dateRange.checkOut,
      adults: String(Math.max(1, trip.travellers)),
      rooms: "1",
      currency: trip.currency,
      locale: "en",
    });
    setRepresentativeStay(null);
    const resolveStay = async () => {
      try {
        const response = await fetch(`/api/journey-accommodation-search?${params}`, { signal: scope.signal });
        const result = response.ok ? representativeStayFromPayload(await response.json()) : null;
        scope.commit(() => setRepresentativeStay(result));
      } catch (error) {
        if (!scope.isCancellation(error)) scope.commit(() => setRepresentativeStay(null));
      }
    };
    void resolveStay();
    return scope.dispose;
  }, [action.kind, actionImageStop?.id, actionImageStop?.latitude, actionImageStop?.longitude, staySearchDates?.checkIn, staySearchDates?.checkOut, trip.currency, trip.travellers]);

  const openTravellerDetails = () => {
    setTravellerDetailsOpen(true);
    window.requestAnimationFrame(() => document.getElementById("overview-traveller-details")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const progressLink = (category: OverviewReadinessCategory) => {
    if (category.id === "itinerary") return { href: `/journey/${encodeURIComponent(trip.id)}/itinerary`, label: "Open itinerary" };
    if (category.id === "accommodation") return {
      href: mapWorkspaceHref(trip.id, accommodation.stops.find((stop) => !stayBookingForStop(trip, stop))?.id, "stay"),
      label: "Review stays",
    };
    if (category.id === "transport") return { href: mapWorkspaceHref(trip.id), label: "Review route" };
    return null;
  };

  return (
    <section className={styles.overview} aria-label="Trip overview">
      <div className={styles.grid}>
        <article ref={nextOrientationTarget} className={`${styles.nextAction} ${action.kind === "stay" && !representativeStay ? styles.nextActionFallback : ""}`}>
          <div className={styles.nextCopy}>
            <div className={styles.nextEyebrow}><span className={styles.actionIcon}><ActionIcon aria-hidden="true" /></span><p>Your next step</p></div>
            <h2>{action.title}</h2>
            <span>{action.detail}</span>
            <div className={styles.nextActions}>
              {action.external ? <a className={styles.primaryAction} href={action.href} target="_blank" rel="sponsored noopener noreferrer" aria-label={action.provider === "omio" ? `${action.label}, opens Omio in a new tab` : action.provider === "trip.com" ? `${action.label}, opens Trip.com in a new tab` : undefined} onClick={() => { if (action.provider === "omio") trackEvent("affiliate_link_clicked", { partner: "omio", placement: "overview_next_action", tripId: trip.id, transferId: action.transferId, originStopId: action.originStopId, destinationStopId: action.destinationStopId }); else if (action.affiliate && action.provider && action.affiliateCategory) trackEvent("affiliate_click", { category: action.affiliateCategory, provider: action.provider, trip_id: trip.id, stop_id: action.stopId, placement: "overview_next_action", workspace_view: "overview" }); }}>{action.label}<ExternalLink aria-hidden="true" /></a> : <EasyTLinkButton href={action.href} size="small">{action.label}<ChevronRight aria-hidden="true" /></EasyTLinkButton>}
              {action.kind === "stay" && action.stopId && action.external ? <EasyTLinkButton href={mapWorkspaceHref(trip.id, action.stopId, "stay")} size="small" variant="secondary">Explore stays on map</EasyTLinkButton> : null}
            </div>
            {action.affiliate ? <small className={styles.affiliateDisclosure}>{affiliateDisclosure}</small> : null}
            <MorroviaPartnerPromotion action={action} now={now ? new Date(now) : undefined} />
          </div>
          <div className={styles.nextVisual} aria-live="polite">
            {actionImage ? <ResilientImage src={actionImage.src} alt={actionImage.alt} fallback={null} /> : null}
            {representativeStay ? <div className={styles.stayResult}>
              <p>Available for your selected dates</p>
              <h3>{representativeStay.name}</h3>
              {representativeStay.address ? <span><MapPin aria-hidden="true" />{representativeStay.address}</span> : null}
              {representativeStay.rating !== undefined || representativeStay.price ? <small>{[representativeStay.rating !== undefined ? `${representativeStay.rating.toFixed(1)} rating` : null, representativeStay.price ? `${representativeStay.price.currency} ${representativeStay.price.total.toFixed(0)} total` : null].filter(Boolean).join(" · ")}</small> : null}
            </div> : action.kind === "stay" && actionImageStop ? <div className={styles.stayFallback}><BedDouble aria-hidden="true" /><div><strong>Explore stays around {actionImageStop.name}</strong><span>Review stay results in the Map workspace or open a separate Trip.com search.</span></div></div> : !actionImage ? <Sparkles className={styles.nextFallback} aria-hidden="true" /> : null}
          </div>
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
          {visibleIssues.length ? <ul>{visibleIssues.map((issue) => <li key={issue.id} className={issue.severity === "critical" ? styles.issueCritical : undefined}><Link href={issue.href}><CircleAlert aria-hidden="true" /><span>{issue.message}</span><ChevronRight aria-hidden="true" /></Link></li>)}</ul> : <div className={styles.clearHealth}><ShieldCheck aria-hidden="true" />Keep live timings and entry guidance checked before booking.</div>}
          {issues.length > visibleIssues.length ? <span className={styles.healthIssueCount}>Showing the {visibleIssues.length} highest-priority of {issues.length} checks.</span> : null}
          <EasyTLinkButton className={styles.healthAction} href={issues[0]?.href ?? routeIssueHref(trip.id)} size="small" variant="secondary" fullWidth>{issues.length ? "Start review" : "Review trip"}<ChevronRight aria-hidden="true" /></EasyTLinkButton>
        </article>

        <section ref={progressOrientationTarget} className={styles.progressCard} aria-labelledby="overview-progress-title">
          <div className={styles.sectionHeading}>
            <div><p>Readiness at a glance</p><h2 id="overview-progress-title">Planning progress</h2></div>
          </div>
          <div className={styles.progressGrid}>
            {readinessCategories.map((category) => {
              const link = progressLink(category);
              return <ProgressItem
                key={category.id}
                icon={progressIconByCategory[category.id]}
                label={category.label}
                detail={category.detail}
                percent={category.percent}
                status={category.status}
                href={link?.href}
                actionLabel={link?.label}
              />;
            })}
          </div>
        </section>

        <section className={styles.beforeGo} id="before-you-go" aria-labelledby="overview-before-go-title">
          <div className={styles.sectionHeading}>
            <div><p>Before you go</p><h2 id="overview-before-go-title">Practical tasks for this trip</h2><span className={styles.sectionDetail}>Prioritised from your saved trip, booking state and current travel guidance.</span></div>
          </div>
          {prepProviderStatus !== "available" ? <div className={styles.beforeGoStatus}>
            {prepProviderStatus === "unavailable"
              ? <MorroviaSectionStatus state="error" title="Some guidance is unavailable" detail="Your saved trip is unchanged. Retry before relying on the provider-backed task list." onRetry={prepReadiness.retryProviders} />
              : <MorroviaSectionStatus title="Checking practical tasks" detail="Your saved trip tasks remain visible while current guidance loads." />}
          </div> : null}
          {mustTasks.length || goodTasks.length ? <div className={styles.beforeGoGrid}>
            <TripPreparationTaskSection id="overview-must" title="Must do" icon={Sparkles} tasks={mustTasks} tripId={trip.id} onOpenTravellerDetails={openTravellerDetails} />
            <TripPreparationTaskSection id="overview-good" title="Good to do" icon={HeartPulse} tasks={goodTasks} tripId={trip.id} onOpenTravellerDetails={openTravellerDetails} />
          </div> : <div className={styles.beforeGoEmpty}><CheckCircle2 aria-hidden="true" /><div><strong>No outstanding practical tasks</strong><span>Keep official guidance and booking details checked before departure.</span></div></div>}
          {travellerDetailsOpen ? <div id="overview-traveller-details"><TripTravellerDetailsEditor ownerId={trip.ownerId} profile={prepReadiness.profile} onClose={() => setTravellerDetailsOpen(false)} onSave={prepReadiness.setProfile} /></div> : null}
        </section>

        <section className={styles.routeCard} aria-labelledby="overview-route-title">
          <div className={styles.sectionHeading}>
            <div><p>Your route</p><h2 id="overview-route-title">{routeHeading}</h2><span className={styles.sectionDetail}>{routeDetail}</span></div>
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
              {routeRationale ? <aside className={styles.routeRationale} aria-labelledby="overview-route-rationale-title"><Sparkles aria-hidden="true" /><div><p id="overview-route-rationale-title">Why this order</p><span>{routeRationale.reasons[0] ?? routeRationale.summary}</span></div><EasyTLinkButton href={`/journey/${encodeURIComponent(trip.id)}/itinerary`} size="small" variant="quiet">View detailed itinerary<ChevronRight aria-hidden="true" /></EasyTLinkButton></aside> : null}
            </div>
            {overviewMapStops.filter((stop) => stop.coordinates).length > 1 ? <aside className={styles.routeMapPreview} aria-label="Whole-trip map preview">
              <JourneyPlannerMap stops={overviewMapStops} legs={overviewMapLegs} selectedId="" plannerPins={[]} focusCoordinates={null} draftPinCoordinates={null} pinPlacementMode={false} overviewMode previewMode overviewPadding={{ top: 34, right: 34, bottom: 34, left: 34 }} onMapPinDrop={() => undefined} onPlannerPinSelect={() => undefined} onSelect={() => undefined} />
              <EasyTLinkButton className={styles.routeMapAction} href={`/journey/${encodeURIComponent(trip.id)}/map`} size="small" variant="secondary">View full map<Maximize2 aria-hidden="true" /></EasyTLinkButton>
            </aside> : null}
          </div>
        </section>
      </div>
    </section>
  );
}

const progressStatusLabel: Record<OverviewReadinessCategory["status"], string> = {
  complete: "Complete",
  "in-progress": "In progress",
  "to-do": "To do",
  "needs-review": "Needs review",
};

function ProgressItem({ icon: Icon, label, detail, percent, status, href, actionLabel }: {
  icon: LucideIcon;
  label: string;
  detail: string;
  percent: number | null;
  status: OverviewReadinessCategory["status"];
  href?: string;
  actionLabel?: string;
}) {
  return <article className={styles.progressItem}>
    <div className={styles.progressSummary}><Icon aria-hidden="true" /><div><h3>{label}</h3><span>{detail}</span></div></div>
    {percent !== null ? <div className={styles.progressTrack} aria-label={`${label}: ${percent}%`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div> : <div className={styles.progressTrackPlaceholder} aria-hidden="true" />}
    <div className={styles.progressFooter}>
      <small className={`${styles.progressStatus} ${styles[`progressStatus-${status}`]}`}>{progressStatusLabel[status]}</small>
      {href && actionLabel && status !== "complete" ? <EasyTLinkButton className={styles.progressAction} href={href} size="small" variant="quiet" aria-label={`${actionLabel}: ${label}`}>{actionLabel}<ChevronRight aria-hidden="true" /></EasyTLinkButton> : null}
    </div>
  </article>;
}
