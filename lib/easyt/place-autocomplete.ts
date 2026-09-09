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
