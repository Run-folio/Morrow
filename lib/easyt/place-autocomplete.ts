import { findCatalogPlaceById, normalizeCatalogPhrase } from "./place-catalog.ts";

export type PlaceAutocompleteKeyResult = {
  activeIndex: number;
  choose: boolean;
  close: boolean;
};

export type PlaceAutocompleteIdentity = {
  name: string;
  canonicalPlaceId?: string;
  placeType?: string;
};

/** Keep the provider's relevance order, but make an exact same-name route
 * endpoint the first choice when an administrative area shares its label. */
export function prioritizeRouteStopSuggestions<T extends { name: string; canonicalPlaceId?: string; placeType?: string; routability?: string; matchedAirportCode?: string; matchedIcaoCode?: string }>(
  suggestions: readonly T[], intent: "route-stop" | "planning-area" | "anchor" | "unknown", query?: string,
): T[] {
  if (intent !== "route-stop") return [...suggestions];
  const result = [...suggestions];
  const nameKey = (item: T) => (item.placeType === "region" || item.placeType === "sub_region"
    ? item.name.replace(/\s+(?:region|province|state)$/i, "") : item.name).trim().toLocaleLowerCase();
  const names = new Set(result.map(nameKey));
  for (const name of names) {
    const slots = result.map((item, index) => nameKey(item) === name ? index : -1).filter(index => index >= 0);
    const ordered = slots.map(index => result[index]!).sort((left, right) =>
      Number(right.routability === "direct_destination") - Number(left.routability === "direct_destination"));
    slots.forEach((index, offset) => { result[index] = ordered[offset]!; });
  }
  // A whole-query country is a planning intent even in the route-stop field.
  // Require its catalog identity/type and exact name or curated alias; qualified
  // locality queries deliberately keep the provider/endpoint relevance order.
  const phrase = normalizeCatalogPhrase(query ?? "");
  const exactCountry = (item: T) => {
    if (!phrase || item.placeType !== "country" || !item.canonicalPlaceId) return false;
    const entry = findCatalogPlaceById(item.canonicalPlaceId);
    return entry?.placeType === "country"
      && [entry.canonicalName, ...entry.aliases].some(label => normalizeCatalogPhrase(label) === phrase);
  };
  // Catalogue substring matches are useful while provider search runs, but
  // cannot displace a gateway with validated exact IATA evidence on arrival.
  const code=(query??'').trim().toUpperCase();
  const exactAirport = (item:T)=>item.placeType==='transport_gateway'&&item.routability==='direct_destination'
    && ((/^[A-Z]{3}$/.test(code)&&item.matchedAirportCode===code)||(/^[A-Z]{4}$/.test(code)&&item.matchedIcaoCode===code));
  return [...result.filter(exactAirport), ...result.filter(item => !exactAirport(item) && exactCountry(item)),
    ...result.filter(item => !exactAirport(item) && !exactCountry(item))];
}

/** Treat canonical identity as authoritative. Display text is only a fallback
 * for legacy identities that have no IDs, and then only within the same type. */
export function isDuplicatePlaceIdentity(
  existing: PlaceAutocompleteIdentity[],
  candidate: PlaceAutocompleteIdentity,
): boolean {
  const candidateName = candidate.name.trim().toLocaleLowerCase();
  return existing.some((place) => {
    if (candidate.canonicalPlaceId && place.canonicalPlaceId) {
      return place.canonicalPlaceId === candidate.canonicalPlaceId;
    }
    const sameType = !candidate.placeType || !place.placeType || candidate.placeType === place.placeType;
    return sameType && place.name.trim().toLocaleLowerCase() === candidateName;
  });
}

/** Pure keyboard state transition shared by origin and stop autocomplete. */
export function placeAutocompleteKeyAction(
  key: string,
  activeIndex: number,
  resultCount: number,
): PlaceAutocompleteKeyResult {
  if (key === "Escape") return { activeIndex: -1, choose: false, close: true };
  if (key === "ArrowDown" && resultCount) return {
    activeIndex: activeIndex < 0 ? 0 : (activeIndex + 1) % resultCount,
    choose: false,
    close: false,
  };
  if (key === "ArrowUp" && resultCount) return {
    activeIndex: activeIndex < 0 ? resultCount - 1 : (activeIndex - 1 + resultCount) % resultCount,
    choose: false,
    close: false,
  };
  if (key === "Enter" && resultCount) return {
    activeIndex: activeIndex >= 0 && activeIndex < resultCount ? activeIndex : 0,
    choose: true,
    close: true,
  };
  return { activeIndex, choose: false, close: false };
}
