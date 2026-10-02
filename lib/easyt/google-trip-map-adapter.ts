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
  getZoom?(): number | undefined;
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
export type GoogleCanvasLeg = { id: string; fromStopId: string; toStopId: string; modeLabel?: string; durationLabel?: string; routeGeometry?: Array<[number, number]> };
export type GoogleCanvasPlace = { id: string; sourceId?: string; stopId?: string | null; name: string; category: "stay" | "eat" | "see" | "custom" | "transport"; coordinates: [number, number]; state?: "result" | "saved" | "scheduled"; plannerPin?: true };
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
  onPreviewPlace?(placeId: string | null): void;
  mapId?: string;
};

export function canonicalMapStopCoordinates(canonical: [number, number] | null | undefined, projected: [number, number] | null | undefined): [number, number] | null {
  return canonical ?? projected ?? null;
}

function cameraInsetsKey(insets: GoogleMapInsets): string {
  return `${insets.top ?? 0}:${insets.right ?? 0}:${insets.bottom ?? 0}:${insets.left ?? 0}`;
}

/** The Google icon API needs fixed SVG colours; these mirror current Journey tokens. */
export function googlePlaceMarkerIcon(api: GoogleTripMapApi, category: GoogleCanvasPlace["category"], selected: boolean) {
  const size = selected ? 52 : 44;
  const center = size / 2;
  const label = category === "stay" ? "STAY" : category === "eat" ? "EAT" : category === "transport" ? "GO" : category === "custom" ? "PIN" : "SEE";
  const fill = category === "stay" ? "#3025ce" : category === "eat" ? "#d01866" : category === "transport" ? "#5446df" : "#17106f";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${center - 2}" fill="#fbfaff" stroke="${selected ? "#d01866" : "#17106f"}" stroke-width="${selected ? 4 : 2}"/><circle cx="${center}" cy="${center}" r="${center - (selected ? 8 : 5)}" fill="${fill}"/><text x="50%" y="51%" dominant-baseline="central" text-anchor="middle" fill="#fbfaff" font-family="Arial,sans-serif" font-size="${selected ? 10 : 9}" font-weight="700">${label}</text></svg>`;
  const scaledSize = api.Size ? new api.Size(size, size) : { width: size, height: size };
  const anchor = api.Point ? new api.Point(center, center) : { x: center, y: center };
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, scaledSize, anchor };
}

