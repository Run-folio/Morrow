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
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EasyTTrip, TripStatus } from "@/lib/easyt/trip";
import { EasyTFeedback } from "@/components/easyt/easyt-feedback";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import {
  EasyTTripAuthError,
  EasyTTripPromotionConflictError,
  loadActiveTrip,
  promoteTripToEasyT,
  saveActiveTrip,
} from "@/lib/easyt/storage";
import { canPromoteTripForOwner } from "@/lib/easyt/trip-promotion";
import { classifyAnalyticsSaveError, trackEvent } from "@/lib/analytics";
import { easytCopy, languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { tripWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { summarizeStampRows } from "@/lib/easyt/stamps";
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
  return trip.stops.map((stop) => stop.name).join(" → ") || fallback;
}

function formatTripDates(trip: EasyTTrip, language: EasyTLanguage) {
  if (!trip.startDate || !trip.endDate) return language === "es" ? "Fechas por confirmar" : "Dates to confirm";
  const start = new Date(`${trip.startDate}T00:00:00`);
  const end = new Date(`${trip.endDate}T00:00:00`);
  if (Number.isNaN(+start) || Number.isNaN(+end)) return `${trip.startDate} → ${trip.endDate}`;
  const locale = language === "es" ? "es" : "en-GB";
  const startText = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(start);
  const endText = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(end);
  return `${startText} – ${endText}`;
}

function featuredTripFrom(trips: EasyTTrip[]) {
  const available = trips.filter((trip) => trip.status !== "archived");
  const activeDraft = available
    .filter((trip) => trip.status === "draft")
    .sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))[0];
  if (activeDraft) return activeDraft;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = available
    .filter((trip) => timestamp(trip.startDate) >= +today)
    .sort((a, b) => timestamp(a.startDate) - timestamp(b.startDate))[0];
  return upcoming ?? available.sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))[0] ?? null;
}

function statusLabel(status: TripStatus, language: EasyTLanguage) {
  if (language === "es") return status === "draft" ? "Activo" : status === "planned" ? "Planificado" : "Archivado";
  return status === "draft" ? "Active" : status === "planned" ? "Planned" : "Archived";
}

function trackTripReopened(trip: EasyTTrip) {
  // Dashboard rows are owner-scoped cloud documents. Cache that exact
  // revision before navigation so dashboard and direct links resolve alike.
  saveActiveTrip(trip);
  trackEvent("trip_reopened", { trip_id: trip.id, source: "dashboard", save_state: "cloud", stop_count: trip.stops.length });
}

