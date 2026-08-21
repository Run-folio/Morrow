"use client";

import { ArrowUpRight, BedDouble, MapPin, RotateCcw, Utensils } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JourneyRestaurant, RestaurantMeal } from "@/lib/journey";
import { finderMoments, recommendNearbyPlace, type FinderMoment } from "@/lib/easyt/recommendations";
import { defaultTravelProfile, isTravelProfile, type TravelProfile } from "@/lib/easyt/travel-profile";
import { trackEvent } from "@/lib/analytics";
import styles from "@/app/journey/journey.module.css";

type LocalPlace = { id: string; name: string; address: string; category: string; coordinates: [number, number]; mapsUrl: string; bookingUrl?: string; distanceKm?: number; operational?: boolean; availability?: "available" | "check"; provider?: "booking-demand" | "google-places" | "openstreetmap"; rating?: number; priceLevel?: string; price?: { total: number; currency: string }; cancellation?: string };
type MealPace = "quick" | "relaxed" | "occasion";
type MealMood = "local" | "comfort" | "surprise";
type StayStyle = "simple" | "character" | "comfort";
type StaySearch = { checkIn?: string; checkOut?: string; adults?: number; rooms?: number; currency?: string; bookerCountry?: string };

export function JourneyLocalFinder({ kind, city, country, dayId, coordinates, staySearch, onRestaurantSelect, onSavePlace, onRemovePlace }: { kind: "restaurant" | "stay"; city: string; country: string; dayId: string; coordinates: [number, number]; staySearch?: StaySearch; onRestaurantSelect?: (restaurant?: JourneyRestaurant, meal?: RestaurantMeal) => void; onSavePlace?: (place: { name: string; coordinates: [number, number] }, kind: "restaurant" | "stay") => void; onRemovePlace?: (place: { name: string; coordinates: [number, number] }, kind: "restaurant" | "stay") => void }) {
  // These defaults are the existing “Show best matches” choice. Keeping them
  // selected makes the finder useful immediately; the same controls remain
  // available as optional refinements below.
  const [meal, setMeal] = useState<RestaurantMeal | undefined>("dinner");
  const [pace, setPace] = useState<MealPace | undefined>("relaxed");
  const [mood, setMood] = useState<MealMood | undefined>("local");
  const [stayStyle, setStayStyle] = useState<StayStyle | undefined>("simple");
  const [moment, setMoment] = useState<FinderMoment | undefined>("now");
  const [profile, setProfile] = useState<TravelProfile>(defaultTravelProfile);
  const [places, setPlaces] = useState<LocalPlace[]>([]);
  const [chosen, setChosen] = useState<LocalPlace | null>(null);
  const [saved, setSaved] = useState<LocalPlace | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const [liveInventory, setLiveInventory] = useState(false);
  const reportedSaveRef = useRef("");
  const storageKey = `journey:local-${kind}:v3`;
  const label = kind === "restaurant" ? "Restaurant finder" : "Stay finder";
  const Icon = kind === "restaurant" ? Utensils : BedDouble;
  const isReady = kind === "restaurant" ? Boolean(meal && pace && mood) : Boolean(stayStyle);
  const longitude = coordinates[0];
  const latitude = coordinates[1];

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("easyt-travel-profile") ?? "null");
      if (isTravelProfile(stored)) setProfile(stored);
    } catch { /* Finder recommendations stay useful with the default profile. */ }
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setSearchUnavailable(false);
    setLiveInventory(false);
    setChosen(null);
    setSaved(null);
    setMeal("dinner");
    setPace("relaxed");
    setMood("local");
    setStayStyle("simple");
    setMoment("now");
    const localSearch = fetch(`/api/journey-local-search?kind=${kind}&city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&lat=${latitude}&lon=${longitude}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : { places: [], unavailable: true })
      // A partner-confirmed stay must remain usable even when the independent
      // map lookup happens to be unavailable.
      .catch(() => ({ places: [], unavailable: true }));
    const inventorySearch = kind === "stay" && staySearch?.checkIn && staySearch?.checkOut
      ? fetch(`/api/journey-accommodation-search?${new URLSearchParams({ lat: String(latitude), lon: String(longitude), checkIn: staySearch.checkIn, checkOut: staySearch.checkOut, adults: String(staySearch.adults ?? 1), rooms: String(staySearch.rooms ?? 1), currency: staySearch.currency ?? "USD", ...(staySearch.bookerCountry ? { bookerCountry: staySearch.bookerCountry } : {}) })}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.resolve({ properties: [] }))
      : Promise.resolve({ properties: [] });
    Promise.all([localSearch, inventorySearch])
      .then(([localData, inventoryData]: [{ places?: LocalPlace[]; unavailable?: boolean }, { properties?: LocalPlace[]; configured?: boolean }]) => { if (active) { const properties = inventoryData.properties ?? []; setPlaces([...properties, ...(localData.places ?? [])]); setLiveInventory(properties.length > 0); setSearchUnavailable(Boolean(localData.unavailable)); if (properties.length) trackEvent("easyt_accommodation_inventory_viewed", { property_count: properties.length, has_dates: true }); } })
      .catch((error: unknown) => { if (active && (error as { name?: string })?.name !== "AbortError") { setPlaces([]); setSearchUnavailable(true); } })
      .finally(() => { if (active) setLoading(false); });
    try {
      const store = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Record<string, LocalPlace>;
      if (store[dayId]) { setSaved(store[dayId]); setChosen(store[dayId]); }
    } catch { /* The finder remains usable without local persistence. */ }
    return () => { active = false; controller.abort(); };
  }, [city, country, dayId, kind, latitude, longitude, staySearch?.adults, staySearch?.bookerCountry, staySearch?.checkIn, staySearch?.checkOut, staySearch?.currency, staySearch?.rooms, storageKey]);

  useEffect(() => {
    if (kind !== "restaurant" || !saved || !onRestaurantSelect) return onRestaurantSelect?.();
    onRestaurantSelect({ name: saved.name, area: city, summary: saved.address, order: "Confirm current opening hours", pace: [pace ?? "quick"], craving: ["signature"], spend: ["mid"], meal: [meal ?? "dinner"], dish: ["local"], coordinates: saved.coordinates, fit: `Saved for this specific ${city} day.`, mapsUrl: saved.mapsUrl }, meal ?? "dinner");
  }, [city, kind, meal, onRestaurantSelect, pace, saved]);

  useEffect(() => {
    if (!saved) {
      reportedSaveRef.current = "";
      return;
    }
    const savedKey = `${kind}:${dayId}:${saved.id}`;
    if (reportedSaveRef.current === savedKey) return;
    reportedSaveRef.current = savedKey;
    onSavePlace?.({ name: saved.name, coordinates: saved.coordinates }, kind);
  }, [dayId, kind, onSavePlace, saved]);

  const candidates = useMemo(() => {
    if (!isReady) return [];
    const query = mood === "local" ? /local|regional|traditional|seafood|sushi|ramen|curry|noodle/i : mood === "comfort" ? /cafe|fast|burger|pizza|ramen|noodle|bakery/i : /restaurant|cafe|hotel|guest/i;
    const matched = places.filter((place) => query.test(`${place.name} ${place.category}`));
    return (matched.length ? matched : places)
      .map((place) => ({ place, recommendation: recommendNearbyPlace(place, { kind, moment, mood, pace, profile }) }))
      .sort((a, b) => Number(b.place.availability === "available") - Number(a.place.availability === "available") || b.recommendation.score - a.recommendation.score)
      .slice(0, 4);
  }, [isReady, kind, moment, mood, pace, places, profile]);

  // Mapped fallback properties use a Booking.com destination search rather than
  // a provider deep link. Carry the trip context into that search without
  // touching partner-supplied availability URLs.
  const stayBookingUrl = useMemo(() => {
    if (kind !== "stay" || !chosen?.bookingUrl || chosen.provider === "booking-demand") return chosen?.bookingUrl;
    try {
      const url = new URL(chosen.bookingUrl);
      if (!/(^|\.)booking\.com$/i.test(url.hostname)) return chosen.bookingUrl;
      if (staySearch?.checkIn) url.searchParams.set("checkin", staySearch.checkIn);
      if (staySearch?.checkOut) url.searchParams.set("checkout", staySearch.checkOut);
      if (staySearch?.adults) url.searchParams.set("group_adults", String(staySearch.adults));
      url.searchParams.set("no_rooms", String(staySearch?.rooms ?? 1));
      return url.toString();
    } catch {
      return chosen.bookingUrl;
    }
  }, [chosen, kind, staySearch?.adults, staySearch?.checkIn, staySearch?.checkOut, staySearch?.rooms]);

  const save = () => {
    if (!chosen) return;
    setSaved(chosen);
    try { window.localStorage.setItem(storageKey, JSON.stringify({ ...JSON.parse(window.localStorage.getItem(storageKey) ?? "{}"), [dayId]: chosen })); } catch { /* no-op */ }
  };
  const reset = () => {
    if (saved) onRemovePlace?.({ name: saved.name, coordinates: saved.coordinates }, kind);
    setSaved(null);
    setChosen(null);
    setMeal("dinner");
    setPace("relaxed");
    setMood("local");
    setStayStyle("simple");
    setMoment("now");
    try {
      const store = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Record<string, LocalPlace>;
      delete store[dayId];
      window.localStorage.setItem(storageKey, JSON.stringify(store));
    } catch { /* The in-memory finder state is still cleared. */ }
  };

  return <section className={`${styles.restaurantFinder} ${kind === "stay" ? styles.finderStay : styles.finderEat}`} aria-label={`${label} for ${city}`}>
    <header><span><Icon /></span><div><small>{kind === "stay" ? `STAY IN ${city}` : `EAT IN ${city}`}</small><strong>{loading ? "Finding nearby places…" : `${places.length} ${kind === "stay" ? "stays" : "places"} nearby`}</strong></div></header>
    {loading ? <p className={styles.restaurantLocalNote}>Checking actual local venues…</p> : null}
    {!loading && !places.length ? <p className={styles.restaurantLocalNote}>{searchUnavailable ? "Live venue search is temporarily unavailable. Open Maps to search around today’s location instead." : "No mapped venues came back for this area. Open Maps to search around the day’s location instead."}</p> : null}
    {!loading && places.length ? <details className={styles.finderFilters}><summary>Filters</summary><div>{kind === "stay" ? ([{ value: "simple", label: "Central" }, { value: "character", label: "Character" }, { value: "comfort", label: "Comfort" }] as const).map((option) => <button key={option.value} type="button" aria-pressed={stayStyle === option.value} onClick={() => setStayStyle(option.value)}>{option.label}</button>) : <>{finderMoments.map((option) => <button key={option.value} type="button" aria-pressed={moment === option.value} onClick={() => setMoment(option.value)}>{option.label}</button>)}{(["lunch", "dinner"] as const).map((option) => <button key={option} type="button" aria-pressed={meal === option} onClick={() => setMeal(option)}>{option}</button>)}{(["quick", "relaxed", "occasion"] as const).map((option) => <button key={option} type="button" aria-pressed={pace === option} onClick={() => setPace(option)}>{option}</button>)}{(["local", "comfort", "surprise"] as const).map((option) => <button key={option} type="button" aria-pressed={mood === option} onClick={() => setMood(option)}>{option}</button>)}</>}</div></details> : null}
    {isReady && !chosen && candidates.length ? <div className={styles.localCandidates}><p><span>{kind === "restaurant" ? "RECOMMENDED NEARBY" : liveInventory ? "AVAILABLE FOR YOUR DATES" : "RECOMMENDED NEARBY"}</span><b>Best match</b></p>{candidates.map(({ place, recommendation }, index) => <button key={place.id} type="button" onClick={() => setChosen(place)}><span><strong>{index === 0 ? "Best match · " : ""}{place.name}</strong><small>{place.address}</small><small className={styles.finderWhy}>{kind === "stay" ? `${place.availability === "available" ? "Available for your dates" : place.provider === "google-places" ? "Operational property · check rooms" : "Mapped property · check before booking"}${place.rating ? ` · ${place.rating.toFixed(1)} rating` : ""}${place.price ? ` · ${place.price.currency} ${place.price.total.toFixed(0)}` : ""}` : `${recommendation.reasons[0]} · ${recommendation.confidence} confidence`}</small></span><em>{place.category.replace(/_/g, " ")}</em></button>)}</div> : null}
    {chosen ? <article className={styles.restaurantResult}><p><span>{saved ? `Saved ${kind === "stay" ? "stay" : meal}` : `Chosen ${kind === "stay" ? "stay" : meal}`}</span><b>{saved ? "In today’s plan ↑" : kind === "stay" ? chosen.availability === "available" ? "Available for your dates" : "Check availability before saving" : "Check before saving"}</b></p><h3>{chosen.name}</h3><span><MapPin /> {chosen.address}</span><p className={styles.restaurantFit}>{kind === "stay" ? chosen.availability === "available" ? `A matching room product is available for your selected dates${chosen.price ? ` from ${chosen.price.currency} ${chosen.price.total.toFixed(0)}` : ""}. Confirm the final room, cancellation terms and total directly with Booking.com.` : `${chosen.provider === "google-places" ? "Operational property confirmed" : "Mapped property; operating status unverified"}. Check rooms and price for your dates before booking.` : `${recommendNearbyPlace(chosen, { kind, moment, mood, pace, profile }).reasons.join(" · ")}. This is a mapped recommendation, not a live availability or opening-hours claim.`}</p><div className={styles.restaurantActions}><a href={chosen.mapsUrl} target="_blank" rel="noreferrer">Open in Maps <ArrowUpRight /></a>{kind === "stay" && stayBookingUrl ? <span className={styles.affiliateAction}><a href={stayBookingUrl} target="_blank" rel="noreferrer sponsored" onClick={() => { if (chosen.provider === "booking-demand") trackEvent("easyt_accommodation_affiliate_clicked", { has_live_availability: chosen.availability === "available", has_price: Boolean(chosen.price) }); }}>{chosen.availability === "available" ? "View available room" : "Check availability"} <ArrowUpRight /></a>{chosen.provider === "booking-demand" ? <small>Partner link · Morrovia may earn a commission at no extra cost to you.</small> : null}</span> : null}<button type="button" className={styles.restaurantSave} onClick={save} disabled={Boolean(saved)}>{saved ? "Saved to itinerary" : `Add ${kind === "stay" ? "stay" : "to today"}`}</button><button type="button" aria-label="Change selection" onClick={reset}><RotateCcw /></button></div></article> : null}
  </section>;
}
