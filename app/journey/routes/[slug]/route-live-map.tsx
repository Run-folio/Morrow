"use client";

import type { ErrorEvent as MapLibreErrorEvent, Map as MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { normalizeRouteMapFailure } from "@/lib/easyt/route-map-runtime";
import styles from "./route-overview.module.css";

type RouteStop = { id: string; name: string; coordinates: [number, number] };

// Keep route discovery on the same dependable, no-key basemap as the planner.
const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: ["https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 20,
      attribution: "© CARTO, © OpenStreetMap contributors",
    },
  },
  layers: [{ id: "carto-light", type: "raster", source: "carto" }],
};

export default function RouteLiveMap({ title, stops, className }: { title: string; stops: RouteStop[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"waiting" | "loading" | "ready" | "unavailable">("waiting");

  useEffect(() => {
    const container = containerRef.current;
    const mappedStops = stops.filter((stop) => Number.isFinite(stop.coordinates[0]) && Number.isFinite(stop.coordinates[1]));
    if (!container) return;
    if (!mappedStops.length) {
      setStatus("unavailable");
      return;
    }
    let map: MapLibreMap | null = null;
    let markers: MapLibreMarker[] = [];
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
      map = new maplibregl.Map({
        container,
        style: mapStyle,
        center: mappedStops[0].coordinates,
        zoom: 7,
      });
      map.on("error", reportFailure as (event: MapLibreErrorEvent) => void);
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

      markers = mappedStops.map((stop, index) => {
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "route-overview-map__marker";
        marker.setAttribute("aria-label", `Stop ${index + 1}: ${stop.name}`);
        const number = document.createElement("span");
        number.textContent = String(index + 1);
        const label = document.createElement("b");
        label.textContent = stop.name;
        marker.append(number, label);
        return new maplibregl.Marker({ element: marker, anchor: "center" }).setLngLat(stop.coordinates).addTo(map!);
      });

      const drawRoute = () => {
        if (!map || map.getSource("route-overview-line")) return;
        map.addSource("route-overview-line", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: { title },
            geometry: { type: "LineString", coordinates: mappedStops.map((stop) => stop.coordinates) },
          },
        });
        map.addLayer({
          id: "route-overview-line",
          type: "line",
          source: "route-overview-line",
          paint: { "line-color": "#f42b7a", "line-width": 4, "line-opacity": 0.9 },
        });

        if (mappedStops.length === 1) {
          map.jumpTo({ center: mappedStops[0].coordinates, zoom: 9 });
          return;
        }
        const bounds = mappedStops.reduce(
          (current, stop) => current.extend(stop.coordinates),
          new maplibregl.LngLatBounds(mappedStops[0].coordinates, mappedStops[0].coordinates),
        );
        map.fitBounds(bounds, { padding: { top: 70, right: 110, bottom: 70, left: 90 }, maxZoom: 8, duration: 0 });
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
      markers.forEach((marker) => marker.remove());
      map?.off("error", reportFailure as (event: MapLibreErrorEvent) => void);
      map?.remove();
    };
  }, [stops, title]);

  return <div className={`${className ?? ""} ${styles.mapShell}`} role="region" aria-label={`Interactive map of ${title}`}>
    <div ref={containerRef} className={styles.mapCanvas} />
    {status !== "ready" && <p className={styles.mapStatus}>{status === "unavailable" ? "The live map is unavailable. The ordered route remains listed below." : "Loading route map…"}</p>}
  </div>;
}
