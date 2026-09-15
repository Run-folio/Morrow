"use client";

import { ArrowUpRight, BedDouble, MapPin, RotateCcw, Utensils } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { JourneyRestaurant, RestaurantMeal } from "@/lib/journey";
import { finderMoments, recommendNearbyPlace, type FinderMoment } from "@/lib/easyt/recommendations";
import { defaultTravelProfile, travelProfileFromUnknown, type TravelProfile } from "@/lib/easyt/travel-profile";
import type { TripInterest } from "@/lib/easyt/trip-interest";
import { trackEvent } from "@/lib/analytics";
import { affiliatePartners, getAccommodationBookingUrl } from "@/lib/easyt/booking-readiness";
import styles from "@/app/journey/journey.module.css";
import { travelProfileStorageKey } from "@/lib/easyt/private-browser-context";
import { authClient } from "@/lib/auth-client";
import { MorroviaSectionStatus, MorroviaSkeleton } from "@/components/easyt/morrovia-loading-states";
import { compactAffiliateDisclosure } from "@/components/easyt/affiliate-link";
import { localFinderBaseQueryKey, localFinderQueryKey, mergeLocalFinderPlaces } from "@/lib/easyt/local-finder-query";
import { loadLocalFinderBaseResult, peekLocalFinderBaseResult } from "@/lib/easyt/local-finder-base-cache";
import { recommendationDurationMs, streamIndependentRecommendationLanes } from "@/lib/easyt/recommendation-performance";
import {
  accommodationInventoryPayload,
  hasBookingLiveInformation,
  localSearchPayload,
  type AccommodationInventoryStatus,
  type JourneyLocalFinderInitialState,
  type JourneyLocalPlace,
} from "@/lib/easyt/local-place";
import { rankedStayShortlist } from "@/lib/easyt/stay-workspace";

export type { AccommodationInventoryStatus, JourneyLocalFinderInitialState, JourneyLocalPlace } from "@/lib/easyt/local-place";
type MealPace = "quick" | "relaxed" | "occasion";
type MealMood = "local" | "comfort" | "surprise";
export type StaySearch = { checkIn?: string; checkOut?: string; adults?: number; rooms?: number; currency?: string; bookerCountry?: string };

function stayCandidateFacts(place: JourneyLocalPlace) {
  const hasBookingFacts = hasBookingLiveInformation(place);
  const availability = hasBookingFacts && place.availability === "available"
    ? "Booking.com live information · Available for your dates"
    : place.operational === true
      ? "Operational property · check rooms"
      : "Mapped property · check before booking";
  const ratingSource = place.provider === "booking-demand" ? "Booking.com"
    : place.provider === "google-places" ? "Google Places"
      : null;
  return [
    availability,
    place.rating ? `${place.rating.toFixed(1)}${ratingSource ? ` ${ratingSource}` : ""} rating` : null,
    hasBookingFacts && place.availability === "available" && place.price ? `${place.price.currency} ${place.price.total.toFixed(0)} Booking.com price` : null,
  ].filter(Boolean).join(" · ");
}

export type JourneyLocalFinderRenderState = {
  candidates: JourneyLocalPlace[];
  selectedPlace: JourneyLocalPlace | null;
  loading: boolean;
  status: "loading" | "ready" | "empty" | "failed";
  accommodationInventoryStatus: AccommodationInventoryStatus;
  selectPlace: (place: JourneyLocalPlace) => void;
  clearSelection: () => void;
  retry: () => void;
};

