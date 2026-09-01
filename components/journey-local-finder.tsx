"use client";

import { ArrowUpRight, BedDouble, MapPin, RotateCcw, Utensils } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

export type JourneyLocalPlace = { id: string; name: string; nativeName?: string; address: string; category: string; coordinates: [number, number]; mapsUrl: string; distanceKm?: number; operational?: true; availability?: "available" | "check"; provider?: "booking-demand" | "google-places" | "openstreetmap"; rating?: number; priceLevel?: string; price?: { total: number; currency: string }; cancellation?: string };
type SavedLocalPlace = Pick<JourneyLocalPlace, "id" | "name" | "coordinates" | "provider">;
type MealPace = "quick" | "relaxed" | "occasion";
type MealMood = "local" | "comfort" | "surprise";
type StayStyle = "simple" | "character" | "comfort";
type StaySearch = { checkIn?: string; checkOut?: string; adults?: number; rooms?: number; currency?: string; bookerCountry?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isJourneyLocalPlace(value: unknown): value is JourneyLocalPlace {
  if (!isRecord(value)) return false;
  const coordinates = value.coordinates;
  const price = value.price;
  const validPrice = price === undefined || (isRecord(price)
    && typeof price.total === "number" && Number.isFinite(price.total)
    && typeof price.currency === "string" && Boolean(price.currency.trim()));
  const validProvider = value.provider === undefined || value.provider === "booking-demand" || value.provider === "google-places" || value.provider === "openstreetmap";
  const validAvailability = value.availability === undefined || value.availability === "available" || value.availability === "check";
  return typeof value.id === "string" && Boolean(value.id.trim())
    && typeof value.name === "string" && Boolean(value.name.trim())
    && (value.nativeName === undefined || typeof value.nativeName === "string")
    && typeof value.address === "string"
    && typeof value.category === "string"
    && typeof value.mapsUrl === "string" && Boolean(value.mapsUrl.trim())
    && Array.isArray(coordinates)
    && coordinates.length === 2
    && coordinates.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && (value.distanceKm === undefined || (typeof value.distanceKm === "number" && Number.isFinite(value.distanceKm)))
    && (value.operational === undefined || value.operational === true)
    && (value.rating === undefined || (typeof value.rating === "number" && Number.isFinite(value.rating)))
    && (value.priceLevel === undefined || typeof value.priceLevel === "string")
    && (value.cancellation === undefined || typeof value.cancellation === "string")
    && validAvailability
    && validProvider
    && validPrice;
}

function localSearchPayload(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.places)) {
    return { places: [] as JourneyLocalPlace[], unavailable: true };
  }
  const places = value.places.filter(isJourneyLocalPlace);
  return {
    places,
    unavailable: value.unavailable === true || places.length !== value.places.length,
  };
}

function inventorySearchPayload(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.properties)) {
    return { properties: [] as JourneyLocalPlace[], unavailable: true };
  }
  const properties = value.properties.filter(isJourneyLocalPlace);
  return {
    properties,
    unavailable: value.unavailable === true || properties.length !== value.properties.length,
  };
}