export default function DashboardClient({ trips, stamps, ownerId }: { trips: EasyTTrip[]; stamps: StampSummary[]; ownerId: string }) {
  const router = useRouter();
  const [view, setView] = useState<TripStatus>(() => trips.some((trip) => trip.status === "draft") ? "draft" : trips.some((trip) => trip.status === "planned") ? "planned" : "archived");
  const [sort, setSort] = useState<SortMode>("updated");
  const [query, setQuery] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [gifting, setGifting] = useState<EasyTTrip | null>(null);
  const [giftEmail, setGiftEmail] = useState("");
  const [giftNote, setGiftNote] = useState("");
  const [giftState, setGiftState] = useState<"idle" | "sending" | "complete">("idle");
  const [giftError, setGiftError] = useState("");
  const [claimUrl, setClaimUrl] = useState("");
  const [delivered, setDelivered] = useState(false);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [syncIssue, setSyncIssue] = useState<{
    kind: "failed" | "conflict" | "auth";
    tripId: string;
    message: string;
  } | null>(null);
  const [syncingLocalTrip, setSyncingLocalTrip] = useState(false);
  const copy = easytCopy[language].dashboard;

  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  const syncLocalTrip = useCallback(async () => {
    const localTrip = loadActiveTrip();
    if (!localTrip || !canPromoteTripForOwner(localTrip, ownerId)) return;
    setSyncIssue(null);
    setSyncingLocalTrip(true);
    try {
      const result = await promoteTripToEasyT(localTrip);
      // A successful response is the first safe point at which the cloud form
      // replaces the browser draft and becomes the local fallback too.
      saveActiveTrip(result.trip);
      if (result.outcome === "promoted") {
        trackEvent("trip_saved", { trip_source: "dashboard", trip_id: result.trip.id, save_state: "cloud", stop_count: result.trip.stops.length, is_authenticated: true });
      }
      if (!trips.some((trip) => trip.id === result.trip.id)) router.refresh();
    } catch (error) {
      const conflict = error instanceof EasyTTripPromotionConflictError;
      const authInterrupted = error instanceof EasyTTripAuthError;
      setSyncIssue({
        kind: authInterrupted ? "auth" : conflict ? "conflict" : "failed",
        tripId: localTrip.id,
        message: authInterrupted
          ? "Your session ended before this device copy could sync."
          : conflict
          ? error.message
          : "This trip could not sync to your account. It is still saved on this device.",
      });
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
      return `${trip.title} ${routeLabel(trip, "")}`.toLocaleLowerCase().includes(normalizedQuery);
    });
    return result.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "upcoming") return timestamp(a.startDate) - timestamp(b.startDate);
      return timestamp(b.updatedAt) - timestamp(a.updatedAt);
    });
  }, [query, sort, trips, view]);

  const runAction = async (id: string, action: "archive" | "restore" | "duplicate") => {
    setWorking(id);
    const response = await fetch(`/api/easyt/trips/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setWorking(null);
    if (response.ok) router.refresh();
  };

  const remove = async (id: string) => {
    if (!window.confirm(language === "es" ? "¿Eliminar este viaje guardado?" : "Remove this saved trip?")) return;
    setWorking(id);
    const response = await fetch(`/api/easyt/trips/${encodeURIComponent(id)}`, { method: "DELETE" });
    setWorking(null);
    if (response.ok) router.refresh();
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
    const response = await fetch(`/api/easyt/trips/${encodeURIComponent(gifting.id)}/gift`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: giftEmail, note: giftNote }),
    });
    const payload = (await response.json()) as { error?: string; claimUrl?: string; delivered?: boolean };
    if (!response.ok || !payload.claimUrl) {
      setGiftState("idle");
      setGiftError(payload.error || (language === "es" ? "No se pudo crear la invitación." : "Unable to create invitation."));
      return;
    }
    setClaimUrl(payload.claimUrl);
    setDelivered(Boolean(payload.delivered));
    setGiftState("complete");
  };

  const stampSummary = summarizeStampRows(stamps);
  const visitedCount = stampSummary.visited;
  const wantCount = stampSummary.want;
  const isSpanish = language === "es";

  return (
    <>
      {syncIssue ? <aside className={styles.syncNotice} role="alert">
        <AlertTriangle aria-hidden="true" />
        <div>
          <strong>{syncIssue.kind === "auth" ? (isSpanish ? "Inicia sesión para sincronizar" : "Sign in to finish syncing") : syncIssue.kind === "conflict" ? (isSpanish ? "Se conservó la copia en la nube" : "Cloud copy kept safe") : (isSpanish ? "El viaje aún no está sincronizado" : "Trip not synced yet")}</strong>
          <p>{syncIssue.message} {isSpanish ? "La copia de este dispositivo no se ha eliminado." : "The copy on this device has not been removed."}</p>
        </div>
        <span>
          {syncIssue.kind === "failed" ? <EasyTButton size="small" variant="secondary" onClick={() => void syncLocalTrip()} loading={syncingLocalTrip}>{isSpanish ? "Reintentar" : "Try again"}</EasyTButton> : null}
          {syncIssue.kind === "auth" ? <EasyTLinkButton size="small" variant="secondary" href={`/journey/login?next=${encodeURIComponent("/journey/dashboard")}`}>{isSpanish ? "Iniciar sesión de nuevo" : "Sign in again"}</EasyTLinkButton> : <EasyTLinkButton size="small" variant="secondary" href={tripWorkspaceHref(syncIssue.tripId)}>{syncIssue.kind === "conflict" ? (isSpanish ? "Abrir copia en la nube" : "Open cloud copy") : (isSpanish ? "Abrir copia del dispositivo" : "Open device copy")}</EasyTLinkButton>}
        </span>
      </aside> : null}
      <section className={`${styles.dashboardHero} ${trips.length ? "" : styles.dashboardHeroEmpty}`}>
        {featuredTrip ? (
          <article className={styles.continueCard}>
            <div className={styles.continueCopy}>
              <p className={styles.eyebrow}>{isSpanish ? "Continúa este viaje" : "Continue this trip"}</p>
              <h2>{featuredTrip.title}</h2>
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
            {tripImage(featuredTrip) ? (
              <img className={styles.continueImage} src={tripImage(featuredTrip) ?? ""} alt="" />
            ) : (
              <div className={styles.continueImageFallback} aria-hidden="true">
                <span>{featuredTrip.stops.length || 1}</span>
                <p>{routeLabel(featuredTrip, copy.routeWaiting)}</p>
              </div>
            )}
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
          <img src="/journey/illustrations/global-route-confirm.png" alt="" className={styles.stampsMap} />
          <Link className={styles.secondaryAction} href="/journey/stamped">{isSpanish ? "Abrir Sellos" : "Open Stamped"}<ArrowRight aria-hidden="true" /></Link>
        </section> : null}
      </section>

      {trips.length ? <section className={styles.tripLibrary} aria-labelledby="trip-library-title">
        <h2 id="trip-library-title" className={styles.srOnly}>{isSpanish ? "Tus viajes" : "Your trips"}</h2>
        <div className={styles.libraryToolbar}>
          <div className={styles.statusFilters} role="group" aria-label={isSpanish ? "Estado del viaje" : "Trip status"}>
            {(["draft", "planned", "archived"] as TripStatus[]).map((status) => (
              <button key={status} type="button" aria-pressed={view === status} onClick={() => setView(status)}>
                {statusLabel(status, language)} <span>{counts[status]}</span>
              </button>
            ))}
          </div>
          <div className={styles.libraryTools}>
            <label className={styles.sortControl}>
              <span className={styles.srOnly}>{isSpanish ? "Ordenar viajes" : "Sort trips"}</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
                <option value="updated">{isSpanish ? "Ordenar: Actualizados" : "Sort by: Recently updated"}</option>
                <option value="upcoming">{isSpanish ? "Ordenar: Próximos" : "Sort by: Upcoming"}</option>
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

        <div className={styles.tripGrid}>
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
            <h2 id="gift-title">{isSpanish ? "Compartir" : "Share"} {gifting.title}</h2>
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

function TripCard({ trip, language, copy, working, onAction, onGift, onRemove }: {
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
  return <article className={`${styles.tripCard} ${working ? styles.working : ""} ${trip.status === "draft" ? styles.activeTripCard : ""}`}>
    <div className={styles.tripCardMeta}><span>{statusLabel(trip.status, language)}</span><time>{formatTripDates(trip, language)}</time></div>
    <h3>{trip.title}</h3>
    <p className={styles.tripRoute}>{routeLabel(trip, copy.routeWaiting)}</p>
    {tripImage(trip) ? <img src={tripImage(trip) ?? ""} alt="" className={styles.tripImage} /> : <div className={styles.tripImageFallback}><b>{trip.stops.length}</b><span>{language === "es" ? "paradas" : "stops"}</span><small>{formatTripDates(trip, language)}</small></div>}
    <div className={styles.tripCardActions}>
      <Link className={styles.openAction} href={tripWorkspaceHref(trip.id)} onClick={() => trackTripReopened(trip)}>{language === "es" ? "Abrir viaje" : "Open trip"}<ArrowRight aria-hidden="true" /></Link>
      <Link className={styles.editAction} href={`/journey/new?trip=${encodeURIComponent(trip.id)}`} onClick={() => trackEvent("trip_edit_started", { trip_id: trip.id, source: "dashboard" })}><Edit3 aria-hidden="true" />{copy.edit}</Link>
      <details className={styles.tripMenu}>
        <summary aria-label={`${language === "es" ? "Acciones para" : "Actions for"} ${trip.title}`}><MoreHorizontal aria-hidden="true" /></summary>
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