type JourneyLocalFinderProps = {
  ownerId?: string | null;
  tripId?: string;
  stopId?: string;
  canonicalPlaceId?: string;
  kind: "restaurant" | "stay";
  city: string;
  country: string;
  locale?: string;
  dayId: string;
  dayNumber?: number;
  coordinates: [number, number];
  interests?: readonly TripInterest[];
  staySearch?: StaySearch;
  selectedPlaceId?: string | null;
  savedPlaceIds?: readonly string[];
  initialState?: JourneyLocalFinderInitialState;
  candidateLimit?: number;
  autoSelectFirst?: boolean;
  analyticsSurface?: "map" | "stay";
  render?: (state: JourneyLocalFinderRenderState) => ReactNode;
  onPlaceSelect?: (place: JourneyLocalPlace) => void;
  onViewOnMap?: (place: JourneyLocalPlace) => void;
  onPlacesChange?: (places: JourneyLocalPlace[]) => void;
  onRestaurantSelect?: (restaurant?: JourneyRestaurant, meal?: RestaurantMeal) => void;
  onSavePlace?: (place: JourneyLocalPlace, kind: "restaurant" | "stay", replaced?: JourneyLocalPlace) => boolean | void;
  onRemovePlace?: (place: JourneyLocalPlace, kind: "restaurant" | "stay") => boolean | void;
};

