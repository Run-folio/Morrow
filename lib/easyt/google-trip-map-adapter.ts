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
  fitBounds?(bounds: unknown, padding?: number): void;
};
type OverlayObject = { addListener(name: string, callback: () => void): Listener; setMap(map: MapObject | null): void; setIcon?(icon: unknown): void };
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
export type GoogleCanvasStop = { id: string; name: string; coordinates: [number, number] | null };
export type GoogleCanvasLeg = { id: string; fromStopId: string; toStopId: string };
export type GoogleCanvasPlace = { id: string; name: string; category: "stay" | "eat" | "see"; coordinates: [number, number] };
export type GoogleTripMapOptions = {
  stops: readonly GoogleCanvasStop[];
  legs: readonly GoogleCanvasLeg[];
  selectedStopId: string | null;
  onNativePoi(placeId: string, coordinates?: [number, number]): boolean | void;
  onEmptyClick(point: [number, number]): void;
  onSelectStop(stopId: string): void;
  onSelectLeg(legId: string): void;
  onSelectPlace?(placeId: string): void;
  mapId?: string;
};

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
  const map = new api.Map(element, {
    center: selected ? { lat: selected.coordinates[1], lng: selected.coordinates[0] } : { lat: 0, lng: 0 },
    zoom: selected ? 9 : 2,
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
    if (bounds.north !== bounds.south || bounds.east !== bounds.west) map.fitBounds?.(bounds, 48);
  };
  if (!options.selectedStopId) fitWholeRoute();
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
  const occupiedMarkerCoordinates = new Set<string>();
  for (const stop of mappedStops) {
    const coordinateKey = stop.coordinates.join(",");
    // One map hit area per exact point. The shared destination strip retains
    // direct access to every canonical occurrence at a coincident location.
    if (occupiedMarkerCoordinates.has(coordinateKey)) continue;
    occupiedMarkerCoordinates.add(coordinateKey);
    const marker = new api.Marker({ map, position: { lat: stop.coordinates[1], lng: stop.coordinates[0] }, title: stop.name });
    overlays.push(marker);
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
      strokeColor: "#e6006e", strokeOpacity: 0.7, strokeWeight: 2,
      icons: [], // schematic connection, not road directions
    });
    overlays.push(line);
    listeners.push(line.addListener("click", () => options.onSelectLeg(leg.id)));
  }
  let selectedStopId = options.selectedStopId;
  let selectedPlaceId: string | null = null;
  let selectedFocusInset = 0;
  let placeOverlays: Array<{ setMap(map: MapObject | null): void }> = [];
  let placeListeners: Listener[] = [];
  const clearPlaces = () => {
    for (const listener of placeListeners) listener.remove();
    for (const overlay of placeOverlays) overlay.setMap(null);
    placeListeners = [];
    placeOverlays = [];
  };
  return {
    update(next: { selectedStopId: string | null }) {
      if (next.selectedStopId === selectedStopId) return;
      selectedStopId = next.selectedStopId;
      const stop = byId.get(next.selectedStopId ?? "");
      if (stop) { map.setCenter({ lat: stop.coordinates[1], lng: stop.coordinates[0] }); map.setZoom(9); }
      else if (!next.selectedStopId) fitWholeRoute();
    },
    updatePlaces(places: readonly GoogleCanvasPlace[], nextSelectedPlaceId: string | null = null, temporaryPlace?: GoogleCanvasPlace | null, focusInset = 0) {
      const focusedPlaceId = element.ownerDocument?.activeElement?.getAttribute("data-google-place-id");
      clearPlaces();
      const visible = [...places];
      if (temporaryPlace && !visible.some((place) => place.id === temporaryPlace.id)) visible.push(temporaryPlace);
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
        const OverlayView = api.OverlayView;
        if (OverlayView && api.LatLng && element.ownerDocument) {
          const button = element.ownerDocument.createElement("button");
          button.type = "button";
          button.className = `planner-map__place planner-map__place--${place.category}${selected ? " is-active" : ""}`;
          button.textContent = place.category === "stay" ? "Stay" : place.category === "eat" ? "Eat" : "See";
          button.setAttribute("aria-label", `${place.name} · ${button.textContent}`);
          button.setAttribute("aria-pressed", String(selected));
          button.setAttribute("data-google-place-id", place.id);
          button.title = place.name;
          button.style.position = "absolute";
          button.style.zIndex = selected ? "2" : "1";
          button.addEventListener("pointerdown", (event) => event.stopPropagation());
          button.addEventListener("click", (event) => { event.stopPropagation(); options.onSelectPlace?.(place.id); });
          const point = new api.LatLng(place.coordinates[1], place.coordinates[0]);
          const marker = new class extends OverlayView {
            onAdd() { this.getPanes()?.overlayMouseTarget.append(button); }
            draw() {
              const pixel = this.getProjection().fromLatLngToDivPixel(point);
              if (pixel) {
                button.style.left = `${pixel.x + offset[0]}px`;
                button.style.top = `${pixel.y + offset[1]}px`;
              }
            }
            onRemove() { button.remove(); }
          }();
          marker.setMap(map);
          placeOverlays.push(marker);
          if (place.id === focusedPlaceId) button.focus({ preventScroll: true });
          continue;
        }
        const marker = new api.Marker({
          map,
          position: { lat: place.coordinates[1], lng: place.coordinates[0] },
          title: `${place.name} · ${place.category === "stay" ? "Stay" : place.category === "eat" ? "Eat" : "See"}`,
          icon: googlePlaceMarkerIcon(api, place.category, selected, offset),
          optimized: false,
          zIndex: selected ? 1000 : 100,
        });
        placeOverlays.push(marker);
        placeListeners.push(marker.addListener("click", () => options.onSelectPlace?.(place.id)));
        placeListeners.push(marker.addListener("mouseover", () => { if (!selected) marker.setIcon?.(googlePlaceMarkerIcon(api, place.category, true, offset)); }));
        placeListeners.push(marker.addListener("mouseout", () => { if (!selected) marker.setIcon?.(googlePlaceMarkerIcon(api, place.category, false, offset)); }));
      }
      if (nextSelectedPlaceId !== selectedPlaceId || (nextSelectedPlaceId && focusInset !== selectedFocusInset)) {
        selectedPlaceId = nextSelectedPlaceId;
        selectedFocusInset = focusInset;
        const selected = visible.find((place) => place.id === nextSelectedPlaceId);
        if (selected) {
          map.panTo?.({ lat: selected.coordinates[1], lng: selected.coordinates[0] });
          if (focusInset > 0) map.panBy?.(-Math.round(focusInset / 2), 0);
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
