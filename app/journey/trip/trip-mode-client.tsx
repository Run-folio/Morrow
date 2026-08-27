"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BedDouble, CalendarCheck2, Check, ClipboardList, ExternalLink, MapPin, Plus, ReceiptText, Utensils } from "lucide-react";
import {
  cacheCanonicalTrip,
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
  shouldAllowNewTripNavigation,
  type TripRecoveryHandle,
} from "@/lib/easyt/storage";
import { tripEditorSyncAction, tripSyncRecoveryPath, tripSyncSignInPath } from "@/lib/easyt/trip-continuity";
import { formatIsoDate, isoDateKey, tripLifecycle } from "@/lib/easyt/trip-lifecycle";
import { requestedTripMatch } from "@/lib/easyt/trip-id-resolution";
import type { EasyTTrip, TripBooking, TripChecklistItem } from "@/lib/easyt/trip";
import { mapWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { authClient } from "@/lib/auth-client";
import { EasyTButton } from "@/components/easyt/easyt-controls";
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
  const [trip, setTrip] = useState<EasyTTrip | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [syncConflict, setSyncConflict] = useState<EasyTTrip | null>(null);
  const [syncAuthInterrupted, setSyncAuthInterrupted] = useState(false);
  const [localWriteIssue, setLocalWriteIssue] = useState<"existing-recovery" | "preserved-recovery" | "storage" | null>(null);
  const [tab, setTab] = useState<"today" | "bookings" | "ready">("today");
  const [bookingTitle, setBookingTitle] = useState("");
  const [bookingType, setBookingType] = useState<TripBooking["type"]>("stay");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");

  useEffect(() => {
    let active = true;
    if (sessionPending) return () => { active = false; };
    const id = requestedTripId;
    const ownerId = session?.user?.id ?? null;
    const documentIdentityChanged = previousDocumentIdentityRef.current !== tripModeDocumentIdentity;
    previousDocumentIdentityRef.current = tripModeDocumentIdentity;
    hydratedOwnerScopeRef.current = undefined;
    hydratedDocumentIdentityRef.current = undefined;
    recoveryHandleRef.current = null;
    setTrip(null);
    setLocalWriteIssue(null);
    setSyncError(false);
    setSyncConflict(null);
    setSyncAuthInterrupted(false);
    if (documentIdentityChanged) {
      setBookingTitle("");
      setBookingType("stay");
      setBookingDate("");
      setBookingUrl("");
    }
    const local = id ? loadLocalTrip(id, ownerId) : loadActiveTrip(ownerId);
    const fallback = requestedTripMatch(id ?? local?.id ?? "", local, session?.user?.id);
    const fallbackRecovery = id
      ? loadTripRecovery(id, ownerId)
      : fallback ? loadTripRecovery(fallback.id, ownerId) : null;
    const ownedLocalNeedsAuth = Boolean(local?.ownerId && local.id === (id ?? local.id) && !session?.user);
    const resolveLocal = () => {
      if (!active) return;
      if (fallback) {
        hydratedOwnerScopeRef.current = ownerId;
        hydratedDocumentIdentityRef.current = tripModeDocumentIdentity;
        recoveryHandleRef.current = fallbackRecovery;
        setTrip(fallback);
        setSyncAuthInterrupted(false);
      } else if (ownedLocalNeedsAuth && local) {
        hydratedOwnerScopeRef.current = ownerId;
        hydratedDocumentIdentityRef.current = tripModeDocumentIdentity;
        recoveryHandleRef.current = null;
        setTrip(local);
        setSyncAuthInterrupted(true);
        setSyncError(true);
      } else {
        recoveryHandleRef.current = null;
        setTrip(null);
        setSyncAuthInterrupted(false);
      }
    };
    if (!id) { resolveLocal(); return; }
    void loadTripFromEasyT(id).then((loaded) => {
      if (!active) return;
      const resolved = loaded ?? fallback;
      if (resolved) {
        hydratedOwnerScopeRef.current = loaded ? loaded.ownerId : ownerId;
        hydratedDocumentIdentityRef.current = tripModeDocumentIdentity;
        recoveryHandleRef.current = loaded ? null : fallbackRecovery;
        setTrip(resolved);
        setSyncAuthInterrupted(false);
        setSyncConflict(null);
        if (loaded) {
          cacheCanonicalTrip(loaded);
          setLocalWriteIssue(fallbackRecovery ? "preserved-recovery" : null);
          setSyncError(Boolean(fallbackRecovery));
        } else {
          setSyncError(false);
        }
      } else {
        resolveLocal();
      }
    }).catch(resolveLocal);
    return () => { active = false; };
  }, [params, requestedTripId, session?.user?.id, sessionPending, tripModeDocumentIdentity]);

  const persist = (next: EasyTTrip) => {
    const sessionOwnerId = visibleOwnerId;
    if (!canUseHydratedTripScope(hydratedOwnerScopeRef.current, sessionOwnerId)
      || (next.ownerId && next.ownerId !== sessionOwnerId)) {
      setLocalWriteIssue("existing-recovery");
      setSyncError(true);
      return;
    }
    const previousHandle = recoveryHandleRef.current;
    const replacement = previousHandle?.tripId === next.id ? previousHandle : null;
    const recoveryOwnerId = replacement ? replacement.ownerId : next.ownerId ?? sessionOwnerId;
    const recovery = saveTripRecovery(next, {
      ownerId: recoveryOwnerId,
      replace: replacement ?? undefined,
    });
    setTrip(next);
    setSyncAuthInterrupted(false);
    if (!recovery.stored) {
      if (recovery.blockedByExistingRecovery) recoveryHandleRef.current = null;
      setLocalWriteIssue(recovery.blockedByExistingRecovery ? "existing-recovery" : "storage");
      setSyncError(true);
      return;
    }
    recoveryHandleRef.current = recovery.handle;
    setLocalWriteIssue(null);
    // A new local edit must not erase the explicit cloud-conflict action.
    setSyncError(Boolean(syncConflict));
    void saveTripRecoveryToEasyT(next, recovery.handle)
      .then((saved) => {
        const isCurrentRecovery = sameRecoveryHandle(recoveryHandleRef.current, recovery.handle);
        if (!isCurrentRecovery || visibleOwnerIdRef.current !== sessionOwnerId
          || hydratedOwnerScopeRef.current !== sessionOwnerId) return;
        const cached = cacheCanonicalTrip(saved, recovery.handle);
        const remainingRecovery = loadTripRecovery(saved.id, recovery.handle.ownerId);
        if (!cached.stored || remainingRecovery) {
          recoveryHandleRef.current = null;
          if (cached.stored) setTrip(saved);
          setLocalWriteIssue(remainingRecovery ? "preserved-recovery" : "storage");
          setSyncError(true);
          return;
        }
        recoveryHandleRef.current = null;
        // Do not turn a still-present recovery into a canonical editing view.
        // In particular, a failed cache write during guest promotion leaves
        // the exact guest recovery handle usable for explicit resolution.
        setTrip(saved);
        setSyncError(false);
        setSyncConflict(null);
        setSyncAuthInterrupted(false);
        setLocalWriteIssue(null);
      })
      .catch((error) => {
        const conflict = error instanceof EasyTTripSaveConflictError || error instanceof EasyTTripPromotionConflictError;
        const authInterrupted = error instanceof EasyTTripAuthError;
        markTripRecoveryState(recovery.handle, authInterrupted ? "auth" : conflict ? "conflict" : "network");
        if (!sameRecoveryHandle(recoveryHandleRef.current, recovery.handle)
          || visibleOwnerIdRef.current !== sessionOwnerId
          || hydratedOwnerScopeRef.current !== sessionOwnerId) return;
        if (conflict) {
          setSyncConflict(error.canonicalTrip);
        }
        if (authInterrupted) setSyncAuthInterrupted(true);
        setLocalWriteIssue(null);
        setSyncError(true);
      });
  };

  useEffect(() => {
    const preserveBeforeNewTrip = (event: Event) => {
      if (!trip) return;
      if (!canUseHydratedTripScope(hydratedOwnerScopeRef.current, visibleOwnerId)) {
        event.preventDefault();
        return;
      }
      if (localWriteIssue === "existing-recovery") {
        event.preventDefault();
        return;
      }
      // A clean cloud trip or an already-durable recovery needs no new write.
      if (localWriteIssue !== "storage") return;
      const currentHandle = recoveryHandleRef.current;
      const replacement = currentHandle?.tripId === trip.id ? currentHandle : null;
      const recovery = saveTripRecovery(trip, {
        ownerId: replacement ? replacement.ownerId : trip.ownerId ?? visibleOwnerId,
        replace: replacement ?? undefined,
      });
      if (recovery.stored) {
        recoveryHandleRef.current = recovery.handle;
        setLocalWriteIssue(null);
        return;
      }
      setLocalWriteIssue(recovery.blockedByExistingRecovery ? "existing-recovery" : "storage");
      setSyncError(true);
      if (!shouldAllowNewTripNavigation(recovery)) event.preventDefault();
    };
    window.addEventListener(EASYT_BEFORE_NEW_TRIP_EVENT, preserveBeforeNewTrip);
    return () => window.removeEventListener(EASYT_BEFORE_NEW_TRIP_EVENT, preserveBeforeNewTrip);
  }, [localWriteIssue, trip, visibleOwnerId]);

  const reloadCloudCopy = () => {
    if (!syncConflict) return;
    cacheCanonicalTrip(syncConflict);
    const recoveryAvailable = Boolean(loadTripRecovery(syncConflict.id, visibleOwnerId));
    recoveryHandleRef.current = null;
    setTrip(syncConflict);
    setSyncConflict(null);
    setSyncAuthInterrupted(false);
    setLocalWriteIssue(recoveryAvailable ? "preserved-recovery" : null);
    setSyncError(recoveryAvailable);
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
  const tripHref = trip ? mapWorkspaceHref(trip.id) : "/journey/new";
  const syncAction = tripEditorSyncAction({
    hasCloudConflict: Boolean(syncConflict),
    hasDeviceRecoveryIssue: localWriteIssue === "existing-recovery" || localWriteIssue === "preserved-recovery",
    authInterrupted: syncAuthInterrupted,
  });

  const addBooking = () => {
    if (!trip || !bookingTitle.trim()) return;
    const booking: TripBooking = { id: `${trip.id}-booking-${Date.now()}`, type: bookingType, title: bookingTitle.trim(), date: bookingDate || null, confirmation: null, url: bookingUrl.trim() || null };
    persist({ ...trip, brief: { ...trip.brief, bookings: [...bookings, booking] } });
    setBookingTitle(""); setBookingDate(""); setBookingUrl("");
  };

  const toggleChecklist = (id: string) => {
    if (!trip) return;
    persist({ ...trip, brief: { ...trip.brief, checklist: checklist.map((item) => item.id === id ? { ...item, complete: !item.complete } : item) } });
  };

  if (sessionPending || (trip && (!canUseHydratedTripScope(hydratedOwnerScopeRef.current, visibleOwnerId)
    || hydratedDocumentIdentityRef.current !== tripModeDocumentIdentity))) return <section className={styles.empty} aria-busy="true"><p>TRIP MODE</p><h1>Opening your trip…</h1><span>Checking the current account before showing device-saved details.</span></section>;
  if (syncAuthInterrupted && !session?.user && trip) return <section className={styles.empty}><p>TRIP MODE</p><h1>Your session ended.</h1><span>Your trip changes are still saved on this device. Sign in again to sync them without creating another trip.</span><EasyTButton onClick={() => window.location.assign(tripSyncSignInPath(trip.id))}>Sign in again</EasyTButton></section>;
  if (!trip) return <section className={styles.empty}><p>TRIP MODE</p><h1>Your trip will live here.</h1><span>Build a route first, then EasyT will keep the useful details close while you travel.</span><Link href="/journey/new">Start a trip <ArrowRight /></Link></section>;

  return <section className={styles.page}>
    {syncError ? <aside className={styles.syncNotice} role="alert"><span>{syncConflict ? "This trip changed on another device. Your edit remains on this device until you reload the cloud copy." : localWriteIssue === "existing-recovery" ? "A different device recovery already exists for this trip. This change was not saved or synced; open the device copy to resolve it first." : localWriteIssue === "preserved-recovery" ? "The cloud copy is open. Your different device copy is still preserved until you explicitly resolve or discard it." : localWriteIssue === "storage" ? "This change is only in this open tab. Browser storage could not save it, so it was not synced." : syncAuthInterrupted ? "Your session expired. This change is still safe on this device." : "This change is still safe on this device, but it has not synced to your account."}</span><EasyTButton size="small" variant="secondary" onClick={syncAction === "reload-cloud" ? reloadCloudCopy : syncAction === "open-device" ? () => window.location.assign(tripSyncRecoveryPath(trip.id)) : syncAction === "sign-in" ? () => window.location.assign(tripSyncSignInPath(trip.id)) : () => persist(trip)}>{syncAction === "reload-cloud" ? "Reload cloud copy" : syncAction === "open-device" ? "Open device copy" : syncAction === "sign-in" ? "Sign in again" : "Try again"}</EasyTButton></aside> : null}
    <header className={styles.hero}><div><p>TRIP MODE</p><h1>{trip.title}</h1><span>{lifecycleLabel(trip.startDate, trip.endDate)}</span></div><Link href={tripHref}>Open map <ArrowRight /></Link></header>
    <nav className={styles.tabs} aria-label="Trip mode sections"><button type="button" className={tab === "today" ? styles.active : ""} onClick={() => setTab("today")}>Today</button><button type="button" className={tab === "bookings" ? styles.active : ""} onClick={() => setTab("bookings")}>Bookings <span>{bookings.length}</span></button><button type="button" className={tab === "ready" ? styles.active : ""} onClick={() => setTab("ready")}>Ready</button></nav>
    {tab === "today" ? tripDay ? <div className={styles.today}><article className={styles.dayCard}><p><CalendarCheck2 /> {dayLabel(tripDay.date)} · Day {tripDay.dayNumber}</p><h2>{tripDay.title}</h2><span>{tripDay.reason}</span><ol>{tripDay.notes.map((note, index) => <li key={`${note}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b>{note}</li>)}</ol></article><div className={styles.quickActions}><Link href={`${tripHref}#finder`}><Utensils /> Find food nearby</Link><Link href={`${tripHref}#finder`}><BedDouble /> Find a stay</Link></div>{(dayNotes.length || pins.length) ? <article className={styles.context}><p>FOR TODAY</p>{dayNotes.length ? <div><ClipboardList /><span>{dayNotes.join(" · ")}</span></div> : null}{pins.map((pin) => <div key={pin.id}><MapPin /><span>{pin.title}</span><small>{pin.category}</small></div>)}</article> : null}</div> : <div className={styles.today}><article className={styles.dayCard}><p><CalendarCheck2 /> TODAY</p><h2>No itinerary item is scheduled for today.</h2><span>Open the map or itinerary to review the plan without treating another day as today.</span></article></div> : null}
    {tab === "bookings" ? <div className={styles.bookings}><header><div><p>KEEP THE IMPORTANT DETAILS</p><h2>Bookings and confirmations</h2></div><span>Stored with this trip</span></header>{bookings.length ? <div className={styles.bookingList}>{bookings.map((booking) => <article key={booking.id}><ReceiptText /><div><small>{booking.type}</small><strong>{booking.title}</strong>{booking.date ? <span>{dayLabel(booking.date)}</span> : null}</div>{booking.url ? <a href={booking.url} target="_blank" rel="noreferrer" aria-label={`Open ${booking.title}`}><ExternalLink /></a> : null}</article>)}</div> : <p className={styles.emptyState}>Nothing saved yet. Add only the details you will need when you are moving.</p>}<form className={styles.bookingForm} onSubmit={(event) => { event.preventDefault(); addBooking(); }}><select value={bookingType} onChange={(event) => setBookingType(event.target.value as TripBooking["type"])} aria-label="Booking type"><option value="stay">Stay</option><option value="transport">Transport</option><option value="reservation">Reservation</option><option value="other">Other</option></select><input value={bookingTitle} onChange={(event) => setBookingTitle(event.target.value)} placeholder="Hotel, flight, restaurant…" aria-label="Booking name" required /><input type="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} aria-label="Booking date" /><input type="url" value={bookingUrl} onChange={(event) => setBookingUrl(event.target.value)} placeholder="Confirmation link (optional)" aria-label="Confirmation link" /><button type="submit"><Plus /> Add booking</button></form></div> : null}
    {tab === "ready" ? <div className={styles.ready}><header><p>TRAVEL CHECKS</p><h2>Keep the essentials covered.</h2><span>{checklist.filter((item) => item.complete).length} of {checklist.length} done</span></header><div>{checklist.map((item) => <button type="button" key={item.id} className={item.complete ? styles.complete : ""} onClick={() => toggleChecklist(item.id)}><i>{item.complete ? <Check /> : null}</i><span>{item.label}</span></button>)}</div><aside><strong>Keep this trip available before and during travel.</strong><span>Your current itinerary remains available from this device, even if you lose signal.</span></aside></div> : null}
  </section>;
}
