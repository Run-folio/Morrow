import { canonicalImageSource, commonsImageIdentity } from "./image-source-identity.ts";
import itineraryInventory from "../../public/journey/immersive/itinerary-image-inventory.json" with { type: "json" };
import destinationInventory from "../../public/journey/immersive/destination-inventory.json" with { type: "json" };
import routeImageInventory from "../../public/journey/immersive/route-image-inventory.json" with { type: "json" };
import publishedStopInventory from "../../public/journey/immersive/published-route-stop-image-inventory.generated.json" with { type: "json" };

import editorialInventory from "../../public/journey/immersive/editorial-image-inventory.json" with { type: "json" };
import { homepageFirstPartyPhotoSlots, routeEditorialImagery } from "./route-editorial-imagery.ts";

export type RoutePhotoRecord = {
  assetIdentity?: string;
  activitySubjects?: string[];
  activityBases?: string[];
  key: string;
  place: string;
  country: string;
  author: string;
  authorUrl?: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  changes: string;
  alt: string;
  variants: Array<{ src: string; width: number; height: number; bytes?: number }>;
  intendedUses?: string[];
  routeKeys?: string[];
  provenance?: "reviewed-provider" | "reviewed-morrovia-first-party";
  approvedRoles?: Array<"homepage-featured-route">;
  credit?: string;
};

// Exact place/country editorial records are safe to reuse across published
// routes that share the same canonical destination.
const reviewedEditorialInventory = editorialInventory as RoutePhotoRecord[];
const reusableEditorialPhotos = reviewedEditorialInventory.filter(photo => photo.provenance !== "reviewed-morrovia-first-party");
const destinationPhotos: RoutePhotoRecord[] = [...destinationInventory, ...publishedStopInventory, ...reusableEditorialPhotos];
const reviewedItineraryPhotos = itineraryInventory as RoutePhotoRecord[];
const editorialPhotos: RoutePhotoRecord[] = [...reviewedItineraryPhotos, ...reviewedEditorialInventory, ...destinationPhotos, ...routeImageInventory];

// Build immutable lookup indexes once; URL normalization is not repeated per catalogue variant during render.
const photoByVariant = new Map<string, RoutePhotoRecord>();
const photoByCommonsFile = new Map<string, RoutePhotoRecord>();
const verifiedIdentityByCommonsFile = new Map<string, string>();
for (const photo of editorialPhotos) {
  for (const variant of photo.variants) for (const source of [variant.src, canonicalImageSource(variant.src)]) {
    if (!photoByVariant.has(source)) photoByVariant.set(source, photo);
  }
  const file = commonsImageIdentity(photo.sourceUrl);
  if (file && !photoByCommonsFile.has(file)) photoByCommonsFile.set(file, photo);
  if (file && photo.assetIdentity && !verifiedIdentityByCommonsFile.has(file)) verifiedIdentityByCommonsFile.set(file, photo.assetIdentity);
}

const canonicalRouteImages: Record<string, string> = {
  "japan-slow": "/journey/immersive/place-kyoto-1536.webp",
  "balkans-overland": "/journey/immersive/place-kotor-1536.webp",
  "vietnam-cambodia": "/journey/immersive/place-hoi-an-1536.webp",
  "iceland-ring-road": "/journey/immersive/place-vik-1536.webp",
};

export function routeEditorialPhoto(key: string): RoutePhotoRecord | null {
  return editorialPhotos.find(photo => photo.key === key) ?? null;
}

export function isReviewedFirstPartyHomepagePhoto(photo: RoutePhotoRecord | null): photo is RoutePhotoRecord {
  const slot = photo ? Object.values(homepageFirstPartyPhotoSlots).find(candidate => candidate.photoKey === photo.key) : null;
  return photo?.provenance === "reviewed-morrovia-first-party"
    && photo.approvedRoles?.includes("homepage-featured-route") === true
    && Boolean(slot)
    && photo.sourceUrl === slot?.sourceUrl
    && photo.variants.length === 1
    && photo.variants[0]?.src === slot?.sourceUrl;
}

