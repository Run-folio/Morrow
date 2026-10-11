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

type SuggestionLocation = PlaceAutocompleteIdentity & {country?:string;region?:string;administrativeHierarchy?:readonly string[];coordinates?:readonly number[];providerId?:string;referenceSnapshotId?:string;providerSourceId?:string;featureCode?:string;provenance?:readonly {id:string}[]};
export function mergeEquivalentPlaceSuggestions<T extends SuggestionLocation>(suggestions:readonly T[]):T[]{
 // The pinned crosswalk has no reviewed mappings. Different canonical IDs
 // remain selectable even when their names and complete geographic facts match.
 // Restoring cross-source suppression requires a reviewed mapping plus exact
 // validation of BOTH published source tuples, never an ID/name/point heuristic.
 const sameArray=(left:readonly unknown[]|undefined,right:readonly unknown[]|undefined)=>
  left===undefined||right===undefined ? left===right
   : left.length===right.length&&left.every((value,index)=>value===right[index]);
 const validPoint=(point:readonly number[]|undefined)=>point===undefined
  ||point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0]!)<=180&&Math.abs(point[1]!)<=90;
 const sameSuggestionTuple=(left:T,right:T)=>left.canonicalPlaceId===right.canonicalPlaceId
  &&left.name===right.name&&left.country===right.country&&left.placeType===right.placeType
  &&left.region===right.region&&sameArray(left.administrativeHierarchy,right.administrativeHierarchy)
  &&validPoint(left.coordinates)&&validPoint(right.coordinates)&&sameArray(left.coordinates,right.coordinates)
  &&left.providerId===right.providerId&&left.referenceSnapshotId===right.referenceSnapshotId
  &&left.providerSourceId===right.providerSourceId&&left.featureCode===right.featureCode
  &&sameArray(left.provenance?.map(source=>source.id),right.provenance?.map(source=>source.id));
 return suggestions.filter((item,index,all)=>!item.canonicalPlaceId||!validPoint(item.coordinates)
  ||all.findIndex(other=>sameSuggestionTuple(other,item))===index);
}
export function placeSuggestionLocationDetail(item:SuggestionLocation, suggestions:readonly SuggestionLocation[]){
 const nameKey=(name:string)=>normalizeCatalogPhrase(name.normalize('NFKD').replace(/['’]/g,''));
 const sameLabel=suggestions.filter(other=>nameKey(other.name)===nameKey(item.name)
   && other.country===item.country&&other.placeType===item.placeType);
 const hierarchy=item.administrativeHierarchy?.filter(Boolean)??(item.region?[item.region]:[]);
 for(let depth=1;depth<=hierarchy.length;depth++){
  const key=hierarchy.slice(0,depth).join('|');
  if(sameLabel.filter(other=>(other.administrativeHierarchy?.filter(Boolean)??(other.region?[other.region]:[])).slice(0,depth).join('|')===key).length===1)
   return [...hierarchy.slice(0,depth).reverse(),item.country].filter(Boolean).join(' · ');
 }
 // Source names may still collide within an administrative hierarchy. Preserve
 // distinct identities and offer the existing map link instead of inventing one.
 const entry=item.canonicalPlaceId?findCatalogPlaceById(item.canonicalPlaceId):undefined;
 const publishedSource=entry&&entry.canonicalName===item.name&&entry.placeType===item.placeType
  &&entry.parentCountries.length===1&&entry.parentCountries[0]===item.country
  &&entry.coordinates?.length===2&&item.coordinates?.length===2
  &&entry.coordinates.every((coordinate,index)=>coordinate===item.coordinates![index])
  ? entry.provenance.label : undefined;
 return [...hierarchy.slice().reverse(),item.country,sameLabel.length>1?publishedSource:undefined,
  sameLabel.length>1 ? 'Location to confirm' : undefined].filter(Boolean).join(' · ');
}

export function placeSuggestionMapUrl(item:SuggestionLocation, suggestions:readonly SuggestionLocation[]) {
 const duplicates=suggestions.filter(other=>normalizeCatalogPhrase(other.name)===normalizeCatalogPhrase(item.name)
   && other.country===item.country&&other.region===item.region&&other.placeType===item.placeType);
 if(duplicates.length<2 || !item.coordinates || !Number.isFinite(item.coordinates[0]) || !Number.isFinite(item.coordinates[1]))return null;
 const [lon,lat]=item.coordinates;
 return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(lat))}&mlon=${encodeURIComponent(String(lon))}#map=12/${encodeURIComponent(String(lat))}/${encodeURIComponent(String(lon))}`;
}

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
  // A whole-query catalog area is a planning intent even in the route-stop field.
  // Require its catalog identity/type and exact name or curated alias; qualified
  // locality queries deliberately keep the provider/endpoint relevance order.
  const phrase = normalizeCatalogPhrase(query ?? "");
  const exactPlanningIntent = (item: T) => {
    if (!phrase || !item.canonicalPlaceId) return false;
    const entry = findCatalogPlaceById(item.canonicalPlaceId);
    return Boolean(entry && entry.placeType === item.placeType
      && ['planning_area','needs_base_selection','anchor_or_poi'].includes(entry.routability)
      && [entry.canonicalName, ...entry.aliases].some(label => normalizeCatalogPhrase(label) === phrase));
  };
  // Catalogue substring matches are useful while provider search runs, but
  // cannot displace a gateway with validated exact IATA evidence on arrival.
  const code=(query??'').trim().toUpperCase();
  const exactAirport = (item:T)=>item.placeType==='transport_gateway'&&item.routability==='direct_destination'
    && ((/^[A-Z]{3}$/.test(code)&&item.matchedAirportCode===code)||(/^[A-Z]{4}$/.test(code)&&item.matchedIcaoCode===code));
  return [...result.filter(exactAirport), ...result.filter(item => !exactAirport(item) && exactPlanningIntent(item)),
    ...result.filter(item => !exactAirport(item) && !exactPlanningIntent(item))];
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
