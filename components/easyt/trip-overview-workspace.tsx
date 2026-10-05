"use client";

import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  CalendarCheck2,
  CarFront,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  MapPin,
  ShieldCheck,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { accommodationProgress, stayBookingForStop } from "@/lib/easyt/accommodation";
import { tripHealth } from "@/lib/easyt/review";
import { formatTripDuration, formatTripNights } from "@/lib/easyt/trip-facts";
import type { EasyTTrip } from "@/lib/easyt/trip";
import ResilientImage from "./resilient-image";
import {
  firstItineraryDayForStop,
  itineraryWorkspaceHref,
  stayWorkspaceHref,
  mapWorkspaceHref,
  transportWorkspaceHref,
  tripBuilderHref,
  tripWorkspaceHref,
} from "@/lib/easyt/trip-workspace-links";
import styles from "./trip-overview-workspace.module.css";
import { canonicalLegIntegrityIssues, endEndpointForTrip, originEndpointForTrip, tripRouteDisplayEndpoints } from "@/lib/easyt/trip-legs";
import { mapRouteLegsFromTrip } from "@/lib/easyt/map-spatial-context";
import type { JourneyStop } from "@/lib/journey";
import { MorroviaMapPreview } from "./morrovia-map-preview";
import { DeferredJourneyPlannerMap } from "./deferred-journey-planner-map";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import { MorroviaStatusBanner } from "./morrovia-feedback";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import { TripPreparationCards, TripTravellerDetailsEditor } from "./trip-preparation";
import { useTripPrepReadiness, type TripPrepProviderStatus } from "./use-trip-prep-readiness";
import { deriveOverviewReadinessCategories, overviewPlanningCardText, type OverviewReadinessCategory, type OverviewReadinessCategoryId } from "@/lib/easyt/trip-overview-readiness";
import type { BookingReadinessAction } from "@/lib/easyt/booking-readiness";
import type { ReadinessCard, TravelReadinessProfile } from "@/lib/easyt/travel-readiness";
import { deriveOverviewPracticalTasks, setOverviewPrepChoice } from "@/lib/easyt/trip-prep";
import { languageFromStorage, EASYT_LANGUAGE_CHANGE_EVENT } from "@/lib/easyt/i18n";
import { presentOverviewIssues, presentOverviewRouteInsight } from "@/lib/easyt/trip-overview-issues";
import { useWorkspaceOrientationReady, useWorkspaceOrientationTarget } from "./workspace-orientation";
import { sameJourneyPlace } from "@/lib/easyt/journey-endpoints";
import { personalRouteHref } from "@/lib/easyt/personal-route";
import TripExplicitPlans from "./trip-explicit-plans";
import { overviewPlaceImage, overviewStopImage, type OverviewPlaceImage } from "@/lib/easyt/trip-overview-imagery";
import { canonicalPlacePhotoCacheKey, resolveRoutePhotoCandidates, type RoutePhotoCandidate } from "@/lib/easyt/route-photo-cache";
import MorroviaPhotoCredit from "./morrovia-photo-credit";
import { useTripShellMutation } from "./trip-shell-client";
import { ContextualFeedbackSlot } from "./contextual-feedback-controller";
import {
  dismissUnresolvedPlaceIntent,
  recommendationIsRepresentedByUnresolvedPlaceIntent,
  unresolvedPlaceIntentsForTrip,
} from "@/lib/easyt/unresolved-place-intent";

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
  language?: "en" | "es";
};

type ReadinessTileAction = { href: string; label: string };

function routeIssueHref(tripId: string) {
  return mapWorkspaceHref(tripId, null, "plan", null, null, null, tripWorkspaceHref(tripId));
}

function routeRationaleCopy(route: NonNullable<EasyTTrip["brief"]["routeAssessment"]>["route"]) {
  return route.reasons.find((reason) => !/entered order ranks first under (?:the )?current route criteria/i.test(reason))
    ?? route.summary;
}

function openHealthIssues(trip: EasyTTrip) {
  return tripHealth(trip).issues
    .filter((issue) => issue.status === "open")
    .sort((left, right) => ({ critical: 0, warning: 1, info: 2 }[left.severity] - { critical: 0, warning: 1, info: 2 }[right.severity]));
}

