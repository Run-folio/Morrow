"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, LineLayerSpecification } from "maplibre-gl";
import { BedDouble, Landmark, Utensils } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mapRouteCasing, mapRouteLine, mapRoutePlanning, mapRouteSelected, mapRouteSubdued } from "./easyt/morrovia-map-presentation";
import { createMorroviaStopMarker, setMorroviaStopMarkerState } from "./easyt/morrovia-map-markers";
import { installMorroviaMapControls, MORROVIA_MAP_WORKER_URL, morroviaMapOptions } from "./easyt/morrovia-map-runtime";
import { EasyTButton } from "./easyt/easyt-controls";
import { mapTransportIcon, mapTransportIconRotation } from "./easyt/morrovia-transport-icons";
import mapPresentation from "./easyt/morrovia-map-presentation.module.css";
import type { JourneyLeg, JourneyStop } from "@/lib/journey";
import type { PlannerMapPin } from "@/lib/easyt/trip";
import type { MapResultPlace } from "@/lib/easyt/map-result-selection";
import { applyMapCameraRequest, focusMapCamera, fitMapCamera, interruptMapCamera, type MapCamera } from "@/lib/easyt/map-camera";
import { resolveMapCameraRequest, resolveMapInsets, resolveMapSurfacePolicy, type MorroviaMapInsets, type MorroviaMapSurface } from "@/lib/easyt/map-surface-policy";
import { createMorroviaBasemapLifecycle, hasMorroviaActiveStyle, type MorroviaBasemapLifecycle, type MorroviaBasemapMap, type MorroviaBasemapStatus } from "@/lib/easyt/map-basemap-lifecycle";
import { bindMapMarkerActivation, canonicalMapTransportMode, formatMapDuration, mapRouteBearing, mapRouteFitCoordinates, mapRouteLegActivationEvent, mapRouteLegIdAtPoint, mapRouteMarkerCoordinates, mapTransportModeLabel, type MapRouteLeg } from "@/lib/easyt/map-spatial-context";
import { tripLegClassificationLabel } from "@/lib/easyt/trip-legs";

export type JourneyMapDestinationCard = {
  stopId: string;
  name: string;
  dayLabel: string;
  image?: string;
  imageAlt?: string;
};

type JourneyPlannerMapProps = {
  surface: MorroviaMapSurface;
  stops: JourneyStop[];
  legs: MapRouteLeg[] | JourneyLeg[];
  comparisonLegs?: readonly MapRouteLeg[];
  comparisonLabel?: string;
  onLifecycleChange?: (state: "ready" | "unavailable") => void;
  selectedId: string;
  featuredStopId?: string;
  destinationCards?: JourneyMapDestinationCard[];
  selectedLegId?: string | null;
  contextCardsHidden?: boolean;
  plannerPins: PlannerMapPin[];
  /** Optional stable pin selection. Existing Map surfaces remain unselected by default. */
  selectedPlannerPinId?: string | null;
  /** Restrict interaction where only some projected pins have a detail owner. */
  interactivePlannerPinIds?: readonly string[];
  stopSelectionEnabled?: boolean;
  mapResults?: MapResultPlace[];
  selectedMapResult?: MapResultPlace | null;
  focusOffset?: [number, number];
  focusZoom?: number;
  focusCoordinates: [number, number] | null;
  draftPinCoordinates: [number, number] | null;
  pinPlacementMode: boolean;
  /** Show the whole route on first load rather than opening at the selected city. */
  overviewMode?: boolean;
  /** Accessible name for a scoped preview; the whole-route label remains the default. */
  previewLabel?: string;
  cameraSafeEdge?: number;
  cameraOcclusions?: Partial<MorroviaMapInsets>;
  /** Keep a traveller-adjusted camera when the TripShell map changes size. */
  preserveCameraOnResize?: boolean;
  /** Changes whenever surrounding Map UI should interrupt in-flight camera movement. */
  cameraInteractionKey?: string;
  onMapPinDrop: (coordinates: [number, number]) => void;
  onPlannerPinSelect: (pin: PlannerMapPin) => void;
  onMapResultSelect?: (place: MapResultPlace) => void;
  onLegSelect?: (leg: MapRouteLeg) => void;
  onSelect: (id: string) => void;
};

const pinSymbols: Record<PlannerMapPin["category"], string> = {
  restaurant: "⌁",
  stay: "⌂",
  activity: "✦",
  transport: "→",
  custom: "+",
};

function isMapRouteLeg(leg: MapRouteLeg | JourneyLeg): leg is MapRouteLeg {
  return "fromStopId" in leg;
}

function resolvedCameraInsets(
  map: maplibregl.Map,
  safe: number,
  occlusions?: Partial<MorroviaMapInsets>,
) {
  const container = map.getContainer();
  return resolveMapInsets({ width: container.clientWidth, height: container.clientHeight, safe, occlusions });
}

function setRouteLinePaint(
  map: maplibregl.Map,
  paint: NonNullable<LineLayerSpecification["paint"]>,
) {
  map.setPaintProperty("trip-route-line", "line-color", paint["line-color"]);
  map.setPaintProperty("trip-route-line", "line-width", paint["line-width"]);
  map.setPaintProperty("trip-route-line", "line-opacity", paint["line-opacity"]);
}

const overviewMaxZoom = 5.2;
const emptyComparisonLegs: readonly MapRouteLeg[] = [];


