const PRIVATE_CONTEXT_PREFIX = "easyt-private";

export function privateContextScope(ownerId: string | null | undefined) {
  return ownerId ? `owner-${encodeURIComponent(ownerId)}` : "guest";
}

export function travelProfileStorageKey(ownerId: string | null | undefined) {
  return `${PRIVATE_CONTEXT_PREFIX}:${privateContextScope(ownerId)}:travel-profile`;
}

export function travelReadinessStorageKey(ownerId: string | null | undefined) {
  return `${PRIVATE_CONTEXT_PREFIX}:${privateContextScope(ownerId)}:travel-readiness-profile`;
}

export type OwnerBoundaryState = "pending" | "current" | "expired" | "mismatch" | "signed-out";

export function ownerBoundaryState({
  renderedOwnerId,
  sessionOwnerId,
  rememberedOwnerId,
  sessionPending,
  previouslyAuthenticatedOwnerId,
}: {
  renderedOwnerId: string;
  sessionOwnerId?: string | null;
  rememberedOwnerId?: string | null;
  sessionPending: boolean;
  previouslyAuthenticatedOwnerId?: string | null;
}): OwnerBoundaryState {
  if (sessionOwnerId && sessionOwnerId !== renderedOwnerId) return "mismatch";
  if (rememberedOwnerId && rememberedOwnerId !== renderedOwnerId) return "mismatch";
  if (sessionOwnerId === renderedOwnerId) return "current";
  if (sessionPending) return "pending";
  if (previouslyAuthenticatedOwnerId === renderedOwnerId) return "expired";
  return "signed-out";
}
