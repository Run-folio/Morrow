import { isEditoriallyExcludedPhoto } from "./photo-editorial-exclusions.ts";
import { countryFor } from "./country-registry.ts";
import { isReusableWikimediaLicense, isWikimediaCommonsImageUrl } from "./photo-attribution.ts";

export type CachedRoutePhoto = {
  scope?: "country";
  country?: string;
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
  width?: number;
  height?: number;
  description?: string;
  captureDate?: string;
};

export type DestinationPhotoPlace = { name: string; country: string; region?: string; administrativeHierarchy?: readonly string[]; requiresPhotoCoordinates?: boolean; placeType?: string; canonicalPlaceId?: string; providerId?: string; coordinates?: readonly [number, number] | null };

export type CachedRoutePhotoSelection =
  | { kind: "photo"; photo: CachedRoutePhoto }
  | { kind: "empty" };

export type RoutePhotoLookup = {
  candidates: CachedRoutePhoto[];
  configured: boolean;
  diagnostics?: { queries: number; inspected: number; eligible: number; suitable: number; rejections: Record<string, number> };
  status: "resolved" | "no-result" | "unavailable";
};

export type RoutePhotoCandidate = {
  occurrenceIds: string[];
  cacheKey: string;
  queries: string[];
  place?: DestinationPhotoPlace;
  excludedSources?: string[];
};

/** Stable provider asset identity across thumbnail sizes and trip occurrences. */
export function routePhotoAssetIdentity(photo: Pick<CachedRoutePhoto, "sourceUrl" | "id" | "provider" | "src"> & Partial<Pick<CachedRoutePhoto, "sourceLabel">>) {
  try {
    const source = new URL(photo.sourceUrl);
    if (source.hostname === "commons.wikimedia.org" && source.pathname.startsWith("/wiki/File:")) {
      return `wikimedia:${decodeURIComponent(source.pathname.slice("/wiki/".length)).replace(/_/g, " ")}`;
    }
    if (source.hostname === "unsplash.com" && source.pathname.startsWith("/photos/")) {
      const slug = decodeURIComponent(source.pathname.split("/").filter(Boolean).at(-1) ?? "");
      const id = slug.match(/([A-Za-z0-9_-]{11})$/)?.[1] ?? slug;
      return `unsplash:${id}`;
    }
  } catch { /* Invalid source pages cannot override a provider asset ID. */ }
  return photo.id ? `${photo.provider ?? "photo"}:${photo.id}` : photo.src;
}

function excludedPhoto(excluded: readonly string[], photo: CachedRoutePhoto) {
  return excluded.includes(photo.src) || excluded.includes(routePhotoAssetIdentity(photo))
    || (photo.provider === 'wikimedia' && excluded.includes(photo.sourceUrl));
}

// Candidate rules changed: old positives predate representative-cover ranking
// and the captured-pixel editorial decisions. Re-evaluate them without touching saved trip content.
const prefix = "morrovia:route-photo:v8:";
const inFlightSelections = new Map<string, Promise<CachedRoutePhotoSelection | null>>();
const inFlightConsumers = new Map<string, Set<{ signal?: AbortSignal }>>();
type SelectionRequestOwner = { order: number; consumers: Set<{ signal?: AbortSignal }> };
// Keep completed ownership only until overlapping lookups settle. A cancelled
// newer lookup cannot block a live rejoin, or undo an already newer selection.
const selectionRequestGroups = new Map<string, {
  nextOrder: number; committedOrder: number; pending: Set<SelectionRequestOwner>;
}>();
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
  region?: string;
  administrativeHierarchy?: readonly string[];
  placeType?: string;
  coordinates?: readonly [number, number] | null;
}) {
  const canonicalPlaceId = normalizedIdentityPart(place.canonicalPlaceId);
  const providerId = normalizedIdentityPart(place.providerId);
  const name = normalizedIdentityPart(place.name);
  const country = normalizedIdentityPart(place.country);
  const coordinates = place.coordinates?.every(Number.isFinite)
    ? place.coordinates.map((value) => value.toFixed(4)).join(",")
    : "";
  const context = [name, country, normalizedIdentityPart(place.region),
    ...(place.administrativeHierarchy ?? []).map(normalizedIdentityPart),
    normalizedIdentityPart(place.placeType), coordinates].join("|");
  if (canonicalPlaceId) return `destination:canonical:${encodeURIComponent(`${canonicalPlaceId}|${context}`)}`;
  if (providerId) return `destination:provider:${encodeURIComponent(`${providerId}|${context}`)}`;
  return `destination:name:${encodeURIComponent(context)}`;
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
  if (!src || !sourceUrl || !sourceLabel || isEditoriallyExcludedPhoto(sourceUrl)) return null;

  const photo: CachedRoutePhoto = { src, sourceUrl, sourceLabel };
  if (value.scope === "country") {
    const country = typeof value.country === "string" ? countryFor(value.country) : null;
    if (!country) return null;
    photo.scope = "country"; photo.country = country.name;
  }
  if (typeof value.id === "string" && value.id.trim()) photo.id = value.id.trim();
  if (typeof value.alt === "string" && value.alt.trim()) photo.alt = value.alt.trim();
  const downloadLocation = webUrl(value.downloadLocation);
  if (downloadLocation) photo.downloadLocation = downloadLocation;
  if (value.provider === "wikimedia" || value.provider === "unsplash") photo.provider = value.provider;
  for (const field of ["author", "license"] as const) if (typeof value[field] === "string" && value[field].trim()) photo[field] = value[field].trim();
  for (const field of ["authorUrl", "licenseUrl"] as const) { const url = webUrl(value[field]); if (url) photo[field] = url; }
  if (photo.provider === "wikimedia" && (!photo.author || !photo.license || !photo.licenseUrl)) return null;
  if (photo.provider === "wikimedia") {
    const asset = new URL(photo.src), source = new URL(photo.sourceUrl);
    if (!isWikimediaCommonsImageUrl(asset.href) || source.protocol !== "https:" || source.hostname !== "commons.wikimedia.org" || !source.pathname.startsWith("/wiki/File:") || !isReusableWikimediaLicense(photo.license!, photo.licenseUrl!)) return null;
  }
  for (const field of ["width", "height"] as const) if (typeof value[field] === "number" && Number.isFinite(value[field]) && value[field] > 0) photo[field] = value[field];
  for (const field of ["description", "captureDate"] as const) if (typeof value[field] === "string" && value[field].trim()) photo[field] = value[field].trim().slice(0, 2000);
  return photo;
}