export function JourneyLocalFinder({ ownerId, tripId, stopId, kind, city, country, locale = "en", dayId, coordinates, interests, staySearch, selectedPlaceId, onPlaceSelect, onPlacesChange, onRestaurantSelect, onSavePlace, onRemovePlace }: { ownerId?: string | null; tripId?: string; stopId?: string; kind: "restaurant" | "stay"; city: string; country: string; locale?: string; dayId: string; coordinates: [number, number]; interests?: readonly TripInterest[]; staySearch?: StaySearch; selectedPlaceId?: string | null; onPlaceSelect?: (place: JourneyLocalPlace) => void; onPlacesChange?: (places: JourneyLocalPlace[]) => void; onRestaurantSelect?: (restaurant?: JourneyRestaurant, meal?: RestaurantMeal) => void; onSavePlace?: (place: SavedLocalPlace, kind: "restaurant" | "stay") => void; onRemovePlace?: (place: SavedLocalPlace, kind: "restaurant" | "stay") => void }) {
  const { data: session } = authClient.useSession();
  const contextOwnerId = session?.user?.id ?? ownerId ?? null;
  // These defaults are the existing “Show best matches” choice. Keeping them
  // selected makes the finder useful immediately; the same controls remain
  // available as optional refinements below.
  const [meal, setMeal] = useState<RestaurantMeal | undefined>("dinner");
  const [pace, setPace] = useState<MealPace | undefined>("relaxed");
  const [mood, setMood] = useState<MealMood | undefined>("local");
  const [stayStyle, setStayStyle] = useState<StayStyle | undefined>("simple");
  const [moment, setMoment] = useState<FinderMoment | undefined>("now");
  const [profile, setProfile] = useState<TravelProfile>(defaultTravelProfile);
  const [places, setPlaces] = useState<JourneyLocalPlace[]>([]);
  const [chosen, setChosen] = useState<JourneyLocalPlace | null>(null);
  const [saved, setSaved] = useState<JourneyLocalPlace | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const [searchVersion, setSearchVersion] = useState(0);
  const [liveInventory, setLiveInventory] = useState(false);
  const reportedSaveRef = useRef("");
  const reportedAccommodationSearchRef = useRef("");
  const autoSelectedRef = useRef(false);
  const loadedResultKeyRef = useRef<string | null>(null);
  const storageKey = `journey:local-${kind}:v3`;
  const label = kind === "restaurant" ? "Restaurant finder" : "Stay finder";
  const Icon = kind === "restaurant" ? Utensils : BedDouble;
  const isReady = kind === "restaurant" ? Boolean(meal && pace && mood) : Boolean(stayStyle);
  const longitude = coordinates[0];
  const latitude = coordinates[1];
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
    const controller = new AbortController();
    // Retrying the same provider request should never blank a useful local
    // shortlist. A changed stop, date range, or finder kind is a genuinely
    // different result set, so it starts from the honest initial state.
    const resultKey = [kind, city, country, dayId, latitude, longitude, locale, staySearch?.checkIn ?? "", staySearch?.checkOut ?? "", staySearch?.adults ?? "", staySearch?.rooms ?? "", staySearch?.currency ?? "", staySearch?.bookerCountry ?? ""].join("|");
    const retainExistingResults = searchVersion > 0 && loadedResultKeyRef.current === resultKey;
    if (kind === "stay") {
      const searchKey = `${dayId}:${longitude}:${latitude}:${staySearch?.checkIn ?? ""}:${staySearch?.checkOut ?? ""}`;
      if (reportedAccommodationSearchRef.current !== searchKey) {
        reportedAccommodationSearchRef.current = searchKey;
        trackEvent("accommodation_search_started", {
          source: "map",
          destination_count: 1,
          has_dates: Boolean(staySearch?.checkIn && staySearch?.checkOut),
          provider: staySearch?.checkIn && staySearch?.checkOut ? "booking-demand_or_map" : "map",
        });
      }
    }
    setLoading(true);
    setSearchUnavailable(false);
    setLiveInventory(false);
    if (!retainExistingResults) {
      setPlaces([]);
      setChosen(null);
      setSaved(null);
      setMeal("dinner");
      setPace("relaxed");
      setMood("local");
      setStayStyle("simple");
      setMoment("now");
      autoSelectedRef.current = false;
    }
    const localSearch = fetch(`/api/journey-local-search?kind=${kind}&city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&lat=${latitude}&lon=${longitude}&locale=${encodeURIComponent(locale)}`, { signal: controller.signal })
      .then(async (response) => response.ok
        ? localSearchPayload(await response.json())
        : { places: [] as JourneyLocalPlace[], unavailable: true })
      // A partner-confirmed stay must remain usable even when the independent
      // map lookup happens to be unavailable.
      .catch(() => ({ places: [] as JourneyLocalPlace[], unavailable: true }));
    const inventorySearch = kind === "stay" && staySearch?.checkIn && staySearch?.checkOut
      ? fetch(`/api/journey-accommodation-search?${new URLSearchParams({ lat: String(latitude), lon: String(longitude), checkIn: staySearch.checkIn, checkOut: staySearch.checkOut, adults: String(staySearch.adults ?? 1), rooms: String(staySearch.rooms ?? 1), currency: staySearch.currency ?? "USD", locale, ...(staySearch.bookerCountry ? { bookerCountry: staySearch.bookerCountry } : {}) })}`, { signal: controller.signal })
        .then(async (response) => response.ok
          ? inventorySearchPayload(await response.json())
          : { properties: [] as JourneyLocalPlace[], unavailable: true })
        // Inventory is an optional enhancement. Keep independent map results
        // when the partner request fails or returns malformed data.
        .catch(() => ({ properties: [] as JourneyLocalPlace[], unavailable: true }))
      : Promise.resolve({ properties: [] as JourneyLocalPlace[], unavailable: false });
    Promise.all([localSearch, inventorySearch])
      .then(([localData, inventoryData]) => {
        if (!active) return;
        const properties = inventoryData.properties;
        const combined = [...properties, ...localData.places];
        const uniquePlaces = combined.filter((place, index) => combined.findIndex((candidate) => candidate.id === place.id) === index);
        const providersReturnedUsableResult = uniquePlaces.length > 0 || (!localData.unavailable && !inventoryData.unavailable);
        // Retain the previous, still-usable list when this exact provider request fails.
        // A successful empty response remains meaningful and is allowed to replace it.
        if (!retainExistingResults || providersReturnedUsableResult) {
          setPlaces(uniquePlaces);
          setLiveInventory(properties.length > 0);
        }
        loadedResultKeyRef.current = resultKey;
        setSearchUnavailable(localData.unavailable);
      })
      .catch((error: unknown) => { if (active && (error as { name?: string })?.name !== "AbortError") { if (!retainExistingResults) setPlaces([]); setSearchUnavailable(true); } })
      .finally(() => { if (active) setLoading(false); });
    try {
      const store = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Record<string, JourneyLocalPlace>;
      if (store[dayId]) { setSaved(store[dayId]); setChosen(store[dayId]); }
    } catch { /* The finder remains usable without local persistence. */ }
    return () => { active = false; controller.abort(); };
  }, [city, country, dayId, kind, latitude, locale, longitude, searchVersion, staySearch?.adults, staySearch?.bookerCountry, staySearch?.checkIn, staySearch?.checkOut, staySearch?.currency, staySearch?.rooms, storageKey]);

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
    onSavePlace?.({ id: saved.id, name: saved.name, coordinates: saved.coordinates, provider: saved.provider }, kind);
  }, [dayId, kind, onSavePlace, saved]);

  const candidates = useMemo(() => {
    if (!isReady) return [];
    const query = mood === "local" ? /local|regional|traditional|seafood|sushi|ramen|curry|noodle/i : mood === "comfort" ? /cafe|fast|burger|pizza|ramen|noodle|bakery/i : /restaurant|cafe|hotel|guest/i;
    const matched = displayPlaces.filter((place) => query.test(`${place.name} ${place.category}`));
    const isGenericStayName = (place: JourneyLocalPlace) => kind === "stay" && /^(hotel|hostel|guesthouse|apartment)$/i.test(place.name.trim());
    return (matched.length ? matched : displayPlaces)
      .map((place) => ({ place, recommendation: recommendNearbyPlace(place, { kind, moment, mood, pace, profile, interests }) }))
      .sort((a, b) => Number(b.place.availability === "available") - Number(a.place.availability === "available") || Number(isGenericStayName(a.place)) - Number(isGenericStayName(b.place)) || b.recommendation.score - a.recommendation.score)
      .slice(0, 4);
  }, [displayPlaces, interests, isReady, kind, moment, mood, pace, profile]);

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
    if (kind !== "stay" || autoSelectedRef.current || saved || !candidates[0]) return;
    autoSelectedRef.current = true;
    choosePlace(candidates[0].place);
  }, [candidates, kind, saved]);

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
    setSaved(chosen);
    try { window.localStorage.setItem(storageKey, JSON.stringify({ ...JSON.parse(window.localStorage.getItem(storageKey) ?? "{}"), [dayId]: chosen })); } catch { /* no-op */ }
  };
  const reset = () => {
    if (saved) onRemovePlace?.({ id: saved.id, name: saved.name, coordinates: saved.coordinates, provider: saved.provider }, kind);
    setSaved(null);
    setChosen(null);
    setMeal("dinner");
    setPace("relaxed");
    setMood("local");
    setStayStyle("simple");
    setMoment("now");
    try {
      const store = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Record<string, JourneyLocalPlace>;
      delete store[dayId];
      window.localStorage.setItem(storageKey, JSON.stringify(store));
    } catch { /* The in-memory finder state is still cleared. */ }
  };

  return <section className={`${styles.restaurantFinder} ${kind === "stay" ? styles.finderStay : styles.finderEat}`} aria-label={`${label} for ${city}`}>
    <header><span><Icon /></span><div><small>{kind === "stay" ? `STAY IN ${city}` : `EAT IN ${city}`}</small><strong>{loading ? "Nearby options" : `${displayPlaces.length} ${kind === "stay" ? "stays" : "places"} nearby`}</strong></div></header>
    {loading ? <MorroviaSectionStatus title={kind === "stay" ? "Checking stay options" : "Finding places nearby"} detail={kind === "stay" ? "Looking for options that fit your dates and selected stop." : "Keeping this day and map context in place while local results load."} /> : null}
    {loading && !displayPlaces.length ? <div className={styles.localLoadingSkeletons} aria-hidden="true"><MorroviaSkeleton height={58} radius="card" /><MorroviaSkeleton height={58} radius="card" /></div> : null}
    {!loading && !displayPlaces.length && searchUnavailable ? <MorroviaSectionStatus state="error" title="Local results are unavailable" detail="The day and map are unchanged. Try the provider again when your connection is ready." retryLabel="Try local search again" onRetry={() => setSearchVersion((current) => current + 1)} /> : null}
    {!loading && !displayPlaces.length && !searchUnavailable ? <p className={styles.restaurantLocalNote}>No mapped venues came back for this area. Open Maps to search around the day’s location instead.</p> : null}
    {!loading && displayPlaces.length ? <details className={styles.finderFilters}><summary>Filters</summary><div>{kind === "stay" ? ([{ value: "simple", label: "Central" }, { value: "character", label: "Character" }, { value: "comfort", label: "Comfort" }] as const).map((option) => <button key={option.value} type="button" aria-pressed={stayStyle === option.value} onClick={() => setStayStyle(option.value)}>{option.label}</button>) : <>{finderMoments.map((option) => <button key={option.value} type="button" aria-pressed={moment === option.value} onClick={() => setMoment(option.value)}>{option.label}</button>)}{(["lunch", "dinner"] as const).map((option) => <button key={option} type="button" aria-pressed={meal === option} onClick={() => setMeal(option)}>{option}</button>)}{(["quick", "relaxed", "occasion"] as const).map((option) => <button key={option} type="button" aria-pressed={pace === option} onClick={() => setPace(option)}>{option}</button>)}{(["local", "comfort", "surprise"] as const).map((option) => <button key={option} type="button" aria-pressed={mood === option} onClick={() => setMood(option)}>{option}</button>)}</>}</div></details> : null}
    {chosen ? <article className={`${styles.restaurantResult} ${kind === "stay" ? styles.featuredStay : ""}`}><p><span>{saved ? `Added ${kind === "stay" ? "stay" : meal}` : `Chosen ${kind === "stay" ? "stay" : meal}`}</span><b>{saved ? "In today’s plan ↑" : kind === "stay" ? chosen.availability === "available" ? "Available for your dates" : "Check availability before adding" : "Check current details before adding"}</b></p><h3>{chosen.name}</h3>{chosen.nativeName ? <span>{chosen.nativeName}</span> : null}<span><MapPin /> {chosen.address}</span><p className={styles.restaurantFit}>{kind === "stay" ? chosen.availability === "available" ? `A matching room product was returned for your selected dates${chosen.price ? ` from ${chosen.price.currency} ${chosen.price.total.toFixed(0)}` : ""}. Trip.com confirms its own availability, room, cancellation terms and total.` : `${chosen.operational === true ? "Operational property confirmed" : "Mapped property; operating status unverified"}. Check live options on Trip.com before booking.` : `${recommendNearbyPlace(chosen, { kind, moment, mood, pace, profile, interests }).reasons.join(" · ")}. This is a mapped recommendation, not a live availability or opening-hours claim.`}</p><div className={styles.restaurantActions}>{onPlaceSelect ? <button type="button" onClick={() => onPlaceSelect(chosen)}>View on map</button> : <a href={chosen.mapsUrl} target="_blank" rel="noopener noreferrer">Open in Maps <ArrowUpRight /></a>}{kind === "stay" && stayBookingUrl ? <span className={styles.affiliateAction}><a href={stayBookingUrl} target="_blank" rel="sponsored noopener noreferrer" onClick={() => trackEvent("affiliate_click", { category: "accommodation", provider: affiliatePartners.tripCom.provider, placement: "map_stay_finder", workspace_view: "map", destination_count: 1, ...(tripId ? { trip_id: tripId } : {}), ...(stopId ? { stop_id: stopId } : {}) })}>Check options on Trip.com <ArrowUpRight /></a><small>Partner link · Morrovia may earn a commission at no extra cost to you.</small></span> : null}<button type="button" className={styles.restaurantSave} onClick={save} disabled={Boolean(saved)}>{saved ? "Added to itinerary" : `Add ${kind === "stay" ? "stay" : "to today"}`}</button><button type="button" aria-label="Change selection" onClick={reset}><RotateCcw /></button></div></article> : null}
    {isReady && candidates.length ? <div className={styles.localCandidates}><p><span>{kind === "restaurant" ? "RECOMMENDED NEARBY" : liveInventory ? "AVAILABLE FOR YOUR DATES" : "RECOMMENDED NEARBY"}</span><b>{chosen ? "Other good options" : "Best match"}</b></p>{candidates.filter(({ place }) => place.id !== chosen?.id).map(({ place, recommendation }, index) => <button key={place.id} type="button" className={place.id === selectedPlaceId ? styles.localCandidateSelected : ""} onClick={() => choosePlace(place)}><span><strong>{!chosen && index === 0 ? "Best match · " : ""}{place.name}</strong>{place.nativeName ? <small>{place.nativeName}</small> : null}<small>{place.address}</small><small className={styles.finderWhy}>{kind === "stay" ? `${place.availability === "available" ? "Available for your dates" : place.operational === true ? "Operational property · check rooms" : "Mapped property · check before booking"}${place.rating ? ` · ${place.rating.toFixed(1)} rating` : ""}${place.price ? ` · ${place.price.currency} ${place.price.total.toFixed(0)}` : ""}` : `${recommendation.reasons[0]} · ${recommendation.confidence} confidence`}</small></span><em>{place.category.replace(/_/g, " ")}</em></button>)}</div> : null}
  </section>;
}
