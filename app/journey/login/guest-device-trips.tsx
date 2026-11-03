"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { listTripRecoveries } from "@/lib/easyt/storage";
import { loadGuestDeviceTrips, type GuestDeviceTripsState } from "@/lib/easyt/guest-device-discovery";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import styles from "../account.module.css";

export default function GuestDeviceTrips() {
  const { data: session, isPending, error } = authClient.useSession();
  const ownerId = session?.user?.id ?? null;
  const [state, setState] = useState<GuestDeviceTripsState>({ kind: "withheld" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ kind: "withheld" });
    void loadGuestDeviceTrips({ pending: isPending || Boolean(error) || Boolean(session), ownerId }, () => current,
      () => listTripRecoveries(null)).then(result => { if (current) setState(result); });
    return () => { current = false; };
  }, [isPending, ownerId, error, revision]);
  // Render-time fencing also hides an old result before effect cleanup runs.
  if (isPending || error || session || ownerId !== null || state.kind === "withheld") return null;
  return <GuestDeviceTripsPanel state={state} onRetry={() => setRevision(value => value + 1)} />;
}

/** Page-specific presentation, shared with its synthetic responsive stories. */
export function GuestDeviceTripsPanel({ state, onRetry }: { state: GuestDeviceTripsState; onRetry: () => void }) {
  if (state.kind === "withheld") return null;
  return <section className={styles.deviceTrips} aria-labelledby="guest-device-trips-title">
    <h2 id="guest-device-trips-title">On this device</h2>
    {state.kind === "unavailable" ? <MorroviaStatusBanner tone="warning" title="Device copies could not be checked"
      detail="Keep any open trip tabs. No copies have been changed."
      actions={<EasyTButton variant="secondary" size="small" onClick={onRetry}>Check again</EasyTButton>} />
      : state.trips.length ? <ul>{state.trips.map(trip => <li key={trip.id}>
        <strong>{trip.title}</strong><EasyTLinkButton href={trip.href} variant="secondary" size="small" aria-label={`Open device copy: ${trip.title}`}>Open trip</EasyTLinkButton>
      </li>)}</ul> : <p>No guest trips found in this browser.</p>}
  </section>;
}
