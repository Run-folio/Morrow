"use client";

import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";

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

  useEffect(() => {
    const container = containerRef.current;
    const mappedStops = stops.filter((stop) => Number.isFinite(stop.coordinates[0]) && Number.isFinite(stop.coordinates[1]));
    if (!container || !mappedStops.length) return;

    const map = new maplibregl.Map({
      container,
      style: mapStyle,
      center: mappedStops[0].coordinates,
      zoom: 7,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

    const markers = mappedStops.map((stop, index) => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "route-overview-map__marker";
      marker.setAttribute("aria-label", `Stop ${index + 1}: ${stop.name}`);
      const number = document.createElement("span");
      number.textContent = String(index + 1);
      const label = document.createElement("b");
      label.textContent = stop.name;
      marker.append(number, label);
      return new maplibregl.Marker({ element: marker, anchor: "center" }).setLngLat(stop.coordinates).addTo(map);
    });

    const drawRoute = () => {
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
        paint: { "line-color": "#ff3d8b", "line-width": 4, "line-opacity": 0.9 },
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

    if (map.isStyleLoaded()) drawRoute();
    else map.once("load", drawRoute);

    return () => {
      markers.forEach((marker) => marker.remove());
      map.remove();
    };
  }, [stops, title]);

  return <div ref={containerRef} className={className} aria-label={`Interactive map of ${title}`} />;
}
