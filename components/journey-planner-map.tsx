"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, StyleSpecification } from "maplibre-gl";
import { BedDouble, CarFront, CircleHelp, Footprints, Plane, Ship, TrainFront, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { feature } from "topojson-client";
import worldTopology from "world-atlas/countries-50m.json";
import type { JourneyLeg, JourneyStop } from "@/lib/journey";
import type { PlannerMapPin } from "@/lib/easyt/trip";
import type { JourneyLocalPlace } from "@/components/journey-local-finder";
import { formatMapDuration, type MapRouteLeg } from "@/lib/easyt/map-spatial-context";
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

const transportIcons: Record<MapRouteLeg["mode"], LucideIcon> = {
  flight: Plane,
  train: TrainFront,
  road: CarFront,
  ferry: Ship,
  walk: Footprints,
  unknown: CircleHelp,
};

function legMidpoint(leg: MapRouteLeg): [number, number] {
  let [fromLongitude, fromLatitude] = leg.fromCoordinates;
  let [toLongitude, toLatitude] = leg.toCoordinates;
  if (Math.abs(toLongitude - fromLongitude) > 180) {
    if (toLongitude < fromLongitude) toLongitude += 360;
    else fromLongitude += 360;
  }
  const longitude = ((fromLongitude + toLongitude) / 2 + 540) % 360 - 180;
  return [longitude, (fromLatitude + toLatitude) / 2];
}

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

const topology = worldTopology as unknown as { objects: { countries: object } };
const morroviaCountries = feature(
  topology as never,
  topology.objects.countries as never,
) as unknown as GeoJSON.FeatureCollection;

// CARTO raster tiles are deliberately used instead of their remote GL style:
// the latter can load controls but fail to load map layers in some browsers.
const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    "morrovia-countries": {
      type: "geojson",
      data: morroviaCountries,
    },
    carto: {
      type: "raster",
      tiles: ["https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 20,
      attribution: "© CARTO, © OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "morrovia-ocean",
      type: "background",
      paint: { "background-color": "#f2f4f6" },
    },
    {
      id: "carto-light",
      type: "raster",
      source: "carto",
      paint: {
        "raster-saturation": -0.22,
        "raster-contrast": -0.06,
        "raster-brightness-max": 0.98,
        "raster-opacity": ["interpolate", ["linear"], ["zoom"], 6.1, 0, 7.1, 0.24, 8.35, 0.94],
      },
    },
    {
      id: "morrovia-land",
      type: "fill",
      source: "morrovia-countries",
      paint: {
        "fill-color": "#fffefe",
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6.1, 1, 7.2, 0.72, 8.35, 0],
      },
    },
    {
      id: "morrovia-borders",
      type: "line",
      source: "morrovia-countries",
      paint: {
        "line-color": "#c9cae2",
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.75, 6, 1.15, 8.35, 0.4],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 6.1, 0.92, 7.2, 0.58, 8.35, 0],
      },
    },
  ],
};

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
      if (isMapRouteLeg(leg)) return [leg];
      const from = stopById.get(leg.from);
      const to = stopById.get(leg.to);
      if (!from?.coordinates || !to?.coordinates) return [];
      return [{
        id: `${leg.from}-${leg.to}-${index}`,
        fromStopId: leg.from,
        toStopId: leg.to,
        fromName: from.city,
        toName: to.city,
        fromCoordinates: from.coordinates,
        toCoordinates: to.coordinates,
        mode: leg.mode === "rail" ? "train" : leg.mode,
        modeLabel: leg.mode === "rail" ? "Train" : leg.mode === "flight" ? "Flight" : leg.mode === "road" ? "Road" : leg.mode === "ferry" ? "Ferry" : "Unknown transport",
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
        style: mapStyle,
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
        map.fitBounds(bounds, {
          padding: effectiveOverviewPadding(map, overviewPadding),
          offset: previewMode ? [0, 0] : overviewFitOffset(),
          maxZoom: overviewMaxZoom,
          duration: 0,
        });
      });
    });
    observer.observe(container);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [overviewMode, overviewPadding, stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mappedStops = stops.filter((stop): stop is JourneyStop & { coordinates: [number, number] } => Boolean(stop.coordinates));
    const route = {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: mappedStops.map((stop) => stop.coordinates) },
    };
    const routeLegs = {
      type: "FeatureCollection" as const,
      features: spatialLegs.map((leg) => ({
        type: "Feature" as const,
        properties: { id: leg.id, mode: leg.mode },
        geometry: { type: "LineString" as const, coordinates: [leg.fromCoordinates, leg.toCoordinates] },
      })),
    };

    const selectRoute = (event: maplibregl.MapLayerMouseEvent) => {
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
        map.addSource("trip-route", { type: "geojson", data: route });
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
          paint: { "line-color": "rgba(255,255,255,.98)", "line-width": 10, "line-opacity": 0.98 },
        });
      }
      if (!map.getLayer("trip-route-line")) {
        map.addLayer({
          id: "trip-route-line",
          type: "line",
          source: "trip-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#f42b7a",
            "line-width": 6,
            "line-opacity": 0.94,
          },
        });
      }
      if (!map.getLayer("trip-route-planning")) {
        map.addLayer({
          id: "trip-route-planning",
          type: "line",
          source: "trip-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "rgba(255,255,255,.94)",
            "line-width": 1.8,
            "line-opacity": 0.9,
            "line-dasharray": [0.7, 1.35],
          },
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
        const activeStop = mappedStops.find((stop) => stop.id === selectedId) ?? mappedStops[0];
        // On first mount the focus effect can run before the map is ready.
        // Start at the pin itself so opening/adding a pin never leaves it
        // outside the visible map.
        if (overviewMode && !focusCoordinates && mappedStops.length > 1) {
          const bounds = mappedStops.slice(1).reduce(
            (result, stop) => result.extend(stop.coordinates),
            new maplibregl.LngLatBounds(mappedStops[0].coordinates, mappedStops[0].coordinates),
          );
          map.fitBounds(bounds, {
            padding: effectiveOverviewPadding(map, overviewPadding),
            offset: previewMode ? [0, 0] : overviewFitOffset(),
            maxZoom: overviewMaxZoom,
            duration: 0,
          });
        } else {
          const compactViewport = window.innerWidth <= 980;
          const offset: [number, number] = !compactViewport && focusZoom !== undefined ? focusOffset ?? [0, 0] : [0, 0];
          map.easeTo({
            center: focusCoordinates ?? activeStop.coordinates,
            zoom: focusCoordinates ? 14 : compactViewport ? 11 : focusZoom ?? 11,
            offset,
            duration: 0,
          });
        }
      }
    };

    let refitFrame = 0;
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
    if (overviewMode && mappedStops.length > 1) {
      refitFrame = window.requestAnimationFrame(() => {
        map.resize();
        const bounds = mappedStops.slice(1).reduce(
          (result, stop) => result.extend(stop.coordinates),
          new maplibregl.LngLatBounds(mappedStops[0].coordinates, mappedStops[0].coordinates),
        );
        map.fitBounds(bounds, { padding: effectiveOverviewPadding(map, overviewPadding), offset: previewMode ? [0, 0] : overviewFitOffset(), maxZoom: overviewMaxZoom, duration: 0 });
      });
    }
    return () => {
      disposed = true;
      window.clearTimeout(routeRetry);
      window.cancelAnimationFrame(refitFrame);
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
    const mappedStops = stops.filter((stop): stop is JourneyStop & { coordinates: [number, number] } => Boolean(stop.coordinates));
    if (!map || !overviewMode || !hasInitialisedViewRef.current || mappedStops.length < 2) return;
    const bounds = mappedStops.slice(1).reduce(
      (result, stop) => result.extend(stop.coordinates),
      new maplibregl.LngLatBounds(mappedStops[0].coordinates, mappedStops[0].coordinates),
    );
    map.fitBounds(bounds, {
      padding: effectiveOverviewPadding(map, overviewPadding),
      offset: previewMode ? [0, 0] : overviewFitOffset(),
      maxZoom: overviewMaxZoom,
      duration: 550,
    });
  }, [overviewMode, overviewPadding, previewMode, stops]);

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
        const MarkerIcon = transportIcons[leg.mode];
        element.innerHTML = renderToStaticMarkup(<>
          <span className="planner-map__leg-icon" aria-hidden="true"><MarkerIcon /></span>
          <span className="planner-map__leg-card" aria-hidden="true">
            <span className="planner-map__leg-meta"><strong>{leg.modeLabel.toLocaleUpperCase()}</strong><em>{formatMapDuration(leg.headlineMinutes ?? leg.doorToDoorMinutes)}</em></span>
            <b>{leg.fromName} → {leg.toName}</b>
            <span>{leg.distanceKm !== null ? `${Math.round(leg.distanceKm).toLocaleString()} km` : "Distance to confirm"} · Door-to-door {formatMapDuration(leg.doorToDoorMinutes)}</span>
            <small>{tripLegClassificationLabel(leg.classification)} · {leg.provenanceLabel}</small>
          </span>
        </>);
        element.addEventListener("click", (event) => { event.stopPropagation(); onLegSelectRef.current?.(leg); });
        element.addEventListener("focus", () => onLegSelectRef.current?.(leg));
        element.addEventListener("mouseenter", () => { if (map.getLayer("trip-route-hover")) map.setFilter("trip-route-hover", ["==", ["get", "id"], leg.id]); });
        element.addEventListener("mouseleave", () => { if (map.getLayer("trip-route-hover")) map.setFilter("trip-route-hover", ["==", ["get", "id"], ""]); });
        return new maplibregl.Marker({ element, anchor: "center" }).setLngLat(legMidpoint(leg)).addTo(map);
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
          element.addEventListener("click", (event) => { event.stopPropagation(); onSelectRef.current(stop.id); });
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
        const selectPin = (event: Event) => { event.stopPropagation(); onPlannerPinSelectRef.current(pin); };
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
        element.innerHTML = renderToStaticMarkup(<><BedDouble aria-hidden="true" /><span>{place.price ? `${place.price.currency} ${Math.round(place.price.total)}` : "Stay"}</span></>);
        element.addEventListener("click", (event) => { event.stopPropagation(); onLocalPlaceSelectRef.current?.(place); });
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
  }, [localPlaces]);

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
    const dropPin = (event: maplibregl.MapMouseEvent) => onMapPinDrop([event.lngLat.lng, event.lngLat.lat]);
    map.getCanvas().style.cursor = pinPlacementMode ? "crosshair" : "";
    if (pinPlacementMode) map.on("click", dropPin);
    return () => {
      map.off("click", dropPin);
      map.getCanvas().style.cursor = "";
    };
  }, [onMapPinDrop, pinPlacementMode]);

  useEffect(() => {
    const map = mapRef.current;
    const stop = stops.find((candidate) => candidate.id === selectedId);
    if (!map || !stop?.coordinates || !hasInitialisedViewRef.current || overviewMode) return;
    const compactViewport = window.innerWidth <= 980;
    const offset: [number, number] = compactViewport ? [0, -90] : focusOffset ?? [0, 0];
    const zoom = compactViewport ? 11 : focusZoom ?? Math.max(map.getZoom(), 11);
    map.easeTo({ center: stop.coordinates, zoom, offset, duration: 550 });
  }, [focusOffset, focusZoom, overviewMode, selectedId, stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusCoordinates || !hasInitialisedViewRef.current) return;
    const offset: [number, number] = window.innerWidth <= 980 ? [0, -90] : focusOffset ?? [0, 0];
    map.easeTo({
      center: focusCoordinates,
      zoom: Math.max(map.getZoom(), 14),
      offset,
      duration: 550,
    });
  }, [focusCoordinates, focusOffset]);

  useEffect(() => {
    const map = mapRef.current;
    const place = localPlaces.find((candidate) => candidate.id === selectedLocalPlaceId);
    if (!map || !place || !hasInitialisedViewRef.current) return;
    const offset: [number, number] = window.innerWidth <= 980 ? [0, -90] : focusOffset ?? [0, 0];
    map.easeTo({ center: place.coordinates, zoom: Math.max(map.getZoom(), 14), offset, duration: 420 });
  }, [focusOffset, localPlaces, selectedLocalPlaceId]);

  return <div ref={containerRef} className="planner-map" aria-label={previewMode ? previewLabel ?? "Whole-trip route map preview" : "Interactive trip map"} />;
}
