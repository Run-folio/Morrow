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
import { isTripPersistenceAuthenticationError, tripRecoveryStateForPersistenceError } from "@/lib/easyt/trip-persistence-error";
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
import { mapRouteLegsFromTrip } from "@/lib/easyt/map-spatial-context";
import { routeDestinationPhoto, routeImageCredit } from "@/lib/easyt/route-images";
import accountStyles from "../account.module.css";
import styles from "./dashboard.module.css";

type StampSummary = { countryId: string; status: "visited" | "want" };
type SortMode = "updated" | "upcoming" | "title";
type LibraryView = "all" | TripStatus;

type TripPhoto = {
  src: string;
  alt: string;
  creditHref: string | null;
  creditLabel: string | null;
  licenseHref: string | null;
  fullCreditHref: string | null;
  place: string | null;
};

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function storedTripPhoto(trip: EasyTTrip): TripPhoto | null {
  const src = trip.planItems.find((item) => item.image)?.image ?? null;
  if (!src) return null;
  const credit = routeImageCredit(src);
  return {
    src,
    alt: credit?.alt ?? "",
    creditHref: credit?.sourceUrl ?? null,
    creditLabel: credit?.sourceLabel ?? null,
    licenseHref: credit?.licenseUrl ?? null,
    fullCreditHref: credit?.fullCreditUrl ?? null,
    place: null,
  };
}

function canonicalTripPhotos(trip: EasyTTrip): TripPhoto[] {
  return [...trip.stops]
    .sort((left, right) => left.order - right.order)
    .flatMap((stop) => {
      const photo = routeDestinationPhoto(stop.name, stop.country);
      const src = photo?.variants.at(-1)?.src;
      if (!photo || !src) return [];
      return [{
        src,
        alt: photo.alt,
        creditHref: photo.sourceUrl,
        creditLabel: `${photo.author} · ${photo.license}`,
        licenseHref: photo.licenseUrl,
        fullCreditHref: `/journey/immersive/credits.html#${photo.key}`,
        place: photo.place,
      }];
    });
}

function tripPhoto(trip: EasyTTrip): TripPhoto | null {
  return storedTripPhoto(trip) ?? canonicalTripPhotos(trip)[0] ?? null;
}

