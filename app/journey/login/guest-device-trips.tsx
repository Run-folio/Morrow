"use client";

import { EntryReveal } from "@/components/easyt/app-motion";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MorroviaSectionStatus } from "@/components/easyt/morrovia-loading-states";
import { authClient } from "@/lib/auth-client";
import { listTripRecoveries } from "@/lib/easyt/storage";
import { loadGuestDeviceTrips, type GuestDeviceTripsState } from "@/lib/easyt/guest-device-discovery";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import styles from "../account.module.css";

export default function GuestDeviceTrips({ presentation = "login", accountAvailable = true }: { presentation?: "login" | "dashboard"; accountAvailable?: boolean }) {
  const router=useRouter();
  const refreshedOwner=useRef<string|null>(null);
  const { data: session, isPending, error } = authClient.useSession();
  const ownerId = session?.user?.id ?? null;
  const blocked = accountAvailable && (isPending || Boolean(error) || Boolean(session));
  const [state, setState] = useState<GuestDeviceTripsState>({ kind: "withheld" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ kind: "withheld" });
    void loadGuestDeviceTrips({ pending: blocked, ownerId }, () => current,
      () => listTripRecoveries(null)).then(result => { if (current) setState(result); });
    return () => { current = false; };
  }, [blocked, ownerId, revision]);
  useEffect(()=>{
    if(presentation!=="dashboard"||!ownerId||refreshedOwner.current===ownerId)return;
    refreshedOwner.current=ownerId;
    router.refresh();
  },[presentation,ownerId,router]);
  // Render-time fencing also hides an old result before effect cleanup runs.
  const retry=()=>setRevision(value=>value+1);
  if(presentation==="dashboard"&&accountAvailable&&error) return <GuestDeviceTripsPanel presentation={presentation} state={{kind:"unavailable"}} onRetry={()=>router.refresh()} accountAvailable={accountAvailable} />;
  if (blocked || ownerId !== null || state.kind === "withheld") return presentation==="dashboard"
    ? <MorroviaSectionStatus title="Opening My Trips" detail="Checking for trips saved on this device." /> : null;
  return <GuestDeviceTripsPanel presentation={presentation} state={state} onRetry={retry} accountAvailable={accountAvailable} />;
}

/** Page-specific presentation, shared with its synthetic responsive stories. */
export function GuestDeviceTripsPanel({ state, onRetry, presentation = "login", accountAvailable = true }: { state: GuestDeviceTripsState; onRetry: () => void; presentation?: "login" | "dashboard"; accountAvailable?: boolean }) {
  if (state.kind === "withheld") return null;
  const dashboard=presentation==="dashboard";
  return <section className={styles.deviceTrips} aria-labelledby="guest-device-trips-title">
    <EntryReveal ready={state.kind === "ready" && state.trips.length > 0} selector="[data-device-trip-name]" />
    <h2 id="guest-device-trips-title">On this device</h2>
    {state.kind === "unavailable" ? <MorroviaStatusBanner tone="warning" title="Device copies could not be checked"
      detail="Keep any open trip tabs. No copies have been changed."
      actions={<EasyTButton variant="secondary" size="small" onClick={onRetry}>Check again</EasyTButton>} />
      : state.trips.length ? <ul>{state.trips.map(trip => <li key={trip.id}>
        <strong data-device-trip-name>{trip.title}</strong><EasyTLinkButton href={trip.href} variant="secondary" size="small" aria-label={`Open device copy: ${trip.title}`}>Open trip</EasyTLinkButton>
      </li>)}</ul> : !dashboard ? <p>No guest trips found in this browser.</p> : null}
    {dashboard && state.kind === "ready" && state.trips.length === 0 ? <div className={styles.guestTripsEmpty}>
      <h3>No trips on this device yet</h3><p>Start a trip and come back here to pick up where you left off.</p>
      <EasyTLinkButton href="/journey/new" variant="primary" size="small">Plan a trip</EasyTLinkButton>
    </div> : null}
    {dashboard && accountAvailable && state.kind === "ready" ? <div className={styles.guestSyncPrompt}>
      <p>{state.trips.length ? "To sync a trip, open it and choose to save it to your account." : "Already have trips in your account?"}</p>
      <EasyTLinkButton href="/journey/login?next=%2Fjourney%2Fdashboard" variant="quiet" size="small">Sign in</EasyTLinkButton>
    </div> : null}
  </section>;
}
