export type CanonicalPlaceIdentityEvidence = {
  provider?: string;
  sourceId?: string;
  name: string;
  address?: string;
  category?: string;
  coordinates?: [number, number];
};

export function normalizeCanonicalPlaceText(value: string | null | undefined) {
  return value?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ") ?? "";
}

function canonicalSourceIdentity(place: CanonicalPlaceIdentityEvidence) {
  const provider = normalizeCanonicalPlaceText(place.provider);
  const sourceId = place.sourceId?.trim();
  return provider && sourceId ? `${provider}:${sourceId}` : null;
}

function categoryFamily(value: string | undefined) {
  const normalized = normalizeCanonicalPlaceText(value);
  if (/\b(?:restaurant|cafe|fast food|food|eatery|diner|cuisine)\b/.test(normalized)) return "food";
  if (/\b(?:hotel|hostel|guest house|guesthouse|motel|lodging|apartment)\b/.test(normalized)) return "stay";
  if (/\b(?:tour|experience|ticket|day trip)\b/.test(normalized)) return "tour";
  return normalized;
}

function coordinatesDistanceMetres(left: [number, number], right: [number, number]) {
  const radians = (value: number) => value * Math.PI / 180;
  const [leftLongitude, leftLatitude] = left;
  const [rightLongitude, rightLatitude] = right;
  const latitudeDelta = radians(rightLatitude - leftLatitude);
  const longitudeDelta = radians(rightLongitude - leftLongitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(leftLatitude)) * Math.cos(radians(rightLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function matchingAddress(left: string | undefined, right: string | undefined) {
  const leftAddress = normalizeCanonicalPlaceText(left);
  const rightAddress = normalizeCanonicalPlaceText(right);
  if (!leftAddress || !rightAddress) return false;
  return leftAddress === rightAddress
    || (Math.min(leftAddress.length, rightAddress.length) >= 8
      && (leftAddress.includes(rightAddress) || rightAddress.includes(leftAddress)));
}

/**
 * Conservative cross-source venue identity. A stable provider identity is
 * decisive; otherwise the same normalized name still needs close geography
 * plus corroborating category or address evidence. Same-name branches at
 * meaningfully different locations remain distinct.
 */
export function canonicalPlaceDuplicate(
  left: CanonicalPlaceIdentityEvidence,
  right: CanonicalPlaceIdentityEvidence,
) {
  const leftSource = canonicalSourceIdentity(left);
  const rightSource = canonicalSourceIdentity(right);
  if (leftSource && leftSource === rightSource) return true;
  if (!left.coordinates || !right.coordinates) return false;
  if (normalizeCanonicalPlaceText(left.name) !== normalizeCanonicalPlaceText(right.name)) return false;

  const distanceMetres = coordinatesDistanceMetres(left.coordinates, right.coordinates);
  const leftCategory = categoryFamily(left.category);
  const rightCategory = categoryFamily(right.category);
  const sameCategory = Boolean(leftCategory && rightCategory && leftCategory === rightCategory);
  const sameAddress = matchingAddress(left.address, right.address);

  // Near-identical pins with the same name and semantic type commonly reflect
  // a node/way or provider/fallback representation of one physical venue.
  if (distanceMetres <= 25 && sameCategory) return true;
  return distanceMetres <= 75 && sameCategory && sameAddress;
}
