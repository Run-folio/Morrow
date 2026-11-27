"use client";

import { useState } from "react";
import type { EasyTTrip, TripStop } from "@/lib/easyt/trip";
import { manualStayVisitKey, recordBookedStayForVisit, stayBookingForStop } from "@/lib/easyt/accommodation";
import { EasyTButton, EasyTField, EasyTLinkButton } from "./easyt-controls";
import { useTripShellMutation } from "./trip-shell-client";
import { MorroviaStatusBanner } from "./morrovia-feedback";
import styles from "./stay22-tester-preview.module.css";

/** The traveller supplies the name. Opening/closing a partner page never writes to a trip. */
export default function Stay22BookedStay({trip, stop}: {trip: EasyTTrip; stop: TripStop}) {
  const mutation = useTripShellMutation();
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const visit = manualStayVisitKey(trip, stop.id);
  const itinerary = `/journey/${encodeURIComponent(trip.id)}/itinerary`;
  const exact = trip.brief.bookings?.find(item => item.id === `stay-${stop.id}` && item.type === "stay");
  if (exact || stayBookingForStop(trip, stop) || trip.brief.bookings?.some(item => item.id === `stay-${stop.id}`)) {
    const unsettled = mutation.saveState === "saving" || mutation.saveState === "error";
    return <MorroviaStatusBanner tone={exact && !unsettled ? "success" : "info"}
      title={exact ? `${unsettled ? "Stay" : "Saved stay"}: ${exact.title}` : "Review the existing itinerary entry"}
      detail={mutation.error || (unsettled ? "Trip changes have not finished saving." : exact ? undefined : "An existing entry may belong to this stop. Review it rather than replacing it.")}
      actions={<EasyTLinkButton size="small" variant="secondary" href={itinerary}>Manage in itinerary</EasyTLinkButton>} />;
  }
  if (!visit) return null;
  return <details className={styles.booking}>
    <summary>Add a booked stay to {stop.name}</summary>
    <form className={styles.bookingForm} onSubmit={async event => {
      event.preventDefault();
      if (submitting || !title.trim() || !mutation.mutationReady || mutation.hasPendingSaves()) return;
      setSubmitting(true); setFailed(false);
      try {
        const changed = await mutation.mutateTrip(current => recordBookedStayForVisit(current, stop.id, visit, title), `record-stay-${stop.id}`);
        if (!changed) setFailed(true);
      } catch { setFailed(true); }
      finally { setSubmitting(false); }
    }}>
      <p>Already booked? Enter the property name to add it to this stop. Browsing or opening a booking site does not save anything to Morrovia.</p>
      <EasyTField label="Property name" value={title} onChange={event => setTitle(event.target.value)} maxLength={160} required disabled={submitting} />
      <EasyTButton type="submit" size="small" loading={submitting} disabled={!title.trim() || !mutation.mutationReady || mutation.hasPendingSaves() || submitting}>Save booked stay</EasyTButton>
      {failed || mutation.error ? <p role="status">{mutation.error || "Couldn’t record the stay. Check this stop and try again."}</p> : null}
    </form>
  </details>;
}
