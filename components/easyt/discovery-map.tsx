"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibre from "maplibre-gl";
import type { DiscoveryPlace } from "@/lib/easyt/discovery-content";
import { discoveryMapTarget } from "@/lib/easyt/discovery-map-target";
import { applyMapCameraRequest, type MapCamera } from "@/lib/easyt/map-camera";
import { createMorroviaBasemapLifecycle, type MorroviaBasemapMap } from "@/lib/easyt/map-basemap-lifecycle";
import { bindMapMarkerActivation } from "@/lib/easyt/map-spatial-context";
import { resolveMapCameraRequest, resolveMapInsets } from "@/lib/easyt/map-surface-policy";
import { MORROVIA_STOP_MARKER_CLASS } from "./morrovia-map-presentation";
import mapPresentation from "./morrovia-map-presentation.module.css";
import { MORROVIA_MAP_WORKER_URL, morroviaMapOptions } from "./morrovia-map-runtime";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import styles from "./discovery-modal.module.css";

/** Controlled spatial preview. All selection and trip decisions stay with Discovery. */
export default function DiscoveryMap({ places, highlightedPlaceId, onHighlight, onUnavailable, language = "en" }: {
  places: readonly DiscoveryPlace[];
  highlightedPlaceId: string | null;
  onHighlight: (placeId: string) => void;
  onUnavailable: () => void;
  language?: "en" | "es";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onHighlight, onUnavailable });
  callbacksRef.current = { onHighlight, onUnavailable };
  const highlightedRef = useRef(highlightedPlaceId);
  highlightedRef.current = highlightedPlaceId;
  const sceneRef = useRef<{ map: maplibre.Map; markers: Map<string, HTMLButtonElement>; ready: boolean } | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const targets = places.map(place => discoveryMapTarget(place.id, places)).filter((target): target is NonNullable<typeof target> => Boolean(target));
    if (!targets.length) { callbacksRef.current.onUnavailable(); return; }
    let disposed = false;
    let map: maplibre.Map | null = null;
    let resize: ResizeObserver | null = null;
    let lifecycle: ReturnType<typeof createMorroviaBasemapLifecycle> | null = null;
    const markers = new Map<string, HTMLButtonElement>();
    setMapReady(false);
    const fail = () => { if (!disposed) callbacksRef.current.onUnavailable(); };
    const timeout = window.setTimeout(fail, 18_000);
    const camera = () => {
      if (!map || disposed || !sceneRef.current?.ready) return;
      const target = highlightedRef.current ? discoveryMapTarget(highlightedRef.current, places) : null;
      const cameraTarget = target
        ? { kind: "stop" as const, id: target.id, coordinates: target.coordinates }
        : { kind: "collection" as const, coordinates: targets.map(item => item.coordinates) };
      const padding = resolveMapInsets({ width: container.clientWidth, height: container.clientHeight, safe: 24 });
      applyMapCameraRequest(map as unknown as MapCamera, resolveMapCameraRequest(cameraTarget, padding),
        points => points.slice(1).reduce((bounds, point) => bounds.extend(point), new maplibre.LngLatBounds(points[0], points[0])), true);
    };
    try {
      maplibre.setWorkerUrl(MORROVIA_MAP_WORKER_URL);
      map = new maplibre.Map({ container, ...morroviaMapOptions({ variant: "preview" }, "compact"), center: targets[0].coordinates, zoom: 3 });
      sceneRef.current = { map, markers, ready: false };
      targets.forEach(target => {
        const place = places.find(item => item.id === target.id)!;
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = MORROVIA_STOP_MARKER_CLASS;
        marker.textContent = "•";
        marker.dataset.mapPlaceId = target.id;
        marker.setAttribute("aria-label", `${language === "es" ? "Ver tarjeta de" : "Show card for"} ${place.name}`);
        marker.setAttribute("aria-pressed", String(target.id === highlightedRef.current));
        marker.classList.toggle("is-active", target.id === highlightedRef.current);
        bindMapMarkerActivation(marker, () => callbacksRef.current.onHighlight(target.id));
        new maplibre.Marker({ element: marker, anchor: "center" }).setLngLat(target.coordinates).addTo(map!);
        markers.set(target.id, marker);
      });
      lifecycle = createMorroviaBasemapLifecycle(map as unknown as MorroviaBasemapMap, {
        onStyleReady: () => { if (disposed || !sceneRef.current) return; sceneRef.current.ready = true; window.clearTimeout(timeout); setMapReady(true); camera(); },
      });
      const mapLifecycle = lifecycle;
      map.on("error", event => { if (!mapLifecycle.handleError(event)) fail(); });
      resize = new ResizeObserver(() => { map?.resize(); camera(); });
      resize.observe(container);
    } catch { fail(); }
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      resize?.disconnect();
      lifecycle?.dispose();
      sceneRef.current = null;
      map?.remove();
    };
  }, [places, language]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.markers.forEach((marker, id) => {
      const selected = id === highlightedPlaceId;
      marker.classList.toggle("is-active", selected);
      marker.setAttribute("aria-pressed", String(selected));
    });
    if (scene.ready) {
      const target = highlightedPlaceId ? discoveryMapTarget(highlightedPlaceId, places) : null;
      if (target) {
        const padding = resolveMapInsets({ width: scene.map.getContainer().clientWidth, height: scene.map.getContainer().clientHeight, safe: 24 });
        applyMapCameraRequest(scene.map as unknown as MapCamera,
          resolveMapCameraRequest({ kind: "stop", id: target.id, coordinates: target.coordinates }, padding), () => null);
      }
    }
  }, [highlightedPlaceId, places]);

  return <>
    <div className={`${styles.mapCanvas} ${mapPresentation.surface}`} ref={containerRef} role="region"
      aria-label={language === "es" ? "Mapa de los lugares disponibles" : "Map of available places"} />
    {!mapReady ? <div className={styles.mapLoadStatus}><MorroviaSectionStatus compact
      title={language === "es" ? "Abriendo mapa" : "Opening map"}
      detail={language === "es" ? "Las tarjetas de lugares siguen disponibles." : "The place cards remain available."} /></div> : null}
  </>;
}
