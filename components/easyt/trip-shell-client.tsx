"use client";

import Link from "next/link";
import { usePathname, useRouter, useSelectedLayoutSegment } from "next/navigation";
import { BedDouble, CalendarDays, Clock3, Edit3, House, Map, MapPin, Route, Sparkles } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { trackEvent } from "@/lib/analytics";
import {
  cacheCanonicalTrip,
  classifyTripRecovery,
  discardTripRecovery,
  EASYT_ACTIVE_TRIP_CHANGE_EVENT,
  loadCachedTrip,
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
import { canonicalTripRevisionCanReplace, journeyReauthenticationPath, tripConflictResolutionActions } from "@/lib/easyt/trip-continuity";
import { ownerBoundaryState } from "@/lib/easyt/private-browser-context";
import { isTripMapPathname, mapWorkspaceHref, shouldResetOverviewEntry, tripBuilderHref, tripWorkspaceHref, workspaceViewFromPathname, workspaceVisitKey } from "@/lib/easyt/trip-workspace-links";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import { EasyTField } from "./easyt-controls";
import { MorroviaConfirmationDialog, MorroviaFormDialog, MorroviaSaveStatus, MorroviaStatusBanner } from "./morrovia-feedback";
import { useWorkspaceOrientationBlocker, useWorkspaceOrientationTarget, WorkspaceOrientationLauncher } from "./workspace-orientation";
import { renameTripIdentity, tripCustomTitle, tripDisplayTitle } from "@/lib/easyt/trip-display";
import { deriveTripDateFacts } from "@/lib/easyt/trip-facts";
import { tripRouteDisplayLabel } from "@/lib/easyt/trip-legs";
import { importedLegacyRepairContextAllows, repairEligibleSpreadsheetV1Trip } from "@/lib/easyt/imported-trip-hydration";
import { personalRouteHref } from "@/lib/easyt/personal-route";
import { overnightAccommodationStops } from "@/lib/easyt/accommodation";
import { tripCoverImage, resolvedOverviewPhoto, type OverviewPlaceImage } from "@/lib/easyt/trip-overview-imagery";
import { canonicalPlacePhotoCacheKey, discardFailedRoutePhoto, resolveRoutePhotoCandidates } from "@/lib/easyt/route-photo-cache";
import CountryVisualFallback from "./country-visual-fallback";
import MorroviaPhotoCredit from "./morrovia-photo-credit";
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
  const routeLabel = tripRouteDisplayLabel(trip);
  const dateFacts = deriveTripDateFacts({ startDate: trip.startDate, endDate: trip.endDate });
  const duration = dateFacts.durationDays;
  const overnightPlaceCount = overnightAccommodationStops(trip).length;
  const status = trip.status === "planned" ? "Planned" : trip.status === "archived" ? "Archived" : "Planning";
  const editHref = tripBuilderHref(trip.id, trip.ownerId);
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
        <div><dt><MapPin aria-hidden="true" /><span className={styles.srOnly}>Overnight places</span></dt><dd>{overnightPlaceCount} {overnightPlaceCount === 1 ? "overnight place" : "overnight places"}</dd></div>
        <div><dt><Route aria-hidden="true" /><span className={styles.srOnly}>Transfers</span></dt><dd>{mutation.trip.legs.length} {mutation.trip.legs.length === 1 ? "transfer" : "transfers"}</dd></div>
      </dl>
    </div>
    <div className={styles.headerActions}>
      {trip.ownerId && mutation.saveState !== "idle" ? <MorroviaSaveStatus state={mutation.saveState} /> : null}
      <EasyTLinkButton className={styles.editAction} href={mapWorkspaceHref(trip.id, null, "plan", null, null, null, tripWorkspaceHref(trip.id))} icon={Map} size="small" variant="secondary">Explore map</EasyTLinkButton>
      <EasyTLinkButton className={styles.editAction} href={personalRouteHref(trip.id)} icon={Route} size="small" variant="secondary">View my route</EasyTLinkButton>
      <EasyTLinkButton className={styles.editAction} href={editHref} icon={Edit3} size="small" variant="secondary" aria-label="Edit trip brief">Edit</EasyTLinkButton>
      <WorkspaceOrientationLauncher onRenameTrip={openRename} />
    </div>
    <MorroviaFormDialog
      open={renameOpen}
      title="Rename this trip"
      detail="Leave blank to use the destination-based name."
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
  const [discardTarget, setDiscardTarget] = useState<TripRecoveryRecord | null>(null);
  const trackedWorkspaceVisitRef = useRef<string | null>(null);
  const legacyRepairAttemptedRef = useRef(new Set<string>());
  const conflictActions = tripConflictResolutionActions(trip.id, "builder");
  const visibleActiveTrip = mutation.trip.id === trip.id
    && mutation.trip.ownerId === trip.ownerId
    ? mutation.trip
    : trip;
  const visibleDeviceRecovery = cacheTrip
    && deviceRecovery?.tripId === trip.id
    && deviceRecovery.ownerId === trip.ownerId
    && !tripRecoveryIsAwaitingCanonicalSave(deviceRecovery)
    && !(classifyTripRecovery({ recovery: deviceRecovery, canonicalTrip: visibleActiveTrip, currentWrite: mutation.currentRecoveryWrite }) === "pending-current-save"
      && (mutation.saveState === "device" || mutation.saveState === "saving"))
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
  useWorkspaceOrientationBlocker(ownerBoundary !== "current" || Boolean(visibleDeviceRecovery) || Boolean(discardTarget));

  useEffect(() => {
    if (ownerBoundary === "mismatch") window.location.reload();
  }, [ownerBoundary]);

  useEffect(() => {
    if (!cacheTrip || mutation.trip.brief.capturedIntent?.parserVersion !== "spreadsheet-v1" || mutation.trip.planItems.length !== 0) return;
    const identity = `${mutation.trip.id}:${mutation.trip.ownerId ?? "guest"}:${mutation.trip.updatedAt}`;
    if (legacyRepairAttemptedRef.current.has(identity)) return;
    if (!importedLegacyRepairContextAllows({
      tripId: mutation.trip.id,
      ownerId: mutation.trip.ownerId,
      updatedAt: mutation.trip.updatedAt,
      sessionOwnerId: session?.user?.id ?? null,
      sessionPending,
      ownerBoundary,
      recoveryClassifiedFor: mutation.recoveryClassifiedFor,
      hasPendingSaves: mutation.hasPendingSaves(),
      historicalRecovery: mutation.historicalRecovery,
      saveState: mutation.saveState,
      visibleDeviceRecovery: Boolean(visibleDeviceRecovery),
    })) return;
    legacyRepairAttemptedRef.current.add(identity);
    mutation.mutateTrip(repairEligibleSpreadsheetV1Trip, "import-legacy-hydration-v1");
  }, [cacheTrip, mutation.trip, mutation.recoveryClassifiedFor, mutation.hasPendingSaves, mutation.historicalRecovery, mutation.saveState, mutation.mutateTrip, ownerBoundary, session?.user?.id, sessionPending, visibleDeviceRecovery]);

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
      if (loadTripRecovery(trip.id, trip.ownerId)) return;
      // This provider owns authenticated mutations. Its queue adopts its own
      // acknowledgement in order; resetting it from the synchronous cache
      // event could sever later edits already queued behind that save.
      if (mutation.hasPendingSaves()) return;
      if (change.kind !== "cache" && !(change.kind === "resolved" && mutation.historicalRecovery && !mutation.conflictTrip)) return;
      const cached = loadCachedTrip(trip.id, trip.ownerId);
      if (cached?.id === trip.id && cached.ownerId === trip.ownerId) {
        mutation.adoptCanonicalTrip(cached);
      }
    });
  }, [cacheTrip, mutation.adoptCanonicalTrip, mutation.hasPendingSaves, mutation.historicalRecovery, mutation.conflictTrip, trip]);

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
    } else if (view === "transport") {
      trackEvent("trip_transport_viewed", { ...common, workspace_view: "transport" });
    } else {
      trackEvent("trip_overview_viewed", { ...common, workspace_view: "overview" });
    }
  }, [pathname, trip.id, trip.stops.length]);

  const discardDeviceCopy = () => {
    if (!discardTarget || discardTarget.tripId !== trip.id || discardTarget.ownerId !== trip.ownerId) return;
    if (mutation.hasPendingSaves()) {
      setDiscardFailed(true);
      return;
    }
    const currentWrite = mutation.currentRecoveryWrite;
    const discardingFailedCurrentWrite = currentSaveFailed && !mutation.conflictTrip
      && currentWrite?.ownerId === discardTarget.ownerId
      && currentWrite.tripId === discardTarget.tripId && currentWrite.writeId === discardTarget.writeId;
    const canonicalBase = discardingFailedCurrentWrite ? loadCachedTrip(trip.id, trip.ownerId) : null;
    // Keep the durable failed edit if this mounted editor cannot safely return
    // to its acknowledged account body after discard.
    if (discardingFailedCurrentWrite && (!canonicalBase
      || !canonicalTripRevisionCanReplace(mutation.trip, canonicalBase))) {
      setDiscardFailed(true);
      return;
    }
    const discarded = discardTripRecovery(discardTarget, true);
    if (discarded) {
      const remaining = loadTripRecovery(trip.id, trip.ownerId);
      setDeviceRecovery(remaining);
      // Failed current writes retain an optimistic body. After discarding that
      // exact reviewed write, return to the account document before any later
      // edit can accidentally save the discarded content again.
      // If another recovery remains, the adopter preserves it and establishes
      // the historical barrier so its later resolution cannot revive this body.
      if (!mutation.hasPendingSaves() && !mutation.conflictTrip
        && discardingFailedCurrentWrite && canonicalBase) {
        mutation.adoptCanonicalTrip(canonicalBase);
      }
      setDiscardFailed(false);
      setDiscardTarget(null);
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
              ? "The reviewed device copy could not be discarded. Your remaining device edits are intact."
              : currentSaveFailed
                ? "The latest account save did not complete. This exact device edit remains protected while you retry or review it."
                : "This cloud copy is saved. A separate device copy remains protected; review it before editing this trip here."}
            actions={<><EasyTLinkButton size="small" href={conflictActions.deviceHref}>{conflictActions.openDeviceLabel}</EasyTLinkButton><EasyTButton size="small" variant="danger" onClick={() => setDiscardTarget(visibleDeviceRecovery)}>{conflictActions.discardDeviceLabel}</EasyTButton></>}
          />
        </div>
      ) : null}
      <MorroviaConfirmationDialog
        open={Boolean(discardTarget && discardTarget.tripId === trip.id && discardTarget.ownerId === trip.ownerId)}
        title={`Discard device edits for “${tripDisplayTitle(trip)}”?`}
        detail="You are viewing the account copy. This removes only the reviewed recovery copy stored in this browser."
        consequences={[
          "Device-only edits in this recovery copy cannot be restored.",
          "The trip saved to your account will remain unchanged.",
        ]}
        cancelLabel="Keep device edits"
        confirmLabel="Discard device edits"
        error={discardFailed ? "The reviewed device copy could not be removed. Your remaining device edits are intact." : undefined}
        onCancel={() => { setDiscardTarget(null); setDiscardFailed(false); }}
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
  { id: "itinerary", label: "Itinerary", icon: CalendarDays, suffix: "/itinerary" },
  { id: "explore", label: "Explore", icon: Sparkles, suffix: "/explore" },
  { id: "stay", label: "Stay", icon: BedDouble, suffix: "/stay" },
  { id: "transport", label: "Transport", icon: Route, suffix: "/transport" },
] as const;

