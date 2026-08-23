/** Require an exact canonical document ID when resolving the active local trip. */
export function requestedTripMatch<T extends { id: string; ownerId?: string | null }>(
  requestedId: string,
  activeTrip: T | null,
  ownerId?: string,
): T | null {
  if (activeTrip?.id !== requestedId) return null;
  // An owned browser document must never cross an account boundary, including
  // after logout when there is no current owner. Unclaimed local drafts remain
  // available before sign-in and can be promoted by the account on this device.
  if (activeTrip.ownerId && activeTrip.ownerId !== ownerId) return null;
  return activeTrip;
}
