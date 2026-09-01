"use client";

import { useEffect, useMemo, useState } from "react";
import { BedDouble, CalendarSearch, CheckCircle2, Copy, ExternalLink, MailCheck, Pencil, Plus, Trash2 } from "lucide-react";

import { trackEvent } from "@/lib/analytics";
import { getCurrentPartnerAction, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import {
  candidateSourceLabel,
  destinationCandidateAnalytics,
  destinationStayProvenance,
  destinationStayState,
  maskCanonicalBookingReference,
} from "@/lib/easyt/destination-accommodation";
import type { BookingCandidateView, BookingImportPayload } from "@/lib/easyt/booking-import-view";
import type { StayBookingDraft } from "@/lib/easyt/accommodation";
import type { EasyTTrip, TripStop } from "@/lib/easyt/trip";
import { formatIsoDate } from "@/lib/easyt/trip-lifecycle";
import { affiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton, EasyTField, EasyTLinkButton } from "./easyt-controls";
import { MorroviaConfirmationDialog, MorroviaContextualDisclosure, MorroviaStatusBanner } from "./morrovia-feedback";
import styles from "./destination-accommodation-module.module.css";

type CalendarUiState = "idle" | "checking" | "disconnected" | "unavailable" | "no-match" | "error";

export type DestinationAccommodationStoryState = {
  calendar?: CalendarUiState;
  importError?: boolean;
};

export type DestinationAccommodationModuleProps = {
  trip: EasyTTrip;
  stop: TripStop;
  pending: boolean;
  onSave: (draft: StayBookingDraft) => boolean;
  onRemove: () => boolean;
  onCanonicalTrip?: (trip: EasyTTrip) => boolean;
  initialImportData?: BookingImportPayload;
  affiliateAction?: ResolvedAffiliateAction | null;
  storyState?: DestinationAccommodationStoryState;
};

function dateRange(start: string | null, end: string | null) {
  const startLabel = formatIsoDate(start, "en", { month: "short", day: "numeric" }) ?? "Dates to confirm";
  const endLabel = formatIsoDate(end, "en", { month: "short", day: "numeric" });
  return endLabel ? `${startLabel} – ${endLabel}` : startLabel;
}

function candidateDate(candidate: BookingCandidateView) {
  return dateRange(candidate.startDate, candidate.endDate);
}

function safeExternalUrl(value: string | null) {
  try {
    const parsed = new URL(value ?? "");
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export default function DestinationAccommodationModule({
  trip,
  stop,
  pending,
  onSave,
  onRemove,
  onCanonicalTrip,
  initialImportData,
  affiliateAction,
  storyState,
}: DestinationAccommodationModuleProps) {
  const [imports, setImports] = useState<BookingImportPayload | null>(initialImportData ?? null);
  const [importsLoading, setImportsLoading] = useState(Boolean(trip.ownerId && !initialImportData));
  const [importsError, setImportsError] = useState(Boolean(storyState?.importError));
  const [workingCandidateId, setWorkingCandidateId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [alreadyBookedOpen, setAlreadyBookedOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [calendarState, setCalendarState] = useState<CalendarUiState>(storyState?.calendar ?? "idle");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!trip.ownerId || initialImportData) return;
    let active = true;
    const query = new URLSearchParams({ tripId: trip.id, stopId: stop.id });
    setImportsLoading(true);
    fetch(`/api/easyt/booking-import?${query}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("load_failed");
        return response.json() as Promise<BookingImportPayload>;
      })
      .then((payload) => { if (active) { setImports(payload); setImportsError(false); } })
      .catch(() => { if (active) setImportsError(true); })
      .finally(() => { if (active) setImportsLoading(false); });
    return () => { active = false; };
  }, [initialImportData, stop.id, trip.id, trip.ownerId]);

  const state = useMemo(() => destinationStayState(trip, stop, imports?.candidates ?? []), [imports?.candidates, stop, trip]);
  const booking = state.status === "stay_sorted" ? state.booking : null;
  const action = affiliateAction === undefined
    ? getCurrentPartnerAction("accommodation")
    : affiliateAction;
  const primaryAction = action ? { ...action, cta: "Find a stay" } : null;
  const meta = `${dateRange(state.checkIn, state.checkOut)} · ${state.nights} ${state.nights === 1 ? "night" : "nights"}`;
  const bookingUrl = safeExternalUrl(booking?.url ?? null);
  const reference = maskCanonicalBookingReference(booking?.confirmation ?? null);

  useEffect(() => {
    setTitle(booking?.title ?? "");
    if (!booking) setDetailsOpen(false);
  }, [booking?.id, booking?.title]);

  const submitManual = () => {
    setFormError("");
    if (!title.trim()) {
      setFormError("Enter the property name.");
      return;
    }
    if (!onSave({ title })) {
      setFormError("This stay could not be stored safely.");
      return;
    }
    if (!booking) trackEvent("booking_added_manual", { booking_type: "accommodation", surface: "itinerary" });
    setEditing(false);
    setNotice(booking ? "Stay updated." : "Stay added to this trip.");
  };

  const reviewCandidate = async (candidate: BookingCandidateView, decision: "confirm" | "dismiss") => {
    setWorkingCandidateId(candidate.id);
    setImportsError(false);
    setNotice(null);
    try {
      const response = await fetch(`/api/easyt/booking-import/${encodeURIComponent(candidate.id)}`, decision === "confirm"
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId: trip.id, stopId: stop.id }) }
        : { method: "PATCH" });
      const payload = await response.json() as { trip?: EasyTTrip; error?: string };
      if (!response.ok) throw new Error(payload.error || "review_failed");
      if (decision === "confirm" && payload.trip && onCanonicalTrip && !onCanonicalTrip(payload.trip)) {
        throw new Error("The booking was saved, but this browser has a separate recovery copy. Refresh after resolving it.");
      }
      setImports((current) => current ? {
        ...current,
        candidates: current.candidates.map((item) => item.id === candidate.id
          ? { ...item, status: decision === "confirm" ? "added" : "ignored", canonicalTripId: decision === "confirm" ? trip.id : item.canonicalTripId }
          : item),
      } : current);
      const analytics = destinationCandidateAnalytics(candidate);
      trackEvent(decision === "confirm" ? "booking_candidate_confirmed" : "booking_candidate_dismissed", analytics);
      setNotice(decision === "confirm" ? "Possible stay added to this trip." : "Suggestion dismissed. Your trip was not changed.");
    } catch (error) {
      setImportsError(true);
      setNotice(error instanceof Error ? error.message : "We couldn't save that choice. Your trip is unchanged.");
    } finally {
      setWorkingCandidateId(null);
    }
  };

  const openForwarding = () => {
    setForwardOpen(true);
    setAlreadyBookedOpen(false);
    trackEvent("booking_import_opened", { source: "forwarded_email", booking_type: "accommodation", surface: "itinerary" });
  };

  const createAddress = async () => {
    setAddressBusy(true);
    setImportsError(false);
    try {
      const response = await fetch("/api/easyt/booking-import", { method: "POST" });
      const payload = await response.json() as { address?: string; hint?: string };
      if (!response.ok || !payload.address || !payload.hint) throw new Error("address_failed");
      setAddress(payload.address);
      setImports((current) => current ? { ...current, alias: { hint: payload.hint!, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } : current);
    } catch {
      setImportsError(true);
    } finally {
      setAddressBusy(false);
    }
  };

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setAddressCopied(true);
    } catch {
      setAddressCopied(false);
    }
  };

  const checkCalendar = async () => {
    setAlreadyBookedOpen(false);
    trackEvent("booking_import_opened", { source: "calendar", booking_type: "accommodation", surface: "itinerary" });
    const calendar = imports?.calendar;
    if (!calendar?.available) {
      setCalendarState("unavailable");
      return;
    }
    if (!calendar.connected) {
      setCalendarState("disconnected");
      return;
    }
    setCalendarState("checking");
    try {
      const response = await fetch("/api/easyt/booking-import/calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId: trip.id }),
      });
      const payload = await response.json() as { candidates?: BookingCandidateView[] };
      if (!response.ok) throw new Error("calendar_failed");
      setImports((current) => current ? { ...current, candidates: payload.candidates ?? current.candidates } : current);
      setCalendarState(payload.candidates?.some((candidate) => candidate.match.matches.some((match) => match.stopId === stop.id && match.score >= 7)) ? "idle" : "no-match");
    } catch {
      setCalendarState("error");
    }
  };

  const startManual = () => {
    setTitle(booking?.title ?? "");
    setFormError("");
    setEditing(true);
    setAlreadyBookedOpen(false);
  };

  const statusLabel = state.status === "stay_sorted" ? "YOUR STAY ✓"
    : state.status === "candidate_found" ? "POSSIBLE STAY FOUND"
      : "NEEDS A STAY";
  const heading = state.status === "stay_sorted" ? state.booking.title
    : state.status === "candidate_found" ? state.candidates.length === 1 ? "Possible stay found" : `We found ${state.candidates.length} possible stays`
      : `Stay in ${state.destination}`;

  return <section className={styles.module} data-state={state.status} aria-labelledby={`stay-${stop.id}-title`}>
    <header className={styles.header}>
      <BedDouble aria-hidden="true" />
      <div><small>{statusLabel}</small><h4 id={`stay-${stop.id}-title`}>{heading}</h4><p>{meta}{state.status === "needs_stay" ? ` · ${state.travellers} ${state.travellers === 1 ? "traveller" : "travellers"}` : ""}</p></div>
    </header>

    {notice ? <p className={styles.liveNotice} role="status" aria-live="polite">{notice}</p> : null}

    {state.status === "needs_stay" && !editing ? <>
      <div className={styles.primaryAction}>
        {primaryAction ? <MorroviaAffiliateLink action={primaryAction} context={{ placement: "itinerary_accommodation", tripId: trip.id, stopId: stop.id, workspaceView: "itinerary", destinationCount: 1 }} variant="primary" />
          : <EasyTLinkButton href={`/journey/${encodeURIComponent(trip.id)}/map?stop=${encodeURIComponent(stop.id)}&mode=stay`} icon={BedDouble}>Find a stay</EasyTLinkButton>}
        {primaryAction ? <small>{affiliateDisclosure}</small> : null}
      </div>
      <MorroviaContextualDisclosure
        id={`already-booked-${stop.id}`}
        align="start"
        open={alreadyBookedOpen}
        onOpenChange={setAlreadyBookedOpen}
        triggerLabel="Already booked?"
        title={`Add accommodation in ${stop.name}`}
        detail="Add it manually, check a connected calendar, or forward a confirmation. Nothing is added until you confirm it."
        actions={<div className={styles.secondaryActions}>
          <EasyTButton size="small" variant="secondary" icon={Plus} onClick={startManual}>Add booking</EasyTButton>
          <EasyTButton size="small" variant="quiet" icon={CalendarSearch} disabled={!trip.ownerId || importsLoading} onClick={() => void checkCalendar()}>Check calendar</EasyTButton>
          <EasyTButton size="small" variant="quiet" icon={MailCheck} disabled={!trip.ownerId || importsLoading} onClick={openForwarding}>Forward confirmation</EasyTButton>
          {!trip.ownerId ? <EasyTLinkButton size="small" variant="quiet" href={`/journey/login?returnTo=${encodeURIComponent(`/journey/${trip.id}/itinerary`)}`}>Sign in to import</EasyTLinkButton> : null}
        </div>}
      />
    </> : null}

    {state.status === "candidate_found" ? <div className={styles.candidateList} aria-label="Possible accommodation bookings">
      {state.candidates.map((candidate) => <article className={styles.candidate} key={candidate.id}>
        <div><CheckCircle2 aria-hidden="true" /><span><strong>{candidate.title}</strong><small>{[candidate.location, candidateDate(candidate), candidate.provider].filter(Boolean).join(" · ")}</small><em>{candidateSourceLabel(candidate.sources)} · {candidate.confidence} confidence</em>{candidate.referenceMasked ? <small>Reference {candidate.referenceMasked}</small> : null}</span></div>
        <div className={styles.candidateActions}><EasyTButton size="small" loading={workingCandidateId === candidate.id} disabled={pending} onClick={() => void reviewCandidate(candidate, "confirm")}>Add to trip</EasyTButton><EasyTButton size="small" variant="quiet" disabled={workingCandidateId === candidate.id || pending} onClick={() => void reviewCandidate(candidate, "dismiss")}>Not this</EasyTButton></div>
      </article>)}
    </div> : null}

    {booking && !editing ? <div className={styles.sortedActions}>
      <MorroviaContextualDisclosure
        id={`stay-details-${stop.id}`}
        align="start"
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        triggerLabel="View details"
        title={booking.title}
        detail={`${meta}. ${destinationStayProvenance(booking)}.`}
        actions={<div className={styles.detailsFacts}>
          {booking.importDetails?.provider ? <span><b>Provider</b>{booking.importDetails.provider}</span> : null}
          {reference ? <span><b>Reference</b>{reference}</span> : null}
          {bookingUrl ? <EasyTLinkButton href={bookingUrl} target="_blank" rel="noopener noreferrer" size="small" variant="secondary" icon={ExternalLink}>Open booking</EasyTLinkButton> : null}
        </div>}
      />
      <EasyTButton size="small" variant="quiet" icon={Pencil} onClick={startManual}>Edit</EasyTButton>
    </div> : null}

    {editing ? <form className={styles.form} onSubmit={(event) => { event.preventDefault(); submitManual(); }}>
      <p>For {stop.name} · {meta}</p>
      <EasyTField autoFocus label="Property name" value={title} onChange={(event) => { setTitle(event.target.value); setFormError(""); }} error={formError || undefined} required />
      <div><EasyTButton type="submit" size="small" loading={pending}>{booking ? "Save changes" : "Add booking"}</EasyTButton><EasyTButton size="small" variant="quiet" onClick={() => { setEditing(false); setFormError(""); }}>Cancel</EasyTButton>{booking ? <EasyTButton size="small" variant="danger" icon={Trash2} onClick={() => setConfirmRemove(true)}>Remove</EasyTButton> : null}</div>
    </form> : null}

    {forwardOpen ? <div className={styles.importPanel} role="region" aria-labelledby={`forward-${stop.id}-title`}>
      <div><MailCheck aria-hidden="true" /><span><strong id={`forward-${stop.id}-title`}>Forward a confirmation</strong><p>Forward a hotel, flight or activity confirmation and Morrovia will try to match it to this trip. Nothing is added until you confirm it.</p></span></div>
      {!imports?.configured ? <MorroviaStatusBanner tone="warning" title="Forwarding isn't available yet" detail="The receiving domain and secure webhook must be configured before Morrovia can provide your private address." /> : address ? <div className={styles.addressRow}><EasyTField label="Your private forwarding address" value={address} readOnly /><EasyTButton icon={Copy} variant="secondary" onClick={() => void copyAddress()}>{addressCopied ? "Copied" : "Copy"}</EasyTButton></div> : imports.alias ? <p>Your private address ends in <b>••••{imports.alias.hint}</b>. The complete address is shown only when created. <EasyTLinkButton href="/journey/profile#imported-bookings-title" size="small" variant="quiet">Manage address</EasyTLinkButton></p> : <EasyTButton icon={MailCheck} size="small" variant="secondary" loading={addressBusy} onClick={() => void createAddress()}>Create private address</EasyTButton>}
      <EasyTButton size="small" variant="quiet" onClick={() => setForwardOpen(false)}>Close</EasyTButton>
    </div> : null}

    {calendarState !== "idle" ? <div className={styles.importPanel} role="status" aria-live="polite">
      {calendarState === "checking" ? <MorroviaStatusBanner title="Checking your connected calendar" detail={`Looking only around ${stop.name} and this trip's dates.`} /> : null}
      {calendarState === "no-match" ? <MorroviaStatusBanner title="No bookings found for these dates" detail="Calendar coverage is incomplete. You can still add a booking manually or forward a confirmation." /> : null}
      {calendarState === "error" ? <MorroviaStatusBanner tone="warning" title="Calendar is unavailable" detail="Your trip is unchanged. Try again later or use another way to add the booking." /> : null}
      {calendarState === "disconnected" ? <MorroviaStatusBanner title="Connect Google Calendar" detail="Connect Google Calendar to look for possible travel bookings around this trip's dates." actions={imports?.calendar?.connectHref ? <EasyTLinkButton href={imports.calendar.connectHref} size="small" variant="secondary">Connect Google Calendar</EasyTLinkButton> : undefined} /> : null}
      {calendarState === "unavailable" ? <MorroviaStatusBanner tone="warning" title="Calendar import isn't available yet" detail="Morrovia's current Google sign-in grants identity access only. It does not have permission to read your calendar." /> : null}
      {calendarState !== "checking" ? <EasyTButton size="small" variant="quiet" onClick={() => setCalendarState("idle")}>Close</EasyTButton> : null}
    </div> : null}

    {importsError ? <MorroviaStatusBanner tone="warning" title="Import review is temporarily unavailable" detail="Your saved trip is unchanged. Manual booking and the provider handoff still work." /> : null}

    <MorroviaConfirmationDialog open={confirmRemove} title={`Remove ${booking?.title ?? "this stay"}?`} detail={`This removes the saved accommodation from ${stop.name}. The destination and itinerary days stay unchanged.`} consequences={["Overview, Map and Itinerary will return to Needs a stay unless another saved stay covers these dates."]} cancelLabel="Keep stay" confirmLabel="Remove stay" confirming={pending} onCancel={() => setConfirmRemove(false)} onConfirm={() => { if (onRemove()) { setConfirmRemove(false); setEditing(false); setNotice("Stay removed. This destination needs accommodation again."); } }} />
  </section>;
}
