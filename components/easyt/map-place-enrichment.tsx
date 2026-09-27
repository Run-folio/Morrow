"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronLeft } from "lucide-react";
import { EasyTButton } from "./easyt-controls";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import { trackEvent } from "@/lib/analytics";
import { isEnrichedPlace, priceLevelLabel, type EnrichedPlace, type PlaceEnrichmentCategory } from "@/lib/easyt/place-enrichment";
import styles from "./map-place-enrichment.module.css";

const categories: Array<{ id: PlaceEnrichmentCategory; label: string }> = [
  { id: "see", label: "See" }, { id: "eat", label: "Eat" }, { id: "stay", label: "Stay" }, { id: "practical", label: "Practical" },
];

function validPlaces(value: unknown): EnrichedPlace[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { places?: unknown }).places)) return null;
  const places = (value as { places: unknown[] }).places;
  return places.every(isEnrichedPlace) ? places : null;
}

export default function MapPlaceEnrichment({ stopId, destination, coordinates, fixturePlaces, fixtureUnavailable = false }: {
  stopId: string;
  destination: string;
  coordinates: [number, number];
  /** Storybook-only data; production always uses the authenticated endpoint. */
  fixturePlaces?: EnrichedPlace[];
  fixtureUnavailable?: boolean;
}) {
  const [category, setCategory] = useState<PlaceEnrichmentCategory>("see");
  const [places, setPlaces] = useState<EnrichedPlace[]>(fixturePlaces ?? []);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "unavailable">(fixtureUnavailable ? "unavailable" : fixturePlaces ? "ready" : "loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EnrichedPlace | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const selected = places.find((place) => place.providerPlaceId === selectedId) ?? null;
  const visible = detail?.providerPlaceId === selectedId ? detail : selected;

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    if (fixturePlaces) { setPlaces(fixturePlaces); setStatus(fixtureUnavailable ? "unavailable" : fixturePlaces.length ? "ready" : "empty"); return; }
    const controller = new AbortController();
    const query = new URLSearchParams({ mode: "nearby", category, lat: String(coordinates[1]), lon: String(coordinates[0]) });
    setStatus("loading");
    void fetch(`/api/journey-place-enrichment?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        const parsed = validPlaces(await response.json());
        if (!parsed) throw new Error("malformed");
        if (!controller.signal.aborted) { setPlaces(parsed); setStatus(parsed.length ? "ready" : "empty"); }
      })
      .catch(() => { if (!controller.signal.aborted) { setPlaces([]); setStatus("unavailable"); } });
    return () => controller.abort();
  }, [category, coordinates[0], coordinates[1], fixturePlaces, fixtureUnavailable, stopId]);

  useEffect(() => {
    if (!selectedId || fixturePlaces) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailLoading(true);
    void fetch(`/api/journey-place-enrichment?${new URLSearchParams({ mode: "details", id: selectedId })}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        const value: unknown = (await response.json()).place;
        if (!isEnrichedPlace(value) || value.providerPlaceId !== selectedId) throw new Error("malformed");
        if (!controller.signal.aborted) setDetail(value);
      })
      .catch(() => { /* List facts and outbound action remain available. */ })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, fixturePlaces]);

  return <section className={styles.panel} aria-label={`Google Maps places near ${destination}`}>
    <div className={styles.source}>Places near {destination} <span>Google Maps</span></div>
    {selected && visible ? <div className={styles.detail}>
      <EasyTButton variant="quiet" size="small" icon={ChevronLeft} onClick={() => { setSelectedId(null); setDetail(null); }}>All places</EasyTButton>
      <h3>{visible.name}</h3>
      {visible.category ? <p className={styles.category}>{visible.category}</p> : null}
      {visible.rating !== undefined ? <p>{visible.rating.toFixed(1)} ★{visible.ratingCount !== undefined ? ` · ${visible.ratingCount.toLocaleString()} ratings` : ""}</p> : null}
      {priceLevelLabel(visible.priceLevel) ? <p>Price level: {priceLevelLabel(visible.priceLevel)}</p> : null}
      {visible.openNow !== undefined ? <p>{visible.openNow ? "Open now" : "Closed now"}</p> : null}
      {visible.address ? <p>{visible.address}</p> : null}
      {visible.hours?.length ? <details><summary>Opening hours</summary><ul>{visible.hours.map((hour) => <li key={hour}>{hour}</li>)}</ul></details> : null}
      {detailLoading ? <p role="status">Loading more place details…</p> : null}
      {visible.website ? <a href={visible.website} target="_blank" rel="noopener noreferrer">Website <ArrowUpRight aria-hidden="true" /></a> : null}
      <a href={visible.mapsUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("map_place_enrichment_handoff", { category })}>Open in Google Maps <ArrowUpRight aria-hidden="true" /></a>
      {visible.attributions?.map((item) => <small key={item.name}>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a> : item.name}</small>)}
    </div> : <>
      <div className={styles.categories} role="group" aria-label="Place category">{categories.map((item) => <EasyTButton key={item.id} size="small" variant={category === item.id ? "primary" : "quiet"} aria-pressed={category === item.id} onClick={() => { if (item.id !== category) { setCategory(item.id); trackEvent("map_place_enrichment_category", { category: item.id }); } }}>{item.label}</EasyTButton>)}</div>
      {status === "loading" ? <MorroviaSectionStatus state="loading" title="Finding nearby places" detail="Checking this destination now." /> : null}
      {status === "unavailable" ? <p role="status">Google places are unavailable. Your route map and existing places still work.</p> : null}
      {status === "empty" ? <p role="status">No nearby places found for this category.</p> : null}
      {status === "ready" ? <ul className={styles.results}>{places.map((place) => <li key={place.providerPlaceId}><EasyTButton variant="quiet" fullWidth className={styles.resultButton} onClick={() => { setSelectedId(place.providerPlaceId); trackEvent("map_place_enrichment_result", { category }); }}><strong>{place.name}</strong>{place.category ? <span>{place.category}</span> : null}{place.address ? <small>{place.address}</small> : null}</EasyTButton></li>)}</ul> : null}
    </>}
  </section>;
}
