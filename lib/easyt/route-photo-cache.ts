export type CachedRoutePhoto = {
  id?: string;
  src: string;
  alt?: string;
  sourceUrl: string;
  sourceLabel: string;
  downloadLocation?: string;
  provider?: "wikimedia" | "unsplash";
  author?: string;
  authorUrl?: string;
  license?: string;
  licenseUrl?: string;
};

export type DestinationPhotoPlace = { name: string; country: string; canonicalPlaceId?: string; providerId?: string; coordinates?: readonly [number, number] | null };

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
  place?: DestinationPhotoPlace;
  excludedSources?: string[];
};

const prefix = "morrovia:route-photo:";
const inFlightSelections = new Map<string, Promise<CachedRoutePhotoSelection | null>>();
const failedSources = new Map<string, Set<string>>();

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
  if (value.provider === "wikimedia" || value.provider === "unsplash") photo.provider = value.provider;
  for (const field of ["author", "license"] as const) if (typeof value[field] === "string" && value[field].trim()) photo[field] = value[field].trim();
  for (const field of ["authorUrl", "licenseUrl"] as const) { const url = webUrl(value[field]); if (url) photo[field] = url; }
  if (photo.provider === "wikimedia" && (!photo.author || !photo.license || !photo.licenseUrl)) return null;
  if (photo.provider === "wikimedia") {
    const asset = new URL(photo.src), source = new URL(photo.sourceUrl), license = new URL(photo.licenseUrl!);
    if (asset.protocol !== "https:" || asset.hostname !== "upload.wikimedia.org" || source.protocol !== "https:" || source.hostname !== "commons.wikimedia.org" || !source.pathname.startsWith("/wiki/File:") || license.protocol !== "https:" || !["creativecommons.org", "www.creativecommons.org"].includes(license.hostname)) return null;
  }
  return photo;
}

/** Retire only the failed selection for this identity; a newer valid choice survives. */
export function discardFailedRoutePhoto(cacheKey: string, src: string, storage: Storage | null = browserStorage()) {
  const failed = failedSources.get(cacheKey) ?? new Set<string>();
  failed.add(src); failedSources.set(cacheKey, failed);
  try { const cached = readRoutePhotoSelection(cacheKey, storage); if (cached?.kind === "photo" && cached.photo.src === src) storage?.removeItem(`${prefix}${cacheKey}`); } catch { /* Photos cannot block trip editing. */ }
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

export async function findRoutePhotos(queries: string[], signal?: AbortSignal, place?: DestinationPhotoPlace, excludedSources: readonly string[] = []) {
  let sawNoResult = false;
  let sawUnavailable = false;
  for (const query of place ? queries.filter(Boolean).slice(0, 1) : queries.filter(Boolean)) {
    try {
      // A gallery request must never leave a card in a permanent loading state.
      const params = new URLSearchParams({ query });
      if (place) {
        params.set("place", place.name); params.set("country", place.country);
        if (place.coordinates) { params.set("lon", String(place.coordinates[0])); params.set("lat", String(place.coordinates[1])); }
        excludedSources.slice(0, 3).forEach(src => params.append("exclude", src));
      }
      const response = await fetch(`/api/journey-route-image?${params}`, { signal: signal ?? AbortSignal.timeout(15_000) });
      const value: unknown = await response.json();
      const payload = isRecord(value) ? value : null;
      const image = routePhotoFromUnknown(payload?.image);
      const candidates = Array.isArray(payload?.candidates)
        ? payload.candidates.map(routePhotoFromUnknown).filter((photo): photo is CachedRoutePhoto => Boolean(photo))
        : [];
      const usable = candidates.filter(photo => !excludedSources.includes(photo.src));
      const primary = image && !excludedSources.includes(image.src) ? image : usable[0];
      if (response.ok && primary) return { candidates: usable.length ? usable : [primary], configured: true, status: "resolved" } satisfies RoutePhotoLookup;
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
    findPhotos?: (queries: string[], signal?: AbortSignal, place?: DestinationPhotoPlace, excludedSources?: readonly string[]) => Promise<RoutePhotoLookup>;
    trackPhoto?: (photo: CachedRoutePhoto) => void;
  } = {},
) {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const findPhotos = options.findPhotos ?? findRoutePhotos;
  const trackPhoto = options.trackPhoto ?? trackRoutePhoto;
  await Promise.allSettled(candidates.map(async (candidate) => {
    const excluded = [...new Set([...(candidate.excludedSources ?? []), ...(failedSources.get(candidate.cacheKey) ?? [])])];
    const cached = readRoutePhotoSelection(candidate.cacheKey, storage);
    const usableCache = cached?.kind === "photo" && excluded.includes(cached.photo.src) ? null : cached;
    const requestKey = `${candidate.cacheKey}|${JSON.stringify(excluded)}`;
    let request = usableCache ? Promise.resolve(usableCache) : inFlightSelections.get(requestKey);
    if (!request) {
      request = (async (): Promise<CachedRoutePhotoSelection | null> => {
        const result = await findPhotos(candidate.queries, undefined, candidate.place, excluded);
        const photo = result.candidates.find(photo => !excluded.includes(photo.src) && !failedSources.get(candidate.cacheKey)?.has(photo.src));
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
      inFlightSelections.set(requestKey, request);
      void request.finally(() => {
        if (inFlightSelections.get(requestKey) === request) inFlightSelections.delete(requestKey);
      }).catch(() => undefined);
    }
    const selection = await request;
    if (selection && !options.signal?.aborted && (selection.kind !== "photo" || !failedSources.get(candidate.cacheKey)?.has(selection.photo.src))) onSelection(candidate, selection);
  }));
}
