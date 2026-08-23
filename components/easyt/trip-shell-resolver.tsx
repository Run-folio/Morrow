"use client";

import { notFound } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  EasyTTripAuthError,
  EasyTTripPromotionConflictError,
  loadActiveTrip,
  promoteTripToEasyT,
  saveActiveTrip,
} from "@/lib/easyt/storage";
import { requestedTripMatch } from "@/lib/easyt/trip-id-resolution";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { trackEvent } from "@/lib/analytics";
import { tripSaveSignInHref } from "@/lib/easyt/trip-workspace-links";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import TripShell from "./trip-shell";
import styles from "./trip-shell.module.css";

type Resolution =
  | { status: "loading" }
  | { status: "found"; trip: EasyTTrip }
  | { status: "missing" };

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
  const [resolution, setResolution] = useState<Resolution>({ status: "loading" });
  const [syncIssue, setSyncIssue] = useState<"failed" | "conflict" | "auth" | null>(null);
  const [syncComplete, setSyncComplete] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const resolveAndPromote = useCallback(async () => {
    const localTrip = requestedTripMatch(tripId, loadActiveTrip(), ownerId);
    if (!localTrip) {
      setResolution({ status: "missing" });
      return;
    }

    setResolution({ status: "found", trip: localTrip });
    setSyncIssue(null);
    setSyncComplete(false);
    if (!ownerId) return;
    setSyncing(true);
    try {
      const result = await promoteTripToEasyT(localTrip);
      saveActiveTrip(result.trip);
      setResolution({ status: "found", trip: result.trip });
      setSyncComplete(true);
      if (result.outcome === "promoted") {
        trackEvent("trip_saved", { trip_source: "builder", trip_id: result.trip.id, save_state: "cloud", stop_count: result.trip.stops.length, is_authenticated: true });
      }
    } catch (error) {
      if (error instanceof EasyTTripAuthError) {
        setSyncIssue("auth");
      } else if (error instanceof EasyTTripPromotionConflictError) {
        // The cloud response is authoritative for this view, while the
        // different browser copy stays intact until recovery is explicit.
        if (error.reason !== "cloud-deleted") {
          setResolution({ status: "found", trip: error.canonicalTrip });
        }
        setSyncIssue("conflict");
      } else {
        setSyncIssue("failed");
      }
    } finally {
      setSyncing(false);
    }
  }, [ownerId, tripId]);

  useEffect(() => {
    // The server layout already completed the owner-scoped cloud lookup. A
    // second API request here only duplicated that miss; this boundary owns
    // the browser-only exact active-document fallback.
    void resolveAndPromote();
  }, [resolveAndPromote]);

  if (resolution.status === "missing") notFound();
  if (resolution.status === "loading") {
    return <section className={styles.resolving} aria-live="polite">Opening your trip…</section>;
  }

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
    </aside> : null}
    <TripShell trip={resolution.trip} cacheTrip={syncIssue !== "conflict"}>{children}</TripShell>
  </div>;
}
