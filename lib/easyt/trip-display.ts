import type { EasyTTrip } from "./trip.ts";

type DisplayTrip = Pick<EasyTTrip, "title" | "stops"> & {
  brief: Pick<EasyTTrip["brief"], "origin">;
};

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function generatedTitleForTrip(trip: DisplayTrip) {
  return `${trip.brief.origin} to ${trip.stops.map((stop) => stop.name).join(" & ")}`;
}

export function formatTripPlaceList(names: string[]) {
  const places = names.map((name) => name.trim()).filter(Boolean);
  if (!places.length) return "Untitled trip";
  if (places.length === 1) return places[0];
  if (places.length === 2) return `${places[0]} & ${places[1]}`;
  return `${places.slice(0, -1).join(", ")} & ${places.at(-1)}`;
}

/**
 * Presentation-only title cleanup for titles produced by the legacy builder.
 * Any title that does not exactly match that deterministic generated format is
 * treated as traveller-authored and is preserved verbatim.
 */
export function tripDisplayTitle(trip: DisplayTrip) {
  const savedTitle = trip.title.trim();
  if (savedTitle && normalized(savedTitle) !== normalized(generatedTitleForTrip(trip))) {
    return savedTitle;
  }

  const seen = new Set<string>();
  const routePlaces = [trip.brief.origin, ...[...trip.stops]
    .sort((left, right) => left.order - right.order)
    .map((stop) => stop.name)]
    .filter((name) => {
      const key = normalized(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return formatTripPlaceList(routePlaces);
}
