"use client";

import { useEffect, useRef } from "react";
import { EASYT_NEW_TRIP_INPUT_CHANGE_EVENT } from "@/lib/easyt/storage";
import type { NewTripNavigationRecoveryAcknowledgement } from "@/lib/easyt/storage";

/** Keep one preservation request attached to its mounted owner and source. */
export function useNewTripNavigationScope(getOwnerId: () => string | null, intentKey: string) {
  const renderOwnerId = getOwnerId();
  const latestRef = useRef({ getOwnerId, intentKey, ownerId: renderOwnerId, generation: 0 });
  const previous = latestRef.current;
  latestRef.current = { getOwnerId, intentKey, ownerId: renderOwnerId,
    generation: previous.generation + (previous.ownerId !== renderOwnerId || previous.intentKey !== intentKey ? 1 : 0) };
  const mountedRef = useRef(true);
  const pendingRef = useRef<object | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    const retireForInput = () => { latestRef.current.generation++; };
    window.addEventListener(EASYT_NEW_TRIP_INPUT_CHANGE_EVENT, retireForInput);
    return () => { mountedRef.current = false; pendingRef.current = null;
      window.removeEventListener(EASYT_NEW_TRIP_INPUT_CHANGE_EVENT, retireForInput); };
  }, []);

  return { start() {
    if (!mountedRef.current || pendingRef.current) return null;
    const ownerId = latestRef.current.getOwnerId(), intent = latestRef.current.intentKey, generation = latestRef.current.generation;
    const source = new URL(window.location.href), token = {};
    const selectorKeys = ["trip", "inspire", "homeDraft", "recover", "step"];
    const otherQuery = (url: URL) => JSON.stringify([...url.searchParams].filter(([key]) => !selectorKeys.includes(key)).sort());
    const sourceOtherQuery = otherQuery(source);
    pendingRef.current = token;
    let acceptedAcknowledgements: readonly NewTripNavigationRecoveryAcknowledgement[] = [];
    const isCurrent = (acknowledgements?: readonly NewTripNavigationRecoveryAcknowledgement[]) => {
      if (!mountedRef.current || pendingRef.current !== token || latestRef.current.generation !== generation || latestRef.current.intentKey !== intent
        || latestRef.current.getOwnerId() !== ownerId) return false;
      if (acknowledgements) acceptedAcknowledgements = acknowledgements.map(({ sourceHref, tripId }) => ({ sourceHref, tripId }));
      const current = new URL(window.location.href);
      if (current.origin !== source.origin || current.pathname !== source.pathname || otherQuery(current) !== sourceOtherQuery) return false;
      const sameSource = ["trip", "inspire", "homeDraft"].every(key =>
        JSON.stringify(current.searchParams.getAll(key)) === JSON.stringify(source.searchParams.getAll(key)));
      const sourceRecover = source.searchParams.get("recover"), currentRecover = current.searchParams.get("recover");
      if (sameSource) return currentRecover === sourceRecover
        || (sourceRecover === null || sourceRecover === "1") && (currentRecover === null || currentRecover === "1");
      const acknowledgedTripIds = new Set(acceptedAcknowledgements.filter(ack => ack.sourceHref === source.href).map(ack => ack.tripId));
      // Only an accepted listener's exact source/trip acknowledgement can
      // authorize replacement of a handoff address by its durable trip.
      return acknowledgedTripIds.size === 1 && acknowledgedTripIds.has(current.searchParams.get("trip") ?? "")
        && !source.searchParams.has("trip") && (source.searchParams.has("inspire") || source.searchParams.get("homeDraft") === "1")
        && Boolean(current.searchParams.get("trip")) && current.searchParams.getAll("trip").length === 1
        && !current.searchParams.has("inspire") && !current.searchParams.has("homeDraft") && currentRecover === "1";
    };
    return { ownerId, isCurrent, finish() { if (pendingRef.current === token) pendingRef.current = null; } };
  } };
}
