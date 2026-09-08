import destinationInventory from "../../public/journey/immersive/destination-inventory.json" with { type: "json" };
import routeImageInventory from "../../public/journey/immersive/route-image-inventory.json" with { type: "json" };

export type RoutePhotoRecord = (typeof destinationInventory)[number] | (typeof routeImageInventory)[number];

const canonicalRouteImages: Record<string, string> = {
  "japan-slow": "/journey/immersive/place-kyoto-1536.webp",
  "balkans-overland": "/journey/immersive/place-kotor-1536.webp",
  "vietnam-cambodia": "/journey/immersive/place-hoi-an-1536.webp",
  "iceland-ring-road": "/journey/immersive/place-vik-1536.webp",
};

/** One licensed, locally served hero for every published route with visual coverage. */
export const routeImages: Record<string, string> = {
  ...canonicalRouteImages,
  ...Object.fromEntries(routeImageInventory.flatMap(photo => photo.routeKeys.map(routeKey => [routeKey, photo.variants.at(-1)!.src]))),
};

/** Licensed canonical destination photographs shared by homepage and detail. */
export function routeDestinationPhoto(place: string, country: string) {
  return destinationInventory.find(image => image.place === place && image.country === country) ?? null;
}

/** Licensed route-level photograph, used when destination coverage is incomplete. */
export function routeImagePhoto(routeKey: string): RoutePhotoRecord | null {
  const routePhoto = routeImageInventory.find(image => image.routeKeys.includes(routeKey));
  if (routePhoto) return routePhoto;
  const source = canonicalRouteImages[routeKey];
  return source ? destinationInventory.find(photo => photo.variants.some(variant => variant.src === source)) ?? null : null;
}

export function routePhotoForSource(image: string): RoutePhotoRecord | null {
  return [...destinationInventory, ...routeImageInventory].find(photo => photo.variants.some(variant => variant.src === image)) ?? null;
}

export function routeImageCredit(image: string) {
  const record = routePhotoForSource(image);
  return record ? { src: image, alt: record.alt, sourceUrl: `/journey/immersive/credits.html#${record.key}`, sourceLabel: `${record.author} · ${record.license}` } : null;
}
