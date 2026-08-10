"use client";

import Link from "next/link";
import { Archive, CalendarCheck2, Copy, Edit3, Gift, MoreHorizontal, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { EasyTSegmentedControl } from "@/components/easyt/easyt-controls";
import { EasyTFeedback } from "@/components/easyt/easyt-feedback";
import { loadActiveTrip, saveTripToEasyT } from "@/lib/easyt/storage";
import { easytCopy, languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "../account.module.css";
import FirstTripGuide from "./first-trip-guide";

export default function DashboardClient({ trips }: { trips: EasyTTrip[] }) {
  const router = useRouter();
  const [view, setView] = useState<"active" | "archived">("active");
  const [working, setWorking] = useState<string | null>(null);
  const [gifting, setGifting] = useState<EasyTTrip | null>(null);
  const [giftEmail, setGiftEmail] = useState("");
  const [giftNote, setGiftNote] = useState("");
  const [giftState, setGiftState] = useState<"idle" | "sending" | "complete">("idle");
  const [giftError, setGiftError] = useState("");
  const [claimUrl, setClaimUrl] = useState("");
  const [delivered, setDelivered] = useState(false);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const copy = easytCopy[language].dashboard;

  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  useEffect(() => {
    const localTrip = loadActiveTrip();
    if (!localTrip) return;
    const migrationKey = `easyt-trip-migrated-${localTrip.id}`;
    if (window.localStorage.getItem(migrationKey)) return;
    void saveTripToEasyT(localTrip)
      .then(() => { window.localStorage.setItem(migrationKey, "1"); router.refresh(); })
      .catch(() => undefined);
  }, [router]);

  const runAction = async (
    id: string,
    action: "archive" | "restore" | "duplicate",
  ) => {
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
    const response = await fetch(`/api/easyt/trips/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
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

  const copyClaimUrl = async () => {
    await navigator.clipboard.writeText(claimUrl);
  };

  const activeTrips = trips.filter((trip) => trip.status !== "archived");
  const archivedTrips = trips.filter((trip) => trip.status === "archived");
  const visibleTrips = view === "active" ? activeTrips : archivedTrips;

  return (
    <>
      <FirstTripGuide trips={trips} />
      <EasyTSegmentedControl
        ariaLabel={language === "es" ? "Estado del viaje" : "Trip status"}
        className={styles.tripViews}
        value={view}
        onChange={setView}
        options={[
          { label: copy.active, value: "active", count: activeTrips.length },
          { label: copy.archived, value: "archived", count: archivedTrips.length },
        ]}
      />
      <div className={styles.tripGrid}>
        {visibleTrips.map((trip) => (
          <article
            key={trip.id}
            className={`${styles.tripCard} ${working === trip.id ? styles.loading : ""}`}
          >
            <Link
              className={styles.tripCardLink}
              href={`/journey/plan?trip=${encodeURIComponent(trip.id)}`}
              aria-label={`${language === "es" ? "Abrir" : "Open"} ${trip.title}`}
            >
              <div className={styles.tripMeta}>
                <span>{trip.status === "archived" ? copy.archived : copy.active}</span>
                <span>
                  {trip.startDate} → {trip.endDate}
                </span>
              </div>
              <h2>{trip.title}</h2>
              <p className={styles.tripStops}>
                {trip.stops.map((stop) => stop.name).join(" → ") || copy.routeWaiting}
              </p>
            </Link>
            <div className={styles.tripFooter}>
              <div className={styles.tripActions}>
                <Link
                  className={styles.editTripLink}
                  href={`/journey/trip?trip=${encodeURIComponent(trip.id)}`}
                >
                  <CalendarCheck2 aria-hidden="true" />
                  {language === "es" ? "Modo viaje" : "Trip mode"}
                </Link>
                <Link
                  className={styles.editTripLink}
                  href={`/journey/new?trip=${encodeURIComponent(trip.id)}`}
                >
                  <Edit3 aria-hidden="true" />
                  {copy.edit}
                </Link>
              </div>
              <details className={styles.tripMenu}>
                <summary aria-label={`Actions for ${trip.title}`}>
                  <MoreHorizontal aria-hidden="true" />
                </summary>
                <div>
                  {trip.status === "archived" ? (
                    <button
                      type="button"
                      onClick={() => runAction(trip.id, "restore")}
                    >
                      <RotateCcw aria-hidden="true" />
                      {copy.restore}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => runAction(trip.id, "archive")}
                    >
                      <Archive aria-hidden="true" />
                      {copy.archive}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => runAction(trip.id, "duplicate")}
                  >
                    <Copy aria-hidden="true" />
                    {copy.duplicate}
                  </button>
                  <button type="button" onClick={() => openGift(trip)}>
                    <Gift aria-hidden="true" />
                    {copy.gift}
                  </button>
                  <button
                    type="button"
                    className={styles.tripDelete}
                    onClick={() => remove(trip.id)}
                  >
                    <Trash2 aria-hidden="true" />
                    {copy.delete}
                  </button>
                </div>
              </details>
            </div>
          </article>
        ))}
        {!visibleTrips.length && (
          <div className={styles.empty}>
            <h2>
              {view === "archived"
                ? copy.emptyArchived
                : copy.emptyActive}
            </h2>
            <p className={styles.muted}>
              {view === "archived"
                ? copy.archivedHint
                : copy.activeHint}
            </p>
            {view === "active" ? <Link className={styles.primaryLink} href="/journey/home#start-building">{language === "es" ? "Crea tu primer viaje" : "Start your first trip"}</Link> : null}
          </div>
        )}
      </div>
      {gifting ? (
        <div className={styles.giftOverlay} role="presentation" onMouseDown={() => setGifting(null)}>
          <section className={styles.giftDialog} role="dialog" aria-modal="true" aria-labelledby="gift-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className={styles.giftClose} type="button" onClick={() => setGifting(null)} aria-label={language === "es" ? "Cerrar diálogo" : "Close gift dialog"}><X aria-hidden="true" /></button>
            <span className={styles.giftDialogIcon}><Gift aria-hidden="true" /></span>
            <p className={styles.eyebrow}>{copy.giftTitle}</p>
            <h2 id="gift-title">{language === "es" ? "Compartir" : "Share"} {gifting.title}</h2>
            {giftState === "complete" ? (
              <div className={styles.giftComplete}>
                <p>{delivered ? copy.inviteSent : copy.inviteReady}</p>
                <input value={claimUrl} readOnly aria-label={language === "es" ? "Enlace para reclamar" : "Gift claim link"} />
                <button type="button" className={styles.primaryLink} onClick={copyClaimUrl}>{copy.copyLink}</button>
              </div>
            ) : (
              <>
                <p className={styles.muted}>{copy.draftHint}</p>
                <label className={styles.field}>
                  <span>{copy.recipient}</span>
                  <input type="email" value={giftEmail} onChange={(event) => setGiftEmail(event.target.value)} placeholder="friend@example.com" autoComplete="email" />
                </label>
                <label className={styles.field}>
                  <span>{copy.note}</span>
                  <textarea value={giftNote} onChange={(event) => setGiftNote(event.target.value)} placeholder={language === "es" ? "Un pequeño adelanto para nuestra próxima aventura…" : "A little head start for our next adventure…"} maxLength={500} />
                </label>
                {giftError ? <p className={styles.syncError}>{giftError}</p> : null}
                <button type="button" className={styles.primaryLink} onClick={sendGift} disabled={giftState === "sending"}>{giftState === "sending" ? copy.creatingInvite : copy.createInvite}</button>
              </>
            )}
          </section>
        </div>
      ) : null}
      <EasyTFeedback />
    </>
  );
}
