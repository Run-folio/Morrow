"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BedDouble, CalendarCheck2, Check, ClipboardList, ExternalLink, MapPin, Plus, ReceiptText, Utensils } from "lucide-react";
import { EasyTTripPromotionConflictError, EasyTTripSaveConflictError, loadActiveTrip, loadTripFromEasyT, saveActiveTrip, saveTripToEasyT } from "@/lib/easyt/storage";
import { requestedTripMatch } from "@/lib/easyt/trip-id-resolution";
import type { EasyTTrip, TripBooking, TripChecklistItem } from "@/lib/easyt/trip";
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
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function daysUntil(date: string) {
  const start = new Date(`${date}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((start - today.getTime()) / 86400000);
}

export default function TripModeClient() {
  const params = useSearchParams();
  const { data: session } = authClient.useSession();
  const [trip, setTrip] = useState<EasyTTrip | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [syncConflict, setSyncConflict] = useState<EasyTTrip | null>(null);
  const [tab, setTab] = useState<"today" | "bookings" | "ready">("today");
  const [bookingTitle, setBookingTitle] = useState("");
  const [bookingType, setBookingType] = useState<TripBooking["type"]>("stay");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");

  useEffect(() => {
    const id = params.get("trip");
    const local = loadActiveTrip();
    const fallback = requestedTripMatch(id ?? local?.id ?? "", local, session?.user?.id);
    if (!id) { setTrip(fallback); return; }
    void loadTripFromEasyT(id).then((loaded) => {
      const resolved = loaded ?? fallback;
      setTrip(resolved);
      if (loaded) saveActiveTrip(loaded);
    }).catch(() => setTrip(fallback));
  }, [params, session?.user?.id]);

  const persist = (next: EasyTTrip) => {
    setTrip(next);
    setSyncError(false);
    setSyncConflict(null);
    saveActiveTrip(next);
    void saveTripToEasyT(next)
      .then((saved) => { saveActiveTrip(saved); setTrip(saved); })
      .catch((error) => {
        if (error instanceof EasyTTripSaveConflictError || error instanceof EasyTTripPromotionConflictError) {
          setSyncConflict(error.canonicalTrip);
        }
        setSyncError(true);
      });
  };

  const reloadCloudCopy = () => {
    if (!syncConflict) return;
    saveActiveTrip(syncConflict);
    setTrip(syncConflict);
    setSyncConflict(null);
    setSyncError(false);
  };

  const tripDay = useMemo(() => {
    if (!trip) return null;
    const today = new Date().toISOString().slice(0, 10);
    return trip.planItems.find((item) => item.date === today) ?? trip.planItems[0] ?? null;
  }, [trip]);
  const checklist = trip?.brief.checklist?.length ? trip.brief.checklist : defaultChecklist();
  const bookings = trip?.brief.bookings ?? [];
  const dayNotes = tripDay && trip ? trip.brief.dayNotes?.[tripDay.dayNumber] ?? [] : [];
  const pins = tripDay && trip ? trip.brief.mapPins?.filter((pin) => pin.dayNumber === tripDay.dayNumber) ?? [] : [];
  const countdown = trip ? daysUntil(trip.startDate) : 0;
  const tripHref = trip ? `/journey/plan?trip=${encodeURIComponent(trip.id)}` : "/journey/new";

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

  if (!trip) return <section className={styles.empty}><p>TRIP MODE</p><h1>Your trip will live here.</h1><span>Build a route first, then EasyT will keep the useful details close while you travel.</span><Link href="/journey/new">Start a trip <ArrowRight /></Link></section>;

  return <section className={styles.page}>
    {syncError ? <aside className={styles.syncNotice} role="alert"><span>{syncConflict ? "This trip changed on another device. Your edit remains on this device until you reload the cloud copy." : "This change is still safe on this device, but it has not synced to your account."}</span><EasyTButton size="small" variant="secondary" onClick={syncConflict ? reloadCloudCopy : () => persist(trip)}>{syncConflict ? "Reload cloud copy" : "Try again"}</EasyTButton></aside> : null}
    <header className={styles.hero}><div><p>TRIP MODE</p><h1>{trip.title}</h1><span>{countdown > 0 ? `${countdown} days until departure` : countdown === 0 ? "Your trip starts today" : "Your trip is underway"}</span></div><Link href={tripHref}>Open map <ArrowRight /></Link></header>
    <nav className={styles.tabs} aria-label="Trip mode sections"><button type="button" className={tab === "today" ? styles.active : ""} onClick={() => setTab("today")}>Today</button><button type="button" className={tab === "bookings" ? styles.active : ""} onClick={() => setTab("bookings")}>Bookings <span>{bookings.length}</span></button><button type="button" className={tab === "ready" ? styles.active : ""} onClick={() => setTab("ready")}>Ready</button></nav>
    {tab === "today" && tripDay ? <div className={styles.today}><article className={styles.dayCard}><p><CalendarCheck2 /> {dayLabel(tripDay.date)} · Day {tripDay.dayNumber}</p><h2>{tripDay.title}</h2><span>{tripDay.reason}</span><ol>{tripDay.notes.map((note, index) => <li key={`${note}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b>{note}</li>)}</ol></article><div className={styles.quickActions}><Link href={`${tripHref}#finder`}><Utensils /> Find food nearby</Link><Link href={`${tripHref}#finder`}><BedDouble /> Find a stay</Link></div>{(dayNotes.length || pins.length) ? <article className={styles.context}><p>FOR TODAY</p>{dayNotes.length ? <div><ClipboardList /><span>{dayNotes.join(" · ")}</span></div> : null}{pins.map((pin) => <div key={pin.id}><MapPin /><span>{pin.title}</span><small>{pin.category}</small></div>)}</article> : null}</div> : null}
    {tab === "bookings" ? <div className={styles.bookings}><header><div><p>KEEP THE IMPORTANT DETAILS</p><h2>Bookings and confirmations</h2></div><span>Stored with this trip</span></header>{bookings.length ? <div className={styles.bookingList}>{bookings.map((booking) => <article key={booking.id}><ReceiptText /><div><small>{booking.type}</small><strong>{booking.title}</strong>{booking.date ? <span>{dayLabel(booking.date)}</span> : null}</div>{booking.url ? <a href={booking.url} target="_blank" rel="noreferrer" aria-label={`Open ${booking.title}`}><ExternalLink /></a> : null}</article>)}</div> : <p className={styles.emptyState}>Nothing saved yet. Add only the details you will need when you are moving.</p>}<form className={styles.bookingForm} onSubmit={(event) => { event.preventDefault(); addBooking(); }}><select value={bookingType} onChange={(event) => setBookingType(event.target.value as TripBooking["type"])} aria-label="Booking type"><option value="stay">Stay</option><option value="transport">Transport</option><option value="reservation">Reservation</option><option value="other">Other</option></select><input value={bookingTitle} onChange={(event) => setBookingTitle(event.target.value)} placeholder="Hotel, flight, restaurant…" aria-label="Booking name" required /><input type="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} aria-label="Booking date" /><input type="url" value={bookingUrl} onChange={(event) => setBookingUrl(event.target.value)} placeholder="Confirmation link (optional)" aria-label="Confirmation link" /><button type="submit"><Plus /> Add booking</button></form></div> : null}
    {tab === "ready" ? <div className={styles.ready}><header><p>BEFORE YOU GO</p><h2>Leave with the essentials covered.</h2><span>{checklist.filter((item) => item.complete).length} of {checklist.length} done</span></header><div>{checklist.map((item) => <button type="button" key={item.id} className={item.complete ? styles.complete : ""} onClick={() => toggleChecklist(item.id)}><i>{item.complete ? <Check /> : null}</i><span>{item.label}</span></button>)}</div><aside><strong>EasyT works best when you open this trip before you leave.</strong><span>Your current itinerary remains available from this device, even if you lose signal.</span></aside></div> : null}
  </section>;
}
