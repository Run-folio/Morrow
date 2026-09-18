"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type HTMLAttributes, type KeyboardEvent, type PointerEvent } from "react";
import { builderStopOrderFingerprint, validateBuilderStopOrder } from "../../../lib/easyt/trip-builder-order.ts";

export function moveOccurrenceId(
  currentIds: readonly string[],
  movedId: string,
  targetIndex: number,
): string[] | null {
  const sourceIndex = currentIds.indexOf(movedId);
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= currentIds.length) return null;
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
  onPreview: (ids: readonly string[] | null) => void;
  onCommit: (ids: readonly string[], source: ReorderSource) => boolean;
}) {
  const { stopIds, lockedStopIds, fixedOrder, onPreview, onCommit } = options;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState<readonly string[] | null>(null);
  const gestureRef = useRef<{ movedId: string; fingerprint: string; pointerId: number | null } | null>(null);
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

  useEffect(() => cancel, [cancel]);

  const begin = useCallback((stopId: string, pointerId: number | null = null) => {
    if (fixedOrder || lockedStopIds.includes(stopId)) return false;
    gestureRef.current = { movedId: stopId, fingerprint: builderStopOrderFingerprint(stopIds), pointerId };
    setDraggingId(stopId);
    publishPreview(null);
    return true;
  }, [fixedOrder, lockedStopIds, publishPreview, stopIds]);

  const previewAt = useCallback((stopId: string, targetIndex: number) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.movedId !== stopId) return;
    const next = moveOccurrenceId(stopIdsRef.current, stopId, targetIndex);
    if (!next) return;
    const current = stopIdsRef.current.map((id) => ({ id }));
    const result = validateBuilderStopOrder(current, next, {
      expectedFingerprint: gesture.fingerprint,
      lockedStopIds,
      fixedOrder,
    });
    if (result.ok) publishPreview(result.ids);
  }, [fixedOrder, lockedStopIds, publishPreview]);

  const commit = useCallback((ids: readonly string[], source: ReorderSource) => onCommit(ids, source), [onCommit]);

  const drop = useCallback(() => {
    const gesture = gestureRef.current;
    const proposed = previewRef.current;
    if (!gesture || !proposed) { cancel(); return false; }
    const current = stopIdsRef.current.map((id) => ({ id }));
    const result = validateBuilderStopOrder(current, proposed, {
      expectedFingerprint: gesture.fingerprint,
      lockedStopIds,
      fixedOrder,
    });
    if (!result.ok) { cancel(); return false; }
    const accepted = commit(result.ids, "drag");
    cancel();
    return accepted;
  }, [cancel, commit, fixedOrder, lockedStopIds]);

  const moveFromMenu = useCallback((stopId: string, targetIndex: number) => {
    const next = moveOccurrenceId(stopIdsRef.current, stopId, targetIndex);
    if (!next) return false;
    const current = stopIdsRef.current.map((id) => ({ id }));
    const result = validateBuilderStopOrder(current, next, { lockedStopIds, fixedOrder });
    return result.ok ? commit(result.ids, "move-menu") : false;
  }, [commit, fixedOrder, lockedStopIds]);

  const gripProps = useCallback((stopId: string): HTMLAttributes<HTMLElement> => ({
    draggable: !fixedOrder && !lockedStopIds.includes(stopId),
    "aria-grabbed": draggingId === stopId,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      if (!begin(stopId)) { event.preventDefault(); return; }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", stopId);
    },
    onDragEnd: () => cancel(),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") { event.preventDefault(); cancel(); return; }
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
      if (event.pointerType === "mouse" || !begin(stopId, event.pointerId)) return;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (gestureRef.current?.pointerId !== event.pointerId) return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-builder-stop-index]");
      const targetIndex = Number(target?.dataset.builderStopIndex);
      if (Number.isInteger(targetIndex)) previewAt(stopId, targetIndex);
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (gestureRef.current?.pointerId !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      drop();
    },
    onPointerCancel: () => cancel(),
  } as HTMLAttributes<HTMLElement>), [begin, cancel, draggingId, drop, fixedOrder, lockedStopIds, previewAt]);

  return { draggingId, previewIds, gripProps, previewAt, drop, cancel, moveFromMenu };
}
