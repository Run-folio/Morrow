export type CachedRoutePhoto = {
  id?: string;
  src: string;
  alt?: string;
  sourceUrl: string;
  sourceLabel: string;
  downloadLocation?: string;
};

const prefix = "morrovia:route-photo:";

export function readRoutePhoto(routeKey: string): CachedRoutePhoto | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(`${prefix}${routeKey}`);
    return value ? JSON.parse(value) as CachedRoutePhoto : null;
  } catch {
    return null;
  }
}

export function saveRoutePhoto(routeKey: string, photo: CachedRoutePhoto) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${prefix}${routeKey}`, JSON.stringify(photo));
  } catch {
    // Photography remains non-blocking if storage is unavailable.
  }
}

export async function findRoutePhotos(queries: string[], signal?: AbortSignal) {
  for (const query of queries.filter(Boolean)) {
    const response = await fetch(`/api/journey-route-image?query=${encodeURIComponent(query)}`, { signal });
    const payload = await response.json() as { image?: CachedRoutePhoto | null; candidates?: CachedRoutePhoto[]; configured?: boolean };
    if (response.ok && payload.image) return { candidates: payload.candidates?.length ? payload.candidates : [payload.image], configured: true };
    if (payload.configured === false || response.status === 429) return { candidates: [] as CachedRoutePhoto[], configured: payload.configured };
  }
  return { candidates: [] as CachedRoutePhoto[], configured: true };
}

export function trackRoutePhoto(photo: CachedRoutePhoto) {
  if (!photo.downloadLocation) return;
  void fetch("/api/journey-route-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ downloadLocation: photo.downloadLocation }),
  }).catch(() => undefined);
}