export function JourneyLocalFinder({ ownerId, tripId, stopId, canonicalPlaceId, kind, city, country, locale = "en", dayId, dayNumber, coordinates, interests, staySearch, selectedPlaceId, savedPlaceIds, initialState, candidateLimit = 4, autoSelectFirst = true, analyticsSurface = "map", render, onPlaceSelect, onViewOnMap, onPlacesChange, onRestaurantSelect, onSavePlace, onRemovePlace }: JourneyLocalFinderProps) {
  const longitude = coordinates[0];
  const latitude = coordinates[1];
  const baseResultKey = localFinderBaseQueryKey({ kind, city, country, canonicalPlaceId, dayId: stopId ?? dayId, coordinates: [longitude, latitude], locale });
  const cachedBasePayload = initialState || kind !== "stay" ? null : peekLocalFinderBaseResult<ReturnType<typeof localSearchPayload>>(baseResultKey);
  const initialCorePlaces = initialState?.corePlaces ?? cachedBasePayload?.places ?? [];
  const { data: session } = authClient.useSession();
  const contextOwnerId = session?.user?.id ?? ownerId ?? null;
  // These defaults are the existing “Show best matches” choice. Keeping them
  // selected makes the finder useful immediately; the same controls remain
  // available as optional refinements below.
  const [meal, setMeal] = useState<RestaurantMeal | undefined>("dinner");
  const [pace, setPace] = useState<MealPace | undefined>("relaxed");
  const [mood, setMood] = useState<MealMood | undefined>("local");
  const [moment, setMoment] = useState<FinderMoment | undefined>("now");
  const [profile, setProfile] = useState<TravelProfile>(defaultTravelProfile);
  const [corePlaces, setCorePlaces] = useState<JourneyLocalPlace[]>(initialCorePlaces);
  const [commercialPlaces, setCommercialPlaces] = useState<JourneyLocalPlace[]>(initialState?.commercialPlaces ?? []);
  const [chosen, setChosen] = useState<JourneyLocalPlace | null>(null);
  const [saved, setSaved] = useState<JourneyLocalPlace | null>(null);
  const [loading, setLoading] = useState(initialState?.coreLoading ?? (!initialState && initialCorePlaces.length === 0));
  const [searchUnavailable, setSearchUnavailable] = useState(initialState?.coreUnavailable ?? false);
  const [searchVersion, setSearchVersion] = useState(0);
  const [accommodationInventoryStatus, setAccommodationInventoryStatus] = useState<AccommodationInventoryStatus>(initialState?.accommodationInventoryStatus ?? "not-requested");
  const reportedSaveRef = useRef("");
  const reportedAccommodationSearchRef = useRef("");
  const autoSelectedRef = useRef(false);
  const loadedBaseResultKeyRef = useRef<string | null>(initialCorePlaces.length ? baseResultKey : null);
  const performanceRequestRef = useRef<{ token: string; startedAt: number } | null>(null);
  const firstUsefulPerformanceRef = useRef("");
  const storageKey = `journey:local-${kind}:v3`;
  const canonicalSavedState = savedPlaceIds !== undefined;
  const label = kind === "restaurant" ? "Restaurant finder" : "Stay finder";
  const Icon = kind === "restaurant" ? Utensils : BedDouble;
  const isReady = kind === "restaurant" ? Boolean(meal && pace && mood) : true;
  const places = useMemo(() => mergeLocalFinderPlaces(corePlaces, commercialPlaces), [commercialPlaces, corePlaces]);
  const liveInventory = commercialPlaces.length > 0;
  const displayPlaces = useMemo(() => kind === "stay" ? places.filter((place) => !/construction/i.test(place.category)) : places, [kind, places]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(travelProfileStorageKey(contextOwnerId)) ?? "null");
      const savedProfile = travelProfileFromUnknown(stored);
      if (savedProfile) setProfile(savedProfile);
    } catch { /* Finder recommendations stay useful with the default profile. */ }
  }, [contextOwnerId]);

  useEffect(() => {
    let active = true;
    if (initialState) return;
    const controller = new AbortController();
    // Retrying the same provider request should never blank a useful local
    // shortlist. A changed stop, date range, or finder kind is a genuinely
    // different result set, so it starts from the honest initial state.
    const resultKey = localFinderQueryKey({ kind, city, country, canonicalPlaceId, dayId, coordinates: [longitude, latitude], locale, staySearch });
    const cachedBaseResult = kind === "stay" ? peekLocalFinderBaseResult<ReturnType<typeof localSearchPayload>>(baseResultKey) : null;
    const retainExistingResults = Boolean(cachedBaseResult?.places.length)
      || (loadedBaseResultKeyRef.current === baseResultKey && corePlaces.length > 0);
    const startedAt = performance.now();
    performanceRequestRef.current = { token: `${resultKey}:${searchVersion}`, startedAt };
    const hasCommercialLane = kind === "stay" && Boolean(staySearch?.checkIn && staySearch?.checkOut);
    const reportPerformance = (lane: "core" | "commercial", resultCount: number, outcome: "ready" | "empty" | "unavailable") => {
      const properties = {
        surface: analyticsSurface,
        recommendation_kind: kind === "stay" ? "accommodation" as const : "restaurant" as const,
        lane,
        duration_ms: recommendationDurationMs(startedAt, performance.now()),
        result_count: resultCount,
        outcome,
      };
      trackEvent("recommendation_performance", { ...properties, milestone: "lane_ready" });
    };
    if (kind === "stay") {
      const searchKey = `${dayId}:${longitude}:${latitude}:${staySearch?.checkIn ?? ""}:${staySearch?.checkOut ?? ""}`;
      if (reportedAccommodationSearchRef.current !== searchKey) {
        reportedAccommodationSearchRef.current = searchKey;
        trackEvent("accommodation_search_started", {
          source: analyticsSurface,
          destination_count: 1,
          has_dates: Boolean(staySearch?.checkIn && staySearch?.checkOut),
          provider: staySearch?.checkIn && staySearch?.checkOut ? "booking-demand_or_map" : "map",
        });
      }
    }
    if (cachedBaseResult?.places.length) {
      setCorePlaces(cachedBaseResult.places);
      loadedBaseResultKeyRef.current = baseResultKey;
    }
    setLoading(!retainExistingResults);
    setSearchUnavailable(false);
    // Date-specific inventory is no-store provider truth. Never retain it
    // through a retry or context change when the new request has not confirmed
    // current availability yet.
    setCommercialPlaces([]);
    setAccommodationInventoryStatus(hasCommercialLane ? "loading" : "not-requested");
    if (!retainExistingResults) {
      setCorePlaces([]);
      setChosen(null);
      setSaved(null);
      setMeal("dinner");
      setPace("relaxed");
      setMood("local");
      setMoment("now");
      autoSelectedRef.current = false;
    }
    type FinderLaneValue =
      | { lane: "core"; payload: ReturnType<typeof localSearchPayload> }
      | { lane: "commercial"; payload: ReturnType<typeof accommodationInventoryPayload> };
    const lanes = [
      {
        lane: "core" as const,
        request: async (): Promise<FinderLaneValue> => {
          // Shared base requests deliberately outlive an individual mount. The
          // active-scope guard below prevents stale publication, while a rapid
          // return to the same stop can reuse the same safe mapped-place work.
          const requestBasePlaces = async () => {
            const query = new URLSearchParams({ kind, city, country, lat: String(latitude), lon: String(longitude), locale });
            if (canonicalPlaceId) query.set("canonicalPlaceId", canonicalPlaceId);
            const response = await fetch(`/api/journey-local-search?${query}`);
            if (!response.ok) throw new Error("Local recommendations unavailable");
            return localSearchPayload(await response.json());
          };
          const payload = kind === "stay"
            ? await loadLocalFinderBaseResult(baseResultKey, requestBasePlaces, { shouldCache: (result) => result.places.length > 0 && !result.unavailable })
            : await requestBasePlaces();
          return { lane: "core", payload };
        },
      },
      ...(hasCommercialLane ? [{
        lane: "commercial" as const,
        request: async (): Promise<FinderLaneValue> => {
          const response = await fetch(`/api/journey-accommodation-search?${new URLSearchParams({ lat: String(latitude), lon: String(longitude), checkIn: staySearch!.checkIn!, checkOut: staySearch!.checkOut!, adults: String(staySearch?.adults ?? 1), rooms: String(staySearch?.rooms ?? 1), currency: staySearch?.currency ?? "USD", locale, ...(staySearch?.bookerCountry ? { bookerCountry: staySearch.bookerCountry } : {}) })}`, { signal: controller.signal });
          if (!response.ok) throw new Error("Live accommodation inventory unavailable");
          return { lane: "commercial", payload: accommodationInventoryPayload(await response.json()) };
        },
      }] : []),
    ];
    void streamIndependentRecommendationLanes(lanes, (settlement) => {
      if (!active) return;
      if (settlement.status === "failed") {
        if (settlement.lane === "core") {
          if (!retainExistingResults) setCorePlaces([]);
          loadedBaseResultKeyRef.current = baseResultKey;
          setSearchUnavailable(true);
          setLoading(false);
          reportPerformance("core", 0, "unavailable");
        } else {
          setAccommodationInventoryStatus("unavailable");
          reportPerformance("commercial", 0, "unavailable");
        }
        return;
      }
      if (settlement.value.lane === "core") {
        const { places: nextPlaces, unavailable } = settlement.value.payload;
        if (!retainExistingResults || nextPlaces.length > 0 || !unavailable) setCorePlaces(nextPlaces);
        loadedBaseResultKeyRef.current = baseResultKey;
        setSearchUnavailable(unavailable);
        setLoading(false);
        reportPerformance("core", nextPlaces.length, unavailable ? "unavailable" : nextPlaces.length ? "ready" : "empty");
        return;
      }
      const { properties, unavailable, configured } = settlement.value.payload;
      setCommercialPlaces(properties);
      setAccommodationInventoryStatus(properties.length
        ? "live"
        : unavailable
          ? "unavailable"
          : configured === false
            ? "unconfigured"
            : "empty");
      reportPerformance("commercial", properties.length, unavailable ? "unavailable" : properties.length ? "ready" : "empty");
    });
    try {
      const store = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Record<string, JourneyLocalPlace>;
      if (!canonicalSavedState && store[dayId]) { setSaved(store[dayId]); setChosen(store[dayId]); }
    } catch { /* The finder remains usable without local persistence. */ }
    return () => { active = false; controller.abort(); };
  }, [analyticsSurface, baseResultKey, canonicalPlaceId, canonicalSavedState, city, country, dayId, initialState, kind, latitude, locale, longitude, searchVersion, staySearch?.adults, staySearch?.bookerCountry, staySearch?.checkIn, staySearch?.checkOut, staySearch?.currency, staySearch?.rooms, storageKey]);

  useEffect(() => {
    const measurement = performanceRequestRef.current;
    if (!measurement || loading || !corePlaces.length || firstUsefulPerformanceRef.current === measurement.token) return;
    firstUsefulPerformanceRef.current = measurement.token;
    trackEvent("recommendation_performance", {
      surface: analyticsSurface,
      recommendation_kind: kind === "stay" ? "accommodation" : "restaurant",
      lane: "core",
      milestone: "first_useful",
      duration_ms: recommendationDurationMs(measurement.startedAt, performance.now()),
      result_count: corePlaces.length,
      outcome: "ready",
    });
  }, [analyticsSurface, corePlaces, kind, loading]);

  useEffect(() => {
    if (kind !== "restaurant" || !saved || !onRestaurantSelect) return onRestaurantSelect?.();
    onRestaurantSelect({ name: saved.name, area: city, summary: saved.address, order: "Confirm current opening hours", pace: [pace ?? "quick"], craving: ["signature"], spend: ["mid"], meal: [meal ?? "dinner"], dish: ["local"], coordinates: saved.coordinates, fit: `Added to this specific ${city} day.`, mapsUrl: saved.mapsUrl }, meal ?? "dinner");
  }, [city, kind, meal, onRestaurantSelect, pace, saved]);

  useEffect(() => {
    if (!saved) {
      reportedSaveRef.current = "";
      return;
    }
    const savedKey = `${kind}:${dayId}:${saved.id}`;
    if (reportedSaveRef.current === savedKey) return;
    reportedSaveRef.current = savedKey;
    onSavePlace?.(saved, kind);
  }, [dayId, kind, onSavePlace, saved]);

  const candidates = useMemo(() => {
    if (!isReady) return [];
    const query = mood === "local" ? /local|regional|traditional|seafood|sushi|ramen|curry|noodle/i : mood === "comfort" ? /cafe|fast|burger|pizza|ramen|noodle|bakery/i : /restaurant|cafe|hotel|guest/i;
    const matched = kind === "stay" ? displayPlaces : displayPlaces.filter((place) => query.test(`${place.name} ${place.category}`));
    const isGenericStayName = (place: JourneyLocalPlace) => kind === "stay" && /^(hotel|hostel|guesthouse|apartment)$/i.test(place.name.trim());
    if (kind === "stay") {
      const context = {
        key: dayId,
        stop: { id: stopId ?? dayId, order: 0, name: city, country, latitude, longitude, arrivalDate: staySearch?.checkIn ?? null, departureDate: staySearch?.checkOut ?? null, nights: null },
        nights: 0,
        checkIn: staySearch?.checkIn ?? null,
        checkOut: staySearch?.checkOut ?? null,
        dateLabel: "",
        plannedCoordinates: [],
        plannedCentroid: null,
        clusterRadiusKm: null,
        searchCoordinates: [longitude, latitude] as [number, number],
      };
      return rankedStayShortlist(matched.length ? matched : displayPlaces, context, candidateLimit)
        .map((place) => ({ place, recommendation: recommendNearbyPlace(place, { kind, moment, mood, pace, profile, interests }) }));
    }
    return (matched.length ? matched : displayPlaces)
      .map((place) => ({ place, recommendation: recommendNearbyPlace(place, { kind, moment, mood, pace, profile, interests }) }))
      .sort((a, b) => Number(b.place.availability === "available") - Number(a.place.availability === "available") || Number(isGenericStayName(a.place)) - Number(isGenericStayName(b.place)) || b.recommendation.score - a.recommendation.score)
      .slice(0, candidateLimit);
  }, [candidateLimit, city, country, dayId, displayPlaces, interests, isReady, kind, latitude, longitude, moment, mood, pace, profile, staySearch?.checkIn, staySearch?.checkOut, stopId]);

  useEffect(() => {
    onPlacesChange?.(candidates.map(({ place }) => place));
    return () => onPlacesChange?.([]);
  }, [candidates, onPlacesChange]);

  useEffect(() => {
    if (!selectedPlaceId) return;
    const next = displayPlaces.find((place) => place.id === selectedPlaceId);
    if (next) setChosen(next);
  }, [displayPlaces, selectedPlaceId]);

  const choosePlace = (place: JourneyLocalPlace) => {
    setChosen(place);
    onPlaceSelect?.(place);
  };

  useEffect(() => {
    if (!autoSelectFirst || kind !== "stay" || autoSelectedRef.current || saved || !candidates[0]) return;
    autoSelectedRef.current = true;
    setChosen(candidates[0].place);
    onPlaceSelect?.(candidates[0].place);
  }, [autoSelectFirst, candidates, kind, onPlaceSelect, saved]);

  const stayBookingUrl = useMemo(() => {
    if (kind !== "stay" || !chosen) return undefined;
    return getAccommodationBookingUrl({
      stop: { id: stopId ?? dayId, name: city, country },
      dates: { checkIn: staySearch?.checkIn ?? "", checkOut: staySearch?.checkOut ?? "" },
      travellers: Math.max(1, staySearch?.adults ?? 1),
    });
  }, [chosen, city, country, dayId, kind, staySearch?.adults, staySearch?.checkIn, staySearch?.checkOut, stopId]);

  const save = () => {
    if (!chosen) return;
    // A stop has one canonical stay booking, but restaurants are additive.
    // Keep the last saved restaurant as local UI context without turning it
    // into a request to remove an earlier canonical restaurant.
    const replaced = kind === "stay" && saved && saved.id !== chosen.id ? saved : undefined;
    const accepted = onSavePlace?.(chosen, kind, replaced ?? undefined);
    if (accepted === false) return;
    if (!canonicalSavedState) setSaved(chosen);
    reportedSaveRef.current = `${kind}:${dayId}:${chosen.id}`;
    if (!canonicalSavedState) {
      try { window.localStorage.setItem(storageKey, JSON.stringify({ ...JSON.parse(window.localStorage.getItem(storageKey) ?? "{}"), [dayId]: chosen })); } catch { /* no-op */ }
    }
  };
  const reset = () => {
    const target = canonicalSavedState && chosen && savedPlaceIds?.includes(chosen.id) ? chosen : saved;
    if (target && onRemovePlace?.(target, kind) === false) return;
    setSaved(null);
    setChosen(null);
    setMeal("dinner");
    setPace("relaxed");
    setMood("local");
    setMoment("now");
    if (!canonicalSavedState) {
      try {
        const store = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Record<string, JourneyLocalPlace>;
        delete store[dayId];
        window.localStorage.setItem(storageKey, JSON.stringify(store));
      } catch { /* The in-memory finder state is still cleared. */ }
    }
  };

  if (render) {
    const status = candidates.length
      ? "ready"
      : loading || accommodationInventoryStatus === "loading"
        ? "loading"
        : searchUnavailable || accommodationInventoryStatus === "unavailable"
          ? "failed"
          : "empty";
    return render({
      candidates: candidates.map(({ place }) => place),
      selectedPlace: chosen,
      loading,
      status,
      accommodationInventoryStatus,
      selectPlace: choosePlace,
      clearSelection: () => setChosen(null),
      retry: () => setSearchVersion((current) => current + 1),
    });
  }

  return <section className={`${styles.restaurantFinder} ${kind === "stay" ? styles.finderStay : styles.finderEat}`} aria-label={`${label} for ${city}`}>
    <header><span><Icon /></span><div><small>{kind === "stay" ? `STAY IN ${city}` : `EAT IN ${city}`}</small><strong>{loading ? "Nearby options" : displayPlaces.length ? `${displayPlaces.length} ${kind === "stay" ? "stays" : "places"} nearby` : searchUnavailable ? "Search unavailable" : kind === "stay" ? "No stays found" : "No places found"}</strong></div></header>
    {loading ? <MorroviaSectionStatus title={kind === "stay" ? "Checking stay options" : "Finding places nearby"} detail={kind === "stay" ? "Looking for options that fit your dates and selected stop." : "Keeping this day and map context in place while local results load."} /> : null}
    {loading && !displayPlaces.length ? <div className={styles.localLoadingSkeletons} aria-hidden="true"><MorroviaSkeleton height={58} radius="card" /><MorroviaSkeleton height={58} radius="card" /></div> : null}
    {!loading && kind === "stay" && accommodationInventoryStatus === "loading" && displayPlaces.length ? <p className={styles.restaurantLocalNote} role="status">Mapped stays are ready to use. Current room availability is still loading.</p> : null}
    {!loading && kind === "stay" && accommodationInventoryStatus === "unavailable" && displayPlaces.length ? <p className={styles.restaurantLocalNote}>Mapped stays remain usable. Current room availability could not be checked.</p> : null}
    {!loading && kind === "stay" && accommodationInventoryStatus === "unconfigured" && displayPlaces.length ? <p className={styles.restaurantLocalNote}>Mapped stays are ready. Check current availability with the booking provider.</p> : null}
    {!loading && kind === "stay" && !displayPlaces.length && accommodationInventoryStatus === "loading" ? <MorroviaSectionStatus title="Checking current availability" detail="No mapped stay is ready yet. Your stop and dates remain in place while the live search finishes." /> : null}
    {!loading && kind === "stay" && !displayPlaces.length && accommodationInventoryStatus !== "loading" && (searchUnavailable || accommodationInventoryStatus === "unavailable") ? <MorroviaSectionStatus state="error" title="Stay options are unavailable" detail={accommodationInventoryStatus === "unavailable" ? "Live accommodation availability could not be checked, and no mapped stays are available for this base. Your trip is unchanged." : "Mapped stay results could not be loaded for this overnight base. Your trip is unchanged."} retryLabel="Try stay search again" onRetry={() => setSearchVersion((current) => current + 1)} /> : null}
    {!loading && kind === "restaurant" && !displayPlaces.length && searchUnavailable ? <MorroviaSectionStatus state="error" title="We couldn’t load places here right now" detail="Your day and map are unchanged." retryLabel="Try again" onRetry={() => setSearchVersion((current) => current + 1)} /> : null}
    {!loading && !displayPlaces.length && !searchUnavailable && accommodationInventoryStatus !== "loading" && accommodationInventoryStatus !== "unavailable" ? <p className={styles.restaurantLocalNote}>{kind === "stay" ? "No stays came back for this overnight base. Try the search again or use the accommodation link to check current options." : "No mapped venues came back for this area. Open Maps to search around the day’s location instead."}</p> : null}
    {!loading && kind === "restaurant" && displayPlaces.length ? <details className={styles.finderFilters}><summary>Filters</summary><div><>{finderMoments.map((option) => <button key={option.value} type="button" aria-pressed={moment === option.value} onClick={() => setMoment(option.value)}>{option.label}</button>)}{(["lunch", "dinner"] as const).map((option) => <button key={option} type="button" aria-pressed={meal === option} onClick={() => setMeal(option)}>{option}</button>)}{(["quick", "relaxed", "occasion"] as const).map((option) => <button key={option} type="button" aria-pressed={pace === option} onClick={() => setPace(option)}>{option}</button>)}{(["local", "comfort", "surprise"] as const).map((option) => <button key={option} type="button" aria-pressed={mood === option} onClick={() => setMood(option)}>{option}</button>)}</></div></details> : null}
    {chosen && !(kind === "stay" && selectedPlaceId) ? (() => { const chosenIsSaved = canonicalSavedState ? Boolean(savedPlaceIds?.includes(chosen.id)) : saved?.id === chosen.id; const hasBookingFacts = hasBookingLiveInformation(chosen); return <article className={`${styles.restaurantResult} ${kind === "stay" ? styles.featuredStay : ""}`} aria-current="true"><p><span>{chosenIsSaved ? kind === "stay" ? "Stay added" : `Added to Day ${dayNumber ?? ""}`.trim() : `Selected ${kind === "stay" ? "stay" : meal}`}</span>{chosenIsSaved ? <b>{dayNumber ? `Day ${dayNumber}` : "In today’s plan"} ↑</b> : kind === "stay" && chosen.availability === "available" ? <b>Room option found</b> : null}</p><h3>{chosen.name}</h3>{chosen.nativeName ? <span>{chosen.nativeName}</span> : null}<span><MapPin aria-hidden="true" /> {chosen.address}</span>{kind === "stay" && hasBookingFacts && chosen.availability === "available" && (chosen.price || (chosen.provider === "booking-demand" && chosen.rating)) ? <p className={styles.restaurantFit}>{["Booking.com live information", chosen.price ? `${chosen.price.currency} ${chosen.price.total.toFixed(0)} for your dates` : null, chosen.provider === "booking-demand" && chosen.rating ? `${chosen.rating.toFixed(1)} rating` : null].filter(Boolean).join(" · ")}</p> : kind === "restaurant" ? <p className={styles.restaurantFit}>{recommendNearbyPlace(chosen, { kind, moment, mood, pace, profile, interests }).reasons.join(" · ")}</p> : null}<div className={styles.restaurantActions}>{onPlaceSelect ? <button type="button" aria-label={`View ${chosen.name} on the map`} onClick={() => (onViewOnMap ?? onPlaceSelect)(chosen)}>View on map</button> : <a href={chosen.mapsUrl} target="_blank" rel="noopener noreferrer">Open in Maps <ArrowUpRight aria-hidden="true" /></a>}{kind === "stay" && stayBookingUrl ? <span className={styles.affiliateAction}><a href={stayBookingUrl} target="_blank" rel="sponsored noopener noreferrer" aria-label={`Check availability for ${chosen.name} independently on Trip.com, opens in a new tab`} onClick={() => trackEvent("affiliate_click", { category: "accommodation", provider: affiliatePartners.tripCom.provider, placement: "map_stay_finder", workspace_view: "map", destination_count: 1, ...(tripId ? { trip_id: tripId } : {}), ...(stopId ? { stop_id: stopId } : {}) })}>Check separately on Trip.com <ArrowUpRight aria-hidden="true" /></a>{hasBookingFacts ? <small>Trip.com confirms its own price, availability and terms.</small> : null}</span> : null}<button type="button" className={styles.restaurantSave} onClick={save} disabled={chosenIsSaved}>{chosenIsSaved ? dayNumber ? `Added to Day ${dayNumber}` : "Added to itinerary" : kind === "stay" && saved ? "Replace stay" : kind === "stay" ? "Add stay" : dayNumber ? `Add to Day ${dayNumber}` : "Add to day"}</button><button type="button" aria-label="Change selection" onClick={reset}><RotateCcw aria-hidden="true" /></button></div></article>; })() : null}
    {kind === "stay" && stayBookingUrl && !selectedPlaceId ? <small className={styles.finderAffiliateDisclosure}>{compactAffiliateDisclosure} <Link href="/journey/affiliate-disclosure">How partner links work</Link></small> : null}
    {isReady && candidates.length ? <div className={styles.localCandidates}><p><span>{kind === "restaurant" ? "RECOMMENDED NEARBY" : liveInventory ? "STAY SHORTLIST" : "RECOMMENDED NEARBY"}</span><b>{chosen ? "Browse options" : kind === "stay" ? "Shortlist" : "Best match"}</b></p>{candidates.map(({ place, recommendation }, index) => { const selected = place.id === chosen?.id || place.id === selectedPlaceId; return <button key={place.id} type="button" aria-pressed={selected} className={selected ? styles.localCandidateSelected : ""} onClick={() => choosePlace(place)}><span><strong>{kind === "restaurant" && !chosen && index === 0 ? "Best match · " : ""}{place.name}</strong>{place.nativeName ? <small>{place.nativeName}</small> : null}<small>{place.address}</small><small className={styles.finderWhy}>{kind === "stay" ? stayCandidateFacts(place) : `${recommendation.reasons[0]} · ${recommendation.confidence} confidence`}</small></span><em>{place.category.replace(/_/g, " ")}</em></button>; })}</div> : null}
  </section>;
}
