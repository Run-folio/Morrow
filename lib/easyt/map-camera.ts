export type MapCameraCenter = { lng: number; lat: number };

export type MapCamera = {
  easeTo: (options: {
    center: [number, number];
    zoom: number;
    offset?: [number, number];
    duration: number;
  }) => unknown;
  fitBounds: (bounds: unknown, options: Record<string, unknown>) => unknown;
  getCenter: () => MapCameraCenter;
  getZoom: () => number;
  stop: () => unknown;
};

export function prefersReducedMapMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function shortestLongitudeDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

export function mapFocusDuration(
  camera: Pick<MapCamera, "getCenter" | "getZoom">,
  target: [number, number],
  targetZoom: number,
  reducedMotion = prefersReducedMapMotion(),
) {
  if (reducedMotion) return 0;
  const current = camera.getCenter();
  const longitudeDelta = shortestLongitudeDelta(current.lng, target[0]);
  const latitudeDelta = target[1] - current.lat;
  const geographicDistance = Math.hypot(longitudeDelta, latitudeDelta);
  const zoomDistance = Math.abs(targetZoom - camera.getZoom());

  if (geographicDistance <= 1 && zoomDistance <= 1.5) return 260;
  if (geographicDistance <= 8 && zoomDistance <= 3) return 340;
  if (geographicDistance <= 45 && zoomDistance <= 6) return 460;
  return 600;
}

export function interruptMapCamera(camera: Pick<MapCamera, "stop"> | null | undefined) {
  camera?.stop();
}

export function focusMapCamera(
  camera: MapCamera,
  options: { center: [number, number]; zoom: number; offset?: [number, number]; duration?: number },
) {
  const duration = options.duration ?? mapFocusDuration(camera, options.center, options.zoom);
  camera.stop();
  camera.easeTo({ ...options, duration });
  return duration;
}

export function fitMapCamera(
  camera: Pick<MapCamera, "fitBounds" | "stop">,
  bounds: unknown,
  options: Record<string, unknown> = {},
  reducedMotion = prefersReducedMapMotion(),
) {
  const duration = reducedMotion ? 0 : 460;
  camera.stop();
  camera.fitBounds(bounds, { ...options, duration });
  return duration;
}
