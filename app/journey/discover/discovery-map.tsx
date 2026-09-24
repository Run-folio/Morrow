"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibre from "maplibre-gl";
import { createMorroviaStopMarker, setMorroviaStopMarkerState } from "@/components/easyt/morrovia-map-markers";
import { installMorroviaMapControls, MORROVIA_MAP_WORKER_URL, morroviaMapOptions } from "@/components/easyt/morrovia-map-runtime";
import { mapRouteCasing, mapRouteLine, mapRoutePlanning } from "@/components/easyt/morrovia-map-presentation";
import mapPresentation from "@/components/easyt/morrovia-map-presentation.module.css";
import type { DiscoveryRoute } from "@/lib/easyt/discovery-catalogue";
import { applyMapCameraRequest, type MapCamera } from "@/lib/easyt/map-camera";
import { bindMapMarkerActivation } from "@/lib/easyt/map-spatial-context";
import { resolveMapCameraRequest, resolveMapInsets, resolveMapSurfacePolicy, type MorroviaMapInsets, type MorroviaMapSurface } from "@/lib/easyt/map-surface-policy";
import { MorroviaMapLoading } from "@/components/easyt/morrovia-loading-states";
import styles from "./discover.module.css";

export type DiscoveryMapSelection =
  | { kind: "collection" }
  | { kind: "route"; routeKey: string }
  | { kind: "stop"; routeKey: string; stopId: string };

const emptyRoutes: DiscoveryRoute[] = [];

