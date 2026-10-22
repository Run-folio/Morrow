import type { EasyTTrip } from "./trip.ts";
import { countryFor } from "./country-registry.ts";

type DisplayTrip = Pick<EasyTTrip, "title" | "stops"> & {
  brief: Pick<EasyTTrip["brief"], "origin" | "customTitle">;
};

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function legacyGeneratedTripTitle(trip: DisplayTrip) {
  return `${trip.brief.origin} to ${trip.stops.map((stop) => stop.name).join(" & ")}`;
}

/** Stops own destination identity; origin and return endpoints are transport context. */
export function generatedTripTitle(stops: ReadonlyArray<{ name: string; order: number }>) {
  return [...stops].sort((left, right) => left.order - right.order)
    .map((stop) => stop.name.trim()).filter(Boolean).slice(0, 3).join(" & ") || "Untitled trip";
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
    title: customTitle || generatedTripTitle(trip.stops),
    brief: { ...trip.brief, customTitle: customTitle || null },
  };
}

/**
 * Presentation-only title cleanup for titles with known generated provenance.
 * Explicit customTitle:null or the exact legacy builder formula identifies an
 * automatic title. Unrecognized saved titles keep their existing custom identity.
 */
export function tripDisplayTitle(trip: DisplayTrip) {
  const customTitle = tripCustomTitle(trip);
  if (customTitle) return customTitle;

  return generatedTripTitle(trip.stops);
}

/** Overview identity is display-only. Unknown legacy provenance stays untouched. */
export function tripOverviewDisplayTitle(trip: DisplayTrip) {
  if (typeof trip.brief.customTitle === "string" && trip.brief.customTitle.trim()) return trip.brief.customTitle;
  if (!Object.prototype.hasOwnProperty.call(trip.brief, "customTitle") && trip.title.trim()
    && trip.title !== legacyGeneratedTripTitle(trip)) return trip.title;
  const countries = [...trip.stops].sort((a, b) => a.order - b.order)
    .map(stop => countryFor(stop.countryCode ?? "") ?? countryFor(stop.country))
    .filter((country): country is NonNullable<typeof country> => Boolean(country))
    .map(country => country.name);
  return countries.length ? formatTripPlaceList([...new Set(countries)]) : "Your trip";
}
