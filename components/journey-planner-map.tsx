"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { BedDouble, Utensils } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { morroviaMapStyle, mapRouteCasing, mapRouteLine, mapRoutePlanning } from "./easyt/morrovia-map-presentation";
import { mapTransportIcon, mapTransportIconRotation } from "./easyt/morrovia-transport-icons";
import mapPresentation from "./easyt/morrovia-map-presentation.module.css";
import type { JourneyLeg, JourneyStop } from "@/lib/journey";
import type { PlannerMapPin } from "@/lib/easyt/trip";
import type { JourneyLocalPlace } from "@/components/journey-local-finder";
import { focusMapCamera, fitMapCamera, interruptMapCamera, type MapCamera } from "@/lib/easyt/map-camera";
import { canonicalMapTransportMode, formatMapDuration, mapRouteBearing, mapRouteMarkerCoordinates, mapTransportModeLabel, type MapRouteLeg } from "@/lib/easyt/map-spatial-context";
import { tripLegClassificationLabel } from "@/lib/easyt/trip-legs";

export type JourneyMapDestinationCard = {
  stopId: string;
  name: string;
  dayLabel: string;
  image?: string;
  imageAlt?: string;
};

type JourneyPlannerMapProps = {
  stops: JourneyStop[];
  legs: MapRouteLeg[] | JourneyLeg[];
  selectedId: string;
  featuredStopId?: string;
  destinationCards?: JourneyMapDestinationCard[];
  selectedLegId?: string | null;
  contextCardsHidden?: boolean;
  plannerPins: PlannerMapPin[];
  /** Optional stable pin selection. Existing Map surfaces remain unselected by default. */
  selectedPlannerPinId?: string | null;
  localPlaces?: JourneyLocalPlace[];
  localPlaceKind?: "restaurant" | "stay";
  selectedLocalPlaceId?: string | null;
  focusOffset?: [number, number];
  focusZoom?: number;
  focusCoordinates: [number, number] | null;
  draftPinCoordinates: [number, number] | null;
  pinPlacementMode: boolean;
  /** Show the whole route on first load rather than opening at the selected city. */
  overviewMode?: boolean;
  /** Render the shared MapLibre surface as a non-interactive whole-route preview. */
  previewMode?: boolean;
  /** Accessible name for a scoped preview; the whole-route label remains the default. */
  previewLabel?: string;
  overviewPadding?: { top: number; right: number; bottom: number; left: number };
  /** Changes whenever surrounding Map UI should immediately release camera ownership. */
  cameraInteractionKey?: string;
  onMapPinDrop: (coordinates: [number, number]) => void;
  onPlannerPinSelect: (pin: PlannerMapPin) => void;
  onLocalPlaceSelect?: (place: JourneyLocalPlace) => void;
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

function effectiveOverviewPadding(
  map: maplibregl.Map,
  requested?: { top: number; right: number; bottom: number; left: number },
) {
  const compactViewport = window.innerWidth <= 980;
  const base = compactViewport
    ? { top: 72, right: 48, bottom: 72, left: 48 }
    : requested ?? { top: 64, right: 330, bottom: 72, left: 80 };
  const width = map.getContainer().clientWidth;
  const height = map.getContainer().clientHeight;
  const horizontalScale = width > 0 ? Math.min(1, Math.max(0, width - 160) / Math.max(1, base.left + base.right)) : 0;
  const verticalScale = height > 0 ? Math.min(1, Math.max(0, height - 160) / Math.max(1, base.top + base.bottom)) : 0;
  return {
    top: Math.round(base.top * verticalScale),
    right: Math.round(base.right * horizontalScale),
    bottom: Math.round(base.bottom * verticalScale),
    left: Math.round(base.left * horizontalScale),
  };
}

const overviewFitOffset = (): [number, number] => window.innerWidth <= 980 ? [0, -32] : [0, -72];
const overviewMaxZoom = 5.2;


export function JourneyPlannerMap({
  stops,
  legs,
  selectedId,
  featuredStopId,
  destinationCards = [],
  selectedLegId,
  contextCardsHidden = false,
  plannerPins,
  selectedPlannerPinId = null,
  localPlaces = [],
  localPlaceKind = "stay",
  selectedLocalPlaceId,
  focusOffset,
  focusZoom,
  focusCoordinates,
  draftPinCoordinates,
  pinPlacementMode,
  overviewMode = false,
  previewMode = false,
  previewLabel,
  overviewPadding,
  cameraInteractionKey,
  onMapPinDrop,
  onPlannerPinSelect,
  onLocalPlaceSelect,
  onLegSelect,
  onSelect,
}: JourneyPlannerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const legMarkersRef = useRef<maplibregl.Marker[]>([]);
  const pinMarkersRef = useRef<maplibregl.Marker[]>([]);
  const localPlaceMarkersRef = useRef<maplibregl.Marker[]>([]);
  const draftPinRef = useRef<maplibregl.Marker | null>(null);
  const removalTimerRef = useRef<number | null>(null);
  const hasInitialisedViewRef = useRef(false);
  const lastCameraRequestKeyRef = useRef<string | null>(null);
  const currentCameraRequestRef = useRef<string | null>(null);
  const lastCameraInteractionKeyRef = useRef(cameraInteractionKey);
  const selectedLegIdRef = useRef(selectedLegId);
  const selectedPlannerPinIdRef = useRef(selectedPlannerPinId);
  const onLegSelectRef = useRef(onLegSelect);
  const onSelectRef = useRef(onSelect);
  const onPlannerPinSelectRef = useRef(onPlannerPinSelect);
  const onLocalPlaceSelectRef = useRef(onLocalPlaceSelect);
  onLegSelectRef.current = onLegSelect;
  onSelectRef.current = onSelect;
  onPlannerPinSelectRef.current = onPlannerPinSelect;
  onLocalPlaceSelectRef.current = onLocalPlaceSelect;
  selectedLegIdRef.current = selectedLegId;
  selectedPlannerPinIdRef.current = selectedPlannerPinId;
  const routeFocusKey = previewMode ? null : focusCoordinates;
  const routeSelectionKey = previewMode ? null : selectedLegId;
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
  const overviewRouteKey = stops.map((stop) => `${stop.id}:${stop.coordinates?.join(",") ?? "unmapped"}`).join("|");
  const overviewPaddingKey = overviewPadding
    ? `${overviewPadding.top}:${overviewPadding.right}:${overviewPadding.bottom}:${overviewPadding.left}`
    : "default";
  const selectedStop = stops.find((stop) => stop.id === selectedId && stop.coordinates);
  const selectedLocalPlace = localPlaces.find((place) => place.id === selectedLocalPlaceId);
  const cameraRequestKey = previewMode
    ? null
    : overviewMode
      ? `overview:${overviewRouteKey}`
      : selectedLocalPlace
        ? `place:${selectedLocalPlace.id}:${selectedLocalPlace.coordinates.join(",")}`
        : focusCoordinates
          ? `focus:${focusCoordinates.join(",")}`
          : selectedStop?.coordinates
            ? `stop:${selectedStop.id}:${selectedStop.coordinates.join(",")}:${focusZoom ?? "auto"}`
            : null;

  useEffect(() => {
    if (!containerRef.current) return;
    if (removalTimerRef.current !== null) {
      window.clearTimeout(removalTimerRef.current);
      removalTimerRef.current = null;
    }
    if (!mapRef.current) {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      const firstStop = stops.find((stop) => stop.id === selectedId && stop.coordinates)?.coordinates
        ?? stops.find((stop) => stop.coordinates)?.coordinates
        ?? [-90.5069, 14.6349];
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: morroviaMapStyle,
        center: firstStop,
        zoom: 9,
        interactive: !previewMode,
      });
      const handleMapError = (event: maplibregl.ErrorEvent) => {
        const value = event.error;
        if (typeof Event !== "undefined" && value instanceof Event) {
          console.warn("Morrovia MapLibre resource request ended before the map finished loading.", {
            type: value.type,
          });
          return;
        }
        const error = value instanceof Error ? value : new Error("Morrovia MapLibre reported an unknown error.");
        if (/Failed to fetch|Could not load|NetworkError|Load failed|AJAXError/i.test(error.message)) {
          console.warn("Morrovia MapLibre could not load a map resource.", error);
          return;
        }
        console.error(error);
      };
      if (previewMode) map.on("error", handleMapError);
      // North-up is fixed in this workspace, so a compass beside the route-fit
      // control duplicated intent and looked like an unexplained third zoom
      // button. Keep the familiar MapLibre zoom controls only.
      if (!previewMode) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;
    }

    return () => {
      const removeMap = () => {
        stopMarkersRef.current.forEach((marker) => marker.remove());
        legMarkersRef.current.forEach((marker) => marker.remove());
        pinMarkersRef.current.forEach((marker) => marker.remove());
        localPlaceMarkersRef.current.forEach((marker) => marker.remove());
        draftPinRef.current?.remove();
        mapRef.current?.remove();
        mapRef.current = null;
      };
      if (!previewMode) {
        removeMap();
        return;
      }
      removalTimerRef.current = window.setTimeout(() => {
        removalTimerRef.current = null;
        removeMap();
      }, 0);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const mappedStops = stops.filter((stop): stop is JourneyStop & { coordinates: [number, number] } => Boolean(stop.coordinates));
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const map = mapRef.current;
        if (!map) return;
        map.resize();
        if (!overviewMode || mappedStops.length < 2) return;
        const bounds = mappedStops.slice(1).reduce(
          (result, stop) => result.extend(stop.coordinates),
          new maplibregl.LngLatBounds(mappedStops[0].coordinates, mappedStops[0].coordinates),
        );
        fitMapCamera(map as unknown as MapCamera, bounds, {
          padding: effectiveOverviewPadding(map, overviewPadding),
          offset: previewMode ? [0, 0] : overviewFitOffset(),
          maxZoom: overviewMaxZoom,
        }, true);
      });
    });
    observer.observe(container);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [overviewMode, overviewPaddingKey, overviewRouteKey, previewMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mappedStops = stops.filter((stop): stop is JourneyStop & { coordinates: [number, number] } => Boolean(stop.coordinates));
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
    const route = routeLegs.features.length ? routeLegs : {
      type: "FeatureCollection" as const,
      features: [{
        type: "Feature" as const,
        properties: { id: "whole-route", mode: "unknown" },
        geometry: { type: "LineString" as const, coordinates: mappedStops.map((stop) => stop.coordinates) },
      }],
    };

    const selectRoute = (event: maplibregl.MapLayerMouseEvent) => {
      interruptMapCamera(map as unknown as MapCamera);
      currentCameraRequestRef.current = null;
      const id = event.features?.[0]?.properties?.id;
      const leg = spatialLegs.find((candidate) => candidate.id === id);
      if (leg) onLegSelectRef.current?.(leg);
    };
    const hoverRoute = (event: maplibregl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const id = event.features?.[0]?.properties?.id;
      map.setFilter("trip-route-hover", ["==", ["get", "id"], typeof id === "string" ? id : ""]);
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
          paint: { "line-color": "#17106f", "line-width": 14, "line-opacity": 0.28 },
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
      if (map.getLayer("trip-route-selected")) {
        map.setFilter("trip-route-selected", ["==", ["get", "id"], selectedLegIdRef.current ?? ""]);
      }
      if (map.getLayer("trip-route-hit")) {
        map.on("click", "trip-route-hit", selectRoute);
        map.on("mousemove", "trip-route-hit", hoverRoute);
        map.on("mouseleave", "trip-route-hit", leaveRoute);
      }

      if (!hasInitialisedViewRef.current && mappedStops.length) {
        hasInitialisedViewRef.current = true;
        lastCameraRequestKeyRef.current = cameraRequestKey;
        currentCameraRequestRef.current = cameraRequestKey;
        const activeStop = mappedStops.find((stop) => stop.id === selectedId) ?? mappedStops[0];
        // On first mount the focus effect can run before the map is ready.
        // Start at the pin itself so opening/adding a pin never leaves it
        // outside the visible map.
        if (overviewMode && !focusCoordinates && mappedStops.length > 1) {
          const bounds = mappedStops.slice(1).reduce(
            (result, stop) => result.extend(stop.coordinates),
            new maplibregl.LngLatBounds(mappedStops[0].coordinates, mappedStops[0].coordinates),
          );
          fitMapCamera(map as unknown as MapCamera, bounds, {
            padding: effectiveOverviewPadding(map, overviewPadding),
            offset: previewMode ? [0, 0] : overviewFitOffset(),
            maxZoom: overviewMaxZoom,
          }, true);
        } else {
          const compactViewport = window.innerWidth <= 980;
          const offset: [number, number] = !compactViewport && focusZoom !== undefined ? focusOffset ?? [0, 0] : [0, 0];
          focusMapCamera(map as unknown as MapCamera, {
            center: focusCoordinates ?? activeStop.coordinates,
            zoom: focusCoordinates ? 14 : compactViewport ? 11 : focusZoom ?? 11,
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
      if (map.loaded()) {
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
  }, [focusOffset, focusZoom, overviewMode, overviewPadding, pinPlacementMode, previewMode, routeFocusKey, routeSelectionKey, selectedId, spatialLegs, stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("trip-route-selected")) return;
    map.setFilter("trip-route-selected", ["==", ["get", "id"], selectedLegId ?? ""]);
  }, [selectedLegId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (previewMode) {
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
        element.addEventListener("click", (event) => { event.stopPropagation(); interruptMapCamera(map as unknown as MapCamera); currentCameraRequestRef.current = null; onLegSelectRef.current?.(leg); });
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
  }, [contextCardsHidden, previewMode, spatialLegs]);

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
        const element = document.createElement(previewMode ? "span" : "button");
        if (!previewMode) (element as HTMLButtonElement).type = "button";
        element.className = `planner-map__stop ${previewMode ? "is-preview" : ""} ${stop.id === selectedId ? "is-active" : ""} ${stop.id === featuredStopId ? "is-featured" : ""} ${isOrigin ? "is-origin" : ""} ${index === stops.filter((candidate) => candidate.coordinates).length - 1 ? "is-destination" : ""}`;
        element.dataset.mapStopId = stop.id;
        const relationship = isOrigin ? "trip origin" : index === stops.filter((candidate) => candidate.coordinates).length - 1 ? "final destination" : `overnight stop ${isOrigin ? index + 1 : index}`;
        if (previewMode) element.setAttribute("aria-hidden", "true");
        else element.setAttribute("aria-label", `Show ${stop.city}, ${relationship}`);
        const number = document.createElement("span");
        number.className = "planner-map__stop-number";
        number.textContent = previewMode
          ? String(index + 1)
          : isOrigin
            ? "FROM"
            : String(stops[0]?.theme === "transit" ? index : index + 1).padStart(2, "0");
        element.append(number);
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
        if (!previewMode) {
          element.addEventListener("click", (event) => { event.stopPropagation(); interruptMapCamera(map as unknown as MapCamera); currentCameraRequestRef.current = null; onSelectRef.current(stop.id); });
          element.addEventListener("mouseenter", () => previewStop(stop.id));
          element.addEventListener("mouseleave", () => previewStop(undefined));
          element.addEventListener("focus", () => previewStop(stop.id));
          element.addEventListener("blur", () => previewStop(undefined));
        }
        return new maplibregl.Marker({ element, anchor: "center" }).setLngLat(stop.coordinates!).addTo(map);
      });
    };
    if (map.isStyleLoaded()) drawMarkers();
    else map.once("load", drawMarkers);
    return () => { map.off("load", drawMarkers); };
  }, [destinationCards, previewMode, stops]);

  useEffect(() => {
    const mappedStops = stops.filter((stop) => stop.coordinates);
    stopMarkersRef.current.forEach((marker, index) => {
      const element = marker.getElement();
      element.classList.toggle("is-active", mappedStops[index]?.id === selectedId);
      element.classList.toggle("is-featured", mappedStops[index]?.id === featuredStopId);
      element.classList.toggle("is-context-hidden", contextCardsHidden);
    });
  }, [contextCardsHidden, featuredStopId, selectedId, stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const drawPins = () => {
      pinMarkersRef.current.forEach((marker) => marker.remove());
      pinMarkersRef.current = plannerPins.map((pin) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = `planner-map__pin is-${pin.category} ${pin.id === selectedPlannerPinIdRef.current ? "is-active" : ""}`;
        element.dataset.plannerPinId = pin.id;
        element.setAttribute("aria-label", `Show ${pin.title}`);
        element.title = `Show ${pin.title}`;
        element.innerHTML = `<span>${pinSymbols[pin.category]}</span>`;
        const selectPin = (event: Event) => { event.stopPropagation(); interruptMapCamera(map as unknown as MapCamera); currentCameraRequestRef.current = null; onPlannerPinSelectRef.current(pin); };
        if (previewMode) {
          // A non-pannable preview still needs its stable pin controls to be
          // actionable. Pointer-down avoids MapLibre swallowing the following
          // click, while the explicit key handler preserves button semantics.
          element.addEventListener("pointerdown", selectPin);
          element.addEventListener("mousedown", selectPin);
          element.addEventListener("click", selectPin);
          element.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            selectPin(event);
          });
        } else {
          element.addEventListener("click", selectPin);
        }
        return new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat([pin.longitude, pin.latitude]).addTo(map);
      });
    };
    // Preview pins are DOM overlays and can update while raster resources are
    // still settling; the main Map keeps its established style lifecycle.
    if (previewMode) drawPins();
    else if (map.isStyleLoaded()) drawPins();
    else map.once("load", drawPins);
    return () => { map.off("load", drawPins); };
  }, [plannerPins, previewMode]);

  useEffect(() => {
    pinMarkersRef.current.forEach((marker) => {
      const element = marker.getElement();
      element.classList.toggle("is-active", element.dataset.plannerPinId === selectedPlannerPinId);
    });
  }, [selectedPlannerPinId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const drawLocalPlaces = () => {
      localPlaceMarkersRef.current.forEach((marker) => marker.remove());
      localPlaceMarkersRef.current = localPlaces.map((place) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = `planner-map__local-place ${place.id === selectedLocalPlaceId ? "is-active" : ""}`;
        element.dataset.localPlaceId = place.id;
        element.setAttribute("aria-label", `Show ${place.name}`);
        element.title = `Show ${place.name}`;
        const PlaceIcon = localPlaceKind === "stay" ? BedDouble : Utensils;
        element.innerHTML = renderToStaticMarkup(<><PlaceIcon aria-hidden="true" /><span>{place.price ? `${place.price.currency} ${Math.round(place.price.total)}` : localPlaceKind === "stay" ? "Stay" : "Eat"}</span></>);
        element.addEventListener("click", (event) => { event.stopPropagation(); interruptMapCamera(map as unknown as MapCamera); currentCameraRequestRef.current = null; onLocalPlaceSelectRef.current?.(place); });
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
  }, [localPlaceKind, localPlaces]);

  useEffect(() => {
    localPlaceMarkersRef.current.forEach((marker) => marker.getElement().classList.toggle("is-active", marker.getElement().dataset.localPlaceId === selectedLocalPlaceId));
  }, [selectedLocalPlaceId]);

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
    if (map.isStyleLoaded()) drawDraftPin();
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
    currentCameraRequestRef.current = null;
    interruptMapCamera(mapRef.current as unknown as MapCamera);
  }, [cameraInteractionKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cameraRequestKey || !hasInitialisedViewRef.current || cameraRequestKey === lastCameraRequestKeyRef.current) return;
    lastCameraRequestKeyRef.current = cameraRequestKey;
    currentCameraRequestRef.current = cameraRequestKey;
    if (overviewMode) {
      const mappedStops = stops.filter((stop): stop is JourneyStop & { coordinates: [number, number] } => Boolean(stop.coordinates));
      if (mappedStops.length < 2) return;
      const bounds = mappedStops.slice(1).reduce(
        (result, stop) => result.extend(stop.coordinates),
        new maplibregl.LngLatBounds(mappedStops[0].coordinates, mappedStops[0].coordinates),
      );
      fitMapCamera(map as unknown as MapCamera, bounds, {
        padding: effectiveOverviewPadding(map, overviewPadding),
        offset: overviewFitOffset(),
        maxZoom: overviewMaxZoom,
      });
      return;
    }
    const target = selectedLocalPlace?.coordinates ?? focusCoordinates ?? selectedStop?.coordinates;
    if (!target) return;
    const compactViewport = window.innerWidth <= 980;
    const offset: [number, number] = compactViewport ? [0, -90] : focusOffset ?? [0, 0];
    const zoom = selectedLocalPlace || focusCoordinates
      ? Math.max(map.getZoom(), 14)
      : compactViewport ? 11 : focusZoom ?? Math.max(map.getZoom(), 11);
    focusMapCamera(map as unknown as MapCamera, { center: target, zoom, offset });
  }, [cameraRequestKey, focusCoordinates, focusOffset, focusZoom, overviewMode, overviewPadding, selectedLocalPlace, selectedStop, stops]);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || previewMode) return;
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
  }, [previewMode]);

  return <div ref={containerRef} className={`planner-map ${mapPresentation.surface}`} aria-label={previewMode ? previewLabel ?? "Whole-trip route map preview" : "Interactive trip map"} />;
}
