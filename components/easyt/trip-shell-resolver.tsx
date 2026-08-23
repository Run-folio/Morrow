"use client";

import { notFound, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  EasyTTripPromotionConflictError,
  loadActiveTrip,
  promoteTripToEasyT,
  saveActiveTrip,
} from "@/lib/easyt/storage";
import { requestedTripMatch } from "@/lib/easyt/trip-id-resolution";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { EasyTButton } from "./easyt-controls";
import TripShell from "./trip-shell";
import styles from "./trip-shell.module.css";

type Resolution =
  | { status: "loading" }
  | { status: "found"; trip: EasyTTrip }
  | { status: "missing" };

/** Client boundary for a valid signed-in workspace whose trip is still local. */
export default function TripShellResolver({
  tripId,
  ownerId,
  children,
}: {
  tripId: string;
  ownerId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [resolution, setResolution] = useState<Resolution>({ status: "loading" });
  const [syncIssue, setSyncIssue] = useState<"failed" | "conflict" | null>(null);
  const [syncing, setSyncing] = useState(false);

  const resolveAndPromote = useCallback(async () => {
    const localTrip = requestedTripMatch(tripId, loadActiveTrip(), ownerId);
    if (!localTrip) {
      setResolution({ status: "missing" });
      return;
    }

    setResolution({ status: "found", trip: localTrip });
    setSyncIssue(null);
    setSyncing(true);
    try {
      const result = await promoteTripToEasyT(localTrip);
      saveActiveTrip(result.trip);
      setResolution({ status: "found", trip: result.trip });
      router.refresh();
    } catch (error) {
      if (error instanceof EasyTTripPromotionConflictError) {
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
  }, [ownerId, router, tripId]);

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
    {syncIssue ? <aside className={styles.syncNotice} role="alert">
      <strong>{syncIssue === "conflict" ? "Cloud copy kept safe" : "Trip not synced yet"}</strong>
      <span>{syncIssue === "conflict" ? "Morrovia kept the existing cloud copy and did not remove this device’s copy." : "Your trip is still safe on this device. Check your connection and try again."}</span>
      {syncIssue === "failed" ? <EasyTButton size="small" variant="secondary" onClick={() => void resolveAndPromote()} loading={syncing}>Try again</EasyTButton> : null}
    </aside> : null}
    <TripShell trip={resolution.trip} cacheTrip={syncIssue !== "conflict"}>{children}</TripShell>
  </div>;
}
