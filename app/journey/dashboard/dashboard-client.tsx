"use client";

import Link from "next/link";
import {
  Archive,
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  Copy,
  Edit3,
  Gift,
  Grid2X2,
  MoreHorizontal,
  RotateCcw,
  Search,
  Stamp,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { EasyTTrip, TripStatus } from "@/lib/easyt/trip";
import { EasyTFeedback } from "@/components/easyt/easyt-feedback";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import ResilientImage from "@/components/easyt/resilient-image";
import {
  cacheCanonicalTrip,
  EasyTTripAuthError,
  EasyTTripPromotionConflictError,
  EasyTTripSaveConflictError,
  loadCurrentTripRecovery,
  loadTripRecovery,
  markTripRecoveryState,
  promoteTripToEasyT,
  reconcileTripCloudMutation,
  resolveCanonicalEquivalentTripRecovery,
  saveTripToEasyT,
  tripForRecoveryScope,
  EASYT_LAST_OWNER_KEY,
  loadRememberedOwner,
} from "@/lib/easyt/storage";
import { ownerBoundaryState } from "@/lib/easyt/private-browser-context";
import { journeyReauthenticationPath } from "@/lib/easyt/trip-continuity";
import { runClientMutation } from "@/lib/easyt/client-mutation";
import { conflictHasCloudCopy, tripConflictResolutionActions, tripSyncRecoveryPath, type TripSaveConflictReason } from "@/lib/easyt/trip-continuity";
import type { TripPromotionConflictReason } from "@/lib/easyt/trip-promotion";
import { classifyAnalyticsSaveError, trackEvent } from "@/lib/analytics";
import { easytCopy, languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { tripWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { summarizeStampRows } from "@/lib/easyt/stamps";
import { formatIsoDate, parseIsoDate } from "@/lib/easyt/trip-lifecycle";
import { tripDisplayTitle } from "@/lib/easyt/trip-display";
import { dashboardHeroTrip, tripStartDateSortKey } from "@/lib/easyt/trip-status";
import { tripReadinessSummary } from "@/lib/easyt/trip-readiness-summary";
import accountStyles from "../account.module.css";
import styles from "./dashboard.module.css";

type StampSummary = { countryId: string; status: "visited" | "want" };
type SortMode = "updated" | "upcoming" | "title";

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function tripImage(trip: EasyTTrip) {
  return trip.planItems.find((item) => item.image)?.image ?? null;
}

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
  const [view, setView] = useState<TripStatus>(() => trips.some((trip) => trip.status === "draft") ? "draft" : trips.some((trip) => trip.status === "planned") ? "planned" : "archived");
  const [sort, setSort] = useState<SortMode>("updated");
  const [query, setQuery] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [failedAction, setFailedAction] = useState<{ id: string; action: "archive" | "restore" | "duplicate" } | null>(null);
  const [gifting, setGifting] = useState<EasyTTrip | null>(null);
  const [giftEmail, setGiftEmail] = useState("");
  const [giftNote, setGiftNote] = useState("");
  const [giftState, setGiftState] = useState<"idle" | "sending" | "complete">("idle");
  const [giftError, setGiftError] = useState("");
  const [claimUrl, setClaimUrl] = useState("");
  const [delivered, setDelivered] = useState(false);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [syncIssue, setSyncIssue] = useState<{
    kind: "failed" | "conflict" | "auth" | "owner";
    tripId: string;
    message: string;
    conflictReason?: TripSaveConflictReason | TripPromotionConflictReason;
  } | null>(null);
  const [syncingLocalTrip, setSyncingLocalTrip] = useState(false);
  const [recoveryState, setRecoveryState] = useState<"checking" | "none" | "syncing" | "issue">("checking");
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

  const syncLocalTrip = useCallback(async () => {
    const recovery = loadCurrentTripRecovery(ownerId);
    const localTrip = recovery?.trip;
    if (!localTrip) {
      setRecoveryState("none");
      return;
    }
    if (localTrip.ownerId !== null && localTrip.ownerId !== ownerId) {
      setRecoveryState("issue");
      setSyncIssue({
        kind: "owner",
        tripId: localTrip.id,
        message: "A device trip belongs to a different account. It was not opened or changed here; sign in to that account to review its recovery.",
      });
      return;
    }
    const canonicalTrip = trips.find((trip) => trip.id === localTrip.id);
    if (canonicalTrip) {
      const reconciliation = resolveCanonicalEquivalentTripRecovery(canonicalTrip, recovery);
      if (reconciliation.recoveryResolved) {
        const remainingRecovery = loadTripRecovery(localTrip.id, ownerId);
        if (!remainingRecovery) {
          setSyncIssue(null);
          setRecoveryState("none");
          return;
        }
        setRecoveryState("issue");
        setSyncIssue({
          kind: "failed",
          tripId: localTrip.id,
          message: "A newer device edit was preserved while the acknowledged cloud copy was reconciled.",
        });
        return;
      }
      if (reconciliation.equivalent) {
        setRecoveryState("issue");
        setSyncIssue({
          kind: "failed",
          tripId: localTrip.id,
          message: "This trip is saved to your account, but its matching device recovery could not be cleared because browser storage is unavailable.",
        });
        return;
      }
    }
    if (localTrip.ownerId === null && localTrip.status !== "draft") {
      setRecoveryState("issue");
      if (canonicalTrip) {
        markTripRecoveryState(recovery, "conflict", "cloud-different");
        setSyncIssue({
          kind: "conflict",
          tripId: localTrip.id,
          conflictReason: "cloud-different",
          message: "This device copy has changes that are not in the saved cloud trip. Morrovia kept both copies separate.",
        });
      } else {
        setSyncIssue({ kind: "failed", tripId: localTrip.id, message: "Only an unfinished device draft can be added to this account. The device copy was left unchanged." });
      }
      return;
    }
    if (recovery.state === "conflict") {
      setRecoveryState("issue");
      setSyncIssue({
        kind: "conflict",
        tripId: localTrip.id,
        conflictReason: recovery.conflictReason,
        message: recovery.conflictReason === "cloud-deleted"
          ? "This trip was removed from the cloud. Its pending device edits remain available for recovery."
          : "This device copy conflicts with a newer cloud revision and was not applied.",
      });
      return;
    }
    const scopedLocalTrip = tripForRecoveryScope(localTrip, recovery);
    if (!scopedLocalTrip) {
      setRecoveryState("issue");
      setSyncIssue({ kind: "owner", tripId: localTrip.id, message: "This device trip could not be matched safely to this account. It was left unchanged; sign in to the original account to recover it." });
      return;
    }
    setSyncIssue(null);
    setRecoveryState("syncing");
    setSyncingLocalTrip(true);
    try {
      const result = localTrip.ownerId === null
        ? await promoteTripToEasyT(localTrip)
        : { trip: await saveTripToEasyT(scopedLocalTrip), outcome: "already-canonical" as const };
      // A successful response is the first safe point at which the cloud form
      // may resolve this exact pending write. A newer recovery remains intact.
      cacheCanonicalTrip(result.trip, recovery);
      const remainingRecovery = loadTripRecovery(result.trip.id, ownerId);
      if (remainingRecovery) {
        setRecoveryState("issue");
        setSyncIssue({
          kind: "failed",
          tripId: result.trip.id,
          message: "A newer device edit was preserved while the earlier version finished syncing.",
        });
      } else setRecoveryState("none");
      if (result.outcome === "promoted") {
        trackEvent("trip_saved", { trip_source: "dashboard", trip_id: result.trip.id, save_state: "cloud", stop_count: result.trip.stops.length, is_authenticated: true });
      }
      if (!trips.some((trip) => trip.id === result.trip.id)) router.refresh();
    } catch (error) {
      const conflict = error instanceof EasyTTripPromotionConflictError || error instanceof EasyTTripSaveConflictError;
      const authInterrupted = error instanceof EasyTTripAuthError;
      const conflictReason = conflict ? error.reason : undefined;
      if (conflict && conflictReason === "cloud-deleted") reconcileTripCloudMutation(ownerId, localTrip.id, "delete");
      else if (conflict) cacheCanonicalTrip(error.canonicalTrip);
      markTripRecoveryState(recovery, authInterrupted ? "auth" : conflict ? "conflict" : "network", conflictReason);
      setSyncIssue({
        kind: authInterrupted ? "auth" : conflict ? "conflict" : "failed",
        tripId: localTrip.id,
        conflictReason,
        message: authInterrupted
          ? "Your session ended before this device copy could sync."
          : conflict
          ? error.message
          : "This trip could not sync to your account. It is still saved on this device.",
      });
      setRecoveryState("issue");
      trackEvent("trip_save_failed", { trip_source: "dashboard", trip_id: localTrip.id, save_state: "cloud", error_type: classifyAnalyticsSaveError(error), is_authenticated: true });
    } finally {
      setSyncingLocalTrip(false);
    }
  }, [ownerId, router, trips]);

  useEffect(() => {
    void syncLocalTrip();
  }, [syncLocalTrip]);

  const counts = useMemo(() => ({
    draft: trips.filter((trip) => trip.status === "draft").length,
    planned: trips.filter((trip) => trip.status === "planned").length,
    archived: trips.filter((trip) => trip.status === "archived").length,
  }), [trips]);
  const featuredTrip = useMemo(() => featuredTripFrom(trips), [trips]);
  const visibleTrips = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const result = trips.filter((trip) => trip.status === view).filter((trip) => {
      if (!normalizedQuery) return true;
      return `${tripDisplayTitle(trip)} ${routeLabel(trip, "")}`.toLocaleLowerCase().includes(normalizedQuery);
    });
    return result.sort((a, b) => {
      if (sort === "title") return tripDisplayTitle(a).localeCompare(tripDisplayTitle(b));
      if (sort === "upcoming") return tripStartDateSortKey(a) - tripStartDateSortKey(b);
      return timestamp(b.updatedAt) - timestamp(a.updatedAt);
    });
  }, [query, sort, trips, view]);

  const runAction = async (id: string, action: "archive" | "restore" | "duplicate") => {
    setWorking(id);
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
        if (action === "archive" || action === "restore") {
          const payload = await response.json() as { trip?: EasyTTrip };
          if (payload.trip) reconcileTripCloudMutation(ownerId, id, action, payload.trip);
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
      setWorking(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(language === "es" ? "¿Eliminar este viaje guardado?" : "Remove this saved trip?")) return;
    setWorking(id);
    setActionError("");
    try {
      const response = await fetch(`/api/easyt/trips/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (response.ok) {
        reconcileTripCloudMutation(ownerId, id, "delete");
        router.refresh();
      }
      else setActionError(response.status === 401 ? "Your session ended. Sign in again before removing this trip." : "This trip could not be removed. Please try again.");
    } catch {
      setActionError("This trip could not be removed. Check your connection and try again.");
    } finally {
      setWorking(null);
    }
  };

  const openGift = (trip: EasyTTrip) => {
    setGifting(trip);
    setGiftEmail("");
    setGiftNote("");
    setGiftState("idle");
    setGiftError("");
    setClaimUrl("");
  };

  const sendGift = async () => {
    if (!gifting) return;
    setGiftState("sending");
    setGiftError("");
    try {
      const response = await fetch(`/api/easyt/trips/${encodeURIComponent(gifting.id)}/gift`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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
  const conflictActions = syncIssue ? tripConflictResolutionActions(syncIssue.tripId) : null;
  const cloudConflictAvailable = conflictHasCloudCopy(syncIssue?.conflictReason);

  if (boundary === "mismatch") return <section className={styles.syncNotice} role="status">Account changed. Refreshing your private dashboard…</section>;
  if (boundary === "expired" || boundary === "signed-out") return <section className={styles.syncNotice} role="alert"><strong>Your session ended</strong><span>Your saved trips are hidden until you sign in again.</span><EasyTLinkButton href={journeyReauthenticationPath("/journey/dashboard")}>Sign in again</EasyTLinkButton></section>;

  return (
    <>
      {actionError ? <aside className={styles.syncNotice} role="alert"><AlertTriangle aria-hidden="true" /><span>{actionError}</span>{actionError.includes("session") ? <EasyTLinkButton size="small" href={journeyReauthenticationPath("/journey/dashboard")}>Sign in again</EasyTLinkButton> : failedAction ? <EasyTButton size="small" variant="secondary" onClick={() => void runAction(failedAction.id, failedAction.action)}>{isSpanish ? "Reintentar" : "Try again"}</EasyTButton> : null}</aside> : null}
      {syncIssue ? <aside className={styles.syncNotice} role="alert">
        <AlertTriangle aria-hidden="true" />
        <div>
          <strong>{syncIssue.kind === "auth" ? (isSpanish ? "Inicia sesión para sincronizar" : "Sign in to finish syncing") : syncIssue.kind === "owner" ? (isSpanish ? "La copia pertenece a otra cuenta" : "Device copy belongs to another account") : syncIssue.conflictReason === "cloud-deleted" ? (isSpanish ? "El viaje fue eliminado de la nube" : "Trip removed from the cloud") : syncIssue.kind === "conflict" ? (isSpanish ? "Se conservó la copia en la nube" : "Cloud copy kept safe") : (isSpanish ? "El viaje aún no está sincronizado" : "Trip not synced yet")}</strong>
          <p>{syncIssue.message} {isSpanish ? "La copia de este dispositivo no se ha eliminado." : "The copy on this device has not been removed."}</p>
        </div>
        <span>
          {syncIssue.kind === "failed" ? <EasyTButton size="small" variant="secondary" onClick={() => void syncLocalTrip()} loading={syncingLocalTrip}>{isSpanish ? "Reintentar" : "Try again"}</EasyTButton> : null}
          {syncIssue.kind === "auth" || syncIssue.kind === "owner" ? <EasyTLinkButton size="small" variant="secondary" href={`/journey/login?next=${encodeURIComponent("/journey/dashboard")}`}>{isSpanish ? "Cambiar de cuenta" : "Switch account"}</EasyTLinkButton> : <>
            {syncIssue.kind === "conflict" && cloudConflictAvailable ? <EasyTLinkButton size="small" variant="secondary" href={conflictActions!.cloudHref}>{isSpanish ? "Abrir copia en la nube" : conflictActions!.openCloudLabel}</EasyTLinkButton> : null}
            <EasyTLinkButton size="small" variant="secondary" href={tripSyncRecoveryPath(syncIssue.tripId)}>{isSpanish ? "Abrir copia del dispositivo" : conflictActions!.openDeviceLabel}</EasyTLinkButton>
          </>}
        </span>
      </aside> : null}
      <section className={`${styles.dashboardHero} ${trips.length ? "" : styles.dashboardHeroEmpty}`}>
        {featuredTrip ? (
          <article className={styles.continueCard}>
            <div className={styles.continueCopy}>
              <p className={styles.eyebrow}>{isSpanish ? "Continúa este viaje" : "Continue this trip"}</p>
              <h2>{tripDisplayTitle(featuredTrip)}</h2>
              <p className={styles.route}>{routeLabel(featuredTrip, copy.routeWaiting)}</p>
              <p className={styles.continueHint}>{isSpanish ? "Vuelve al plan y continúa desde donde lo dejaste." : "Pick up the plan where you left it and keep shaping the details."}</p>
              <div className={styles.continueActions}>
                <Link className={styles.primaryAction} href={tripWorkspaceHref(featuredTrip.id)} onClick={() => trackTripReopened(featuredTrip)}>
                  {isSpanish ? "Continuar planeando" : "Continue planning"}<ArrowRight aria-hidden="true" />
                </Link>
                <Link className={styles.secondaryAction} href={tripWorkspaceHref(featuredTrip.id)} onClick={() => trackTripReopened(featuredTrip)}>
                  {isSpanish ? "Ver detalles" : "View trip details"}
                </Link>
              </div>
            </div>
            <ResilientImage
              className={styles.continueImage}
              src={tripImage(featuredTrip)}
              alt=""
              fallback={<div className={styles.continueImageFallback} aria-hidden="true">
                <span>{featuredTrip.stops.length || 1}</span>
                <p>{routeLabel(featuredTrip, copy.routeWaiting)}</p>
              </div>}
            />
          </article>
        ) : recoveryState === "checking" || recoveryState === "syncing" ? (
          <article className={`${styles.continueCard} ${styles.continueEmpty}`} aria-live="polite">
            <div className={styles.continueCopy}>
              <p className={styles.eyebrow}>{isSpanish ? "Recuperación" : "Recovery"}</p>
              <h2>{isSpanish ? "Comprobando un viaje guardado en este dispositivo…" : "Checking for a saved trip on this device…"}</h2>
              <p className={styles.continueHint}>{isSpanish ? "No crearemos ni ocultaremos nada mientras termina la comprobación." : "Nothing will be created or hidden while this safety check finishes."}</p>
            </div>
          </article>
        ) : (
          <article className={`${styles.continueCard} ${styles.continueEmpty}`}>
            <div className={styles.continueCopy}>
              <p className={styles.eyebrow}>{isSpanish ? "Tu primer viaje" : "Your first trip"}</p>
              <h2>{isSpanish ? "Empieza con un viaje que ya tienes en mente." : "Start with a trip you’ve been thinking about."}</h2>
              <p className={styles.continueHint}>{isSpanish ? "Describe los lugares, el tiempo y el estilo de viaje. Morrovia te ayudará a dar forma a la ruta." : "Describe the places, time and travel style. Morrovia will help shape the route."}</p>
              <Link className={styles.primaryAction} href="/journey/home#start-building">{isSpanish ? "Planificar un viaje nuevo" : "Plan a new trip"}<ArrowRight aria-hidden="true" /></Link>
            </div>
          </article>
        )}

        {trips.length ? <section className={styles.stampsCard} aria-labelledby="dashboard-stamps-title">
          <div className={styles.stampsCopy}>
            <p className={styles.eyebrow}>{isSpanish ? "Tu mundo, marcado" : "Your world, marked"}</p>
            <h2 id="dashboard-stamps-title">{isSpanish ? "Sellos." : "Stamped."}</h2>
            <p>{isSpanish ? "Un registro vivo de los lugares donde has estado y los que aún te llaman." : "A living record of places you’ve been and the ones still calling."}</p>
          </div>
          <div className={styles.stampsStats}>
            <span><b>{visitedCount}</b>{isSpanish ? "visitados" : "visited"}</span>
            <span><b>{wantCount}</b>{isSpanish ? "por visitar" : "want to visit"}</span>
          </div>
          <ResilientImage src="/journey/illustrations/global-route-confirm.png" alt="" className={styles.stampsMap} fallback={null} />
          <Link className={styles.secondaryAction} href="/journey/stamped">{isSpanish ? "Abrir Sellos" : "Open Stamped"}<ArrowRight aria-hidden="true" /></Link>
        </section> : null}
      </section>

      {trips.length ? <section className={styles.tripLibrary} aria-labelledby="trip-library-title">
        <h2 id="trip-library-title" className={styles.srOnly}>{isSpanish ? "Tus viajes" : "Your trips"}</h2>
        <div className={styles.libraryToolbar}>
          <div className={styles.statusFilters} role="group" aria-label={isSpanish ? "Filtrar por estado del viaje" : "Filter by trip status"}>
            {(["draft", "planned", "archived"] as TripStatus[]).map((status) => (
              <button key={status} type="button" aria-controls="dashboard-trip-grid" aria-pressed={view === status} onClick={() => setView(status)}>
                {statusLabel(status, language)} <span>{counts[status]}</span>
              </button>
            ))}
          </div>
          <div className={styles.libraryTools}>
            <label className={styles.sortControl}>
              <span className={styles.srOnly}>{isSpanish ? "Ordenar viajes" : "Sort trips"}</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
                <option value="updated">{isSpanish ? "Ordenar: Actualizados" : "Sort by: Recently updated"}</option>
                <option value="upcoming">{isSpanish ? "Ordenar: Fecha de inicio" : "Sort by: Start date"}</option>
                <option value="title">{isSpanish ? "Ordenar: Título" : "Sort by: Title"}</option>
              </select>
            </label>
            <label className={styles.searchControl}>
              <Search aria-hidden="true" />
              <span className={styles.srOnly}>{isSpanish ? "Buscar viajes" : "Search trips"}</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isSpanish ? "Buscar viajes" : "Search trips"} />
            </label>
            <span className={styles.gridIndicator} aria-hidden="true"><Grid2X2 /></span>
          </div>
        </div>

        <div id="dashboard-trip-grid" className={styles.tripGrid}>
          {visibleTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              language={language}
              copy={copy}
              working={working === trip.id}
              onAction={runAction}
              onGift={openGift}
              onRemove={remove}
            />
          ))}
          {!visibleTrips.length ? (
            <div className={styles.emptyState}>
              <Stamp aria-hidden="true" />
              <h3>{query ? (isSpanish ? "Ningún viaje coincide." : "No trips match that search.") : view === "archived" ? copy.emptyArchived : view === "planned" ? (isSpanish ? "Aún no hay viajes planificados." : "No planned trips yet.") : copy.emptyActive}</h3>
              <p>{query ? (isSpanish ? "Prueba otro destino o título." : "Try another destination or title.") : view === "archived" ? copy.archivedHint : copy.activeHint}</p>
              {view !== "archived" && !query ? <Link className={styles.primaryAction} href="/journey/home#start-building">{isSpanish ? "Crear un viaje" : "Start a trip"}<ArrowRight aria-hidden="true" /></Link> : null}
            </div>
          ) : null}
        </div>
      </section> : null}

      {gifting ? (
        <div className={accountStyles.giftOverlay} role="presentation" onMouseDown={() => setGifting(null)}>
          <section className={accountStyles.giftDialog} role="dialog" aria-modal="true" aria-labelledby="gift-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className={accountStyles.giftClose} type="button" onClick={() => setGifting(null)} aria-label={isSpanish ? "Cerrar diálogo" : "Close gift dialog"}><X aria-hidden="true" /></button>
            <span className={accountStyles.giftDialogIcon}><Gift aria-hidden="true" /></span>
            <p className={accountStyles.eyebrow}>{copy.giftTitle}</p>
            <h2 id="gift-title">{isSpanish ? "Compartir" : "Share"} {tripDisplayTitle(gifting)}</h2>
            {giftState === "complete" ? (
              <div className={accountStyles.giftComplete}>
                <p>{delivered ? copy.inviteSent : copy.inviteReady}</p>
                <input value={claimUrl} readOnly aria-label={isSpanish ? "Enlace para reclamar" : "Gift claim link"} />
                <button type="button" className={accountStyles.primaryLink} onClick={() => navigator.clipboard.writeText(claimUrl)}>{copy.copyLink}</button>
              </div>
            ) : (
              <>
                <p className={accountStyles.muted}>{copy.draftHint}</p>
                <label className={accountStyles.field}><span>{copy.recipient}</span><input type="email" value={giftEmail} onChange={(event) => setGiftEmail(event.target.value)} placeholder="friend@example.com" autoComplete="email" /></label>
                <label className={accountStyles.field}><span>{copy.note}</span><textarea value={giftNote} onChange={(event) => setGiftNote(event.target.value)} placeholder={isSpanish ? "Un pequeño adelanto para nuestra próxima aventura…" : "A little head start for our next adventure…"} maxLength={500} /></label>
                {giftError ? <p className={accountStyles.syncError}>{giftError}</p> : null}
                <button type="button" className={accountStyles.primaryLink} onClick={sendGift} disabled={giftState === "sending"}>{giftState === "sending" ? copy.creatingInvite : copy.createInvite}</button>
              </>
            )}
          </section>
        </div>
      ) : null}
      <EasyTFeedback />
    </>
  );
}

export function TripCard({ trip, language, copy, working, onAction, onGift, onRemove }: {
  trip: EasyTTrip;
  language: EasyTLanguage;
  copy: {
    routeWaiting: string;
    edit: string;
    restore: string;
    archive: string;
    duplicate: string;
    gift: string;
    delete: string;
  };
  working: boolean;
  onAction: (id: string, action: "archive" | "restore" | "duplicate") => void;
  onGift: (trip: EasyTTrip) => void;
  onRemove: (id: string) => void;
}) {
  const readiness = tripReadinessSummary(trip);
  const readinessLabels = language === "es"
    ? { itinerary: "Itinerario", stays: "Estancias", route: "Ruta", prep: "Preparación" }
    : { itinerary: "Itinerary", stays: "Stays", route: "Route", prep: "Prep" };
  const routeSignal = readiness.signals.find((signal) => signal.id === "route")!;
  const prepSignal = readiness.signals.find((signal) => signal.id === "prep")!;
  const cardSignals = [
    readiness.signals.find((signal) => signal.id === "itinerary")!,
    readiness.signals.find((signal) => signal.id === "stays")!,
    routeSignal.blocked || !routeSignal.complete ? routeSignal : prepSignal,
  ];
  return <article className={`${styles.tripCard} ${working ? styles.working : ""}`}>
    <div className={styles.tripCardMeta}><span>{statusLabel(trip.status, language)}</span><time>{formatTripDates(trip, language)}</time></div>
    <h3>{tripDisplayTitle(trip)}</h3>
    <p className={styles.tripRoute}>{routeLabel(trip, copy.routeWaiting)}</p>
    <ResilientImage src={tripImage(trip)} alt="" className={styles.tripImage} fallback={<div className={styles.tripImageFallback}><b>{trip.stops.length}</b><span>{language === "es" ? "paradas" : "stops"}</span><small>{formatTripDates(trip, language)}</small></div>} />
    <ul className={styles.cardReadiness} aria-label={language === "es" ? "Resumen de preparación del viaje" : "Trip readiness summary"}>
      {cardSignals.map((signal) => <li key={signal.id} className={signal.complete ? styles.completeStage : signal.blocked ? styles.currentStage : undefined}>
        <span aria-hidden="true">{signal.complete ? "✓" : signal.blocked ? "!" : "•"}</span>
        <div><b>{readinessLabels[signal.id]}</b><small>{signal.label}</small></div>
      </li>)}
    </ul>
    <div className={styles.tripCardActions}>
      <Link className={styles.openAction} href={tripWorkspaceHref(trip.id)} onClick={() => trackTripReopened(trip)}>{language === "es" ? "Abrir viaje" : "Open trip"}<ArrowRight aria-hidden="true" /></Link>
      <Link className={styles.editAction} href={`/journey/new?trip=${encodeURIComponent(trip.id)}`} onClick={() => trackEvent("trip_edit_started", { trip_id: trip.id, source: "dashboard" })}><Edit3 aria-hidden="true" />{copy.edit}</Link>
      <details className={styles.tripMenu}>
        <summary aria-label={`${language === "es" ? "Acciones para" : "Actions for"} ${tripDisplayTitle(trip)}`}><MoreHorizontal aria-hidden="true" /></summary>
        <div>
          <Link href={`/journey/trip?trip=${encodeURIComponent(trip.id)}`} onClick={() => trackTripReopened(trip)}><CalendarCheck2 aria-hidden="true" />{language === "es" ? "Modo viaje" : "Trip mode"}</Link>
          {trip.status === "archived" ? <button type="button" onClick={() => onAction(trip.id, "restore")}><RotateCcw aria-hidden="true" />{copy.restore}</button> : <button type="button" onClick={() => onAction(trip.id, "archive")}><Archive aria-hidden="true" />{copy.archive}</button>}
          <button type="button" onClick={() => onAction(trip.id, "duplicate")}><Copy aria-hidden="true" />{copy.duplicate}</button>
          <button type="button" onClick={() => onGift(trip)}><Gift aria-hidden="true" />{copy.gift}</button>
          <button type="button" className={styles.deleteAction} onClick={() => onRemove(trip.id)}><Trash2 aria-hidden="true" />{copy.delete}</button>
        </div>
      </details>
    </div>
  </article>;
}
