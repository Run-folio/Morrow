"use client";

import { googlePlaceReferenceIdeas, legacyItineraryIdeas } from "@/lib/easyt/trip";

import {
  Bookmark,
  CalendarPlus,
  Check,
  Clock3,
  MapPin,
  Sparkles,
  Star,
  Ticket,
  Utensils,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { itineraryAddSourceForIdea, newlyScheduledItineraryIdea } from "@/lib/easyt/itinerary-add-analytics";
import { JourneyRouteStopTrack } from "@/components/journey-planner-strip";
import type { ActivityInventoryItem } from "@/lib/easyt/activity-inventory";
import {
  explorePrimaryCategories,
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
  resolveExploreDestinationId,
  exploreScheduleTarget,
  exploreSourcePlan,
  normalizeExploreCategory,
  filterExploreResults,
  projectExploreResults,
  streamExploreDiscoveryLane,
  type ExploreDiscoveryLaneSnapshot,
  type ExploreDiscoveryLaneStatus,
  type ExploreCategory,
  type ExplorePrimaryCategory,
  type ExploreResult,
} from "@/lib/easyt/explore";
import { createAbortableEffectScope } from "@/lib/easyt/abortable-effect";
import { recommendationDurationMs } from "@/lib/easyt/recommendation-performance";
import { planningEvidenceFromResponse, planningLaneMessage, planningLaneResponseStatus, planningRequiresSignIn } from "@/lib/easyt/planning-evidence-presentation";
import type { PlanningEvidenceState } from "@/lib/easyt/planning-evidence-state";
import { tripSyncSignInPath } from "@/lib/easyt/trip-continuity";
import type { ItineraryDiscoveryPlace } from "@/lib/easyt/itinerary-day-context";
import { localSearchPayload, type JourneyLocalPlace } from "@/lib/easyt/local-place";
import { recommendationDetailForExploreResult } from "@/lib/easyt/recommendation-detail";
import { removeItineraryIdea, saveItineraryIdea, scheduleItineraryIdea, validIdeaDays } from "@/lib/easyt/itinerary-ideas";
import { exploreWorkspaceHref, mapWorkspaceHref, itineraryWorkspaceHref, tripBuilderHref } from "@/lib/easyt/trip-workspace-links";
import { mapResultHandoffForExploreResult, mapResultSelectionId, mapResultSelectionIdForIdea } from "@/lib/easyt/map-result-selection";
import { routeTimelineStopsForTrip } from "@/lib/easyt/route-timeline";
import type { EasyTTrip, TripStop } from "@/lib/easyt/trip";
import { tripIntentForTrip } from "@/lib/easyt/trip";
import { affiliateDisclosure, compactAffiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton, EasyTLinkButton, EasyTSelect } from "./easyt-controls";
import ItineraryItemDetail from "./itinerary-item-detail";
import { JourneyLocalPlacePhotoMedia, useJourneyLocalPlacePhotos } from "./journey-local-place-photo";
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

type DiscoveryPayload = { places?: ItineraryDiscoveryPlace[]; unavailable?: boolean; assessment?: PlanningEvidenceState };
type ActivityPayload = { activities?: ActivityInventoryItem[]; unavailable?: boolean; assessment?: PlanningEvidenceState };

const categoryIcons: Record<ExplorePrimaryCategory, typeof Sparkles> = {
  "for-you": Sparkles,
  "must-see": Star,
  food: Utensils,
  tours: Ticket,
};

function titleCase(value: string) {
  return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}

function exploreActionSourceKey(result: ExploreResult) {
  // An accepted save may update the day binding before its continuation renders feedback.
  const { dayId: _dayId, dayPart: _dayPart, ...source } = result.idea;
  return JSON.stringify([result.identity, result.stopId, result.sourceId, result.kind,
    result.title, result.provider, result.providerProductId, result.providerUrl, source]);
}

function useExploreActionScope(identity: string, results: readonly ExploreResult[]) {
  const mountedRef = useRef(true);
  const mountGenerationRef = useRef(0);
  const intentVersionRef = useRef(0);
  const scopeRef = useRef({ identity, sources: new Map<string, { key: string }>() });
  if (scopeRef.current.identity !== identity) scopeRef.current = { identity, sources: new Map() };
  const renderScope = scopeRef.current;
  const replaceSources = useCallback((next: readonly ExploreResult[]) => {
    const sources = scopeRef.current.sources;
    const sourceKeys = new Map(next.map(result => [result.identity, exploreActionSourceKey(result)]));
    for (const [id, source] of sources) {
      if (sourceKeys.get(id) !== source.key) sources.delete(id);
    }
    for (const [id, key] of sourceKeys) {
      if (!sources.has(id)) sources.set(id, { key });
    }
  }, []);
  replaceSources(results);
  const retireIntent = useCallback(() => { intentVersionRef.current += 1; }, []);
  const renderIntentVersion = intentVersionRef.current;
  const renderedSources = new Map(renderScope.sources);
  const pendingRef = useRef(new Map<object, object>());
  const [pending, setPending] = useState<Set<object>>(() => new Set());
  useEffect(() => {
    mountedRef.current = true;
    setPending(current => current.size ? new Set() : current);
    return () => { mountedRef.current = false; mountGenerationRef.current += 1; pendingRef.current.clear(); };
  }, []);
  const beginAction = (result: ExploreResult) => {
    const mountGeneration = mountGenerationRef.current;
    const source = renderedSources.get(result.identity);
    const isCurrent = () => mountedRef.current && scopeRef.current === renderScope
      && mountGenerationRef.current === mountGeneration && intentVersionRef.current === renderIntentVersion
      && renderScope.sources.get(result.identity) === source;
    if (!source || source.key !== exploreActionSourceKey(result) || !isCurrent() || pendingRef.current.has(source)) return null;
    const operation = {};
    pendingRef.current.set(source, operation);
    setPending(new Set(pendingRef.current.keys()));
    return {
      isCurrent,
      finish: () => {
        if (pendingRef.current.get(source) === operation) pendingRef.current.delete(source);
        if (mountedRef.current) setPending(new Set(pendingRef.current.keys()));
      },
    };
  };
  return { beginAction, retireIntent, replaceSources, isPending: (result: ExploreResult) => {
    const source = renderedSources.get(result.identity);
    return Boolean(source && pending.has(source));
  } };
}

function providerRequestBody(trip: EasyTTrip, stop: TripStop) {
  const mention = trip.brief.structuredBrief?.placeMentions?.find((item) => item.canonicalPlaceId === stop.canonicalPlaceId);
  return {
    destination: {
      canonicalPlaceId: stop.canonicalPlaceId,
      ...(stop.providerId ? { providerId: stop.providerId } : {}),
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

async function loadMappedPlaces(trip: EasyTTrip, stop: TripStop, signal: AbortSignal, onAssessment: (assessment?: PlanningEvidenceState) => void) {
  if (!stop.canonicalPlaceId && (stop.latitude === null || stop.longitude === null)) {
    onAssessment({ retrieval: "blocked", evidence: "unqualified", reason: "identity_required", retryable: false });
    throw new Error("Mapped discovery requires a destination");
  }
  const query = new URLSearchParams({
    destination: stop.name,
    country: stop.country,
    ...(stop.canonicalPlaceId ? { canonicalPlaceId: stop.canonicalPlaceId } : {}),
    ...(stop.providerId ? { providerId: stop.providerId } : {}),
    ...(stop.latitude !== null && stop.longitude !== null ? { lat: String(stop.latitude), lon: String(stop.longitude) } : {}),
  });
  const response = await fetch(`/api/journey-discover?${query}`, { signal });
  const payload = await response.json() as DiscoveryPayload;
  onAssessment(planningEvidenceFromResponse(payload));
  if (planningLaneResponseStatus(payload, response.ok) !== "ready") throw new Error("Mapped discovery unavailable");
  const interests = tripIntentForTrip(trip).preferences.interests;
  return (payload.places ?? []).map((place) => exploreResultForPlace(stop, place, interests));
}

async function loadDayTrips(trip: EasyTTrip, stop: TripStop, signal: AbortSignal) {
  if (stop.latitude === null || stop.longitude === null) return [];
  const query = new URLSearchParams({
    destination: stop.name,
    country: stop.country,
    canonicalPlaceId: stop.canonicalPlaceId ?? stop.id,
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

async function loadOutdoors(trip: EasyTTrip, stop: TripStop, signal: AbortSignal) {
  if (stop.latitude === null || stop.longitude === null) return [];
  const query = new URLSearchParams({
    destination: stop.name,
    country: stop.country,
    countryCode: stop.countryCode ?? "",
    lat: String(stop.latitude),
    lon: String(stop.longitude),
  });
  const response = await fetch(`/api/journey-outdoors?${query}`, { signal });
  if (!response.ok) throw new Error("Outdoors discovery unavailable");
  const payload = await response.json() as DiscoveryPayload;
  if (payload.unavailable) throw new Error("Outdoors discovery unavailable");
  const interests = tripIntentForTrip(trip).preferences.interests;
  return (payload.places ?? []).map((place) => exploreResultForPlace(stop, place, interests));
}

async function loadRestaurants(stop: TripStop, signal: AbortSignal, onAssessment: (assessment: PlanningEvidenceState) => void, refresh = false) {
  if (stop.latitude === null || stop.longitude === null) {
    onAssessment({ retrieval: "blocked", evidence: "unqualified", reason: "identity_required", retryable: false });
    throw new Error("Restaurant discovery requires a mapped destination");
  }
  const query = new URLSearchParams({
    city: stop.name,
    country: stop.country,
    kind: "restaurant",
    lat: String(stop.latitude),
    lon: String(stop.longitude),
    locale: "en",
  });
  if (stop.canonicalPlaceId) query.set("canonicalPlaceId", stop.canonicalPlaceId);
  if (refresh) query.set("refresh", "1");
  const response = await fetch(`/api/journey-local-search?${query}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
  if (!response.ok) throw new Error("Restaurant discovery unavailable");
  const payload = localSearchPayload(await response.json());
  if (payload.unavailable) throw new Error("Restaurant discovery unavailable");
  return payload.places.map(place => {
    const provider = place.provider;
    if (provider !== "google-places" && provider !== "openstreetmap") throw new Error("Restaurant source unavailable");
    return exploreResultForLocalPlace(stop, { ...place, provider });
  });
}

async function loadTours(trip: EasyTTrip, stop: TripStop, signal: AbortSignal, onAssessment: (assessment?: PlanningEvidenceState) => void) {
  if (!stop.canonicalPlaceId) {
    onAssessment({ retrieval: "blocked", evidence: "unqualified", reason: "identity_required", retryable: false });
    throw new Error("Tour inventory requires a destination");
  }
  const response = await fetch("/api/journey-activity-inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(providerRequestBody(trip, stop)),
    signal,
  });
  const payload = await response.json() as ActivityPayload;
  onAssessment(planningEvidenceFromResponse(payload));
  if (planningLaneResponseStatus(payload, response.ok) !== "ready") throw new Error("Tour inventory unavailable");
  return (payload.activities ?? []).map((item) => exploreResultForActivity(stop, item, trip));
}

export default function TripExploreWorkspace({
  trip,
  initialResults,
  initialDestinationId,
  initialCategory = "for-you",
  initialSelectedResultId,
  initialOrganicState,
  initialProviderState = "ready",
  requestedDayNumber,
}: TripExploreWorkspaceProps) {
  const mutation = useTripShellMutation();
  const workingTrip = mutation.trip;
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const sessionOwnerId = session?.user?.id ?? null;
  const discoveryRequestKey = exploreDiscoveryRequestKey(workingTrip);
  const discoveryTripRef = useRef(workingTrip);
  if (exploreDiscoveryRequestKey(discoveryTripRef.current) !== discoveryRequestKey) discoveryTripRef.current = workingTrip;
  const destinations = useMemo(() => exploreDestinationOptions(discoveryTripRef.current), [discoveryRequestKey]);
  const [destinationId, setDestinationId] = useState<string | null>(() => resolveExploreDestinationId(destinations, initialDestinationId));
  const normalizedInitialCategory = normalizeExploreCategory(initialCategory);
  const [category, setCategory] = useState<ExplorePrimaryCategory>(normalizedInitialCategory);
  const activeSourcePlan = exploreSourcePlan(category, workingTrip);
  // Seeded fixtures contain all categories and destinations; auth still bounds their visibility.
  const commercialIdentity = JSON.stringify([initialResults ? "seeded" : category, initialResults ? null : destinationId, discoveryRequestKey, sessionPending, sessionOwnerId]);
  const commercialLifetimeRef = useRef({ key: commercialIdentity });
  if (commercialLifetimeRef.current.key !== commercialIdentity) commercialLifetimeRef.current = { key: commercialIdentity };
  const commercialRequestScopeRef = useRef<string | null>(null);
  const [commercialResultIdentity, setCommercialResultIdentity] = useState(commercialIdentity);
  const initialPlan = exploreSourcePlan(normalizedInitialCategory, trip);
  const initialOrganicResults = (initialResults ?? []).filter((result) => result.idea.source !== "live-provider-inventory");
  const initialCommercialResults = (initialResults ?? []).filter((result) => result.idea.source === "live-provider-inventory");
  const [organicResults, setOrganicResults] = useState<ExploreResult[]>(initialOrganicResults);
  const [storedCommercialResults, setCommercialResults] = useState<ExploreResult[]>(initialCommercialResults);
  // Retire rendered inventory synchronously when auth or request identity changes.
  const commercialResults = useMemo(() => commercialResultIdentity === commercialIdentity ? storedCommercialResults : [],
    [commercialResultIdentity, commercialIdentity, storedCommercialResults]);
  const [organicStatus, setOrganicStatus] = useState<ExploreDiscoveryLaneStatus>(initialResults
    ? initialOrganicState ?? (initialPlan.mapped || initialPlan.dayTrips || initialPlan.restaurants || initialPlan.outdoors ? initialOrganicResults.length ? "ready" : "empty" : "idle")
    : initialPlan.mapped || initialPlan.dayTrips || initialPlan.restaurants || initialPlan.outdoors ? "loading" : "idle");
  // Food health belongs to venue retrieval; unrelated mapped success cannot qualify it.
  const [restaurantStatus, setRestaurantStatus] = useState<ExploreDiscoveryLaneStatus>(initialPlan.restaurants
    ? initialResults ? initialOrganicState ?? (initialOrganicResults.some(result => result.kind === "restaurant") ? "ready" : "empty") : "loading"
    : "idle");
  const [restaurantAssessment, setRestaurantAssessment] = useState<PlanningEvidenceState>();
  const [storedCommercialStatus, setCommercialStatus] = useState<ExploreDiscoveryLaneStatus>(initialResults
    ? initialProviderState
    : initialPlan.tours ? "loading" : "idle");
  const [organicAssessment, setOrganicAssessment] = useState<PlanningEvidenceState>();
  const [storedCommercialAssessment, setCommercialAssessment] = useState<PlanningEvidenceState>();
  const commercialAssessment = commercialResultIdentity === commercialIdentity ? storedCommercialAssessment : undefined;
  const commercialStatus = commercialResultIdentity === commercialIdentity ? storedCommercialStatus : activeSourcePlan.tours ? "loading" : "idle";
  const [retryVersion, setRetryVersion] = useState(0);
  const requestScopeRef = useRef<{ key: string; retryVersion: number } | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(initialSelectedResultId ?? null);
  const [selectedDayByResult, setSelectedDayByResult] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const selectedOriginRef = useRef<HTMLButtonElement | null>(null);

  const persistedResults = useMemo(() => (legacyItineraryIdeas(workingTrip.brief.itineraryIdeas))
    .flatMap((idea) => {
      const result = exploreResultForIdea(workingTrip, idea);
      return result ? [result] : [];
    }), [workingTrip]);
  const savedGoogleReferences = googlePlaceReferenceIdeas(workingTrip.brief.itineraryIdeas)
    .filter((idea) => idea.stopId === destinationId);
  const results = useMemo(
    () => projectExploreResults(organicResults, commercialResults, persistedResults),
    [commercialResults, organicResults, persistedResults],
  );
  const visibleResults = useMemo(
    () => destinationId ? filterExploreResults(workingTrip, results, destinationId, category) : [],
    [category, destinationId, results, workingTrip],
  );
  const actions = useExploreActionScope(JSON.stringify([
    workingTrip.id, workingTrip.ownerId, discoveryRequestKey, destinationId, category, sessionPending, sessionOwnerId,
    selectedResultId, selectedDayByResult, requestedDayNumber,
    workingTrip.planItems.map(day => [day.id, day.stopId, day.dayNumber, day.date]),
  ]), results);
  const uiIntentRef = useRef({ destinationId, category, selectedResultId, selectedDayByResult });
  uiIntentRef.current = { destinationId, category, selectedResultId, selectedDayByResult };
  const retireActionIntent = useCallback((changes: Partial<typeof uiIntentRef.current>) => {
    const next = { ...uiIntentRef.current, ...changes };
    if (JSON.stringify(next) !== JSON.stringify(uiIntentRef.current)) actions.retireIntent();
    uiIntentRef.current = next;
  }, [actions.retireIntent]);
  const laneResultsRef = useRef({ organicResults, commercialResults, persistedResults });
  laneResultsRef.current = { organicResults, commercialResults, persistedResults };
  const replaceOrganicResults = (next: ExploreResult[]) => {
    laneResultsRef.current.organicResults = next;
    actions.replaceSources(projectExploreResults(next, laneResultsRef.current.commercialResults, laneResultsRef.current.persistedResults));
    setOrganicResults(next);
  };
  const replaceCommercialResults = (next: ExploreResult[]) => {
    setCommercialResultIdentity(commercialIdentity);
    laneResultsRef.current.commercialResults = next;
    actions.replaceSources(projectExploreResults(laneResultsRef.current.organicResults, next, laneResultsRef.current.persistedResults));
    setCommercialResults(next);
  };
  const isResultPending = (result: ExploreResult) => actions.isPending(result)
    || mutation.isPending(`explore-save-${result.identity}`)
    || mutation.isPending(`explore-schedule-${result.identity}`)
    || mutation.isPending(`explore-remove-${result.identity}`);
  const currentActionTrip = (current: EasyTTrip, result: ExploreResult) => current.id === workingTrip.id
    && current.ownerId === workingTrip.ownerId && exploreDiscoveryRequestKey(current) === discoveryRequestKey
    && JSON.stringify(exploreResultState(current, result).idea) === JSON.stringify(exploreResultState(workingTrip, result).idea);
  const restaurantPhotoPlaces = useMemo<JourneyLocalPlace[]>(() => visibleResults.flatMap((result) => {
    if (result.kind !== "restaurant" || !result.coordinates || !result.providerUrl
      || (result.provider !== "google-places" && result.provider !== "openstreetmap")) return [];
    return [{
      id: result.identity,
      name: result.title,
      address: result.location,
      category: result.category,
      coordinates: result.coordinates,
      mapsUrl: result.providerUrl,
      provider: result.provider,
      providerProductId: result.providerProductId,
      image: result.image,
    }];
  }), [visibleResults]);
  const restaurantPhotoPlaceById = useMemo(
    () => new Map(restaurantPhotoPlaces.map((place) => [place.id, place])),
    [restaurantPhotoPlaces],
  );
  const restaurantPhotos = useJourneyLocalPlacePhotos(restaurantPhotoPlaces, { limit: 12, kind: "restaurant" });
  const [failedRestaurantImages, setFailedRestaurantImages] = useState<Set<string>>(() => new Set());
  const selectedResult = results.find((result) => result.identity === selectedResultId) ?? null;
  const activeDestination = destinations.find((item) => item.id === destinationId) ?? null;
  const opportunity = useMemo(
    () => activeDestination ? exploreOpportunityForTrip(workingTrip, activeDestination.id) : null,
    [activeDestination, workingTrip],
  );
  const navigationStops = useMemo(
    () => destinationId
      ? routeTimelineStopsForTrip(workingTrip, { scopeId: destinationId })
        .filter((item) => item.kind === "stop" && destinations.some((destination) => destination.id === item.id))
      : [],
    [destinationId, destinations, workingTrip],
  );

  useEffect(() => {
    retireActionIntent({ destinationId: resolveExploreDestinationId(destinations, uiIntentRef.current.destinationId) });
    setDestinationId((current) => resolveExploreDestinationId(destinations, current));
  }, [destinations, retireActionIntent]);

  const closeDetail = useCallback(() => {
    retireActionIntent({ selectedResultId: null });
    setSelectedResultId(null);
    const origin = selectedOriginRef.current;
    selectedOriginRef.current = null;
    window.requestAnimationFrame(() => origin?.focus());
  }, [retireActionIntent]);

  const metricsKey = JSON.stringify([category, destinationId, discoveryRequestKey, retryVersion]);
  const discoveryMetricsRef = useRef({ key: metricsKey, firstUsefulReported: false });
  if (discoveryMetricsRef.current.key !== metricsKey) discoveryMetricsRef.current = { key: metricsKey, firstUsefulReported: false };

  const discoveryMetrics = discoveryMetricsRef.current;
  const recommendationKind = category === "food" ? "restaurant" as const
    : category === "for-you" ? "mixed" as const
      : "activity" as const;
  const reportSnapshot = (lane: "core" | "commercial", snapshot: ExploreDiscoveryLaneSnapshot, startedAt: number) => {
    const properties = {
      surface: "explore" as const,
      recommendation_kind: recommendationKind,
      lane,
      duration_ms: recommendationDurationMs(startedAt, performance.now()),
      result_count: snapshot.results.length,
      outcome: snapshot.status === "degraded" ? "unavailable" as const : snapshot.results.length ? "ready" as const : "empty" as const,
    };
    if (snapshot.results.length && !discoveryMetrics.firstUsefulReported) {
      discoveryMetrics.firstUsefulReported = true;
      trackEvent("recommendation_performance", { ...properties, milestone: "first_useful" });
    }
    if (snapshot.pendingCount === 0) trackEvent("recommendation_performance", { ...properties, milestone: "lane_ready" });
  };

  useEffect(() => {
    if (initialResults) return;
    const scope = createAbortableEffectScope("Explore organic discovery");
    const discoveryTrip = discoveryTripRef.current;
    const discoveryDestinations = exploreDestinationOptions(discoveryTrip);
    const scopedStops = destinationId
      ? discoveryDestinations.filter((item) => item.id === destinationId).map((item) => item.stop)
      : [];
    const plan = exploreSourcePlan(category, discoveryTrip);
    const startedAt = performance.now();
    const scopeKey = JSON.stringify([category, destinationId, discoveryRequestKey]);
    const sameScope = requestScopeRef.current?.key === scopeKey;
    const refresh = sameScope && requestScopeRef.current!.retryVersion !== retryVersion;
    const skipOrganic = !plan.restaurants && sameScope && organicAssessment?.retrieval !== "completed" && organicAssessment?.retryable === false;
    if (!sameScope) {
      replaceOrganicResults([]);
    }
    requestScopeRef.current = { key: scopeKey, retryVersion };
    if (!skipOrganic) setOrganicAssessment(undefined);
    if (plan.restaurants) {
      setRestaurantAssessment(undefined);
      setRestaurantStatus(scopedStops.length ? "loading" : "empty");
    }
    const organicRequests = scopedStops.flatMap((stop) => [
      ...(plan.mapped ? [() => loadMappedPlaces(discoveryTrip, stop, scope.signal, assessment => scope.commit(() => setOrganicAssessment(assessment)))] : []),
      ...(plan.dayTrips ? [() => loadDayTrips(discoveryTrip, stop, scope.signal)] : []),
      ...(plan.restaurants ? [async () => {
        try {
          const places = await loadRestaurants(stop, scope.signal, assessment => scope.commit(() => setRestaurantAssessment(assessment)), refresh);
          scope.commit(() => setRestaurantStatus(places.length ? "ready" : "empty"));
          return places;
        } catch (error) {
          scope.commit(() => setRestaurantStatus("degraded"));
          throw error;
        }
      }] : []),
      ...(plan.outdoors ? [() => loadOutdoors(discoveryTrip, stop, scope.signal)] : []),
    ]);
    if (!skipOrganic) void streamExploreDiscoveryLane(organicRequests, (snapshot) => scope.commit(() => {
      replaceOrganicResults(snapshot.results.length ? snapshot.results : snapshot.pendingCount || snapshot.failedCount ? laneResultsRef.current.organicResults : []);
      setOrganicStatus(snapshot.status);
      if (organicRequests.length) reportSnapshot("core", snapshot, startedAt);
    }));
    return () => scope.dispose();
  }, [category, destinationId, discoveryRequestKey, initialResults, retryVersion]);

  useEffect(() => {
    if (initialResults) return;
    const scope = createAbortableEffectScope("Explore commercial discovery");
    const lifetime = commercialLifetimeRef.current;
    const commit = (publish: () => void) => {
      if (commercialLifetimeRef.current === lifetime) scope.commit(publish);
    };
    const sameScope = commercialRequestScopeRef.current === commercialIdentity;
    const skipCommercial = sameScope && commercialAssessment?.retrieval !== "completed" && commercialAssessment?.retryable === false;
    commercialRequestScopeRef.current = commercialIdentity;
    if (!sameScope) {
      replaceCommercialResults([]);
      setCommercialAssessment(undefined);
    }
    const discoveryTrip = discoveryTripRef.current;
    const plan = exploreSourcePlan(category, discoveryTrip);
    const scopedStops = destinationId
      ? exploreDestinationOptions(discoveryTrip).filter((item) => item.id === destinationId).map((item) => item.stop)
      : [];
    if (sessionPending) {
      setCommercialStatus(plan.tours && scopedStops.length ? "loading" : "idle");
      return () => scope.dispose();
    }
    if (skipCommercial) return () => scope.dispose();
    setCommercialAssessment(undefined);
    const startedAt = performance.now();
    const requests = scopedStops.flatMap((stop) => plan.tours
      ? [() => loadTours(discoveryTrip, stop, scope.signal, assessment => commit(() => setCommercialAssessment(assessment)))]
      : []);
    void streamExploreDiscoveryLane(requests, (snapshot) => commit(() => {
      replaceCommercialResults(snapshot.results.length ? snapshot.results : snapshot.pendingCount || snapshot.failedCount ? laneResultsRef.current.commercialResults : []);
      setCommercialStatus(snapshot.status);
      if (requests.length) reportSnapshot("commercial", snapshot, startedAt);
    }));
    return () => scope.dispose();
  }, [category, destinationId, discoveryRequestKey, initialResults, retryVersion, commercialIdentity, sessionPending]);

  useEffect(() => {
    if (selectedResultId && !results.some((result) => result.identity === selectedResultId)) closeDetail();
  }, [closeDetail, results, selectedResultId]);

  const openDetail = (result: ExploreResult, origin: HTMLButtonElement) => {
    retireActionIntent({ selectedResultId: result.identity });
    selectedOriginRef.current = origin;
    setSelectedResultId(result.identity);
    trackEvent("explore_result_opened", { trip_id: workingTrip.id, stop_id: result.stopId, result_kind: result.kind });
  };

  const saveResult = async (source: ExploreResult) => {
    const result = structuredClone(source);
    const action = actions.beginAction(result);
    if (!action) return false;
    try {
      const changed = await mutation.mutateTrip((current) => action.isCurrent() && currentActionTrip(current, result)
        ? saveItineraryIdea(current, result.idea) : current, `explore-save-${result.identity}`);
      if (changed !== true || !action.isCurrent()) return false;
      setNotice(`${result.title} saved for later.`);
      trackEvent("explore_saved_for_later", { trip_id: workingTrip.id, stop_id: result.stopId, result_kind: result.kind });
      return true;
    } catch { return false; }
    finally { action.finish(); }
  };

  const scheduleResult = async (source: ExploreResult) => {
    const result = structuredClone(source);
    const chosenDay = selectedDayByResult[result.identity] ?? requestedDayNumber;
    const target = exploreScheduleTarget(workingTrip, result, chosenDay);
    if (!target) return false;
    const action = actions.beginAction(result);
    if (!action) return false;
    let newItem = false;
    try {
      const changed = await mutation.mutateTrip(
        (current) => {
          if (!action.isCurrent() || !currentActionTrip(current, result)) return current;
          const currentTarget = exploreScheduleTarget(current, result, chosenDay);
          if (!currentTarget || currentTarget.day.id !== target.day.id || currentTarget.dayPart !== target.dayPart
            || currentTarget.day.dayNumber !== target.day.dayNumber || currentTarget.day.date !== target.day.date
            || currentTarget.day.stopId !== target.day.stopId) return current;
          const next = scheduleItineraryIdea(current, result.idea, target.day.id, target.dayPart);
          newItem = newlyScheduledItineraryIdea(current, next, result.idea);
          return next;
        },
        `explore-schedule-${result.identity}`,
      );
      if (changed !== true || !action.isCurrent()) return false;
      setNotice(`${result.title} added to Day ${target.day.dayNumber}.`);
      if (newItem) {
        trackEvent("itinerary_item_added", { trip_id: workingTrip.id, stop_id: result.stopId, source: itineraryAddSourceForIdea(result.idea), item_kind: result.idea.category });
        trackEvent("explore_added_to_day", { trip_id: workingTrip.id, stop_id: result.stopId, day_number: target.day.dayNumber, result_kind: result.kind });
      }
      return true;
    } catch { return false; }
    finally { action.finish(); }
  };

  const removeResult = async (source: ExploreResult) => {
    const result = structuredClone(source);
    const state = exploreResultState(workingTrip, result);
    if (state.state === "available") return false;
    const action = actions.beginAction(result);
    if (!action) return false;
    try {
      const changed = await mutation.mutateTrip((current) => action.isCurrent() && currentActionTrip(current, result)
        ? removeItineraryIdea(current, state.idea.id) : current, `explore-remove-${result.identity}`);
      return changed === true && action.isCurrent();
    } catch { return false; }
    finally { action.finish(); }
  };

  const destinationLabel = activeDestination?.label ?? "your trip";
  const relevantStatuses = [
    ...(activeSourcePlan.mapped || activeSourcePlan.dayTrips || activeSourcePlan.restaurants || activeSourcePlan.outdoors ? [activeSourcePlan.restaurants ? restaurantStatus : organicStatus] : []),
    ...(activeSourcePlan.tours ? [commercialStatus] : []),
  ];
  const relevantAssessments = [
    ...(activeSourcePlan.restaurants
      ? restaurantAssessment && restaurantAssessment.retrieval !== "completed" ? [restaurantAssessment] : []
      : activeSourcePlan.mapped && organicAssessment && organicAssessment.retrieval !== "completed" ? [organicAssessment] : []),
    ...(activeSourcePlan.tours && commercialAssessment && commercialAssessment.retrieval !== "completed" ? [commercialAssessment] : []),
  ];
  const resultsPresentation = !visibleResults.length && relevantAssessments.length && !relevantStatuses.includes("loading")
    ? "unavailable" : exploreResultsPresentation(visibleResults.length, relevantStatuses);
  const incomplete = relevantAssessments.some(state => state.retrieval === "checking" || state.retrieval === "not-attempted");
  const canRetry = activeSourcePlan.restaurants
    ? restaurantStatus === "degraded" && restaurantAssessment?.retryable !== false
    : (organicStatus === "degraded" || organicAssessment && organicAssessment.retrieval !== "completed") && organicAssessment?.retryable !== false
    || (commercialStatus === "degraded" || commercialAssessment && commercialAssessment.retrieval !== "completed") && commercialAssessment?.retryable !== false;
  const needsSignIn = activeSourcePlan.tours && commercialStatus === "degraded" && planningRequiresSignIn(commercialAssessment);

  return <section className={styles.workspace} aria-label="Explore recommendations">
    {notice || mutation.error ? <div className={styles.feedbackRow}>
      {notice ? <div className={styles.notice} role="status"><Check aria-hidden="true" />{notice}<EasyTButton size="small" variant="quiet" onClick={() => setNotice(null)}>Dismiss</EasyTButton></div> : null}
      {mutation.error ? <MorroviaStatusBanner tone="warning" title="This change is safe on this device" detail={mutation.error} /> : null}
    </div> : null}

    <div className={styles.stopNavigation}>
      <JourneyRouteStopTrack
        stops={navigationStops}
        ariaLabel="Explore by trip stop"
        presentation="integrated"
        surface="standalone"
        onSelectStop={(next) => {
          retireActionIntent({ destinationId: next, selectedResultId: null });
          setDestinationId(next);
          setSelectedResultId(null);
          trackEvent("explore_destination_changed", { trip_id: workingTrip.id, destination_scope: "stop" });
        }}
      />
    </div>

    <div className={styles.main}>
      <div className={styles.categories} role="group" aria-label="Explore categories">
        {explorePrimaryCategories.map((item) => {
          const Icon = categoryIcons[item];
          const selected = category === item;
          return <EasyTButton
            key={item}
            icon={Icon}
            size="small"
            variant={selected ? "primary" : "secondary"}
            aria-pressed={selected}
            onClick={() => {
              retireActionIntent({ category: item, selectedResultId: null });
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
      {resultsPresentation === "unavailable" ? <><MorroviaSectionStatus
        state="error"
        title={restaurantAssessment?.reason === "identity_required" && activeSourcePlan.restaurants ? "This stop needs a mapped location"
          : incomplete ? "Ideas are not ready yet" : activeSourcePlan.restaurants ? "We couldn’t load food ideas right now" : "We couldn’t load ideas right now"}
        detail={relevantAssessments.length ? [...new Set(relevantAssessments.map(state => planningLaneMessage(state, "en")))].join(" ") : "Your trip and saved ideas are unchanged."}
        onRetry={canRetry ? () => setRetryVersion(current => current + 1) : undefined}
      />{activeSourcePlan.restaurants && restaurantAssessment?.reason === "identity_required" ? <EasyTLinkButton variant="secondary" size="small" href={tripBuilderHref(workingTrip.id, workingTrip.ownerId)}>Adjust route</EasyTLinkButton> : null}{needsSignIn ? <EasyTButton variant="secondary" size="small" onClick={() => window.location.assign(tripSyncSignInPath(workingTrip.id))}>Sign in</EasyTButton> : null}</> : null}
      {resultsPresentation === "empty" ? <section className={styles.empty} aria-live="polite"><strong>No {exploreCategoryLabels[category].toLocaleLowerCase()} ideas found</strong><p>Try For you or another category for {destinationLabel}.</p></section> : null}

      {visibleResults.length ? <div className={styles.grid} id="explore-results">
        {visibleResults.map((result) => {
          const state = exploreResultState(workingTrip, result);
          const chosenDay = selectedDayByResult[result.identity] ?? requestedDayNumber;
          const target = exploreScheduleTarget(workingTrip, result, chosenDay);
          const dayChoices = validIdeaDays(workingTrip, result.stopId);
          const pending = isResultPending(result);
          const photoPlace = restaurantPhotoPlaceById.get(result.identity);
          const photo = restaurantPhotos[result.identity];
          const restaurantMedia = result.image ?? photo?.src;
          const compactNoImage = !restaurantMedia || (result.kind === "restaurant" && failedRestaurantImages.has(result.identity));
          const markRestaurantImageFailed = () => setFailedRestaurantImages((current) => {
            if (current.has(result.identity)) return current;
            const next = new Set(current);
            next.add(result.identity);
            return next;
          });
          return <article className={`${styles.card} ${compactNoImage ? styles.cardCompact : ""} ${selectedResultId === result.identity ? styles.cardSelected : ""}`} key={result.identity} data-result-state={state.state} data-image-state={compactNoImage ? "compact-none" : "media"} data-explore-card>
            {!compactNoImage ? <div className={styles.cardImage}>
              {result.kind === "restaurant" && photoPlace
                ? <JourneyLocalPlacePhotoMedia place={photoPlace} photo={photo} subject="restaurant" onError={markRestaurantImageFailed} fallback={null} />
                : <ResilientImage src={result.image} alt="" onError={result.kind === "restaurant" ? markRestaurantImageFailed : undefined} fallback={<span><MapPin aria-hidden="true" /><small>Image unavailable</small></span>} />}
              {state.state === "saved" ? <span className={styles.savedBadge}><Bookmark aria-hidden="true" />Saved for later</span> : null}
            </div> : null}
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
      {savedGoogleReferences.length ? <section className={styles.referenceSection} aria-label="Saved Google places">
        <strong>Saved from Google Maps</strong>
        <p>Open the Google map to check current place details. These are saved ideas, not bookings.</p>
        <ul>{savedGoogleReferences.map((idea) => <li key={idea.id}>
          <span>Saved Google place{idea.dayId ? ` · Day ${workingTrip.planItems.find((day) => day.id === idea.dayId)?.dayNumber ?? "?"}` : " · for later"}</span>
          <EasyTLinkButton variant="secondary" size="small" href={mapWorkspaceHref(workingTrip.id, idea.stopId, idea.category === "stay" ? "stay" : idea.category === "restaurant" ? "eat" : "see", idea.dayId ? workingTrip.planItems.find((day) => day.id === idea.dayId)?.dayNumber ?? null : null, null, null, exploreWorkspaceHref(workingTrip.id, idea.stopId, requestedDayNumber))}>Open in map</EasyTLinkButton>
        </li>)}</ul>
      </section> : null}
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
            exploreWorkspaceHref(workingTrip.id, selectedResult.stopId, chosenDay),
          )
          : null;
        return <ItineraryItemDetail
          detail={recommendationDetailForExploreResult({
            trip: workingTrip,
            result: selectedResult,
            state,
            context: { surface: "explore", activeDayId: state.state === "planned" ? state.day.id : target?.day.id, activeDayPart: state.state === "planned" ? state.idea.dayPart : target?.dayPart },
          })}
          omitEmptyMedia
          mapHref={mapHref}
          pending={isResultPending(selectedResult)}
          onClose={closeDetail}
          primaryActions={<>
            {state.state !== "planned" && !target && dayChoices.length > 1 ? <EasyTSelect
              label="Choose a day"
              disabled={isResultPending(selectedResult)}
              value={selectedDayByResult[selectedResult.identity] ?? ""}
              onChange={(event) => {
                const next = { ...uiIntentRef.current.selectedDayByResult, [selectedResult.identity]: Number(event.target.value) };
                retireActionIntent({ selectedDayByResult: next });
                setSelectedDayByResult(next);
              }}
            >
              <option value="" disabled>Select a day</option>
              {dayChoices.map((day) => <option key={day.id} value={day.dayNumber}>Day {day.dayNumber} · {day.title}</option>)}
            </EasyTSelect> : null}
            {state.state !== "planned" && target ? <EasyTButton icon={CalendarPlus} fullWidth disabled={isResultPending(selectedResult)} onClick={() => scheduleResult(selectedResult)}>Add to Day {target.day.dayNumber}</EasyTButton> : null}
            {state.state === "available" ? <EasyTButton icon={Bookmark} variant="secondary" disabled={isResultPending(selectedResult)} onClick={() => saveResult(selectedResult)}>Save for later</EasyTButton> : null}
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
            retireActionIntent({ destinationId: opportunity.stop.id, category: "for-you" });
            setDestinationId(opportunity.stop.id);
            setCategory("for-you");
            document.getElementById("explore-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}>Find ideas for this time</EasyTButton>
        </section> : null}
      </>}
    </aside>
  </section>;
}
