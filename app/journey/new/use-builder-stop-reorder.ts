"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type HTMLAttributes, type KeyboardEvent, type PointerEvent } from "react";
import { builderStopOrderFingerprint, validateBuilderStopOrder } from "../../../lib/easyt/trip-builder-order.ts";

export function moveOccurrenceId(
  currentIds: readonly string[],
  movedId: string,
  targetIndex: number,
): string[] | null {
  const sourceIndex = currentIds.indexOf(movedId);
  if (!Number.isInteger(targetIndex) || sourceIndex < 0 || targetIndex < 0 || targetIndex >= currentIds.length) return null;
  const next = [...currentIds];
  const [moving] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moving);
  return next;
}

type ReorderSource = "drag" | "move-menu";

export function useBuilderStopReorder(options: {
  stopIds: readonly string[];
  lockedStopIds: readonly string[];
  fixedOrder: boolean;
  stopLabels?: Readonly<Record<string, string>>;
  scopeKey?: string;
  onPreview: (ids: readonly string[] | null) => void;
  onCommit: (ids: readonly string[], source: ReorderSource) => boolean | Promise<boolean>;
  targetAttribute?: 'data-builder-stop-index' | 'data-builder-chip-index';
}) {
  const { stopIds, lockedStopIds, fixedOrder, onPreview, onCommit, targetAttribute = 'data-builder-stop-index' } = options;
  const scopeRef = useRef(options.scopeKey);
  scopeRef.current = options.scopeKey;
  const [notice, setNotice] = useState<{ scope: string | undefined; text: string }>({ scope: options.scopeKey, text: "" });
  const setAnnouncement = (text: string) => setNotice({ scope: scopeRef.current, text });
  const announcement = notice.scope === options.scopeKey ? notice.text : "";
  const pendingRef = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState<readonly string[] | null>(null);
  const gestureRef = useRef<{ movedId: string; fingerprint: string; pointerId: number | null; scope: string | undefined } | null>(null);
  const previewRef = useRef<readonly string[] | null>(null);
  const stopIdsRef = useRef(stopIds);
  stopIdsRef.current = stopIds;

  const publishPreview = useCallback((ids: readonly string[] | null) => {
    previewRef.current = ids;
    setPreviewIds(ids);
    onPreview(ids);
  }, [onPreview]);

  const cancel = useCallback(() => {
    gestureRef.current = null;
    setDraggingId(null);
    publishPreview(null);
  }, [publishPreview]);

  useEffect(() => cancel, [cancel, options.scopeKey]);

  const begin = useCallback((stopId: string, pointerId: number | null = null) => {
    if (pendingRef.current || fixedOrder || lockedStopIds.includes(stopId) || !stopIds.includes(stopId)) return false;
    setAnnouncement("");
    gestureRef.current = { movedId: stopId, fingerprint: builderStopOrderFingerprint(stopIds), pointerId, scope: scopeRef.current };
    setDraggingId(stopId);
    publishPreview(null);
    return true;
  }, [fixedOrder, lockedStopIds, publishPreview, stopIds]);

  const previewAt = useCallback((stopId: string, targetIndex: number, clearInvalid = false) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.movedId !== stopId) return;
    if (gesture.scope !== scopeRef.current) { cancel(); return; }
    const next = moveOccurrenceId(stopIdsRef.current, stopId, targetIndex);
    if (!next) { if (clearInvalid) publishPreview(null); return; }
    const current = stopIdsRef.current.map((id) => ({ id }));
    const result = validateBuilderStopOrder(current, next, {
      expectedFingerprint: gesture.fingerprint,
      lockedStopIds,
      fixedOrder,
    });
    if (result.ok) publishPreview(result.ids);
    else if (clearInvalid) publishPreview(null);
  }, [fixedOrder, lockedStopIds, publishPreview]);

  const previewActiveAt = useCallback((targetIndex: number) => {
    const movedId = gestureRef.current?.movedId;
    if (movedId) previewAt(movedId, targetIndex, true);
  }, [previewAt]);

  const commit = useCallback(async (ids: readonly string[], source: ReorderSource, movedId: string) => {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    const scope = scopeRef.current;
    setAnnouncement("Applying route order…");
    try {
      const accepted = await onCommit(ids, source);
      if (scopeRef.current !== scope) return accepted;
      setAnnouncement(accepted
        ? `${options.stopLabels?.[movedId] ?? movedId} moved to position ${ids.indexOf(movedId) + 1} of ${ids.length}.`
        : "Move not applied. Review the current route.");
      return accepted;
    } catch {
      if (scopeRef.current === scope) setAnnouncement("Move not applied. Review the current route.");
      return false;
    } finally { pendingRef.current = false; }
  }, [onCommit, options.stopLabels]);

  const drop = useCallback(() => {
    const gesture = gestureRef.current;
    const proposed = previewRef.current;
    if (!gesture || !proposed || gesture.scope !== scopeRef.current) { cancel(); return false; }
    const current = stopIdsRef.current.map((id) => ({ id }));
    const result = validateBuilderStopOrder(current, proposed, {
      expectedFingerprint: gesture.fingerprint,
      lockedStopIds,
      fixedOrder,
    });
    if (!result.ok) { cancel(); return false; }
    const accepted = commit(result.ids, "drag", gesture.movedId);
    cancel();
    return accepted;
  }, [cancel, commit, fixedOrder, lockedStopIds]);

  const moveFromMenu = useCallback((stopId: string, targetIndex: number) => {
    const next = moveOccurrenceId(stopIdsRef.current, stopId, targetIndex);
    if (!next) return false;
    const current = stopIdsRef.current.map((id) => ({ id }));
    const result = validateBuilderStopOrder(current, next, { lockedStopIds, fixedOrder });
    return result.ok ? commit(result.ids, "move-menu", stopId) : false;
  }, [commit, fixedOrder, lockedStopIds]);

  const canMoveFromMenu = useCallback((stopId: string, targetIndex: number) => {
    if (pendingRef.current) return false;
    const next = moveOccurrenceId(stopIdsRef.current, stopId, targetIndex);
    return Boolean(next && validateBuilderStopOrder(stopIdsRef.current.map(id => ({ id })), next, { lockedStopIds, fixedOrder }).ok);
  }, [fixedOrder, lockedStopIds]);

  const pointerTargetIndex = (event: PointerEvent<HTMLElement>) => {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(`[${targetAttribute}]`);
    const surface = event.currentTarget.closest("[data-builder-reorder-surface]");
    if (!surface || !target || target.closest("[data-builder-reorder-surface]") !== surface) return NaN;
    const rawIndex = target.getAttribute(targetAttribute);
    return rawIndex === null ? NaN : Number(rawIndex);
  };

  const gripProps = useCallback((stopId: string): HTMLAttributes<HTMLElement> => ({
    onClick: (event) => { event.preventDefault(); event.stopPropagation(); },
    draggable: !fixedOrder && !lockedStopIds.includes(stopId),
    "aria-grabbed": draggingId === stopId,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      if (!begin(stopId)) { event.preventDefault(); return; }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", stopId);
    },
    onDragEnd: () => cancel(),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") { if (gestureRef.current) { event.preventDefault(); cancel(); setAnnouncement("Reorder cancelled."); } return; }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (draggingId === stopId) drop(); else begin(stopId);
        return;
      }
      if (draggingId !== stopId) return;
      const index = (previewRef.current ?? stopIdsRef.current).indexOf(stopId);
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); previewAt(stopId, index - 1); }
      if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); previewAt(stopId, index + 1); }
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse" || event.isPrimary === false || event.button !== 0 || !begin(stopId, event.pointerId)) return;
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (gestureRef.current?.pointerId !== event.pointerId) return;
      previewAt(stopId, pointerTargetIndex(event), true);
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (gestureRef.current?.pointerId !== event.pointerId) return;
      previewAt(stopId, pointerTargetIndex(event), true);
      const accepted = drop();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return accepted;
    },
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
      if (gestureRef.current?.pointerId === event.pointerId) cancel();
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      // Native mouse drag emits pointercancel after dragstart; only captured touch/pen gestures own this cancellation.
      if (gestureRef.current?.pointerId === event.pointerId) cancel();
    },
  } as HTMLAttributes<HTMLElement>), [begin, cancel, draggingId, drop, fixedOrder, lockedStopIds, previewAt, targetAttribute]);

  return { draggingId: gestureRef.current?.scope === scopeRef.current ? draggingId : null, previewIds: gestureRef.current?.scope === scopeRef.current ? previewIds : null, announcement, gripProps, previewAt, previewActiveAt, drop, cancel, moveFromMenu, canMoveFromMenu };
}

/** Restore a completed menu action only while that same menu still owns focus. */
export async function completeBuilderMenuMove(
  button: HTMLButtonElement,
  move: () => boolean | Promise<boolean>,
  scopeIsCurrent: () => boolean,
): Promise<boolean> {
  const details = button.closest("details");
  const ownedFocus = Boolean(details?.contains(document.activeElement));
  const accepted = await move();
  if (ownedFocus && scopeIsCurrent() && details?.isConnected && details.contains(document.activeElement)) {
    details.open = false;
    details.querySelector("summary")?.focus();
  }
  return accepted;
}
