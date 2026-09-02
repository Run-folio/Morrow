"use client";

import { Map, MapPin, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { tripIntentForTrip, type EasyTTrip, type PlanItem, type TripStop } from "@/lib/easyt/trip";
import { itineraryInterestReason, rankItineraryDiscoveryPlaces } from "@/lib/easyt/itinerary-day-context";
import { affiliateProviderLabel, getCurrentPartnerAction, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import { affiliateDisclosure, MorroviaAffiliateLink } from "@/components/easyt/affiliate-link";
import { MorroviaSectionStatus, MorroviaSkeleton } from "@/components/easyt/morrovia-loading-states";
import ResilientImage from "@/components/easyt/resilient-image";
import LiveActivityInventory from "@/components/easyt/live-activity-inventory";
import type { ActivityInventoryItem } from "@/lib/easyt/activity-inventory";
import type { ItineraryDayPart, ItineraryIdea } from "@/lib/easyt/trip";
import styles from "./journey-itinerary-refinement.module.css";

type Place = { id: string; title: string; area: string; type: string; tags: string[]; description: string; image?: string; coordinates: [number, number]; qualityScore?: number };
const filters = ["All", "Food", "Nature", "Cities", "Beach"];

export function JourneyItineraryRefinement({ trip, stop, day, onSelectionChange, onExploreMap, onSaveInventoryIdea, onScheduleInventoryIdea, compact = false, activityAction, initialActivityInventory }: { trip: EasyTTrip; stop?: TripStop; day?: PlanItem; onSelectionChange: (stopId: string, place: Place | string, selected: boolean) => void; onExploreMap: () => void; onSaveInventoryIdea?: (idea: ItineraryIdea) => boolean; onScheduleInventoryIdea?: (idea: ItineraryIdea, dayPart?: ItineraryDayPart) => boolean; compact?: boolean; activityAction?: ResolvedAffiliateAction | null; initialActivityInventory?: ActivityInventoryItem[] }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const [searchVersion, setSearchVersion] = useState(0);
  const loadedStopIdRef = useRef<string | null>(null);
  const [filter, setFilter] = useState("All");
  const selected = stop ? trip.brief.selectedPlaces[stop.id] ?? [] : [];
  const interests = tripIntentForTrip(trip).preferences.interests;
  const visible = useMemo(() => rankItineraryDiscoveryPlaces(places, interests).filter((place) => filter === "All" || place.tags.includes(filter)).slice(0, 3), [filter, interests, places]);
  const experienceAction = activityAction === undefined ? getCurrentPartnerAction("activities") : activityAction;

  useEffect(() => {
    if (!stop || stop.latitude === null || stop.longitude === null) return;
    let active = true;
    const controller = new AbortController();
    const retryingCurrentStop = searchVersion > 0 && loadedStopIdRef.current === stop.id;
    setLoading(true);
    setSearchUnavailable(false);
    if (!retryingCurrentStop) setPlaces([]);
    void fetch(`/api/journey-discover?${new URLSearchParams({ destination: stop.name, country: stop.country, lat: String(stop.latitude), lon: String(stop.longitude) })}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Attraction discovery unavailable");
        return response.json() as Promise<{ places?: Place[] }>;
      })
      .then((payload) => { if (active) { setPlaces(payload.places ?? []); loadedStopIdRef.current = stop.id; } })
      .catch((error: unknown) => {
        if (!active || (error as { name?: string })?.name === "AbortError") return;
        if (!retryingCurrentStop) setPlaces([]);
        setSearchUnavailable(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [searchVersion, stop?.country, stop?.id, stop?.latitude, stop?.longitude, stop?.name]);

  useEffect(() => {
    if (!stop) return;
    const key = `morrovia:attraction-viewed:${trip.id}:${stop.id}`;
    if (sessionStorage.getItem(key)) return;
    trackEvent("attraction_refinement_viewed", { trip_id: trip.id, stop_id: stop.id, selected_count: selected.length });
    sessionStorage.setItem(key, "1");
  }, [selected.length, stop, trip.id]);

  if (!stop || (stop.nights ?? 0) < 1) return null;
  const genericExperienceHandoff = experienceAction ? <section className={styles.experienceHandoff} aria-labelledby={`map-experiences-${stop.id}`}>
    <div><strong id={`map-experiences-${stop.id}`}>More ways to explore {stop.name}</strong><span>Booking options from {affiliateProviderLabel(experienceAction.provider)}</span></div>
    <MorroviaAffiliateLink action={experienceAction} context={{ placement: "map_see_experiences", tripId: trip.id, stopId: stop.id, workspaceView: "map" }} fullWidth />
    <small>{affiliateDisclosure}</small>
  </section> : null;
  return <section className={`${styles.panel} ${compact ? styles.compact : ""}`} aria-labelledby={`refinement-${stop.id}`}>
    <header><div><p>SEE IN {stop.name}</p><h3 id={`refinement-${stop.id}`}>Best fits</h3><span>{loading ? "Finding mapped attractions…" : `${places.length} places nearby`}</span></div><Sparkles aria-hidden="true" /></header>
    {selected.length ? <div className={styles.selected}><small>IN YOUR TRIP</small><div>{selected.map((title) => <span key={title}>{title}<button type="button" onClick={() => { onSelectionChange(stop.id, title, false); trackEvent("attraction_removed", { trip_id: trip.id, stop_id: stop.id }); }} aria-label={`Remove ${title}`}><X /></button></span>)}</div></div> : null}
    <div className={styles.filters} aria-label="Attraction categories">{filters.map((item) => <button type="button" key={item} aria-pressed={filter === item} onClick={() => { setFilter(item); if (item !== "All") trackEvent("attraction_filter_used", { trip_id: trip.id, stop_id: stop.id, filter: item.toLowerCase() }); }}>{item}</button>)}</div>
    {loading ? <MorroviaSectionStatus title="Finding places nearby" detail="Keeping this day and your selected places in place while mapped attractions load." /> : null}
    {loading && !places.length ? <div className={styles.loadingSkeletons} aria-hidden="true"><MorroviaSkeleton height={54} radius="card" /><MorroviaSkeleton height={54} radius="card" /></div> : null}
    {!loading && searchUnavailable ? <MorroviaSectionStatus state="error" title="Attractions are unavailable" detail="Your day and existing selections are unchanged. Try the provider again when you’re ready." retryLabel="Try places again" onRetry={() => setSearchVersion((current) => current + 1)} /> : null}
    {visible.length ? <div className={styles.places}>{visible.map((place) => {
      const scheduledIdea = (trip.brief.itineraryIdeas ?? []).find((idea) => idea.stopId === stop.id && idea.placeId === place.id && Boolean(idea.dayId));
      const isSelected = selected.includes(place.title) || Boolean(scheduledIdea);
      const interestReason = itineraryInterestReason(place, interests);
      const scheduledPart = scheduledIdea?.dayPart ? scheduledIdea.dayPart[0]!.toUpperCase() + scheduledIdea.dayPart.slice(1) : null;
      return <article key={place.id}><ResilientImage className={styles.placeImage} src={place.image} alt="" fallback={<span className={styles.placeImageFallback} aria-hidden="true"><MapPin /></span>} /><div><small>{place.area} · {place.type}{interestReason ? ` · ${interestReason}` : ""}</small><strong>{place.title}</strong><p>{place.description}</p></div><button type="button" aria-pressed={isSelected} onClick={() => { onSelectionChange(stop.id, place, !isSelected); trackEvent(isSelected ? "attraction_removed" : "attraction_selected", { trip_id: trip.id, stop_id: stop.id, day_number: day?.dayNumber }); }}>{isSelected ? <>{scheduledPart ? `Added to ${scheduledPart}` : "Added"} <X /></> : <><Plus /> {day ? `Add to Day ${day.dayNumber}` : "Add to trip"}</>}</button></article>;
    })}</div> : !loading && !searchUnavailable ? <p className={styles.state}>No short list is available yet. Explore the map when you want a deeper look.</p> : null}
    <button type="button" className={styles.explore} onClick={() => { trackEvent("attraction_map_opened", { trip_id: trip.id, stop_id: stop.id }); onExploreMap(); }}>Explore more on map <Map /></button>
    {day && onSaveInventoryIdea && onScheduleInventoryIdea ? <LiveActivityInventory
      trip={trip}
      stop={stop}
      day={day}
      workspace="map"
      placement="map_see_experiences"
      initialItems={initialActivityInventory}
      onSave={onSaveInventoryIdea}
      onSchedule={onScheduleInventoryIdea}
      fallback={genericExperienceHandoff}
    /> : genericExperienceHandoff}
  </section>;
}