function conciseTransferLabel(leg: EasyTTrip["legs"][number] | null | undefined) {
  if (!leg) return null;
  const minutes = leg.doorToDoorMinutes ?? leg.durationMinutes;
  if (!minutes) return "Transfer to confirm";
  const duration = formatTripDuration(minutes);
  return leg.mode === "flight" ? `${duration} by air` : `${duration} transfer`;
}

export function OverviewStepMedia({ image, name, meta, number, href }: { image: OverviewPlaceImage | null; name: string; meta: string; number: number; href: string }) {
  const [imageDisplayed, setImageDisplayed] = useState(false);
  return <article>
      <div className={styles.stopNumber}>{number}</div>
      <div className={styles.stopPhoto}>
        <Link href={href} className={styles.stopImageLink} aria-label={`${name} · ${meta}`}>
          <ResilientImage src={image?.src} alt={image?.alt ?? ""} onDisplayState={setImageDisplayed} fallback={<div className={styles.stopFallback}><MapPin aria-hidden="true" /></div>} />
        </Link>
        {image?.sourceLabel && imageDisplayed ? <MorroviaPhotoCredit size="compact" ownership={image.provenance === "reviewed-morrovia-first-party" ? "morrovia" : "unknown"} placement="bottom-right" credit={image.sourceLabel} photoLabel={image.alt} authorLabel={image.author} authorHref={image.authorUrl} sourceLabel={image.sourceUrl ? "Source" : undefined} sourceHref={image.sourceUrl} licenseLabel={image.license} licenseHref={image.licenseUrl} fullCreditHref={image.fullCreditUrl} /> : null}
      </div>
      <Link href={href} className={styles.stopOverlay}><h3>{name}</h3><span>{meta}</span></Link>
    </article>;
}

