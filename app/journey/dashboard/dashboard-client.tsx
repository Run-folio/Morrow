"use client";

import Link from "next/link";
import {
  Archive,
  ArrowRight,
  Copy,
  Gift,
  Globe2,
  Grid2X2,
  MapPin,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { EasyTTrip, TripStatus } from "@/lib/easyt/trip";
import { EasyTButton, EasyTField, EasyTLinkButton, EasyTSelect, EasyTSegmentedControl } from "@/components/easyt/easyt-controls";
import { MorroviaBriefNotice, MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import ResilientImage from "@/components/easyt/resilient-image";
import MorroviaPhotoCredit from "@/components/easyt/morrovia-photo-credit";
import CountryVisualFallback, { CountryIllustrationLabel } from "@/components/easyt/country-visual-fallback";
import { useDashboardTripPhotos } from "@/components/easyt/use-dashboard-trip-photos";
import {
  cacheCanonicalTrip,
  classifyTripRecovery,
  EASYT_TRIP_STORAGE_CHANGE_EVENT,
  loadCachedTrip,
  listTripRecoveries,
  loadTripRecovery,
  resolveCanonicalEquivalentTripRecovery,
  tripRecoveryIsAwaitingCanonicalSave,
  EASYT_LAST_OWNER_KEY,
  loadRememberedOwner, observeRememberedOwner,
} from "@/lib/easyt/storage";
import { ownerBoundaryState } from "@/lib/easyt/private-browser-context";
import { journeyReauthenticationPath, tripSyncRecoveryPath } from "@/lib/easyt/trip-continuity";
import { trackEvent } from "@/lib/analytics";
import { easytCopy, languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { tripWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { summarizeStampRows } from "@/lib/easyt/stamps";
import { formatIsoDate, parseIsoDate } from "@/lib/easyt/trip-lifecycle";
import { tripDisplayTitle, tripOverviewDisplayTitle } from "@/lib/easyt/trip-display";
import { routeDestinationPhoto } from "@/lib/easyt/route-images";
import { dashboardLibraryTrips, type DashboardLibraryView, type DashboardSortMode } from "@/lib/easyt/dashboard-library";
import { dashboardTripPhoto, dashboardTripCoverPlace, type DashboardTripPhoto } from "@/lib/easyt/dashboard-trip-image";
import {useTripLibraryActions} from "@/components/easyt/use-trip-library-actions";
import {TripLibraryActionDialogs} from "@/components/easyt/trip-library-action-dialogs";
import styles from "./dashboard.module.css";

type StampSummary = { countryId: string; status: "visited" | "want" };
type DashboardRecoveryIssue = {
  tripId: string;
  tripTitle: string;
  detail: string;
};
function formatTripDates(trip: EasyTTrip, language: EasyTLanguage) {
  if (!parseIsoDate(trip.startDate) || !parseIsoDate(trip.endDate)) return language === "es" ? "Fechas por confirmar" : "Dates to confirm";
  const locale = language === "es" ? "es" : "en-GB";
  const startText = formatIsoDate(trip.startDate, locale, { month: "short", day: "numeric" });
  const endText = formatIsoDate(trip.endDate, locale, { month: "short", day: "numeric", year: "numeric" });
  return `${startText} – ${endText}`;
}

function statusLabel(status: TripStatus, language: EasyTLanguage) {
  if (language === "es") return status === "draft" ? "Activo" : status === "planned" ? "Planificado" : "Archivado";
  return status === "draft" ? "Active" : status === "planned" ? "Planned" : "Archived";
}

function trackTripReopened(trip: EasyTTrip) {
  // Dashboard rows are owner-scoped cloud documents. Cache that exact
  // revision for later device access. The account document already authorises Open.
  // Storage and analytics are both best effort: neither may block Open.
  void cacheCanonicalTrip(trip).catch(() => undefined);
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
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [storedRecoveryIssues, setRecoveryIssues] = useState<Record<string, DashboardRecoveryIssue>>({});
  const [recoveryIssuesScope, setRecoveryIssuesScope] = useState<string | null>(null);
  const [storedRecoveryState, setRecoveryState] = useState<"checking" | "none" | "syncing" | "issue" | "unavailable">("checking");
  const [recoveryVersion, setRecoveryVersion] = useState(0);
  const recoverySourceRevisionRef = useRef(0);
  const mountedRef = useRef(true);
  const ownerScopeRef = useRef("");
  const [showDetachedRecoveries, setShowDetachedRecoveries] = useState(false);
  const [closingImageDisplayed, setClosingImageDisplayed] = useState(false);
  const copy = easytCopy[language].dashboard;

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

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

  const ownerScope = JSON.stringify([ownerId, session?.user?.id ?? null, sessionPending, boundary]);
  ownerScopeRef.current = ownerScope;
  const libraryActions = useTripLibraryActions({ownerId,ownerScope,boundary,language,refresh: () => router.refresh()});
  const {working,workingAction,actionError,failedAction,actionNotice,setActionNotice,runAction,openGift,requestDelete}=libraryActions;
  const recoveryIssues = recoveryIssuesScope === ownerScope ? storedRecoveryIssues : {};
  const recoveryState = recoveryIssuesScope === ownerScope ? storedRecoveryState : "checking";

  useEffect(() => {
    const observer = observeRememberedOwner(setRememberedOwnerId);
    const refreshOwner = observer.refresh;
    const onStorage = (event: StorageEvent) => {
      if (event.key === EASYT_LAST_OWNER_KEY) refreshOwner();
    };
    window.addEventListener("storage", onStorage);
    return () => { observer.dispose(); window.removeEventListener("storage", onStorage); };
  }, []);

  useEffect(() => {
    if (boundary === "mismatch") router.refresh();
  }, [boundary, router]);

  useEffect(() => {
    const refreshRecoveries = () => {
      recoverySourceRevisionRef.current += 1;
      setRecoveryVersion((version) => version + 1);
    };
    window.addEventListener(EASYT_TRIP_STORAGE_CHANGE_EVENT, refreshRecoveries);
    window.addEventListener("storage", refreshRecoveries);
    return () => {
      window.removeEventListener(EASYT_TRIP_STORAGE_CHANGE_EVENT, refreshRecoveries);
      window.removeEventListener("storage", refreshRecoveries);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const sourceRevision = recoverySourceRevisionRef.current;
    const isCurrent = () => active && mountedRef.current && ownerScopeRef.current === ownerScope
      && recoverySourceRevisionRef.current === sourceRevision;
    setRecoveryState("checking");
    if (boundary !== "current") return () => { active = false; };
    void (async () => {
      const nextIssues: Record<string, DashboardRecoveryIssue> = {};
      const recoveries = await listTripRecoveries(ownerId);
      if (!isCurrent()) return;
      for (const recovery of recoveries) {
        if (tripRecoveryIsAwaitingCanonicalSave(recovery)) continue;
        const canonicalTrip = trips.find((candidate) => candidate.id === recovery.tripId);
        if (canonicalTrip) {
          const previousCanonicalTrip = await loadCachedTrip(recovery.tripId, ownerId);
          if (!isCurrent()) return;
          const classification = classifyTripRecovery({ recovery, canonicalTrip, previousCanonicalTrip });
          if (classification === "equivalent") await resolveCanonicalEquivalentTripRecovery(canonicalTrip, recovery);
          else if (classification === "historical-superseded") await cacheCanonicalTrip(canonicalTrip);
          if (!isCurrent()) return;
          const remaining = await loadTripRecovery(recovery.tripId, ownerId);
          if (!isCurrent()) return;
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
            ? "This trip was previously reported as deleted from your account. Its device copy is available to review."
            : "This trip is not in this dashboard. Its account save status is unconfirmed. Review the device copy.",
        };
      }
      if (!isCurrent()) return;
      setRecoveryIssuesScope(ownerScope);
      setRecoveryIssues(nextIssues);
      setRecoveryState(Object.keys(nextIssues).length ? "issue" : "none");
    })().catch(() => {
      if (isCurrent()) { setRecoveryIssuesScope(ownerScope); setRecoveryState("unavailable"); }
    });
    return () => { active = false; };
  }, [boundary, ownerId, ownerScope, recoveryVersion, trips]);

  const counts = useMemo(() => ({
    draft: trips.filter((trip) => trip.status === "draft").length,
    planned: trips.filter((trip) => trip.status === "planned").length,
    archived: trips.filter((trip) => trip.status === "archived").length,
  }), [trips]);
  const visibleTrips = useMemo(() => dashboardLibraryTrips(trips, { query, sort, view }), [query, sort, trips, view]);
  const upcomingTrips = useMemo(() => visibleTrips.filter((trip) => trip.status === "planned"), [visibleTrips]);
  const ideaTrips = useMemo(() => visibleTrips.filter((trip) => trip.status === "draft"), [visibleTrips]);
  const pastTrips = useMemo(() => visibleTrips.filter((trip) => trip.status === "archived"), [visibleTrips]);
  const coverTrips = useMemo(() => sort === "updated" ? visibleTrips : [...upcomingTrips, ...ideaTrips, ...pastTrips], [sort, visibleTrips, upcomingTrips, ideaTrips, pastTrips]);
  const { photos: cardPhotos, markFailed: markCoverFailed } = useDashboardTripPhotos(coverTrips);

  const stampSummary = summarizeStampRows(stamps);
  const visitedCount = stampSummary.visited;
  const wantCount = stampSummary.want;
  const isSpanish = language === "es";
  const closingPhoto = routeDestinationPhoto("Tokyo", "Japan");
  const closingPhotoSrc = closingPhoto?.variants.at(-1)?.src;
  useEffect(() => setClosingImageDisplayed(false), [closingPhotoSrc]);
  const orphanRecoveryIssues = Object.values(recoveryIssues).filter((issue) => !trips.some((trip) => trip.id === issue.tripId));

  if (boundary === "mismatch") return <MorroviaStatusBanner className={styles.dashboardNotice} title="Account changed" detail="Refreshing your private dashboard…" />;
  if (boundary === "expired" || boundary === "signed-out") return <MorroviaStatusBanner className={styles.dashboardNotice} tone="danger" title="Your session ended" detail="Your saved trips are hidden until you sign in again." actions={<EasyTLinkButton href={journeyReauthenticationPath("/journey/dashboard")}>Sign in again</EasyTLinkButton>} />;

  return (
    <>
      {actionNotice ? <div className={styles.actionNotice}><MorroviaBriefNotice title={actionNotice.title} detail={actionNotice.detail} autoDismissMs={6500} onDismiss={() => setActionNotice(null)} /></div> : null}
      {actionError ? <MorroviaStatusBanner className={styles.dashboardNotice} tone="danger" title={actionError} actions={actionError.includes("session") ? <EasyTLinkButton size="small" href={journeyReauthenticationPath("/journey/dashboard")}>Sign in again</EasyTLinkButton> : failedAction ? <EasyTButton size="small" variant="secondary" onClick={() => void runAction(failedAction.id, failedAction.action)}>{isSpanish ? "Reintentar" : "Try again"}</EasyTButton> : undefined} /> : null}
      {recoveryState === "unavailable" ? <MorroviaStatusBanner className={styles.dashboardNotice} tone="warning"
        title={isSpanish ? "No pudimos comprobar las copias del dispositivo" : "Device copies could not be checked"}
        detail={isSpanish ? "Tus viajes en la cuenta siguen disponibles. Reintenta la comprobación antes de empezar otro viaje." : "Your account trips remain available. Retry the device check before starting another trip."}
        actions={<EasyTButton size="small" variant="secondary" onClick={() => setRecoveryVersion((version) => version + 1)}>{isSpanish ? "Reintentar" : "Try again"}</EasyTButton>} /> : null}
      {orphanRecoveryIssues.length ? <>
        <MorroviaStatusBanner
          className={styles.dashboardNotice}
          tone="warning"
          title={orphanRecoveryIssues.length === 1 ? `${orphanRecoveryIssues[0].tripTitle}: device copy to review` : `${orphanRecoveryIssues.length} device copies to review`}
          detail={orphanRecoveryIssues.length === 1 ? orphanRecoveryIssues[0].detail : "These trips are not in this dashboard. Their account save status is unconfirmed. Review each device copy."}
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
      <div className={styles.libraryLayout}>
      {!trips.length && (recoveryState === "checking" || recoveryState === "syncing") ? <MorroviaStatusBanner
        className={styles.dashboardNotice}
        title={isSpanish ? "Comprobando un viaje guardado en este dispositivo…" : "Checking for a saved trip on this device…"}
        detail={isSpanish ? "No crearemos ni ocultaremos nada mientras termina la comprobación." : "Nothing will be created or hidden while this safety check finishes."}
      /> : null}
      <div className={styles.libraryControls}>
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
      </div>

      <section className={styles.tripLibrary} aria-labelledby="trip-library-title">
        <h2 id="trip-library-title" className={styles.srOnly}>{isSpanish ? "Tus viajes" : "Your trips"}</h2>

        <div id="dashboard-trip-grid" className={styles.tripSections}>
          {sort === "updated" ? <RecentlyUpdatedTrips trips={visibleTrips} cardPhotos={cardPhotos} recoveryIssues={recoveryIssues} language={language} copy={copy} working={working} workingAction={workingAction} onAction={runAction} onGift={openGift} onPhotoError={markCoverFailed} onRemove={requestDelete} /> : <>
            <JourneySection kind="upcoming" trips={upcomingTrips} cardPhotos={cardPhotos} recoveryIssues={recoveryIssues} language={language} copy={copy} working={working} workingAction={workingAction} onAction={runAction} onGift={openGift} onPhotoError={markCoverFailed} onRemove={requestDelete} />
            <JourneySection kind="idea" trips={ideaTrips} cardPhotos={cardPhotos} recoveryIssues={recoveryIssues} language={language} copy={copy} working={working} workingAction={workingAction} onAction={runAction} onGift={openGift} onPhotoError={markCoverFailed} onRemove={requestDelete} />
            <JourneySection kind="past" trips={pastTrips} cardPhotos={cardPhotos} recoveryIssues={recoveryIssues} language={language} copy={copy} working={working} workingAction={workingAction} onAction={runAction} onGift={openGift} onPhotoError={markCoverFailed} onRemove={requestDelete} />
          </>}
          {!visibleTrips.length && (Boolean(query) || view !== "all" || (!trips.length && recoveryState === "none")) ? (
            <div className={styles.emptyState}>
              <Globe2 aria-hidden="true" />
              <h3>{query ? (isSpanish ? "Ningún viaje coincide." : "No trips match that search.") : !trips.length ? (isSpanish ? "Aún no hay viajes." : "No trips yet.") : view === "archived" ? copy.emptyArchived : view === "planned" ? (isSpanish ? "Aún no hay viajes planificados." : "No planned trips yet.") : copy.emptyActive}</h3>
              <p>{query ? (isSpanish ? "Prueba otro destino o título." : "Try another destination or title.") : view === "archived" ? copy.archivedHint : copy.activeHint}</p>
              {view !== "archived" && !query && recoveryState !== "checking" && recoveryState !== "syncing" && recoveryState !== "unavailable" ? <EasyTLinkButton href="/#start-building">{isSpanish ? "Crear un viaje" : "Start a trip"}<ArrowRight aria-hidden="true" /></EasyTLinkButton> : null}
            </div>
          ) : null}
        </div>
      </section>

      </div>

      <section className={styles.closingInvitation} aria-labelledby="closing-invitation-title">
        <ResilientImage src={closingPhotoSrc} alt={closingPhoto?.alt ?? ""} onDisplayState={setClosingImageDisplayed} fallback={<div className={styles.closingFallback}><Globe2 aria-hidden="true" /></div>} />
        <div className={styles.closingContent}>
          <p className={styles.eyebrow}>{isSpanish ? "Otro lugar que te llama" : "Another way to go"}</p>
          <h2 id="closing-invitation-title"><span>{isSpanish ? "¿Algún otro lugar" : "Somewhere else"}</span><em>{isSpanish ? "en mente?" : "on your mind?"}</em></h2>
          {recoveryState !== "checking" && recoveryState !== "syncing" && recoveryState !== "unavailable" ? <EasyTLinkButton variant="secondary" href="/#start-building">{isSpanish ? "Empezar otro viaje" : "Start another trip"}<ArrowRight aria-hidden="true" /></EasyTLinkButton> : null}
        </div>
      {closingPhoto && closingImageDisplayed ? <MorroviaPhotoCredit ownership={closingPhoto.provenance === "reviewed-morrovia-first-party" ? "morrovia" : "third-party"} photoLabel={closingPhoto.alt} credit={`${closingPhoto.author} · ${closingPhoto.license}`} authorHref={closingPhoto.authorUrl} sourceHref={closingPhoto.sourceUrl} licenseHref={closingPhoto.licenseUrl} fullCreditHref={`/journey/immersive/credits.html#${closingPhoto.key}`} /> : null}
      </section>

      <footer className={styles.libraryFooter}>
        <p>{isSpanish ? "Cada viaje, a su tiempo." : "Every journey, in its own time."}</p>
        <Link href="/journey/stamps">{isSpanish ? "Tus sellos" : "Your Stamps"}<span>{visitedCount} {isSpanish ? "visitados" : "visited"} · {wantCount} {isSpanish ? "deseados" : "want to go"}</span><ArrowRight aria-hidden="true" /></Link>
      </footer>

      <TripLibraryActionDialogs actions={libraryActions} language={language} />
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
  cardPhotos: Map<string, DashboardTripPhoto>;
  language: EasyTLanguage;
  copy: DashboardTripCopy;
  recoveryIssues: Record<string, DashboardRecoveryIssue>;
  working: string | null;
  workingAction: "archive" | "restore" | "duplicate" | "delete" | null;
  onAction: (id: string, action: "archive" | "restore" | "duplicate") => void;
  onGift: (trip: EasyTTrip) => void;
  onPhotoError: (trip: EasyTTrip, src: string) => void;
  onRemove: (trip: EasyTTrip) => void;
};

function RecentlyUpdatedTrips({ trips, cardPhotos, language, copy, recoveryIssues, working, workingAction, onAction, onGift, onPhotoError, onRemove }: JourneyCardActions & { trips: EasyTTrip[] }) {
  if (!trips.length) return null;
  const cardProps = { language, copy, recoveryIssues, workingAction, onAction, onGift, onPhotoError, onRemove };
  return <section className={`${styles.journeySection} ${styles.recentSection}`} aria-labelledby="recent-journeys-title">
    <h2 id="recent-journeys-title" className={styles.srOnly}>{language === "es" ? "Viajes actualizados recientemente" : "Recently updated trips"}</h2>
    <div className={styles.sectionGrid} data-count={Math.min(trips.length, 4)}>
      {trips.map((trip) => <TripCard key={trip.id} trip={trip} photo={cardPhotos.get(trip.id) ?? null} {...cardProps} working={working === trip.id} />)}
    </div>
  </section>;
}

function JourneySection({ kind, trips, cardPhotos, language, copy, recoveryIssues, working, workingAction, onAction, onGift, onPhotoError, onRemove }: JourneyCardActions & {
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
  const cardProps = { language, copy, recoveryIssues, workingAction, onAction, onGift, onPhotoError, onRemove };
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
      {visibleTrips.map((trip) => <TripCard key={trip.id} kind={kind} trip={trip} photo={cardPhotos.get(trip.id) ?? null} {...cardProps} working={working === trip.id} />)}
    </div>
    {olderTrips.length ? <details className={styles.olderJourneys}>
      <summary>{isSpanish ? `Ver ${olderTrips.length} viajes anteriores` : `Show ${olderTrips.length} older ${olderTrips.length === 1 ? "journey" : "journeys"}`}<ArrowRight aria-hidden="true" /></summary>
      <div className={styles.sectionGrid} data-count={Math.min(olderTrips.length, 4)}>
        {olderTrips.map((trip) => <TripCard key={trip.id} kind="past" trip={trip} photo={cardPhotos.get(trip.id) ?? null} {...cardProps} working={working === trip.id} />)}
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
          {trip.status === "archived" ? <EasyTButton icon={RotateCcw} variant="quiet" size="small" fullWidth disabled={working} onClick={() => onAction(trip.id, "restore")}>{actionLabel("restore")}</EasyTButton> : <EasyTButton icon={Archive} variant="quiet" size="small" fullWidth disabled={working} onClick={() => onAction(trip.id, "archive")}>{actionLabel("archive")}</EasyTButton>}
          <EasyTButton icon={Copy} variant="quiet" size="small" fullWidth disabled={working} onClick={() => onAction(trip.id, "duplicate")}>{actionLabel("duplicate")}</EasyTButton>
          <EasyTButton icon={Gift} variant="quiet" size="small" fullWidth disabled={working} onClick={() => onGift(trip)}>{copy.gift}</EasyTButton>
          <EasyTButton icon={Trash2} variant="quiet" size="small" fullWidth className={styles.deleteAction} disabled={working} onClick={() => onRemove(trip)}>{copy.delete}</EasyTButton>
        </div>
      </details>;
}

export function TripCard({ kind, trip, photo: selectedPhoto, language, copy, recoveryIssues, working, workingAction, onAction, onGift, onPhotoError, onRemove }: {
  kind?: "upcoming" | "idea" | "past";
  trip: EasyTTrip;
  photo?: DashboardTripPhoto | null;
  language: EasyTLanguage;
  copy: DashboardTripCopy;
  recoveryIssues: Record<string, DashboardRecoveryIssue>;
  working: boolean;
  workingAction: "archive" | "restore" | "duplicate" | "delete" | null;
  onAction: (id: string, action: "archive" | "restore" | "duplicate") => void;
  onGift: (trip: EasyTTrip) => void;
  onPhotoError: (trip: EasyTTrip, src: string) => void;
  onRemove: (trip: EasyTTrip) => void;
}) {
  const [imageDisplayed, setImageDisplayed] = useState(false);
  useEffect(() => setImageDisplayed(false), [selectedPhoto?.src]);
  const resolvedKind = kind ?? (trip.status === "draft" ? "idea" : trip.status === "archived" ? "past" : "upcoming");
  const title = tripOverviewDisplayTitle(trip);
  const photo = selectedPhoto === undefined ? dashboardTripPhoto(trip) : selectedPhoto;
  const primaryHref = resolvedKind === "idea" ? `/journey/new?trip=${encodeURIComponent(trip.id)}` : tripWorkspaceHref(trip.id);
  const primaryLabel = language === "es" ? "Continuar viaje" : "Continue trip";
  const recoveryIssue = recoveryIssues[trip.id];
  return <article className={`${styles.tripCard} ${resolvedKind === "past" ? styles.pastCard : ""} ${working ? styles.working : ""}`} aria-busy={working || undefined}>
    <div className={styles.cardMediaFrame}>
      <Link className={styles.cardMedia} href={primaryHref} onClick={() => resolvedKind === "idea" ? trackEvent("trip_edit_started", { trip_id: trip.id, source: "dashboard" }) : trackTripReopened(trip)} tabIndex={working ? -1 : undefined} aria-disabled={working || undefined}>
        {resolvedKind === "idea" ? <div className={styles.routePreviewFallback} aria-label={`${title} ${language === "es" ? "boceto de ruta" : "route sketch"}`}><MapPin aria-hidden="true" /><span>{statusLabel(trip.status, language)}</span></div> : <ResilientImage src={photo?.src} alt={photo?.alt ?? ""} onDisplayState={setImageDisplayed} onError={() => { if (photo) onPhotoError(trip, photo.src); }} fallback={<CountryVisualFallback country={dashboardTripCoverPlace(trip)?.country} />} />}
      </Link>
      {resolvedKind !== "idea" && photo?.scope === "country" && imageDisplayed ? <CountryIllustrationLabel country={photo.country} /> : null}
      {resolvedKind !== "idea" && photo?.creditLabel && imageDisplayed ? <MorroviaPhotoCredit size="compact" ownership={photo.provenance === "reviewed-morrovia-first-party" ? "morrovia" : "third-party"} placement="bottom-right" photoLabel={photo.alt} credit={photo.creditLabel} authorHref={photo.authorHref} sourceHref={photo.creditHref} licenseHref={photo.licenseHref} fullCreditHref={photo.fullCreditHref} /> : null}
    </div>
    <div className={styles.cardBody}>
      <h3><Link href={primaryHref} onClick={() => resolvedKind === "idea" ? trackEvent("trip_edit_started", { trip_id: trip.id, source: "dashboard" }) : trackTripReopened(trip)}>{title}</Link></h3>
      <p className={styles.tripFacts}><time>{formatTripDates(trip, language)}</time><span>{trip.stops.length} {language === "es" ? (trip.stops.length === 1 ? "parada" : "paradas") : (trip.stops.length === 1 ? "stop" : "stops")}</span></p>
      {recoveryIssue ? <div className={styles.tripRecoveryNotice} role="status">
        <strong>{recoveryIssue.tripTitle} has device changes to review</strong>
        <span>{recoveryIssue.detail}</span>
        <EasyTLinkButton size="small" variant="secondary" href={tripSyncRecoveryPath(trip.id)}>Review device copy</EasyTLinkButton>
      </div> : null}
      <div className={styles.tripCardActions}>
        <EasyTLinkButton className={styles.openAction} size="small" variant="primary" href={primaryHref} onClick={() => resolvedKind === "idea" ? trackEvent("trip_edit_started", { trip_id: trip.id, source: "dashboard" }) : trackTripReopened(trip)}>{primaryLabel}<ArrowRight aria-hidden="true" /></EasyTLinkButton>
        <TripActionsMenu trip={trip} language={language} copy={copy} working={working} workingAction={workingAction} onAction={onAction} onGift={onGift} onRemove={onRemove} />
      </div>
    </div>
  </article>;
}
