"use client";

import type { ErrorEvent as MapLibreErrorEvent, Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { normalizeRouteMapFailure } from "@/lib/easyt/route-map-runtime";
import type { RouteMapSelection } from "./route-map-selection";
import styles from "./route-overview.module.css";

type RouteStop = { id: string; name: string; coordinates: [number, number] };

// Public detail keeps the production MapLibre/worker owner. The old keyless
// CARTO raster endpoint now returns an API-key watermark; Positron retains the
// quiet geographic treatment with source-provided attribution and no key.
const mapStyle = "https://tiles.openfreemap.org/styles/positron";

export default function RouteLiveMap({ title, stops, className, selected = null, onSelect, resetVersion = 0 }: {
  title: string; stops: RouteStop[]; className?: string; selected?: RouteMapSelection;
  onSelect?: (selection: RouteMapSelection) => void; resetVersion?: number;
}) {
  const selectionRef = useRef(selected);
  const onSelectRef = useRef(onSelect);
  const updateSelection = useRef<(() => void) | null>(null);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { selectionRef.current = selected; updateSelection.current?.(); }, [selected, resetVersion]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"waiting" | "loading" | "ready" | "unavailable">("waiting");

  useEffect(() => {
    const container = containerRef.current;
    const mappedStops = stops.map((stop, index) => ({ ...stop, index })).filter((stop) => Number.isFinite(stop.coordinates[0]) && Number.isFinite(stop.coordinates[1]));
    if (!container) return;
    if (!mappedStops.length) {
      setStatus("unavailable");
      return;
    }
    let map: MapLibreMap | null = null;
    let markers: MapLibreMarker[] = [];
    let resizeObserver: ResizeObserver | null = null;
    let disposed = false;
    let started = false;
    let failed = false;
    const reportFailure = (value: unknown) => {
      const failure = normalizeRouteMapFailure(value);
      failed = true;
      if (failure.category === "provider-resource") {
        console.warn("Morrovia route map provider unavailable.", failure.error);
      } else {
        console.error(failure.error);
      }
      if (!disposed) setStatus("unavailable");
    };
    const initialise = async () => {
      if (started || disposed) return;
      started = true;
      setStatus("loading");
      const maplibregl = await import("maplibre-gl");
      if (disposed) return;
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      const initialBounds = mappedStops.reduce((bounds, stop) => bounds.extend(stop.coordinates), new maplibregl.LngLatBounds(mappedStops[0].coordinates, mappedStops[0].coordinates));
      map = new maplibregl.Map({
        container,
        style: mapStyle,
        attributionControl: false,
        center: mappedStops[0].coordinates,
        zoom: 7,
        bounds: initialBounds,
        fitBoundsOptions: { padding: { top: 85, right: 60, bottom: 70, left: 60 }, maxZoom: 8, duration: 0 },
      });
      map.on("error", reportFailure as (event: MapLibreErrorEvent) => void);
      map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

      markers = mappedStops.map((stop) => {
        const index = stop.index;
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "route-overview-map__marker";
        marker.setAttribute("aria-label", `Stop ${index + 1}: ${stop.name}`);
        const number = document.createElement("span");
        number.textContent = String(index + 1);
        const label = document.createElement("b");
        label.textContent = stop.name;
        marker.append(number, label);
        marker.setAttribute("aria-pressed", "false");
        marker.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelectRef.current?.({ type: "stop", index });
        });
        return new maplibregl.Marker({ element: marker, anchor: "center" }).setLngLat(stop.coordinates).addTo(map!);
      });

      const drawRoute = () => {
        if (!map || map.getSource("route-overview-line")) return;
        const colors = getComputedStyle(container);
        const lineColor = colors.getPropertyValue("--morrovia-signal").trim();
        const selectedColor = colors.getPropertyValue("--morrovia-action").trim();
        map.addSource("route-overview-line", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: stops.slice(0, -1).flatMap((stop, index) => {
              const next = stops[index + 1];
              // Never bridge over a missing coordinate and imply a different leg.
              if (![...stop.coordinates, ...next.coordinates].every(Number.isFinite)) return [];
              return [{ type: "Feature" as const, properties: { index }, geometry: { type: "LineString" as const, coordinates: [stop.coordinates, next.coordinates] } }];
            }),
          },
        });
        map.addLayer({ id: "route-overview-line", type: "line", source: "route-overview-line", paint: { "line-color": lineColor, "line-width": 3, "line-opacity": .85, "line-dasharray": [2, 2] } });
        map.addLayer({ id: "route-overview-selected", type: "line", source: "route-overview-line", filter: ["==", ["get", "index"], -1], paint: { "line-color": selectedColor, "line-width": 5 } });
        map.addLayer({ id: "route-overview-hit", type: "line", source: "route-overview-line", paint: { "line-color": selectedColor, "line-width": 28, "line-opacity": 0 } });
        map.on("click", "route-overview-hit", (event) => {
          if ((event.originalEvent.target as HTMLElement)?.closest(".route-overview-map__marker")) return;
          const index = Number(event.features?.[0]?.properties?.index);
          if (Number.isInteger(index)) onSelectRef.current?.({ type: "connection", index });
        });
        map.on("mouseenter", "route-overview-hit", () => { if (map) map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "route-overview-hit", () => { if (map) map.getCanvas().style.cursor = ""; });
        const fit = (coordinates: [number, number][]) => {
          if (!map || !coordinates.length) return;
          if (coordinates.length === 1) { map.jumpTo({ center: coordinates[0], zoom: 8 }); return; }
          const bounds = coordinates.reduce((current, point) => current.extend(point), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
          map.fitBounds(bounds, { padding: { top: 85, right: 60, bottom: 70, left: 60 }, maxZoom: 8, duration: 0 });
        };
        updateSelection.current = () => {
          if (!map) return;
          const selection = selectionRef.current;
          markers.forEach((marker, index) => marker.getElement().setAttribute("aria-pressed", String(selection?.type === "stop" && selection.index === mappedStops[index].index)));
          map.setFilter("route-overview-selected", ["==", ["get", "index"], selection?.type === "connection" ? selection.index : -1]);
          const active = selection ? mappedStops.filter(stop => stop.index === selection.index || (selection.type === "connection" && stop.index === selection.index + 1)) : mappedStops;
          fit(active.map(stop => stop.coordinates));
        };
        updateSelection.current();
        if ("ResizeObserver" in window) {
          resizeObserver = new ResizeObserver(() => { map?.resize(); updateSelection.current?.(); });
          resizeObserver.observe(container);
        }
      };

      const finish = () => {
        if (failed) return;
        try {
          drawRoute();
          if (!disposed) setStatus("ready");
        } catch (error) {
          reportFailure(error);
        }
      };
      if (map.isStyleLoaded()) finish();
      else map.once("load", finish);
    };

    const observer = "IntersectionObserver" in window ? new IntersectionObserver((entries, currentObserver) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        currentObserver.disconnect();
        void initialise().catch(reportFailure);
      }
    }, { rootMargin: "320px" }) : null;
    if (observer) observer.observe(container);
    else void initialise().catch(reportFailure);
    return () => {
      disposed = true;
      observer?.disconnect();
      resizeObserver?.disconnect();
      updateSelection.current = null;
      markers.forEach((marker) => marker.remove());
      map?.off("error", reportFailure as (event: MapLibreErrorEvent) => void);
      map?.remove();
    };
  }, [stops, title]);

  return <div className={`${className ?? ""} ${styles.mapShell}`} role="region" aria-label={`Interactive map of ${title}`}>
    <div ref={containerRef} className={styles.mapCanvas} />
    {status !== "ready" && <p className={styles.mapStatus}>{status === "unavailable" ? "The live map is unavailable. The ordered route remains listed below." : status === "waiting" ? "The geographic map opens as you reach this section." : "Loading route map…"}</p>}
  </div>;
}
