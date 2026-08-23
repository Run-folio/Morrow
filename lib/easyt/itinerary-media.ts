import { journeyMedia, type JourneyImage } from "@/lib/journey";

const MEDIA_KEYS: Record<string, string> = {
  "guatemala city": "guatemala",
  "los angeles": "los-angeles-out",
  "hong kong": "hong-kong",
  "hirayu onsen": "hirayu",
  "mt takao": "tokyo",
  "mount takao": "tokyo",
  "tianmen mountain": "zhangjiajie",
  "zhangjiajie national forest park": "wulingyuan",
};

export const PLACE_IMAGE_HINTS: Record<string, string> = {
  "asakusa & senso-ji": "tokyo.jpg",
  "meiji jingu & harajuku": "imperial-palace.jpg",
  "mt. takao": "takao-summit.jpg",
  "tokyo marathon": "tokyo-marathon.jpg",
  "food neighbourhood night": "ginza-night.jpg",
  "victoria peak": "hong-kong.jpg",
  "star ferry & harbour": "star-ferry.jpg",
  "dragon's back": "dragons-back.jpg",
  "tai kwun & old central": "hong-kong-central-tram.jpg",
  "cantonese food night": "hong-kong-central-tram.jpg",
};

export function mediaImagesFor(destination: string): JourneyImage[] {
  const normalized = destination.trim().toLowerCase();
  const key = MEDIA_KEYS[normalized] ?? normalized.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const media = journeyMedia[key] ?? journeyMedia[Object.keys(journeyMedia).find((mediaKey) =>
    mediaKey !== "los-angeles-back" && (key.includes(mediaKey) || mediaKey.includes(key)),
  ) ?? ""];
  return media ? [media.hero, ...(media.gallery ?? [])] : [];
}

const normalizeMediaText = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function itineraryImageFor(
  day: { title: string; destination: string; items: string[] },
  index: number,
): JourneyImage | null {
  const images = mediaImagesFor(day.destination);
  if (!images.length) return null;
  const searchable = normalizeMediaText(`${day.title} ${day.items.join(" ")}`);
  const hinted = Object.entries(PLACE_IMAGE_HINTS).find(([title]) => searchable.includes(normalizeMediaText(title)))?.[1];
  return (hinted ? images.find((image) => image.src.endsWith(`/${hinted}`)) : null) ?? images[index % images.length];
}