export function JourneyPlannerMap({
  surface,
  stops,
  legs,
  comparisonLegs = emptyComparisonLegs,
  comparisonLabel,
  onLifecycleChange,
  selectedId,
  featuredStopId,
  destinationCards = [],
  selectedLegId,
  contextCardsHidden = false,
  plannerPins,
  selectedPlannerPinId = null,
  interactivePlannerPinIds,
  stopSelectionEnabled = true,
  mapResults = [],
  selectedMapResult = null,
  focusOffset,
  focusZoom,
  focusCoordinates,
  draftPinCoordinates,
  pinPlacementMode,
  overviewMode = false,
  previewLabel,
  cameraSafeEdge = 48,
  cameraOcclusions,
  preserveCameraOnResize = false,
  cameraInteractionKey,
  onMapPinDrop,
  onPlannerPinSelect,
  onMapResultSelect,
  onLegSelect,
  onSelect,
}: JourneyPlannerMapProps) {
  const policy = resolveMapSurfacePolicy(surface);
  const presentationOnly = surface.variant === "preview";
  const domainSelection = policy.domainSelection;
  const panZoom = policy.panZoom;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const basemapLifecycleRef = useRef<MorroviaBasemapLifecycle | null>(null);
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const legMarkersRef = useRef<maplibregl.Marker[]>([]);
  const pinMarkersRef = useRef<maplibregl.Marker[]>([]);
  const localPlaceMarkersRef = useRef<maplibregl.Marker[]>([]);
  const draftPinRef = useRef<maplibregl.Marker | null>(null);
  const hasInitialisedViewRef = useRef(false);
  const lastCameraRequestKeyRef = useRef<string | null>(null);
  const lastCameraTargetKeyRef = useRef<string | null>(null);
  const currentCameraRequestRef = useRef<string | null>(null);
  const lastCameraInteractionKeyRef = useRef(cameraInteractionKey);
  const [basemapStatus, setBasemapStatus] = useState<MorroviaBasemapStatus>("loading");
  const [basemapStyleRevision, setBasemapStyleRevision] = useState(0);
  const [cameraViewportKey, setCameraViewportKey] = useState("unmeasured");
  const selectedLegIdRef = useRef(selectedLegId);
  const selectedPlannerPinIdRef = useRef(selectedPlannerPinId);
  const onLegSelectRef = useRef(onLegSelect);
  const onSelectRef = useRef(onSelect);
  const onPlannerPinSelectRef = useRef(onPlannerPinSelect);
  const onMapResultSelectRef = useRef(onMapResultSelect);
  const onLifecycleChangeRef = useRef(onLifecycleChange);
  onLegSelectRef.current = onLegSelect;
  onSelectRef.current = onSelect;
  onPlannerPinSelectRef.current = onPlannerPinSelect;
  onMapResultSelectRef.current = onMapResultSelect;
  onLifecycleChangeRef.current = onLifecycleChange;
  selectedLegIdRef.current = selectedLegId;
  selectedPlannerPinIdRef.current = selectedPlannerPinId;
  const routeFocusKey = presentationOnly ? null : focusCoordinates;
  const routeSelectionKey = presentationOnly ? null : selectedLegId;
  const spatialLegs = useMemo<MapRouteLeg[]>(() => {
    const stopById = new Map(stops.map((stop) => [stop.id, stop]));
    return legs.flatMap((leg, index) => {
      if (isMapRouteLeg(leg)) {
        const mode = canonicalMapTransportMode(leg.mode);
        const routeSegments = leg.routeSegments?.map((segment) => {
          const segmentMode = canonicalMapTransportMode(segment.mode);
          return { ...segment, mode: segmentMode === "mixed" ? "unknown" as const : segmentMode };
        });
        return [{ ...leg, mode, ...(routeSegments ? { routeSegments } : {}) }];
      }
      const from = stopById.get(leg.from);
      const to = stopById.get(leg.to);
      if (!from?.coordinates || !to?.coordinates) return [];
      const mode = canonicalMapTransportMode(leg.mode);
      return [{
        id: `${leg.from}-${leg.to}-${index}`,
        fromStopId: leg.from,
        toStopId: leg.to,
        fromName: from.city,
        toName: to.city,
        fromCoordinates: from.coordinates,
        toCoordinates: to.coordinates,
        mode,
        modeLabel: mapTransportModeLabel(mode),
        distanceKm: null,
        headlineMinutes: null,
        doorToDoorMinutes: null,
        confidence: null,
        provenanceLabel: "Saved route guidance",
        scheduleNeedsChecking: true,
        planningNote: leg.detail || null,
        classification: index === 0 ? "arrival" : "intercity",
        warnings: [],
      }];
    });
  }, [legs, stops]);
  const comparisonRouteKey = comparisonLegs.map((leg) => `${leg.id}:${leg.fromCoordinates.join(",")}:${leg.toCoordinates.join(",")}`).join("|");
  const overviewRouteKey = stops.map((stop) => `${stop.id}:${stop.coordinates?.join(",") ?? "unmapped"}`).join("|");
  const previewResultKey = mapResults.map((result) => `${result.selectionId}:${result.coordinates.join(",")}`).join("|");
  const cameraOcclusionKey = `${cameraSafeEdge}:${cameraOcclusions?.top ?? 0}:${cameraOcclusions?.right ?? 0}:${cameraOcclusions?.bottom ?? 0}:${cameraOcclusions?.left ?? 0}`;
  const selectedStop = stops.find((stop) => stop.id === selectedId && stop.coordinates);
  const selectedResult = selectedMapResult;
  const selectedLegTarget = useMemo(() => {
    const selectedLeg = spatialLegs.find((leg) => leg.id === selectedLegId);
    return selectedLeg
      ? { kind: "leg" as const, id: selectedLeg.id, coordinates: mapRouteFitCoordinates(selectedLeg) }
      : null;
  }, [selectedLegId, spatialLegs]);
  const cameraRequestKey = presentationOnly
    ? null
    : selectedLegTarget
      ? `leg:${selectedLegTarget.id}:${selectedLegTarget.coordinates.map((coordinate) => coordinate.join(",")).join(";")}`
      : overviewMode
      ? `overview:${overviewRouteKey}`
      : selectedResult
        ? `result:${selectedResult.selectionId}:${selectedResult.coordinates.join(",")}`
        : focusCoordinates
          ? `focus:${focusCoordinates.join(",")}`
          : selectedStop?.coordinates
            ? `stop:${selectedStop.id}:${selectedStop.coordinates.join(",")}:${focusZoom ?? "auto"}`
            : null;
  const cameraFrameKey = cameraRequestKey
    ? `${cameraRequestKey}|${cameraOcclusionKey}|${cameraViewportKey}`
    : null;

  useEffect(() => {
    if (!containerRef.current) return;
    if (!mapRef.current) {
      maplibregl.setWorkerUrl(MORROVIA_MAP_WORKER_URL);
      const firstStop = selectedResult?.coordinates
        ?? mapResults[0]?.coordinates
        ?? stops.find((stop) => stop.id === selectedId && stop.coordinates)?.coordinates
        ?? stops.find((stop) => stop.coordinates)?.coordinates
        ?? focusCoordinates
        ?? [-90.5069, 14.6349];
      let map: maplibregl.Map;
      try {
        map = new maplibregl.Map({
          container: containerRef.current,
          ...morroviaMapOptions(surface, "compact"),
          center: firstStop,
          zoom: (presentationOnly || surface.variant === "embedded") && (selectedResult || mapResults.length || focusCoordinates) ? focusZoom ?? 13 : 9,
        });
      } catch (error) {
        onLifecycleChangeRef.current?.("unavailable");
        console.error("Morrovia could not initialise the route map.", error);
        return;
      }
      installMorroviaMapControls(map, maplibregl, surface);
      mapRef.current = map;
    }

    const map = mapRef.current;
    if (!map) return;
    let ownerActive = true;
    let removing = false;
    let lifecycleState: "starting" | "ready" | "unavailable" = "starting";
    const reportReady = () => {
      if (!ownerActive || lifecycleState !== "starting") return;
      lifecycleState = "ready";
      onLifecycleChangeRef.current?.("ready");
    };
    const reportUnavailable = () => {
      if (!ownerActive || lifecycleState === "unavailable") return;
      if (lifecycleState === "ready") return;
      lifecycleState = "unavailable";
      onLifecycleChangeRef.current?.("unavailable");
    };
    const basemapLifecycle = createMorroviaBasemapLifecycle(map as unknown as MorroviaBasemapMap, {
      onChange: (snapshot) => {
        if (ownerActive && mapRef.current === map) setBasemapStatus(snapshot.status);
      },
      onStyleReady: () => {
        if (ownerActive && mapRef.current === map) {
          reportReady();
          setBasemapStyleRevision((revision) => revision + 1);
        }
      },
    });
    basemapLifecycleRef.current = basemapLifecycle;
    const handleMapError = (event: maplibregl.ErrorEvent) => {
      const value = event.error;
      if (removing && value instanceof Error && (value.name === "AbortError" || /aborted|cancelled/i.test(value.message))) return;
      if (basemapLifecycle.handleError(event)) {
        console.warn("Morrovia detailed basemap unavailable; local route geography remains visible.");
        return;
      }
      if (typeof Event !== "undefined" && value instanceof Event) {
        console.warn("Morrovia MapLibre resource request ended before the map finished loading.", { type: value.type });
        return;
      }
      const error = value instanceof Error ? value : new Error("Morrovia MapLibre reported an unknown error.");
      if (/Failed to fetch|Could not load|NetworkError|Load failed|AJAXError/i.test(error.message)) {
        console.warn("Morrovia MapLibre could not load a non-basemap resource.", error);
        return;
      }
      reportUnavailable();
      console.error(error);
    };
    map.on("error", handleMapError);

    return () => {
      ownerActive = false;
      basemapLifecycle.dispose();
      if (basemapLifecycleRef.current === basemapLifecycle) basemapLifecycleRef.current = null;
      stopMarkersRef.current.forEach((marker) => marker.remove());
      legMarkersRef.current.forEach((marker) => marker.remove());
      pinMarkersRef.current.forEach((marker) => marker.remove());
      localPlaceMarkersRef.current.forEach((marker) => marker.remove());
      draftPinRef.current?.remove();
      removing = true;
      map.remove();
      map.off("error", handleMapError);
      if (mapRef.current === map) mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || surface.variant !== "embedded" || !mapResults.length) return;
    const fitPreviewResults = () => {
      const padding = resolvedCameraInsets(map, cameraSafeEdge, cameraOcclusions);
      if (mapResults.length === 1) {
        focusMapCamera(map as unknown as MapCamera, {
          center: mapResults[0]!.coordinates,
          zoom: focusZoom ?? 14,
          offset: [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2],
          duration: 0,
        });
        return;
      }
      const bounds = mapResults.slice(1).reduce(
        (result, place) => result.extend(place.coordinates),
        new maplibregl.LngLatBounds(mapResults[0]!.coordinates, mapResults[0]!.coordinates),
      );
      fitMapCamera(map as unknown as MapCamera, bounds, { padding, maxZoom: focusZoom ?? 14 }, true);
    };
    if (map.loaded()) fitPreviewResults();
    else map.once("load", fitPreviewResults);
    return () => { map.off("load", fitPreviewResults); };
  }, [cameraOcclusionKey, cameraOcclusions, cameraSafeEdge, focusZoom, mapResults, previewResultKey, surface.variant]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const map = mapRef.current;
        if (!map) return;
        map.resize();
        if (!preserveCameraOnResize || currentCameraRequestRef.current !== null) {
          setCameraViewportKey(`${container.clientWidth}x${container.clientHeight}`);
        }
      });
    });
    observer.observe(container);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [preserveCameraOnResize]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mappedStops = stops.filter((stop): stop is JourneyStop & { coordinates: [number, number] } => Boolean(stop.coordinates));
    const overviewCoordinates = [
      ...mappedStops.map((stop) => stop.coordinates),
      ...comparisonLegs.flatMap((leg) => [leg.fromCoordinates, leg.toCoordinates]),
    ];
    const routeLegs = {
      type: "FeatureCollection" as const,
      features: spatialLegs.flatMap((leg) => {
        const segments = leg.routeSegments?.length ? leg.routeSegments : [{
          mode: leg.mode,
          fromCoordinates: leg.fromCoordinates,
          toCoordinates: leg.toCoordinates,
          routeGeometry: leg.routeGeometry,
        }];
        return segments.map((segment) => ({
          type: "Feature" as const,
          properties: { id: leg.id, mode: segment.mode },
          geometry: { type: "LineString" as const, coordinates: segment.routeGeometry?.length ? segment.routeGeometry : [segment.fromCoordinates, segment.toCoordinates] },
        }));
      }),
    };
    const route = routeLegs.features.length
      ? routeLegs
      : mappedStops.length > 1
        ? {
            type: "FeatureCollection" as const,
            features: [{
              type: "Feature" as const,
              properties: { id: "whole-route", mode: "unknown" },
              geometry: { type: "LineString" as const, coordinates: mappedStops.map((stop) => stop.coordinates) },
            }],
          }
        : { type: "FeatureCollection" as const, features: [] };
    const comparisonRoute = {
      type: "FeatureCollection" as const,
      features: comparisonLegs.flatMap((leg) => {
        const segments = leg.routeSegments?.length ? leg.routeSegments : [{
          fromCoordinates: leg.fromCoordinates,
          toCoordinates: leg.toCoordinates,
          routeGeometry: leg.routeGeometry,
        }];
        return segments.map((segment) => ({
          type: "Feature" as const,
          properties: { id: leg.id },
          geometry: { type: "LineString" as const, coordinates: segment.routeGeometry?.length ? segment.routeGeometry : [segment.fromCoordinates, segment.toCoordinates] },
        }));
      }),
    };

    const selectRoute = (event: maplibregl.MapLayerMouseEvent) => {
      interruptMapCamera(map as unknown as MapCamera);
      currentCameraRequestRef.current = null;
      const hitLegIds = map.queryRenderedFeatures(event.point, { layers: ["trip-route-hit"] })
        .flatMap((feature) => typeof feature.properties?.id === "string" ? [feature.properties.id] : []);
      const id = mapRouteLegIdAtPoint(spatialLegs, hitLegIds, event.point, (coordinates) => map.project(coordinates), selectedLegIdRef.current);
      const leg = spatialLegs.find((candidate) => candidate.id === id);
      if (leg) onLegSelectRef.current?.(leg);
    };
    const hoverRoute = (event: maplibregl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const hitLegIds = event.features?.flatMap((feature) => typeof feature.properties?.id === "string" ? [feature.properties.id] : []) ?? [];
      const id = mapRouteLegIdAtPoint(spatialLegs, hitLegIds, event.point, (coordinates) => map.project(coordinates), selectedLegIdRef.current);
      map.setFilter("trip-route-hover", ["==", ["get", "id"], id ?? ""]);
    };
    const leaveRoute = () => {
      map.getCanvas().style.cursor = pinPlacementMode ? "crosshair" : "";
      map.setFilter("trip-route-hover", ["==", ["get", "id"], ""]);
    };

    const drawRoute = () => {
      const source = map.getSource("trip-route") as GeoJSONSource | undefined;
      if (source) source.setData(route);
      else {
        map.addSource("trip-route", {
          type: "geojson",
          data: route,
          ...(spatialLegs.some((leg) => leg.routeProvider === "openrouteservice")
            ? { attribution: "Road routing © openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors" }
            : {}),
        });
      }
      const legSource = map.getSource("trip-route-legs") as GeoJSONSource | undefined;
      if (legSource) legSource.setData(routeLegs);
      else {
        map.addSource("trip-route-legs", { type: "geojson", data: routeLegs });
      }
      if (!map.getLayer("trip-route-casing")) {
        map.addLayer({
          id: "trip-route-casing",
          type: "line",
          source: "trip-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: mapRouteCasing,
        });
      }
      if (!map.getLayer("trip-route-line")) {
        map.addLayer({
          id: "trip-route-line",
          type: "line",
          source: "trip-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: mapRouteLine,
        });
      }
      setRouteLinePaint(map, selectedLegIdRef.current ? mapRouteSubdued : mapRouteLine);
      if (!map.getLayer("trip-route-planning")) {
        map.addLayer({
          id: "trip-route-planning",
          type: "line",
          source: "trip-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: mapRoutePlanning,
        });
      }
      if (!map.getLayer("trip-route-hover")) {
        map.addLayer({
          id: "trip-route-hover",
          type: "line",
          source: "trip-route-legs",
          filter: ["==", ["get", "id"], ""],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#17106f", "line-width": 12, "line-opacity": 0.2 },
        });
      }
      if (!map.getLayer("trip-route-selected")) {
        map.addLayer({
          id: "trip-route-selected",
          type: "line",
          source: "trip-route-legs",
          filter: ["==", ["get", "id"], ""],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: mapRouteSelected,
        });
      }
      if (!map.getLayer("trip-route-hit")) {
        map.addLayer({
          id: "trip-route-hit",
          type: "line",
          source: "trip-route-legs",
          paint: { "line-color": "rgba(0,0,0,0)", "line-width": 22 },
        });
      }
      const comparisonSource = map.getSource("trip-route-comparison") as GeoJSONSource | undefined;
      if (comparisonSource) comparisonSource.setData(comparisonRoute);
      else map.addSource("trip-route-comparison", { type: "geojson", data: comparisonRoute });
      if (!map.getLayer("trip-route-comparison")) {
        map.addLayer({
          id: "trip-route-comparison",
          type: "line",
          source: "trip-route-comparison",
          layout: { "line-cap": "round", "line-join": "round" },
          /* morrovia-ui-audit-allow-next-line inline-color -- The MapLibre proposal layer requires the canonical signal colour as a literal paint value. */
          paint: { "line-color": "#e91e73", "line-width": 4, "line-opacity": 0.82, "line-dasharray": [2, 2] },
        });
      }
      map.setLayoutProperty("trip-route-comparison", "visibility", comparisonRoute.features.length ? "visible" : "none");
      if (comparisonRoute.features.length && overviewMode && overviewCoordinates.length > 1) {
        const bounds = overviewCoordinates.slice(1).reduce(
          (result, coordinates) => result.extend(coordinates),
          new maplibregl.LngLatBounds(overviewCoordinates[0], overviewCoordinates[0]),
        );
        fitMapCamera(map as unknown as MapCamera, bounds, {
          padding: resolvedCameraInsets(map, cameraSafeEdge, cameraOcclusions),
          maxZoom: overviewMaxZoom,
        }, true);
      }
      if (map.getLayer("trip-route-selected")) {
        map.setFilter("trip-route-selected", ["==", ["get", "id"], selectedLegIdRef.current ?? ""]);
      }
      if (domainSelection && map.getLayer("trip-route-hit")) {
        map.on("click", "trip-route-hit", selectRoute);
        map.on("mousemove", "trip-route-hit", hoverRoute);
        map.on("mouseleave", "trip-route-hit", leaveRoute);
      }

      if (!hasInitialisedViewRef.current && mappedStops.length) {
        hasInitialisedViewRef.current = true;
        lastCameraTargetKeyRef.current = cameraRequestKey;
        lastCameraRequestKeyRef.current = cameraFrameKey;
        currentCameraRequestRef.current = cameraRequestKey;
        const activeStop = mappedStops.find((stop) => stop.id === selectedId) ?? mappedStops[0];
        // On first mount the focus effect can run before the map is ready.
        // Start at the pin itself so opening/adding a pin never leaves it
        // outside the visible map.
        if (selectedLegTarget) {
          applyMapCameraRequest(
            map as unknown as MapCamera,
            resolveMapCameraRequest(selectedLegTarget, resolvedCameraInsets(map, cameraSafeEdge, cameraOcclusions)),
            (coordinates) => coordinates.slice(1).reduce(
              (result, coordinates) => result.extend(coordinates),
              new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
            ),
            true,
          );
        } else if (overviewMode && !focusCoordinates && overviewCoordinates.length > 1) {
          const bounds = overviewCoordinates.slice(1).reduce(
            (result, coordinates) => result.extend(coordinates),
            new maplibregl.LngLatBounds(overviewCoordinates[0], overviewCoordinates[0]),
          );
          fitMapCamera(map as unknown as MapCamera, bounds, {
            padding: resolvedCameraInsets(map, cameraSafeEdge, cameraOcclusions),
            maxZoom: overviewMaxZoom,
          }, true);
        } else {
          const padding = resolvedCameraInsets(map, cameraSafeEdge, cameraOcclusions);
          const offset: [number, number] = focusOffset ?? [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2];
          focusMapCamera(map as unknown as MapCamera, {
            center: focusCoordinates ?? activeStop.coordinates,
            zoom: focusCoordinates ? 14 : focusZoom ?? 11,
            offset,
            duration: 0,
          });
        }
      }
    };

    let routeRetry = 0;
    let disposed = false;
    const ensureRoute = () => {
      if (disposed) return;
      if (hasMorroviaActiveStyle(map as unknown as MorroviaBasemapMap)) {
        drawRoute();
        return;
      }
      routeRetry = window.setTimeout(ensureRoute, 80);
    };
    ensureRoute();
    return () => {
      disposed = true;
      window.clearTimeout(routeRetry);
      if (map.getLayer("trip-route-hit")) {
        map.off("click", "trip-route-hit", selectRoute);
        map.off("mousemove", "trip-route-hit", hoverRoute);
        map.off("mouseleave", "trip-route-hit", leaveRoute);
      }
    };
  }, [basemapStyleRevision, cameraFrameKey, cameraOcclusionKey, cameraOcclusions, cameraRequestKey, cameraSafeEdge, comparisonLegs, comparisonRouteKey, domainSelection, focusOffset, focusZoom, overviewMode, pinPlacementMode, presentationOnly, routeFocusKey, routeSelectionKey, selectedId, selectedLegTarget, spatialLegs, stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("trip-route-selected")) return;
    map.setFilter("trip-route-selected", ["==", ["get", "id"], selectedLegId ?? ""]);
    setRouteLinePaint(map, selectedLegId ? mapRouteSubdued : mapRouteLine);
  }, [selectedLegId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!domainSelection) {
      legMarkersRef.current.forEach((marker) => marker.remove());
      legMarkersRef.current = [];
      return;
    }
    const drawLegMarkers = () => {
      legMarkersRef.current.forEach((marker) => marker.remove());
      legMarkersRef.current = spatialLegs.map((leg, index) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = `planner-map__leg is-${leg.mode} ${index % 2 ? "is-card-below" : ""} ${leg.id === selectedLegId ? "is-active" : ""} ${contextCardsHidden ? "is-context-hidden" : ""}`;
        element.dataset.routeLegId = leg.id;
        element.setAttribute("aria-label", `Inspect transfer ${index + 1}: ${leg.fromName} to ${leg.toName}, ${leg.modeLabel}`);
        const MarkerIcon = mapTransportIcon(leg.mode);
        const rotation = mapTransportIconRotation(leg.mode, mapRouteBearing(leg));
        element.innerHTML = renderToStaticMarkup(<>
          <span className="planner-map__leg-icon" aria-hidden="true" style={rotation === null ? undefined : { transform: `rotate(${rotation}deg)` }}><MarkerIcon /></span>
          <span className="planner-map__leg-card" aria-hidden="true">
            <span className="planner-map__leg-meta"><strong>{leg.modeLabel.toLocaleUpperCase()}</strong><em>{formatMapDuration(leg.headlineMinutes ?? leg.doorToDoorMinutes)}</em></span>
            <b>{leg.fromName} → {leg.toName}</b>
            <span>{leg.distanceKm !== null ? `${Math.round(leg.distanceKm).toLocaleString()} km` : "Distance to confirm"} · Door-to-door {formatMapDuration(leg.doorToDoorMinutes)}</span>
            <small>{tripLegClassificationLabel(leg.classification)} · {leg.provenanceLabel}</small>
          </span>
        </>);
        const activateLeg = (event: MouseEvent | PointerEvent) => {
          event.stopPropagation();
          if (!mapRouteLegActivationEvent(event)) return;
          interruptMapCamera(map as unknown as MapCamera);
          currentCameraRequestRef.current = null;
          onLegSelectRef.current?.(leg);
        };
        element.addEventListener("pointerup", activateLeg);
        element.addEventListener("click", activateLeg);
        element.addEventListener("mouseenter", () => { if (map.getLayer("trip-route-hover")) map.setFilter("trip-route-hover", ["==", ["get", "id"], leg.id]); });
        element.addEventListener("mouseleave", () => { if (map.getLayer("trip-route-hover")) map.setFilter("trip-route-hover", ["==", ["get", "id"], ""]); });
        return new maplibregl.Marker({ element, anchor: "center" }).setLngLat(mapRouteMarkerCoordinates(leg)).addTo(map);
      });
    };
    drawLegMarkers();
    return () => {
      legMarkersRef.current.forEach((marker) => marker.remove());
      legMarkersRef.current = [];
    };
  }, [contextCardsHidden, domainSelection, spatialLegs]);

  useEffect(() => {
    legMarkersRef.current.forEach((marker) => {
      const element = marker.getElement();
      element.classList.toggle("is-active", element.dataset.routeLegId === selectedLegId);
      element.classList.toggle("is-context-hidden", contextCardsHidden);
    });
  }, [contextCardsHidden, selectedLegId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const drawMarkers = () => {
      stopMarkersRef.current.forEach((marker) => marker.remove());
      const cards = new Map(destinationCards.map((card) => [card.stopId, card]));
      stopMarkersRef.current = stops.filter((stop) => stop.coordinates).map((stop, index) => {
        const isOrigin = index === 0 && stop.theme === "transit";
        const isDestination = index === stops.filter((candidate) => candidate.coordinates).length - 1;
        const relationship = isOrigin ? "trip origin" : index === stops.filter((candidate) => candidate.coordinates).length - 1 ? "final destination" : `overnight stop ${isOrigin ? index + 1 : index}`;
        const element = createMorroviaStopMarker(document, {
          id: stop.id,
          sequence: index + 1,
          name: stop.city,
          interactive: domainSelection && stopSelectionEnabled,
          selected: stop.id === selectedId,
          origin: isOrigin,
          journeyEnd: isDestination,
        });
        element.classList.toggle("is-featured", stop.id === featuredStopId);
        if (domainSelection && stopSelectionEnabled) element.setAttribute("aria-label", `Show ${stop.city}, ${relationship}`);
        const number = element.querySelector<HTMLElement>(".planner-map__stop-number");
        if (number) number.textContent = presentationOnly
          ? String(index + 1)
          : isOrigin
            ? "FROM"
            : String(stops[0]?.theme === "transit" ? index : index + 1).padStart(2, "0");
        const card = cards.get(stop.id);
        if (card) {
          const preview = document.createElement("span");
          preview.className = "planner-map__destination-card";
          preview.classList.add(index === 0 ? "is-card-right" : index === stops.length - 1 ? "is-card-left" : "is-card-right");
          preview.setAttribute("aria-hidden", "true");
          if (card.image) {
            const image = document.createElement("img");
            image.src = card.image;
            image.alt = "";
            image.draggable = false;
            preview.append(image);
          }
          const copy = document.createElement("span");
          const name = document.createElement("strong");
          name.textContent = card.name;
          const day = document.createElement("small");
          day.textContent = card.dayLabel;
          copy.append(name, day);
          preview.append(copy);
          element.append(preview);
        }
        const previewStop = (id: string | undefined) => stopMarkersRef.current.forEach((marker) => {
          const markerElement = marker.getElement();
          markerElement.classList.toggle("is-previewed", markerElement.dataset.mapStopId === id);
          markerElement.classList.toggle("is-preview-suppressed", Boolean(id) && markerElement.dataset.mapStopId !== id);
        });
        if (domainSelection && stopSelectionEnabled) {
          bindMapMarkerActivation(element, () => { interruptMapCamera(map as unknown as MapCamera); currentCameraRequestRef.current = null; onSelectRef.current(stop.id); });
          element.addEventListener("mouseenter", () => previewStop(stop.id));
          element.addEventListener("mouseleave", () => previewStop(undefined));
          element.addEventListener("focus", () => previewStop(stop.id));
          element.addEventListener("blur", () => previewStop(undefined));
        }
        return new maplibregl.Marker({ element, anchor: "center" }).setLngLat(stop.coordinates!).addTo(map);
      });
    };
    if (hasMorroviaActiveStyle(map as unknown as MorroviaBasemapMap)) drawMarkers();
    else map.once("load", drawMarkers);
    return () => { map.off("load", drawMarkers); };
  }, [destinationCards, domainSelection, presentationOnly, stopSelectionEnabled, stops]);

  useEffect(() => {
    const mappedStops = stops.filter((stop) => stop.coordinates);
    stopMarkersRef.current.forEach((marker, index) => {
      const element = marker.getElement();
      if (presentationOnly) element.classList.toggle("is-active", mappedStops[index]?.id === selectedId);
      else setMorroviaStopMarkerState(element, { selected: mappedStops[index]?.id === selectedId });
      element.classList.toggle("is-featured", mappedStops[index]?.id === featuredStopId);
      element.classList.toggle("is-context-hidden", contextCardsHidden);
    });
  }, [contextCardsHidden, featuredStopId, presentationOnly, selectedId, stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!domainSelection) {
      pinMarkersRef.current.forEach((marker) => marker.remove());
      pinMarkersRef.current = [];
      return;
    }
    const drawPins = () => {
      pinMarkersRef.current.forEach((marker) => marker.remove());
      pinMarkersRef.current = plannerPins.map((pin) => {
        const interactive = !interactivePlannerPinIds || interactivePlannerPinIds.includes(pin.id);
        const element = document.createElement(interactive ? "button" : "div");
        if (element instanceof HTMLButtonElement) element.type = "button";
        element.className = `planner-map__pin is-${pin.category} ${interactive ? "" : "is-context-only"} ${pin.id === selectedPlannerPinIdRef.current ? "is-active" : ""}`;
        element.dataset.plannerPinId = pin.id;
        if (interactive) element.setAttribute("aria-label", `Show ${pin.title}`);
        else { element.setAttribute("aria-hidden", "true"); element.style.pointerEvents = "none"; }
        element.title = pin.title;
        element.innerHTML = `<span>${pinSymbols[pin.category]}</span>`;
        if (interactive) bindMapMarkerActivation(element, () => { interruptMapCamera(map as unknown as MapCamera); currentCameraRequestRef.current = null; onPlannerPinSelectRef.current(pin); });
        return new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat([pin.longitude, pin.latitude]).addTo(map);
      });
    };
    if (surface.variant === "embedded") drawPins();
    else if (hasMorroviaActiveStyle(map as unknown as MorroviaBasemapMap)) drawPins();
    else map.once("load", drawPins);
    return () => { map.off("load", drawPins); };
  }, [domainSelection, interactivePlannerPinIds, plannerPins, surface.variant]);

  useEffect(() => {
    pinMarkersRef.current.forEach((marker) => {
      const element = marker.getElement();
      element.classList.toggle("is-active", element.dataset.plannerPinId === selectedPlannerPinId);
    });
  }, [selectedPlannerPinId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!domainSelection) {
      localPlaceMarkersRef.current.forEach((marker) => marker.remove());
      localPlaceMarkersRef.current = [];
      return;
    }
    const drawLocalPlaces = () => {
      localPlaceMarkersRef.current.forEach((marker) => marker.remove());
      localPlaceMarkersRef.current = mapResults.map((place) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = `planner-map__local-place is-${place.kind} ${place.selectionId === selectedMapResult?.selectionId ? "is-active" : ""}`;
        element.dataset.mapResultId = place.selectionId;
        element.setAttribute("aria-label", `Show ${place.name}`);
        element.title = `Show ${place.name}`;
        const PlaceIcon = place.kind === "stay" ? BedDouble : place.kind === "eat" ? Utensils : Landmark;
        element.innerHTML = renderToStaticMarkup(<><PlaceIcon aria-hidden="true" /><span>{place.price ? `${place.price.currency} ${Math.round(place.price.total)}` : place.kind === "stay" ? "Stay" : place.kind === "eat" ? "Eat" : "See"}</span></>);
        bindMapMarkerActivation(element, () => { interruptMapCamera(map as unknown as MapCamera); currentCameraRequestRef.current = null; onMapResultSelectRef.current?.(place); });
        return new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat(place.coordinates).addTo(map);
      });
    };
    // Markers are DOM overlays and do not depend on the style lifecycle. The
    // finder commonly reports results after the initial map load, so drawing
    // them immediately keeps result ↔ map selection in sync.
    drawLocalPlaces();
    return () => {
      localPlaceMarkersRef.current.forEach((marker) => marker.remove());
      localPlaceMarkersRef.current = [];
    };
  }, [domainSelection, mapResults]);

  useEffect(() => {
    localPlaceMarkersRef.current.forEach((marker) => marker.getElement().classList.toggle("is-active", marker.getElement().dataset.mapResultId === selectedMapResult?.selectionId));
  }, [selectedMapResult?.selectionId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const drawDraftPin = () => {
      draftPinRef.current?.remove();
      draftPinRef.current = null;
      if (!draftPinCoordinates) return;
      const element = document.createElement("div");
      element.className = "planner-map__draft-pin";
      element.setAttribute("aria-label", "Selected pin location");
      element.innerHTML = "<span>+</span>";
      draftPinRef.current = new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat(draftPinCoordinates).addTo(map);
    };
    if (hasMorroviaActiveStyle(map as unknown as MorroviaBasemapMap)) drawDraftPin();
    else map.once("load", drawDraftPin);
    return () => { map.off("load", drawDraftPin); };
  }, [draftPinCoordinates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const dropPin = (event: maplibregl.MapMouseEvent) => { interruptMapCamera(map as unknown as MapCamera); currentCameraRequestRef.current = null; onMapPinDrop([event.lngLat.lng, event.lngLat.lat]); };
    map.getCanvas().style.cursor = pinPlacementMode ? "crosshair" : "";
    if (pinPlacementMode) map.on("click", dropPin);
    return () => {
      map.off("click", dropPin);
      map.getCanvas().style.cursor = "";
    };
  }, [onMapPinDrop, pinPlacementMode]);

  useEffect(() => {
    if (lastCameraInteractionKeyRef.current === cameraInteractionKey) return;
    lastCameraInteractionKeyRef.current = cameraInteractionKey;
    interruptMapCamera(mapRef.current as unknown as MapCamera);
  }, [cameraInteractionKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cameraRequestKey || !cameraFrameKey || !hasInitialisedViewRef.current) return;
    const targetChanged = cameraRequestKey !== lastCameraTargetKeyRef.current;
    if (!targetChanged && cameraFrameKey === lastCameraRequestKeyRef.current) return;
    if (!targetChanged && currentCameraRequestRef.current !== cameraRequestKey) {
      lastCameraRequestKeyRef.current = cameraFrameKey;
      return;
    }
    lastCameraTargetKeyRef.current = cameraRequestKey;
    lastCameraRequestKeyRef.current = cameraFrameKey;
    currentCameraRequestRef.current = cameraRequestKey;
    if (selectedLegTarget) {
      applyMapCameraRequest(
        map as unknown as MapCamera,
        resolveMapCameraRequest(selectedLegTarget, resolvedCameraInsets(map, cameraSafeEdge, cameraOcclusions)),
        (coordinates) => coordinates.slice(1).reduce(
          (result, coordinates) => result.extend(coordinates),
          new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
        ),
      );
      return;
    }
    if (overviewMode) {
      const mappedStops = stops.filter((stop): stop is JourneyStop & { coordinates: [number, number] } => Boolean(stop.coordinates));
      if (mappedStops.length < 2) return;
      const bounds = mappedStops.slice(1).reduce(
        (result, stop) => result.extend(stop.coordinates),
        new maplibregl.LngLatBounds(mappedStops[0].coordinates, mappedStops[0].coordinates),
      );
      fitMapCamera(map as unknown as MapCamera, bounds, {
        padding: resolvedCameraInsets(map, cameraSafeEdge, cameraOcclusions),
        maxZoom: overviewMaxZoom,
      });
      return;
    }
    const target = selectedResult?.coordinates ?? focusCoordinates ?? selectedStop?.coordinates;
    if (!target) return;
    const padding = resolvedCameraInsets(map, cameraSafeEdge, cameraOcclusions);
    const offset: [number, number] = focusOffset ?? [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2];
    const zoom = selectedResult || focusCoordinates
      ? Math.max(map.getZoom(), 14)
      : focusZoom ?? Math.max(map.getZoom(), 11);
    focusMapCamera(map as unknown as MapCamera, { center: target, zoom, offset });
  }, [cameraFrameKey, cameraOcclusionKey, cameraOcclusions, cameraRequestKey, cameraSafeEdge, focusCoordinates, focusOffset, focusZoom, overviewMode, selectedLegTarget, selectedResult, selectedStop, stops]);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || !panZoom) return;
    const interrupt = () => {
      currentCameraRequestRef.current = null;
      interruptMapCamera(map as unknown as MapCamera);
    };
    const interruptKeyboardCamera = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "-", "="].includes(event.key)) interrupt();
    };
    container.addEventListener("pointerdown", interrupt, { capture: true });
    container.addEventListener("wheel", interrupt, { capture: true, passive: true });
    container.addEventListener("keydown", interruptKeyboardCamera, { capture: true });
    map.on("dragstart", interrupt);
    return () => {
      container.removeEventListener("pointerdown", interrupt, true);
      container.removeEventListener("wheel", interrupt, true);
      container.removeEventListener("keydown", interruptKeyboardCamera, true);
      map.off("dragstart", interrupt);
    };
  }, [panZoom]);

  return <div className={`planner-map ${mapPresentation.surface}`} data-basemap-status={basemapStatus} aria-busy={basemapStatus === "loading" || undefined} aria-label={presentationOnly ? previewLabel ?? "Whole-trip route map preview" : "Interactive trip map"}>
    <div ref={containerRef} className={mapPresentation.canvas} />
    {comparisonLegs.length && comparisonLabel ? <span className="sr-only">{comparisonLabel}</span> : null}
    {!presentationOnly && basemapStatus !== "detailed" ? <div className={mapPresentation.basemapStatus} role={basemapStatus === "fallback" ? "alert" : "status"}>
      <strong>{basemapStatus === "fallback" ? "Detailed map unavailable" : "Opening detailed map"}</strong>
      <span>{basemapStatus === "fallback" ? "Showing local route geography instead." : "Loading roads, places and labels."}</span>
      {basemapStatus === "fallback" ? <EasyTButton variant="quiet" size="small" onClick={() => basemapLifecycleRef.current?.retry()}>Try detailed map again</EasyTButton> : null}
    </div> : null}
  </div>;
}