function googleStopMarkerIcon(api: GoogleTripMapApi, index: number, selected: boolean, origin = false) {
  const size = selected ? 48 : 40;
  const label = origin ? "↗" : String(Math.max(1, index)).padStart(2, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 3}" fill="#17106f" stroke="${selected ? "#d01866" : "#fbfaff"}" stroke-width="${selected ? 4 : 3}"/><text x="50%" y="51%" dominant-baseline="central" text-anchor="middle" fill="#fbfaff" font-family="Arial,sans-serif" font-size="${index === 0 ? 17 : 11}" font-weight="700">${label}</text></svg>`;
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, scaledSize: api.Size ? new api.Size(size, size) : { width: size, height: size } };
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
    gestureHandling: "greedy",
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
      path: leg.routeGeometry?.length
        ? leg.routeGeometry.map(([longitude, latitude]) => ({ lat: latitude, lng: longitude }))
        : [{ lat: from[1], lng: from[0] }, { lat: to[1], lng: to[0] }],
      strokeColor: "#e6006e", strokeOpacity: options.selectedStopId ? 0.12 : 0.7, strokeWeight: options.selectedStopId ? 1 : 2,
      icons: [], // schematic connection, not road directions
    });
    overlays.push(line);
    legLines.push(line);
    listeners.push(line.addListener("click", () => options.onSelectLeg(leg.id)));
  }
  let selectedStopId = options.selectedStopId;
  let selectedPlaceId: string | null = null;
  let previewedPlaceId: string | null = null;
  let cameraFocusedPlaceId: string | null = null;
  let selectedPlaceInsetsKey = "";
  let selectedStopInsetsKey = cameraInsetsKey(cameraInsets);
  let placeOverlays: Array<{ setMap(map: MapObject | null): void }> = [];
  let placeListeners: Listener[] = [];
  let previewRoots: HTMLElement[] = [];
  const previewPlace = (placeId: string | null) => {
    previewedPlaceId = placeId;
    for (const root of previewRoots) {
      root.querySelectorAll<HTMLElement>("[data-google-place-id]").forEach((button) => {
        const previewed = Boolean(placeId && button.getAttribute("data-google-place-id") === placeId);
        button.classList.toggle("is-preview", previewed);
        button.style.zIndex = previewed ? "480" : button.classList.contains("is-active") ? "500" : "100";
      });
    }
  };
  const clearPlaces = () => {
    for (const listener of placeListeners) listener.remove();
    for (const overlay of placeOverlays) overlay.setMap(null);
    placeListeners = [];
    placeOverlays = [];
    previewRoots = [];
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
        const root = element.ownerDocument.createElement("div");
        root.className = "planner-map__google-overlays";
        root.style.position = "absolute";
        root.style.inset = "0";
        root.style.pointerEvents = "none";
        // Google controls the dimensions of overlayMouseTarget panes. In some
        // live sessions that pane has a zero-height box, which clips this
        // viewport-sized root. Div-pixel projection is relative to the map
        // element, so host and clip the root at that same viewport instead.
        root.style.zIndex = "106";
        let openGroupKey = "";
        let projection: ReturnType<HtmlOverlayObject["getProjection"]> | null = null;
        previewRoots.push(root);
        const makeButton = (label: string, className: string, zIndex: number, onClick: (event: Event) => void) => {
          const button = element.ownerDocument!.createElement("button");
          button.type = "button";
          button.className = className;
          button.textContent = label;
          button.style.position = "absolute";
          button.style.zIndex = String(zIndex);
          button.style.pointerEvents = "auto";
          button.style.transform = "translate(-50%, -50%)";
          if (className.includes("planner-map__place")) {
            const size = className.includes("is-active") ? 52 : 44;
            button.style.width = `${size}px`;
            button.style.height = `${size}px`;
            if (className.includes("planner-map__place-overlap")) button.style.minWidth = "64px";
          }
          button.addEventListener("pointerdown", (event) => event.stopPropagation());
          if (className.includes("planner-map__place")) {
            button.addEventListener("pointerenter", () => { const id = button.getAttribute("data-google-place-id"); previewPlace(id); options.onPreviewPlace?.(id); });
            button.addEventListener("focus", () => { const id = button.getAttribute("data-google-place-id"); previewPlace(id); options.onPreviewPlace?.(id); });
            button.addEventListener("pointerleave", () => { previewPlace(null); options.onPreviewPlace?.(null); });
            button.addEventListener("blur", () => { previewPlace(null); options.onPreviewPlace?.(null); });
          }
          button.addEventListener("click", onClick);
          return button;
        };
        const render = () => {
          if (!projection || !root.replaceChildren) return;
          root.replaceChildren();
          const zoom = map.getZoom?.() ?? 12;
          const localResults = visible.filter((place) => place.id === nextSelectedPlaceId || zoom > 6 || place.id.startsWith("google-poi:") || place.plannerPin || place.state === "saved" || place.state === "scheduled");
          const projected = localResults.map((place) => ({ place, pixel: projection!.fromLatLngToDivPixel(new api.LatLng!(place.coordinates[1], place.coordinates[0])) }))
            .filter((record): record is { place: GoogleCanvasPlace; pixel: { x: number; y: number } } => record.pixel !== null);
          const groups: Array<{ records: typeof projected; anchor: { x: number; y: number } }> = [];
          for (const record of projected) {
            const group = groups.find((candidate) => candidate.records.some((member) => Math.hypot(record.pixel.x - member.pixel.x, record.pixel.y - member.pixel.y) < 44));
            if (group) group.records.push(record);
            else groups.push({ records: [record], anchor: record.pixel });
          }
          for (const group of groups) {
            const groupKey = group.records.map(({ place }) => place.id).sort().join("|");
            const selected = group.records.find(({ place }) => place.id === nextSelectedPlaceId)?.place;
            if (group.records.length === 1) {
              const place = group.records[0]!.place;
              const active = place.id === nextSelectedPlaceId;
              const label = place.category === "stay" ? "Stay" : place.category === "eat" ? "Eat" : place.category === "transport" ? "Transport" : place.category === "custom" ? "Pin" : "See";
              const previewed = place.id === previewedPlaceId;
              const button = makeButton(label, `planner-map__place planner-map__place--${place.category}${active ? " is-active" : ""}${previewed ? " is-preview" : ""}`, active ? 500 : previewed ? 480 : 100, (event) => { event.stopPropagation(); options.onSelectPlace?.(place.id); });
              button.setAttribute("aria-label", `${place.name} · ${label}`);
              button.setAttribute("aria-pressed", String(active));
              button.setAttribute("data-google-place-id", place.id);
              button.title = place.name;
              button.style.left = `${group.anchor.x}px`;
              button.style.top = `${group.anchor.y}px`;
              root.append(button);
              if (place.id === focusedPlaceId) button.focus({ preventScroll: true });
              continue;
            }
            const category = selected?.category ?? group.records[0]!.place.category;
            const label = category === "stay" ? "Stay" : category === "eat" ? "Eat" : category === "transport" ? "Transport" : category === "custom" ? "Pin" : "See";
            const overlap = makeButton(`${label} +${group.records.length - 1}`, `planner-map__place planner-map__place--${category} planner-map__place-overlap${selected ? " is-active" : ""}`, selected ? 500 : 100, (event) => {
              event.stopPropagation();
              openGroupKey = openGroupKey === groupKey ? "" : groupKey;
              render();
            });
            overlap.setAttribute("aria-label", `Choose from ${group.records.length} overlapping places`);
            overlap.setAttribute("aria-expanded", String(openGroupKey === groupKey));
            overlap.style.left = `${group.anchor.x}px`;
            overlap.style.top = `${group.anchor.y}px`;
            root.append(overlap);
            if (openGroupKey === groupKey) {
              const choices = element.ownerDocument!.createElement("div");
              choices.className = "planner-map__place-choices";
              choices.style.position = "absolute";
              choices.style.left = `${group.anchor.x}px`;
              choices.style.top = `${group.anchor.y + 28}px`;
              choices.style.zIndex = "550";
              choices.style.pointerEvents = "auto";
              for (const { place } of group.records) {
                const option = element.ownerDocument!.createElement("button");
                option.type = "button";
                option.textContent = `${place.name} · ${place.category}`;
                option.setAttribute("data-google-place-id", place.id);
                option.addEventListener("click", (event) => { event.stopPropagation(); openGroupKey = ""; options.onSelectPlace?.(place.id); });
                choices.append(option);
                if (place.id === focusedPlaceId) option.focus({ preventScroll: true });
              }
              root.append(choices);
            }
          }
          // Transfer badges stay tied to their canonical endpoint geometry. They
          // are schematic context, not a claim about a navigable road route.
          for (const leg of options.legs) {
            if (!leg.modeLabel && !leg.durationLabel) continue;
            const from = byId.get(leg.fromStopId)?.coordinates;
            const to = byId.get(leg.toStopId)?.coordinates;
            if (!from || !to) continue;
            const geometry = leg.routeGeometry?.length ? leg.routeGeometry : [from, to];
            const midpoint = geometry.length % 2
              ? geometry[Math.floor(geometry.length / 2)]!
              : [
                  (geometry[geometry.length / 2 - 1]![0] + geometry[geometry.length / 2]![0]) / 2,
                  (geometry[geometry.length / 2 - 1]![1] + geometry[geometry.length / 2]![1]) / 2,
                ] as [number, number];
            const pixel = projection!.fromLatLngToDivPixel(new api.LatLng!(midpoint[1], midpoint[0]));
            if (!pixel) continue;
            const label = [leg.modeLabel, leg.durationLabel].filter(Boolean).join(" · ");
            const badge = makeButton(label, "planner-map__leg-badge", 600, (event) => {
              event.stopPropagation();
              options.onSelectLeg(leg.id);
            });
            badge.setAttribute("aria-label", `${leg.modeLabel ?? "Transfer"} · ${leg.durationLabel ?? "Timing to confirm"}; view transfer details`);
            badge.setAttribute("data-google-leg-id", leg.id);
            badge.style.left = `${pixel.x}px`;
            badge.style.top = `${pixel.y}px`;
            badge.style.transform = "translate(-50%, -50%)";
            root.append(badge);
          }
          // Transparent hit targets sit above nearby result pins, so the visible route marker
          // always selects its canonical stop when a hotel overlaps it.
          const routePoints = mappedStops.map((stop) => ({ stop, pixel: projection!.fromLatLngToDivPixel(new api.LatLng!(stop.coordinates[1], stop.coordinates[0])) }))
            .filter((record): record is { stop: typeof mappedStops[number]; pixel: { x: number; y: number } } => record.pixel !== null);
          const stopGroups = new Map<string, typeof routePoints>();
          for (const record of routePoints) {
            const key = `${record.pixel.x},${record.pixel.y}`;
            stopGroups.set(key, [...(stopGroups.get(key) ?? []), record]);
          }
          for (const records of stopGroups.values()) {
            const { stop, pixel } = records[0]!;
            const hit = makeButton("", "planner-map__google-stop-hit", 700, (event) => { event.stopPropagation(); options.onSelectStop(stop.id); });
            hit.setAttribute("aria-label", `Select ${stop.name}, stop ${stop.sequence ?? records[0]!.stop.sequence ?? 1}`);
            hit.setAttribute("data-google-stop-id", stop.id);
            hit.style.left = `${pixel.x}px`;
            hit.style.top = `${pixel.y}px`;
            hit.style.width = "52px";
            hit.style.height = "52px";
            hit.style.padding = "0";
            hit.style.border = "0";
            hit.style.background = "transparent";
            root.append(hit);
          }
        };
        const marker = new class extends OverlayView {
          onAdd() { element.append(root); }
          draw() { projection = this.getProjection(); render(); }
          onRemove() { root.remove(); }
        }();
        placeOverlays.push(marker);
        marker.setMap(map);
        const zoomListener = map.addListener("zoom_changed", render);
        placeListeners.push(zoomListener);
      } else {
        for (const place of visible) {
          if (place.id !== nextSelectedPlaceId && (map.getZoom?.() ?? 12) <= 6 && !place.id.startsWith("google-poi:") && !place.plannerPin && place.state !== "saved" && place.state !== "scheduled") continue;
          const selected = place.id === nextSelectedPlaceId;
          const marker = new api.Marker({ map, position: { lat: place.coordinates[1], lng: place.coordinates[0] }, title: `${place.name} · ${place.category}`, icon: googlePlaceMarkerIcon(api, place.category, selected), optimized: false, zIndex: selected ? 150 : 100 });
          placeOverlays.push(marker);
          placeListeners.push(marker.addListener("click", () => options.onSelectPlace?.(place.id)));
          placeListeners.push(marker.addListener("mouseover", () => { previewedPlaceId = place.id; options.onPreviewPlace?.(place.id); if (!selected) marker.setIcon?.(googlePlaceMarkerIcon(api, place.category, true)); }));
          placeListeners.push(marker.addListener("mouseout", () => { previewedPlaceId = null; options.onPreviewPlace?.(null); if (!selected) marker.setIcon?.(googlePlaceMarkerIcon(api, place.category, false)); }));
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
          const isNativeSelection = selectedPlace.id.startsWith("google-poi:");
          if (!isNativeSelection && (map.getZoom?.() ?? 12) < 9) map.setZoom(12);
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
    previewPlace,
    destroy() {
      clearPlaces();
      for (const listener of listeners) listener.remove();
      for (const overlay of overlays) overlay.setMap(null);
    },
  };
}