/** One licensed, locally served hero for every published route with visual coverage. */
export const routeImages: Record<string, string> = {
  ...canonicalRouteImages,
  ...Object.fromEntries(routeImageInventory.flatMap(photo => photo.routeKeys.map(routeKey => [routeKey, photo.variants.at(-1)!.src]))),
  ...Object.fromEntries(Object.entries(routeEditorialImagery).flatMap(([key, visual]) => {
    const photo = routeEditorialPhoto(visual.hero);
    return photo ? [[key, photo.variants.at(-1)!.src]] : [];
  })),
};

/** Licensed canonical destination photographs shared by homepage and detail. */
export function routeDestinationPhoto(place: string, country: string): RoutePhotoRecord | null {
  return destinationPhotos.find(image => image.place === place && image.country === country)
    ?? routeImageInventory.find(image => image.place === place && image.country === country) ?? null;
}

/** Licensed route-level photograph, used when destination coverage is incomplete. */
export function routeImagePhoto(routeKey: string): RoutePhotoRecord | null {
  const editorial = routeEditorialImagery[routeKey];
  if (editorial) return routeEditorialPhoto(editorial.hero);
  const routePhoto = routeImageInventory.find(image => image.routeKeys.includes(routeKey));
  if (routePhoto) return routePhoto;
  const source = canonicalRouteImages[routeKey];
  return source ? destinationInventory.find(photo => photo.variants.some(variant => variant.src === source)) ?? null : null;
}

export function routePhotoForSource(image: string): RoutePhotoRecord | null {
  const normalized = canonicalImageSource(image);
  const exact = photoByVariant.get(image) ?? photoByVariant.get(normalized);
  if (exact) return exact;
  const identity = commonsImageIdentity(normalized);
  return identity ? photoByCommonsFile.get(identity) ?? null : null;
}

export function routeImageCredit(image: string) {
  const record = routePhotoForSource(image);
  return record ? {
    src: image,
    alt: record.alt,
    author: record.author,
    authorUrl: record.authorUrl,
    sourceUrl: record.sourceUrl,
    licenseUrl: record.licenseUrl,
    license: record.license,
    provenance: record.provenance,
    fullCreditUrl: `/journey/immersive/credits.html#${record.key}`,
    sourceLabel: `${record.author} · ${record.license}`,
  } : null;
}

/** Exact reviewed destination alternatives reserved for itinerary presentation. */
export function itineraryDestinationPhotos(place: string, country: string): RoutePhotoRecord[] {
  return [...destinationPhotos, ...routeImageInventory, ...reviewedItineraryPhotos]
    .filter(photo => photo.place.toLowerCase() === place.trim().toLowerCase() && photo.country.toLowerCase() === country.trim().toLowerCase())
    .filter((photo, index, photos) => photos.findIndex(candidate => candidate.sourceUrl === photo.sourceUrl) === index);
}

/** Exact reviewed place names, scoped to their destination or declared excursion base. */
export function itineraryActivityPhotos(title: string, place: string, country: string): RoutePhotoRecord[] {
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return reviewedItineraryPhotos.filter(photo => photo.country === country
    && [photo.place, ...(photo.activityBases ?? [])].some(base => normalize(base) === normalize(place))
    && photo.activitySubjects?.some(subject => normalize(subject) === normalize(title)));
}

/** Share verified hashes across catalogue entries for the same Commons file. */
export function routePhotoAssetIdentity(photo: RoutePhotoRecord): string {
  const file = commonsImageIdentity(photo.sourceUrl);
  const verified = file ? verifiedIdentityByCommonsFile.get(file) : undefined;
  return photo.assetIdentity ?? verified ?? file ?? photo.sourceUrl;
}
