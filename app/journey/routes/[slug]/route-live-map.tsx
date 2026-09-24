"use client";

import type { ErrorEvent as MapLibreErrorEvent, Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { createMorroviaStopMarker, setMorroviaStopMarkerState } from "@/components/easyt/morrovia-map-markers";
import { mapRouteCasing, mapRouteHit, mapRouteLine, mapRoutePlanning, mapRouteSelected, mapRouteSubdued } from "@/components/easyt/morrovia-map-presentation";
import mapPresentation from "@/components/easyt/morrovia-map-presentation.module.css";
import { installMorroviaMapControls, MORROVIA_MAP_WORKER_URL, morroviaMapOptions } from "@/components/easyt/morrovia-map-runtime";
import { applyMapCameraRequest, type MapCamera } from "@/lib/easyt/map-camera";
import { bindMapMarkerActivation, mapRouteLegIdAtPoint } from "@/lib/easyt/map-spatial-context";
import { resolveMapCameraRequest, resolveMapInsets, type MorroviaMapInsets, type MorroviaMapTarget } from "@/lib/easyt/map-surface-policy";
import { normalizeRouteMapFailure } from "@/lib/easyt/route-map-runtime";
import { editorialConnectionId, type RouteMapSelection } from "./route-map-selection";
import styles from "./route-overview.module.css";

type RouteStop = { id: string; name: string; coordinates: [number, number] | null; onward?: { id?: string | null } | null };
const surface = { variant: "embedded", interaction: "pan-zoom" } as const;

export default function RouteLiveMap({ title, stops, className, selected = { kind: "route" }, onSelect, resetVersion = 0, cameraOcclusions = {} }: {
  title: string; stops: RouteStop[]; className?: string; selected?: RouteMapSelection;
  onSelect?: (selection: RouteMapSelection) => void; resetVersion?: number; cameraOcclusions?: Partial<MorroviaMapInsets>;
}) {
  const selectionRef = useRef(selected);
  const occlusionsRef = useRef(cameraOcclusions);
  const onSelectRef = useRef(onSelect);
  const updateSelection = useRef<(() => void) | null>(null);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { selectionRef.current = selected; updateSelection.current?.(); }, [selected, resetVersion]);
  useEffect(() => { occlusionsRef.current = cameraOcclusions; updateSelection.current?.(); }, [cameraOcclusions]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"waiting" | "loading" | "ready" | "unavailable">("waiting");

  useEffect(() => {
    const container = containerRef.current;
    const mappedStops = stops
      .map((stop, index) => ({ ...stop, index }))
      .filter((stop): stop is typeof stop & { coordinates: [number, number] } => Boolean(stop.coordinates && Number.isFinite(stop.coordinates[0]) && Number.isFinite(stop.coordinates[1])));
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
      if (failure.category === "provider-resource") console.warn("Morrovia route map provider unavailable.", failure.error);
      else console.error(failure.error);
      if (!disposed) setStatus("unavailable");
    };
    const initialise = async () => {
      if (started || disposed) return;
      started = true;
      setStatus("loading");
      const maplibregl = await import("maplibre-gl");
      if (disposed) return;
      maplibregl.setWorkerUrl(MORROVIA_MAP_WORKER_URL);
      map = new maplibregl.Map({
        container,
        ...morroviaMapOptions(surface, "expanded"),
        center: mappedStops[0].coordinates,
        zoom: 7,
      });
      map.on("error", reportFailure as (event: MapLibreErrorEvent) => void);
      installMorroviaMapControls(map, maplibregl, surface);

      markers = mappedStops.map((stop) => {
        const marker = createMorroviaStopMarker(document, {
          id: stop.id,
          sequence: stop.index + 1,
          name: stop.name,
          interactive: true,
          selected: false,
          origin: stop.index === 0,
          journeyEnd: stop.index === stops.length - 1,
        });
        bindMapMarkerActivation(marker, () => onSelectRef.current?.({ kind: "stop", stopId: stop.id }));
        return new maplibregl.Marker({ element: marker, anchor: "center" }).setLngLat(stop.coordinates).addTo(map!);
      });

      const drawRoute = () => {
        if (!map || map.getSource("route-overview-line")) return;
        const connections = stops.slice(0, -1).flatMap((stop, index) => {
          const next = stops[index + 1];
          if (!stop.coordinates || !next.coordinates || ![...stop.coordinates, ...next.coordinates].every(Number.isFinite)) return [];
          return [{ id: editorialConnectionId(stop.id, next.id, stop.onward?.id), fromCoordinates: stop.coordinates, toCoordinates: next.coordinates }];
        });
        const routeFeatures = connections.map((connection) => ({
          type: "Feature" as const,
          properties: { connectionId: connection.id },
          geometry: { type: "LineString" as const, coordinates: [connection.fromCoordinates, connection.toCoordinates] },
        }));
        map.addSource("route-overview-line", { type: "geojson", data: { type: "FeatureCollection", features: routeFeatures } });
        map.addLayer({ id: "route-overview-casing", type: "line", source: "route-overview-line", paint: mapRouteCasing });
        map.addLayer({ id: "route-overview-line", type: "line", source: "route-overview-line", paint: mapRouteLine });
        map.addLayer({ id: "route-overview-planning", type: "line", source: "route-overview-line", paint: mapRoutePlanning });
        map.addLayer({ id: "route-overview-selected", type: "line", source: "route-overview-line", filter: ["==", ["get", "connectionId"], ""], paint: mapRouteSelected });
        map.addLayer({ id: "route-overview-hit", type: "line", source: "route-overview-line", paint: mapRouteHit });
        map.on("click", "route-overview-hit", (event) => {
          const hitIds = map?.queryRenderedFeatures(event.point, { layers: ["route-overview-hit"] })
            .flatMap((feature) => typeof feature.properties?.connectionId === "string" ? [feature.properties.connectionId] : []) ?? [];
          const current = selectionRef.current;
          const connectionId = map && mapRouteLegIdAtPoint(connections, hitIds, event.point, (coordinates) => map!.project(coordinates), current.kind === "connection" ? current.connectionId : null);
          if (connectionId) onSelectRef.current?.({ kind: "connection", connectionId });
        });
        map.on("mouseenter", "route-overview-hit", () => { if (map) map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "route-overview-hit", () => { if (map) map.getCanvas().style.cursor = ""; });

        updateSelection.current = () => {
          if (!map) return;
          const selection = selectionRef.current;
          markers.forEach((marker, index) => setMorroviaStopMarkerState(marker.getElement(), { selected: selection.kind === "stop" && selection.stopId === mappedStops[index].id }));
          map.setFilter("route-overview-selected", ["==", ["get", "connectionId"], selection.kind === "connection" ? selection.connectionId : ""]);
          const contextPaint = selection.kind === "route" ? mapRouteLine : mapRouteSubdued;
          map.setPaintProperty("route-overview-line", "line-color", contextPaint?.["line-color"] ?? mapRouteLine?.["line-color"]);
          map.setPaintProperty("route-overview-line", "line-width", contextPaint?.["line-width"] ?? mapRouteLine?.["line-width"]);
          map.setPaintProperty("route-overview-line", "line-opacity", contextPaint?.["line-opacity"] ?? mapRouteLine?.["line-opacity"]);

          const selectedStop = selection.kind === "stop" ? mappedStops.find((stop) => stop.id === selection.stopId) : null;
          const selectedConnectionIndex = selection.kind === "connection" ? stops.findIndex((stop, index) => {
            const next = stops[index + 1];
            return Boolean(next && editorialConnectionId(stop.id, next.id, stop.onward?.id) === selection.connectionId);
          }) : -1;
          const connectionStops = selectedConnectionIndex >= 0 ? [stops[selectedConnectionIndex], stops[selectedConnectionIndex + 1]] : [];
          const connectionCoordinates = connectionStops.flatMap((stop) => stop?.coordinates ? [stop.coordinates] : []);
          const target: MorroviaMapTarget = selectedStop
            ? { kind: "stop", id: selectedStop.id, coordinates: selectedStop.coordinates }
            : selection.kind === "connection"
              ? { kind: "leg", id: selection.connectionId, coordinates: connectionCoordinates }
              : { kind: "route", ids: mappedStops.map((stop) => stop.id), coordinates: mappedStops.map((stop) => stop.coordinates) };
          const padding = resolveMapInsets({ width: container.clientWidth, height: container.clientHeight, safe: 48, occlusions: occlusionsRef.current });
          applyMapCameraRequest(
            map as unknown as MapCamera,
            resolveMapCameraRequest(target, padding),
            (coordinates) => coordinates.slice(1).reduce((bounds, point) => bounds.extend(point), new maplibregl.LngLatBounds(coordinates[0], coordinates[0])),
          );
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

  return <div className={`${className ?? ""} ${styles.mapShell} ${mapPresentation.surface}`} role="region" aria-label={`Interactive map of ${title}`}>
    <div ref={containerRef} className={styles.mapCanvas} />
    {status !== "ready" && <p className={styles.mapStatus}>{status === "unavailable" ? "The live map is unavailable. Use the route sequence and map selector for the ordered geography." : status === "waiting" ? "The geographic map opens as you reach this section." : "Loading route map…"}</p>}
  </div>;
}
