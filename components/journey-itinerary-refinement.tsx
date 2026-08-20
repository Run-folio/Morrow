"use client";

import { Map, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { EasyTTrip, TripStop } from "@/lib/easyt/trip";
import styles from "./journey-itinerary-refinement.module.css";

type Place = { id: string; title: string; area: string; type: string; tags: string[]; description: string };
const filters = ["All", "Food", "Nature", "Cities", "Beach"];

export function JourneyItineraryRefinement({ trip, stop, onSelectionChange, onExploreMap, compact = false }: { trip: EasyTTrip; stop?: TripStop; onSelectionChange: (stopId: string, title: string, selected: boolean) => void; onExploreMap: () => void; compact?: boolean }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("All");
  const selected = stop ? trip.brief.selectedPlaces[stop.id] ?? [] : [];
  const visible = useMemo(() => places.filter((place) => filter === "All" || place.tags.includes(filter)).slice(0, 3), [filter, places]);

  useEffect(() => {
    if (!stop || stop.latitude === null || stop.longitude === null) return;
    let active = true;
    setLoading(true);
    void fetch(`/api/journey-discover?${new URLSearchParams({ destination: stop.name, country: stop.country, lat: String(stop.latitude), lon: String(stop.longitude) })}`)
      .then(async (response) => response.ok ? response.json() as Promise<{ places?: Place[] }> : { places: [] })
      .then((payload) => { if (active) setPlaces(payload.places ?? []); })
      .catch(() => { if (active) setPlaces([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [stop]);

  useEffect(() => {
    if (!stop) return;
    const key = `morrovia:attraction-viewed:${trip.id}:${stop.id}`;
    if (sessionStorage.getItem(key)) return;
    trackEvent("attraction_refinement_viewed", { trip_id: trip.id, stop_id: stop.id, selected_count: selected.length });
    sessionStorage.setItem(key, "1");
  }, [selected.length, stop, trip.id]);

  if (!stop || (stop.nights ?? 0) < 1) return null;
  return <section className={`${styles.panel} ${compact ? styles.compact : ""}`} aria-labelledby={`refinement-${stop.id}`}>
    <header><div><p>SEE NEARBY · {stop.name}</p><h3 id={`refinement-${stop.id}`}>Make {stop.name} yours</h3><span>{loading ? "Finding mapped attractions…" : `${places.length} mapped attractions`} · choose only what is worth making time for.</span></div><Sparkles aria-hidden="true" /></header>
    {selected.length ? <div className={styles.selected}><small>IN YOUR TRIP</small><div>{selected.map((title) => <span key={title}>{title}<button type="button" onClick={() => { onSelectionChange(stop.id, title, false); trackEvent("attraction_removed", { trip_id: trip.id, stop_id: stop.id }); }} aria-label={`Remove ${title}`}><X /></button></span>)}</div></div> : null}
    <div className={styles.filters} aria-label="Attraction categories">{filters.map((item) => <button type="button" key={item} aria-pressed={filter === item} onClick={() => { setFilter(item); if (item !== "All") trackEvent("attraction_filter_used", { trip_id: trip.id, stop_id: stop.id, filter: item.toLowerCase() }); }}>{item}</button>)}</div>
    {loading ? <p className={styles.state}>Finding a few worthwhile places…</p> : visible.length ? <div className={styles.places}>{visible.map((place) => {
      const isSelected = selected.includes(place.title);
      return <article key={place.id}><div><small>{place.area} · {place.type}</small><strong>{place.title}</strong><p>{place.description}</p></div><button type="button" aria-pressed={isSelected} onClick={() => { onSelectionChange(stop.id, place.title, !isSelected); trackEvent(isSelected ? "attraction_removed" : "attraction_selected", { trip_id: trip.id, stop_id: stop.id }); }}>{isSelected ? <>Added <X /></> : <><Plus /> Add to trip</>}</button></article>;
    })}</div> : <p className={styles.state}>No short list is available yet. Explore the map when you want a deeper look.</p>}
    <button type="button" className={styles.explore} onClick={() => { trackEvent("attraction_map_opened", { trip_id: trip.id, stop_id: stop.id }); onExploreMap(); }}>Explore more on map <Map /></button>
  </section>;
}
