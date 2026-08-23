"use client";

import { notFound } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { loadActiveTrip } from "@/lib/easyt/storage";
import { requestedTripMatch } from "@/lib/easyt/trip-id-resolution";
import type { EasyTTrip } from "@/lib/easyt/trip";
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
  const [resolution, setResolution] = useState<Resolution>({ status: "loading" });

  useEffect(() => {
    // The server layout already completed the owner-scoped cloud lookup. A
    // second API request here only duplicated that miss; this boundary owns
    // the browser-only exact active-document fallback.
    const trip = requestedTripMatch(tripId, loadActiveTrip(), ownerId);
    setResolution(trip ? { status: "found", trip } : { status: "missing" });
  }, [ownerId, tripId]);

  if (resolution.status === "missing") notFound();
  if (resolution.status === "loading") {
    return <section className={styles.resolving} aria-live="polite">Opening your trip…</section>;
  }

  return <TripShell trip={resolution.trip}>{children}</TripShell>;
}
