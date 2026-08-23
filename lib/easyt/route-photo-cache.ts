export type CachedRoutePhoto = {
  id?: string;
  src: string;
  alt?: string;
  sourceUrl: string;
  sourceLabel: string;
  downloadLocation?: string;
};

const prefix = "morrovia:route-photo:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function webUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value.trim() : null;
  } catch {
    return null;
  }
}

/** Parse untrusted browser or provider data before it reaches image styles/links. */
export function routePhotoFromUnknown(value: unknown): CachedRoutePhoto | null {
  if (!isRecord(value)) return null;
  const src = webUrl(value.src);
  const sourceUrl = webUrl(value.sourceUrl);
  const sourceLabel = typeof value.sourceLabel === "string" ? value.sourceLabel.trim() : "";
  if (!src || !sourceUrl || !sourceLabel) return null;

  const photo: CachedRoutePhoto = { src, sourceUrl, sourceLabel };
  if (typeof value.id === "string" && value.id.trim()) photo.id = value.id.trim();
  if (typeof value.alt === "string" && value.alt.trim()) photo.alt = value.alt.trim();
  const downloadLocation = webUrl(value.downloadLocation);
  if (downloadLocation) photo.downloadLocation = downloadLocation;
  return photo;
}

export function readRoutePhoto(routeKey: string): CachedRoutePhoto | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(`${prefix}${routeKey}`);
    return value ? routePhotoFromUnknown(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

export function saveRoutePhoto(routeKey: string, photo: CachedRoutePhoto) {
  if (typeof window === "undefined") return;
  try {
    const validated = routePhotoFromUnknown(photo);
    if (validated) window.localStorage.setItem(`${prefix}${routeKey}`, JSON.stringify(validated));
  } catch {
    // Photography remains non-blocking if storage is unavailable.
  }
}

export async function findRoutePhotos(queries: string[], signal?: AbortSignal) {
  for (const query of queries.filter(Boolean)) {
    try {
      // A gallery request must never leave a card in a permanent loading state.
      const response = await fetch(`/api/journey-route-image?query=${encodeURIComponent(query)}`, { signal: signal ?? AbortSignal.timeout(10_000) });
      const value: unknown = await response.json();
      const payload = isRecord(value) ? value : null;
      const image = routePhotoFromUnknown(payload?.image);
      const candidates = Array.isArray(payload?.candidates)
        ? payload.candidates.map(routePhotoFromUnknown).filter((photo): photo is CachedRoutePhoto => Boolean(photo))
        : [];
      const primary = image ?? candidates[0];
      if (response.ok && primary) return { candidates: candidates.length ? candidates : [primary], configured: true };
      if (payload?.configured === false || response.status === 429) {
        return { candidates: [] as CachedRoutePhoto[], configured: payload?.configured !== false };
      }
    } catch (error) {
      // Component cleanup should still be able to end an explicitly aborted
      // request; ordinary provider/network failures simply try the next query.
      if (signal?.aborted) throw error;
    }
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
