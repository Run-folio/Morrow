import { routeDestinationPhoto, routeImageCredit } from "./route-images.ts";
import type { EasyTTrip } from "./trip.ts";

export type DashboardTripPhoto = {
  src: string;
  alt: string;
  creditHref: string | null;
  creditLabel: string | null;
  licenseHref: string | null;
  fullCreditHref: string | null;
  place: string | null;
};

function storedTripPhoto(trip: EasyTTrip): DashboardTripPhoto | null {
  const src = trip.planItems.find((item) => item.image)?.image ?? null;
  if (!src) return null;
  const credit = routeImageCredit(src);
  // Plan items can contain maps and provider thumbnails. Dashboard cards only
  // admit photography from Morrovia's reviewed route inventory.
  if (!credit) return null;
  return {
    src,
    alt: credit.alt,
    creditHref: credit.sourceUrl,
    creditLabel: credit.sourceLabel,
    licenseHref: credit.licenseUrl,
    fullCreditHref: credit.fullCreditUrl,
    place: null,
  };
}

export function canonicalDashboardTripPhotos(trip: EasyTTrip): DashboardTripPhoto[] {
  return [...trip.stops]
    .sort((left, right) => left.order - right.order)
    .flatMap((stop) => {
      const photo = routeDestinationPhoto(stop.name, stop.country);
      const src = photo?.variants.at(-1)?.src;
      if (!photo || !src) return [];
      return [{
        src,
        alt: photo.alt,
        creditHref: photo.sourceUrl,
        creditLabel: `${photo.author} · ${photo.license}`,
        licenseHref: photo.licenseUrl,
        fullCreditHref: `/journey/immersive/credits.html#${photo.key}`,
        place: photo.place,
      }];
    });
}

export function dashboardTripPhoto(trip: EasyTTrip): DashboardTripPhoto | null {
  return storedTripPhoto(trip) ?? canonicalDashboardTripPhotos(trip)[0] ?? null;
}

export function featuredDashboardTripPhoto(trip: EasyTTrip): DashboardTripPhoto | null {
  const stored = storedTripPhoto(trip);
  const canonical = canonicalDashboardTripPhotos(trip);
  const japanAlternate = canonical.find((photo) => photo.place === "Takayama");
  return japanAlternate ?? stored ?? canonical[0] ?? null;
}
