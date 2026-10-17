"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  acknowledgeTripBuildSave,
  BrowserRecoveryReadError,
  cacheCanonicalTrip,
  classifyTripRecovery,
  EasyTTripAuthError,
  EasyTTripPromotionConflictError,
  EasyTTripSaveConflictError,
  expectCanonicalSave,
  loadCachedTrip,
  loadTripRecovery,
  markTripRecoveryState,
  saveTripRecovery,
  saveTripRecoveryToEasyT,
  type TripRecoveryHandle,
} from "@/lib/easyt/storage";
import { cloneItineraryMutationDocument } from "@/lib/easyt/itinerary-mutations";
import { createTripMutationPersistenceQueue, newestTripMutationCanonical } from "@/lib/easyt/trip-mutation-persistence";
import { canonicalTripRevisionCanReplace } from "@/lib/easyt/trip-continuity";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { isMeaningfulFeedbackAcknowledgement, type MeaningfulFeedbackAction } from "@/lib/easyt/feedback-survey";

export type TripMutationSaveState = "idle" | "device" | "saving" | "saved" | "error";
export type TripMutationFailure = "auth" | "conflict" | "recovery" | "network" | null;
const handleKey = (handle: TripRecoveryHandle) => JSON.stringify([handle.ownerId, handle.tripId, handle.writeId]);
const tripIdentity = (trip: EasyTTrip) => `${trip.id}:${trip.ownerId ?? "guest"}:${trip.updatedAt}`;

function recoveryReadMessage(caught: unknown) {
  return caught instanceof BrowserRecoveryReadError && caught.kind === "protected"
    ? "Separate device changes remain protected. Review them before editing this trip."
    : "Device storage could not be checked. Try opening this trip again before editing.";
}

class TripMutationDeviceBoundaryError extends Error {
  readonly canonicalTrip: EasyTTrip | null;
  constructor(canonicalTrip: EasyTTrip | null = null) {
    super("Device recovery acknowledgement could not be verified.");
    this.canonicalTrip = canonicalTrip;
  }
}

