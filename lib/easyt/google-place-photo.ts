export type GooglePlacePhotoAttribution = {
  displayName: string;
  uri?: string;
};

const googlePlaceIdPattern = /^[A-Za-z0-9_-]{10,255}$/;

const normalizedPropertyText = (value: string) => value
  .normalize("NFKC")
  .trim()
  .replace(/\s+/g, " ")
  .toLocaleLowerCase();

function coordinateDistanceKm(left: [number, number], right: [number, number]) {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(left[1])) * Math.cos(radians(right[1])) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function validGooglePlaceId(value: unknown): value is string {
  return typeof value === "string" && googlePlaceIdPattern.test(value);
}

export function exactGooglePhotoResource(placeId: string, value: unknown) {
  if (!validGooglePlaceId(placeId) || typeof value !== "string") return null;
  return value.startsWith(`places/${placeId}/photos/`) && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(value)
    ? value
    : null;
}

/**
 * A fallback mapped place may request Google media only after the server has
 * resolved the same normalized name and, when both sources provide it, exact
 * normalized address within 100 metres. Ambiguous or merely similar venues
 * deliberately keep the neutral image treatment.
 */
export function exactGooglePropertyMatch(input: {
  name: string;
  address?: string;
  coordinates: [number, number];
}, candidate: {
  name?: string;
  address?: string;
  coordinates?: [number, number];
}) {
  if (!candidate.name || !candidate.coordinates) return false;
  if (normalizedPropertyText(input.name) !== normalizedPropertyText(candidate.name)) return false;
  if (input.address && candidate.address
    && normalizedPropertyText(input.address) !== normalizedPropertyText(candidate.address)) return false;
  return coordinateDistanceKm(input.coordinates, candidate.coordinates) <= 0.1;
}

export function safeGooglePhotoAttributions(value: unknown): GooglePlacePhotoAttribution[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as { displayName?: unknown; uri?: unknown };
    const displayName = typeof candidate.displayName === "string" ? candidate.displayName.trim().slice(0, 160) : "";
    if (!displayName) return [];
    const uri = typeof candidate.uri === "string" && /^https:\/\//.test(candidate.uri) ? candidate.uri : undefined;
    return [{ displayName, ...(uri ? { uri } : {}) }];
  });
}

export function encodeGooglePhotoAttributions(value: GooglePlacePhotoAttribution[]) {
  return encodeURIComponent(JSON.stringify(value));
}

export function decodeGooglePhotoAttributions(value: string | null) {
  if (!value) return [];
  try {
    return safeGooglePhotoAttributions(JSON.parse(decodeURIComponent(value)));
  } catch {
    return [];
  }
}
