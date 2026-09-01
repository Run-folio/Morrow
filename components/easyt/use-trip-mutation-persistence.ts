"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  cacheCanonicalTrip,
  EasyTTripAuthError,
  EasyTTripPromotionConflictError,
  EasyTTripSaveConflictError,
  loadTripRecovery,
  markTripRecoveryState,
  saveTripRecovery,
  saveTripRecoveryToEasyT,
  type TripRecoveryHandle,
} from "@/lib/easyt/storage";
import { cloneItineraryMutationDocument } from "@/lib/easyt/itinerary-mutations";
import { createTripMutationPersistenceQueue } from "@/lib/easyt/trip-mutation-persistence";
import type { EasyTTrip } from "@/lib/easyt/trip";

export type TripMutationSaveState = "idle" | "device" | "saving" | "saved" | "error";
export type TripMutationFailure = "auth" | "conflict" | "recovery" | "network" | null;

/**
 * The Itinerary uses the same durable mutation sequence as Map:
 * optimistic canonical EasyTTrip -> exact recovery handle -> serialized CAS
 * queue -> canonical cache acknowledgement. No page-specific trip model is
 * introduced here.
 */
export function useTripMutationPersistence(initialTrip: EasyTTrip, enabled: boolean) {
  const { data: session } = authClient.useSession();
  const [trip, setTripState] = useState(initialTrip);
  const [saveState, setSaveState] = useState<TripMutationSaveState>("idle");
  const [failure, setFailure] = useState<TripMutationFailure>(null);
  const [error, setError] = useState("");
  const [pendingKeys, setPendingKeys] = useState<Record<string, number>>({});
  const tripRef = useRef(initialTrip);
  const recoveryHandleRef = useRef<TripRecoveryHandle | null>(null);
  const queueRef = useRef(createTripMutationPersistenceQueue(saveTripRecoveryToEasyT));
  const propIdentityRef = useRef(`${initialTrip.id}:${initialTrip.ownerId ?? "guest"}:${initialTrip.updatedAt}`);
  const ownerScopeRef = useRef(initialTrip.ownerId);
  const conflictRef = useRef(false);

  useEffect(() => {
    const identity = `${initialTrip.id}:${initialTrip.ownerId ?? "guest"}:${initialTrip.updatedAt}`;
    if (identity === propIdentityRef.current) return;
    propIdentityRef.current = identity;
    ownerScopeRef.current = initialTrip.ownerId;
    tripRef.current = initialTrip;
    setTripState(initialTrip);
    setSaveState("idle");
    setFailure(null);
    setError("");
    conflictRef.current = false;
    const recovery = loadTripRecovery(initialTrip.id, initialTrip.ownerId);
    const matchingRecovery = recovery && JSON.stringify(recovery.trip) === JSON.stringify(initialTrip);
    recoveryHandleRef.current = matchingRecovery ? recovery : null;
    if (recovery && !matchingRecovery) {
      conflictRef.current = true;
      setFailure("recovery");
      setError("This browser has newer trip changes saved separately. Review them before editing this version.");
      setSaveState("error");
    }
    queueRef.current.reset(initialTrip);
  }, [initialTrip]);

  useEffect(() => {
    const recovery = loadTripRecovery(initialTrip.id, initialTrip.ownerId);
    const matchingRecovery = recovery && JSON.stringify(recovery.trip) === JSON.stringify(initialTrip);
    recoveryHandleRef.current = matchingRecovery ? recovery : null;
    if (recovery && !matchingRecovery) {
      conflictRef.current = true;
      setFailure("recovery");
      setError("This browser has newer trip changes saved separately. Review them before editing this version.");
      setSaveState("error");
    }
    queueRef.current.reset(initialTrip);
  }, []); // The initial document establishes the queue's only trusted CAS base.

  const updatePending = useCallback((key: string, delta: 1 | -1) => {
    setPendingKeys((current) => {
      const nextCount = Math.max(0, (current[key] ?? 0) + delta);
      if (nextCount === 0) {
        const { [key]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [key]: nextCount };
    });
  }, []);

  const cacheSavedTrip = useCallback((saved: EasyTTrip, recovery: TripRecoveryHandle) => {
    const current = recoveryHandleRef.current;
    const isCurrentRecovery = current?.ownerId === recovery.ownerId
      && current.tripId === recovery.tripId
      && current.writeId === recovery.writeId
      && ownerScopeRef.current === recovery.ownerId;
    const cached = cacheCanonicalTrip(saved, recovery);
    const remainingRecovery = loadTripRecovery(saved.id, recovery.ownerId);
    const acknowledged = isCurrentRecovery && cached.stored && !remainingRecovery;
    if (acknowledged) recoveryHandleRef.current = null;
    else if (isCurrentRecovery && remainingRecovery) {
      recoveryHandleRef.current = null;
      conflictRef.current = true;
      setFailure("recovery");
      setError("Newer changes on this device were preserved while this version finished syncing. Review them before continuing.");
      setSaveState("error");
    }
    return acknowledged;
  }, []);

  const mutateTrip = useCallback((
    update: (current: EasyTTrip) => EasyTTrip,
    pendingKey: string,
  ) => {
    if (!enabled || conflictRef.current) return false;
    const current = tripRef.current;
    const sessionOwnerId = session?.user?.id ?? null;
    if (sessionOwnerId && current.ownerId && sessionOwnerId !== current.ownerId) {
      setFailure("auth");
      setError("This trip belongs to a different account. Reopen it from the current account before editing.");
      setSaveState("error");
      return false;
    }

    const next = update(cloneItineraryMutationDocument(current));
    if (JSON.stringify(next) === JSON.stringify(current)) return false;
    const ownerId = current.ownerId;
    const previousHandle = recoveryHandleRef.current;
    const replacement = previousHandle?.tripId === current.id && previousHandle.ownerId === ownerId
      ? previousHandle
      : undefined;
    const recovery = saveTripRecovery(next, { ownerId, replace: replacement });
    if (!recovery.stored) {
      setFailure("recovery");
      setError(recovery.blockedByExistingRecovery
        ? "This browser has newer trip changes saved separately. Review them before editing this version."
        : "Browser storage is unavailable, so this change was not applied.");
      setSaveState("error");
      return false;
    }

    recoveryHandleRef.current = recovery.handle;
    tripRef.current = next;
    setTripState(next);
    setFailure(null);
    setError("");
    setSaveState(sessionOwnerId ? "saving" : "device");
    updatePending(pendingKey, 1);

    if (!sessionOwnerId) {
      updatePending(pendingKey, -1);
      return true;
    }

    void queueRef.current.enqueue(next, recovery.handle)
      .then((saved) => {
        if (!cacheSavedTrip(saved, recovery.handle)) return;
        ownerScopeRef.current = saved.ownerId;
        tripRef.current = saved;
        setTripState(saved);
        setFailure(null);
        setError("");
        setSaveState("saved");
      })
      .catch((caught: unknown) => {
        const conflict = caught instanceof EasyTTripSaveConflictError || caught instanceof EasyTTripPromotionConflictError;
        const auth = caught instanceof EasyTTripAuthError;
        markTripRecoveryState(recovery.handle, auth ? "auth" : conflict ? "conflict" : "network");
        if (recoveryHandleRef.current?.writeId !== recovery.handle.writeId) return;
        conflictRef.current = conflict;
        setFailure(auth ? "auth" : conflict ? "conflict" : "network");
        setError(auth
          ? "Your session expired. Your edits remain safe on this device; sign in again to sync them."
          : conflict
            ? "This trip changed on another device. Your edits remain safe here and did not replace the account copy."
            : "Couldn’t save this trip just now. Your edits remain safe on this device.");
        setSaveState("error");
      })
      .finally(() => updatePending(pendingKey, -1));
    return true;
  }, [cacheSavedTrip, enabled, session?.user?.id, updatePending]);

  useEffect(() => {
    const sessionOwnerId = session?.user?.id;
    const recovery = recoveryHandleRef.current;
    if (!enabled || !sessionOwnerId || saveState !== "device" || !recovery) return;
    const current = tripRef.current;
    if (current.ownerId && current.ownerId !== sessionOwnerId) {
      setFailure("auth");
      setError("This trip belongs to a different account. Reopen it from the current account before editing.");
      setSaveState("error");
      return;
    }
    setSaveState("saving");
    void queueRef.current.enqueue(current, recovery)
      .then((saved) => {
        if (!cacheSavedTrip(saved, recovery)) return;
        ownerScopeRef.current = saved.ownerId;
        tripRef.current = saved;
        setTripState(saved);
        setFailure(null);
        setError("");
        setSaveState("saved");
      })
      .catch((caught: unknown) => {
        const conflict = caught instanceof EasyTTripSaveConflictError || caught instanceof EasyTTripPromotionConflictError;
        const auth = caught instanceof EasyTTripAuthError;
        markTripRecoveryState(recovery, auth ? "auth" : conflict ? "conflict" : "network");
        if (recoveryHandleRef.current?.writeId !== recovery.writeId) return;
        conflictRef.current = conflict;
        setFailure(auth ? "auth" : conflict ? "conflict" : "network");
        setError(auth
          ? "Your session expired. Your edits remain safe on this device; sign in again to sync them."
          : conflict
            ? "This trip changed on another device. Your edits remain safe here and did not replace the account copy."
            : "Couldn’t save this trip just now. Your edits remain safe on this device.");
        setSaveState("error");
      });
  }, [cacheSavedTrip, enabled, saveState, session?.user?.id]);

  const acceptCanonicalTrip = useCallback((saved: EasyTTrip) => {
    if (saved.id !== tripRef.current.id || saved.ownerId !== tripRef.current.ownerId) return false;
    const cached = cacheCanonicalTrip(saved);
    if (!cached.stored) {
      setFailure("recovery");
      setError("The account change succeeded, but this browser could not refresh its canonical cache.");
      setSaveState("error");
      return false;
    }
    const recoveryOwnerId = recoveryHandleRef.current?.ownerId ?? saved.ownerId;
    if (loadTripRecovery(saved.id, recoveryOwnerId)) {
      conflictRef.current = true;
      setFailure("recovery");
      setError("The saved trip changed, while newer changes on this device remain preserved separately. Review them before continuing.");
      setSaveState("error");
      return false;
    }
    tripRef.current = saved;
    ownerScopeRef.current = saved.ownerId;
    setTripState(saved);
    queueRef.current.reset(saved);
    conflictRef.current = false;
    setFailure(null);
    setError("");
    setSaveState("saved");
    return true;
  }, []);

  return {
    acceptCanonicalTrip,
    error,
    failure,
    isPending: (key: string) => Boolean(pendingKeys[key]),
    mutateTrip,
    saveState,
    trip,
  };
}
