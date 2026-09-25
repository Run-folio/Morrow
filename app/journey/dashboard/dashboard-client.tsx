"use client";

import Link from "next/link";
import {
  Archive,
  ArrowRight,
  CalendarCheck2,
  Copy,
  Gift,
  Globe2,
  Grid2X2,
  MapPin,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { EasyTTrip, TripStatus } from "@/lib/easyt/trip";
import { EasyTFeedback } from "@/components/easyt/easyt-feedback";
import { EasyTButton, EasyTField, EasyTLinkButton, EasyTSelect, EasyTSegmentedControl, EasyTTextArea } from "@/components/easyt/easyt-controls";
import { MorroviaBriefNotice, MorroviaConfirmationDialog, MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import ResilientImage from "@/components/easyt/resilient-image";
import MorroviaPhotoCredit from "@/components/easyt/morrovia-photo-credit";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import type { JourneyStop } from "@/lib/journey";
import {
  cacheCanonicalTrip,
  classifyTripRecovery,
  EASYT_TRIP_STORAGE_CHANGE_EVENT,
  loadCachedTrip,
  listTripRecoveries,
  loadTripRecovery,
  reconcileTripCloudMutation,
  resolveCanonicalEquivalentTripRecovery,
  tripRecoveryIsAwaitingCanonicalSave,
  EASYT_LAST_OWNER_KEY,
  loadRememberedOwner,
} from "@/lib/easyt/storage";
import { ownerBoundaryState } from "@/lib/easyt/private-browser-context";
import { journeyReauthenticationPath, tripSyncRecoveryPath } from "@/lib/easyt/trip-continuity";
import { runClientMutation } from "@/lib/easyt/client-mutation";
import { trackEvent } from "@/lib/analytics";
import { easytCopy, languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { mapWorkspaceHref, tripWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { summarizeStampRows } from "@/lib/easyt/stamps";
import { formatIsoDate, parseIsoDate } from "@/lib/easyt/trip-lifecycle";
import { tripDisplayTitle } from "@/lib/easyt/trip-display";
import { dashboardHeroTrip } from "@/lib/easyt/trip-status";
import { accommodationProgress } from "@/lib/easyt/accommodation";
import { mapRouteLegsFromTrip } from "@/lib/easyt/map-spatial-context";
import { routeDestinationPhoto } from "@/lib/easyt/route-images";
import { dashboardLibraryTrips, type DashboardLibraryView, type DashboardSortMode } from "@/lib/easyt/dashboard-library";
import { dashboardTripPhoto, featuredDashboardTripPhoto } from "@/lib/easyt/dashboard-trip-image";
import accountStyles from "../account.module.css";
import styles from "./dashboard.module.css";

type StampSummary = { countryId: string; status: "visited" | "want" };
type DashboardRecoveryIssue = {
  tripId: string;
  tripTitle: string;
  detail: string;
};
function routeLabel(trip: EasyTTrip, fallback: string) {
  return [...trip.stops].sort((left, right) => left.order - right.order).map((stop) => stop.name).join(" → ") || fallback;
}

function formatTripDates(trip: EasyTTrip, language: EasyTLanguage) {
  if (!parseIsoDate(trip.startDate) || !parseIsoDate(trip.endDate)) return language === "es" ? "Fechas por confirmar" : "Dates to confirm";
  const locale = language === "es" ? "es" : "en-GB";
  const startText = formatIsoDate(trip.startDate, locale, { month: "short", day: "numeric" });
  const endText = formatIsoDate(trip.endDate, locale, { month: "short", day: "numeric", year: "numeric" });
  return `${startText} – ${endText}`;
}

function featuredTripFrom(trips: EasyTTrip[]) {
  return dashboardHeroTrip(trips);
}

function featuredTitleParts(title: string) {
  const comma = title.indexOf(",");
  if (comma < 0) return { direct: title, expressive: "" };
  return { direct: title.slice(0, comma + 1), expressive: title.slice(comma + 1).trim() };
}

function totalNights(trip: EasyTTrip) {
  return trip.stops.reduce((total, stop) => total + Math.max(0, stop.nights ?? 0), 0);
}

function tripMapStops(trip: EasyTTrip): JourneyStop[] {
  return [...trip.stops].sort((left, right) => left.order - right.order).map((stop) => ({
    id: stop.id,
    city: stop.name,
    country: stop.country,
    date: stop.arrivalDate ?? "",
    coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] : null,
    theme: "city",
    marker: "town",
    description: "",
    highlights: [],
    aiPrompt: "",
  }));
}

function TripRoutePreview({ trip, label, compact = false }: { trip: EasyTTrip; label: string; compact?: boolean }) {
  const ownerRef = useRef<HTMLDivElement>(null);
  const [ownsMap, setOwnsMap] = useState(false);
  const stops = tripMapStops(trip);
  useEffect(() => {
    const owner = ownerRef.current;
    if (!owner) return;
    if (typeof IntersectionObserver === "undefined") {
      setOwnsMap(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setOwnsMap(Boolean(entry?.isIntersecting));
    }, { rootMargin: "240px 0px" });
    observer.observe(owner);
    return () => observer.disconnect();
  }, []);

  if (stops.filter((stop) => stop.coordinates).length < 2) {
    return <div className={styles.routePreviewFallback}><MapPin aria-hidden="true" /><span>{trip.stops.length} {trip.stops.length === 1 ? "place" : "places"} selected</span></div>;
  }
  return <div ref={ownerRef} className={styles.routePreviewOwner}>
    {ownsMap ? <JourneyPlannerMap
    stops={stops}
    legs={mapRouteLegsFromTrip(trip)}
    selectedId=""
    plannerPins={[]}
    focusCoordinates={null}
    draftPinCoordinates={null}
    pinPlacementMode={false}
    overviewMode
    surface={{ variant: "preview" }}
    previewLabel={label}
    cameraSafeEdge={compact ? 14 : 28}
    onMapPinDrop={() => undefined}
    onPlannerPinSelect={() => undefined}
    onSelect={() => undefined}
    /> : <div className={styles.routePreviewFallback}><Globe2 aria-hidden="true" /><span>{routeLabel(trip, "Route preview")}</span></div>}
  </div>;
}

function statusLabel(status: TripStatus, language: EasyTLanguage) {
  if (language === "es") return status === "draft" ? "Activo" : status === "planned" ? "Planificado" : "Archivado";
  return status === "draft" ? "Active" : status === "planned" ? "Planned" : "Archived";
}

function trackTripReopened(trip: EasyTTrip) {
  // Dashboard rows are owner-scoped cloud documents. Cache that exact
  // revision before navigation so dashboard and direct links resolve alike.
  // Storage and analytics are both best effort: neither may block Open.
  try { cacheCanonicalTrip(trip); } catch { /* Browser storage can be disabled or full. */ }
  try { trackEvent("trip_reopened", { trip_id: trip.id, source: "dashboard", save_state: "cloud", stop_count: trip.stops.length }); } catch { /* Navigation remains primary. */ }
}

export default function DashboardClient({ trips, stamps, ownerId }: { trips: EasyTTrip[]; stamps: StampSummary[]; ownerId: string }) {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const authenticatedOwnerRef = useRef<string | null>(ownerId);
  if (session?.user?.id) authenticatedOwnerRef.current = session.user.id;
  const [rememberedOwnerId, setRememberedOwnerId] = useState<string | null>(ownerId);
  const [view, setView] = useState<DashboardLibraryView>("all");
  const [sort, setSort] = useState<DashboardSortMode>("updated");
  const [query, setQuery] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [workingAction, setWorkingAction] = useState<"archive" | "restore" | "duplicate" | "delete" | null>(null);
  const actionInFlightRef = useRef<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [failedAction, setFailedAction] = useState<{ id: string; action: "archive" | "restore" | "duplicate" } | null>(null);
  const [actionNotice, setActionNotice] = useState<{ title: string; detail: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EasyTTrip | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [gifting, setGifting] = useState<EasyTTrip | null>(null);
  const [giftEmail, setGiftEmail] = useState("");
  const [giftNote, setGiftNote] = useState("");
  const [giftState, setGiftState] = useState<"idle" | "sending" | "complete">("idle");
  const [giftError, setGiftError] = useState("");
  const [claimUrl, setClaimUrl] = useState("");
  const giftRequestRef = useRef<{ signature: string; key: string } | null>(null);
  const [delivered, setDelivered] = useState(false);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [recoveryIssues, setRecoveryIssues] = useState<Record<string, DashboardRecoveryIssue>>({});
  const [recoveryState, setRecoveryState] = useState<"checking" | "none" | "syncing" | "issue">("checking");
  const [recoveryVersion, setRecoveryVersion] = useState(0);
  const [showDetachedRecoveries, setShowDetachedRecoveries] = useState(false);
  const copy = easytCopy[language].dashboard;

  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  const boundary = ownerBoundaryState({
    renderedOwnerId: ownerId,
    sessionOwnerId: session?.user?.id,
    rememberedOwnerId,
    sessionPending,
    previouslyAuthenticatedOwnerId: authenticatedOwnerRef.current,
  });

  useEffect(() => {
    const refreshOwner = () => setRememberedOwnerId(loadRememberedOwner());
    const onStorage = (event: StorageEvent) => {
      if (event.key === EASYT_LAST_OWNER_KEY) refreshOwner();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (boundary === "mismatch") router.refresh();
  }, [boundary, router]);

  useEffect(() => {
    const refreshRecoveries = () => setRecoveryVersion((version) => version + 1);
    window.addEventListener(EASYT_TRIP_STORAGE_CHANGE_EVENT, refreshRecoveries);
    window.addEventListener("storage", refreshRecoveries);
    return () => {
      window.removeEventListener(EASYT_TRIP_STORAGE_CHANGE_EVENT, refreshRecoveries);
      window.removeEventListener("storage", refreshRecoveries);
    };
  }, []);

  useEffect(() => {
    const nextIssues: Record<string, DashboardRecoveryIssue> = {};
    for (const recovery of listTripRecoveries(ownerId)) {
      if (tripRecoveryIsAwaitingCanonicalSave(recovery)) continue;
      const canonicalTrip = trips.find((candidate) => candidate.id === recovery.tripId);
      if (canonicalTrip) {
        const classification = classifyTripRecovery({
          recovery,
          canonicalTrip,
          previousCanonicalTrip: loadCachedTrip(recovery.tripId, ownerId),
        });
        if (classification === "equivalent") resolveCanonicalEquivalentTripRecovery(canonicalTrip, recovery);
        else if (classification === "historical-superseded") cacheCanonicalTrip(canonicalTrip);
        const remaining = loadTripRecovery(recovery.tripId, ownerId);
        if (!remaining) continue;
        nextIssues[recovery.tripId] = {
          tripId: recovery.tripId,
          tripTitle: tripDisplayTitle(canonicalTrip),
          detail: "This cloud trip is saved. A separate device copy has traveller changes that still need review.",
        };
        continue;
      }
      nextIssues[recovery.tripId] = {
        tripId: recovery.tripId,
        tripTitle: tripDisplayTitle(recovery.trip),
        detail: recovery.conflictReason === "cloud-deleted"
          ? "This trip is no longer in the cloud, but its device copy remains protected for review."
          : "A device copy remains protected, but its cloud trip is not in this dashboard.",
      };
    }
    setRecoveryIssues(nextIssues);
    setRecoveryState(Object.keys(nextIssues).length ? "issue" : "none");
  }, [ownerId, recoveryVersion, trips]);

  const counts = useMemo(() => ({
    draft: trips.filter((trip) => trip.status === "draft").length,
    planned: trips.filter((trip) => trip.status === "planned").length,
    archived: trips.filter((trip) => trip.status === "archived").length,
  }), [trips]);
  const visibleTrips = useMemo(() => dashboardLibraryTrips(trips, { query, sort, view }), [query, sort, trips, view]);
  const showFeaturedTrip = view === "all" && !query.trim();
  const featuredTrip = useMemo(() => {
    if (!showFeaturedTrip) return null;
    return featuredTripFrom(trips);
  }, [showFeaturedTrip, trips]);
  const secondaryTrips = useMemo(() => visibleTrips.filter((trip) => trip.id !== featuredTrip?.id), [featuredTrip?.id, visibleTrips]);
  const upcomingTrips = useMemo(() => secondaryTrips.filter((trip) => trip.status === "planned"), [secondaryTrips]);
  const ideaTrips = useMemo(() => secondaryTrips.filter((trip) => trip.status === "draft"), [secondaryTrips]);
  const pastTrips = useMemo(() => secondaryTrips.filter((trip) => trip.status === "archived"), [secondaryTrips]);

  const runAction = async (id: string, action: "archive" | "restore" | "duplicate") => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = id;
    setWorking(id);
    setWorkingAction(action);
    setActionError("");
    setFailedAction(null);
    try {
      const result = await runClientMutation(() => fetch(`/api/easyt/trips/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      }));
      if (result.kind === "network") {
        setActionError("This trip could not be updated. Check your connection and try again.");
        setFailedAction({ id, action });
        return;
      }
      const response = result.value;
      if (response.ok) {
        const payload = await response.json() as { trip?: EasyTTrip };
        if ((action === "archive" || action === "restore") && payload.trip) {
          reconcileTripCloudMutation(ownerId, id, action, payload.trip);
          setActionNotice({
            title: action === "archive"
              ? (language === "es" ? "Viaje archivado" : "Trip archived")
              : (language === "es" ? "Viaje restaurado" : "Trip restored"),
            detail: action === "archive"
              ? (language === "es"
                ? `“${tripDisplayTitle(payload.trip)}” está ahora en Viajes archivados.`
                : `“${tripDisplayTitle(payload.trip)}” is now in Archived trips.`)
              : (language === "es"
                ? `“${tripDisplayTitle(payload.trip)}” está ahora en Viajes activos.`
                : `“${tripDisplayTitle(payload.trip)}” is now in Active trips.`),
          });
        }
        if (action === "duplicate" && payload.trip) {
          setActionNotice({
            title: language === "es" ? "Viaje duplicado" : "Trip duplicated",
            detail: language === "es"
              ? `“${tripDisplayTitle(payload.trip)}” está ahora en Viajes activos.`
              : `“${tripDisplayTitle(payload.trip)}” is now in Active trips.`,
          });
        }
        router.refresh();
      }
      else {
        setActionError(response.status === 401 ? "Your session ended. Sign in again before changing this trip." : "This trip could not be updated. Please try again.");
        if (response.status !== 401) setFailedAction({ id, action });
      }
    } catch {
      setActionError("This trip could not be updated. Check your connection and try again.");
      setFailedAction({ id, action });
    } finally {
      actionInFlightRef.current = null;
      setWorking(null);
      setWorkingAction(null);
    }
  };

  const remove = async (trip: EasyTTrip) => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = trip.id;
    setWorking(trip.id);
    setWorkingAction("delete");
    setDeleteError("");
    try {
      const response = await fetch(`/api/easyt/trips/${encodeURIComponent(trip.id)}`, { method: "DELETE" });
      if (response.ok) {
        reconcileTripCloudMutation(ownerId, trip.id, "delete");
        setPendingDelete(null);
        setActionNotice({
          title: language === "es" ? "Viaje eliminado" : "Trip deleted",
          detail: language === "es"
            ? `“${tripDisplayTitle(trip)}” se eliminó de tu cuenta.`
            : `“${tripDisplayTitle(trip)}” was removed from your account.`,
        });
        router.refresh();
      }
      else setDeleteError(response.status === 401 ? "Your session ended. Sign in again before deleting this trip." : "This trip could not be deleted. Please try again.");
    } catch {
      setDeleteError("This trip could not be deleted. Check your connection and try again.");
    } finally {
      actionInFlightRef.current = null;
      setWorking(null);
      setWorkingAction(null);
    }
  };

  const openGift = (trip: EasyTTrip) => {
    setGifting(trip);
    setGiftEmail("");
    setGiftNote("");
    setGiftState("idle");
    setGiftError("");
    setClaimUrl("");
    giftRequestRef.current = null;
  };

  const sendGift = async () => {
    if (!gifting) return;
    setGiftState("sending");
    setGiftError("");
    try {
      const signature = JSON.stringify([gifting.id, giftEmail.trim().toLowerCase(), giftNote.trim()]);
      if (giftRequestRef.current?.signature !== signature) {
        giftRequestRef.current = { signature, key: crypto.randomUUID() };
      }
      const response = await fetch(`/api/easyt/trips/${encodeURIComponent(gifting.id)}/gift`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": giftRequestRef.current.key,
        },
        body: JSON.stringify({ email: giftEmail, note: giftNote }),
      });
      const payload = (await response.json()) as { error?: string; claimUrl?: string; delivered?: boolean };
      if (!response.ok || !payload.claimUrl) {
        setGiftError(response.status === 401 ? "Your session ended. Sign in again before sharing this trip." : payload.error || (language === "es" ? "No se pudo crear la invitación." : "Unable to create invitation."));
        return;
      }
      setClaimUrl(payload.claimUrl);
      setDelivered(Boolean(payload.delivered));
      setGiftState("complete");
    } catch {
      setGiftError(language === "es" ? "Revisa tu conexión e inténtalo de nuevo." : "Check your connection and try again.");
    } finally {
      setGiftState((current) => current === "complete" ? current : "idle");
    }
  };

  const stampSummary = summarizeStampRows(stamps);
  const visitedCount = stampSummary.visited;
  const wantCount = stampSummary.want;
  const isSpanish = language === "es";
  const featuredPhoto = featuredTrip ? featuredDashboardTripPhoto(featuredTrip) : null;
  const featuredTitle = featuredTrip ? featuredTitleParts(tripDisplayTitle(featuredTrip)) : null;
  const closingPhoto = routeDestinationPhoto("Tokyo", "Japan");
  const closingPhotoSrc = closingPhoto?.variants.at(-1)?.src;
  const featuredRecoveryIssue = featuredTrip ? recoveryIssues[featuredTrip.id] : undefined;
  const orphanRecoveryIssues = Object.values(recoveryIssues).filter((issue) => !trips.some((trip) => trip.id === issue.tripId));

  if (boundary === "mismatch") return <MorroviaStatusBanner className={styles.dashboardNotice} title="Account changed" detail="Refreshing your private dashboard…" />;
  if (boundary === "expired" || boundary === "signed-out") return <MorroviaStatusBanner className={styles.dashboardNotice} tone="danger" title="Your session ended" detail="Your saved trips are hidden until you sign in again." actions={<EasyTLinkButton href={journeyReauthenticationPath("/journey/dashboard")}>Sign in again</EasyTLinkButton>} />;

  return (
    <>
      {actionNotice ? <div className={styles.actionNotice}><MorroviaBriefNotice title={actionNotice.title} detail={actionNotice.detail} autoDismissMs={6500} onDismiss={() => setActionNotice(null)} /></div> : null}
      {actionError ? <MorroviaStatusBanner className={styles.dashboardNotice} tone="danger" title={actionError} actions={actionError.includes("session") ? <EasyTLinkButton size="small" href={journeyReauthenticationPath("/journey/dashboard")}>Sign in again</EasyTLinkButton> : failedAction ? <EasyTButton size="small" variant="secondary" onClick={() => void runAction(failedAction.id, failedAction.action)}>{isSpanish ? "Reintentar" : "Try again"}</EasyTButton> : undefined} /> : null}
      {orphanRecoveryIssues.length ? <>
        <MorroviaStatusBanner
          className={styles.dashboardNotice}
          tone="warning"
          title={orphanRecoveryIssues.length === 1 ? `${orphanRecoveryIssues[0].tripTitle} has a protected device copy` : `${orphanRecoveryIssues.length} protected device copies are available`}
          detail={orphanRecoveryIssues.length === 1 ? orphanRecoveryIssues[0].detail : "Their cloud trips are not currently in this dashboard. The device copies remain safe until you choose to review them."}
          actions={orphanRecoveryIssues.length === 1
            ? <EasyTLinkButton size="small" variant="secondary" href={tripSyncRecoveryPath(orphanRecoveryIssues[0].tripId)}>Review device copy</EasyTLinkButton>
            : <EasyTButton size="small" variant="secondary" aria-expanded={showDetachedRecoveries} aria-controls="dashboard-detached-recoveries" onClick={() => setShowDetachedRecoveries((shown) => !shown)}>{showDetachedRecoveries ? "Hide device copies" : "Review device copies"}</EasyTButton>}
        />
        {showDetachedRecoveries && orphanRecoveryIssues.length > 1 ? <section id="dashboard-detached-recoveries" className={styles.detachedRecoveryList} aria-label="Protected device copies">
          {orphanRecoveryIssues.map((issue) => <article key={issue.tripId}>
            <div><strong>{issue.tripTitle}</strong><span>{issue.detail}</span></div>
            <EasyTLinkButton size="small" variant="secondary" href={tripSyncRecoveryPath(issue.tripId)}>Review device copy</EasyTLinkButton>
          </article>)}
        </section> : null}
      </> : null}
      {featuredTrip ? (
        <article className={styles.currentJourney} aria-labelledby="current-journey-title">
          <div className={styles.currentMedia}>
            <ResilientImage
              src={featuredPhoto?.src}
              alt={featuredPhoto?.alt ?? ""}
              fallback={<div className={styles.currentMediaFallback}><Globe2 aria-hidden="true" /><span>{routeLabel(featuredTrip, copy.routeWaiting)}</span></div>}
            />
            <div className={styles.currentIdentity}>
              <p className={styles.eyebrow}>{isSpanish ? "Tu viaje actual" : "Your current journey"}</p>
              <h2 id="current-journey-title"><span>{featuredTitle?.direct}</span>{featuredTitle?.expressive ? <em>{featuredTitle.expressive}</em> : null}</h2>
              <p>{routeLabel(featuredTrip, copy.routeWaiting)}</p>
            </div>
            {featuredPhoto?.creditLabel ? <MorroviaPhotoCredit photoLabel={featuredPhoto.alt} credit={featuredPhoto.creditLabel} sourceHref={featuredPhoto.creditHref} licenseHref={featuredPhoto.licenseHref} fullCreditHref={featuredPhoto.fullCreditHref} /> : null}
          </div>
          <div className={styles.currentDetails}>
            {featuredRecoveryIssue ? <MorroviaStatusBanner className={styles.featuredRecoveryNotice} tone="warning"
              title={`${featuredRecoveryIssue.tripTitle} has device changes to review`}
              detail={featuredRecoveryIssue.detail}
              actions={<EasyTLinkButton size="small" variant="secondary" href={tripSyncRecoveryPath(featuredRecoveryIssue.tripId)}>Review device copy</EasyTLinkButton>}
            /> : null}
            <div className={styles.currentFacts}>
              <time>{formatTripDates(featuredTrip, language)}</time>
              <span>{featuredTrip.stops.length} {isSpanish ? "paradas" : "stops"}</span>
              <span>{totalNights(featuredTrip)} {isSpanish ? "noches" : "nights"}</span>
              <span>{featuredTrip.travellers} {isSpanish ? "viajeros" : "travellers"}</span>
            </div>
            <div className={styles.currentActions}>
              <EasyTLinkButton href={tripWorkspaceHref(featuredTrip.id)} onClick={() => trackTripReopened(featuredTrip)}>
                {isSpanish ? "Continuar viaje" : "Continue trip"}<ArrowRight aria-hidden="true" />
              </EasyTLinkButton>
              <nav className={styles.workspaceLinks} aria-label={`${tripDisplayTitle(featuredTrip)} ${isSpanish ? "vistas" : "views"}`}>
                <Link href={tripWorkspaceHref(featuredTrip.id)} onClick={() => trackTripReopened(featuredTrip)}>Overview</Link>
                <Link href={`/journey/${encodeURIComponent(featuredTrip.id)}/itinerary`} onClick={() => trackTripReopened(featuredTrip)}>Itinerary</Link>
              </nav>
              <TripActionsMenu trip={featuredTrip} language={language} copy={copy} working={working === featuredTrip.id} workingAction={working === featuredTrip.id ? workingAction : null} onAction={runAction} onGift={openGift} onRemove={(trip) => { setDeleteError(""); setPendingDelete(trip); }} />
            </div>
          </div>
          <Link className={styles.currentMap} href={mapWorkspaceHref(featuredTrip.id, null, "plan", null, null, null, "/journey/dashboard")} onClick={() => trackTripReopened(featuredTrip)} aria-label={`${isSpanish ? "Abrir mapa de" : "Open map for"} ${tripDisplayTitle(featuredTrip)}`}>
            <TripRoutePreview trip={featuredTrip} label={`${tripDisplayTitle(featuredTrip)} ${isSpanish ? "vista previa de la ruta" : "route preview"}`} />
            <span>{featuredTrip.stops.length} {isSpanish ? "lugares, un viaje" : "places, one journey"}<ArrowRight aria-hidden="true" /></span>
          </Link>
        </article>
      ) : !showFeaturedTrip ? null : recoveryState === "checking" || recoveryState === "syncing" ? (
        <article className={styles.emptyHero} aria-live="polite">
          <p className={styles.eyebrow}>{isSpanish ? "Recuperación" : "Recovery"}</p>
          <h2>{isSpanish ? "Comprobando un viaje guardado en este dispositivo…" : "Checking for a saved trip on this device…"}</h2>
          <p>{isSpanish ? "No crearemos ni ocultaremos nada mientras termina la comprobación." : "Nothing will be created or hidden while this safety check finishes."}</p>
        </article>
      ) : (
        <article className={styles.emptyHero}>
          <p className={styles.eyebrow}>{isSpanish ? "Tu primer viaje" : "Your first trip"}</p>
          <h2>{isSpanish ? "Empieza con un viaje que ya tienes en mente." : "Start with a trip you’ve been thinking about."}</h2>
          <p>{isSpanish ? "Describe los lugares, el tiempo y el estilo de viaje." : "Describe the places, time and travel style. Morrovia will help shape the route."}</p>
          <EasyTLinkButton href="/#start-building">{isSpanish ? "Planificar un viaje nuevo" : "Plan a new trip"}<ArrowRight aria-hidden="true" /></EasyTLinkButton>
        </article>
      )}

      {trips.length ? <section className={styles.tripLibrary} aria-labelledby="trip-library-title">
        <h2 id="trip-library-title" className={styles.srOnly}>{isSpanish ? "Tus viajes" : "Your trips"}</h2>
        <div className={styles.libraryToolbar}>
          <EasyTSegmentedControl<DashboardLibraryView>
            ariaLabel={isSpanish ? "Filtrar por estado del viaje" : "Filter by trip status"}
            className={styles.filterControl}
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: isSpanish ? "Todos" : "All", count: trips.length, controls: "dashboard-trip-grid" },
              ...(["planned", "draft", "archived"] as TripStatus[]).map((status) => ({ value: status, label: statusLabel(status, language), count: counts[status], controls: "dashboard-trip-grid" })),
            ]}
          />
          <div className={styles.libraryTools}>
            <EasyTField fieldClassName={styles.searchControl} label={isSpanish ? "Buscar viajes" : "Search trips"} labelClassName={styles.srOnly} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isSpanish ? "Buscar viajes" : "Search trips"} />
            <EasyTSelect fieldClassName={styles.sortControl} label={isSpanish ? "Ordenar viajes" : "Sort trips"} labelClassName={styles.srOnly} value={sort} onChange={(event) => setSort(event.target.value as DashboardSortMode)}>
              <option value="updated">{isSpanish ? "Ordenar: Actualizados" : "Sort by: Recently updated"}</option>
              <option value="upcoming">{isSpanish ? "Ordenar: Fecha de inicio" : "Sort by: Start date"}</option>
              <option value="title">{isSpanish ? "Ordenar: Título" : "Sort by: Title"}</option>
            </EasyTSelect>
            <span className={styles.gridIndicator} role="img" aria-label={isSpanish ? "Vista de cuadrícula" : "Grid view"}><Grid2X2 aria-hidden="true" /></span>
          </div>
        </div>

        <div id="dashboard-trip-grid" className={styles.tripSections}>
          {sort === "updated" ? <RecentlyUpdatedTrips trips={secondaryTrips} recoveryIssues={recoveryIssues} language={language} copy={copy} working={working} workingAction={workingAction} onAction={runAction} onGift={openGift} onRemove={(trip) => { setDeleteError(""); setPendingDelete(trip); }} /> : <>
            <JourneySection kind="upcoming" trips={upcomingTrips} recoveryIssues={recoveryIssues} language={language} copy={copy} working={working} workingAction={workingAction} onAction={runAction} onGift={openGift} onRemove={(trip) => { setDeleteError(""); setPendingDelete(trip); }} />
            <JourneySection kind="idea" trips={ideaTrips} recoveryIssues={recoveryIssues} language={language} copy={copy} working={working} workingAction={workingAction} onAction={runAction} onGift={openGift} onRemove={(trip) => { setDeleteError(""); setPendingDelete(trip); }} />
            <JourneySection kind="past" trips={pastTrips} recoveryIssues={recoveryIssues} language={language} copy={copy} working={working} workingAction={workingAction} onAction={runAction} onGift={openGift} onRemove={(trip) => { setDeleteError(""); setPendingDelete(trip); }} />
          </>}
          {!secondaryTrips.length && (Boolean(query) || view !== "all") ? (
            <div className={styles.emptyState}>
              <Globe2 aria-hidden="true" />
              <h3>{query ? (isSpanish ? "Ningún viaje coincide." : "No trips match that search.") : view === "archived" ? copy.emptyArchived : view === "planned" ? (isSpanish ? "Aún no hay viajes planificados." : "No planned trips yet.") : copy.emptyActive}</h3>
              <p>{query ? (isSpanish ? "Prueba otro destino o título." : "Try another destination or title.") : view === "archived" ? copy.archivedHint : copy.activeHint}</p>
              {view !== "archived" && !query ? <EasyTLinkButton href="/#start-building">{isSpanish ? "Crear un viaje" : "Start a trip"}<ArrowRight aria-hidden="true" /></EasyTLinkButton> : null}
            </div>
          ) : null}
        </div>
      </section> : null}

      <section className={styles.closingInvitation} aria-labelledby="closing-invitation-title">
        <ResilientImage src={closingPhotoSrc} alt={closingPhoto?.alt ?? ""} fallback={<div className={styles.closingFallback}><Globe2 aria-hidden="true" /></div>} />
        <div className={styles.closingContent}>
          <p className={styles.eyebrow}>{isSpanish ? "Otro lugar que te llama" : "Another way to go"}</p>
          <h2 id="closing-invitation-title"><span>{isSpanish ? "¿Algún otro lugar" : "Somewhere else"}</span><em>{isSpanish ? "en mente?" : "on your mind?"}</em></h2>
          <EasyTLinkButton variant="secondary" href="/#start-building">{isSpanish ? "Empezar otro viaje" : "Start another trip"}<ArrowRight aria-hidden="true" /></EasyTLinkButton>
        </div>
        {closingPhoto ? <MorroviaPhotoCredit photoLabel={closingPhoto.alt} credit={`${closingPhoto.author} · ${closingPhoto.license}`} sourceHref={closingPhoto.sourceUrl} licenseHref={closingPhoto.licenseUrl} fullCreditHref={`/journey/immersive/credits.html#${closingPhoto.key}`} /> : null}
      </section>

      <footer className={styles.libraryFooter}>
        <p>{isSpanish ? "Cada viaje, a su tiempo." : "Every journey, in its own time."}</p>
        <Link href="/journey/stamps">{isSpanish ? "Tus sellos" : "Your Stamps"}<span>{visitedCount} {isSpanish ? "visitados" : "visited"} · {wantCount} {isSpanish ? "deseados" : "want to go"}</span><ArrowRight aria-hidden="true" /></Link>
      </footer>

      {gifting ? (
        <div className={accountStyles.giftOverlay} role="presentation" onMouseDown={() => setGifting(null)}>
          <section className={accountStyles.giftDialog} role="dialog" aria-modal="true" aria-labelledby="gift-title" onMouseDown={(event) => event.stopPropagation()}>
            <EasyTButton className={accountStyles.giftClose} icon={X} iconOnly size="small" variant="secondary" onClick={() => setGifting(null)} aria-label={isSpanish ? "Cerrar diálogo" : "Close gift dialog"}>{isSpanish ? "Cerrar diálogo" : "Close gift dialog"}</EasyTButton>
            <span className={accountStyles.giftDialogIcon}><Gift aria-hidden="true" /></span>
            <p className={accountStyles.eyebrow}>{copy.giftTitle}</p>
            <h2 id="gift-title">{isSpanish ? "Compartir" : "Share"} {tripDisplayTitle(gifting)}</h2>
            {giftState === "complete" ? (
              <div className={accountStyles.giftComplete}>
                <p>{delivered ? copy.inviteSent : copy.inviteReady}</p>
                <input value={claimUrl} readOnly aria-label={isSpanish ? "Enlace para reclamar" : "Gift claim link"} />
                <EasyTButton className={accountStyles.primaryLink} onClick={() => navigator.clipboard.writeText(claimUrl)}>{copy.copyLink}</EasyTButton>
              </div>
            ) : (
              <>
                <p className={accountStyles.muted}>{copy.draftHint}</p>
                <EasyTField fieldClassName={accountStyles.field} label={copy.recipient} type="email" value={giftEmail} onChange={(event) => setGiftEmail(event.target.value)} placeholder="friend@example.com" autoComplete="email" />
                <EasyTTextArea fieldClassName={accountStyles.field} label={copy.note} value={giftNote} onChange={(event) => setGiftNote(event.target.value)} placeholder={isSpanish ? "Un pequeño adelanto para nuestra próxima aventura…" : "A little head start for our next adventure…"} maxLength={500} />
                {giftError ? <p className={accountStyles.syncError}>{giftError}</p> : null}
                <EasyTButton className={accountStyles.primaryLink} loading={giftState === "sending"} onClick={sendGift}>{giftState === "sending" ? copy.creatingInvite : copy.createInvite}</EasyTButton>
              </>
            )}
          </section>
        </div>
      ) : null}
      <MorroviaConfirmationDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `${isSpanish ? "¿Eliminar" : "Delete"} “${tripDisplayTitle(pendingDelete)}”?` : "Delete trip?"}
        detail={isSpanish ? "Este viaje se eliminará de tu cuenta." : "This trip will be removed from your account."}
        consequences={isSpanish
          ? ["El plan, las notas y los datos guardados de este viaje dejarán de estar disponibles.", "Esta acción no se puede deshacer desde Morrovia."]
          : ["The plan, notes and saved trip data will no longer be available.", "This action cannot be undone in Morrovia."]}
        cancelLabel={isSpanish ? "Conservar viaje" : "Keep trip"}
        confirmLabel={isSpanish ? "Eliminar viaje" : "Delete trip"}
        confirming={Boolean(pendingDelete && working === pendingDelete.id)}
        error={deleteError || undefined}
        onCancel={() => { if (!working) { setPendingDelete(null); setDeleteError(""); } }}
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete); }}
      />
      <EasyTFeedback />
    </>
  );
}

type DashboardTripCopy = {
  routeWaiting: string;
  edit: string;
  restore: string;
  archive: string;
  duplicate: string;
  gift: string;
  delete: string;
};

type JourneyCardActions = {
  language: EasyTLanguage;
  copy: DashboardTripCopy;
  recoveryIssues: Record<string, DashboardRecoveryIssue>;
  working: string | null;
  workingAction: "archive" | "restore" | "duplicate" | "delete" | null;
  onAction: (id: string, action: "archive" | "restore" | "duplicate") => void;
  onGift: (trip: EasyTTrip) => void;
  onRemove: (trip: EasyTTrip) => void;
};

function RecentlyUpdatedTrips({ trips, language, copy, recoveryIssues, working, workingAction, onAction, onGift, onRemove }: JourneyCardActions & { trips: EasyTTrip[] }) {
  if (!trips.length) return null;
  const cardProps = { language, copy, recoveryIssues, workingAction, onAction, onGift, onRemove };
  return <section className={`${styles.journeySection} ${styles.recentSection}`} aria-labelledby="recent-journeys-title">
    <h2 id="recent-journeys-title" className={styles.srOnly}>{language === "es" ? "Viajes actualizados recientemente" : "Recently updated trips"}</h2>
    <div className={styles.sectionGrid} data-count={Math.min(trips.length, 4)}>
      {trips.map((trip) => <TripCard key={trip.id} trip={trip} {...cardProps} working={working === trip.id} />)}
    </div>
  </section>;
}

function JourneySection({ kind, trips, language, copy, recoveryIssues, working, workingAction, onAction, onGift, onRemove }: JourneyCardActions & {
  kind: "upcoming" | "idea" | "past";
  trips: EasyTTrip[];
}) {
  if (!trips.length) return null;
  const isSpanish = language === "es";
  const headings = {
    upcoming: isSpanish ? ["Más allá", "en el horizonte."] : ["Further on", "the horizon."],
    idea: isSpanish ? ["Ideas", "tomando forma."] : ["Ideas", "taking shape."],
    past: isSpanish ? ["Viajes pasados.", "Listos para volver."] : ["Past journeys.", "Ready to revisit."],
  } as const;
  const visibleTrips = kind === "past" ? trips.slice(0, 3) : trips;
  const olderTrips = kind === "past" ? trips.slice(3) : [];
  const cardProps = { language, copy, recoveryIssues, workingAction, onAction, onGift, onRemove };
  return <section className={`${styles.journeySection} ${styles[`${kind}Section`]}`} aria-labelledby={`${kind}-journeys-title`}>
    <header className={styles.sectionHeading}>
      <h2 id={`${kind}-journeys-title`}><span>{headings[kind][0]}</span><em>{headings[kind][1]}</em></h2>
      <p>{kind === "upcoming"
        ? (isSpanish ? "Rutas decididas, listas para preparar." : "Routes decided, ready for the details.")
        : kind === "idea"
          ? (isSpanish ? "Bocetos de rutas que aún pueden cambiar." : "Route sketches that still have room to change.")
          : (isSpanish ? "Lugares vividos, guardados para otra vez." : "Places lived, kept close for another time.")}</p>
    </header>
    <div className={styles.sectionGrid} data-count={Math.min(visibleTrips.length, 4)}>
      {visibleTrips.map((trip) => <TripCard key={trip.id} kind={kind} trip={trip} {...cardProps} working={working === trip.id} />)}
    </div>
    {olderTrips.length ? <details className={styles.olderJourneys}>
      <summary>{isSpanish ? `Ver ${olderTrips.length} viajes anteriores` : `Show ${olderTrips.length} older ${olderTrips.length === 1 ? "journey" : "journeys"}`}<ArrowRight aria-hidden="true" /></summary>
      <div className={styles.sectionGrid} data-count={Math.min(olderTrips.length, 4)}>
        {olderTrips.map((trip) => <TripCard key={trip.id} kind="past" trip={trip} {...cardProps} working={working === trip.id} />)}
      </div>
    </details> : null}
  </section>;
}

function TripActionsMenu({ trip, language, copy, working, workingAction, onAction, onGift, onRemove }: {
  trip: EasyTTrip;
  language: EasyTLanguage;
  copy: DashboardTripCopy;
  working: boolean;
  workingAction: "archive" | "restore" | "duplicate" | "delete" | null;
  onAction: (id: string, action: "archive" | "restore" | "duplicate") => void;
  onGift: (trip: EasyTTrip) => void;
  onRemove: (trip: EasyTTrip) => void;
}) {
  const actionLabel = (action: "archive" | "restore" | "duplicate") => {
    if (!working || workingAction !== action) return action === "archive" ? copy.archive : action === "restore" ? copy.restore : copy.duplicate;
    if (language === "es") return action === "archive" ? "Archivando…" : action === "restore" ? "Restaurando…" : "Duplicando…";
    return action === "archive" ? "Archiving…" : action === "restore" ? "Restoring…" : "Duplicating…";
  };
  return <details className={styles.tripMenu}>
        <summary aria-label={`${language === "es" ? "Acciones para" : "Actions for"} ${tripDisplayTitle(trip)}`}><MoreHorizontal aria-hidden="true" /></summary>
        <div>
          <Link href={`/journey/trip?trip=${encodeURIComponent(trip.id)}`} onClick={() => trackTripReopened(trip)}><CalendarCheck2 aria-hidden="true" />{language === "es" ? "Modo viaje" : "Trip mode"}</Link>
          {trip.status === "archived" ? <EasyTButton icon={RotateCcw} variant="quiet" size="small" fullWidth disabled={working} onClick={() => onAction(trip.id, "restore")}>{actionLabel("restore")}</EasyTButton> : <EasyTButton icon={Archive} variant="quiet" size="small" fullWidth disabled={working} onClick={() => onAction(trip.id, "archive")}>{actionLabel("archive")}</EasyTButton>}
          <EasyTButton icon={Copy} variant="quiet" size="small" fullWidth disabled={working} onClick={() => onAction(trip.id, "duplicate")}>{actionLabel("duplicate")}</EasyTButton>
          <EasyTButton icon={Gift} variant="quiet" size="small" fullWidth disabled={working} onClick={() => onGift(trip)}>{copy.gift}</EasyTButton>
          <EasyTButton icon={Trash2} variant="quiet" size="small" fullWidth className={styles.deleteAction} disabled={working} onClick={() => onRemove(trip)}>{copy.delete}</EasyTButton>
        </div>
      </details>;
}

export function TripCard({ kind, trip, language, copy, recoveryIssues, working, workingAction, onAction, onGift, onRemove }: {
  kind?: "upcoming" | "idea" | "past";
  trip: EasyTTrip;
  language: EasyTLanguage;
  copy: DashboardTripCopy;
  recoveryIssues: Record<string, DashboardRecoveryIssue>;
  working: boolean;
  workingAction: "archive" | "restore" | "duplicate" | "delete" | null;
  onAction: (id: string, action: "archive" | "restore" | "duplicate") => void;
  onGift: (trip: EasyTTrip) => void;
  onRemove: (trip: EasyTTrip) => void;
}) {
  const resolvedKind = kind ?? (trip.status === "draft" ? "idea" : trip.status === "archived" ? "past" : "upcoming");
  const title = tripDisplayTitle(trip);
  const photo = dashboardTripPhoto(trip);
  const stays = accommodationProgress(trip);
  const stayLabel = stays.stops.length ? `${stays.sortedCount} of ${stays.stops.length} stays sorted` : "Overnight stays to confirm";
  const primaryHref = resolvedKind === "idea" ? `/journey/new?trip=${encodeURIComponent(trip.id)}` : tripWorkspaceHref(trip.id);
  const primaryLabel = resolvedKind === "idea"
    ? (language === "es" ? "Seguir planificando" : "Continue planning")
    : resolvedKind === "past"
      ? (language === "es" ? "Volver a visitar" : "Revisit")
      : (language === "es" ? "Planificar los días" : "Plan your days");
  const recoveryIssue = recoveryIssues[trip.id];
  return <article className={`${styles.tripCard} ${styles[`${resolvedKind}Card`]} ${working ? styles.working : ""}`} aria-busy={working || undefined}>
    <Link className={styles.cardMedia} href={primaryHref} onClick={() => resolvedKind === "idea" ? trackEvent("trip_edit_started", { trip_id: trip.id, source: "dashboard" }) : trackTripReopened(trip)} tabIndex={working ? -1 : undefined} aria-disabled={working || undefined}>
      {resolvedKind === "idea" ? <TripRoutePreview trip={trip} label={`${title} ${language === "es" ? "boceto de ruta" : "route sketch"}`} /> : <ResilientImage src={photo?.src} alt={photo?.alt ?? ""} fallback={<div className={styles.tripImageFallback}><Globe2 aria-hidden="true" /><span>{routeLabel(trip, copy.routeWaiting)}</span></div>} />}
      {resolvedKind === "upcoming" && photo ? <div className={styles.cardMapInset}><TripRoutePreview compact trip={trip} label={`${title} ${language === "es" ? "vista previa de la ruta" : "route preview"}`} /></div> : null}
    </Link>
    {resolvedKind !== "idea" && photo?.creditLabel ? <MorroviaPhotoCredit photoLabel={photo.alt} credit={photo.creditLabel} sourceHref={photo.creditHref} licenseHref={photo.licenseHref} fullCreditHref={photo.fullCreditHref} /> : null}
    <div className={styles.cardBody}>
      <h3><Link href={primaryHref} onClick={() => resolvedKind === "idea" ? trackEvent("trip_edit_started", { trip_id: trip.id, source: "dashboard" }) : trackTripReopened(trip)}>{title}</Link></h3>
      <p className={styles.tripRoute}>{routeLabel(trip, copy.routeWaiting)}</p>
      <p className={styles.tripFacts}><time>{formatTripDates(trip, language)}</time><span>{totalNights(trip)} {language === "es" ? "noches" : "nights"}</span><span>{trip.stops.length} {language === "es" ? "paradas" : "stops"}</span></p>
      {resolvedKind !== "past" ? <p className={styles.readinessLine}>{stayLabel}<ArrowRight aria-hidden="true" /></p> : null}
      {recoveryIssue ? <div className={styles.tripRecoveryNotice} role="status">
        <strong>{recoveryIssue.tripTitle} has device changes to review</strong>
        <span>The cloud trip remains saved.</span>
        <EasyTLinkButton size="small" variant="secondary" href={tripSyncRecoveryPath(trip.id)}>Review device copy</EasyTLinkButton>
      </div> : null}
      <div className={styles.tripCardActions}>
        <EasyTLinkButton className={styles.openAction} size="small" variant="quiet" href={primaryHref} onClick={() => resolvedKind === "idea" ? trackEvent("trip_edit_started", { trip_id: trip.id, source: "dashboard" }) : trackTripReopened(trip)}>{primaryLabel}<ArrowRight aria-hidden="true" /></EasyTLinkButton>
        <TripActionsMenu trip={trip} language={language} copy={copy} working={working} workingAction={workingAction} onAction={onAction} onGift={onGift} onRemove={onRemove} />
      </div>
    </div>
  </article>;
}
