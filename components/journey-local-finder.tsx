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
  const [meal, setMeal] = useState<RestaurantMeal | undefined>();
  const [pace, setPace] = useState<MealPace | undefined>();
  const [mood, setMood] = useState<MealMood | undefined>();
  const [stayStyle, setStayStyle] = useState<StayStyle | undefined>();
  const [moment, setMoment] = useState<FinderMoment | undefined>();
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
    setMeal(undefined);
    setPace(undefined);
    setMood(undefined);
    setStayStyle(undefined);
    setMoment(undefined);
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

  const save = () => {
    if (!chosen) return;
    setSaved(chosen);
    try { window.localStorage.setItem(storageKey, JSON.stringify({ ...JSON.parse(window.localStorage.getItem(storageKey) ?? "{}"), [dayId]: chosen })); } catch { /* no-op */ }
  };
  const reset = () => {
    if (saved) onRemovePlace?.({ name: saved.name, coordinates: saved.coordinates }, kind);
    setSaved(null);
    setChosen(null);
    setMeal(undefined);
    setPace(undefined);
    setMood(undefined);
    setStayStyle(undefined);
    setMoment(undefined);
    try {
      const store = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Record<string, LocalPlace>;
      delete store[dayId];
      window.localStorage.setItem(storageKey, JSON.stringify(store));
    } catch { /* The in-memory finder state is still cleared. */ }
  };

  return <section className={`${styles.restaurantFinder} ${kind === "stay" ? styles.finderStay : styles.finderEat}`} aria-label={`${label} for ${city}`}>
    <header><span><Icon /></span><div><small>{label} · {city}</small><strong>{loading ? "Finding nearby places…" : `${places.length} mapped ${kind === "stay" ? "stays" : "restaurants"}`}</strong></div></header>
    <p className={styles.restaurantContext}><b>{kind === "restaurant" ? "A short list, shaped for today" : liveInventory ? "Available stays for your dates" : "Choose a base for this part of the trip"}</b><span>{kind === "stay" ? liveInventory ? `These properties have a matching room product for ${staySearch?.checkIn} to ${staySearch?.checkOut}. Prices and rooms can change until you complete your booking.` : "Mapped stays are useful starting points. Check room availability and price for your dates before booking." : "Named mapped venues are ranked by distance, your travel profile and the moment you choose. Confirm opening hours before you go."}</span></p>
    {loading ? <p className={styles.restaurantLocalNote}>Checking actual local venues…</p> : null}
    {!loading && !places.length ? <p className={styles.restaurantLocalNote}>{searchUnavailable ? "Live venue search is temporarily unavailable. Open Maps to search around today’s location instead." : "No mapped venues came back for this area. Open Maps to search around the day’s location instead."}</p> : null}
    {!loading && places.length && !isReady ? <div className={styles.finderQuickStart}><b>{places.length} mapped {kind === "stay" ? "stays" : "places"} nearby</b><button type="button" onClick={() => kind === "stay" ? setStayStyle("simple") : (setMoment("now"), setMeal("dinner"), setPace("relaxed"), setMood("local"))}>Show best matches</button></div> : null}
    {!loading && kind === "restaurant" && !moment ? <div className={styles.restaurantQuestion}><p>Start with the moment <b>1 / 4</b></p><h3>What does today need?</h3><div>{finderMoments.map((option) => <button key={option.value} type="button" onClick={() => setMoment(option.value)}>{option.label}</button>)}</div></div> : null}
    {!loading && kind === "restaurant" && moment && !meal ? <div className={styles.restaurantQuestion}><p>Then, choose the meal <b>2 / 4</b></p><h3>When do you want to eat?</h3><div>{(["lunch", "dinner"] as const).map((option) => <button key={option} type="button" onClick={() => setMeal(option)}>{option}</button>)}</div></div> : null}
    {!loading && kind === "restaurant" && meal && !pace ? <div className={styles.restaurantQuestion}><p>Then, the pace <b>2 / 4</b></p><h3>How should the meal feel?</h3><div>{([{ value: "quick", label: "Quick & easy" }, { value: "relaxed", label: "Take our time" }, { value: "occasion", label: "A trip highlight" }] as const).map((option) => <button key={option.value} type="button" onClick={() => setPace(option.value)}>{option.label}</button>)}</div></div> : null}
    {!loading && kind === "restaurant" && meal && pace && !mood ? <div className={styles.restaurantQuestion}><p>Finally, the direction <b>3 / 4</b></p><h3>What sounds right?</h3><div>{([{ value: "local", label: "Local favourite" }, { value: "comfort", label: "Easy comfort" }, { value: "surprise", label: "Surprise me" }] as const).map((option) => <button key={option.value} type="button" onClick={() => setMood(option.value)}>{option.label}</button>)}</div></div> : null}
    {!loading && kind === "stay" && !stayStyle ? <div className={styles.restaurantQuestion}><p>Choose a base <b>1 / 2</b></p><h3>What kind of stay suits today?</h3><div>{([{ value: "simple", label: "Simple & central" }, { value: "character", label: "Local character" }, { value: "comfort", label: "Comfort first" }] as const).map((option) => <button key={option.value} type="button" onClick={() => setStayStyle(option.value)}>{option.label}</button>)}</div></div> : null}
    {isReady && !chosen && candidates.length ? <div className={styles.localCandidates}><p><span>{kind === "restaurant" ? "4 / 4 · REAL MAP RESULTS" : liveInventory ? "LIVE RESULTS · YOUR DATES" : "MAPPED STAYS · CHECK BEFORE BOOKING"}</span><b>Best fits for today</b></p>{candidates.map(({ place, recommendation }, index) => <button key={place.id} type="button" onClick={() => setChosen(place)}><span><strong>{index === 0 ? "Best fit · " : ""}{place.name}</strong><small>{place.address}</small><small className={styles.finderWhy}>{kind === "stay" ? `${place.availability === "available" ? "Available for your dates" : place.provider === "google-places" ? "Operational property · check rooms" : "Mapped property · check before booking"}${place.rating ? ` · ${place.rating.toFixed(1)} rating` : ""}${place.price ? ` · ${place.price.currency} ${place.price.total.toFixed(0)}` : ""}` : `${recommendation.reasons[0]} · ${recommendation.confidence} confidence`}</small></span><em>{place.category.replace(/_/g, " ")}</em></button>)}</div> : null}
    {chosen ? <article className={styles.restaurantResult}><p><span>{saved ? `Saved ${kind === "stay" ? "stay" : meal}` : `Chosen ${kind === "stay" ? "stay" : meal}`}</span><b>{saved ? "In today’s plan ↑" : kind === "stay" ? chosen.availability === "available" ? "Available for your dates" : "Check availability before saving" : "Check before saving"}</b></p><h3>{chosen.name}</h3><span><MapPin /> {chosen.address}</span><p className={styles.restaurantFit}>{kind === "stay" ? chosen.availability === "available" ? `A matching room product is available for your selected dates${chosen.price ? ` from ${chosen.price.currency} ${chosen.price.total.toFixed(0)}` : ""}. Confirm the final room, cancellation terms and total directly with Booking.com.` : `${chosen.provider === "google-places" ? "Operational property confirmed" : "Mapped property; operating status unverified"}. Check rooms and price for your dates before booking.` : `${recommendNearbyPlace(chosen, { kind, moment, mood, pace, profile }).reasons.join(" · ")}. This is a mapped recommendation, not a live availability or opening-hours claim.`}</p><div className={styles.restaurantActions}><a href={chosen.mapsUrl} target="_blank" rel="noreferrer">Open in Maps <ArrowUpRight /></a>{kind === "stay" && chosen.bookingUrl ? <span className={styles.affiliateAction}><a href={chosen.bookingUrl} target="_blank" rel="noreferrer sponsored" onClick={() => { if (chosen.provider === "booking-demand") trackEvent("easyt_accommodation_affiliate_clicked", { has_live_availability: chosen.availability === "available", has_price: Boolean(chosen.price) }); }}>{chosen.availability === "available" ? "View available room" : "Check availability"} <ArrowUpRight /></a>{chosen.provider === "booking-demand" ? <small>Partner link · Morrovia may earn a commission at no extra cost to you.</small> : null}</span> : null}<button type="button" className={styles.restaurantSave} onClick={save} disabled={Boolean(saved)}>{saved ? "Saved to itinerary" : `Add ${kind === "stay" ? "stay" : "to today"}`}</button><button type="button" aria-label="Change selection" onClick={reset}><RotateCcw /></button></div></article> : null}
  </section>;
}
