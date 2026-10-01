import { routeDestinationPhoto, routeImageCredit } from "./route-images.ts";
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
  provenance?: "reviewed-provider" | "reviewed-morrovia-first-party";
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
    authorHref: credit.authorUrl ?? null,
    creditHref: credit.sourceUrl,
    creditLabel: credit.sourceLabel,
    licenseHref: credit.licenseUrl,
    fullCreditHref: credit.fullCreditUrl,
    place: null,
    provenance: credit.provenance,
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
        authorHref: photo.authorUrl ?? null,
        creditHref: photo.sourceUrl,
        creditLabel: `${photo.author} · ${photo.license}`,
        licenseHref: photo.licenseUrl,
        fullCreditHref: `/journey/immersive/credits.html#${photo.key}`,
        place: photo.place,
        provenance: photo.provenance,
      }];
    });
}

export function dashboardTripPhoto(trip: EasyTTrip): DashboardTripPhoto | null {
  return storedTripPhoto(trip) ?? canonicalDashboardTripPhotos(trip)[0] ?? null;
}

/** Presentation-only choices for the cards currently rendered, in display order. */
export function dashboardTripPhotosForCards(trips: readonly EasyTTrip[], reservedSources: readonly string[] = []): Map<string, DashboardTripPhoto> {
  const selected = new Map<string, DashboardTripPhoto>();
  const used = new Set(reservedSources);
  const candidates = trips.filter((trip) => trip.status !== "draft").map((trip) => {
    const assigned = storedTripPhoto(trip);
    const photos = assigned ? [assigned] : canonicalDashboardTripPhotos(trip);
    return { trip, photos: photos.filter((photo, index) => photos.findIndex((candidate) => candidate.src === photo.src) === index) };
  });

  // Fixed choices claim their image first, so a flexible earlier card can move
  // to another valid destination instead of duplicating a later fixed card.
  for (const { trip, photos } of candidates.filter(({ photos }) => photos.length === 1)) {
    selected.set(trip.id, photos[0]!);
    used.add(photos[0]!.src);
  }
  const flexible = candidates.filter(({ photos }) => photos.length > 1);
  const ownerBySource = new Map<string, string>();
  const choices = new Map(flexible.map(({ trip, photos }) => [trip.id, photos]));
  const assign = (tripId: string, visited: Set<string>): boolean => {
    for (const photo of choices.get(tripId) ?? []) {
      if (visited.has(photo.src) || used.has(photo.src)) continue;
      visited.add(photo.src);
      const owner = ownerBySource.get(photo.src);
      if (owner && !assign(owner, visited)) continue;
      const previous = selected.get(tripId)?.src;
      if (previous && previous !== photo.src) ownerBySource.delete(previous);
      ownerBySource.set(photo.src, tripId);
      selected.set(tripId, photo);
      return true;
    }
    return false;
  };
  for (const { trip } of flexible) assign(trip.id, new Set());
  for (const { trip, photos } of flexible) {
    if (!selected.has(trip.id)) selected.set(trip.id, photos[0]!);
  }
  return selected;
}

export function featuredDashboardTripPhoto(trip: EasyTTrip): DashboardTripPhoto | null {
  const stored = storedTripPhoto(trip);
  const canonical = canonicalDashboardTripPhotos(trip);
  const japanAlternate = canonical.find((photo) => photo.place === "Takayama");
  return japanAlternate ?? stored ?? canonical[0] ?? null;
}
