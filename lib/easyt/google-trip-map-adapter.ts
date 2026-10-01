import { resolveMapInsets } from "./map-surface-policy.ts";

/** Narrow browser-only Maps contract. Trip and Places state live outside this adapter. */
type Listener = { remove(): void };
type MapClick = {
  placeId?: string;
  stop?(): void;
  latLng?: { lat(): number; lng(): number };
};
type MapObject = {
  addListener(name: string, callback: (event: MapClick) => void): Listener;
  setCenter(center: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
  panTo?(center: { lat: number; lng: number }): void;
  panBy?(x: number, y: number): void;
  fitBounds?(bounds: unknown, padding?: number | { top: number; right: number; bottom: number; left: number }): void;
};
type OverlayObject = { addListener(name: string, callback: () => void): Listener; setMap(map: MapObject | null): void; setIcon?(icon: unknown): void; setZIndex?(zIndex: number): void; setOptions?(options: Record<string, unknown>): void };
type HtmlOverlayObject = {
  setMap(map: MapObject | null): void;
  getPanes(): { overlayMouseTarget: HTMLElement } | null;
  getProjection(): { fromLatLngToDivPixel(point: unknown): { x: number; y: number } | null };
};

export type GoogleTripMapApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapObject;
  Marker: new (options: Record<string, unknown>) => OverlayObject;
  Polyline: new (options: Record<string, unknown>) => OverlayObject;
  Size?: new (width: number, height: number) => { width: number; height: number };
  Point?: new (x: number, y: number) => { x: number; y: number };
  LatLng?: new (lat: number, lng: number) => unknown;
  OverlayView?: new () => HtmlOverlayObject;
};
export type GoogleCanvasStop = { id: string; name: string; coordinates: [number, number] | null; sequence?: number };
export type GoogleCanvasLeg = { id: string; fromStopId: string; toStopId: string };
export type GoogleCanvasPlace = { id: string; name: string; category: "stay" | "eat" | "see"; coordinates: [number, number] };
export type GoogleMapInsets = Partial<{ top: number; right: number; bottom: number; left: number }>;
export type GoogleTripMapOptions = {
  stops: readonly GoogleCanvasStop[];
  legs: readonly GoogleCanvasLeg[];
  selectedStopId: string | null;
  cameraInsets?: GoogleMapInsets;
  onNativePoi(placeId: string, coordinates?: [number, number]): boolean | void;
  onEmptyClick(point: [number, number]): void;
  onSelectStop(stopId: string): void;
  onSelectLeg(legId: string): void;
  onSelectPlace?(placeId: string): void;
  mapId?: string;
};

export function canonicalMapStopCoordinates(canonical: [number, number] | null | undefined, projected: [number, number] | null | undefined): [number, number] | null {
  return canonical ?? projected ?? null;
}

function cameraInsetsKey(insets: GoogleMapInsets): string {
  return `${insets.top ?? 0}:${insets.right ?? 0}:${insets.bottom ?? 0}:${insets.left ?? 0}`;
}

/** Keep nearby result hit areas individually reachable when projected points collide. */
export function googlePlaceMarkerOffsetsForScreenPositions(points: readonly (readonly [number, number])[]): Array<[number, number]> {
  const placed: Array<[number, number]> = [];
  const offsets: Array<[number, number]> = [];
  for (const [x, y] of points) {
    const candidates: Array<[number, number]> = [[0, 0]];
    for (let radius = 1; radius <= points.length; radius++) {
      for (let step = -radius; step <= radius; step++) {
        candidates.push([step * 48, -radius * 48], [step * 48, radius * 48]);
      }
      for (let step = -radius + 1; step < radius; step++) {
        candidates.push([-radius * 48, step * 48], [radius * 48, step * 48]);
      }
    }
    const offset = candidates.find(([dx, dy]) => placed.every(([otherX, otherY]) => Math.hypot(x + dx - otherX, y + dy - otherY) >= 48)) ?? [0, 0];
    offsets.push(offset);
    placed.push([x + offset[0], y + offset[1]]);
  }
  return offsets;
}

