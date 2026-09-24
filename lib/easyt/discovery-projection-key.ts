/** Only inputs that affect evidence, ranking, directions, or recommendations. */
export function discoveryProjectionKey(input: { mention: object; draft: { directionId: string | null; removedIds: readonly string[]; shortlistIds?: readonly string[] }; durationDays?: number; interests: readonly string[]; existingPlaceIds: readonly string[] }) {
  return JSON.stringify([input.mention, input.draft.directionId, input.draft.removedIds,
    input.durationDays, input.interests, input.existingPlaceIds]);
}

/** Map markers change only when their ordered place identity or geometry changes. */
export function discoveryMapPlacesKey(places: readonly { id: string; name: string; coordinates: readonly [number, number] }[]) {
  return JSON.stringify(places.map(place => [place.id, place.name, place.coordinates]));
}
