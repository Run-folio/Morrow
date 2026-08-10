"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { JourneyLeg, JourneyStop } from "@/lib/journey";
import type { PlannerMapPin } from "@/lib/easyt/trip";

type JourneyPlannerMapProps = {
  stops: JourneyStop[];
  legs: JourneyLeg[];
  selectedId: string;
  plannerPins: PlannerMapPin[];
  focusCoordinates: [number, number] | null;
  draftPinCoordinates: [number, number] | null;
  pinPlacementMode: boolean;
  onMapPinDrop: (coordinates: [number, number]) => void;
  onPlannerPinSelect: (pin: PlannerMapPin) => void;
  onSelect: (id: string) => void;
};

const pinSymbols: Record<PlannerMapPin["category"], string> = {
  restaurant: "⌁",
  stay: "⌂",
  activity: "✦",
  transport: "→",
  custom: "+",
};

// CARTO raster tiles are deliberately used instead of their remote GL style:
// the latter can load controls but fail to load map layers in some browsers.
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

export function JourneyPlannerMap({
  stops,
  legs,
  selectedId,
  plannerPins,
  focusCoordinates,
  draftPinCoordinates,
  pinPlacementMode,
  onMapPinDrop,
  onPlannerPinSelect,
  onSelect,
}: JourneyPlannerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const pinMarkersRef = useRef<maplibregl.Marker[]>([]);
  const draftPinRef = useRef<maplibregl.Marker | null>(null);
  const hasInitialisedViewRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const firstStop = stops.find((stop) => stop.id === selectedId && stop.coordinates)?.coordinates
      ?? stops.find((stop) => stop.coordinates)?.coordinates
      ?? [-90.5069, 14.6349];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: firstStop,
      zoom: 9,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    mapRef.current = map;

    return () => {
      stopMarkersRef.current.forEach((marker) => marker.remove());
      pinMarkersRef.current.forEach((marker) => marker.remove());
      draftPinRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mappedStops = stops.filter((stop): stop is JourneyStop & { coordinates: [number, number] } => Boolean(stop.coordinates));
    const route = {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: mappedStops.map((stop) => stop.coordinates) },
    };

    const drawRoute = () => {
      const source = map.getSource("trip-route") as GeoJSONSource | undefined;
      if (source) source.setData(route);
      else {
        map.addSource("trip-route", { type: "geojson", data: route });
        map.addLayer({
          id: "trip-route-line",
          type: "line",
          source: "trip-route",
          paint: { "line-color": "#ff3d8b", "line-width": 4, "line-opacity": 0.88 },
        });
      }

      if (!hasInitialisedViewRef.current && mappedStops.length) {
        hasInitialisedViewRef.current = true;
        const activeStop = mappedStops.find((stop) => stop.id === selectedId) ?? mappedStops[0];
        // On first mount the focus effect can run before the map is ready.
        // Start at the pin itself so opening/adding a pin never leaves it
        // outside the visible map.
        map.jumpTo({ center: focusCoordinates ?? activeStop.coordinates, zoom: focusCoordinates ? 14 : 11 });
      }
    };

    if (map.isStyleLoaded()) drawRoute();
    else map.once("load", drawRoute);
    return () => { map.off("load", drawRoute); };
  }, [focusCoordinates, legs, selectedId, stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const drawMarkers = () => {
      stopMarkersRef.current.forEach((marker) => marker.remove());
      stopMarkersRef.current = stops.filter((stop) => stop.coordinates).map((stop, index) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = `planner-map__stop ${stop.id === selectedId ? "is-active" : ""}`;
        element.setAttribute("aria-label", `Show ${stop.city}`);
        element.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span>`;
        element.addEventListener("click", () => onSelect(stop.id));
        return new maplibregl.Marker({ element, anchor: "center" }).setLngLat(stop.coordinates!).addTo(map);
      });
    };
    if (map.isStyleLoaded()) drawMarkers();
    else map.once("load", drawMarkers);
    return () => { map.off("load", drawMarkers); };
  }, [onSelect, selectedId, stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const drawPins = () => {
      pinMarkersRef.current.forEach((marker) => marker.remove());
      pinMarkersRef.current = plannerPins.map((pin) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = `planner-map__pin is-${pin.category}`;
        element.setAttribute("aria-label", `Show ${pin.title}`);
        element.innerHTML = `<span>${pinSymbols[pin.category]}</span>`;
        element.addEventListener("click", () => onPlannerPinSelect(pin));
        return new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat([pin.longitude, pin.latitude]).addTo(map);
      });
    };
    if (map.isStyleLoaded()) drawPins();
    else map.once("load", drawPins);
    return () => { map.off("load", drawPins); };
  }, [onPlannerPinSelect, plannerPins]);

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
    if (!map || !stop?.coordinates || !hasInitialisedViewRef.current) return;
    map.easeTo({ center: stop.coordinates, zoom: Math.max(map.getZoom(), 11), duration: 550 });
  }, [selectedId, stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusCoordinates || !hasInitialisedViewRef.current) return;
    map.easeTo({
      center: focusCoordinates,
      zoom: Math.max(map.getZoom(), 14),
      duration: 550,
    });
  }, [focusCoordinates]);

  return <div ref={containerRef} className="planner-map" aria-label="Interactive trip map" />;
}
