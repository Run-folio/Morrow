export type CachedRoutePhoto = {
  id?: string;
  src: string;
  alt?: string;
  sourceUrl: string;
  sourceLabel: string;
  downloadLocation?: string;
};

export type CachedRoutePhotoSelection =
  | { kind: "photo"; photo: CachedRoutePhoto }
  | { kind: "empty" };

export type RoutePhotoLookup = {
  candidates: CachedRoutePhoto[];
  configured: boolean;
  status: "resolved" | "no-result" | "unavailable";
};

export type RoutePhotoCandidate = {
  occurrenceIds: string[];
  cacheKey: string;
  queries: string[];
};

const prefix = "morrovia:route-photo:";
const inFlightSelections = new Map<string, Promise<CachedRoutePhotoSelection | null>>();

function normalizedIdentityPart(value: string | undefined) {
  return value?.normalize("NFKC").trim().toLocaleLowerCase("en").replace(/\s+/g, " ") ?? "";
}

/** A destination's durable identity never depends on its position in a route. */
export function canonicalPlacePhotoCacheKey(place: {
  canonicalPlaceId?: string;
  providerId?: string;
  name: string;
  country?: string;
  coordinates?: readonly [number, number] | null;
}) {
  const canonicalPlaceId = normalizedIdentityPart(place.canonicalPlaceId);
  if (canonicalPlaceId) return `destination:canonical:${encodeURIComponent(canonicalPlaceId)}`;
  const providerId = normalizedIdentityPart(place.providerId);
  if (providerId) return `destination:provider:${encodeURIComponent(providerId)}`;
  const name = normalizedIdentityPart(place.name);
  const country = normalizedIdentityPart(place.country);
  const coordinates = place.coordinates?.every(Number.isFinite)
    ? place.coordinates.map((value) => value.toFixed(4)).join(",")
    : "";
  return `destination:name:${encodeURIComponent(`${name}|${country}|${coordinates}`)}`;
}

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

function browserStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readRoutePhotoSelection(routeKey: string, storage: Storage | null = browserStorage()): CachedRoutePhotoSelection | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(`${prefix}${routeKey}`);
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed) && parsed.kind === "empty") {
      storage.removeItem(`${prefix}${routeKey}`);
      return null;
    }
    if (isRecord(parsed) && parsed.kind === "photo") {
      const photo = routePhotoFromUnknown(parsed.photo);
      return photo ? { kind: "photo", photo } : null;
    }
    const legacyPhoto = routePhotoFromUnknown(parsed);
    return legacyPhoto ? { kind: "photo", photo: legacyPhoto } : null;
  } catch {
    return null;
  }
}

export function saveRoutePhotoSelection(routeKey: string, selection: CachedRoutePhotoSelection, storage: Storage | null = browserStorage()) {
  if (!storage) return;
  try {
    if (selection.kind === "empty") return;
    const validated = routePhotoFromUnknown(selection.photo);
    if (validated) storage.setItem(`${prefix}${routeKey}`, JSON.stringify({ kind: "photo", photo: validated }));
  } catch {
    // Photography remains non-blocking if storage is unavailable.
  }
}

export function readRoutePhoto(routeKey: string): CachedRoutePhoto | null {
  const selection = readRoutePhotoSelection(routeKey);
  return selection?.kind === "photo" ? selection.photo : null;
}

export function saveRoutePhoto(routeKey: string, photo: CachedRoutePhoto) {
  saveRoutePhotoSelection(routeKey, { kind: "photo", photo });
}

export async function findRoutePhotos(queries: string[], signal?: AbortSignal) {
  let sawNoResult = false;
  let sawUnavailable = false;
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
      if (response.ok && primary) return { candidates: candidates.length ? candidates : [primary], configured: true, status: "resolved" } satisfies RoutePhotoLookup;
      if (response.ok && payload?.reason === "no-result") sawNoResult = true;
      else sawUnavailable = true;
      if (payload?.configured === false || response.status === 429) {
        return { candidates: [], configured: payload?.configured !== false, status: "unavailable" } satisfies RoutePhotoLookup;
      }
    } catch (error) {
      // Component cleanup should still be able to end an explicitly aborted
      // request; ordinary provider/network failures simply try the next query.
      if (signal?.aborted) throw error;
      sawUnavailable = true;
    }
  }
  return {
    candidates: [],
    configured: true,
    status: sawNoResult && !sawUnavailable ? "no-result" : "unavailable",
  } satisfies RoutePhotoLookup;
}

export function trackRoutePhoto(photo: CachedRoutePhoto) {
  if (!photo.downloadLocation) return;
  void fetch("/api/journey-route-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ downloadLocation: photo.downloadLocation }),
  }).catch(() => undefined);
}

/** Resolve each identity independently so a slow or failed sibling cannot discard a valid choice. */
export async function resolveRoutePhotoCandidates(
  candidates: readonly RoutePhotoCandidate[],
  onSelection: (candidate: RoutePhotoCandidate, selection: CachedRoutePhotoSelection) => void,
  options: {
    signal?: AbortSignal;
    storage?: Storage | null;
    findPhotos?: (queries: string[], signal?: AbortSignal) => Promise<RoutePhotoLookup>;
    trackPhoto?: (photo: CachedRoutePhoto) => void;
  } = {},
) {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const findPhotos = options.findPhotos ?? findRoutePhotos;
  const trackPhoto = options.trackPhoto ?? trackRoutePhoto;
  await Promise.allSettled(candidates.map(async (candidate) => {
    const cached = readRoutePhotoSelection(candidate.cacheKey, storage);
    let request = cached ? Promise.resolve(cached) : inFlightSelections.get(candidate.cacheKey);
    if (!request) {
      request = (async (): Promise<CachedRoutePhotoSelection | null> => {
        const result = await findPhotos(candidate.queries);
        const photo = result.candidates[0];
        if (photo) {
          const selection = { kind: "photo", photo } as const;
          saveRoutePhotoSelection(candidate.cacheKey, selection, storage);
          trackPhoto(photo);
          return selection;
        }
        if (result.status === "no-result") {
          return { kind: "empty" } as const;
        }
        return null;
      })();
      inFlightSelections.set(candidate.cacheKey, request);
      void request.finally(() => {
        if (inFlightSelections.get(candidate.cacheKey) === request) inFlightSelections.delete(candidate.cacheKey);
      }).catch(() => undefined);
    }
    const selection = await request;
    if (selection && !options.signal?.aborted) onSelection(candidate, selection);
  }));
}
