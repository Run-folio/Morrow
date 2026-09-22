import { mediaImagesFor } from "./itinerary-media.ts";
import { curatedStopFor } from "./curated-route-knowledge.ts";
import { findCatalogPlaceById, findCatalogPlacesByPhrase } from "./place-catalog.ts";
import { routeFamilyByKey } from "./route-catalog.ts";
import { routeDestinationPhoto, routeImageCredit, type RoutePhotoRecord } from "./route-images.ts";
import { routeStopPhoto } from "./route-stop-photography.ts";
import type { EasyTTrip, TripStop } from "./trip.ts";

export type OverviewPlaceImage = {
  src: string;
  alt: string;
  sourceUrl?: string;
  sourceLabel?: string;
  licenseUrl?: string;
  fullCreditUrl?: string;
};

function reviewedPhotoImage(photo: RoutePhotoRecord | null): OverviewPlaceImage | null {
  const src = photo?.variants.at(-1)?.src;
  return photo && src ? {
    src,
    alt: photo.alt,
    sourceUrl: photo.sourceUrl,
    sourceLabel: `${photo.author} · ${photo.license}`,
    licenseUrl: photo.licenseUrl,
    fullCreditUrl: `/journey/immersive/credits.html#${photo.key}`,
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
export function overviewPlaceImage(place: { name: string; country?: string; canonicalPlaceId?: string }): OverviewPlaceImage | null {
  const canonical = canonicalPlace(place);
  return reviewedPhotoImage(routeDestinationPhoto(canonical.name, canonical.country));
}

/** Persisted trip truth wins, followed by reviewed route/destination imagery and a stable local fallback. */
export function overviewStopImage(trip: EasyTTrip, stop: TripStop): OverviewPlaceImage | null {
  const days = [...trip.planItems]
    .sort((left, right) => left.dayNumber - right.dayNumber)
    .filter((item) => item.stopId === stop.id);
  const imagedDay = days.find((item) => Boolean(item.image));
  if (imagedDay?.image) {
    const credit = routeImageCredit(imagedDay.image);
    return {
      src: imagedDay.image,
      alt: credit?.alt ?? imagedDay.title,
      sourceUrl: credit?.sourceUrl ?? imagedDay.sourceUrl ?? undefined,
      sourceLabel: credit?.sourceLabel ?? (imagedDay.sourceUrl ? "Photo source" : undefined),
      licenseUrl: credit?.licenseUrl,
      fullCreditUrl: credit?.fullCreditUrl,
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
  if (reviewedImage) return reviewedImage;

  const day = days[0];
  if (!day) return null;
  const local = mediaImagesFor(canonical.name)[0];
  return local ? {
    src: local.src,
    alt: local.alt,
    sourceUrl: local.sourceUrl,
    sourceLabel: local.sourceLabel ?? "Photo source",
  } : null;
}
