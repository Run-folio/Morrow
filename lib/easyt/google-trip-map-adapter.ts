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
  fitBounds?(bounds: unknown, padding?: number): void;
};
type OverlayObject = { addListener(name: string, callback: () => void): Listener; setMap(map: MapObject | null): void };

export type GoogleTripMapApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapObject;
  Marker: new (options: Record<string, unknown>) => OverlayObject;
  Polyline: new (options: Record<string, unknown>) => OverlayObject;
};
export type GoogleCanvasStop = { id: string; name: string; coordinates: [number, number] | null };
export type GoogleCanvasLeg = { id: string; fromStopId: string; toStopId: string };
export type GoogleTripMapOptions = {
  stops: readonly GoogleCanvasStop[];
  legs: readonly GoogleCanvasLeg[];
  selectedStopId: string | null;
  onNativePoi(placeId: string): void;
  onEmptyClick(point: [number, number]): void;
  onSelectStop(stopId: string): void;
  onSelectLeg(legId: string): void;
  mapId?: string;
};

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
  const click = map.addListener("click", (event) => {
    if (typeof event.placeId === "string" && event.placeId.trim()) {
      event.stop?.();
      options.onNativePoi(event.placeId);
    } else if (event.latLng) {
      options.onEmptyClick([event.latLng.lng(), event.latLng.lat()]);
    }
  });
  const overlays: OverlayObject[] = [];
  const listeners: Listener[] = [click];
  for (const stop of mappedStops) {
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
  return {
    update(next: { selectedStopId: string | null }) {
      if (next.selectedStopId === selectedStopId) return;
      selectedStopId = next.selectedStopId;
      const stop = byId.get(next.selectedStopId ?? "");
      if (stop) { map.setCenter({ lat: stop.coordinates[1], lng: stop.coordinates[0] }); map.setZoom(9); }
    },
    destroy() {
      for (const listener of listeners) listener.remove();
      for (const overlay of overlays) overlay.setMap(null);
    },
  };
}
