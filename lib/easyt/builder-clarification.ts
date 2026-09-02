export type BuilderClarificationTarget = {
  id: string;
  order: number;
};

export type BuilderClarificationSelectionOwnership = {
  mentionId: string;
  routeStopId?: string;
};

export type BuilderClarificationRemovalPlan = {
  ownershipKnown: boolean;
  removableStopIds: string[];
  preservedStopIds: string[];
};

export function orderedBuilderClarificationIds(targets: readonly BuilderClarificationTarget[]) {
  return [...targets]
    .sort((left, right) => left.order - right.order)
    .filter((target, index, all) => all.findIndex((candidate) => candidate.id === target.id) === index)
    .map((target) => target.id);
}

export function shouldAutoOpenBuilderClarification({
  hydrated,
  placesStep,
  arrivedFromHomepage,
  resolving,
  itemCount,
  alreadyOpened,
  explicitlyDismissed,
  competingModal,
  recoveryBlocked,
}: {
  hydrated: boolean;
  placesStep: boolean;
  arrivedFromHomepage: boolean;
  resolving: boolean;
  itemCount: number;
  alreadyOpened: boolean;
  explicitlyDismissed: boolean;
  competingModal: boolean;
  recoveryBlocked: boolean;
}) {
  return hydrated
    && placesStep
    && arrivedFromHomepage
    && !resolving
    && itemCount > 0
    && !alreadyOpened
    && !explicitlyDismissed
    && !competingModal
    && !recoveryBlocked;
}

export function builderClarificationProgress(index: number, total: number) {
  const safeTotal = Math.max(1, total);
  return `${Math.min(Math.max(0, index), safeTotal - 1) + 1} of ${safeTotal}`;
}

export function builderClarificationResumeLabel(count: number) {
  return count === 1 ? "1 area still needs shaping" : `${count} areas still need shaping`;
}

/**
 * Removing a planning parent is allowed to cascade only to route stops whose
 * sole canonical relationship is that parent. Protected or independently
 * referenced stops remain in the route; stale ownership fails closed.
 */
export function builderClarificationRemovalPlan({
  mentionId,
  selections,
  existingStopIds,
  protectedStopIds = [],
  independentStopIds = [],
}: {
  mentionId: string;
  selections: readonly BuilderClarificationSelectionOwnership[];
  existingStopIds: readonly string[];
  protectedStopIds?: readonly string[];
  independentStopIds?: readonly string[];
}): BuilderClarificationRemovalPlan {
  const existing = new Set(existingStopIds);
  const protectedIds = new Set(protectedStopIds);
  const independentIds = new Set(independentStopIds);
  const parentStopIds = [...new Set(selections
    .filter((selection) => selection.mentionId === mentionId)
    .flatMap((selection) => selection.routeStopId ? [selection.routeStopId] : []))];
  if (parentStopIds.some((stopId) => !existing.has(stopId))) {
    return { ownershipKnown: false, removableStopIds: [], preservedStopIds: parentStopIds };
  }
  const removableStopIds: string[] = [];
  const preservedStopIds: string[] = [];
  parentStopIds.forEach((stopId) => {
    const shared = selections.some((selection) => selection.mentionId !== mentionId && selection.routeStopId === stopId);
    if (shared || protectedIds.has(stopId) || independentIds.has(stopId)) preservedStopIds.push(stopId);
    else removableStopIds.push(stopId);
  });
  return { ownershipKnown: true, removableStopIds, preservedStopIds };
}
