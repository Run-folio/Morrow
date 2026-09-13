import type { EasyTTrip } from "./trip.ts";

type DisplayTrip = Pick<EasyTTrip, "title" | "stops"> & {
  brief: Pick<EasyTTrip["brief"], "origin" | "customTitle">;
};

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function legacyGeneratedTripTitle(trip: DisplayTrip) {
  return `${trip.brief.origin} to ${trip.stops.map((stop) => stop.name).join(" & ")}`;
}

export function formatTripPlaceList(names: string[]) {
  const places = names.map((name) => name.trim()).filter(Boolean);
  if (!places.length) return "Untitled trip";
  if (places.length === 1) return places[0];
  if (places.length === 2) return `${places[0]} & ${places[1]}`;
  if (places.length === 3) return `${places[0]}, ${places[1]} & ${places[2]}`;
  return `${places[0]}, ${places[1]} + ${places.length - 2} more`;
}

export function tripCustomTitle(trip: DisplayTrip) {
  if (Object.prototype.hasOwnProperty.call(trip.brief, "customTitle")) {
    return trip.brief.customTitle?.trim().replace(/\s+/g, " ") || null;
  }
  const savedTitle = trip.title.trim().replace(/\s+/g, " ");
  return savedTitle && normalized(savedTitle) !== normalized(legacyGeneratedTripTitle(trip))
    ? savedTitle
    : null;
}

export function renameTripIdentity(trip: EasyTTrip, input: string): EasyTTrip {
  const customTitle = input.trim().replace(/\s+/g, " ");
  return {
    ...trip,
    title: customTitle || legacyGeneratedTripTitle(trip),
    brief: { ...trip.brief, customTitle: customTitle || null },
  };
}

/**
 * Presentation-only title cleanup for titles produced by the legacy builder.
 * Any title that does not exactly match that deterministic generated format is
 * treated as traveller-authored and is preserved verbatim.
 */
export function tripDisplayTitle(trip: DisplayTrip) {
  const customTitle = tripCustomTitle(trip);
  if (customTitle) return customTitle;

  const seen = new Set<string>();
  const geographicPlaces = [...trip.stops]
    .sort((left, right) => left.order - right.order)
    .map((stop) => stop.country?.trim() || stop.region?.trim() || stop.name.trim())
    .filter((name) => {
      const key = normalized(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return formatTripPlaceList(geographicPlaces);
}
