import { routeDestinationPhoto, routePhotoForSource, type RoutePhotoRecord } from "./route-images.ts";
import { countryFor } from "./country-registry.ts";
import { canonicalPlacePhotoCacheKey, routePhotoAssetIdentity, type CachedRoutePhoto, type DestinationPhotoPlace, type RoutePhotoCandidate } from "./route-photo-cache.ts";
import { isRepresentativeDestinationScene } from "./photo-subject.ts";
import type { EasyTTrip } from "./trip.ts";

export type DashboardTripPhoto = {
  src: string;
  alt: string;
  authorHref: string | null;
  creditHref: string | null;
  creditLabel: string | null;
  licenseHref: string | null;
  fullCreditHref: string | null;
  place: string | null;
  scope?: "country";
  country?: string;
  id?: string;
  provider?: "wikimedia" | "unsplash";
  provenance?: "reviewed-provider" | "reviewed-morrovia-first-party";
};

/** A cover depicts the first overnight destination, never the journey origin. */
export function dashboardTripCoverPlace(trip: EasyTTrip): DestinationPhotoPlace | null {
  const stop = [...trip.stops].sort((a, b) => a.order - b.order)[0];
  if (!stop) return null;
  return {
    name: stop.name, country: countryFor(stop.country)?.name ?? stop.country,
    canonicalPlaceId: stop.canonicalPlaceId, providerId: stop.providerId,
    region: stop.region, administrativeHierarchy: stop.administrativeHierarchy,
    placeType: stop.geographicBinding?.placeType,
    coordinates: stop.longitude !== null && stop.latitude !== null && Number.isFinite(stop.longitude) && Number.isFinite(stop.latitude)
      ? [stop.longitude, stop.latitude] : undefined,
  };
}

/** Each cover can seek an alternate asset without overwriting another trip's choice. */
export function dashboardTripCoverCandidate(trip: EasyTTrip, excludedSources: readonly string[] = []): RoutePhotoCandidate | null {
  const place = dashboardTripCoverPlace(trip);
  return place ? {
    cacheKey: `dashboard-cover:v1:${encodeURIComponent(trip.id)}:${canonicalPlacePhotoCacheKey(place)}`,
    occurrenceIds: [trip.id], place,
    queries: [`${place.name} ${place.country} skyline`, `${place.name} ${place.country} landscape`],
    excludedSources: [...excludedSources],
  } : null;
}

export function dashboardPhotoFromResolved(photo: CachedRoutePhoto, place?: DestinationPhotoPlace): DashboardTripPhoto {
  return {
    src: photo.src, alt: photo.alt ?? `${place?.name ?? 'Destination'} view`,
    id: photo.id, provider: photo.provider, scope: photo.scope,
    country: countryFor(photo.country ?? place?.country)?.name ?? photo.country ?? place?.country,
    authorHref: photo.authorUrl ?? null, creditHref: photo.sourceUrl,
    creditLabel: photo.sourceLabel, licenseHref: photo.licenseUrl ?? null, fullCreditHref: null,
    place: photo.scope === 'country' ? null : place?.name ?? null,
  };
}

const normalized = (text: string) => text.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
function reviewedForFirstPlace(trip: EasyTTrip, record: RoutePhotoRecord | null) {
  const place = dashboardTripCoverPlace(trip);
  // The current inventory proves only legacy place/country associations. It
  // contains no exact canonical, administrative or coordinate bindings, so a
  // selected modern identity needs the live pipeline's independent evidence.
  if (place && (place.canonicalPlaceId || place.providerId || place.region
    || place.administrativeHierarchy?.length || place.coordinates)) return false;
  return Boolean(place && record && normalized(record.place) === normalized(place.name)
    && normalized(countryFor(record.country)?.name ?? record.country) === normalized(place.country)
    && record.author && record.license && record.licenseUrl && record.sourceUrl
    && isRepresentativeDestinationScene(record.alt));
}
function fromRecord(photo: RoutePhotoRecord, src = photo.variants.at(-1)?.src): DashboardTripPhoto | null {
  if (!src) return null;
  const commons = photo.sourceUrl.includes('commons.wikimedia.org/wiki/File:');
  const unsplash = photo.sourceUrl.includes('unsplash.com/photos/');
  const sourceAsset = unsplash ? new URL(photo.sourceUrl).pathname.split('/').filter(Boolean).at(-1)?.slice(-11) : undefined;
  return {
    src, alt: photo.alt, id: commons ? decodeURIComponent(new URL(photo.sourceUrl).pathname.slice('/wiki/'.length)) : sourceAsset ?? photo.key,
    provider: commons ? 'wikimedia' : unsplash ? 'unsplash' : undefined,
    country: countryFor(photo.country)?.name ?? photo.country,
    authorHref: photo.authorUrl ?? null, creditHref: photo.sourceUrl,
    creditLabel: `${photo.author} · ${photo.license}`, licenseHref: photo.licenseUrl,
    fullCreditHref: `/journey/immersive/credits.html#${photo.key}`, place: photo.place, provenance: photo.provenance,
  };
}
function storedTripPhoto(trip: EasyTTrip): DashboardTripPhoto | null {
  const first = [...trip.stops].sort((a, b) => a.order - b.order)[0];
  for (const item of trip.planItems) {
    if (!first || item.stopId !== first.id || !item.image) continue;
    const record = routePhotoForSource(item.image);
    if (reviewedForFirstPlace(trip, record)) return fromRecord(record!, item.image);
  }
  return null;
}
export function canonicalDashboardTripPhotos(trip: EasyTTrip): DashboardTripPhoto[] {
  const place = dashboardTripCoverPlace(trip);
  const record = place ? routeDestinationPhoto(place.name, place.country) : null;
  const photo = reviewedForFirstPlace(trip, record) ? fromRecord(record!) : null;
  return photo ? [photo] : [];
}
export function dashboardTripPhoto(trip: EasyTTrip): DashboardTripPhoto | null {
  return storedTripPhoto(trip) ?? canonicalDashboardTripPhotos(trip)[0] ?? null;
}

/** Provider source pages identify assets across different thumbnail sizes. */
export function dashboardPhotoAssetIdentity(photo: DashboardTripPhoto) {
  return routePhotoAssetIdentity({ id: photo.id, provider: photo.provider, src: photo.src,
    sourceUrl: photo.creditHref ?? photo.src, sourceLabel: photo.creditLabel ?? '' });
}
export function dashboardTripPhotosForCards(trips: readonly EasyTTrip[], reservedSources: readonly string[] = []): Map<string, DashboardTripPhoto> {
  const selected = new Map<string, DashboardTripPhoto>(), used = new Set(reservedSources);
  for (const trip of trips) {
    if (trip.status === 'draft') continue;
    const candidates = [storedTripPhoto(trip), ...canonicalDashboardTripPhotos(trip)].filter((photo): photo is DashboardTripPhoto => Boolean(photo));
    const photo = candidates.find(photo => !used.has(photo.src) && !used.has(photo.creditHref ?? '') && !used.has(dashboardPhotoAssetIdentity(photo)));
    if (!photo) continue;
    selected.set(trip.id, photo); used.add(photo.src); used.add(dashboardPhotoAssetIdentity(photo));
  }
  return selected;
}
export function featuredDashboardTripPhoto(trip: EasyTTrip): DashboardTripPhoto | null {
  return dashboardTripPhoto(trip);
}
