import { mediaImagesForExactDestination } from "./itinerary-media.ts";
import { curatedStopFor } from "./curated-route-knowledge.ts";
import { findCatalogPlaceById, findCatalogPlacesByPhrase } from "./place-catalog.ts";
import { routeFamilyByKey } from "./route-catalog.ts";
import { routeDestinationPhoto, routeImageCredit, type RoutePhotoRecord } from "./route-images.ts";
import { routeStopPhoto } from "./route-stop-photography.ts";
import type { EasyTTrip, TripStop } from "./trip.ts";
import type { CachedRoutePhoto } from "./route-photo-cache.ts";

export type OverviewPlaceImage = {
  src: string;
  alt: string;
  author?: string;
  authorUrl?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  licenseUrl?: string;
  license?: string;
  fullCreditUrl?: string;
  provenance?: "reviewed-provider" | "reviewed-morrovia-first-party";
};

export function resolvedOverviewPhoto(photo: CachedRoutePhoto): OverviewPlaceImage {
  return { src: photo.src, alt: photo.alt ?? "Destination view", sourceUrl: photo.sourceUrl, sourceLabel: photo.sourceLabel,
    author: photo.author, authorUrl: photo.authorUrl, license: photo.license, licenseUrl: photo.licenseUrl };
}

function reviewedPhotoImage(photo: RoutePhotoRecord | null): OverviewPlaceImage | null {
  const src = photo?.variants.at(-1)?.src;
  return photo && src ? {
    src,
    alt: photo.alt,
    author: photo.author,
    ...(photo.authorUrl ? { authorUrl: photo.authorUrl } : {}),
    sourceUrl: photo.sourceUrl,
    sourceLabel: `${photo.author} · ${photo.license}`,
    licenseUrl: photo.licenseUrl,
    license: photo.license,
    fullCreditUrl: `/journey/immersive/credits.html#${photo.key}`,
    provenance: photo.provenance,
  } : null;
}

function canonicalPlace(place: { name: string; country?: string; canonicalPlaceId?: string }) {
  const byId = place.canonicalPlaceId ? findCatalogPlaceById(place.canonicalPlaceId) : undefined;
  const byAlias = findCatalogPlacesByPhrase(place.name).find((entry) => (
    !place.country || entry.parentCountries.some((country) => country.toLocaleLowerCase() === place.country?.toLocaleLowerCase())
  ));
  const canonical = byId ?? byAlias;
  return canonical
    ? { name: canonical.canonicalName, country: canonical.parentCountries[0] ?? place.country ?? "" }
    : { name: place.name, country: place.country ?? "" };
}

/** Deterministic, render-time image truth for a canonical destination. */
export function overviewPlaceImage(place: { name: string; country?: string; canonicalPlaceId?: string }, unavailableSources: ReadonlySet<string> = new Set()): OverviewPlaceImage | null {
  const canonical = canonicalPlace(place);
  const reviewed = reviewedPhotoImage(routeDestinationPhoto(canonical.name, canonical.country));
  if (reviewed && !unavailableSources.has(reviewed.src)) return reviewed;
  return null;
}

/** Persisted trip truth wins, followed by reviewed route/destination imagery and a stable local fallback. */
export function overviewStopImage(trip: EasyTTrip, stop: TripStop, unavailableSources: ReadonlySet<string> = new Set()): OverviewPlaceImage | null {
  const days = [...trip.planItems]
    .sort((left, right) => left.dayNumber - right.dayNumber)
    .filter((item) => item.stopId === stop.id);
  const imagedDay = days.find((item) => Boolean(item.image) && !unavailableSources.has(item.image!));
  if (imagedDay?.image) {
    const credit = routeImageCredit(imagedDay.image);
    return {
      src: imagedDay.image,
      alt: credit?.alt ?? imagedDay.title,
      ...(credit?.author ? { author: credit.author } : {}),
      ...(credit?.authorUrl ? { authorUrl: credit.authorUrl } : {}),
      sourceUrl: credit?.sourceUrl ?? imagedDay.sourceUrl ?? undefined,
      sourceLabel: credit?.sourceLabel ?? (imagedDay.sourceUrl ? "Photo source" : undefined),
      licenseUrl: credit?.licenseUrl,
      ...(credit?.license ? { license: credit.license } : {}),
      fullCreditUrl: credit?.fullCreditUrl,
      provenance: credit?.provenance,
    };
  }

  const route = trip.brief.sourceRouteKey ? routeFamilyByKey[trip.brief.sourceRouteKey] : undefined;
  const curatedStop = curatedStopFor(trip.brief.curatedRoute, stop.id);
  const canonical = canonicalPlace({
    name: curatedStop?.name ?? stop.name,
    country: curatedStop?.country ?? stop.country,
    canonicalPlaceId: curatedStop?.canonicalPlaceId ?? stop.canonicalPlaceId,
  });
  const reviewed = route ? routeStopPhoto(route, canonical) : routeDestinationPhoto(canonical.name, canonical.country);
  const reviewedImage = reviewedPhotoImage(reviewed);
  if (reviewedImage && !unavailableSources.has(reviewedImage.src)) return reviewedImage;

  const day = days[0];
  if (!day) return null;
  const catalog = findCatalogPlacesByPhrase(canonical.name).find(entry => entry.parentCountries.includes(canonical.country));
  const local = catalog ? mediaImagesForExactDestination(canonical.name).find(image => !unavailableSources.has(image.src)) : null;
  return local ? {
    src: local.src,
    alt: local.alt,
    sourceUrl: local.sourceUrl,
    sourceLabel: local.sourceLabel ?? "Photo source",
  } : null;
}

/** The whole-trip cover depicts its first overnight occurrence, never an endpoint or a later stop. */
export function tripCoverImage(trip: EasyTTrip, unavailableSources: ReadonlySet<string> = new Set()): OverviewPlaceImage | null {
  const firstDestination = [...trip.stops].sort((left, right) => left.order - right.order)[0];
  return firstDestination ? overviewStopImage(trip, firstDestination, unavailableSources) : null;
}
