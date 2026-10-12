"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BedDouble, CalendarCheck2, Check, ClipboardList, ExternalLink, MapPin, Plus, ReceiptText, Utensils } from "lucide-react";
import {
  acknowledgeTripBuildSave,
  cacheCanonicalTrip,
  deferNewTripNavigation,
  canUseHydratedTripScope,
  EASYT_BEFORE_NEW_TRIP_EVENT,
  EasyTTripAuthError,
  EasyTTripPromotionConflictError,
  EasyTTripSaveConflictError,
  loadActiveTrip,
  loadLocalTrip,
  loadTripRecovery,
  loadTripFromEasyT,
  markTripRecoveryState,
  saveTripRecovery,
  saveTripRecoveryToEasyT,
  subscribeToTripStorage,
  type TripRecoveryHandle,
} from "@/lib/easyt/storage";
import { tripEditorSyncAction, tripSyncRecoveryPath, tripSyncSignInPath } from "@/lib/easyt/trip-continuity";
import { isTripPersistenceAuthenticationError, tripRecoveryStateForPersistenceError } from "@/lib/easyt/trip-persistence-error";
import { formatIsoDate, isoDateKey, tripLifecycle } from "@/lib/easyt/trip-lifecycle";
import { requestedTripMatch } from "@/lib/easyt/trip-id-resolution";
import type { EasyTTrip, TripBooking, TripChecklistItem } from "@/lib/easyt/trip";
import { mapWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { tripDisplayTitle } from "@/lib/easyt/trip-display";
import { authClient } from "@/lib/auth-client";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { MorroviaDatePicker } from "@/components/easyt/morrovia-date-picker";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import styles from "./trip-mode.module.css";

const defaultChecklist = (): TripChecklistItem[] => [
  { id: "documents", label: "Check passport and entry requirements", complete: false },
  { id: "arrival", label: "Save your arrival address and first-night details", complete: false },
  { id: "money", label: "Set up a payment method for the trip", complete: false },
  { id: "offline", label: "Open this trip once before you leave", complete: false },
];

function dayLabel(date: string) {
  return formatIsoDate(date, "en", { weekday: "long", month: "short", day: "numeric" }) ?? "Date to confirm";
}

function lifecycleLabel(startDate: string, endDate: string) {
  const lifecycle = tripLifecycle(startDate, endDate);
  if (lifecycle.state === "upcoming") return `${lifecycle.daysUntilStart} days until departure`;
  if (lifecycle.state === "starts-today") return "Your trip starts today";
  if (lifecycle.state === "started") return "Your trip has started";
  if (lifecycle.state === "in-progress") return "Your trip is underway";
  if (lifecycle.state === "ends-today") return "Your trip ends today";
  if (lifecycle.state === "ended") return "Your trip has ended";
  return "Add valid trip dates to see where you are in the journey";
}

function sameRecoveryHandle(left: TripRecoveryHandle | null, right: TripRecoveryHandle) {
  return left?.ownerId === right.ownerId
    && left.tripId === right.tripId
    && left.writeId === right.writeId;
}

export default function TripModeClient() {
  const params = useSearchParams();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const visibleOwnerId = session?.user?.id ?? null;
  const requestedTripId = params.get("trip");
  const tripModeDocumentIdentity = JSON.stringify([visibleOwnerId, requestedTripId]);
  const visibleOwnerIdRef = useRef(visibleOwnerId);
  visibleOwnerIdRef.current = visibleOwnerId;
  const hydratedOwnerScopeRef = useRef<string | null | undefined>(undefined);
  const hydratedDocumentIdentityRef = useRef<string | undefined>(undefined);
  const previousDocumentIdentityRef = useRef(tripModeDocumentIdentity);
  const recoveryHandleRef = useRef<TripRecoveryHandle | null>(null);
  const mountedRef = useRef(true);
  const currentDocumentIdentityRef = useRef(tripModeDocumentIdentity);
  currentDocumentIdentityRef.current = tripModeDocumentIdentity;
  const sourceRevisionRef = useRef(0);
  const loadingRef = useRef(true);
  const pendingWriteRef = useRef<Promise<boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [hydrationRevision, setHydrationRevision] = useState(0);
  const [writePending, setWritePending] = useState(false);
  const [trip, setTrip] = useState<EasyTTrip | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [syncConflict, setSyncConflict] = useState<EasyTTrip | null>(null);
  const [syncAuthInterrupted, setSyncAuthInterrupted] = useState(false);
  const [localWriteIssue, setLocalWriteIssue] = useState<"existing-recovery" | "preserved-recovery" | "storage" | "cache" | null>(null);
  const [tab, setTab] = useState<"today" | "bookings" | "ready">("today");
  const [bookingTitle, setBookingTitle] = useState("");
  const [bookingType, setBookingType] = useState<TripBooking["type"]>("stay");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => subscribeToTripStorage(visibleOwnerId, requestedTripId ?? "", () => {
    sourceRevisionRef.current += 1;
    if (loadingRef.current) setHydrationRevision((revision) => revision + 1);
  }), [requestedTripId, visibleOwnerId]);

  useEffect(() => {
    let active = true;
    if (sessionPending) return () => { active = false; };
    const revision = sourceRevisionRef.current;
    const isCurrent = () => active && mountedRef.current
      && currentDocumentIdentityRef.current === tripModeDocumentIdentity
      && sourceRevisionRef.current === revision;
    const id = requestedTripId;
    const ownerId = visibleOwnerId;
    const documentIdentityChanged = previousDocumentIdentityRef.current !== tripModeDocumentIdentity;
    previousDocumentIdentityRef.current = tripModeDocumentIdentity;
    hydratedOwnerScopeRef.current = undefined;
    hydratedDocumentIdentityRef.current = undefined;
    recoveryHandleRef.current = null;
    loadingRef.current = true;
    setLoading(true);
    setReadFailed(false);
    setTrip(null);
    setLocalWriteIssue(null);
    setSyncError(false);
    setSyncConflict(null);
    setSyncAuthInterrupted(false);
    setWritePending(false);
    if (documentIdentityChanged) pendingWriteRef.current = null;
    if (documentIdentityChanged) {
      setBookingTitle("");
      setBookingType("stay");
      setBookingDate("");
      setBookingUrl("");
    }
    void (async () => {
      const local = id ? await loadLocalTrip(id, ownerId) : await loadActiveTrip(ownerId);
      if (!isCurrent()) return;
      const fallback = requestedTripMatch(id ?? local?.id ?? "", local, session?.user?.id);
      const fallbackRecovery = id
        ? await loadTripRecovery(id, ownerId)
        : fallback ? await loadTripRecovery(fallback.id, ownerId) : null;
      if (!isCurrent()) return;
      let loaded: EasyTTrip | null = null;
      if (id) {
        try { loaded = await loadTripFromEasyT(id); } catch { /* retain the checked local copy */ }
      }
      if (!isCurrent()) return;
      const resolved = loaded ?? fallback;
      hydratedOwnerScopeRef.current = loaded ? loaded.ownerId : ownerId;
      hydratedDocumentIdentityRef.current = tripModeDocumentIdentity;
      recoveryHandleRef.current = loaded ? null : fallbackRecovery;
      setTrip(resolved);
      setLocalWriteIssue(loaded && fallbackRecovery ? "preserved-recovery" : null);
      setSyncError(Boolean(loaded && fallbackRecovery));
      loadingRef.current = false;
      setLoading(false);
    })().catch(() => {
      if (!isCurrent()) return;
      loadingRef.current = false;
      setReadFailed(true);
      setLoading(false);
    });
    return () => { active = false; };
  }, [hydrationRevision, requestedTripId, session?.user?.id, sessionPending, tripModeDocumentIdentity, visibleOwnerId]);

  const persist = (next: EasyTTrip): Promise<boolean> => {
    if (pendingWriteRef.current) return Promise.resolve(false);
    const sessionOwnerId = visibleOwnerId;
    const identity = tripModeDocumentIdentity;
    const isCurrent = () => mountedRef.current && currentDocumentIdentityRef.current === identity
      && visibleOwnerIdRef.current === sessionOwnerId
      && canUseHydratedTripScope(hydratedOwnerScopeRef.current, sessionOwnerId);
    if (!isCurrent() || (next.ownerId && next.ownerId !== sessionOwnerId)) {
      setLocalWriteIssue("existing-recovery");
      setSyncError(true);
      return Promise.resolve(false);
    }
    const previousHandle = recoveryHandleRef.current;
    const replacement = previousHandle?.tripId === next.id ? previousHandle : null;
    const recoveryOwnerId = replacement ? replacement.ownerId : next.ownerId ?? sessionOwnerId;
    const canonicalBase = trip ?? undefined;
    setWritePending(true);
    const pending = (async () => {
      const recovery = await saveTripRecovery(next, {
        ownerId: recoveryOwnerId,
        replace: replacement ?? undefined,
        canonicalBase,
        isCurrent,
      });
      if (!isCurrent()) return false;
      if (!recovery.stored) {
        if (recovery.blockedByExistingRecovery) recoveryHandleRef.current = null;
        setLocalWriteIssue(recovery.blockedByExistingRecovery ? "existing-recovery" : "storage");
        setSyncError(true);
        return false;
      }
      recoveryHandleRef.current = recovery.handle;
      setTrip(next);
      setSyncAuthInterrupted(false);
      setLocalWriteIssue(null);
      setSyncError(Boolean(syncConflict));
      try {
        const outgoing = structuredClone(next);
        const saved = await saveTripRecoveryToEasyT(outgoing, recovery.handle);
        const acknowledged = await acknowledgeTripBuildSave(outgoing, saved, recovery.handle, { isCurrent });
        if (!isCurrent() || !sameRecoveryHandle(recoveryHandleRef.current, recovery.handle)) return true;
        if (acknowledged.accountAcknowledged) {
          recoveryHandleRef.current = null;
          setTrip(saved);
          setSyncConflict(null);
          setSyncAuthInterrupted(false);
          const deviceIssue = acknowledged.outcome === "device-newer" || acknowledged.deviceOutcome === "protected-conflict";
          const cacheIssue = !acknowledged.cacheStored;
          setLocalWriteIssue(deviceIssue ? "preserved-recovery" : cacheIssue ? "cache" : null);
          setSyncError(deviceIssue || cacheIssue);
        } else {
          setLocalWriteIssue("preserved-recovery");
          setSyncError(true);
        }
      } catch (error) {
        await markTripRecoveryState(recovery.handle, tripRecoveryStateForPersistenceError(error));
        if (!isCurrent() || !sameRecoveryHandle(recoveryHandleRef.current, recovery.handle)) return true;
        const conflict = error instanceof EasyTTripSaveConflictError || error instanceof EasyTTripPromotionConflictError;
        if (conflict) setSyncConflict(error.canonicalTrip);
        if (error instanceof EasyTTripAuthError || isTripPersistenceAuthenticationError(error)) setSyncAuthInterrupted(true);
        setLocalWriteIssue(null);
        setSyncError(true);
      }
      return true;
    })().catch(() => {
      if (isCurrent()) { setLocalWriteIssue("storage"); setSyncError(true); }
      return false;
    }).finally(() => {
      if (pendingWriteRef.current === pending) pendingWriteRef.current = null;
      if (isCurrent()) setWritePending(false);
    });
    pendingWriteRef.current = pending;
    return pending;
  };

  useEffect(() => {
    const preserveBeforeNewTrip = (event: Event) => {
      if (pendingWriteRef.current) {
        deferNewTripNavigation(event, pendingWriteRef.current);
        return;
      }
      if (readFailed || loadingRef.current || (trip && !canUseHydratedTripScope(hydratedOwnerScopeRef.current, visibleOwnerId))) {
        event.preventDefault();
        return;
      }
      if (localWriteIssue === "existing-recovery") event.preventDefault();
    };
    window.addEventListener(EASYT_BEFORE_NEW_TRIP_EVENT, preserveBeforeNewTrip);
    return () => window.removeEventListener(EASYT_BEFORE_NEW_TRIP_EVENT, preserveBeforeNewTrip);
  }, [localWriteIssue, readFailed, trip, visibleOwnerId]);

  const reloadCloudCopy = async () => {
    if (!syncConflict) return;
    const identity = tripModeDocumentIdentity;
    const canonical = syncConflict;
    try {
      await cacheCanonicalTrip(canonical);
      const recovery = await loadTripRecovery(canonical.id, visibleOwnerId);
      if (!mountedRef.current || currentDocumentIdentityRef.current !== identity) return;
      recoveryHandleRef.current = null;
      setTrip(canonical);
      setSyncConflict(null);
      setSyncAuthInterrupted(false);
      setLocalWriteIssue(recovery ? "preserved-recovery" : null);
      setSyncError(Boolean(recovery));
    } catch {
      if (!mountedRef.current || currentDocumentIdentityRef.current !== identity) return;
      setLocalWriteIssue("cache");
      setSyncError(true);
    }
  };

  const tripDay = useMemo(() => {
    if (!trip) return null;
    const today = isoDateKey(new Date());
    return trip.planItems.find((item) => item.date === today) ?? null;
  }, [trip]);
  const checklist = trip?.brief.checklist?.length ? trip.brief.checklist : defaultChecklist();
  const bookings = trip?.brief.bookings ?? [];
  const dayNotes = tripDay && trip ? trip.brief.dayNotes?.[tripDay.dayNumber] ?? [] : [];
  const pins = tripDay && trip ? trip.brief.mapPins?.filter((pin) => pin.dayNumber === tripDay.dayNumber) ?? [] : [];
  const tripHref = trip ? mapWorkspaceHref(trip.id, null, "plan", null, null, null, `/journey/trip?trip=${encodeURIComponent(trip.id)}`) : "/journey/new";
  const syncAction = tripEditorSyncAction({
    hasCloudConflict: Boolean(syncConflict),
    hasDeviceRecoveryIssue: localWriteIssue === "existing-recovery" || localWriteIssue === "preserved-recovery",
    authInterrupted: syncAuthInterrupted,
  });
  const syncMessage = syncConflict
    ? "This trip changed on another device. Your edit remains on this device until you reload the cloud copy."
    : localWriteIssue === "existing-recovery"
      ? "A different device recovery already exists for this trip. This change was not saved or synced; open the device copy to resolve it first."
      : localWriteIssue === "preserved-recovery"
        ? "The cloud copy is open. Your different device copy is still preserved until you explicitly resolve or discard it."
        : localWriteIssue === "storage"
          ? "This change was not applied because device storage could not save it. Your existing trip remains unchanged."
          : localWriteIssue === "cache"
            ? "Saved to your account. The device copy could not be updated; try again when device storage is available."
          : syncAuthInterrupted
            ? "Your session expired. This change is still safe on this device."
            : "This change is still safe on this device, but it has not synced to your account.";

  const addBooking = async () => {
    if (!trip || !bookingTitle.trim()) return;
    const identity = tripModeDocumentIdentity;
    const authoredTitle = bookingTitle;
    const authoredDate = bookingDate;
    const authoredUrl = bookingUrl;
    const booking: TripBooking = { id: `${trip.id}-booking-${Date.now()}`, type: bookingType, title: bookingTitle.trim(), date: bookingDate || null, confirmation: null, url: bookingUrl.trim() || null };
    if (!await persist({ ...trip, brief: { ...trip.brief, bookings: [...bookings, booking] } })) return;
    if (!mountedRef.current || currentDocumentIdentityRef.current !== identity) return;
    setBookingTitle((current) => current === authoredTitle ? "" : current);
    setBookingDate((current) => current === authoredDate ? "" : current);
    setBookingUrl((current) => current === authoredUrl ? "" : current);
  };

  const toggleChecklist = (id: string) => {
    if (!trip) return;
    persist({ ...trip, brief: { ...trip.brief, checklist: checklist.map((item) => item.id === id ? { ...item, complete: !item.complete } : item) } });
  };

  if (sessionPending || loading || (trip && (!canUseHydratedTripScope(hydratedOwnerScopeRef.current, visibleOwnerId)
    || hydratedDocumentIdentityRef.current !== tripModeDocumentIdentity))) return <section className={styles.empty} aria-busy="true"><p>TRIP MODE</p><h1>Opening your trip…</h1><span>Checking the current account before showing device-saved details.</span></section>;
  if (readFailed) return <section className={styles.empty}><MorroviaStatusBanner tone="warning" title="Your device copy could not be checked" detail="Device storage could not confirm the saved trip. Try again before starting another trip." actions={<EasyTButton onClick={() => setHydrationRevision((revision) => revision + 1)}>Try again</EasyTButton>} /></section>;
  if (syncAuthInterrupted && !session?.user && trip) return <section className={styles.empty}><p>TRIP MODE</p><h1>Your session ended.</h1><span>Your trip changes are still saved on this device. Sign in again to sync them without creating another trip.</span><EasyTButton onClick={() => window.location.assign(tripSyncSignInPath(trip.id))}>Sign in again</EasyTButton></section>;
  if (!trip) return <section className={styles.empty}><p>TRIP MODE</p><h1>Your trip will live here.</h1><span>Build a route first, then EasyT will keep the useful details close while you travel.</span><Link href="/journey/new">Start a trip <ArrowRight /></Link></section>;

  return <section className={styles.page}>
    {syncError ? <MorroviaStatusBanner className={styles.tripModeNotice} tone="warning" title={syncMessage} actions={<EasyTButton disabled={writePending} size="small" variant="secondary" onClick={syncAction === "reload-cloud" ? reloadCloudCopy : syncAction === "open-device" ? () => window.location.assign(tripSyncRecoveryPath(trip.id)) : syncAction === "sign-in" ? () => window.location.assign(tripSyncSignInPath(trip.id)) : () => persist(trip)}>{syncAction === "reload-cloud" ? "Reload cloud copy" : syncAction === "open-device" ? "Open device copy" : syncAction === "sign-in" ? "Sign in again" : "Try again"}</EasyTButton>} /> : null}
    <header className={styles.hero}><div><p>TRIP MODE</p><h1>{tripDisplayTitle(trip)}</h1><span>{lifecycleLabel(trip.startDate, trip.endDate)}</span></div><Link href={tripHref}>Open map <ArrowRight /></Link></header>
    <nav className={styles.tabs} aria-label="Trip mode sections"><button type="button" className={tab === "today" ? styles.active : ""} onClick={() => setTab("today")}>Today</button><button type="button" className={tab === "bookings" ? styles.active : ""} onClick={() => setTab("bookings")}>Bookings <span>{bookings.length}</span></button><button type="button" className={tab === "ready" ? styles.active : ""} onClick={() => setTab("ready")}>Ready</button></nav>
    {tab === "today" ? tripDay ? <div className={styles.today}><article className={styles.dayCard}><p><CalendarCheck2 /> {dayLabel(tripDay.date)} · Day {tripDay.dayNumber}</p><h2>{tripDay.title}</h2><span>{tripDay.reason}</span><ol>{tripDay.notes.map((note, index) => <li key={`${note}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b>{note}</li>)}</ol></article><div className={styles.quickActions}><Link href={`${tripHref}#finder`}><Utensils /> Find food nearby</Link><Link href={`${tripHref}#finder`}><BedDouble /> Find a stay</Link></div>{(dayNotes.length || pins.length) ? <article className={styles.context}><p>FOR TODAY</p>{dayNotes.length ? <div><ClipboardList /><span>{dayNotes.join(" · ")}</span></div> : null}{pins.map((pin) => <div key={pin.id}><MapPin /><span>{pin.title}</span><small>{pin.category}</small></div>)}</article> : null}</div> : <div className={styles.today}><article className={styles.dayCard}><p><CalendarCheck2 /> TODAY</p><h2>No itinerary item is scheduled for today.</h2><span>Open the map or itinerary to review the plan without treating another day as today.</span></article></div> : null}
    {tab === "bookings" ? <div className={styles.bookings}>
      <header><div><p>KEEP THE IMPORTANT DETAILS</p><h2>Bookings and confirmations</h2></div><span>Stored with this trip</span></header>
      {bookings.length ? <div className={styles.bookingList}>{bookings.map((booking) => <article key={booking.id}><ReceiptText /><div><small>{booking.type}</small><strong>{booking.title}</strong>{booking.date ? <span>{dayLabel(booking.date)}</span> : null}</div>{booking.url ? <a href={booking.url} target="_blank" rel="noreferrer" aria-label={`Open ${booking.title}`}><ExternalLink /></a> : null}</article>)}</div> : <p className={styles.emptyState}>Nothing saved yet. Add only the details you will need when you are moving.</p>}
      <form className={styles.bookingForm} onSubmit={(event) => { event.preventDefault(); addBooking(); }}>
        <select value={bookingType} onChange={(event) => setBookingType(event.target.value as TripBooking["type"])} aria-label="Booking type"><option value="stay">Stay</option><option value="transport">Transport</option><option value="reservation">Reservation</option><option value="other">Other</option></select>
        <input value={bookingTitle} onChange={(event) => setBookingTitle(event.target.value)} placeholder="Hotel, flight, restaurant…" aria-label="Booking name" required />
        <MorroviaDatePicker className={styles.bookingDate} mode="single" size="compact" label="Booking date" value={bookingDate} onChange={setBookingDate} />
        <input type="url" value={bookingUrl} onChange={(event) => setBookingUrl(event.target.value)} placeholder="Confirmation link (optional)" aria-label="Confirmation link" />
        <button type="submit" disabled={writePending}><Plus /> Add booking</button>
      </form>
    </div> : null}
    {tab === "ready" ? <div className={styles.ready}><header><p>TRAVEL CHECKS</p><h2>Keep the essentials covered.</h2><span>{checklist.filter((item) => item.complete).length} of {checklist.length} done</span></header><div>{checklist.map((item) => <button type="button" disabled={writePending} key={item.id} className={item.complete ? styles.complete : ""} onClick={() => toggleChecklist(item.id)}><i>{item.complete ? <Check /> : null}</i><span>{item.label}</span></button>)}</div><aside><strong>Keep this trip available before and during travel.</strong><span>Your current itinerary remains available from this device, even if you lose signal.</span></aside></div> : null}
  </section>;
}