function featuredTripPhoto(trip: EasyTTrip): TripPhoto | null {
  const stored = storedTripPhoto(trip);
  const canonical = canonicalTripPhotos(trip);
  const japanAlternate = canonical.find((photo) => photo.place === "Takayama");
  return japanAlternate ?? stored ?? canonical[0] ?? null;
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
  const stops = tripMapStops(trip);
  if (stops.filter((stop) => stop.coordinates).length < 2) {
    return <div className={styles.routePreviewFallback}><MapPin aria-hidden="true" /><span>{trip.stops.length} {trip.stops.length === 1 ? "place" : "places"} selected</span></div>;
  }
  return <JourneyPlannerMap
    stops={stops}
    legs={mapRouteLegsFromTrip(trip)}
    selectedId=""
    plannerPins={[]}
    focusCoordinates={null}
    draftPinCoordinates={null}
    pinPlacementMode={false}
    overviewMode
    previewMode
    previewLabel={label}
    overviewPadding={compact ? { top: 14, right: 14, bottom: 14, left: 14 } : { top: 28, right: 28, bottom: 28, left: 28 }}
    onMapPinDrop={() => undefined}
    onPlannerPinSelect={() => undefined}
    onSelect={() => undefined}
  />;
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
  const [view, setView] = useState<LibraryView>("all");
  const [sort, setSort] = useState<SortMode>("updated");
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
      const authInterrupted = error instanceof EasyTTripAuthError || isTripPersistenceAuthenticationError(error);
      const conflictReason = conflict ? error.reason : undefined;
      if (conflict && conflictReason === "cloud-deleted") reconcileTripCloudMutation(ownerId, localTrip.id, "delete");
      else if (conflict) cacheCanonicalTrip(error.canonicalTrip);
      markTripRecoveryState(recovery, tripRecoveryStateForPersistenceError(error), conflictReason);
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
    const result = trips.filter((trip) => view === "all" || trip.status === view).filter((trip) => {
      if (!normalizedQuery) return true;
      return `${tripDisplayTitle(trip)} ${routeLabel(trip, "")}`.toLocaleLowerCase().includes(normalizedQuery);
    });
    return result.sort((a, b) => {
      if (sort === "title") return tripDisplayTitle(a).localeCompare(tripDisplayTitle(b));
      if (sort === "upcoming") return tripStartDateSortKey(a) - tripStartDateSortKey(b);
      return timestamp(b.updatedAt) - timestamp(a.updatedAt);
    });
  }, [query, sort, trips, view]);
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
  const featuredPhoto = featuredTrip ? featuredTripPhoto(featuredTrip) : null;
  const featuredTitle = featuredTrip ? featuredTitleParts(tripDisplayTitle(featuredTrip)) : null;
  const closingPhoto = routeDestinationPhoto("Tokyo", "Japan");
  const closingPhotoSrc = closingPhoto?.variants.at(-1)?.src;
  const conflictActions = syncIssue ? tripConflictResolutionActions(syncIssue.tripId) : null;
  const cloudConflictAvailable = conflictHasCloudCopy(syncIssue?.conflictReason);

  if (boundary === "mismatch") return <MorroviaStatusBanner className={styles.dashboardNotice} title="Account changed" detail="Refreshing your private dashboard…" />;
  if (boundary === "expired" || boundary === "signed-out") return <MorroviaStatusBanner className={styles.dashboardNotice} tone="danger" title="Your session ended" detail="Your saved trips are hidden until you sign in again." actions={<EasyTLinkButton href={journeyReauthenticationPath("/journey/dashboard")}>Sign in again</EasyTLinkButton>} />;

  return (
    <>
      {actionNotice ? <div className={styles.actionNotice}><MorroviaBriefNotice title={actionNotice.title} detail={actionNotice.detail} autoDismissMs={6500} onDismiss={() => setActionNotice(null)} /></div> : null}
      {actionError ? <MorroviaStatusBanner className={styles.dashboardNotice} tone="danger" title={actionError} actions={actionError.includes("session") ? <EasyTLinkButton size="small" href={journeyReauthenticationPath("/journey/dashboard")}>Sign in again</EasyTLinkButton> : failedAction ? <EasyTButton size="small" variant="secondary" onClick={() => void runAction(failedAction.id, failedAction.action)}>{isSpanish ? "Reintentar" : "Try again"}</EasyTButton> : undefined} /> : null}
      {syncIssue ? <MorroviaStatusBanner className={styles.dashboardNotice} tone={syncIssue.kind === "auth" || syncIssue.kind === "owner" ? "danger" : "warning"}
        title={syncIssue.kind === "auth" ? (isSpanish ? "Inicia sesión para sincronizar" : "Sign in to finish syncing") : syncIssue.kind === "owner" ? (isSpanish ? "La copia pertenece a otra cuenta" : "Device copy belongs to another account") : syncIssue.conflictReason === "cloud-deleted" ? (isSpanish ? "El viaje fue eliminado de la nube" : "Trip removed from the cloud") : syncIssue.kind === "conflict" ? (isSpanish ? "Se conservó la copia en la nube" : "Cloud copy kept safe") : (isSpanish ? "El viaje aún no está sincronizado" : "Trip not synced yet")}
        detail={`${syncIssue.message} ${isSpanish ? "La copia de este dispositivo no se ha eliminado." : "The copy on this device has not been removed."}`}
        actions={<>
          {syncIssue.kind === "failed" ? <EasyTButton size="small" variant="secondary" onClick={() => void syncLocalTrip()} loading={syncingLocalTrip}>{isSpanish ? "Reintentar" : "Try again"}</EasyTButton> : null}
          {syncIssue.kind === "auth" || syncIssue.kind === "owner" ? <EasyTLinkButton size="small" variant="secondary" href={`/journey/login?next=${encodeURIComponent("/journey/dashboard")}`}>{isSpanish ? "Cambiar de cuenta" : "Switch account"}</EasyTLinkButton> : <>
            {syncIssue.kind === "conflict" && cloudConflictAvailable ? <EasyTLinkButton size="small" variant="secondary" href={conflictActions!.cloudHref}>{isSpanish ? "Abrir copia en la nube" : conflictActions!.openCloudLabel}</EasyTLinkButton> : null}
            <EasyTLinkButton size="small" variant="secondary" href={tripSyncRecoveryPath(syncIssue.tripId)}>{isSpanish ? "Abrir copia del dispositivo" : conflictActions!.openDeviceLabel}</EasyTLinkButton>
          </>}
        </>} /> : null}
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
                <Link href={`/journey/${encodeURIComponent(featuredTrip.id)}/map`} onClick={() => trackTripReopened(featuredTrip)}>Map</Link>
                <Link href={`/journey/${encodeURIComponent(featuredTrip.id)}/itinerary`} onClick={() => trackTripReopened(featuredTrip)}>Itinerary</Link>
              </nav>
              <TripActionsMenu trip={featuredTrip} language={language} copy={copy} working={working === featuredTrip.id} workingAction={working === featuredTrip.id ? workingAction : null} onAction={runAction} onGift={openGift} onRemove={(trip) => { setDeleteError(""); setPendingDelete(trip); }} />
            </div>
          </div>
          <Link className={styles.currentMap} href={`/journey/${encodeURIComponent(featuredTrip.id)}/map`} onClick={() => trackTripReopened(featuredTrip)} aria-label={`${isSpanish ? "Abrir mapa de" : "Open map for"} ${tripDisplayTitle(featuredTrip)}`}>
            <TripRoutePreview trip={featuredTrip} label={`${tripDisplayTitle(featuredTrip)} ${isSpanish ? "vista previa de la ruta" : "route preview"}`} />
            <span>{featuredTrip.stops.length} {isSpanish ? "lugares, un viaje" : "places, one journey"}<ArrowRight aria-hidden="true" /></span>
          </Link>
        </article>
      ) : recoveryState === "checking" || recoveryState === "syncing" ? (
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
          <EasyTSegmentedControl<LibraryView>
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
            <EasyTSelect fieldClassName={styles.sortControl} label={isSpanish ? "Ordenar viajes" : "Sort trips"} labelClassName={styles.srOnly} value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
              <option value="updated">{isSpanish ? "Ordenar: Actualizados" : "Sort by: Recently updated"}</option>
              <option value="upcoming">{isSpanish ? "Ordenar: Fecha de inicio" : "Sort by: Start date"}</option>
              <option value="title">{isSpanish ? "Ordenar: Título" : "Sort by: Title"}</option>
            </EasyTSelect>
            <span className={styles.gridIndicator} role="img" aria-label={isSpanish ? "Vista de cuadrícula" : "Grid view"}><Grid2X2 aria-hidden="true" /></span>
          </div>
        </div>

        <div id="dashboard-trip-grid" className={styles.tripSections}>
          <JourneySection kind="upcoming" trips={upcomingTrips} language={language} copy={copy} working={working} workingAction={workingAction} onAction={runAction} onGift={openGift} onRemove={(trip) => { setDeleteError(""); setPendingDelete(trip); }} />
          <JourneySection kind="idea" trips={ideaTrips} language={language} copy={copy} working={working} workingAction={workingAction} onAction={runAction} onGift={openGift} onRemove={(trip) => { setDeleteError(""); setPendingDelete(trip); }} />
          <JourneySection kind="past" trips={pastTrips} language={language} copy={copy} working={working} workingAction={workingAction} onAction={runAction} onGift={openGift} onRemove={(trip) => { setDeleteError(""); setPendingDelete(trip); }} />
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
  working: string | null;
  workingAction: "archive" | "restore" | "duplicate" | "delete" | null;
  onAction: (id: string, action: "archive" | "restore" | "duplicate") => void;
  onGift: (trip: EasyTTrip) => void;
  onRemove: (trip: EasyTTrip) => void;
};

