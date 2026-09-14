"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BedDouble, CalendarDays, Clock3, Edit3, House, Map, MapPin, Route, Sparkles } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { trackEvent } from "@/lib/analytics";
import {
  cacheCanonicalTrip,
  discardTripRecovery,
  EASYT_ACTIVE_TRIP_CHANGE_EVENT,
  loadLocalTrip,
  loadTripRecovery,
  resolveCanonicalEquivalentTripRecovery,
  subscribeToTripStorage,
  tripRecoveryIsAwaitingCanonicalSave,
  type TripRecoveryRecord,
  EASYT_LAST_OWNER_KEY,
  loadRememberedOwner,
} from "@/lib/easyt/storage";
import { isEasyTTrip, type EasyTTrip } from "@/lib/easyt/trip";
import ResilientImage from "@/components/easyt/resilient-image";
import { journeyReauthenticationPath, tripConflictResolutionActions } from "@/lib/easyt/trip-continuity";
import { ownerBoundaryState } from "@/lib/easyt/private-browser-context";
import { shouldResetOverviewEntry, tripWorkspaceHref, workspaceViewFromPathname, workspaceVisitKey } from "@/lib/easyt/trip-workspace-links";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import { EasyTField } from "./easyt-controls";
import { MorroviaConfirmationDialog, MorroviaFormDialog, MorroviaSaveStatus, MorroviaStatusBanner } from "./morrovia-feedback";
import { useWorkspaceOrientationBlocker, useWorkspaceOrientationTarget, WorkspaceOrientationLauncher } from "./workspace-orientation";
import { renameTripIdentity, tripCustomTitle, tripDisplayTitle } from "@/lib/easyt/trip-display";
import { deriveTripDateFacts } from "@/lib/easyt/trip-facts";
import { useTripMutationPersistence, type TripMutationPersistence } from "./use-trip-mutation-persistence";
import styles from "./trip-shell.module.css";

const TripShellTripContext = createContext<EasyTTrip | null>(null);
const TripShellMutationContext = createContext<TripMutationPersistence | null>(null);

export function TripShellCanonicalMutationProvider({ trip, children }: { trip: EasyTTrip; children: ReactNode }) {
  const mutation = useTripMutationPersistence(trip, true);
  return <TripShellMutationContext.Provider value={mutation}>{children}</TripShellMutationContext.Provider>;
}

export function useTripShellMutation() {
  const mutation = useContext(TripShellMutationContext);
  if (!mutation) throw new Error("useTripShellMutation must be used inside TripShell");
  return mutation;
}

export function useOptionalTripShellMutation() {
  return useContext(TripShellMutationContext);
}