/** Retire only the failed selection for this identity; a newer valid choice survives. */
export function discardFailedRoutePhoto(cacheKey: string, src: string, storage: Storage | null = browserStorage()) {
  const failed = failedSources.get(cacheKey) ?? new Set<string>();
  failed.add(src); failedSources.set(cacheKey, failed);
  try { const cached = readRoutePhotoSelection(cacheKey, storage); if (cached?.kind === "photo" && cached.photo.src === src) storage?.removeItem(`${prefix}${cacheKey}`); } catch { /* Photos cannot block trip editing. */ }
}

function browserStorage() {
  try { return typeof window === "undefined" ? null : window.localStorage; }
  catch { return null; }
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
        if (place.region) params.set("region", place.region);
        if (place.administrativeHierarchy?.[1]) params.set("district", place.administrativeHierarchy[1]);
        if (place.canonicalPlaceId) params.set("canonicalPlaceId", place.canonicalPlaceId);
        if (place.providerId) params.set("providerId", place.providerId);
        if (place.placeType) params.set("placeType", place.placeType);
        if (place.coordinates) { params.set("lon", String(place.coordinates[0])); params.set("lat", String(place.coordinates[1])); }
        excludedSources.slice(0, 18).forEach(src => params.append("exclude", src));
      }
      const response = await fetch(`/api/journey-route-image?${params}`, { signal: signal ?? AbortSignal.timeout(30_000) });
      const value: unknown = await response.json();
      const payload = isRecord(value) ? value : null;
      const image = routePhotoFromUnknown(payload?.image);
      const candidates = Array.isArray(payload?.candidates)
        ? payload.candidates.map(routePhotoFromUnknown).filter((photo): photo is CachedRoutePhoto => Boolean(photo))
        : [];
      const usable = candidates.filter(photo => !excludedPhoto(excludedSources,photo));
      const primary = image && !excludedPhoto(excludedSources,image) ? image : usable[0];
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
    if (options.signal?.aborted) return;
    const excluded = [...new Set([...(candidate.excludedSources ?? []), ...(failedSources.get(candidate.cacheKey) ?? [])])];
    const cached = readRoutePhotoSelection(candidate.cacheKey, storage);
    const usableCache = cached?.kind === "photo" && excludedPhoto(excluded,cached.photo) ? null : cached;
    const requestKey = `${candidate.cacheKey}|${JSON.stringify(excluded)}`;
    let request = usableCache ? Promise.resolve(usableCache) : inFlightSelections.get(requestKey);
    if (!request) {
      const consumers = new Set<{ signal?: AbortSignal }>();
      inFlightConsumers.set(requestKey, consumers);
      const group = selectionRequestGroups.get(candidate.cacheKey)
        ?? { nextOrder: 0, committedOrder: 0, pending: new Set<SelectionRequestOwner>() };
      selectionRequestGroups.set(candidate.cacheKey, group);
      const owner = { order: ++group.nextOrder, consumers };
      group.pending.add(owner);
      request = (async (): Promise<CachedRoutePhotoSelection | null> => {
        const result = await findPhotos(candidate.queries, undefined, candidate.place, excluded);
        const latestLive = [...group.pending].filter(pending =>
          [...pending.consumers].some(consumer => !consumer.signal?.aborted))
          .sort((left, right) => right.order - left.order)[0];
        if (latestLive !== owner || owner.order < group.committedOrder) return null;
        const photo = result.candidates.find(photo => !excludedPhoto(excluded,photo) && !failedSources.get(candidate.cacheKey)?.has(photo.src));
        if (photo) {
          group.committedOrder = owner.order;
          const selection = { kind: "photo", photo } as const;
          saveRoutePhotoSelection(candidate.cacheKey, selection, storage);
          trackPhoto(photo);
          return selection;
        }
        if (result.status === "no-result") {
          group.committedOrder = owner.order;
          return { kind: "empty" } as const;
        }
        return null;
      })();
      inFlightSelections.set(requestKey, request);
      void request.finally(() => {
        if (inFlightSelections.get(requestKey) === request) {
          inFlightSelections.delete(requestKey);
          inFlightConsumers.delete(requestKey);
        }
        group.pending.delete(owner);
        if (!group.pending.size && selectionRequestGroups.get(candidate.cacheKey) === group) selectionRequestGroups.delete(candidate.cacheKey);
      }).catch(() => undefined);
    }
    inFlightConsumers.get(requestKey)?.add({ signal: options.signal });
    const selection = await request;
    if (selection && !options.signal?.aborted && (selection.kind !== "photo" || !failedSources.get(candidate.cacheKey)?.has(selection.photo.src))) onSelection(candidate, selection);
  }));
}