function JourneySection({ kind, trips, language, copy, working, workingAction, onAction, onGift, onRemove }: JourneyCardActions & {
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
  const cardProps = { language, copy, workingAction, onAction, onGift, onRemove };
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

export function TripCard({ kind, trip, language, copy, working, workingAction, onAction, onGift, onRemove }: {
  kind?: "upcoming" | "idea" | "past";
  trip: EasyTTrip;
  language: EasyTLanguage;
  copy: DashboardTripCopy;
  working: boolean;
  workingAction: "archive" | "restore" | "duplicate" | "delete" | null;
  onAction: (id: string, action: "archive" | "restore" | "duplicate") => void;
  onGift: (trip: EasyTTrip) => void;
  onRemove: (trip: EasyTTrip) => void;
}) {
  const resolvedKind = kind ?? (trip.status === "draft" ? "idea" : trip.status === "archived" ? "past" : "upcoming");
  const title = tripDisplayTitle(trip);
  const photo = tripPhoto(trip);
  const readiness = tripReadinessSummary(trip);
  const staySignal = readiness.signals.find((signal) => signal.id === "stays");
  const primaryHref = resolvedKind === "idea" ? `/journey/new?trip=${encodeURIComponent(trip.id)}` : tripWorkspaceHref(trip.id);
  const primaryLabel = resolvedKind === "idea"
    ? (language === "es" ? "Seguir planificando" : "Continue planning")
    : resolvedKind === "past"
      ? (language === "es" ? "Volver a visitar" : "Revisit")
      : (language === "es" ? "Planificar los días" : "Plan your days");
  return <article className={`${styles.tripCard} ${styles[`${resolvedKind}Card`]} ${working ? styles.working : ""}`} aria-busy={working || undefined}>
    <Link className={styles.cardMedia} href={primaryHref} onClick={() => resolvedKind === "idea" ? trackEvent("trip_edit_started", { trip_id: trip.id, source: "dashboard" }) : trackTripReopened(trip)} tabIndex={working ? -1 : undefined} aria-disabled={working || undefined}>
      {resolvedKind === "idea" ? <TripRoutePreview trip={trip} label={`${title} ${language === "es" ? "boceto de ruta" : "route sketch"}`} /> : <ResilientImage src={photo?.src} alt={photo?.alt ?? ""} fallback={<div className={styles.tripImageFallback}><Globe2 aria-hidden="true" /><span>{routeLabel(trip, copy.routeWaiting)}</span></div>} />}
      {resolvedKind === "upcoming" ? <div className={styles.cardMapInset}><TripRoutePreview compact trip={trip} label={`${title} ${language === "es" ? "vista previa de la ruta" : "route preview"}`} /></div> : null}
    </Link>
    {resolvedKind !== "idea" && photo?.creditLabel ? <MorroviaPhotoCredit photoLabel={photo.alt} credit={photo.creditLabel} sourceHref={photo.creditHref} licenseHref={photo.licenseHref} fullCreditHref={photo.fullCreditHref} /> : null}
    <div className={styles.cardBody}>
      <h3><Link href={primaryHref} onClick={() => resolvedKind === "idea" ? trackEvent("trip_edit_started", { trip_id: trip.id, source: "dashboard" }) : trackTripReopened(trip)}>{title}</Link></h3>
      <p className={styles.tripRoute}>{routeLabel(trip, copy.routeWaiting)}</p>
      <p className={styles.tripFacts}><time>{formatTripDates(trip, language)}</time><span>{totalNights(trip)} {language === "es" ? "noches" : "nights"}</span><span>{trip.stops.length} {language === "es" ? "paradas" : "stops"}</span></p>
      {staySignal && resolvedKind !== "past" ? <p className={styles.readinessLine}>{staySignal.label}<ArrowRight aria-hidden="true" /></p> : null}
      <div className={styles.tripCardActions}>
        <EasyTLinkButton className={styles.openAction} size="small" variant="quiet" href={primaryHref} onClick={() => resolvedKind === "idea" ? trackEvent("trip_edit_started", { trip_id: trip.id, source: "dashboard" }) : trackTripReopened(trip)}>{primaryLabel}<ArrowRight aria-hidden="true" /></EasyTLinkButton>
        <TripActionsMenu trip={trip} language={language} copy={copy} working={working} workingAction={workingAction} onAction={onAction} onGift={onGift} onRemove={onRemove} />
      </div>
    </div>
  </article>;
}
