export const WORKSPACE_ORIENTATION_STORAGE_PREFIX = "morrovia:workspace-orientation";
export const WORKSPACE_ORIENTATION_VERSION = 1;

export type WorkspaceOrientationWorkspace = "overview" | "map" | "itinerary";
export type WorkspaceOrientationSource = "automatic" | "replay";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;
type RemovableStorage = Pick<Storage, "removeItem">;

export function workspaceOrientationScope(ownerId: string | null | undefined) {
  return ownerId?.trim() ? `owner:${encodeURIComponent(ownerId.trim())}` : "guest";
}

export function workspaceOrientationStorageKey(
  ownerId: string | null | undefined,
) {
  return `${WORKSPACE_ORIENTATION_STORAGE_PREFIX}:seen:${workspaceOrientationScope(ownerId)}`;
}

function parsedVersion(value: string | null | undefined) {
  if (!value || !/^\d+$/.test(value)) return 0;
  const version = Number(value);
  return Number.isSafeInteger(version) ? version : 0;
}

function legacyWorkspaceSeenVersion(storage: ReadableStorage, ownerId: string | null | undefined) {
  const scope = workspaceOrientationScope(ownerId);
  const workspaces: WorkspaceOrientationWorkspace[] = ["overview", "map", "itinerary"];
  return workspaces.some((workspace) => {
    const value = storage.getItem(`${WORKSPACE_ORIENTATION_STORAGE_PREFIX}:${workspace}:v1:${scope}`);
    return value === "completed" || value === "dismissed";
  }) ? 1 : 0;
}

export function readWorkspaceOrientationSeenVersion(
  storage: ReadableStorage | null | undefined,
  ownerId: string | null | undefined,
) {
  try {
    if (!storage) return 0;
    return Math.max(
      parsedVersion(storage.getItem(workspaceOrientationStorageKey(ownerId))),
      legacyWorkspaceSeenVersion(storage, ownerId),
    );
  } catch {
    return 0;
  }
}

export function writeWorkspaceOrientationSeenVersion(
  storage: WritableStorage | null | undefined,
  ownerId: string | null | undefined,
  version = WORKSPACE_ORIENTATION_VERSION,
) {
  try {
    if (!storage) return false;
    const current = "getItem" in storage
      ? readWorkspaceOrientationSeenVersion(storage as WritableStorage & ReadableStorage, ownerId)
      : 0;
    storage.setItem(workspaceOrientationStorageKey(ownerId), String(Math.max(current, version)));
    return true;
  } catch {
    return false;
  }
}

export function clearWorkspaceOrientationSeenVersion(
  storage: RemovableStorage | null | undefined,
  ownerId: string | null | undefined,
) {
  try {
    if (!storage) return false;
    storage.removeItem(workspaceOrientationStorageKey(ownerId));
    const scope = workspaceOrientationScope(ownerId);
    for (const workspace of ["overview", "map", "itinerary"] as const) {
      storage.removeItem(`${WORKSPACE_ORIENTATION_STORAGE_PREFIX}:${workspace}:v1:${scope}`);
    }
    return true;
  } catch {
    return false;
  }
}

export function resolveWorkspaceOrientationSeenVersion({
  accountVersion = 0,
  ownerDeviceVersion = 0,
  guestDeviceVersion = 0,
}: {
  accountVersion?: number;
  ownerDeviceVersion?: number;
  guestDeviceVersion?: number;
}) {
  return Math.max(accountVersion, ownerDeviceVersion, guestDeviceVersion);
}

export function shouldAutoStartWorkspaceOrientation({
  seenVersion,
  currentVersion = WORKSPACE_ORIENTATION_VERSION,
  ready,
  hasMeaningfulTargets,
  attentionRequired,
  productTourOpen,
  userInteracted,
}: {
  seenVersion: number;
  currentVersion?: number;
  ready: boolean;
  hasMeaningfulTargets: boolean;
  attentionRequired: boolean;
  productTourOpen: boolean;
  userInteracted: boolean;
}) {
  return seenVersion < currentVersion
    && ready
    && hasMeaningfulTargets
    && !attentionRequired
    && !productTourOpen
    && !userInteracted;
}