/** The Google icon API needs fixed SVG colours; these mirror current Journey tokens. */
export function googlePlaceMarkerIcon(api: GoogleTripMapApi, category: GoogleCanvasPlace["category"], selected: boolean, offset: readonly [number, number]) {
  const size = selected ? 52 : 44;
  const center = size / 2;
  const label = category === "stay" ? "STAY" : category === "eat" ? "EAT" : "SEE";
  const fill = category === "stay" ? "#3025ce" : category === "eat" ? "#d01866" : "#17106f";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${center - 2}" fill="#fbfaff" stroke="${selected ? "#d01866" : "#17106f"}" stroke-width="${selected ? 4 : 2}"/><circle cx="${center}" cy="${center}" r="${center - (selected ? 8 : 5)}" fill="${fill}"/><text x="50%" y="51%" dominant-baseline="central" text-anchor="middle" fill="#fbfaff" font-family="Arial,sans-serif" font-size="${selected ? 10 : 9}" font-weight="700">${label}</text></svg>`;
  const scaledSize = api.Size ? new api.Size(size, size) : { width: size, height: size };
  const anchor = api.Point ? new api.Point(center - offset[0], center - offset[1]) : { x: center - offset[0], y: center - offset[1] };
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, scaledSize, anchor };
}

function googleStopMarkerIcon(api: GoogleTripMapApi, index: number, selected: boolean, origin = false) {
  const size = selected ? 48 : 40;
  const label = origin ? "↗" : String(Math.max(1, index)).padStart(2, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 3}" fill="#17106f" stroke="${selected ? "#d01866" : "#fbfaff"}" stroke-width="${selected ? 4 : 3}"/><text x="50%" y="51%" dominant-baseline="central" text-anchor="middle" fill="#fbfaff" font-family="Arial,sans-serif" font-size="${index === 0 ? 17 : 11}" font-weight="700">${label}</text></svg>`;
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, scaledSize: api.Size ? new api.Size(size, size) : { width: size, height: size } };
}

/** Fan out nearby results at the same map point so no marker hides another. */
export function googlePlaceMarkerOffset(index: number, count: number): [number, number] {
  if (count < 2) return [0, 0];
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return [Math.round((index % columns - (columns - 1) / 2) * 48), Math.round((Math.floor(index / columns) - (rows - 1) / 2) * 48)];
}

export function googleCanvasEligible(input: {
  flag: boolean; authenticated: boolean; expanded: boolean; serverAvailable: boolean; browserKey?: string;
}): boolean {
  return input.flag && input.authenticated && input.expanded && input.serverAvailable && Boolean(input.browserKey?.trim());
}

export function createGoogleMapsSdkLoader(
  install: (key: string, onLoad: (api: GoogleTripMapApi) => void, onError: (error: Error) => void) => void,
) {
  let pending: Promise<GoogleTripMapApi> | null = null;
  return (key: string): Promise<GoogleTripMapApi> => {
    if (!pending) {
      pending = new Promise<GoogleTripMapApi>((resolve, reject) => {
        install(key, resolve, (error) => { pending = null; reject(error); });
      });
    }
    return pending;
  };
}

declare global {
  interface Window {
    google?: { maps?: GoogleTripMapApi };
    __morroviaGoogleMapsReady?: () => void;
  }
}

const browserLoader = createGoogleMapsSdkLoader((key, resolve, reject) => {
  if (window.google?.maps?.Map) { resolve(window.google.maps); return; }
  const script = document.createElement("script");
  const callback = "__morroviaGoogleMapsReady";
  const params = new URLSearchParams({ key, v: "weekly", loading: "async", callback });
  script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
  script.async = true;
  const clear = () => { delete window.__morroviaGoogleMapsReady; script.onerror = null; };
  window.__morroviaGoogleMapsReady = () => {
    const api = window.google?.maps;
    clear();
    if (api?.Map) resolve(api);
    else reject(new Error("Google Maps SDK did not provide a map"));
  };
  script.onerror = () => { clear(); script.remove(); reject(new Error("Google Maps SDK failed to load")); };
  document.head.append(script);
});

export function loadGoogleMapsSdk(key: string): Promise<GoogleTripMapApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps requires a browser"));
  return browserLoader(key);
}