type TripWorkspaceView = typeof views[number]["id"];
type TripWorkspaceNavigation = {
  pendingView: TripWorkspaceView | null;
  queuedView: TripWorkspaceView | null;
  navigate: (view: TripWorkspaceView, alreadyCommitted: boolean, cancel: () => void) => void;
  committed: (view: TripWorkspaceView) => void;
};
const TripWorkspaceNavigationContext = createContext<TripWorkspaceNavigation | null>(null);

/** Keep one sibling transition in flight; retain the traveller's last click. */
export function TripWorkspaceNavigationProvider({ tripId, children }: { tripId: string; children: ReactNode }) {
  const router = useRouter();
  const pendingRef = useRef<TripWorkspaceView | null>(null);
  const queuedRef = useRef<TripWorkspaceView | null>(null);
  const [pendingView, setPendingView] = useState<TripWorkspaceView | null>(null);
  const [queuedView, setQueuedView] = useState<TripWorkspaceView | null>(null);
  const hrefFor = useCallback((view: TripWorkspaceView) => view === "overview"
    ? tripWorkspaceHref(tripId)
    : `/journey/${encodeURIComponent(tripId)}${views.find((item) => item.id === view)!.suffix}`, [tripId]);

  const navigate = useCallback((view: TripWorkspaceView, alreadyCommitted: boolean, cancel: () => void) => {
    if (pendingRef.current) {
      queuedRef.current = view;
      setQueuedView(view);
      cancel();
      return;
    }
    if (alreadyCommitted) return;
    pendingRef.current = view;
    setPendingView(view);
  }, []);

  const committed = useCallback((view: TripWorkspaceView) => {
    if (pendingRef.current !== view) return;
    const next = queuedRef.current;
    queuedRef.current = null;
    setQueuedView(null);
    if (next && next !== view) {
      pendingRef.current = next;
      setPendingView(next);
      router.push(hrefFor(next));
    } else {
      pendingRef.current = null;
      setPendingView(null);
    }
  }, [hrefFor, router]);

  useEffect(() => {
    const onHistory = () => {
      pendingRef.current = null;
      queuedRef.current = null;
      setPendingView(null);
      setQueuedView(null);
    };
    window.addEventListener("popstate", onHistory);
    return () => window.removeEventListener("popstate", onHistory);
  }, []);

  useEffect(() => {
    if (!pendingView) return;
    const timeout = window.setTimeout(() => {
      const next = queuedRef.current;
      pendingRef.current = null;
      queuedRef.current = null;
      setPendingView(null);
      setQueuedView(null);
      // A failed route response must not hold the workspace links indefinitely.
      if (next) router.push(hrefFor(next));
      else router.refresh();
    }, 10_000);
    return () => window.clearTimeout(timeout);
  }, [hrefFor, pendingView, router]);

  return <TripWorkspaceNavigationContext.Provider value={{ pendingView, queuedView, navigate, committed }}>{children}</TripWorkspaceNavigationContext.Provider>;
}