/** One shared document: verified recovery -> serialized CAS -> exact account ACK. */
export function useTripMutationPersistence(initialTrip: EasyTTrip, enabled: boolean) {
  const { data: session } = authClient.useSession();
  const [trip, setTripState] = useState(initialTrip);
  const [saveState, setSaveState] = useState<TripMutationSaveState>("idle");
  const [failure, setFailure] = useState<TripMutationFailure>(null);
  const [conflictTrip, setConflictTrip] = useState<EasyTTrip | null>(null);
  const [error, setError] = useState("");
  const [historicalRecovery, setHistoricalRecovery] = useState(false);
  const [recoveryClassifiedFor, setRecoveryClassifiedFor] = useState<string | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [pendingKeys, setPendingKeys] = useState<Record<string, number>>({});
  const [lastAcknowledgedMutation, setLastAcknowledgedMutation] = useState<{ ownerId: string; tripId: string; pendingKey: string; writeId: string; feedbackAction: MeaningfulFeedbackAction } | null>(null);
  const tripRef = useRef(initialTrip);
  const recoveryHandleRef = useRef<TripRecoveryHandle | null>(null);
  const submittedDocumentsRef = useRef(new Map<string, EasyTTrip>());
  const queuedScopesRef = useRef(new Map<string, string>());
  const acknowledgementsRef = useRef(new Map<string, Awaited<ReturnType<typeof acknowledgeTripBuildSave>>>());
  const queueRef = useRef<ReturnType<typeof createTripMutationPersistenceQueue> | null>(null);
  const pendingSavesRef = useRef(new Set<Promise<EasyTTrip>>());
  const pendingLocalWritesRef = useRef(new Set<Promise<boolean>>());
  const localWriteTailRef = useRef<Promise<unknown>>(Promise.resolve());
  const localRecoveryWriteRef = useRef(false);
  const propIdentityRef = useRef("");
  const ownerScopeRef = useRef(initialTrip.ownerId);
  const mountedRef = useRef(true);
  const hydrationGenerationRef = useRef(0);
  const recoveryReadyRef = useRef(false);
  const conflictRef = useRef(false);
  const liveScopeRef = useRef("");
  liveScopeRef.current = JSON.stringify([initialTrip.id, initialTrip.ownerId, session?.user?.id ?? null, enabled]);
  const pendingMeaningfulFeedbackRef = useRef<{ ownerId: string; tripId: string; pendingKey: string; feedbackAction: MeaningfulFeedbackAction; originWriteId: string } | null>(null);
  const scopeIsCurrent = useCallback((scope: string) => mountedRef.current && liveScopeRef.current === scope, []);
  if (enabled && !queueRef.current) {
    queueRef.current = createTripMutationPersistenceQueue(async (outgoing, recovery) => {
      const key = handleKey(recovery), scope = queuedScopesRef.current.get(key);
      if (!scope || !scopeIsCurrent(scope)) throw new Error("The account save scope changed before submission.");
      if (!recoveryReadyRef.current || conflictRef.current) throw new TripMutationDeviceBoundaryError();
      const submitted = structuredClone(outgoing);
      submittedDocumentsRef.current.set(key, submitted);
      const saved = await saveTripRecoveryToEasyT(outgoing, recovery);
      // The queue's next CAS base advances only after the exact account ACK finishes.
      const acknowledged = await acknowledgeTripBuildSave(submitted, saved, recovery, { isCurrent: () => scopeIsCurrent(scope) });
      acknowledgementsRef.current.set(key, acknowledged);
      if (!acknowledged.accountAcknowledged || acknowledged.deviceOutcome === "unknown"
        || acknowledged.deviceOutcome === "protected-conflict" || acknowledged.deviceOutcome === "pointer-incomplete"
        || acknowledged.deviceOutcome === "receipt-incomplete") {
        if (scopeIsCurrent(scope)) { recoveryReadyRef.current = false; conflictRef.current = true; }
        throw new TripMutationDeviceBoundaryError(acknowledged.accountAcknowledged ? saved : null);
      }
      return saved;
    });
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; hydrationGenerationRef.current += 1; };
  }, []);

  const reportRecoveryReadFailure = useCallback((caught: unknown) => {
    conflictRef.current = true; recoveryReadyRef.current = false;
    setRecoveryReady(false); setRecoveryClassifiedFor(null);
    setHistoricalRecovery(caught instanceof BrowserRecoveryReadError && caught.kind === "protected");
    setFailure("recovery"); setError(recoveryReadMessage(caught)); setSaveState("error");
  }, []);

  useEffect(() => {
    const identity = tripIdentity(initialTrip), current = tripRef.current;
    const sameDocument = current.id === initialTrip.id && current.ownerId === initialTrip.ownerId;
    if (recoveryReadyRef.current && identity === propIdentityRef.current) return;
    // A stale layout or a still-running local/account write cannot reset the CAS base.
    if (sameDocument && recoveryReadyRef.current && !canonicalTripRevisionCanReplace(current, initialTrip)) return;
    if (sameDocument && (pendingSavesRef.current.size || pendingLocalWritesRef.current.size)) return;
    const generation = ++hydrationGenerationRef.current, scope = liveScopeRef.current;
    let cancelled = false;
    const isCurrent = () => !cancelled && scopeIsCurrent(scope)
      && generation === hydrationGenerationRef.current && tripRef.current === current;
    recoveryReadyRef.current = false; setRecoveryReady(false); setRecoveryClassifiedFor(null);
    void (async () => {
      try {
        const cached = await loadCachedTrip(initialTrip.id, initialTrip.ownerId);
        if (!isCurrent()) return;
        const canonical = newestTripMutationCanonical(initialTrip, cached, sameDocument ? current : null);
        const recovery = await loadTripRecovery(canonical.id, canonical.ownerId);
        if (!isCurrent()) return;
        const recoveryClass = classifyTripRecovery({ recovery, canonicalTrip: canonical });
        const activeLocalRecovery = recoveryClass === "active-local-document";
        const divergentRecovery = recoveryClass === "genuine-divergence";
        propIdentityRef.current = tripIdentity(canonical); ownerScopeRef.current = canonical.ownerId;
        tripRef.current = canonical; recoveryHandleRef.current = activeLocalRecovery ? recovery : null;
        conflictRef.current = divergentRecovery; recoveryReadyRef.current = true;
        setRecoveryReady(true); setTripState(canonical); setRecoveryClassifiedFor(propIdentityRef.current);
        setHistoricalRecovery(divergentRecovery); setSaveState(activeLocalRecovery ? "device" : "idle");
        setLastAcknowledgedMutation(null); pendingMeaningfulFeedbackRef.current = null;
        setFailure(null); setConflictTrip(null); setError(""); queueRef.current?.reset(canonical);
      } catch (caught) { if (isCurrent()) reportRecoveryReadFailure(caught); }
    })();
    return () => { cancelled = true; };
  }, [initialTrip, session?.user?.id, reportRecoveryReadFailure, scopeIsCurrent]);

  const updatePending = useCallback((key: string, delta: 1 | -1) => {
    if (!mountedRef.current) return;
    setPendingKeys((current) => {
      const nextCount = Math.max(0, (current[key] ?? 0) + delta);
      if (nextCount === 0) { const { [key]: _removed, ...rest } = current; return rest; }
      return { ...current, [key]: nextCount };
    });
  }, []);

  const cacheSavedTrip = useCallback(async (saved: EasyTTrip, recovery: TripRecoveryHandle, scope: string) => {
    try {
      const acknowledged = acknowledgementsRef.current.get(handleKey(recovery));
      if (!acknowledged) throw new Error("The exact account acknowledgement is unavailable.");
      if (!scopeIsCurrent(scope)) return false;
      const current = recoveryHandleRef.current;
      const isCurrentRecovery = current?.ownerId === recovery.ownerId && current.tripId === recovery.tripId
        && current.writeId === recovery.writeId && ownerScopeRef.current === recovery.ownerId;
      if (!isCurrentRecovery) return false;
      // Exact account authority is independent of the optional offline cache.
      if (acknowledged.accountAcknowledged && !acknowledged.remainingRecovery
        && acknowledged.deviceOutcome !== "unknown" && acknowledged.deviceOutcome !== "protected-conflict"
        && acknowledged.deviceOutcome !== "pointer-incomplete") { recoveryHandleRef.current = null; return true; }
      if (acknowledged.accountAcknowledged) {
        ownerScopeRef.current = saved.ownerId; tripRef.current = saved; setTripState(saved);
      }
      if (acknowledged.remainingRecovery || acknowledged.deviceOutcome === "protected-conflict") {
        recoveryHandleRef.current = null; conflictRef.current = true; setHistoricalRecovery(true); setFailure("recovery");
        setError("Newer changes on this device were preserved while this version finished syncing. Review them before continuing."); setSaveState("error");
      } else reportRecoveryReadFailure(new Error("Account acknowledgement could not be verified on this device."));
      return false;
    } catch (caught) { if (scopeIsCurrent(scope)) reportRecoveryReadFailure(caught); return false; }
    finally { submittedDocumentsRef.current.delete(handleKey(recovery)); acknowledgementsRef.current.delete(handleKey(recovery)); }
  }, [reportRecoveryReadFailure, scopeIsCurrent]);

  const handleSaveFailure = useCallback(async (caught: unknown, recovery: TripRecoveryHandle, scope: string) => {
    if (caught instanceof TripMutationDeviceBoundaryError) {
      if (!scopeIsCurrent(scope)) return;
      if (caught.canonicalTrip && recoveryHandleRef.current?.writeId === recovery.writeId) {
        ownerScopeRef.current = caught.canonicalTrip.ownerId;
        tripRef.current = caught.canonicalTrip;
        setTripState(caught.canonicalTrip);
      }
      recoveryReadyRef.current = false; conflictRef.current = true;
      setRecoveryReady(false); setRecoveryClassifiedFor(null); setHistoricalRecovery(true);
      setFailure("recovery");
      setError(caught.canonicalTrip
        ? "This version was saved to your account, but device recovery could not be verified. Reopen the trip before continuing."
        : "Device recovery could not be verified. Reopen the trip before continuing.");
      setSaveState("error");
      return;
    }
    const conflict = caught instanceof EasyTTripSaveConflictError || caught instanceof EasyTTripPromotionConflictError;
    const auth = caught instanceof EasyTTripAuthError;
    await markTripRecoveryState(recovery, auth ? "auth" : conflict ? "conflict" : "network").catch(() => false);
    if (!scopeIsCurrent(scope) || recoveryHandleRef.current?.writeId !== recovery.writeId) return;
    if (pendingMeaningfulFeedbackRef.current?.originWriteId === recovery.writeId) pendingMeaningfulFeedbackRef.current = null;
    conflictRef.current = conflict; setConflictTrip(conflict ? caught.canonicalTrip : null);
    if (conflict) {
      // A conflict response is already account authority; cache failure cannot erase it.
      await cacheCanonicalTrip(caught.canonicalTrip).catch(() => undefined);
      if (!scopeIsCurrent(scope) || recoveryHandleRef.current?.writeId !== recovery.writeId) return;
      ownerScopeRef.current = caught.canonicalTrip.ownerId; tripRef.current = caught.canonicalTrip;
      setTripState(caught.canonicalTrip); queueRef.current?.reset(caught.canonicalTrip);
    }
    setFailure(auth ? "auth" : conflict ? "conflict" : "network"); setHistoricalRecovery(false);
    setError(auth ? "Your session expired. Your edits remain safe on this device; sign in again to sync them."
      : conflict ? "This trip changed on another device. Your edits remain safe here and did not replace the account copy."
        : "Couldn’t save this trip just now. Your edits remain safe on this device."); setSaveState("error");
  }, [scopeIsCurrent]);

  const enqueueAccountSave = useCallback((outgoing: EasyTTrip, recovery: TripRecoveryHandle, scope: string, authoredFrom?: EasyTTrip) => {
    queuedScopesRef.current.set(handleKey(recovery), scope);
    const request = queueRef.current!.enqueue(outgoing, recovery, authoredFrom);
    // Include ACK/readback in the pending boundary observed by navigation and export.
    const pendingSave = request.then(async (saved) => {
      if (!await cacheSavedTrip(saved, recovery, scope)) return saved;
      if (!scopeIsCurrent(scope)) return saved;
      const meaningful = pendingMeaningfulFeedbackRef.current;
      if (meaningful && meaningful.ownerId === saved.ownerId && meaningful.tripId === saved.id) {
        setLastAcknowledgedMutation({ ownerId: meaningful.ownerId, tripId: meaningful.tripId, pendingKey: meaningful.pendingKey, feedbackAction: meaningful.feedbackAction, writeId: recovery.writeId }); pendingMeaningfulFeedbackRef.current = null;
      }
      ownerScopeRef.current = saved.ownerId; tripRef.current = saved; setTripState(saved);
      setFailure(null); setError(""); setHistoricalRecovery(false); setSaveState("saved"); return saved;
    }, async (caught: unknown) => { await handleSaveFailure(caught, recovery, scope); throw caught; });
    pendingSavesRef.current.add(pendingSave);
    void pendingSave.finally(() => {
      pendingSavesRef.current.delete(pendingSave); submittedDocumentsRef.current.delete(handleKey(recovery));
      queuedScopesRef.current.delete(handleKey(recovery)); acknowledgementsRef.current.delete(handleKey(recovery));
    }).catch(() => undefined);
    return pendingSave;
  }, [cacheSavedTrip, handleSaveFailure, scopeIsCurrent]);

  const mutateTrip = useCallback((update: (current: EasyTTrip) => EasyTTrip, pendingKey: string, feedbackAction?: MeaningfulFeedbackAction): Promise<boolean> => {
    const scope = liveScopeRef.current;
    if (!enabled || !recoveryReadyRef.current || !scopeIsCurrent(scope)) return Promise.resolve(false);
    updatePending(pendingKey, 1);
    const operation = localWriteTailRef.current.then(async () => {
      if (!scopeIsCurrent(scope) || !recoveryReadyRef.current) return false;
      if (conflictRef.current) { setFailure("recovery"); setHistoricalRecovery(true); setError("Review the separate device copy before editing this cloud version."); setSaveState("error"); return false; }
      const current = tripRef.current, sessionOwnerId = session?.user?.id ?? null;
      if (current.ownerId && sessionOwnerId !== current.ownerId) { setFailure("auth"); setError("Sign in to this trip’s account before editing or syncing it."); setSaveState("error"); return false; }
      // Guest work stays on its exact device scope until the explicit claim flow
      // supplies an owner-scoped handle. A signed-in session alone is not a claim.
      const accountOwnerId = current.ownerId && current.ownerId === sessionOwnerId ? sessionOwnerId : null;
      const next = update(cloneItineraryMutationDocument(current));
      if (JSON.stringify(next) === JSON.stringify(current)) return false;
      const previousHandle = recoveryHandleRef.current;
      const replacement = previousHandle?.tripId === current.id && previousHandle.ownerId === current.ownerId ? previousHandle : undefined;
      const isCurrent = () => scopeIsCurrent(scope) && tripRef.current === current && !conflictRef.current;
      localRecoveryWriteRef.current = true; setSaveState("saving");
      try {
        const recovery = await saveTripRecovery(next, { ownerId: current.ownerId, replace: replacement, accountSavePending: Boolean(accountOwnerId), canonicalBase: current, isCurrent });
        if (!isCurrent()) return false;
        if (!recovery.stored) {
          setFailure("recovery"); conflictRef.current = Boolean(recovery.blockedByExistingRecovery); setHistoricalRecovery(Boolean(recovery.blockedByExistingRecovery));
          setError(recovery.blockedByExistingRecovery ? "This browser has newer trip changes saved separately. Review them before editing this version." : "Browser storage is unavailable, so this change was not applied."); setSaveState("error"); return false;
        }
        recoveryHandleRef.current = recovery.handle;
        if (accountOwnerId && feedbackAction && isMeaningfulFeedbackAcknowledgement(pendingKey, feedbackAction)) pendingMeaningfulFeedbackRef.current = { ownerId: accountOwnerId, tripId: next.id, pendingKey, feedbackAction, originWriteId: recovery.handle.writeId };
        setHistoricalRecovery(false); tripRef.current = next; setTripState(next); setFailure(null); setConflictTrip(null);
        setError(!accountOwnerId && sessionOwnerId ? "This trip is saved on this device. Open the sign-in save flow to claim it for your account." : "");
        setSaveState(accountOwnerId ? "saving" : "device");
        if (accountOwnerId) {
          const pendingSave = enqueueAccountSave(next, recovery.handle, scope, current);
          updatePending(pendingKey, 1);
          void pendingSave.finally(() => updatePending(pendingKey, -1)).catch(() => undefined);
        }
        return true;
      } catch (caught) { if (scopeIsCurrent(scope)) reportRecoveryReadFailure(caught); return false; }
      finally { localRecoveryWriteRef.current = false; }
    });
    pendingLocalWritesRef.current.add(operation); localWriteTailRef.current = operation.catch(() => false);
    void operation.finally(() => { pendingLocalWritesRef.current.delete(operation); updatePending(pendingKey, -1); }).catch(() => undefined);
    return operation;
  }, [enabled, enqueueAccountSave, reportRecoveryReadFailure, scopeIsCurrent, session?.user?.id, updatePending]);

  useEffect(() => {
    const sessionOwnerId = session?.user?.id, recovery = recoveryHandleRef.current;
    if (!enabled || !sessionOwnerId || saveState !== "device" || !recovery || !recoveryReadyRef.current || pendingSavesRef.current.size || pendingLocalWritesRef.current.size) return;
    const current = tripRef.current;
    if (!current.ownerId || recovery.ownerId !== sessionOwnerId) return;
    if (current.ownerId && current.ownerId !== sessionOwnerId) { setFailure("auth"); setError("This trip belongs to a different account. Reopen it from the current account before editing."); setSaveState("error"); return; }
    setSaveState("saving"); expectCanonicalSave(recovery); enqueueAccountSave(current, recovery, liveScopeRef.current);
  }, [enabled, enqueueAccountSave, recoveryReady, saveState, session?.user?.id]);

  const waitForPending = useCallback(async () => {
    while (pendingLocalWritesRef.current.size || pendingSavesRef.current.size) {
      const localResults = await Promise.all([...pendingLocalWritesRef.current]);
      if (localResults.some(accepted => !accepted)) throw new TripMutationDeviceBoundaryError();
      await Promise.all([...pendingSavesRef.current]);
    }
    return tripRef.current;
  }, []);
  const hasPendingSaves = useCallback(() => pendingSavesRef.current.size > 0 || pendingLocalWritesRef.current.size > 0, []);

  // Read-only eligibility for account-level actions. A resolved save waiter is
  // insufficient when its exact device acknowledgement could not be verified.
  const isAccountCopySettled = useCallback(() => {
    const current = tripRef.current;
    const scope = JSON.stringify([initialTrip.id, initialTrip.ownerId, session?.user?.id ?? null, enabled]);
    return enabled && scopeIsCurrent(scope) && recoveryReadyRef.current && !conflictRef.current
      && current.id === initialTrip.id && current.ownerId === initialTrip.ownerId
      && Boolean(current.ownerId) && current.ownerId === session?.user?.id
      && recoveryHandleRef.current === null && !hasPendingSaves();
  }, [enabled, initialTrip.id, initialTrip.ownerId, session?.user?.id, scopeIsCurrent, hasPendingSaves]);

  const adoptDeviceTrip = useCallback(async (next: EasyTTrip) => {
    if (localRecoveryWriteRef.current || pendingSavesRef.current.size || pendingLocalWritesRef.current.size) return false;
    const current = tripRef.current, scope = liveScopeRef.current;
    if (next.id !== current.id || next.ownerId !== current.ownerId) return false;
    try {
      const recovery = await loadTripRecovery(next.id, next.ownerId);
      if (!scopeIsCurrent(scope) || tripRef.current !== current || hasPendingSaves()) return false;
      if (!recovery || JSON.stringify(recovery.trip) !== JSON.stringify(next)) return false;
      recoveryHandleRef.current = recovery; tripRef.current = next; ownerScopeRef.current = next.ownerId;
      setTripState(next); queueRef.current?.reset(next); conflictRef.current = false; setHistoricalRecovery(false);
      recoveryReadyRef.current = true; setRecoveryReady(true); setRecoveryClassifiedFor(tripIdentity(next));
      setFailure(null); setConflictTrip(null); setError(""); setSaveState("device"); return true;
    } catch (caught) { if (scopeIsCurrent(scope)) reportRecoveryReadFailure(caught); return false; }
  }, [hasPendingSaves, reportRecoveryReadFailure, scopeIsCurrent]);

  const adoptCanonicalTrip = useCallback(async (saved: EasyTTrip) => {
    const current = tripRef.current, scope = liveScopeRef.current;
    if (hasPendingSaves() || saved.id !== current.id || saved.ownerId !== current.ownerId || !canonicalTripRevisionCanReplace(current, saved)) return false;
    try {
      const recoveryOwnerId = recoveryHandleRef.current?.ownerId ?? saved.ownerId;
      const recovery = await loadTripRecovery(saved.id, recoveryOwnerId);
      if (!scopeIsCurrent(scope) || tripRef.current !== current || hasPendingSaves()) return false;
      if (recovery) { conflictRef.current = true; setHistoricalRecovery(true); setFailure("recovery"); setError("The saved trip changed, while newer changes on this device remain preserved separately. Review them before continuing."); setSaveState("error"); return false; }
      tripRef.current = saved; ownerScopeRef.current = saved.ownerId; recoveryHandleRef.current = null;
      setTripState(saved); queueRef.current?.reset(saved); conflictRef.current = false; setHistoricalRecovery(false);
      recoveryReadyRef.current = true; setRecoveryReady(true); setRecoveryClassifiedFor(tripIdentity(saved));
      setFailure(null); setConflictTrip(null); setError(""); setSaveState("saved"); return true;
    } catch (caught) { if (scopeIsCurrent(scope)) reportRecoveryReadFailure(caught); return false; }
  }, [hasPendingSaves, reportRecoveryReadFailure, scopeIsCurrent]);

  const acceptCanonicalTrip = useCallback(async (saved: EasyTTrip) => {
    const current = tripRef.current, scope = liveScopeRef.current;
    if (hasPendingSaves() || saved.id !== current.id || saved.ownerId !== current.ownerId || !canonicalTripRevisionCanReplace(current, saved)) return false;
    await cacheCanonicalTrip(saved).catch(() => undefined);
    if (!scopeIsCurrent(scope) || tripRef.current !== current) return false;
    return adoptCanonicalTrip(saved);
  }, [adoptCanonicalTrip, hasPendingSaves, scopeIsCurrent]);

  const openConflictCloudCopy = useCallback(() => {
    if (!conflictTrip) return false;
    setConflictTrip(null); setFailure("recovery"); setHistoricalRecovery(true);
    setError("The account copy is open. Your separate device edits remain preserved until you review or discard them."); setSaveState("error"); return true;
  }, [conflictTrip]);

  return {
    acceptCanonicalTrip, adoptCanonicalTrip, adoptDeviceTrip, conflictTrip,
    currentRecoveryWrite: recoveryHandleRef.current, error, failure, hasPendingSaves, historicalRecovery,
    recoveryClassifiedFor, recoveryReady, isAccountCopySettled, isPending: (key: string) => Boolean(pendingKeys[key]),
    lastAcknowledgedMutation, mutateTrip, openConflictCloudCopy, saveState, trip, waitForPending,
  };
}

export type TripMutationPersistence = ReturnType<typeof useTripMutationPersistence>;
