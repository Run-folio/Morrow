"use client";

import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { Maximize2, Map as MapIcon } from "lucide-react";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { createMorroviaFallbackMapStyle, mapRouteLine, mapRoutePlanning } from "@/components/easyt/morrovia-map-presentation";
import { createMorroviaStopMarker, setMorroviaStopMarkerState } from "@/components/easyt/morrovia-map-markers";
import { MORROVIA_MAP_WORKER_URL, installMorroviaMapControls } from "@/components/easyt/morrovia-map-runtime";
import { mapTransportIcon } from "@/components/easyt/morrovia-transport-icons";
import { fitMapCamera, focusMapCamera, type MapCamera } from "@/lib/easyt/map-camera";
import { formatTripDuration } from "@/lib/easyt/trip-facts";
import { previewConnections, previewStops } from "./product-preview-data";
import presentation from "@/components/easyt/morrovia-map-presentation.module.css";
import styles from "./product-preview.module.css";

const bounds: [[number, number], [number, number]] = [[135.2, 34.4], [140, 36.8]];
function showRoute(map: MapLibreMap) {
  fitMapCamera(map as unknown as MapCamera, bounds, { padding: { top: 65, right: 75, bottom: 60, left: 55 }, maxZoom: 7 });
}

export default function DemoMap({ selected, onSelect, es }: { selected: { id: string } | null; onSelect: (id: string) => void; es: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Array<{ id: string; element: HTMLElement }>>([]);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    if (!container.current) return;
    setState("loading");
    let disposed = false;
    let map: MapLibreMap | undefined;
    let observer: ResizeObserver | undefined;
    const ownedMarkers: Marker[] = [];
    const listeners: Array<() => void> = [];
    const disposeMap = () => {
      observer?.disconnect();
      listeners.splice(0).forEach(remove => remove());
      ownedMarkers.splice(0).forEach(marker => marker.remove());
      markers.current = [];
      map?.remove(); map = undefined; mapRef.current = null;
    };
    const fail = () => { if (disposed) return; disposeMap(); setState("unavailable"); };
    const timeout = window.setTimeout(fail, 12000);
    try {
      maplibregl.setWorkerUrl(MORROVIA_MAP_WORKER_URL);
      map = new maplibregl.Map({ container: container.current, style: createMorroviaFallbackMapStyle(), attributionControl: { compact: false }, dragRotate: false, pitchWithRotate: false, scrollZoom: false, cooperativeGestures: true });
      mapRef.current = map;
      map.getCanvas().setAttribute("aria-label", es ? "Mapa del ejemplo; conexiones esquemáticas, no vías reales" : "Sample map; schematic connections, not actual transport routes");
      installMorroviaMapControls(map, maplibregl, { variant: "embedded", interaction: "pan-zoom" });
      map.on("load", () => {
        if (disposed || !map) return;
        window.clearTimeout(timeout);
        map.addSource("sample-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: previewStops.map(stop => stop.coordinates) } } });
        map.addLayer({ id: "sample-route-line", type: "line", source: "sample-route", paint: mapRouteLine });
        map.addLayer({ id: "sample-route-schematic", type: "line", source: "sample-route", paint: mapRoutePlanning });
        previewStops.forEach((stop, index) => {
          const element = createMorroviaStopMarker(document, { id: stop.id, sequence: index + 1, name: stop.name, interactive: true, selected: false });
          element.setAttribute("aria-label", `${es ? "Parada" : "Stop"} ${index + 1}: ${stop.name}`);
          const label = document.createElement("span"); label.className = styles.mapName; label.textContent = stop.name; label.setAttribute("aria-hidden", "true"); element.append(label);
          const select = () => selectRef.current(stop.id);
          element.addEventListener("click", select);
          listeners.push(() => element.removeEventListener("click", select));
          markers.current.push({ id: stop.id, element });
          ownedMarkers.push(new maplibregl.Marker({ element, anchor: index === 2 ? "bottom" : index === 3 ? "top" : "center" }).setLngLat(stop.coordinates).addTo(map!));
        });
        previewConnections.forEach((connection, index) => {
          const from = previewStops[index], to = previewStops[index + 1];
          const element = document.createElement("span"); element.className = styles.mapConnection;
          const Icon = mapTransportIcon(connection.mode);
          const timing = connection.minutes === null ? (es ? "Por confirmar" : "To confirm") : `${es ? "Est." : "Est."} ${formatTripDuration(connection.minutes)}`;
          element.innerHTML = renderToStaticMarkup(<><Icon aria-hidden="true" /><span>{timing}</span></>);
          element.setAttribute("aria-hidden", "true"); // Same evidence is accessible beside the ordered stops.
          const avoidOverlap = () => { if (!map) return; const a = map.project(from.coordinates), b = map.project(to.coordinates); element.style.visibility = Math.hypot(a.x - b.x, a.y - b.y) < 100 ? "hidden" : "visible"; };
          map!.on("move", avoidOverlap); listeners.push(() => map?.off("move", avoidOverlap));
          ownedMarkers.push(new maplibregl.Marker({ element }).setLngLat([(from.coordinates[0] + to.coordinates[0]) / 2, (from.coordinates[1] + to.coordinates[1]) / 2]).addTo(map!));
        });
        showRoute(map);
        setState("ready");
      });
      map.on("error", fail);
      observer = new ResizeObserver(() => map?.resize());
      observer.observe(container.current);
    } catch { fail(); }
    return () => { disposed = true; window.clearTimeout(timeout); disposeMap(); };
  }, [es]);

  useEffect(() => {
    if (state !== "ready" || !mapRef.current) return;
    markers.current.forEach(marker => setMorroviaStopMarkerState(marker.element, { selected: marker.id === selected?.id }));
    const stop = previewStops.find(item => item.id === selected?.id);
    if (stop) focusMapCamera(mapRef.current as unknown as MapCamera, { center: stop.coordinates, zoom: 8 });
  }, [selected, state]);

  return <div className={`${presentation.surface} ${styles.map}`} data-preview-map-state={state}>
    <div ref={container} className={presentation.canvas} />
    {state === "loading" && <div className={styles.mapLoading} role="status">{es ? "Abriendo el mapa…" : "Opening the route map…"}</div>}
    {state === "unavailable" && <div className={styles.mapLoading} role="status"><MapIcon aria-hidden="true" />{es ? "Mapa no disponible" : "Map unavailable"}</div>}
    {state === "ready" && <><div className={styles.mapReset}><EasyTButton variant="secondary" size="small" icon={Maximize2} iconOnly onClick={() => mapRef.current && showRoute(mapRef.current)}>{es ? "Ver toda la ruta" : "Show whole route"}</EasyTButton></div><span className={styles.schematic}>{es ? "Ruta esquemática" : "Schematic route"}</span></>}
  </div>;
}
