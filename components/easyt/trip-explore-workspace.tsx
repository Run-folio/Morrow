"use client";

import {
  Bookmark,
  CalendarPlus,
  Check,
  Clock3,
  Compass,
  MapPin,
  Mountain,
  Sparkles,
  Star,
  Ticket,
  Utensils,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { JourneyRouteStopTrack } from "@/components/journey-planner-strip";
import type { ActivityInventoryItem } from "@/lib/easyt/activity-inventory";
import {
  exploreCategories,
  exploreCategoryLabels,
  exploreDiscoveryRequestKey,
  exploreDestinationOptions,
  exploreOpportunityForTrip,
  exploreResultForActivity,
  exploreResultForIdea,
  exploreResultForLocalPlace,
  exploreResultForPlace,
  exploreResultsPresentation,
  exploreResultState,
  exploreScheduleTarget,
  exploreSourcePlan,
  filterExploreResults,
  projectExploreResults,
  streamExploreDiscoveryLane,
  type ExploreDiscoveryLaneSnapshot,
  type ExploreDiscoveryLaneStatus,
  type ExploreCategory,
  type ExploreLocalPlace,
  type ExploreResult,
} from "@/lib/easyt/explore";
import { createAbortableEffectScope } from "@/lib/easyt/abortable-effect";
import { recommendationDurationMs } from "@/lib/easyt/recommendation-performance";
import type { ItineraryDiscoveryPlace } from "@/lib/easyt/itinerary-day-context";
import { recommendationDetailForExploreResult } from "@/lib/easyt/recommendation-detail";
import { removeItineraryIdea, saveItineraryIdea, scheduleItineraryIdea, validIdeaDays } from "@/lib/easyt/itinerary-ideas";
import { mapWorkspaceHref, itineraryWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { mapResultHandoffForExploreResult, mapResultSelectionId, mapResultSelectionIdForIdea } from "@/lib/easyt/map-result-selection";
import { routeTimelineScopeId, routeTimelineStopsForTrip } from "@/lib/easyt/route-timeline";
import type { EasyTTrip, TripStop } from "@/lib/easyt/trip";
import { tripIntentForTrip } from "@/lib/easyt/trip";
import { affiliateDisclosure, compactAffiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton, EasyTLinkButton, EasyTSelect } from "./easyt-controls";
import ItineraryItemDetail from "./itinerary-item-detail";
import { MorroviaStatusBanner } from "./morrovia-feedback";
import { MorroviaSectionStatus, MorroviaSkeleton } from "./morrovia-loading-states";
import ResilientImage from "./resilient-image";
import { useTripShellMutation } from "./trip-shell-client";
import styles from "./trip-explore-workspace.module.css";

type ProviderState = Exclude<ExploreDiscoveryLaneStatus, "idle">;

export type TripExploreWorkspaceProps = {
  trip: EasyTTrip;
  initialResults?: ExploreResult[];
  initialDestinationId?: string;
  initialCategory?: ExploreCategory;
  initialSelectedResultId?: string;
  initialOrganicState?: ProviderState;
  initialProviderState?: ProviderState;
  requestedDayNumber?: number | null;
};

type DiscoveryPayload = { places?: ItineraryDiscoveryPlace[]; unavailable?: boolean };
type LocalPayload = { places?: ExploreLocalPlace[]; unavailable?: boolean };
type ActivityPayload = { activities?: ActivityInventoryItem[] };

const categoryIcons: Record<ExploreCategory, typeof Sparkles> = {
  "for-you": Sparkles,
  "must-see": Star,
  food: Utensils,
  tours: Ticket,
  "day-trips": Compass,
  outdoors: Mountain,
};

function titleCase(value: string) {
  return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}

function providerRequestBody(trip: EasyTTrip, stop: TripStop) {
  const mention = trip.brief.structuredBrief?.placeMentions?.find((item) => item.canonicalPlaceId === stop.canonicalPlaceId);
  return {
    destination: {
      canonicalPlaceId: stop.canonicalPlaceId,
      name: stop.name,
      country: stop.country,
      countryCode: stop.countryCode,
      region: stop.region,
      coordinates: stop.latitude !== null && stop.longitude !== null
        ? { latitude: stop.latitude, longitude: stop.longitude }
        : undefined,
      aliases: mention?.aliases,
      placeType: mention?.placeType,
    },
    currency: trip.currency,
  };
}

async function loadMappedPlaces(trip: EasyTTrip, stop: TripStop, signal: AbortSignal) {
  if (stop.latitude === null || stop.longitude === null) return [];
  const query = new URLSearchParams({
    destination: stop.name,
    country: stop.country,
    lat: String(stop.latitude),
    lon: String(stop.longitude),
  });
  const response = await fetch(`/api/journey-discover?${query}`, { signal });
  if (!response.ok) throw new Error("Mapped discovery unavailable");
  const payload = await response.json() as DiscoveryPayload;
  if (payload.unavailable) throw new Error("Mapped discovery unavailable");
  const interests = tripIntentForTrip(trip).preferences.interests;
  return (payload.places ?? []).map((place) => exploreResultForPlace(stop, place, interests));
}

async function loadDayTrips(trip: EasyTTrip, stop: TripStop, signal: AbortSignal) {
  if (stop.latitude === null || stop.longitude === null) return [];
  const query = new URLSearchParams({
    destination: stop.name,
    country: stop.country,
    canonicalPlaceId: stop.canonicalPlaceId ?? stop.id,
    region: stop.region ?? "",
    lat: String(stop.latitude),
    lon: String(stop.longitude),
  });
  const response = await fetch(`/api/journey-day-trips?${query}`, { signal });
  if (!response.ok) throw new Error("Day-trip discovery unavailable");
  const payload = await response.json() as DiscoveryPayload;
  if (payload.unavailable) throw new Error("Day-trip discovery unavailable");
  const interests = tripIntentForTrip(trip).preferences.interests;
  const routeStops = new Set(trip.stops.map((routeStop) => `${routeStop.name.trim().toLocaleLowerCase()}|${routeStop.country.trim().toLocaleLowerCase()}`));
  return (payload.places ?? [])
    .filter((place) => !routeStops.has(`${place.title.trim().toLocaleLowerCase()}|${stop.country.trim().toLocaleLowerCase()}`))
    .map((place) => exploreResultForPlace(stop, place, interests));
}

async function loadRestaurants(stop: TripStop, signal: AbortSignal) {
  if (stop.latitude === null || stop.longitude === null) return [];
  const query = new URLSearchParams({
    city: stop.name,
    country: stop.country,
    kind: "restaurant",
    lat: String(stop.latitude),
    lon: String(stop.longitude),
    locale: "en",
  });
  if (stop.canonicalPlaceId) query.set("canonicalPlaceId", stop.canonicalPlaceId);
  const response = await fetch(`/api/journey-local-search?${query}`, { signal });
  if (!response.ok) throw new Error("Restaurant discovery unavailable");
  const payload = await response.json() as LocalPayload;
  if (payload.unavailable) throw new Error("Restaurant discovery unavailable");
  return (payload.places ?? []).map((place) => exploreResultForLocalPlace(stop, place));
}

async function loadTours(trip: EasyTTrip, stop: TripStop, signal: AbortSignal) {
  if (!stop.canonicalPlaceId) return [];
  const response = await fetch("/api/journey-activity-inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(providerRequestBody(trip, stop)),
    signal,
  });
  if (!response.ok) throw new Error("Tour inventory unavailable");
  const payload = await response.json() as ActivityPayload;
  return (payload.activities ?? []).map((item) => exploreResultForActivity(stop, item, trip));
}

export default function TripExploreWorkspace({
  trip,
  initialResults,
  initialDestinationId = "all",
  initialCategory = "for-you",
  initialSelectedResultId,
  initialOrganicState,
  initialProviderState = "ready",
  requestedDayNumber,
}: TripExploreWorkspaceProps) {
  const mutation = useTripShellMutation();
  const workingTrip = mutation.trip;
  const discoveryRequestKey = exploreDiscoveryRequestKey(workingTrip);
  const discoveryTripRef = useRef(workingTrip);
  if (exploreDiscoveryRequestKey(discoveryTripRef.current) !== discoveryRequestKey) discoveryTripRef.current = workingTrip;
  const destinations = useMemo(() => exploreDestinationOptions(discoveryTripRef.current), [discoveryRequestKey]);
  const validInitialDestination = initialDestinationId === "all" || destinations.some((item) => item.id === initialDestinationId)
    ? initialDestinationId
    : "all";
  const [destinationId, setDestinationId] = useState(validInitialDestination);
  const [category, setCategory] = useState<ExploreCategory>(initialCategory);
  const initialPlan = exploreSourcePlan(initialCategory, trip);
  const initialOrganicResults = (initialResults ?? []).filter((result) => result.idea.source !== "live-provider-inventory");
  const initialCommercialResults = (initialResults ?? []).filter((result) => result.idea.source === "live-provider-inventory");
  const [organicResults, setOrganicResults] = useState<ExploreResult[]>(initialOrganicResults);
  const [commercialResults, setCommercialResults] = useState<ExploreResult[]>(initialCommercialResults);
  const [organicStatus, setOrganicStatus] = useState<ExploreDiscoveryLaneStatus>(initialResults
    ? initialOrganicState ?? (initialPlan.mapped || initialPlan.dayTrips || initialPlan.restaurants ? initialOrganicResults.length ? "ready" : "empty" : "idle")
    : initialPlan.mapped || initialPlan.dayTrips || initialPlan.restaurants ? "loading" : "idle");
  const [commercialStatus, setCommercialStatus] = useState<ExploreDiscoveryLaneStatus>(initialResults
    ? initialProviderState
    : initialPlan.tours ? "loading" : "idle");
  const [selectedResultId, setSelectedResultId] = useState<string | null>(initialSelectedResultId ?? null);
  const [selectedDayByResult, setSelectedDayByResult] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const selectedOriginRef = useRef<HTMLButtonElement | null>(null);

  const persistedResults = useMemo(() => (workingTrip.brief.itineraryIdeas ?? [])
    .flatMap((idea) => {
      const result = exploreResultForIdea(workingTrip, idea);
      return result ? [result] : [];
    }), [workingTrip]);
  const results = useMemo(
    () => projectExploreResults(organicResults, commercialResults, persistedResults),
    [commercialResults, organicResults, persistedResults],
  );
  const visibleResults = useMemo(() => filterExploreResults(workingTrip, results, destinationId, category), [category, destinationId, results, workingTrip]);
  const selectedResult = results.find((result) => result.identity === selectedResultId) ?? null;
  const opportunity = useMemo(() => exploreOpportunityForTrip(workingTrip, destinationId), [destinationId, workingTrip]);
  const activeDestination = destinationId === "all" ? null : destinations.find((item) => item.id === destinationId) ?? null;
  const activeSourcePlan = exploreSourcePlan(category, workingTrip);
  const navigationStops = useMemo(
    () => routeTimelineStopsForTrip(workingTrip, { scopeId: destinationId }),
    [destinationId, workingTrip],
  );

  const closeDetail = useCallback(() => {
    setSelectedResultId(null);
    const origin = selectedOriginRef.current;
    selectedOriginRef.current = null;
    window.requestAnimationFrame(() => origin?.focus());
  }, []);

  useEffect(() => {
    if (initialResults) return;
    const scope = createAbortableEffectScope("Explore organic and commercial discovery");
    const discoveryTrip = discoveryTripRef.current;
    const discoveryDestinations = exploreDestinationOptions(discoveryTrip);
    const scopedStops = destinationId === "all"
      ? discoveryDestinations.map((item) => item.stop)
      : discoveryDestinations.filter((item) => item.id === destinationId).map((item) => item.stop);
    const plan = exploreSourcePlan(category, discoveryTrip);
    const startedAt = performance.now();
    let firstUsefulReported = false;
    const recommendationKind = category === "food" ? "restaurant" as const
      : category === "for-you" ? "mixed" as const
        : "activity" as const;
    const reportSnapshot = (lane: "core" | "commercial", snapshot: ExploreDiscoveryLaneSnapshot) => {
      const properties = {
        surface: "explore" as const,
        recommendation_kind: recommendationKind,
        lane,
        duration_ms: recommendationDurationMs(startedAt, performance.now()),
        result_count: snapshot.results.length,
        outcome: snapshot.status === "degraded" ? "unavailable" as const : snapshot.results.length ? "ready" as const : "empty" as const,
      };
      if (snapshot.results.length && !firstUsefulReported) {
        firstUsefulReported = true;
        trackEvent("recommendation_performance", { ...properties, milestone: "first_useful" });
      }
      if (snapshot.pendingCount === 0) trackEvent("recommendation_performance", { ...properties, milestone: "lane_ready" });
    };
    setOrganicResults([]);
    setCommercialResults([]);
    const organicRequests = scopedStops.flatMap((stop) => [
      ...(plan.mapped ? [() => loadMappedPlaces(discoveryTrip, stop, scope.signal)] : []),
      ...(plan.dayTrips ? [() => loadDayTrips(discoveryTrip, stop, scope.signal)] : []),
      ...(plan.restaurants ? [() => loadRestaurants(stop, scope.signal)] : []),
    ]);
    const commercialRequests = scopedStops.flatMap((stop) => plan.tours
      ? [() => loadTours(discoveryTrip, stop, scope.signal)]
      : []);
    void streamExploreDiscoveryLane(organicRequests, (snapshot) => scope.commit(() => {
      setOrganicResults(snapshot.results);
      setOrganicStatus(snapshot.status);
      if (organicRequests.length) reportSnapshot("core", snapshot);
    }));
    void streamExploreDiscoveryLane(commercialRequests, (snapshot) => scope.commit(() => {
      setCommercialResults(snapshot.results);
      setCommercialStatus(snapshot.status);
      if (commercialRequests.length) reportSnapshot("commercial", snapshot);
    }));
    return () => scope.dispose();
  }, [category, destinationId, discoveryRequestKey, initialResults]);

  useEffect(() => {
    if (selectedResultId && !results.some((result) => result.identity === selectedResultId)) closeDetail();
  }, [closeDetail, results, selectedResultId]);

  const openDetail = (result: ExploreResult, origin: HTMLButtonElement) => {
    selectedOriginRef.current = origin;
    setSelectedResultId(result.identity);
    trackEvent("explore_result_opened", { trip_id: workingTrip.id, stop_id: result.stopId, result_kind: result.kind });
  };

  const saveResult = (result: ExploreResult) => {
    const changed = mutation.mutateTrip((current) => saveItineraryIdea(current, result.idea), `explore-save-${result.identity}`);
    if (!changed) return;
    setNotice(`${result.title} saved for later.`);
    trackEvent("explore_saved_for_later", { trip_id: workingTrip.id, stop_id: result.stopId, result_kind: result.kind });
  };

  const scheduleResult = (result: ExploreResult) => {
    const chosenDay = selectedDayByResult[result.identity] ?? requestedDayNumber;
    const target = exploreScheduleTarget(workingTrip, result, chosenDay);
    if (!target) return;
    const changed = mutation.mutateTrip(
      (current) => scheduleItineraryIdea(current, result.idea, target.day.id, target.dayPart),
      `explore-schedule-${result.identity}`,
    );
    if (!changed) return;
    setNotice(`${result.title} added to Day ${target.day.dayNumber}.`);
    trackEvent("explore_added_to_day", { trip_id: workingTrip.id, stop_id: result.stopId, day_number: target.day.dayNumber, result_kind: result.kind });
  };

  const removeResult = (result: ExploreResult) => {
    const state = exploreResultState(workingTrip, result);
    if (state.state === "available") return;
    mutation.mutateTrip((current) => removeItineraryIdea(current, state.idea.id), `explore-remove-${result.identity}`);
  };

  const destinationLabel = activeDestination?.label ?? "your trip";
  const relevantStatuses = [
    ...(activeSourcePlan.mapped || activeSourcePlan.dayTrips || activeSourcePlan.restaurants ? [organicStatus] : []),
    ...(activeSourcePlan.tours ? [commercialStatus] : []),
  ];
  const resultsPresentation = exploreResultsPresentation(visibleResults.length, relevantStatuses);

  return <section className={styles.workspace} aria-label="Explore recommendations">
    <div className={styles.main}>
      {notice ? <div className={styles.notice} role="status"><Check aria-hidden="true" />{notice}<EasyTButton size="small" variant="quiet" onClick={() => setNotice(null)}>Dismiss</EasyTButton></div> : null}
      {mutation.error ? <MorroviaStatusBanner tone="warning" title="This change is safe on this device" detail={mutation.error} /> : null}

      <div className={styles.stopNavigation}>
          <JourneyRouteStopTrack
            stops={navigationStops}
            ariaLabel="Explore by trip stop"
            presentation="integrated"
            surface="standalone"
            onSelectStop={(next) => {
              const nextScopeId = routeTimelineScopeId(workingTrip.id, next);
              setDestinationId(nextScopeId);
              setSelectedResultId(null);
              trackEvent("explore_destination_changed", { trip_id: workingTrip.id, destination_scope: nextScopeId === "all" ? "all" : "stop" });
            }}
          />
      </div>

      <div className={styles.categories} role="group" aria-label="Explore categories">
        {exploreCategories.map((item) => {
          const Icon = categoryIcons[item];
          const selected = category === item;
          return <EasyTButton
            key={item}
            icon={Icon}
            size="small"
            variant={selected ? "primary" : "secondary"}
            aria-pressed={selected}
            onClick={() => {
              setCategory(item);
              setSelectedResultId(null);
              trackEvent("explore_category_changed", { trip_id: workingTrip.id, category: item });
            }}
          >{exploreCategoryLabels[item]}</EasyTButton>;
        })}
      </div>

      <div className={styles.resultsHeader}>
        <div><strong>{exploreCategoryLabels[category]}</strong><span> around {destinationLabel}</span></div>
        <small>{visibleResults.length} {visibleResults.length === 1 ? "idea" : "ideas"}</small>
      </div>

      {resultsPresentation === "loading" ? <div className={styles.loading} aria-label="Finding local trip ideas">
        <MorroviaSectionStatus title="Finding ideas for this trip" detail={`Looking around ${destinationLabel}.`} />
        <div aria-hidden="true"><MorroviaSkeleton height={330} radius="card" /><MorroviaSkeleton height={330} radius="card" /><MorroviaSkeleton height={330} radius="card" /></div>
      </div> : null}
      {resultsPresentation === "unavailable" ? <MorroviaSectionStatus
        state="error"
        title="We couldn’t load ideas right now"
        detail="Try another category or come back shortly. Your trip and saved ideas are unchanged."
      /> : null}
      {resultsPresentation === "empty" ? <section className={styles.empty} aria-live="polite"><strong>No {exploreCategoryLabels[category].toLocaleLowerCase()} ideas found</strong><p>Try For you or another category for {destinationLabel}.</p></section> : null}

      {visibleResults.length ? <div className={styles.grid} id="explore-results">
        {visibleResults.map((result) => {
          const state = exploreResultState(workingTrip, result);
          const chosenDay = selectedDayByResult[result.identity] ?? requestedDayNumber;
          const target = exploreScheduleTarget(workingTrip, result, chosenDay);
          const dayChoices = validIdeaDays(workingTrip, result.stopId);
          const pending = mutation.isPending(`explore-save-${result.identity}`) || mutation.isPending(`explore-schedule-${result.identity}`);
          return <article className={`${styles.card} ${selectedResultId === result.identity ? styles.cardSelected : ""}`} key={result.identity} data-result-state={state.state} data-explore-card>
            <div className={styles.cardImage}>
              <ResilientImage src={result.image} alt="" fallback={<span><MapPin aria-hidden="true" /><small>Image unavailable</small></span>} />
              {state.state === "saved" ? <span className={styles.savedBadge}><Bookmark aria-hidden="true" />Saved for later</span> : null}
            </div>
            <div className={styles.cardBody}>
              <EasyTButton type="button" className={styles.cardOpen} iconOnly variant="quiet" aria-label={`Open details for ${result.title}`} aria-pressed={selectedResultId === result.identity} onClick={(event) => openDetail(result, event.currentTarget)}>Open details</EasyTButton>
              <div className={styles.cardCopy}>
                <h3>{result.title}</h3>
                <p className={styles.meta}><MapPin aria-hidden="true" />{result.location}<span>·</span>{result.category}{result.duration ? <><span>·</span><Clock3 aria-hidden="true" />{result.duration}</> : null}</p>
                {result.provider === "viator" ? <p className={styles.providerFacts}>
                  <span>Viator</span>
                  {result.rating !== undefined ? <><Star aria-hidden="true" />{result.rating.toFixed(1)}{result.reviewCount !== undefined ? ` · ${result.reviewCount.toLocaleString()} reviews` : ""}</> : null}
                  {result.price ? <strong>{result.price}</strong> : null}
                </p> : result.rating !== undefined || result.price ? <p className={styles.providerFacts}>
                  {result.provider === "google-places" ? <span>Google Places</span> : null}
                  {result.rating !== undefined ? <><Star aria-hidden="true" />{result.rating.toFixed(1)}{result.reviewCount !== undefined ? ` · ${result.reviewCount.toLocaleString()} reviews` : ""}</> : null}
                  {result.price ? <strong>{result.price}</strong> : null}
                </p> : null}
                {state.state === "planned" ? <p className={styles.planned}><Check aria-hidden="true" />Added to Day {state.day.dayNumber}{state.idea.dayPart ? ` · ${titleCase(state.idea.dayPart)}` : ""}</p> : null}
              </div>
              <div className={styles.cardActions}>
                {state.state === "planned" ? <>
                  <EasyTLinkButton size="small" variant="secondary" href={itineraryWorkspaceHref(workingTrip.id, state.day.dayNumber)}>View day</EasyTLinkButton>
                  <EasyTButton size="small" variant="quiet" disabled={pending} onClick={() => removeResult(result)}>Remove</EasyTButton>
                </> : <>
                  <EasyTButton
                    icon={CalendarPlus}
                    size="small"
                    disabled={!dayChoices.length || pending}
                    onClick={(event) => target ? scheduleResult(result) : openDetail(result, event.currentTarget)}
                  >{target ? `Add to Day ${target.day.dayNumber}` : dayChoices.length > 1 ? "Choose a day" : "No day available"}</EasyTButton>
                  {result.provider === "viator" && result.providerUrl ? <MorroviaAffiliateLink
                    action={{ provider: "viator", category: "activities", href: result.providerUrl, cta: "View tickets", affiliate: true }}
                    context={{ placement: "itinerary_day_experiences", tripId: workingTrip.id, stopId: result.stopId, workspaceView: "explore" }}
                    variant="secondary"
                    onClick={() => trackEvent("explore_provider_handoff", { trip_id: workingTrip.id, stop_id: result.stopId, provider: "viator" })}
                  /> : null}
                  {result.provider === "viator" && result.providerUrl ? <small className={styles.affiliateDisclosure}>{compactAffiliateDisclosure}</small> : null}
                  {state.state === "saved"
                    ? <span className={styles.savedState}><Bookmark aria-hidden="true" />Saved for later</span>
                    : <EasyTButton icon={Bookmark} size="small" variant="quiet" disabled={pending} aria-label={`Save ${result.title} for later`} onClick={() => saveResult(result)}>Save</EasyTButton>}
                </>}
              </div>
            </div>
          </article>;
        })}
      </div> : null}
    </div>

    <aside className={`${styles.rail} ${selectedResult ? styles.railSelected : ""}`} aria-label={selectedResult ? "Selected Explore result" : "Explore trip context"}>
      {selectedResult ? (() => {
        const state = exploreResultState(workingTrip, selectedResult);
        const chosenDay = selectedDayByResult[selectedResult.identity] ?? requestedDayNumber;
        const target = exploreScheduleTarget(workingTrip, selectedResult, chosenDay);
        const dayChoices = validIdeaDays(workingTrip, selectedResult.stopId);
        const mode = selectedResult.kind === "restaurant" ? "eat" : "see";
        const mapDayNumber = state.state === "planned" ? state.day.dayNumber : target?.day.dayNumber ?? null;
        const mapSelectionId = state.state === "available"
          ? mapResultSelectionId(mode, selectedResult.sourceId, selectedResult.stopId)
          : mapResultSelectionIdForIdea(state.idea.id);
        const mapHref = selectedResult.coordinates
          ? mapWorkspaceHref(
            workingTrip.id,
            selectedResult.stopId,
            mode,
            mapDayNumber,
            mapSelectionId,
            mapResultHandoffForExploreResult(selectedResult, mapSelectionId, mapDayNumber),
          )
          : null;
        return <ItineraryItemDetail
          detail={recommendationDetailForExploreResult({
            trip: workingTrip,
            result: selectedResult,
            state,
            context: { surface: "explore", activeDayId: state.state === "planned" ? state.day.id : target?.day.id, activeDayPart: state.state === "planned" ? state.idea.dayPart : target?.dayPart },
          })}
          mapHref={mapHref}
          pending={mutation.isPending(`explore-save-${selectedResult.identity}`) || mutation.isPending(`explore-schedule-${selectedResult.identity}`)}
          onClose={closeDetail}
          primaryActions={<>
            {state.state !== "planned" && !target && dayChoices.length > 1 ? <EasyTSelect
              label="Choose a day"
              value={selectedDayByResult[selectedResult.identity] ?? ""}
              onChange={(event) => setSelectedDayByResult((current) => ({ ...current, [selectedResult.identity]: Number(event.target.value) }))}
            >
              <option value="" disabled>Select a day</option>
              {dayChoices.map((day) => <option key={day.id} value={day.dayNumber}>Day {day.dayNumber} · {day.title}</option>)}
            </EasyTSelect> : null}
            {state.state !== "planned" && target ? <EasyTButton icon={CalendarPlus} fullWidth onClick={() => scheduleResult(selectedResult)}>Add to Day {target.day.dayNumber}</EasyTButton> : null}
            {state.state === "available" ? <EasyTButton icon={Bookmark} variant="secondary" onClick={() => saveResult(selectedResult)}>Save for later</EasyTButton> : null}
            {state.state === "planned" ? <EasyTLinkButton icon={CalendarPlus} variant="secondary" href={itineraryWorkspaceHref(workingTrip.id, state.day.dayNumber)}>View in itinerary</EasyTLinkButton> : null}
            {selectedResult.provider === "viator" && selectedResult.providerUrl ? <MorroviaAffiliateLink
              action={{ provider: "viator", category: "activities", href: selectedResult.providerUrl, cta: "View tickets", affiliate: true }}
              context={{ placement: "itinerary_day_experiences", tripId: workingTrip.id, stopId: selectedResult.stopId, workspaceView: "explore" }}
              variant="secondary"
              onClick={() => trackEvent("explore_provider_handoff", { trip_id: workingTrip.id, stop_id: selectedResult.stopId, provider: "viator" })}
            /> : null}
            {selectedResult.provider === "viator" && selectedResult.providerUrl ? <small className={styles.affiliateDisclosure}>{affiliateDisclosure}</small> : null}
          </>}
        />;
      })() : <>
        {opportunity ? <section className={styles.dayContext}>
          <span>Free time</span>
          <h3>{titleCase(opportunity.dayPart)} in {opportunity.stop.name}</h3>
          <p>You’ve got space on Day {opportunity.day.dayNumber}.</p>
          <EasyTButton variant="secondary" fullWidth onClick={() => {
            setDestinationId(opportunity.stop.id);
            setCategory("for-you");
            document.getElementById("explore-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}>Find ideas for this time</EasyTButton>
        </section> : null}
      </>}
    </aside>
  </section>;
}
