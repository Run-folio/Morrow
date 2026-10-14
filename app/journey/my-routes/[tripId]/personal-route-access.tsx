"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { journeyReauthenticationPath } from "@/lib/easyt/trip-continuity";
import { loadRememberedOwner, loadTripRecovery, subscribeToTripStorage } from "@/lib/easyt/storage";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { ownerBoundaryState } from "@/lib/easyt/private-browser-context";
import { personalRouteHref, personalRoutePresentation } from "@/lib/easyt/personal-route";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import { MorroviaSectionStatus } from "@/components/easyt/morrovia-loading-states";
import PersonalRouteView from "./personal-route-view";
import styles from "./personal-route.module.css";

export function PersonalRouteOwnerBoundary({ trip, navigation }: { trip: EasyTTrip; navigation: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const [rememberedOwnerId, setRememberedOwnerId] = useState<string | null>(null);
  const authenticatedOwnerRef = useRef(trip.ownerId);
  if (session?.user?.id) authenticatedOwnerRef.current = session.user.id;
  useEffect(() => { let active=true; void loadRememberedOwner().then(owner=>{if(active)setRememberedOwnerId(owner);}); return()=>{active=false;}; }, []);
  const ownerId = trip.ownerId;
  const boundary = ownerId ? ownerBoundaryState({
    renderedOwnerId: ownerId,
    sessionOwnerId: session?.user?.id,
    rememberedOwnerId,
    sessionPending: isPending,
    previouslyAuthenticatedOwnerId: authenticatedOwnerRef.current,
  }) : "current";
  useEffect(() => {
    if (boundary === "mismatch") window.location.reload();
  }, [boundary]);
  if (!ownerId) return <PersonalRouteView presentation={personalRoutePresentation(trip)} navigation={navigation} />;
  if (boundary === "pending" || boundary === "mismatch") return <main className={styles.accessState}><MorroviaSectionStatus title="Opening your journey" detail="Confirming the private trip owner before showing this route." /></main>;
  if (boundary === "expired" || boundary === "signed-out") return <main className={styles.accessState}><MorroviaStatusBanner tone="danger" title="Sign in to view this journey" detail="This private route is hidden until the trip owner signs in again." actions={<EasyTLinkButton href={journeyReauthenticationPath(personalRouteHref(trip.id))}>Sign in and return here</EasyTLinkButton>} /></main>;
  return <PersonalRouteView presentation={personalRoutePresentation(trip)} navigation={navigation} />;
}

export default function PersonalRouteDeviceResolver({ tripId, ownerId, navigation }: { tripId: string; ownerId: string | null; navigation: ReactNode }) {
  const [trip, setTrip] = useState<EasyTTrip | null | undefined>(undefined);
  const [readFailed, setReadFailed] = useState(false);
  const [sourceRevision, setSourceRevision] = useState(0);
  const sourceRevisionRef = useRef(0);
  const identity = JSON.stringify([ownerId, tripId]);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [hydratedIdentity, setHydratedIdentity] = useState<string | null>(null);
  useEffect(() => subscribeToTripStorage(ownerId, tripId, () => { sourceRevisionRef.current += 1; setSourceRevision(sourceRevisionRef.current); }), [ownerId, tripId]);
  useEffect(() => {
    let active = true;
    const revision = sourceRevisionRef.current;
    setTrip(undefined);
    setReadFailed(false);
    setHydratedIdentity(null);
    // Deliberately read-only: opening the journey never claims, promotes,
    // reconciles, caches or rewrites a recovery document.
    void loadTripRecovery(tripId, ownerId).then((recovery) => {
      if (!active || identityRef.current !== identity || sourceRevisionRef.current !== revision) return;
      setTrip(recovery?.trip ?? null);
      setHydratedIdentity(identity);
    }).catch(() => {
      if (!active || identityRef.current !== identity || sourceRevisionRef.current !== revision) return;
      setReadFailed(true);
      setHydratedIdentity(identity);
    });
    return () => { active = false; };
  }, [identity, ownerId, sourceRevision, tripId]);
  if (readFailed && hydratedIdentity === identity) return <main className={styles.accessState}><MorroviaStatusBanner tone="warning" title="Device copy could not be opened" detail="Device storage could not confirm this trip. Try again before leaving this page." actions={<EasyTButton onClick={() => setSourceRevision((revision) => revision + 1)}>Try again</EasyTButton>} /></main>;
  if (trip === undefined || hydratedIdentity !== identity) return <main className={styles.accessState}><MorroviaSectionStatus title="Opening your journey" detail="Looking for this exact trip on this device." /></main>;
  if (!trip) notFound();
  return <>
    <div className={styles.deviceNotice}><MorroviaStatusBanner title="Private device copy" detail="This read-only journey reflects the trip saved in this browser. Return to planning to edit or save it to an account." /></div>
    <PersonalRouteView presentation={personalRoutePresentation(trip)} navigation={navigation} />
  </>;
}
