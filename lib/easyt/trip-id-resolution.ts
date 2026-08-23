/** Require an exact canonical document ID when resolving the active local trip. */
export function requestedTripMatch<T extends { id: string; ownerId?: string | null }>(
  requestedId: string,
  activeTrip: T | null,
  ownerId?: string,
): T | null {
  if (activeTrip?.id !== requestedId) return null;
  if (ownerId && activeTrip.ownerId && activeTrip.ownerId !== ownerId) return null;
  return activeTrip;
}