/** A route child acknowledges its mount after React commits its workspace. */
export function TripWorkspaceCommit({ view, children }: { view: TripWorkspaceView; children: ReactNode }) {
  const committed = useContext(TripWorkspaceNavigationContext)?.committed;
  useEffect(() => { committed?.(view); }, [committed, view]);
  return <>{children}</>;
}

export function TripShellNavigation({ tripId }: { tripId: string }) {
  const committedSegment = useSelectedLayoutSegment();
  const navigation = useContext(TripWorkspaceNavigationContext);
  const baseHref = `/journey/${encodeURIComponent(tripId)}`;
  const activeView = views.find((view) => view.id === committedSegment)?.id ?? "overview";
  const orientationTarget = useWorkspaceOrientationTarget("overview", "workspace-navigation");

  return (
    <nav ref={orientationTarget} className={styles.subnav} aria-label="Trip workspace" aria-busy={Boolean(navigation?.pendingView)}>
      {views.map((view) => {
        const Icon = view.icon;
        const active = activeView === view.id;
        return (
          <Link
            key={view.id}
            // These dynamic sibling pages share a loading boundary. The
            // default partial prefetch can leave only its fallback available
            // during overlapping transitions; keep each full page ready.
            prefetch={true}
            className={active ? styles.subnavActive : undefined}
            href={view.id === "overview" ? tripWorkspaceHref(tripId) : `${baseHref}${view.suffix}`}
            aria-current={active ? "page" : undefined}
            data-pending={(navigation?.queuedView ?? navigation?.pendingView) === view.id ? "true" : undefined}
            onNavigate={(event) => {
              navigation?.navigate(view.id, active, () => event.preventDefault());
            }}
          >
            <Icon aria-hidden="true" />
            <span>{view.label}</span>
          </Link>
        );
      })}
      {navigation?.pendingView ? <span className={styles.srOnly} role="status">Opening {views.find((view) => view.id === (navigation.queuedView ?? navigation.pendingView))?.label}…</span> : null}
    </nav>
  );
}

