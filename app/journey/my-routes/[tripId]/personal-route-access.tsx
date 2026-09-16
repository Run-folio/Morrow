"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { journeyReauthenticationPath } from "@/lib/easyt/trip-continuity";
import { loadRememberedOwner, loadTripRecovery } from "@/lib/easyt/storage";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { ownerBoundaryState } from "@/lib/easyt/private-browser-context";
import { personalRouteHref, personalRoutePresentation } from "@/lib/easyt/personal-route";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import { MorroviaSectionStatus } from "@/components/easyt/morrovia-loading-states";
import PersonalRouteView from "./personal-route-view";
import styles from "./personal-route.module.css";

export function PersonalRouteOwnerBoundary({ trip, navigation }: { trip: EasyTTrip; navigation: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const [rememberedOwnerId, setRememberedOwnerId] = useState<string | null>(null);
  const authenticatedOwnerRef = useRef(trip.ownerId);
  if (session?.user?.id) authenticatedOwnerRef.current = session.user.id;
  useEffect(() => setRememberedOwnerId(loadRememberedOwner()), []);
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
  useEffect(() => {
    // Deliberately read-only: opening the journey never claims, promotes,
    // reconciles, caches or rewrites a recovery document.
    setTrip(loadTripRecovery(tripId, ownerId)?.trip ?? null);
  }, [ownerId, tripId]);
  if (trip === undefined) return <main className={styles.accessState}><MorroviaSectionStatus title="Opening your journey" detail="Looking for this exact trip on this device." /></main>;
  if (!trip) notFound();
  return <>
    <div className={styles.deviceNotice}><MorroviaStatusBanner title="Private device copy" detail="This read-only journey reflects the trip saved in this browser. Return to planning to edit or save it to an account." /></div>
    <PersonalRouteView presentation={personalRoutePresentation(trip)} navigation={navigation} />
  </>;
}
