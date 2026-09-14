export type GooglePlacePhotoAttribution = {
  displayName: string;
  uri?: string;
};

const googlePlaceIdPattern = /^[A-Za-z0-9_-]{10,255}$/;

export function validGooglePlaceId(value: unknown): value is string {
  return typeof value === "string" && googlePlaceIdPattern.test(value);
}

export function exactGooglePhotoResource(placeId: string, value: unknown) {
  if (!validGooglePlaceId(placeId) || typeof value !== "string") return null;
  return value.startsWith(`places/${placeId}/photos/`) && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(value)
    ? value
    : null;
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