export default function TripOverviewWorkspace({
  trip,
  firstArrival = false,
  initialPrepActions,
  initialPrepReadinessCards,
  initialPrepProfile,
  initialPrepProviderStatus,
  now,
  language: suppliedLanguage,
}: TripOverviewWorkspaceProps) {
  const mutation = useTripShellMutation();
  const [travellerDetailsOpen, setTravellerDetailsOpen] = useState(false);
  const [language, setLanguage] = useState<"en" | "es">(suppliedLanguage ?? "en");
  useEffect(() => {
    if (suppliedLanguage) { setLanguage(suppliedLanguage); return; }
    const update = () => setLanguage(languageFromStorage());
    update();
    window.addEventListener(EASYT_LANGUAGE_CHANGE_EVENT, update);
    return () => window.removeEventListener(EASYT_LANGUAGE_CHANGE_EVENT, update);
  }, [suppliedLanguage]);
  const [resolvedPlaceImages, setResolvedPlaceImages] = useState<Record<string, OverviewPlaceImage>>({});
  const prepReadiness = useTripPrepReadiness({
    trip,
    language,
    initialActions: initialPrepActions,
    initialReadinessCards: initialPrepReadinessCards,
    initialProfile: initialPrepProfile,
    initialProviderStatus: initialPrepProviderStatus,
    now,
  });
  const nextOrientationTarget = useWorkspaceOrientationTarget("overview", "overview-next");
  const progressOrientationTarget = useWorkspaceOrientationTarget("overview", "overview-progress");
  useWorkspaceOrientationReady("overview", Boolean(trip.stops.length && trip.planItems.length));
  const unresolvedPlaceIntents = useMemo(() => unresolvedPlaceIntentsForTrip(trip), [trip]);
  const visibleIssues = presentOverviewIssues(
    trip,
    openHealthIssues(trip).filter((issue) => !recommendationIsRepresentedByUnresolvedPlaceIntent(issue, unresolvedPlaceIntents)),
    canonicalLegIntegrityIssues(trip),
  );
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
  const practicalTasks = deriveOverviewPracticalTasks({ trip: mutation.trip, tasks: prepReadiness.tasks, profile: prepReadiness.profile, language });
  const orderedStops = useMemo(() => [...trip.stops].sort((left, right) => left.order - right.order), [trip.stops]);
  const criticalRouteIssue = visibleIssues.find((issue) => issue.severity === "critical");
  const routeInsight = presentOverviewRouteInsight(visibleIssues);
  const routeAssessment = trip.brief.routeAssessment?.route;
  const routeRationale = routeAssessment && routeAssessment.state !== "insufficient-data" ? routeAssessment : null;
  const origin = useMemo(() => originEndpointForTrip(trip), [trip]);
  const routeDisplayEndpoints = useMemo(() => tripRouteDisplayEndpoints(trip), [trip]);
  const journeyEnd = useMemo(() => endEndpointForTrip(trip), [trip]);
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
  const initialPlaceImages = useMemo(() => {
    const images: Record<string, OverviewPlaceImage> = {};
    const originImage = overviewPlaceImage(origin);
    if (originImage) images[origin.id] = originImage;
    orderedStops.forEach((stop) => {
      const image = overviewStopImage(trip, stop);
      if (image) images[stop.id] = image;
    });
    if (journeyEnd) {
      const endImage = overviewPlaceImage(journeyEnd);
      if (endImage) images[journeyEnd.id] = endImage;
    }
    return images;
  }, [journeyEnd, orderedStops, origin, trip]);
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
  const imageCacheKeysByOccurrence = useMemo(() => Object.fromEntries([
    [origin.id, canonicalPlacePhotoCacheKey({
      name: origin.name,
      country: origin.country,
      canonicalPlaceId: origin.canonicalPlaceId,
      providerId: origin.providerId,
      coordinates: origin.coordinates,
    })],
    ...orderedStops.map((stop) => [stop.id, canonicalPlacePhotoCacheKey({
      name: stop.name,
      country: stop.country,
      canonicalPlaceId: stop.canonicalPlaceId,
      providerId: stop.providerId,
      coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] : undefined,
    })]),
    ...(journeyEnd ? [[journeyEnd.id, canonicalPlacePhotoCacheKey({
      name: journeyEnd.name,
      country: journeyEnd.country,
      canonicalPlaceId: journeyEnd.canonicalPlaceId,
      providerId: journeyEnd.providerId,
      coordinates: journeyEnd.coordinates,
    })]] : []),
  ]), [journeyEnd, orderedStops, origin]);
  const imageResolutionCandidates = useMemo(() => {
    const unresolved = [
      {
        id: origin.id,
        name: origin.name,
        country: origin.country ?? "",
        canonicalPlaceId: origin.canonicalPlaceId,
        providerId: origin.providerId,
        coordinates: origin.coordinates,
      },
      ...orderedStops.map((stop) => ({
        id: stop.id,
        name: stop.name,
        country: stop.country,
        canonicalPlaceId: stop.canonicalPlaceId,
        providerId: stop.providerId,
        coordinates: stop.longitude !== null && stop.latitude !== null
          ? [stop.longitude, stop.latitude] as [number, number]
          : undefined,
      })),
      ...(journeyEnd && !journeyEndIsLastStop ? [{
        id: journeyEnd.id,
        name: journeyEnd.name,
        country: journeyEnd.country ?? "",
        canonicalPlaceId: journeyEnd.canonicalPlaceId,
        providerId: journeyEnd.providerId,
        coordinates: journeyEnd.coordinates,
      }] : []),
    ].filter((candidate) => !initialPlaceImages[candidate.id]);
    const grouped = new globalThis.Map<string, RoutePhotoCandidate>();
    unresolved.forEach((candidate) => {
      const cacheKey = imageCacheKeysByOccurrence[candidate.id];
      const existing = grouped.get(cacheKey);
      if (existing) {
        existing.occurrenceIds.push(candidate.id);
        return;
      }
      grouped.set(cacheKey, {
        cacheKey,
        occurrenceIds: [candidate.id],
        queries: [`${candidate.name} ${candidate.country} travel`, `${candidate.name} ${candidate.country} landmark`],
      });
    });
    return [...grouped.values()];
  }, [imageCacheKeysByOccurrence, initialPlaceImages, journeyEnd, journeyEndIsLastStop, orderedStops, origin]);

  useEffect(() => {
    if (!imageResolutionCandidates.length) return;
    const controller = new AbortController();
    void resolveRoutePhotoCandidates(imageResolutionCandidates, (candidate, selection) => {
      if (selection.kind !== "photo") return;
      setResolvedPlaceImages((current) => {
        const next = { ...current };
        // A late lookup may fill an empty canonical identity, but never replaces known truth.
        if (!next[candidate.cacheKey]) next[candidate.cacheKey] = {
          src: selection.photo.src,
          alt: selection.photo.alt ?? "Destination view",
          sourceUrl: selection.photo.sourceUrl,
          sourceLabel: selection.photo.sourceLabel,
        };
        return next;
      });
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [imageResolutionCandidates, initialPlaceImages]);

  const openTravellerDetails = () => {
    setTravellerDetailsOpen(true);
    window.requestAnimationFrame(() => document.getElementById("overview-traveller-details")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const progressAction = (category: OverviewReadinessCategory): ReadinessTileAction | null => {
    if (category.id === "itinerary") return { href: itineraryWorkspaceHref(trip.id), label: language === "es" ? "Abrir itinerario" : "Open itinerary" };
    if (category.id === "accommodation") return {
      href: stayWorkspaceHref(trip.id, accommodation.stops.find((stop) => !stayBookingForStop(trip, stop))?.id),
      label: language === "es" ? "Ver alojamientos" : "View stays",
    };
    if (category.id === "transport") return { href: transportWorkspaceHref(trip.id), label: language === "es" ? "Revisar transporte" : "Review transport" };
    return null;
  };

  return (
    <section className={styles.overview} aria-label="Trip overview">
      <div className={styles.grid}>
        <section ref={nextOrientationTarget} className={styles.routeCard} aria-labelledby="overview-route-title">
          <div className={styles.routeIntro}>
            <div>
              <h2 id="overview-route-title">Your route</h2>
            </div>
          </div>
          <div className={styles.routeComposition}>
            <div className={styles.routeJourney}>
              {orderedStops.length ? <ol className={styles.routeList} aria-label={`Trip route from ${trip.brief.origin}${journeyEnd ? ` to ${journeyEnd.name}` : ""}`} tabIndex={0}>
                {[
                  ...(routeDisplayEndpoints[0]?.kind === "origin" ? [{ id: origin.id, name: origin.name, image: initialPlaceImages[origin.id] ?? resolvedPlaceImages[imageCacheKeysByOccurrence[origin.id]], meta: "Journey origin", href: routeIssueHref(trip.id), transfer: conciseTransferLabel(trip.legs.find((item) => item.classification === "arrival" || item.fromEndpoint?.kind === "origin")) }] : []),
                  ...orderedStops.map((stop, index) => {
                    const next = orderedStops[index + 1];
                    const leg = next
                      ? trip.legs.find((item) => item.fromStopId === stop.id && item.toStopId === next.id)
                      : journeyEnd ? trip.legs.find((item) => item.fromStopId === stop.id && item.toStopId === journeyEnd.id) : null;
                    return { id: stop.id, name: stop.name, image: initialPlaceImages[stop.id] ?? resolvedPlaceImages[imageCacheKeysByOccurrence[stop.id]], meta: `${formatTripNights(stop.nights)}${journeyEndIsLastStop && index === orderedStops.length - 1 ? " · Journey end" : ""}`, href: itineraryWorkspaceHref(trip.id, firstItineraryDayForStop(trip, stop.id)), transfer: conciseTransferLabel(leg) };
                  }),
                  ...(journeyEnd && !journeyEndIsLastStop ? [{ id: journeyEnd.id, name: journeyEnd.name, image: initialPlaceImages[journeyEnd.id] ?? resolvedPlaceImages[imageCacheKeysByOccurrence[journeyEnd.id]], meta: "Journey end", href: routeIssueHref(trip.id), transfer: null }] : []),
                ].map((step, index, steps) => <li key={step.id} className={styles.routeStep}>
                  <OverviewStepMedia image={step.image} name={step.name} meta={step.meta} number={index + 1} href={step.href} />
                  {step.transfer ? <div className={styles.transfer}><ArrowRight aria-hidden="true" /><span>{step.transfer}</span></div> : <div className={styles.transferSpacer} aria-hidden="true" />}
                  {index < steps.length - 1 ? <ChevronRight className={styles.routeDirection} aria-hidden="true" /> : null}
                </li>)}
              </ol> : <div className={styles.emptyRoute}><MapPin aria-hidden="true" /><p>Add a destination to start shaping this trip.</p></div>}
            {routeInsight ? <aside className={styles.routeRationale} aria-labelledby="overview-route-rationale-title" data-route-insight="">
              <Sparkles aria-hidden="true" />
              <div><p id="overview-route-rationale-title">{routeInsight.label}</p><strong>{routeInsight.title}</strong><span>{routeInsight.detail}</span></div>
              <EasyTLinkButton href={itineraryWorkspaceHref(trip.id)} size="small" variant="quiet">View detailed itinerary<ChevronRight aria-hidden="true" /></EasyTLinkButton>
            </aside> : routeRationale && !routeInsight ? <aside className={styles.routeRationale} aria-labelledby="overview-route-rationale-title">
              <Sparkles aria-hidden="true" /><div><p id="overview-route-rationale-title">Why this order</p><span>{routeRationaleCopy(routeRationale)}</span></div>
              <EasyTLinkButton href={itineraryWorkspaceHref(trip.id)} size="small" variant="quiet">View detailed itinerary<ChevronRight aria-hidden="true" /></EasyTLinkButton>
            </aside> : null}
            </div>
            {overviewMapStops.filter((stop) => stop.coordinates).length > 1 ? <MorroviaMapPreview className={styles.routeMapPreview} title="Journey map" size="large" href={mapWorkspaceHref(trip.id, null, "plan", null, null, null, tripWorkspaceHref(trip.id))}>
              <DeferredJourneyPlannerMap stops={overviewMapStops} legs={overviewMapLegs} selectedId="" plannerPins={[]} focusCoordinates={null} draftPinCoordinates={null} pinPlacementMode={false} overviewMode surface={{ variant: "preview" }} cameraSafeEdge={34} onMapPinDrop={() => undefined} onPlannerPinSelect={() => undefined} onSelect={() => undefined} />
            </MorroviaMapPreview> : null}
          </div>
          {unresolvedPlaceIntents.length ? <div className={styles.unresolvedIntentList} aria-label="Places not included in this route">
            {unresolvedPlaceIntents.map((intent) => {
              const pendingKey = `unresolved-place-dismiss-${intent.mention.mentionId}`;
              return <aside className={styles.unresolvedIntent} key={intent.mention.mentionId}>
                <MapPin aria-hidden="true" />
                <div>
                  <p>Not included yet</p>
                  <strong>{intent.mention.sourceText}</strong>
                  <span>Morrovia couldn’t confidently add this place to your route.</span>
                </div>
                <div className={styles.unresolvedIntentActions}>
                  <EasyTLinkButton
                    href={tripBuilderHref(trip.id, trip.ownerId, { placeMentionId: intent.mention.mentionId })}
                    size="small"
                    variant="secondary"
                  >{intent.issue.code === "region_requires_base" ? "Choose a nearby base" : "Resolve place"}</EasyTLinkButton>
                  <EasyTButton
                    size="small"
                    variant="quiet"
                    disabled={mutation.isPending(pendingKey)}
                    onClick={() => mutation.mutateTrip(
                      (current) => dismissUnresolvedPlaceIntent(current, intent.mention.mentionId),
                      pendingKey,
                    )}
                  >Dismiss</EasyTButton>
                </div>
              </aside>;
            })}
          </div> : null}
        </section>

        <section ref={progressOrientationTarget} className={styles.arrangeCard} aria-labelledby="overview-progress-title">
          <div className={styles.sectionHeading}>
            <div><p>{language === "es" ? "Lo próximo por organizar" : "Next to arrange"}</p><h2 id="overview-progress-title">{language === "es" ? "Sigue preparando tu viaje" : "Keep building your trip"}</h2><span className={styles.sectionDetail}>{language === "es" ? "Organiza lo esencial para disfrutar de lo que viene." : "Get the essentials in place so you can look forward to your trip."}</span></div>
          </div>
          <div className={styles.arrangeGrid}>
            {planningCategories.map((category) => {
              const text = overviewPlanningCardText(trip, category, language);
              return <ArrangeItem key={category.id} icon={progressIconByCategory[category.id]} label={text.label} detail={text.detail} status={category.status} percent={category.percent} language={language} action={progressAction(category)} />;
            })}
          </div>
        </section>

        <TripExplicitPlans trip={trip} variant="overview" />
        <ContextualFeedbackSlot workspace="overview" entryKey={`overview:${trip.id}`} hasContent={Boolean(trip.stops.length)} blocked={Boolean(travellerDetailsOpen || mutation.saveState === "saving" || mutation.saveState === "error" || prepProviderStatus !== "available" || criticalRouteIssue)} />

        <section className={styles.beforeGo} id="before-you-go" aria-labelledby="overview-before-go-title">
          <div className={styles.sectionHeading}>
            <div><p>{language === "es" ? "Antes de salir" : "Before you go"}</p><h2 id="overview-before-go-title">{language === "es" ? "Preparativos prácticos" : "Practical prep"}</h2><span className={styles.sectionDetail}>{language === "es" ? "Algunos detalles útiles que organizar antes del viaje." : "A few useful details to sort before your trip."}</span></div>
          </div>
          {prepProviderStatus !== "available" ? <div className={styles.beforeGoStatus}>
            {prepProviderStatus === "unavailable"
              ? <MorroviaStatusBanner title={language === "es" ? "Parte de la información no está disponible" : "Some guidance is unavailable"} detail={language === "es" ? "Tu viaje guardado no ha cambiado. Vuelve a intentarlo antes de usar la información de los proveedores." : "Your saved trip is unchanged. Retry before relying on the provider-backed task list."} actions={<EasyTButton size="small" variant="secondary" onClick={prepReadiness.retryProviders}>{language === "es" ? "Volver a intentar" : "Try again"}</EasyTButton>} />
              : <MorroviaSectionStatus title={language === "es" ? "Consultando los preparativos" : "Checking practical tasks"} detail={language === "es" ? "Las tareas guardadas siguen visibles mientras se carga la información actual." : "Your saved trip tasks remain visible while current guidance loads."} />}
          </div> : null}
          <TripPreparationCards tasks={practicalTasks} tripId={trip.id} language={language} onOpenTravellerDetails={openTravellerDetails}
            isPending={(kind) => mutation.isPending(`overview-prep-${kind}`)}
            onStatusChange={(kind, choice) => mutation.mutateTrip((current) => setOverviewPrepChoice(current, kind, choice), `overview-prep-${kind}`)}
          />
          {travellerDetailsOpen ? <div id="overview-traveller-details"><TripTravellerDetailsEditor ownerId={trip.ownerId} profile={prepReadiness.profile} language={language} onClose={() => setTravellerDetailsOpen(false)} onSave={prepReadiness.setProfile} /></div> : null}
        </section>
      </div>
    </section>
  );
}

function ArrangeItem({ icon: Icon, label, detail, status, percent, language, action }: {
  icon: LucideIcon;
  label: string;
  detail: string;
  status: OverviewReadinessCategory["status"];
  percent: number | null;
  language: "en" | "es";
  action: ReadinessTileAction | null;
}) {
  const progressStatusLabel = language === "es"
    ? { complete: "Organizado", "in-progress": "En marcha", "to-do": "Por hacer", "needs-review": "Por revisar" }
    : { complete: "Sorted", "in-progress": "Started", "to-do": "To do", "needs-review": "To review" };
  const className = `${styles.arrangeItem} ${action ? styles.arrangeItemInteractive : ""}`;
  const content = <>
    <div className={styles.arrangeIcon}><Icon aria-hidden="true" /></div>
    <div className={styles.arrangeCopy}>
      <div className={styles.arrangeTitle}><h3>{label}</h3><small className={`${styles.progressStatus} ${styles[`progressStatus-${status}`]}`}>{progressStatusLabel[status]}</small></div>
      <span>{detail}</span>
      {percent !== null ? <div className={styles.progressTrackRow}>
        <div className={styles.progressTrack} role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div>
        <span>{percent}%</span>
      </div> : <span className={styles.progressUnknown}>{language === "es" ? "Progreso por confirmar" : "Progress to confirm"}</span>}
    </div>
    {action ? <strong className={styles.arrangeAction}>{action.label}<ArrowRight aria-hidden="true" /></strong> : null}
  </>;
  if (!action) return <article className={className}>{content}</article>;
  return <Link className={className} href={action.href} aria-label={`${action.label}: ${label}`}>{content}</Link>;
}