export function TripShellIdentityAndActions() {
  const mutation = useTripShellMutation();
  const trip = mutation.trip;
  const routeLabel = [trip.brief.origin, ...trip.stops.map((stop) => stop.name)].filter(Boolean).join(" → ") || "Route to confirm";
  const dateFacts = deriveTripDateFacts({ startDate: trip.startDate, endDate: trip.endDate });
  const duration = dateFacts.durationDays;
  const status = trip.status === "planned" ? "Planned" : trip.status === "archived" ? "Archived" : "Planning";
  const editHref = `/journey/new?trip=${encodeURIComponent(trip.id)}`;
  const [renameOpen, setRenameOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [validationError, setValidationError] = useState("");
  useWorkspaceOrientationBlocker(renameOpen);

  const openRename = () => {
    setDraft(tripCustomTitle(mutation.trip) ?? "");
    setValidationError("");
    setRenameOpen(true);
  };
  const saveRename = () => {
    const normalizedTitle = draft.trim().replace(/\s+/g, " ");
    if (Array.from(normalizedTitle).length > 80) {
      setValidationError("Use 80 characters or fewer.");
      return;
    }
    const changed = mutation.mutateTrip((current) => renameTripIdentity(current, normalizedTitle), "trip-title");
    if (changed || normalizedTitle === (tripCustomTitle(mutation.trip) ?? "")) setRenameOpen(false);
  };

  return <>
    <div className={styles.tripIdentity}>
      <p className={styles.eyebrow}>{status}</p>
      <h1 id="trip-shell-title">{tripDisplayTitle(mutation.trip)}</h1>
      <p className={styles.routeSummary}>{routeLabel}</p>
      <dl className={styles.metadata}>
        <div><dt><CalendarDays aria-hidden="true" /><span className={styles.srOnly}>Dates</span></dt><dd>{dateFacts.rangeLabel}</dd></div>
        <div><dt><Clock3 aria-hidden="true" /><span className={styles.srOnly}>Duration</span></dt><dd>{duration ? `${duration} ${duration === 1 ? "day" : "days"}` : "Duration to confirm"}</dd></div>
        <div><dt><MapPin aria-hidden="true" /><span className={styles.srOnly}>Stops</span></dt><dd>{mutation.trip.stops.length} {mutation.trip.stops.length === 1 ? "stop" : "stops"}</dd></div>
        <div><dt><Route aria-hidden="true" /><span className={styles.srOnly}>Transfers</span></dt><dd>{mutation.trip.legs.length} {mutation.trip.legs.length === 1 ? "transfer" : "transfers"}</dd></div>
      </dl>
    </div>
    <div className={styles.headerActions}>
      <MorroviaSaveStatus state={mutation.saveState} />
      <EasyTLinkButton className={styles.editAction} href={editHref} icon={Edit3} size="small" variant="secondary">Edit trip brief</EasyTLinkButton>
      <WorkspaceOrientationLauncher onRenameTrip={openRename} />
    </div>
    <MorroviaFormDialog
      open={renameOpen}
      title="Rename this trip"
      detail="Give the trip a personal name, or leave it blank to use Morrovia’s geographic title. Your route and dates will not change."
      submitLabel="Save name"
      error={validationError || mutation.error || undefined}
      onCancel={() => setRenameOpen(false)}
      onSubmit={saveRename}
    >
      <EasyTField
        data-dialog-autofocus="true"
        label="Trip name"
        value={draft}
        onChange={(event) => { setDraft(event.target.value); setValidationError(""); }}
        hint={`${Array.from(draft.trim()).length}/80 characters · optional`}
        autoComplete="off"
      />
    </MorroviaFormDialog>
  </>;
}

export function TripShellTripProvider({ trip, children, cacheTrip = true }: { trip: EasyTTrip; children: ReactNode; cacheTrip?: boolean }) {
  const mutation = useTripShellMutation();
  const pathname = usePathname();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [rememberedOwnerId, setRememberedOwnerId] = useState<string | null>(null);
  const authenticatedOwnerRef = useRef<string | null>(cacheTrip ? trip.ownerId : null);
  if (session?.user?.id) authenticatedOwnerRef.current = session.user.id;
  const [returnTarget, setReturnTarget] = useState(pathname);
  const [deviceRecovery, setDeviceRecovery] = useState<TripRecoveryRecord | null>(null);
  const [discardFailed, setDiscardFailed] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const trackedWorkspaceVisitRef = useRef<string | null>(null);
  const conflictActions = tripConflictResolutionActions(trip.id);
  const visibleActiveTrip = mutation.trip.id === trip.id
    && mutation.trip.ownerId === trip.ownerId
    ? mutation.trip
    : trip;
  const visibleDeviceRecovery = cacheTrip
    && deviceRecovery?.tripId === trip.id
    && deviceRecovery.ownerId === trip.ownerId
    && !tripRecoveryIsAwaitingCanonicalSave(deviceRecovery)
    ? deviceRecovery
    : null;
  const currentSaveFailed = mutation.saveState === "error" && !mutation.historicalRecovery;
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
  useWorkspaceOrientationBlocker(ownerBoundary !== "current" || Boolean(visibleDeviceRecovery) || discardDialogOpen);

  useEffect(() => {
    if (ownerBoundary === "mismatch") window.location.reload();
  }, [ownerBoundary]);

  useEffect(() => {
    // A server-resolved deep link is canonical for this owner. Refresh the
    // clean offline cache without replacing a pending recovery document.
    if (cacheTrip) cacheCanonicalTrip(trip);
  }, [cacheTrip, trip]);

  useEffect(() => {
    const onActiveTripChange = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (!cacheTrip && isEasyTTrip(next)) mutation.adoptDeviceTrip(next);
    };
    window.addEventListener(EASYT_ACTIVE_TRIP_CHANGE_EVENT, onActiveTripChange);
    return () => window.removeEventListener(EASYT_ACTIVE_TRIP_CHANGE_EVENT, onActiveTripChange);
  }, [cacheTrip, mutation.adoptDeviceTrip]);

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
    return subscribeToTripStorage(trip.ownerId, trip.id, (change) => {
      refreshRecovery();
      if (change.kind !== "cache" || loadTripRecovery(trip.id, trip.ownerId)) return;
      // This provider owns authenticated mutations. Its queue adopts its own
      // acknowledgement in order; resetting it from the synchronous cache
      // event could sever later edits already queued behind that save.
      if (mutation.hasPendingSaves()) return;
      const cached = loadLocalTrip(trip.id, trip.ownerId);
      if (cached?.id === trip.id && cached.ownerId === trip.ownerId) {
        mutation.adoptCanonicalTrip(cached);
      }
    });
  }, [cacheTrip, mutation.adoptCanonicalTrip, mutation.hasPendingSaves, trip]);

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
    } else if (view === "explore") {
      trackEvent("explore_opened", { trip_id: trip.id, workspace_view: "explore", stop_count: trip.stops.length });
    } else if (view === "stay") {
      trackEvent("trip_stay_viewed", { ...common, workspace_view: "stay" });
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
          <MorroviaStatusBanner tone="danger" title="Your session ended" detail="This trip remains visible and unchanged. Sign in before editing or syncing it." actions={<EasyTLinkButton size="small" href={journeyReauthenticationPath(returnTarget)}>Sign in and return here</EasyTLinkButton>} />
        </div>
      ) : null}
      {visibleDeviceRecovery ? (
        <div className={styles.content}>
          <MorroviaStatusBanner tone={discardFailed ? "danger" : "warning"} title={currentSaveFailed ? "Device edits kept safe" : `${tripDisplayTitle(trip)} has device changes to review`} detail={discardFailed
              ? "Morrovia couldn’t discard this device copy because browser storage is unavailable. Your edits remain intact."
              : currentSaveFailed
                ? "The latest account save did not complete. This exact device edit remains protected while you retry or review it."
                : "This cloud copy is saved. A separate device copy remains protected; review it before editing this trip here."}
            actions={<><EasyTLinkButton size="small" href={conflictActions.deviceHref}>{conflictActions.openDeviceLabel}</EasyTLinkButton><EasyTButton size="small" variant="danger" onClick={() => setDiscardDialogOpen(true)}>{conflictActions.discardDeviceLabel}</EasyTButton></>}
          />
        </div>
      ) : null}
      <MorroviaConfirmationDialog
        open={discardDialogOpen && Boolean(visibleDeviceRecovery)}
        title={`Discard device edits for “${tripDisplayTitle(trip)}”?`}
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
  { id: "explore", label: "Explore", icon: Sparkles, suffix: "/explore" },
  { id: "stay", label: "Stay", icon: BedDouble, suffix: "/stay" },
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
      : remainder.startsWith("/explore")
        ? "explore"
        : remainder.startsWith("/stay")
          ? "stay"
      : "overview";
  const orientationTarget = useWorkspaceOrientationTarget("overview", "workspace-navigation");

  return (
    <nav ref={orientationTarget} className={styles.subnav} aria-label="Trip workspace">
      {views.map((view) => {
        const Icon = view.icon;
        const active = activeView === view.id;
        return (
          <Link
            key={view.id}
            className={active ? styles.subnavActive : undefined}
            href={view.id === "overview" ? tripWorkspaceHref(tripId) : `${baseHref}${view.suffix}`}
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

/**
 * Next's App Router may retain focus/scroll state from a previously consumed
 * hash when the next URL has no fragment. Overview owns the correction once:
 * generic entry starts at the document top, while real section deep links are
 * left to native hash navigation on initial load and history traversal.
 */
export function TripOverviewEntryBoundary() {
  const pathname = usePathname();
  useEffect(() => {
    let frame = 0;
    const resetGenericEntry = () => {
      window.cancelAnimationFrame(frame);
      if (!shouldResetOverviewEntry(window.location.hash)) return;
      frame = window.requestAnimationFrame(() => {
        if (shouldResetOverviewEntry(window.location.hash)) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
    };
    resetGenericEntry();
    window.addEventListener("hashchange", resetGenericEntry);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", resetGenericEntry);
    };
  }, [pathname]);
  return null;
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
  return (
    <div className={styles.tripImage}>
      <ResilientImage src={src} alt={alt} fallback={<div className={styles.tripImageFallback} role="img" aria-label={`${routeLabel} trip image unavailable`}><span>{stopCount || 1}</span><small>{routeLabel}</small></div>} />
    </div>
  );
}
