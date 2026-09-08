import destinationInventory from "../../public/journey/immersive/destination-inventory.json" with { type: "json" };
/**
 * Route-level image choices. Keeping this separate from route logic lets the
 * editorial team replace images without changing planning data.
 */
export const routeImages: Record<string, string> = {
  "japan-slow": "/journey/immersive/place-kyoto-1536.webp",
  "taiwan-rail": "/journey/taiwan-rail-route.jpg",
  "andean-highlands": "/journey/peru-sacred-valley-route.jpg",
  "portugal-atlantic": "/journey/portugal-atlantic-route.jpg",
  "balkans-overland": "/journey/immersive/place-kotor-1536.webp",
  "vietnam-cambodia": "/journey/immersive/place-hoi-an-1536.webp",
  "iceland-ring-road": "/journey/immersive/place-vik-1536.webp",
};

/** Licensed canonical destination photographs shared by homepage and detail. */
export function routeDestinationPhoto(place: string, country: string) {
  return destinationInventory.find(image => image.place === place && image.country === country) ?? null;
}

export function routeImageCredit(image: string) {
  const record = destinationInventory.find(photo => photo.variants.some(variant => variant.src === image));
  return record ? { src: image, alt: record.alt, sourceUrl: `/journey/immersive/credits.html#${record.key}`, sourceLabel: `${record.author} · ${record.license}` } : null;
}
