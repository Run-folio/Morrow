export const WORKSPACE_ORIENTATION_STORAGE_PREFIX = "morrovia:workspace-orientation";

export type WorkspaceOrientationWorkspace = "overview" | "map" | "itinerary";
export type WorkspaceOrientationState = "unseen" | "dismissed" | "completed";
export type WorkspaceOrientationSource = "automatic" | "replay";

export const WORKSPACE_ORIENTATION_VERSIONS: Record<WorkspaceOrientationWorkspace, number> = {
  overview: 1,
  map: 1,
  itinerary: 1,
};

export function workspaceOrientationScope(ownerId: string | null | undefined) {
  return ownerId?.trim() ? `owner:${encodeURIComponent(ownerId.trim())}` : "guest";
}

export function workspaceOrientationStorageKey(
  ownerId: string | null | undefined,
  workspace: WorkspaceOrientationWorkspace,
  version = WORKSPACE_ORIENTATION_VERSIONS[workspace],
) {
  return `${WORKSPACE_ORIENTATION_STORAGE_PREFIX}:${workspace}:v${version}:${workspaceOrientationScope(ownerId)}`;
}

export function readWorkspaceOrientationState(
  storage: Pick<Storage, "getItem"> | null | undefined,
  ownerId: string | null | undefined,
  workspace: WorkspaceOrientationWorkspace,
  version = WORKSPACE_ORIENTATION_VERSIONS[workspace],
): WorkspaceOrientationState {
  try {
    const value = storage?.getItem(workspaceOrientationStorageKey(ownerId, workspace, version));
    return value === "completed" || value === "dismissed" ? value : "unseen";
  } catch {
    return "unseen";
  }
}

export function writeWorkspaceOrientationState(
  storage: Pick<Storage, "setItem"> | null | undefined,
  ownerId: string | null | undefined,
  workspace: WorkspaceOrientationWorkspace,
  state: Exclude<WorkspaceOrientationState, "unseen">,
  version = WORKSPACE_ORIENTATION_VERSIONS[workspace],
) {
  try {
    storage?.setItem(workspaceOrientationStorageKey(ownerId, workspace, version), state);
    return true;
  } catch {
    return false;
  }
}

export function shouldAutoStartWorkspaceOrientation({
  state,
  ready,
  hasMeaningfulTargets,
  attentionRequired,
  productTourOpen,
  userInteracted,
}: {
  state: WorkspaceOrientationState;
  ready: boolean;
  hasMeaningfulTargets: boolean;
  attentionRequired: boolean;
  productTourOpen: boolean;
  userInteracted: boolean;
}) {
  return state === "unseen"
    && ready
    && hasMeaningfulTargets
    && !attentionRequired
    && !productTourOpen
    && !userInteracted;
}