export function TripShellChrome({ tripId, children }: { tripId: string; children: ReactNode }) {
  const pathname = usePathname();
  return isTripMapPathname(pathname, tripId) ? null : <>{children}</>;
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

export function TripShellImage() {
  const { trip } = useTripShellMutation();
  const first = [...trip.stops].sort((left, right) => left.order - right.order)[0];
  const place = first ? { name: first.name, country: first.country, region: first.region, administrativeHierarchy: first.administrativeHierarchy, placeType: first.geographicBinding?.placeType, canonicalPlaceId: first.canonicalPlaceId, providerId: first.providerId,
    coordinates: first.longitude !== null && first.latitude !== null ? [first.longitude, first.latitude] as [number, number] : undefined } : null;
  const cacheKey = place ? canonicalPlacePhotoCacheKey(place) : "";
  const [failedImages, setFailedImages] = useState<Record<string, string[]>>({});
  const [resolvedImages, setResolvedImages] = useState<Record<string, OverviewPlaceImage>>({});
  const excluded = failedImages[cacheKey] ?? [];
  const photo = excluded.length >= 3 ? null : tripCoverImage(trip, new Set(excluded)) ?? (excluded.includes(resolvedImages[cacheKey]?.src) ? null : resolvedImages[cacheKey]) ?? null;
  const name = place?.name ?? "", country = place?.country ?? "", region = place?.region, placeType = place?.placeType, canonicalPlaceId = place?.canonicalPlaceId, providerId = place?.providerId, hierarchyKey = JSON.stringify(place?.administrativeHierarchy), coordinateKey = JSON.stringify(place?.coordinates), excludedKey = JSON.stringify(excluded);
  useEffect(() => {
    if (photo || !name || !country || excluded.length >= 3) return;
    const controller = new AbortController();
    void resolveRoutePhotoCandidates([{ cacheKey, occurrenceIds: [cacheKey], queries: [`${name} ${country} travel`], place: { name, country, region, administrativeHierarchy: JSON.parse(hierarchyKey ?? "null"), canonicalPlaceId, providerId, placeType, coordinates: JSON.parse(coordinateKey ?? "null") }, excludedSources: JSON.parse(excludedKey) }], (_candidate, selection) => {
      if (selection.kind === "photo") setResolvedImages(current => ({ ...current, [cacheKey]: resolvedOverviewPhoto(selection.photo) }));
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [cacheKey, name, country, region, hierarchyKey, canonicalPlaceId, providerId, placeType, coordinateKey, excludedKey, photo?.src]);
  const recoverImage = () => {
    if (!photo) return;
    discardFailedRoutePhoto(cacheKey, photo.src);
    setFailedImages(current => ({ ...current, [cacheKey]: [...new Set([...(current[cacheKey] ?? []), photo.src])] }));
    setResolvedImages(current => { if (current[cacheKey]?.src !== photo.src) return current; const next = { ...current }; delete next[cacheKey]; return next; });
  };
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(null);
  const onDisplayState = useCallback((displayed: boolean) => {
    setDisplayedSrc(displayed ? photo?.src ?? null : null);
  }, [photo?.src]);
  return (
    <div className={styles.tripImage}>
      <ResilientImage key={photo?.src ?? "no-photo"} src={photo?.src} alt={photo?.alt ?? ""} onDisplayState={onDisplayState} onError={recoverImage} fallback={<CountryVisualFallback country={country} />} />
      {photo?.sourceLabel && displayedSrc === photo.src ? <MorroviaPhotoCredit className={styles.coverPhotoCredit} size="compact" placement="bottom-right" ownership={photo.provenance === "reviewed-morrovia-first-party" ? "morrovia" : "unknown"} credit={photo.sourceLabel} photoLabel={photo.alt} authorLabel={photo.author} authorHref={photo.authorUrl} sourceLabel={photo.sourceUrl ? "Source" : undefined} sourceHref={photo.sourceUrl} licenseLabel={photo.license} licenseHref={photo.licenseUrl} fullCreditHref={photo.fullCreditUrl} /> : null}
    </div>
  );
}
