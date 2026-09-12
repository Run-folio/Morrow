"use client";

import {
  Bookmark,
  CalendarPlus,
  Check,
  Clock3,
  Compass,
  ExternalLink,
  Landmark,
  Map as MapIcon,
  MapPin,
  Mountain,
  Sparkles,
  Star,
  Ticket,
  Utensils,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { ActivityInventoryItem } from "@/lib/easyt/activity-inventory";
import {
  dedupeExploreResults,
  exploreCategories,
  exploreCategoryLabels,
  exploreDestinationOptions,
  exploreOpportunityForTrip,
  exploreResultForActivity,
  exploreResultForIdea,
  exploreResultForLocalPlace,
  exploreResultForPlace,
  exploreResultState,
  exploreScheduleTarget,
  filterExploreResults,
  type ExploreCategory,
  type ExploreLocalPlace,
  type ExploreResult,
} from "@/lib/easyt/explore";
import { itineraryInterestReason, type ItineraryDiscoveryPlace } from "@/lib/easyt/itinerary-day-context";
import { removeItineraryIdea, saveItineraryIdea, scheduleItineraryIdea } from "@/lib/easyt/itinerary-ideas";
import { mapWorkspaceHref, itineraryWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import type { EasyTTrip, TripStop } from "@/lib/easyt/trip";
import { tripIntentForTrip } from "@/lib/easyt/trip";
import { affiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton, EasyTLinkButton, EasyTSelect } from "./easyt-controls";
import ItineraryItemDetail, { type ItineraryItemDetailModel } from "./itinerary-item-detail";
import { MorroviaSaveStatus, MorroviaStatusBanner } from "./morrovia-feedback";
import { MorroviaSectionStatus, MorroviaSkeleton } from "./morrovia-loading-states";
import ResilientImage from "./resilient-image";
import { useTripMutationPersistence } from "./use-trip-mutation-persistence";
import styles from "./trip-explore-workspace.module.css";

type ProviderState = "ready" | "degraded" | "empty";

export type TripExploreWorkspaceProps = {
  trip: EasyTTrip;
  initialResults?: ExploreResult[];
  initialDestinationId?: string;
  initialCategory?: ExploreCategory;
  initialSelectedResultId?: string;
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

function sourcePlan(category: ExploreCategory, trip: EasyTTrip) {
  const interests = tripIntentForTrip(trip).preferences.interests;
  return {
    mapped: category !== "tours" && category !== "day-trips",
    restaurants: category === "food" || (category === "for-you" && interests.includes("food")),
    tours: category === "tours" || category === "day-trips",
  };
}

function detailForResult(result: ExploreResult, state: ReturnType<typeof exploreResultState>, whyFit: string | null): ItineraryItemDetailModel {
  const when = state.state === "planned"
    ? `Day ${state.day.dayNumber}${state.idea.dayPart ? ` · ${titleCase(state.idea.dayPart)}` : ""}`
    : null;
  return {
    id: result.identity,
    kind: result.kind === "restaurant" ? "restaurant" : "activity",
    title: result.title,
    location: result.location,
    description: result.description,
    image: result.image,
    category: result.category,
    duration: result.duration,
    price: result.price,
    dateSummary: when,
    bookingStatus: state.state === "planned" ? "Added to itinerary" : state.state === "saved" ? "Saved for later" : null,
    whyFit,
    whyFitLabel: "Why this fits your trip",
  };
}

export default function TripExploreWorkspace({
  trip,
  initialResults,
  initialDestinationId = "all",
  initialCategory = "for-you",
  initialSelectedResultId,
  initialProviderState = "ready",
  requestedDayNumber,
}: TripExploreWorkspaceProps) {
  const mutation = useTripMutationPersistence(trip, true);
  const workingTrip = mutation.trip;
  const destinations = useMemo(() => exploreDestinationOptions(trip), [trip]);
  const validInitialDestination = initialDestinationId === "all" || destinations.some((item) => item.id === initialDestinationId)
    ? initialDestinationId
    : "all";
  const [destinationId, setDestinationId] = useState(validInitialDestination);
  const [category, setCategory] = useState<ExploreCategory>(initialCategory);
  const [loadedResults, setLoadedResults] = useState<ExploreResult[]>(initialResults ?? []);
  const [loading, setLoading] = useState(!initialResults);
  const [providerState, setProviderState] = useState<ProviderState>(initialResults ? initialProviderState : "ready");
  const [selectedResultId, setSelectedResultId] = useState<string | null>(initialSelectedResultId ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedOriginRef = useRef<HTMLButtonElement | null>(null);

  const persistedResults = useMemo(() => (workingTrip.brief.itineraryIdeas ?? [])
    .flatMap((idea) => {
      const result = exploreResultForIdea(workingTrip, idea);
      return result ? [result] : [];
    }), [workingTrip]);
  const results = useMemo(() => dedupeExploreResults([...persistedResults, ...loadedResults]), [loadedResults, persistedResults]);
  const visibleResults = useMemo(() => filterExploreResults(workingTrip, results, destinationId, category), [category, destinationId, results, workingTrip]);
  const selectedResult = results.find((result) => result.identity === selectedResultId) ?? null;
  const opportunity = useMemo(() => exploreOpportunityForTrip(workingTrip, destinationId), [destinationId, workingTrip]);
  const activeDestination = destinationId === "all" ? null : destinations.find((item) => item.id === destinationId) ?? null;

  const closeDetail = useCallback(() => {
    setSelectedResultId(null);
    const origin = selectedOriginRef.current;
    selectedOriginRef.current = null;
    window.requestAnimationFrame(() => origin?.focus());
  }, []);

  useEffect(() => {
    if (initialResults) return;
    const controller = new AbortController();
    const scopedStops = destinationId === "all"
      ? destinations.map((item) => item.stop)
      : destinations.filter((item) => item.id === destinationId).map((item) => item.stop);
    const plan = sourcePlan(category, trip);
    setLoading(true);
    setProviderState("ready");
    setLoadedResults([]);
    const requests = scopedStops.flatMap((stop) => [
      ...(plan.mapped ? [loadMappedPlaces(trip, stop, controller.signal)] : []),
      ...(plan.restaurants ? [loadRestaurants(stop, controller.signal)] : []),
      ...(plan.tours ? [loadTours(trip, stop, controller.signal)] : []),
    ]);
    void Promise.allSettled(requests).then((settled) => {
      if (controller.signal.aborted) return;
      const fulfilled = settled.flatMap((entry) => entry.status === "fulfilled" ? entry.value : []);
      const failed = settled.some((entry) => entry.status === "rejected");
      setLoadedResults(dedupeExploreResults(fulfilled));
      setProviderState(failed ? "degraded" : fulfilled.length ? "ready" : "empty");
      setLoading(false);
    });
    return () => controller.abort();
  }, [category, destinationId, destinations, initialResults, trip]);

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
    const target = exploreScheduleTarget(workingTrip, result, requestedDayNumber);
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
  const pageMapHref = mapWorkspaceHref(
    workingTrip.id,
    activeDestination?.id ?? opportunity?.stop.id ?? destinations[0]?.id,
    "see",
    opportunity?.day.dayNumber,
  );

  return <section className={styles.workspace} aria-labelledby="explore-title">
    <div className={styles.main}>
      <header className={styles.header}>
        <div>
          <p><Sparkles aria-hidden="true" />Trip-aware discovery</p>
          <h2 id="explore-title">Explore</h2>
          <span>Find useful places and experiences already matched to this trip.</span>
        </div>
        <MorroviaSaveStatus state={mutation.saveState} />
      </header>

      {opportunity ? <aside className={styles.opportunity}>
        <CalendarPlus aria-hidden="true" />
        <div><strong>Your {titleCase(opportunity.dayPart)} is still open on Day {opportunity.day.dayNumber} in {opportunity.stop.name}.</strong><span>Ideas you add can use this real gap in the itinerary.</span></div>
        <EasyTLinkButton href={itineraryWorkspaceHref(workingTrip.id, opportunity.day.dayNumber)} size="small" variant="quiet">View day</EasyTLinkButton>
      </aside> : null}

      {notice ? <div className={styles.notice} role="status"><Check aria-hidden="true" />{notice}<EasyTButton size="small" variant="quiet" onClick={() => setNotice(null)}>Dismiss</EasyTButton></div> : null}
      {mutation.error ? <MorroviaStatusBanner tone="warning" title="This change is safe on this device" detail={mutation.error} /> : null}

      <div className={styles.filtersRow}>
        <EasyTSelect
          fieldClassName={styles.destinationField}
          label="Explore destination"
          value={destinationId}
          onChange={(event) => {
            const next = event.target.value;
            setDestinationId(next);
            setSelectedResultId(null);
            trackEvent("explore_destination_changed", { trip_id: workingTrip.id, destination_scope: next === "all" ? "all" : "stop" });
          }}
        >
          <option value="all">All trip</option>
          {destinations.map((destination) => <option value={destination.id} key={destination.id}>{destination.label}</option>)}
        </EasyTSelect>
        <EasyTLinkButton href={pageMapHref} icon={MapIcon} variant="secondary">Open map</EasyTLinkButton>
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
        {!loading ? <small>{visibleResults.length} {visibleResults.length === 1 ? "idea" : "ideas"}</small> : null}
      </div>

      {loading ? <div className={styles.loading} aria-label="Finding trip ideas">
        <MorroviaSectionStatus title="Finding ideas for this trip" detail={`Checking trustworthy sources around ${destinationLabel}.`} />
        <div aria-hidden="true"><MorroviaSkeleton height={330} radius="card" /><MorroviaSkeleton height={330} radius="card" /><MorroviaSkeleton height={330} radius="card" /></div>
      </div> : null}
      {!loading && providerState === "degraded" && visibleResults.length ? <p className={styles.degraded}>Some live sources are temporarily unavailable. The verified ideas already loaded remain usable.</p> : null}
      {!loading && !visibleResults.length ? providerState === "degraded" ? <MorroviaSectionStatus
        state="error"
        title="Some ideas are unavailable"
        detail="Your trip and saved ideas are unchanged. Try this category again later."
      /> : <section className={styles.empty} aria-live="polite"><strong>No {exploreCategoryLabels[category].toLocaleLowerCase()} ideas found</strong><p>Nothing trustworthy is available for {destinationLabel} in this category yet.</p></section> : null}

      {!loading && visibleResults.length ? <div className={styles.grid} id="explore-results">
        {visibleResults.map((result) => {
          const state = exploreResultState(workingTrip, result);
          const target = exploreScheduleTarget(workingTrip, result, requestedDayNumber);
          const fitReason = itineraryInterestReason({ title: result.title, type: result.category, tags: result.tags, description: result.description ?? "" }, tripIntentForTrip(workingTrip).preferences.interests);
          const pending = mutation.isPending(`explore-save-${result.identity}`) || mutation.isPending(`explore-schedule-${result.identity}`);
          return <article className={`${styles.card} ${selectedResultId === result.identity ? styles.cardSelected : ""}`} key={result.identity} data-result-state={state.state}>
            <div className={styles.cardImage}>
              <ResilientImage src={result.image} alt="" fallback={<span><MapPin aria-hidden="true" /><small>Image unavailable</small></span>} />
              {state.state === "saved" ? <span className={styles.savedBadge}><Bookmark aria-hidden="true" />Saved</span> : null}
            </div>
            <div className={styles.cardBody}>
              <EasyTButton type="button" className={styles.cardOpen} iconOnly variant="quiet" aria-label={`Open details for ${result.title}`} aria-pressed={selectedResultId === result.identity} onClick={(event) => openDetail(result, event.currentTarget)}>Open details</EasyTButton>
              <div className={styles.cardCopy}>
                <h3>{result.title}</h3>
                <p className={styles.meta}><MapPin aria-hidden="true" />{result.location}<span>·</span>{result.category}{result.duration ? <><span>·</span><Clock3 aria-hidden="true" />{result.duration}</> : null}</p>
                {result.description ? <p className={styles.description}>{result.description}</p> : null}
                {fitReason ? <p className={styles.fit}><Sparkles aria-hidden="true" />{fitReason}</p> : null}
                {state.state === "planned" ? <p className={styles.planned}><Check aria-hidden="true" />Added to Day {state.day.dayNumber}{state.idea.dayPart ? ` · ${titleCase(state.idea.dayPart)}` : ""}</p> : null}
              </div>
              <div className={styles.cardActions}>
                {state.state === "planned" ? <>
                  <EasyTLinkButton size="small" variant="secondary" href={itineraryWorkspaceHref(workingTrip.id, state.day.dayNumber)}>View day</EasyTLinkButton>
                  <EasyTButton size="small" variant="quiet" disabled={pending} onClick={() => removeResult(result)}>Remove</EasyTButton>
                </> : <>
                  <EasyTButton icon={CalendarPlus} size="small" disabled={!target || pending} onClick={() => scheduleResult(result)}>{target ? `Add to Day ${target.day.dayNumber}` : "No day available"}</EasyTButton>
                  {state.state === "saved"
                    ? <span className={styles.savedState}><Bookmark aria-hidden="true" />Saved for later</span>
                    : <EasyTButton icon={Bookmark} size="small" variant="secondary" disabled={pending} aria-label={`Save ${result.title} for later`} onClick={() => saveResult(result)}>Save for later</EasyTButton>}
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
        const target = exploreScheduleTarget(workingTrip, selectedResult, requestedDayNumber);
        const interest = tripIntentForTrip(workingTrip).preferences.interests;
        const whyFit = itineraryInterestReason({ title: selectedResult.title, type: selectedResult.category, tags: selectedResult.tags, description: selectedResult.description ?? "" }, interest);
        const mode = selectedResult.kind === "restaurant" ? "eat" : "see";
        const mapHref = selectedResult.coordinates
          ? mapWorkspaceHref(workingTrip.id, selectedResult.stopId, mode, target?.day.dayNumber)
          : null;
        return <ItineraryItemDetail
          detail={detailForResult(selectedResult, state, whyFit)}
          mapHref={mapHref}
          pending={mutation.isPending(`explore-save-${selectedResult.identity}`) || mutation.isPending(`explore-schedule-${selectedResult.identity}`)}
          onClose={closeDetail}
          primaryActions={<>
            {state.state !== "planned" && target ? <EasyTButton icon={CalendarPlus} fullWidth onClick={() => scheduleResult(selectedResult)}>Add to Day {target.day.dayNumber}</EasyTButton> : null}
            {state.state === "available" ? <EasyTButton icon={Bookmark} variant="secondary" onClick={() => saveResult(selectedResult)}>Save for later</EasyTButton> : null}
            {state.state === "planned" ? <EasyTLinkButton icon={CalendarPlus} variant="secondary" href={itineraryWorkspaceHref(workingTrip.id, state.day.dayNumber)}>View in itinerary</EasyTLinkButton> : null}
            {selectedResult.provider === "viator" && selectedResult.providerUrl ? <MorroviaAffiliateLink
              action={{ provider: "viator", category: "activities", href: selectedResult.providerUrl, cta: "View on Viator", affiliate: true }}
              context={{ placement: "itinerary_day_experiences", tripId: workingTrip.id, stopId: selectedResult.stopId, workspaceView: "explore" }}
              variant="secondary"
              onClick={() => trackEvent("explore_provider_handoff", { trip_id: workingTrip.id, stop_id: selectedResult.stopId, provider: "viator" })}
            /> : null}
          </>}
        />;
      })() : <>
        <section className={styles.mapContext}>
          <header><div><span>Location context</span><h3>{activeDestination?.label ?? "Your route"}</h3></div><MapIcon aria-hidden="true" /></header>
          <div className={styles.mapPlaceholder}><MapPin aria-hidden="true" /><strong>{activeDestination?.label ?? `${destinations.length} trip destinations`}</strong><span>Open the full Map to see route geometry and exact saved pins.</span></div>
          <EasyTLinkButton href={pageMapHref} icon={ExternalLink} variant="quiet" fullWidth>Open full map</EasyTLinkButton>
        </section>
        {opportunity ? <section className={styles.dayContext}>
          <span>Day {opportunity.day.dayNumber} opportunity</span>
          <h3>{titleCase(opportunity.dayPart)} in {opportunity.stop.name}</h3>
          <p>No canonical activity is scheduled in this part of the day yet.</p>
          <EasyTLinkButton href={itineraryWorkspaceHref(workingTrip.id, opportunity.day.dayNumber)} variant="secondary" fullWidth>View itinerary day</EasyTLinkButton>
        </section> : null}
        <section className={styles.railHint}><Sparkles aria-hidden="true" /><div><strong>Turn an idea into part of the trip</strong><span>Open a card for detail, save it without scheduling, or add it to a real day.</span></div></section>
        {category === "tours" || category === "day-trips" ? <small className={styles.disclosure}>Experiences from Viator · {affiliateDisclosure}</small> : null}
      </>}
    </aside>
  </section>;
}
