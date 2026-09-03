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
  saveTripRecoveryToEasyT,
  saveTripToEasyT,
  tripForRecoveryScope,
} from "@/lib/easyt/storage";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { trackEvent } from "@/lib/analytics";
import { tripSyncRecoveryPath } from "@/lib/easyt/trip-continuity";
import { tripSaveSignInHref } from "@/lib/easyt/trip-workspace-links";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import { MorroviaStatusBanner } from "./morrovia-feedback";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
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
        : { trip: await saveTripRecoveryToEasyT(localTrip, recovery), outcome: "promoted" as const };
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
    return <section className={styles.resolving}>
      <MorroviaSectionStatus title="Opening your route" detail="Loading the trip saved on this device before its workspace opens." />
    </section>;
  }
  if (resolution.status === "missing") notFound();

  return <div className={styles.resolverStack}>
    {!ownerId ? <MorroviaStatusBanner className={styles.resolverNotice} title="Saved on this device" detail="Keep this trip and continue planning on another device." actions={<EasyTLinkButton size="small" href={tripSaveSignInHref(tripId)}>Save this trip</EasyTLinkButton>} /> : null}
    {syncComplete ? <MorroviaStatusBanner className={styles.resolverNotice} tone="success" title="Trip saved to your account" detail="You can continue this same trip on another device." /> : null}
    {syncIssue ? <MorroviaStatusBanner
      className={styles.resolverNotice}
      tone={syncIssue === "failed" ? "warning" : syncIssue === "conflict" ? "warning" : "danger"}
      title={syncIssue === "auth" ? "Sign in to finish syncing" : syncIssue === "conflict" ? "Cloud copy kept safe" : "Trip not synced yet"}
      detail={syncIssue === "auth" ? "Your session ended, but this trip remains saved on this device." : syncIssue === "conflict" ? "Morrovia kept the existing cloud copy and did not remove this device’s copy." : "Your trip is still safe on this device. Check your connection and try again."}
      actions={syncIssue === "failed" ? <EasyTButton size="small" variant="secondary" onClick={() => void resolveAndPromote()} loading={syncing}>Try again</EasyTButton> : syncIssue === "auth" ? <EasyTLinkButton size="small" variant="secondary" href={tripSaveSignInHref(tripId)}>Sign in again</EasyTLinkButton> : <EasyTLinkButton size="small" variant="secondary" href={tripSyncRecoveryPath(tripId)}>Open device copy</EasyTLinkButton>}
    /> : null}
    <TripShell trip={resolution.trip} cacheTrip={showingCanonicalConflict}>{children}</TripShell>
  </div>;
}
