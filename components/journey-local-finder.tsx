"use client";

import { ArrowUpRight, BedDouble, MapPin, RotateCcw, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { JourneyRestaurant, RestaurantMeal } from "@/lib/journey";
import { finderMoments, recommendNearbyPlace, type FinderMoment } from "@/lib/easyt/recommendations";
import { defaultTravelProfile, isTravelProfile, type TravelProfile } from "@/lib/easyt/travel-profile";
import styles from "@/app/journey/journey.module.css";

type LocalPlace = { id: string; name: string; address: string; category: string; coordinates: [number, number]; mapsUrl: string; bookingUrl?: string; distanceKm?: number };
type MealPace = "quick" | "relaxed" | "occasion";
type MealMood = "local" | "comfort" | "surprise";
type StayStyle = "simple" | "character" | "comfort";

export function JourneyLocalFinder({ kind, city, country, dayId, coordinates, onRestaurantSelect, onSavePlace }: { kind: "restaurant" | "stay"; city: string; country: string; dayId: string; coordinates: [number, number]; onRestaurantSelect?: (restaurant?: JourneyRestaurant, meal?: RestaurantMeal) => void; onSavePlace?: (place: { name: string; coordinates: [number, number] }, kind: "restaurant" | "stay") => void }) {
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
  const storageKey = `journey:local-${kind}:v2`;
  const label = kind === "restaurant" ? "Taste finder" : "Stay finder";
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
    setChosen(null);
    setSaved(null);
    setMeal(undefined);
    setPace(undefined);
    setMood(undefined);
    setStayStyle(undefined);
    setMoment(undefined);
    fetch(`/api/journey-local-search?kind=${kind}&city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&lat=${latitude}&lon=${longitude}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Venue search unavailable")))
      .then((data: { places?: LocalPlace[]; unavailable?: boolean }) => { if (active) { setPlaces(data.places ?? []); setSearchUnavailable(Boolean(data.unavailable)); } })
      .catch((error: unknown) => { if (active && (error as { name?: string })?.name !== "AbortError") { setPlaces([]); setSearchUnavailable(true); } })
      .finally(() => { if (active) setLoading(false); });
    try {
      const store = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Record<string, LocalPlace>;
      if (store[dayId]) { setSaved(store[dayId]); setChosen(store[dayId]); }
    } catch { /* The finder remains usable without local persistence. */ }
    return () => { active = false; controller.abort(); };
  }, [city, country, dayId, kind, latitude, longitude, storageKey]);

  useEffect(() => {
    if (kind !== "restaurant" || !saved || !onRestaurantSelect) return onRestaurantSelect?.();
    onRestaurantSelect({ name: saved.name, area: city, summary: saved.address, order: "Confirm current opening hours", pace: [pace ?? "quick"], craving: ["signature"], spend: ["mid"], meal: [meal ?? "dinner"], dish: ["local"], coordinates: saved.coordinates, fit: `Saved for this specific ${city} day.`, mapsUrl: saved.mapsUrl }, meal ?? "dinner");
  }, [city, kind, meal, onRestaurantSelect, pace, saved]);

  useEffect(() => {
    if (saved) onSavePlace?.({ name: saved.name, coordinates: saved.coordinates }, kind);
  }, [kind, onSavePlace, saved]);

  const candidates = useMemo(() => {
    if (!isReady) return [];
    const query = mood === "local" ? /local|regional|traditional|seafood|sushi|ramen|curry|noodle/i : mood === "comfort" ? /cafe|fast|burger|pizza|ramen|noodle|bakery/i : /restaurant|cafe|hotel|guest/i;
    const matched = places.filter((place) => query.test(`${place.name} ${place.category}`));
    return (matched.length ? matched : places)
      .map((place) => ({ place, recommendation: recommendNearbyPlace(place, { kind, moment, mood, pace, profile }) }))
      .sort((a, b) => b.recommendation.score - a.recommendation.score)
      .slice(0, 4);
  }, [isReady, kind, moment, mood, pace, places, profile]);

  const save = () => {
    if (!chosen) return;
    setSaved(chosen);
    try { window.localStorage.setItem(storageKey, JSON.stringify({ ...JSON.parse(window.localStorage.getItem(storageKey) ?? "{}"), [dayId]: chosen })); } catch { /* no-op */ }
  };
  const reset = () => { setSaved(null); setChosen(null); setMeal(undefined); setPace(undefined); setMood(undefined); setStayStyle(undefined); setMoment(undefined); };

  return <section className={styles.restaurantFinder} aria-label={`${label} for ${city}`}>
    <header><span><Icon /></span><div><small>{label}</small><strong>{city}</strong></div></header>
    <p className={styles.restaurantContext}><b>{kind === "restaurant" ? "A short list, shaped for today" : "Choose a base for this part of the trip"}</b><span>Named OpenStreetMap venues are ranked by distance, your travel profile and the moment you choose. Confirm opening hours, rates and availability before booking.</span></p>
    {loading ? <p className={styles.restaurantLocalNote}>Checking actual local venues…</p> : null}
    {!loading && !places.length ? <p className={styles.restaurantLocalNote}>{searchUnavailable ? "Live venue search is temporarily unavailable. Open Maps to search around today’s location instead." : "No mapped venues came back for this area. Open Maps to search around the day’s location instead."}</p> : null}
    {!loading && kind === "restaurant" && !moment ? <div className={styles.restaurantQuestion}><p>Start with the moment <b>1 / 4</b></p><h3>What does today need?</h3><div>{finderMoments.map((option) => <button key={option.value} type="button" onClick={() => setMoment(option.value)}>{option.label}</button>)}</div></div> : null}
    {!loading && kind === "restaurant" && moment && !meal ? <div className={styles.restaurantQuestion}><p>Then, choose the meal <b>2 / 4</b></p><h3>When do you want to eat?</h3><div>{(["lunch", "dinner"] as const).map((option) => <button key={option} type="button" onClick={() => setMeal(option)}>{option}</button>)}</div></div> : null}
    {!loading && kind === "restaurant" && meal && !pace ? <div className={styles.restaurantQuestion}><p>Then, the pace <b>2 / 4</b></p><h3>How should the meal feel?</h3><div>{([{ value: "quick", label: "Quick & easy" }, { value: "relaxed", label: "Take our time" }, { value: "occasion", label: "A trip highlight" }] as const).map((option) => <button key={option.value} type="button" onClick={() => setPace(option.value)}>{option.label}</button>)}</div></div> : null}
    {!loading && kind === "restaurant" && meal && pace && !mood ? <div className={styles.restaurantQuestion}><p>Finally, the direction <b>3 / 4</b></p><h3>What sounds right?</h3><div>{([{ value: "local", label: "Local favourite" }, { value: "comfort", label: "Easy comfort" }, { value: "surprise", label: "Surprise me" }] as const).map((option) => <button key={option.value} type="button" onClick={() => setMood(option.value)}>{option.label}</button>)}</div></div> : null}
    {!loading && kind === "stay" && !stayStyle ? <div className={styles.restaurantQuestion}><p>Choose a base <b>1 / 2</b></p><h3>What kind of stay suits today?</h3><div>{([{ value: "simple", label: "Simple & central" }, { value: "character", label: "Local character" }, { value: "comfort", label: "Comfort first" }] as const).map((option) => <button key={option.value} type="button" onClick={() => setStayStyle(option.value)}>{option.label}</button>)}</div></div> : null}
    {isReady && !chosen && candidates.length ? <div className={styles.localCandidates}><p><span>{kind === "restaurant" ? "4 / 4 · REAL MAP RESULTS" : "2 / 2 · REAL MAP RESULTS"}</span><b>Best fits for today</b></p>{candidates.map(({ place, recommendation }, index) => <button key={place.id} type="button" onClick={() => setChosen(place)}><span><strong>{index === 0 ? "Best fit · " : ""}{place.name}</strong><small>{place.address}</small><small className={styles.finderWhy}>{recommendation.reasons[0]} · {recommendation.confidence} confidence</small></span><em>{place.category.replace(/_/g, " ")}</em></button>)}</div> : null}
    {chosen ? <article className={styles.restaurantResult}><p><span>{saved ? `Saved ${kind === "stay" ? "stay" : meal}` : `Chosen ${kind === "stay" ? "stay" : meal}`}</span><b>{saved ? "In today’s plan ↑" : "Check before saving"}</b></p><h3>{chosen.name}</h3><span><MapPin /> {chosen.address}</span><p className={styles.restaurantFit}>{recommendNearbyPlace(chosen, { kind, moment, mood, pace, profile }).reasons.join(" · ")}. This is a mapped recommendation, not a live availability or opening-hours claim.</p><div className={styles.restaurantActions}><a href={chosen.mapsUrl} target="_blank" rel="noreferrer">Open in Maps <ArrowUpRight /></a>{kind === "stay" && chosen.bookingUrl ? <a href={chosen.bookingUrl} target="_blank" rel="noreferrer">Search Booking <ArrowUpRight /></a> : null}<button type="button" className={styles.restaurantSave} onClick={save} disabled={Boolean(saved)}>{saved ? "Saved to itinerary" : `Add ${kind === "stay" ? "stay" : "to today"}`}</button><button type="button" aria-label="Change selection" onClick={reset}><RotateCcw /></button></div></article> : null}
  </section>;
}