export function createGoogleTripMapSession(api: GoogleTripMapApi, element: HTMLElement, options: GoogleTripMapOptions) {
  const mappedStops = options.stops.filter((stop): stop is GoogleCanvasStop & { coordinates: [number, number] } => Boolean(stop.coordinates));
  const selected = mappedStops.find((stop) => stop.id === options.selectedStopId) ?? mappedStops[0];
  let cameraInsets = options.cameraInsets ?? {};
  const resolvedCameraInsets = () => resolveMapInsets({ width: element.clientWidth, height: element.clientHeight, safe: 48, occlusions: cameraInsets });
  const fitPadding = () => resolvedCameraInsets();
  const map = new api.Map(element, {
    center: selected ? { lat: selected.coordinates[1], lng: selected.coordinates[0] } : { lat: 0, lng: 0 },
    zoom: selected ? 9.5 : 2,
    ...(options.mapId ? { mapId: options.mapId } : {}),
    clickableIcons: true,
    mapTypeControl: false,
    streetViewControl: false,
  });
  const fitWholeRoute = () => {
    if (mappedStops.length < 2) return;
    const longitudes = mappedStops.map((stop) => stop.coordinates[0]);
    const latitudes = mappedStops.map((stop) => stop.coordinates[1]);
    const bounds = { north: Math.max(...latitudes), south: Math.min(...latitudes), east: Math.max(...longitudes), west: Math.min(...longitudes) };
    if (bounds.north !== bounds.south || bounds.east !== bounds.west) map.fitBounds?.(bounds, fitPadding());
  };
  const applyCameraOffset = () => {
    const padding = resolvedCameraInsets();
    // Morrovia's inset offset is the desired screen position for the target.
    // Google panBy moves the map center, so its direction is the inverse.
    const x = Math.round((padding.right - padding.left) / 2);
    const y = Math.round((padding.bottom - padding.top) / 2);
    if (x || y) map.panBy?.(x, y);
  };
  const frameDestination = (stop: GoogleCanvasStop & { coordinates: [number, number] }, resetZoom = true) => {
    map.setCenter({ lat: stop.coordinates[1], lng: stop.coordinates[0] });
    if (resetZoom) map.setZoom(9.5);
    applyCameraOffset();
  };
  const framePlace = (place: GoogleCanvasPlace) => {
    map.panTo?.({ lat: place.coordinates[1], lng: place.coordinates[0] });
    applyCameraOffset();
  };
  if (!options.selectedStopId) fitWholeRoute();
  else applyCameraOffset();
  const click = map.addListener("click", (event) => {
    if (typeof event.placeId === "string" && event.placeId.trim()) {
      const handled = options.onNativePoi(event.placeId, event.latLng ? [event.latLng.lng(), event.latLng.lat()] : undefined);
      if (handled !== false) event.stop?.();
    } else if (event.latLng) {
      options.onEmptyClick([event.latLng.lng(), event.latLng.lat()]);
    }
  });
  const overlays: OverlayObject[] = [];
  const listeners: Listener[] = [click];
  const legLines: OverlayObject[] = [];
  const stopMarkers: Array<{ id: string; index: number; origin: boolean; marker: OverlayObject }> = [];
  const occupiedMarkerCoordinates = new Set<string>();
  for (const [index, stop] of mappedStops.entries()) {
    const coordinateKey = stop.coordinates.join(",");
    // One map hit area per exact point. The shared destination strip retains
    // direct access to every canonical occurrence at a coincident location.
    if (occupiedMarkerCoordinates.has(coordinateKey)) continue;
    occupiedMarkerCoordinates.add(coordinateKey);
    const isOrigin = index === 0 && /origin/i.test(stop.id);
    const marker = new api.Marker({
      map,
      position: { lat: stop.coordinates[1], lng: stop.coordinates[0] },
      title: stop.name,
      icon: googleStopMarkerIcon(api, stop.sequence ?? index + 1, stop.id === options.selectedStopId, isOrigin),
      zIndex: stop.id === options.selectedStopId ? 300 : isOrigin ? 240 : 200,
    });
    overlays.push(marker);
    stopMarkers.push({ id: stop.id, index: stop.sequence ?? index + 1, origin: isOrigin, marker });
    listeners.push(marker.addListener("click", () => options.onSelectStop(stop.id)));
  }
  const byId = new Map(mappedStops.map((stop) => [stop.id, stop]));
  for (const leg of options.legs) {
    const from = byId.get(leg.fromStopId)?.coordinates;
    const to = byId.get(leg.toStopId)?.coordinates;
    if (!from || !to) continue;
    const line = new api.Polyline({
      map,
      path: [{ lat: from[1], lng: from[0] }, { lat: to[1], lng: to[0] }],
      strokeColor: "#e6006e", strokeOpacity: options.selectedStopId ? 0.12 : 0.7, strokeWeight: options.selectedStopId ? 1 : 2,
      icons: [], // schematic connection, not road directions
    });
    overlays.push(line);
    legLines.push(line);
    listeners.push(line.addListener("click", () => options.onSelectLeg(leg.id)));
  }
  let selectedStopId = options.selectedStopId;
  let selectedPlaceId: string | null = null;
  let cameraFocusedPlaceId: string | null = null;
  let selectedPlaceInsetsKey = "";
  let selectedStopInsetsKey = cameraInsetsKey(cameraInsets);
  let placeOverlays: Array<{ setMap(map: MapObject | null): void }> = [];
  let placeListeners: Listener[] = [];
  const clearPlaces = () => {
    for (const listener of placeListeners) listener.remove();
    for (const overlay of placeOverlays) overlay.setMap(null);
    placeListeners = [];
    placeOverlays = [];
  };
  return {
    update(next: { selectedStopId: string | null; cameraInsets?: GoogleMapInsets }) {
      if (next.cameraInsets) cameraInsets = next.cameraInsets;
      const nextInsetsKey = cameraInsetsKey(cameraInsets);
      const insetsChanged = nextInsetsKey !== selectedStopInsetsKey;
      const stopSelectionChanged = next.selectedStopId !== selectedStopId;
      if (!stopSelectionChanged && !insetsChanged) return;
      selectedStopId = next.selectedStopId;
      selectedStopInsetsKey = nextInsetsKey;
      for (const line of legLines) line.setOptions?.({ strokeOpacity: selectedStopId ? 0.12 : 0.7, strokeWeight: selectedStopId ? 1 : 2 });
      for (const stopMarker of stopMarkers) {
        const active = stopMarker.id === selectedStopId;
        stopMarker.marker.setIcon?.(googleStopMarkerIcon(api, stopMarker.index, active, stopMarker.origin));
        stopMarker.marker.setZIndex?.(active ? 300 : stopMarker.origin ? 240 : 200);
      }
      if (selectedPlaceId) return;
      const stop = byId.get(next.selectedStopId ?? "");
      if (stop) frameDestination(stop, stopSelectionChanged);
      else if (!next.selectedStopId) fitWholeRoute();
    },
    updatePlaces(places: readonly GoogleCanvasPlace[], nextSelectedPlaceId: string | null = null, temporaryPlace?: GoogleCanvasPlace | null, insets: GoogleMapInsets = cameraInsets) {
      const focusedPlaceId = element.ownerDocument?.activeElement?.getAttribute("data-google-place-id");
      cameraInsets = insets;
      clearPlaces();
      const visible = [...places];
      if (temporaryPlace && !visible.some((place) => place.id === temporaryPlace.id)) visible.push(temporaryPlace);
      const insetKey = cameraInsetsKey(cameraInsets);
      const OverlayView = api.OverlayView;
      if (OverlayView && api.LatLng && element.ownerDocument) {
        const records = visible.map((place) => {
          const selected = place.id === nextSelectedPlaceId;
          const button = element.ownerDocument!.createElement("button");
          button.type = "button";
          button.className = `planner-map__place planner-map__place--${place.category}${selected ? " is-active" : ""}`;
          button.textContent = place.category === "stay" ? "Stay" : place.category === "eat" ? "Eat" : "See";
          button.setAttribute("aria-label", `${place.name} · ${button.textContent}`);
          button.setAttribute("aria-pressed", String(selected));
          button.setAttribute("data-google-place-id", place.id);
          button.title = place.name;
          button.style.position = "absolute";
          button.style.zIndex = selected ? "500" : "100";
          button.addEventListener("pointerdown", (event) => event.stopPropagation());
          button.addEventListener("click", (event) => { event.stopPropagation(); options.onSelectPlace?.(place.id); });
          return { place, button, point: new api.LatLng!(place.coordinates[1], place.coordinates[0]), projection: null as ReturnType<HtmlOverlayObject["getProjection"]> | null };
        });
        const reflow = () => {
          const projection = records.find((record) => record.projection)?.projection;
          if (!projection) return;
          const pixels = records.map((record) => projection.fromLatLngToDivPixel(record.point));
          const valid = pixels.map((pixel, index) => pixel ? { pixel, index } : null).filter((value): value is { pixel: { x: number; y: number }; index: number } => value !== null);
          const offsets = googlePlaceMarkerOffsetsForScreenPositions(valid.map(({ pixel }) => [pixel.x, pixel.y] as [number, number]));
          valid.forEach(({ pixel, index }, position) => {
            const record = records[index]!;
            record.button.style.left = `${pixel.x + offsets[position]![0]}px`;
            record.button.style.top = `${pixel.y + offsets[position]![1]}px`;
          });
        };
        for (const record of records) {
          const marker = new class extends OverlayView {
            onAdd() { this.getPanes()?.overlayMouseTarget.append(record.button); }
            draw() { record.projection = this.getProjection(); reflow(); }
            onRemove() { record.button.remove(); }
          }();
          placeOverlays.push(marker);
          if (record.place.id === focusedPlaceId) record.button.focus({ preventScroll: true });
        }
        for (const overlay of placeOverlays) overlay.setMap(map);
      } else {
        const clusters = new Map<string, GoogleCanvasPlace[]>();
        for (const place of visible) {
          const key = `${place.coordinates[0].toFixed(4)},${place.coordinates[1].toFixed(4)}`;
          clusters.set(key, [...(clusters.get(key) ?? []), place]);
        }
        for (const place of visible) {
          const key = `${place.coordinates[0].toFixed(4)},${place.coordinates[1].toFixed(4)}`;
          const group = clusters.get(key)!;
          const selected = place.id === nextSelectedPlaceId;
          const offset = googlePlaceMarkerOffset(group.findIndex((member) => member.id === place.id), group.length);
          const marker = new api.Marker({ map, position: { lat: place.coordinates[1], lng: place.coordinates[0] }, title: `${place.name} · ${place.category}`, icon: googlePlaceMarkerIcon(api, place.category, selected, offset), optimized: false, zIndex: selected ? 500 : 100 });
          placeOverlays.push(marker);
          placeListeners.push(marker.addListener("click", () => options.onSelectPlace?.(place.id)));
          placeListeners.push(marker.addListener("mouseover", () => { if (!selected) marker.setIcon?.(googlePlaceMarkerIcon(api, place.category, true, offset)); }));
          placeListeners.push(marker.addListener("mouseout", () => { if (!selected) marker.setIcon?.(googlePlaceMarkerIcon(api, place.category, false, offset)); }));
        }
      }
      const placeSelectionChanged = nextSelectedPlaceId !== selectedPlaceId;
      const insetChanged = Boolean(nextSelectedPlaceId && insetKey !== selectedPlaceInsetsKey);
      const cameraTargetArrived = Boolean(nextSelectedPlaceId && visible.some((place) => place.id === nextSelectedPlaceId) && cameraFocusedPlaceId !== nextSelectedPlaceId);
      if (placeSelectionChanged || insetChanged || cameraTargetArrived) {
        const previousPlaceId = selectedPlaceId;
        selectedPlaceId = nextSelectedPlaceId;
        selectedPlaceInsetsKey = insetKey;
        const selectedPlace = visible.find((place) => place.id === nextSelectedPlaceId);
        if (selectedPlace) {
          framePlace(selectedPlace);
          cameraFocusedPlaceId = selectedPlace.id;
        } else if (previousPlaceId) {
          const stop = byId.get(selectedStopId ?? "");
          if (stop) {
            frameDestination(stop);
            cameraFocusedPlaceId = null;
          } else { fitWholeRoute(); cameraFocusedPlaceId = null; }
        }
      }
    },
    destroy() {
      clearPlaces();
      for (const listener of listeners) listener.remove();
      for (const overlay of overlays) overlay.setMap(null);
    },
  };
}