export default function DiscoveryMap({
  route,
  routes = emptyRoutes,
  selection,
  surface,
  cameraOcclusions,
  onSelection,
}: {
  route: DiscoveryRoute;
  routes?: DiscoveryRoute[];
  selection: DiscoveryMapSelection;
  surface: MorroviaMapSurface;
  cameraOcclusions?: Partial<MorroviaMapInsets>;
  onSelection?: (selection: DiscoveryMapSelection) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onSelection);
  callback.current = onSelection;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const cameraOcclusionsRef = useRef(cameraOcclusions);
  cameraOcclusionsRef.current = cameraOcclusions;
  const mapRef = useRef<maplibre.Map | null>(null);
  const sceneReadyRef = useRef(false);
  const markersRef = useRef<Array<{ routeKey: string; stopId: string; element: HTMLElement }>>([]);
  const applySelectionCameraRef = useRef<((reducedMotion: boolean) => void) | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [retry, setRetry] = useState(0);
  const occlusionKey = `${cameraOcclusions?.top ?? 0}:${cameraOcclusions?.right ?? 0}:${cameraOcclusions?.bottom ?? 0}:${cameraOcclusions?.left ?? 0}`;
  const sceneKey = selection.kind === "collection" ? "collection" : selection.routeKey;
  const surfaceInteraction = "interaction" in surface ? surface.interaction : null;

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    sceneReadyRef.current = false;
    let disposed = false;
    let map: maplibre.Map | null = null;
    let resize: ResizeObserver | null = null;
    let failed = false;
    const overviewScene = sceneKey === "collection";
    const selectedRouteKey = overviewScene ? null : sceneKey;
    const selectedRoute = routes.find((item) => item.key === selectedRouteKey) ?? route;
    const activeRoutes = overviewScene ? routes : [selectedRoute];
    const visible = activeRoutes.filter((item) => item.stops.some((stop) => stop.coordinates.every(Number.isFinite)));
    const coordinates = visible.flatMap((item) => item.stops.map((stop) => stop.coordinates).filter((point) => point.every(Number.isFinite)));
    const initialSelection = selectionRef.current;
    const initialSelectedStop = initialSelection.kind === "stop"
      ? selectedRoute.stops.find((stop) => stop.id === initialSelection.stopId)
      : null;
    setStatus("loading");
    const fail = () => { failed = true; if (!disposed) setStatus("unavailable"); };
    const timer = window.setTimeout(fail, 12_000);
    try {
      if (!coordinates.length) throw new Error("No route coordinates");
      maplibre.setWorkerUrl(MORROVIA_MAP_WORKER_URL);
      map = new maplibre.Map({
        container,
        ...morroviaMapOptions(surface, "expanded"),
        center: initialSelectedStop?.coordinates ?? selectedRoute.stops[0]?.coordinates ?? coordinates[0],
        zoom: 3,
      });
      mapRef.current = map;
      map.on("error", fail);
      installMorroviaMapControls(map, maplibre, surface);
      const applySelectionCamera = (reducedMotion: boolean) => {
        if (!map) return;
        const currentSelection = selectionRef.current;
        const selectedStop = currentSelection.kind === "stop"
          ? selectedRoute.stops.find((stop) => stop.id === currentSelection.stopId)
          : null;
        const target = selectedStop
          ? { kind: "stop" as const, id: selectedStop.id, coordinates: selectedStop.coordinates }
          : currentSelection.kind === "collection"
            ? { kind: "collection" as const, ids: visible.map((item) => item.key), coordinates }
            : { kind: "route" as const, ids: [selectedRoute.key], coordinates: selectedRoute.stops.map((stop) => stop.coordinates) };
        const padding = resolveMapInsets({ width: container.clientWidth, height: container.clientHeight, safe: 48, occlusions: cameraOcclusionsRef.current });
        applyMapCameraRequest(
          map as unknown as MapCamera,
          resolveMapCameraRequest(target, padding),
          (points) => points.slice(1).reduce((bounds, point) => bounds.extend(point), new maplibre.LngLatBounds(points[0], points[0])),
          reducedMotion,
        );
      };
      applySelectionCameraRef.current = applySelectionCamera;
      map.once("load", () => {
        if (disposed || !map || failed) return;
        map.addSource("journeys", { type: "geojson", data: { type: "FeatureCollection", features: visible.filter((item) => item.stops.length > 1).map((item) => ({ type: "Feature", properties: { key: item.key }, geometry: { type: "LineString", coordinates: item.stops.map((stop) => stop.coordinates) } })) } });
        for (const [id, paint] of [["casing", mapRouteCasing], ["line", mapRouteLine], ["planning", mapRoutePlanning]] as const) {
          map.addLayer({ id: `journey-${id}`, source: "journeys", type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint });
        }
        visible.forEach((item, routeIndex) => {
          const stops = overviewScene ? item.stops.slice(0, 1) : item.stops;
          stops.forEach((stop, stopIndex) => {
            const interactive = resolveMapSurfacePolicy(surface).domainSelection;
            const marker = createMorroviaStopMarker(document, {
              id: stop.id,
              sequence: overviewScene ? routeIndex + 1 : stopIndex + 1,
              name: stop.name,
              interactive,
              selected: selectionRef.current.kind === "stop" && selectionRef.current.routeKey === item.key && selectionRef.current.stopId === stop.id,
              origin: !overviewScene && stopIndex === 0,
              journeyEnd: !overviewScene && stopIndex === stops.length - 1,
            });
            markersRef.current.push({ routeKey: item.key, stopId: stop.id, element: marker });
            if (interactive) {
              marker.setAttribute("aria-label", overviewScene ? `Show ${item.title} on map` : `Select stop ${stopIndex + 1}: ${stop.name}`);
              bindMapMarkerActivation(marker, () => callback.current?.(overviewScene
                ? { kind: "route", routeKey: item.key }
                : { kind: "stop", routeKey: item.key, stopId: stop.id }));
            }
            new maplibre.Marker({ element: marker, anchor: "center" }).setLngLat(stop.coordinates).addTo(map!);
          });
        });
        window.clearTimeout(timer);
        sceneReadyRef.current = true;
        setStatus("ready");
      });
      resize = new ResizeObserver(() => {
        if (!map) return;
        map.resize();
        applySelectionCamera(true);
      });
      resize.observe(container);
    } catch {
      fail();
    }
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      resize?.disconnect();
      if (mapRef.current === map) { mapRef.current = null; sceneReadyRef.current = false; applySelectionCameraRef.current = null; markersRef.current = []; }
      map?.remove();
    };
  }, [retry, route, routes, sceneKey, surface.variant, surfaceInteraction]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current || !sceneReadyRef.current) return;
    markersRef.current.forEach(({ routeKey, stopId, element }) => setMorroviaStopMarkerState(element, {
      selected: selection.kind === "stop" && selection.routeKey === routeKey && selection.stopId === stopId,
    }));
    applySelectionCameraRef.current?.(true);
  }, [occlusionKey, selection, status]);

  const overview = selection.kind === "collection";
  return <div className={styles["geographic-map"]} role="region" aria-label={overview ? "Map of matching routes" : `Geographic map of ${route.title}`}>
    <div className={`${styles["map-canvas"]} ${mapPresentation.surface}`} ref={ref} data-map-status={status} data-map-selection={selection.kind} />
    {status !== "ready" && <div className={styles.mapStatus}><MorroviaMapLoading state={status === "unavailable" ? "error" : "initial"} onRetry={() => setRetry((value) => value + 1)}>The complete ordered route remains available in the list.</MorroviaMapLoading></div>}
    <p className={styles["map-note"]}>Illustrative connections · transfers to verify</p>
  </div>;
}
