"use client";

import { notFound, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  cacheCanonicalTrip,
  claimGuestTripRecoveryForOwner,
  EasyTTripAuthError,
  EasyTTripPromotionConflictError,
  EasyTTripSaveConflictError,
  loadTripRecovery,
  markTripRecoveryState,
  promoteTripToEasyT,
  saveTripToEasyT,
  tripForRecoveryScope,
} from "@/lib/easyt/storage";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { trackEvent } from "@/lib/analytics";
import { tripSyncRecoveryPath } from "@/lib/easyt/trip-continuity";
import { tripSaveSignInHref } from "@/lib/easyt/trip-workspace-links";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import TripShell from "./trip-shell";
import styles from "./trip-shell.module.css";

type Resolution =
  | { status: "loading"; identity: string }
  | { status: "found"; identity: string; trip: EasyTTrip }
  | { status: "missing"; identity: string };

/** Client boundary for an exact local trip, with optional signed-in promotion. */
export default function TripShellResolver({
  tripId,
  ownerId,
  children,
}: {
  tripId: string;
  ownerId?: string;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const resolutionIdentity = JSON.stringify([ownerId ?? null, tripId]);
  const currentResolutionIdentityRef = useRef(resolutionIdentity);
  currentResolutionIdentityRef.current = resolutionIdentity;
  const requestGenerationRef = useRef(0);
  const [resolution, setResolution] = useState<Resolution>({ status: "loading", identity: resolutionIdentity });
  const [syncIssue, setSyncIssue] = useState<"failed" | "conflict" | "auth" | null>(null);
  const [syncComplete, setSyncComplete] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showingCanonicalConflict, setShowingCanonicalConflict] = useState(false);

  const resolveAndPromote = useCallback(async () => {
    const requestIdentity = resolutionIdentity;
    const requestGeneration = ++requestGenerationRef.current;
    const responseIsCurrent = () => currentResolutionIdentityRef.current === requestIdentity
      && requestGenerationRef.current === requestGeneration;
    setSyncing(false);
    if (ownerId && searchParams.get("saved") === "1") claimGuestTripRecoveryForOwner(tripId, ownerId);
    const recovery = loadTripRecovery(tripId, ownerId ?? null);
    if (!recovery) {
      setResolution({ status: "missing", identity: requestIdentity });
      return;
    }
    const localTrip = recovery.trip;

    setResolution({ status: "found", identity: requestIdentity, trip: localTrip });
    setSyncIssue(null);
    setSyncComplete(false);
    setShowingCanonicalConflict(false);
    if (!ownerId) return;
    const scopedLocalTrip = tripForRecoveryScope(localTrip, recovery);
    if (!scopedLocalTrip) {
      setSyncIssue("auth");
      return;
    }
    setSyncing(true);
    try {
      const result = localTrip.ownerId
        ? { trip: await saveTripToEasyT(scopedLocalTrip), outcome: "already-canonical" as const }
        : await promoteTripToEasyT(scopedLocalTrip);
      const cached = cacheCanonicalTrip(result.trip, recovery);
      const remainingRecovery = loadTripRecovery(tripId, ownerId);
      if (!responseIsCurrent()) return;
      setResolution({ status: "found", identity: requestIdentity, trip: result.trip });
      setShowingCanonicalConflict(Boolean(remainingRecovery));
      setSyncComplete(cached.stored && !remainingRecovery);
      if (result.outcome === "promoted") {
        trackEvent("trip_saved", { trip_source: "builder", trip_id: result.trip.id, save_state: "cloud", stop_count: result.trip.stops.length, is_authenticated: true });
      }
    } catch (error) {
      if (error instanceof EasyTTripAuthError) {
        markTripRecoveryState(recovery, "auth");
        if (!responseIsCurrent()) return;
        setSyncIssue("auth");
      } else if (error instanceof EasyTTripPromotionConflictError || error instanceof EasyTTripSaveConflictError) {
        // The cloud response is authoritative for this view, while the
        // different browser copy stays intact until recovery is explicit.
        cacheCanonicalTrip(error.canonicalTrip);
        markTripRecoveryState(recovery, "conflict");
        if (!responseIsCurrent()) return;
        if (error.reason !== "cloud-deleted") {
          setResolution({ status: "found", identity: requestIdentity, trip: error.canonicalTrip });
          setShowingCanonicalConflict(true);
        }
        setSyncIssue("conflict");
      } else {
        markTripRecoveryState(recovery, "network");
        if (!responseIsCurrent()) return;
        setSyncIssue("failed");
      }
    } finally {
      if (responseIsCurrent()) setSyncing(false);
    }
  }, [ownerId, resolutionIdentity, searchParams, tripId]);

  useEffect(() => {
    // The server layout already completed the owner-scoped cloud lookup. A
    // second API request here only duplicated that miss; this boundary owns
    // the browser-only exact active-document fallback.
    void resolveAndPromote();
  }, [resolveAndPromote]);

  if (resolution.identity !== resolutionIdentity || resolution.status === "loading") {
    return <section className={styles.resolving} aria-live="polite">Opening your trip…</section>;
  }
  if (resolution.status === "missing") notFound();

  return <div className={styles.resolverStack}>
    {!ownerId ? <aside className={`${styles.syncNotice} ${styles.guestSaveNotice}`}>
      <strong>Saved on this device</strong>
      <span>Keep this trip and continue planning on another device.</span>
      <EasyTLinkButton size="small" href={tripSaveSignInHref(tripId)}>Save this trip</EasyTLinkButton>
    </aside> : null}
    {syncComplete ? <aside className={`${styles.syncNotice} ${styles.syncComplete}`} role="status">
      <strong>Trip saved to your account</strong>
      <span>You can continue this same trip on another device.</span>
    </aside> : null}
    {syncIssue ? <aside className={styles.syncNotice} role="alert">
      <strong>{syncIssue === "auth" ? "Sign in to finish syncing" : syncIssue === "conflict" ? "Cloud copy kept safe" : "Trip not synced yet"}</strong>
      <span>{syncIssue === "auth" ? "Your session ended, but this trip remains saved on this device." : syncIssue === "conflict" ? "Morrovia kept the existing cloud copy and did not remove this device’s copy." : "Your trip is still safe on this device. Check your connection and try again."}</span>
      {syncIssue === "failed" ? <EasyTButton size="small" variant="secondary" onClick={() => void resolveAndPromote()} loading={syncing}>Try again</EasyTButton> : null}
      {syncIssue === "auth" ? <EasyTLinkButton size="small" variant="secondary" href={tripSaveSignInHref(tripId)}>Sign in again</EasyTLinkButton> : null}
      {syncIssue === "conflict" ? <EasyTLinkButton size="small" variant="secondary" href={tripSyncRecoveryPath(tripId)}>Open device copy</EasyTLinkButton> : null}
    </aside> : null}
    <TripShell trip={resolution.trip} cacheTrip={showingCanonicalConflict}>{children}</TripShell>
  </div>;
}
