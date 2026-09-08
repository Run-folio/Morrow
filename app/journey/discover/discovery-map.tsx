"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibre from "maplibre-gl";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import world from "world-atlas/countries-50m.json";
import type { DiscoveryRoute } from "@/lib/easyt/discovery-catalogue";
import { MorroviaMapLoading } from "@/components/easyt/morrovia-loading-states";
import styles from "./discover.module.css";

const land = feature(world as unknown as Topology, world.objects.countries as unknown as GeometryCollection);
// Natural Earth rings crossing ±180° need continuous longitude for Mercator tessellation.
// Antarctica lies outside this catalogue's Mercator extent.
land.features = land.features.filter((country) => (country.properties as { name?: string } | null)?.name !== "Antarctica");
for (const country of land.features) {
  const geometry = country.geometry;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  for (const polygon of polygons) for (const ring of polygon) {
    for (let index = 1; index < ring.length; index++) {
      while (ring[index][0] - ring[index - 1][0] > 180) ring[index][0] -= 360;
      while (ring[index][0] - ring[index - 1][0] < -180) ring[index][0] += 360;
    }
  }
}
const emptyRoutes: DiscoveryRoute[] = [];
export default function DiscoveryMap({ route, routes = emptyRoutes, overview = false, selectedStop = 0, onStop, onRoute }: { route: DiscoveryRoute; routes?: DiscoveryRoute[]; overview?: boolean; selectedStop?: number; onStop?: (index: number) => void; onRoute?: (route: DiscoveryRoute) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onStop, onRoute });
  callbacks.current = { onStop, onRoute };
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let disposed = false;
    let map: maplibre.Map | null = null;
    let resize: ResizeObserver | null = null;
    let failed = false;
    setStatus("loading");
    const fail = () => { failed = true; if (!disposed) setStatus("unavailable"); };
    const timer = window.setTimeout(fail, 12_000);
    try {
      const visible = (overview ? routes : [route]).filter((item) => item.stops.length && item.stops.every((stop) => stop.coordinates.every(Number.isFinite)));
      if (!visible.length) throw new Error("No route coordinates");
      const tokens = getComputedStyle(container);
      const token = (key: string) => tokens.getPropertyValue(`--morrovia-${key}`).trim();
      maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new maplibre.Map({ container, attributionControl: { compact: false }, scrollZoom: false, dragRotate: false, pitchWithRotate: false, center: route.stops[0].coordinates, zoom: 3,
        style: { version: 8, sources: { land: { type: "geojson", data: land, attribution: "Natural Earth · approximate geography" } }, layers: [
          { id: "sea", type: "background", paint: { "background-color": token("lilac-strong") } },
          { id: "land", type: "fill", source: "land", paint: { "fill-color": token("paper") } },
          { id: "countries", type: "fill", source: "land", filter: ["in", ["get", "name"], ["literal", overview ? [] : route.countries]], paint: { "fill-color": token("tint") } },
          { id: "borders", type: "line", source: "land", paint: { "line-color": token("ink"), "line-opacity": .16, "line-width": 1 } },
        ] },
      });
      map.on("error", fail);
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      map.once("load", () => {
        if (disposed || !map || failed) return;
        map.addSource("journeys", { type: "geojson", data: { type: "FeatureCollection", features: visible.filter((item) => item.stops.length > 1).map((item) => ({ type: "Feature", properties: { key: item.key }, geometry: { type: "LineString", coordinates: item.stops.map((stop) => stop.coordinates) } })) } });
        map.addLayer({ id: "journey-lines", source: "journeys", type: "line", paint: { "line-color": token("signal"), "line-width": overview ? 2 : 3, "line-dasharray": [2, 2] } });
        visible.forEach((item) => {
          const stops = overview ? item.stops.slice(0, 1) : item.stops;
          stops.forEach((stop, index) => {
            // Spatial DOM markers are owned by MapLibre, with keyboard-equivalent route/stop lists outside the canvas.
            const button = document.createElement("button");
            button.type = "button";
            button.className = overview ? styles["atlas-route-marker"] : styles["atlas-stop-marker"];
            button.setAttribute("aria-label", overview ? `Show ${item.title} on map` : `Select stop ${index + 1}: ${stop.name}`);
            if (!overview) button.setAttribute("aria-pressed", String(index === selectedStop));
            const number = document.createElement("span"); number.textContent = String(overview ? routes.indexOf(item) + 1 : index + 1); button.append(number);
            if (!overview) { const label = document.createElement("b"); label.textContent = stop.name; button.append(label); }
            button.onclick = () => overview ? callbacks.current.onRoute?.(item) : callbacks.current.onStop?.(index);
            new maplibre.Marker({ element: button, anchor: "center" }).setLngLat(stop.coordinates).addTo(map!);
          });
        });
        const bounds = new maplibre.LngLatBounds(); visible.forEach((item) => item.stops.forEach((stop) => bounds.extend(stop.coordinates)));
        map.fitBounds(bounds, { padding: { top: 65, bottom: 65, left: 70, right: 70 }, maxZoom: 8, duration: 0 });
        window.clearTimeout(timer); setStatus("ready");
      });
      resize = new ResizeObserver(() => map?.resize()); resize.observe(container);
    } catch { fail(); }
    return () => { disposed = true; window.clearTimeout(timer); resize?.disconnect(); map?.remove(); };
  }, [route, routes, overview, retry]);
  useEffect(() => { ref.current?.querySelectorAll(`.${styles["atlas-stop-marker"]}`).forEach((button, index) => button.setAttribute("aria-pressed", String(index === selectedStop))); }, [selectedStop]);
  return <div className={styles["geographic-map"]} role="region" aria-label={overview ? "Map of matching routes" : `Geographic map of ${route.title}`}>
    <div className={styles["map-canvas"]} ref={ref} data-map-status={status} />
    {status !== "ready" && <div className={styles.mapStatus}><MorroviaMapLoading state={status === "unavailable" ? "error" : "initial"} onRetry={() => setRetry((value) => value + 1)}>The complete ordered route remains available in the list.</MorroviaMapLoading></div>}
    <p className={styles["map-note"]}>Illustrative connections · transfers to verify</p>
  </div>;
}

