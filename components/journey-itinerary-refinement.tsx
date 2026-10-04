"use client";

import { legacyItineraryIdeas } from "@/lib/easyt/trip";

import { MapPin, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { tripIntentForTrip, type EasyTTrip, type PlanItem, type TripStop } from "@/lib/easyt/trip";
import { rankItineraryDiscoveryPlaces } from "@/lib/easyt/itinerary-day-context";
import { getCurrentPartnerAction, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import { affiliateDisclosure, MorroviaAffiliateLink } from "@/components/easyt/affiliate-link";
import { MorroviaSectionStatus, MorroviaSkeleton } from "@/components/easyt/morrovia-loading-states";
import ResilientImage from "@/components/easyt/resilient-image";
import LiveActivityInventory from "@/components/easyt/live-activity-inventory";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import type { ActivityInventoryItem } from "@/lib/easyt/activity-inventory";
import type { ItineraryIdea } from "@/lib/easyt/trip";
import { recommendationDurationMs } from "@/lib/easyt/recommendation-performance";
import { discoveryVisitorRelevance } from "@/lib/easyt/discovery-quality";
import styles from "./journey-itinerary-refinement.module.css";

export type JourneyItineraryDiscoveryResult = { id: string; title: string; area: string; type: string; tags: string[]; description: string; image?: string; coordinates: [number, number]; qualityScore?: number; distanceKm?: number };

export function JourneyItineraryRefinement({ trip, stop, day, selectedPlaceId, onPlaceSelect, onPlacesChange, onSelectionChange, onSaveInventoryIdea, onScheduleInventoryIdea, onRemoveInventoryIdea, compact = false, activityAction, initialActivityInventory }: { trip: EasyTTrip; stop?: TripStop; day?: PlanItem; selectedPlaceId?: string | null; onPlaceSelect?: (place: JourneyItineraryDiscoveryResult) => void; onPlacesChange?: (places: JourneyItineraryDiscoveryResult[]) => void; onSelectionChange: (stopId: string, place: JourneyItineraryDiscoveryResult | string, selected: boolean) => void; onSaveInventoryIdea?: (idea: ItineraryIdea) => boolean; onScheduleInventoryIdea?: (idea: ItineraryIdea) => boolean; onRemoveInventoryIdea?: (idea: ItineraryIdea) => boolean; compact?: boolean; activityAction?: ResolvedAffiliateAction | null; initialActivityInventory?: ActivityInventoryItem[] }) {
  const [places, setPlaces] = useState<JourneyItineraryDiscoveryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const [searchVersion, setSearchVersion] = useState(0);
  const loadedDiscoveryKeyRef = useRef<string | null>(null);
  const filter = "for-you" as const;
  const [visibleCount, setVisibleCount] = useState(compact ? 6 : 8);
  const selected = stop ? trip.brief.selectedPlaces[stop.id] ?? [] : [];
  const interests = useMemo(() => tripIntentForTrip(trip).preferences.interests, [trip]);
  const rankedPlaces = useMemo(() => rankItineraryDiscoveryPlaces(places.filter((place) => discoveryVisitorRelevance({
    title: place.title,
    category: place.type,
    tags: place.tags,
    description: place.description,
    qualityScore: place.qualityScore,
    kind: "activity",
  }).eligible), interests), [interests, places]);
  const visible = useMemo(() => rankedPlaces.slice(0, visibleCount), [rankedPlaces, visibleCount]);
  const experienceAction = activityAction === undefined ? getCurrentPartnerAction("activities") : activityAction;

  useEffect(() => {
    onPlacesChange?.(visible);
    return () => onPlacesChange?.([]);
  }, [onPlacesChange, visible]);

  useEffect(() => {
    if (!stop || stop.latitude === null || stop.longitude === null) return;
    let active = true;
    const controller = new AbortController();
    const startedAt = performance.now();
    const discoveryKey = `${stop.id}:${filter}`;
    const retryingCurrentStop = searchVersion > 0 && loadedDiscoveryKeyRef.current === discoveryKey;
    setLoading(true);
    setSearchUnavailable(false);
    if (!retryingCurrentStop) setPlaces([]);
    const endpoint = "/api/journey-discover";
    void fetch(`${endpoint}?${new URLSearchParams({ destination: stop.name, country: stop.country, canonicalPlaceId: stop.canonicalPlaceId ?? stop.id, region: stop.region ?? "", lat: String(stop.latitude), lon: String(stop.longitude) })}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Attraction discovery unavailable");
        return response.json() as Promise<{ places?: JourneyItineraryDiscoveryResult[] }>;
      })
      .then((payload) => { if (active) {
        const routeStops = new Set(trip.stops.map((routeStop) => `${routeStop.name.trim().toLocaleLowerCase()}|${routeStop.country.trim().toLocaleLowerCase()}`));
        const nextPlaces = (payload.places ?? []).filter((place) => !routeStops.has(`${place.title.trim().toLocaleLowerCase()}|${stop.country.trim().toLocaleLowerCase()}`));
        setPlaces(nextPlaces);
        loadedDiscoveryKeyRef.current = discoveryKey;
        const properties = { surface: "map" as const, recommendation_kind: "activity" as const, lane: "core" as const, duration_ms: recommendationDurationMs(startedAt, performance.now()), result_count: nextPlaces.length, outcome: nextPlaces.length ? "ready" as const : "empty" as const };
        if (nextPlaces.length) trackEvent("recommendation_performance", { ...properties, milestone: "first_useful" });
        trackEvent("recommendation_performance", { ...properties, milestone: "lane_ready" });
      } })
      .catch((error: unknown) => {
        if (!active || (error as { name?: string })?.name === "AbortError") return;
        if (!retryingCurrentStop) setPlaces([]);
        setSearchUnavailable(true);
        trackEvent("recommendation_performance", { surface: "map", recommendation_kind: "activity", lane: "core", milestone: "lane_ready", duration_ms: recommendationDurationMs(startedAt, performance.now()), result_count: 0, outcome: "unavailable" });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [filter, searchVersion, stop?.canonicalPlaceId, stop?.country, stop?.id, stop?.latitude, stop?.longitude, stop?.name, stop?.region]);

  useEffect(() => {
    if (!stop) return;
    const key = `morrovia:attraction-viewed:${trip.id}:${stop.id}`;
    if (sessionStorage.getItem(key)) return;
    trackEvent("attraction_refinement_viewed", { trip_id: trip.id, stop_id: stop.id, selected_count: selected.length });
    sessionStorage.setItem(key, "1");
  }, [selected.length, stop, trip.id]);

  if (!stop || (stop.nights ?? 0) < 1) return null;
  const genericExperienceHandoff = experienceAction ? <div className={styles.experienceFallback}>
    <MorroviaAffiliateLink action={{ ...experienceAction, cta: "Browse tours and activities" }} context={{ placement: "map_see_experiences", tripId: trip.id, stopId: stop.id, workspaceView: "map" }} fullWidth />
    <small>{affiliateDisclosure}</small>
  </div> : null;
  return <section className={`${styles.panel} ${compact ? styles.compact : ""}`} aria-labelledby={`refinement-${stop.id}`}>
    <h3 className="sr-only" id={`refinement-${stop.id}`}>Places near {stop.name}</h3>
    {selected.length ? <div className={styles.selected}><small>IN YOUR TRIP</small><div>{selected.map((title) => <span key={title}>{title}<button type="button" onClick={() => { onSelectionChange(stop.id, title, false); trackEvent("attraction_removed", { trip_id: trip.id, stop_id: stop.id }); }} aria-label={`Remove ${title}`}><X /></button></span>)}</div></div> : null}
    {loading ? <MorroviaSectionStatus title="Finding places nearby" detail="Keeping this day and your selected places in place while mapped attractions load." /> : null}
    {loading && !places.length ? <div className={styles.loadingSkeletons} aria-hidden="true"><MorroviaSkeleton height={54} radius="card" /><MorroviaSkeleton height={54} radius="card" /></div> : null}
    {!loading && searchUnavailable ? <MorroviaSectionStatus state="error" title="Attractions are unavailable" detail="Your day and existing selections are unchanged. Try the provider again when you’re ready." retryLabel="Try places again" onRetry={() => setSearchVersion((current) => current + 1)} /> : null}
    {visible.length ? <div className={styles.places}>{visible.map((place) => {
      const scheduledIdea = (legacyItineraryIdeas(trip.brief.itineraryIdeas)).find((idea) => idea.stopId === stop.id && idea.placeId === place.id && Boolean(idea.dayId));
      const isSelected = selected.includes(place.title) || Boolean(scheduledIdea);
      const scheduledPart = scheduledIdea?.dayPart ? scheduledIdea.dayPart[0]!.toUpperCase() + scheduledIdea.dayPart.slice(1) : null;
      const scheduledDay = scheduledIdea?.dayId ? trip.planItems.find((item) => item.id === scheduledIdea.dayId)?.dayNumber : day?.dayNumber;
      const mapSelected = selectedPlaceId === place.id;
      return <article key={place.id} className={mapSelected ? styles.placeSelected : ""}><ResilientImage className={styles.placeImage} src={place.image} alt="" fallback={<span className={styles.placeImageFallback} aria-hidden="true"><MapPin /></span>} /><EasyTButton variant="quiet" size="small" className={styles.placeSelect} aria-pressed={mapSelected} onClick={() => onPlaceSelect?.(place)}><strong>{place.title}</strong>{place.description ? <p>{place.description}</p> : null}</EasyTButton><button type="button" aria-pressed={isSelected} onClick={() => { onPlaceSelect?.(place); onSelectionChange(stop.id, place, !isSelected); trackEvent(isSelected ? "attraction_removed" : "attraction_selected", { trip_id: trip.id, stop_id: stop.id, day_number: day?.dayNumber }); }}>{isSelected ? <>{scheduledDay ? `Added to Day ${scheduledDay}${scheduledPart ? ` · ${scheduledPart}` : ""}` : "Added to a day"} <X /></> : <><Plus /> {day ? `Add to Day ${day.dayNumber}` : "Add to a day"}</>}</button></article>;
    })}</div> : !loading && !searchUnavailable ? <p className={styles.state}>No places are available for this stop yet.</p> : null}
    {rankedPlaces.length > visible.length ? <EasyTButton variant="secondary" size="small" className={styles.showMore} onClick={() => setVisibleCount((count) => Math.min(rankedPlaces.length, count + 6))}>Show more places</EasyTButton> : null}
    {day && onSaveInventoryIdea && onScheduleInventoryIdea ? <LiveActivityInventory
      trip={trip}
      stop={stop}
      day={day}
      workspace="map"
      placement="map_see_experiences"
      initialItems={initialActivityInventory}
      onSave={onSaveInventoryIdea}
      onSchedule={onScheduleInventoryIdea}
      onRemove={onRemoveInventoryIdea}
      fallback={genericExperienceHandoff}
      discoveryCategory={filter}
    /> : genericExperienceHandoff}
  </section>;
}
