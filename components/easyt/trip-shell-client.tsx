"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, House, Luggage, Map } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { trackEvent } from "@/lib/analytics";
import {
  cacheCanonicalTrip,
  discardTripRecovery,
  EASYT_ACTIVE_TRIP_CHANGE_EVENT,
  loadTripRecovery,
  resolveCanonicalEquivalentTripRecovery,
  subscribeToTripStorage,
  type TripRecoveryRecord,
  EASYT_LAST_OWNER_KEY,
  loadRememberedOwner,
} from "@/lib/easyt/storage";
import { isEasyTTrip, type EasyTTrip } from "@/lib/easyt/trip";
import { journeyReauthenticationPath, tripConflictResolutionActions } from "@/lib/easyt/trip-continuity";
import { ownerBoundaryState } from "@/lib/easyt/private-browser-context";
import { workspaceViewFromPathname, workspaceVisitKey } from "@/lib/easyt/trip-workspace-links";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import { MorroviaConfirmationDialog } from "./morrovia-feedback";
import styles from "./trip-shell.module.css";

const TripShellTripContext = createContext<EasyTTrip | null>(null);

export function TripShellTripProvider({ trip, children, cacheTrip = true }: { trip: EasyTTrip; children: ReactNode; cacheTrip?: boolean }) {
  const pathname = usePathname();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [rememberedOwnerId, setRememberedOwnerId] = useState<string | null>(null);
  const authenticatedOwnerRef = useRef<string | null>(cacheTrip ? trip.ownerId : null);
  if (session?.user?.id) authenticatedOwnerRef.current = session.user.id;
  const [returnTarget, setReturnTarget] = useState(pathname);
  const [activeTrip, setActiveTrip] = useState(trip);
  const [deviceRecovery, setDeviceRecovery] = useState<TripRecoveryRecord | null>(null);
  const [discardFailed, setDiscardFailed] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const trackedWorkspaceVisitRef = useRef<string | null>(null);
  const conflictActions = tripConflictResolutionActions(trip.id);
  const visibleActiveTrip = !cacheTrip
    && activeTrip.id === trip.id
    && activeTrip.ownerId === trip.ownerId
    ? activeTrip
    : trip;
  const visibleDeviceRecovery = cacheTrip
    && deviceRecovery?.tripId === trip.id
    && deviceRecovery.ownerId === trip.ownerId
    ? deviceRecovery
    : null;

  useEffect(() => {
    const refreshOwner = () => setRememberedOwnerId(loadRememberedOwner());
    const onStorage = (event: StorageEvent) => {
      if (event.key === EASYT_LAST_OWNER_KEY) refreshOwner();
    };
    refreshOwner();
    setReturnTarget(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [pathname]);

  const ownerBoundary = cacheTrip && trip.ownerId
    ? ownerBoundaryState({
        renderedOwnerId: trip.ownerId,
        sessionOwnerId: session?.user?.id,
        rememberedOwnerId,
        sessionPending,
        previouslyAuthenticatedOwnerId: authenticatedOwnerRef.current,
      })
    : "current";

  useEffect(() => {
    if (ownerBoundary === "mismatch") window.location.reload();
  }, [ownerBoundary]);

  useEffect(() => {
    setActiveTrip(trip);
    // A server-resolved deep link is canonical for this owner. Refresh the
    // clean offline cache without replacing a pending recovery document.
    if (cacheTrip) cacheCanonicalTrip(trip);
  }, [cacheTrip, trip]);
  useEffect(() => {
    const onActiveTripChange = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      // A canonical cloud workspace remains canonical. Device edits are
      // surfaced below and opened only when the traveller explicitly chooses
      // that copy. Browser-only resolver shells still receive their live edit.
      if (!cacheTrip && isEasyTTrip(next) && next.id === trip.id && next.ownerId === trip.ownerId) setActiveTrip(next);
    };
    window.addEventListener(EASYT_ACTIVE_TRIP_CHANGE_EVENT, onActiveTripChange);
    return () => window.removeEventListener(EASYT_ACTIVE_TRIP_CHANGE_EVENT, onActiveTripChange);
  }, [cacheTrip, trip]);

  useEffect(() => {
    if (!cacheTrip) {
      setDeviceRecovery(null);
      setDiscardFailed(false);
      return;
    }
    setDiscardFailed(false);
    const refreshRecovery = () => {
      const recovery = loadTripRecovery(trip.id, trip.ownerId);
      const reconciliation = recovery
        ? resolveCanonicalEquivalentTripRecovery(trip, recovery)
        : null;
      const remainingRecovery = reconciliation?.recoveryResolved
        ? loadTripRecovery(trip.id, trip.ownerId)
        : recovery;
      setDeviceRecovery(remainingRecovery);
      if (!remainingRecovery) setDiscardFailed(false);
    };
    refreshRecovery();
    return subscribeToTripStorage(trip.ownerId, trip.id, refreshRecovery);
  }, [cacheTrip, trip]);

  useEffect(() => {
    const visitKey = workspaceVisitKey(pathname);
    if (trackedWorkspaceVisitRef.current === visitKey) return;
    trackedWorkspaceVisitRef.current = visitKey;
    const view = workspaceViewFromPathname(pathname, trip.id);
    const common = { trip_id: trip.id, route_mode: "shell" as const, stop_count: trip.stops.length };
    if (view === "itinerary") {
      trackEvent("trip_itinerary_viewed", { ...common, workspace_view: "itinerary" });
    } else if (view === "map") {
      trackEvent("trip_map_viewed", { ...common, workspace_view: "map" });
    } else if (view === "prep") {
      trackEvent("trip_prep_viewed", { ...common, workspace_view: "prep" });
    } else {
      trackEvent("trip_overview_viewed", { ...common, workspace_view: "overview" });
    }
  }, [pathname, trip.id, trip.stops.length]);

  const discardDeviceCopy = () => {
    if (!visibleDeviceRecovery) return;
    const discarded = discardTripRecovery(visibleDeviceRecovery, true);
    if (discarded) {
      setDeviceRecovery(loadTripRecovery(trip.id, trip.ownerId));
      setDiscardFailed(false);
      setDiscardDialogOpen(false);
      return;
    }
    const remaining = loadTripRecovery(trip.id, trip.ownerId);
    if (remaining) setDeviceRecovery(remaining);
    setDiscardFailed(true);
  };

  if (ownerBoundary === "mismatch") {
    return <section className={styles.resolving} role="status">Account changed. Opening the current account’s trip context…</section>;
  }

  return (
    <>
      {ownerBoundary === "expired" || ownerBoundary === "signed-out" ? (
        <div className={styles.content}>
          <aside className={styles.syncNotice} role="alert">
            <strong>Your session ended</strong>
            <span>This trip remains visible and unchanged. Sign in before editing or syncing it.</span>
            <EasyTLinkButton size="small" href={journeyReauthenticationPath(returnTarget)}>Sign in and return here</EasyTLinkButton>
          </aside>
        </div>
      ) : null}
      {visibleDeviceRecovery ? (
        <div className={styles.content}>
          <aside className={styles.syncNotice} role="alert">
            <strong>Device edits kept safe</strong>
            <span>{discardFailed
              ? "Morrovia couldn’t discard this device copy because browser storage is unavailable. Your edits remain intact."
              : "You’re viewing the cloud copy. Unsynced edits on this device remain separate until you resume or discard them."}</span>
            <EasyTLinkButton size="small" href={conflictActions.deviceHref}>{conflictActions.openDeviceLabel}</EasyTLinkButton>
            <EasyTButton size="small" variant="danger" onClick={() => setDiscardDialogOpen(true)}>{conflictActions.discardDeviceLabel}</EasyTButton>
          </aside>
        </div>
      ) : null}
      <MorroviaConfirmationDialog
        open={discardDialogOpen && Boolean(visibleDeviceRecovery)}
        title={`Discard device edits for “${trip.title}”?`}
        detail="You are viewing the account copy. This removes only the separate recovery copy stored in this browser."
        consequences={[
          "Device-only edits in this recovery copy cannot be restored.",
          "The trip saved to your account will remain unchanged.",
        ]}
        cancelLabel="Keep device edits"
        confirmLabel="Discard device edits"
        error={discardFailed ? "Morrovia could not remove the device copy because browser storage is unavailable. The edits remain intact." : undefined}
        onCancel={() => { setDiscardDialogOpen(false); setDiscardFailed(false); }}
        onConfirm={discardDeviceCopy}
      />
      <TripShellTripContext.Provider value={visibleActiveTrip}>{children}</TripShellTripContext.Provider>
    </>
  );
}

export function useTripShellTrip() {
  const trip = useContext(TripShellTripContext);
  if (!trip) throw new Error("useTripShellTrip must be used inside TripShell");
  return trip;
}

const views = [
  { id: "overview", label: "Overview", icon: House, suffix: "" },
  { id: "map", label: "Map", icon: Map, suffix: "/map" },
  { id: "itinerary", label: "Itinerary", icon: CalendarDays, suffix: "/itinerary" },
  { id: "prep", label: "Prep", icon: Luggage, suffix: "/prep" },
] as const;

export function TripShellNavigation({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const baseHref = `/journey/${encodeURIComponent(tripId)}`;
  const decodedPathname = decodeURIComponent(pathname);
  const decodedBase = `/journey/${tripId}`;
  const remainder = decodedPathname.slice(decodedBase.length);
  const activeView = remainder.startsWith("/itinerary")
    ? "itinerary"
    : remainder.startsWith("/map")
      ? "map"
      : remainder.startsWith("/prep")
        ? "prep"
        : "overview";

  return (
    <nav className={styles.subnav} aria-label="Trip workspace">
      {views.map((view) => {
        const Icon = view.icon;
        const active = activeView === view.id;
        return (
          <Link
            key={view.id}
            className={active ? styles.subnavActive : undefined}
            href={`${baseHref}${view.suffix}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{view.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function TripShellImage({
  src,
  alt,
  routeLabel,
  stopCount,
}: {
  src: string | null;
  alt: string;
  routeLabel: string;
  stopCount: number;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;

  return (
    <div className={styles.tripImage}>
      <div className={styles.tripImageFallback} aria-hidden={showImage || undefined}>
        <span>{stopCount || 1}</span>
        <small>{routeLabel}</small>
      </div>
      {showImage ? (
        <img src={src ?? ""} alt={alt} onError={() => setFailedSrc(src)} />
      ) : null}
    </div>
  );
}