/** Fetch independently. Earlier route identities win a shared asset regardless
 * of completion order; only the displaced selection is retried. Reserved
 * (already displayed) images and repeat visits keep their existing ownership. */
export async function resolveDistinctRoutePhotoCandidates(
  candidates: readonly RoutePhotoCandidate[],
  onSelection: (candidate: RoutePhotoCandidate, selection: CachedRoutePhotoSelection) => void,
  options: Parameters<typeof resolveRoutePhotoCandidates>[2] & { reservedSources?: readonly string[] } = {},
) {
  const reserved = new Set(options.reservedSources ?? []);
  const owners = new Map<string, number>();
  const states = candidates.map(() => ({ version: 0, attempts: 0, rejected: new Set<string>(), photo: null as CachedRoutePhoto | null }));
  const keys = (photo: CachedRoutePhoto) => [routePhotoAssetIdentity(photo), photo.src,
    ...(photo.provider === "wikimedia" ? [photo.sourceUrl] : [])];
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const release = (index: number) => {
    const state = states[index]!;
    if (!state.photo) return;
    for (const key of keys(state.photo)) if (owners.get(key) === index) owners.delete(key);
    state.photo = null;
    try { storage?.removeItem(`${prefix}${candidates[index]!.cacheKey}`); } catch { /* Imagery is non-blocking. */ }
    if (!options.signal?.aborted) onSelection(candidates[index]!, { kind: "empty" });
  };
  const resolve = async (index: number): Promise<void> => {
    const candidate = candidates[index]!, state = states[index]!;
    const version = ++state.version;
    while (state.attempts++ <= candidates.length) {
      if (options.signal?.aborted || version !== state.version) return;
      const excluded = [...new Set([...(candidate.excludedSources ?? []), ...reserved, ...state.rejected,
        ...[...owners].filter(([, owner]) => owner < index).map(([key]) => key)])];
      const received: { value: CachedRoutePhotoSelection | null } = { value: null };
      await resolveRoutePhotoCandidates([{ ...candidate, excludedSources: excluded }], (_, result) => { received.value = result; }, options);
      if (options.signal?.aborted || version !== state.version) return;
      const selection = received.value;
      if (!selection) return;
      if (selection.kind === "empty") { release(index); onSelection(candidate, selection); return; }
      const photoKeys = keys(selection.photo);
      const earlier = photoKeys.some(key => reserved.has(key) || (owners.has(key) && owners.get(key)! < index));
      if (earlier) { photoKeys.forEach(key => state.rejected.add(key)); continue; }
      const displaced = [...new Set(photoKeys.flatMap(key => owners.has(key) && owners.get(key)! > index ? [owners.get(key)!] : []))];
      for (const other of displaced) {
        photoKeys.forEach(key => states[other]!.rejected.add(key));
        release(other);
      }
      state.photo = selection.photo;
      photoKeys.forEach(key => owners.set(key, index));
      onSelection(candidate, selection);
      // A ready unrelated destination never waits for this collision recovery.
      await Promise.allSettled(displaced.map(resolve));
      return;
    }
    release(index);
  };
  await Promise.allSettled(candidates.map((_, index) => resolve(index)));
}
