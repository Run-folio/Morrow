"use client";

import Link from "next/link";
import { ArrowUpRight, BedDouble, Map } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { accommodationDatesReady, accommodationProgress, stayBookingForStop } from "@/lib/easyt/accommodation";
import type { BookingReadinessAction } from "@/lib/easyt/booking-readiness";
import { formatIsoDate } from "@/lib/easyt/trip-lifecycle";
import type { EasyTTrip, TripStop } from "@/lib/easyt/trip";
import styles from "./journey-trip-prep-accommodation.module.css";

function accommodationDateLabel(stop: TripStop) {
  if (!accommodationDatesReady(stop)) return "Dates to confirm";
  const arrival = formatIsoDate(stop.arrivalDate);
  const departure = formatIsoDate(stop.departureDate);
  return arrival && departure ? `${arrival}–${departure}` : "Dates to confirm";
}

export function JourneyTripPrepAccommodation({ trip }: { trip: EasyTTrip }) {
  const [actions, setActions] = useState<BookingReadinessAction[]>([]);
  const progress = useMemo(() => accommodationProgress(trip), [trip]);

  useEffect(() => {
    let active = true;
    void fetch("/api/journey-booking-readiness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trip }) })
      .then(async (response) => response.ok ? response.json() as Promise<{ actions?: BookingReadinessAction[] }> : { actions: [] })
      .then((payload) => { if (active) setActions(payload.actions?.filter((action) => action.category === "accommodation") ?? []); })
      .catch(() => { if (active) setActions([]); });
    return () => { active = false; };
  }, [trip]);

  if (!progress.stops.length) return null;
  return <section className={styles.panel} aria-labelledby="prep-accommodation-title">
    <header><div><p>ACCOMMODATION</p><h2 id="prep-accommodation-title">{progress.sortedCount} of {progress.stops.length} stays sorted</h2><span>{progress.complete ? "All overnight stops have a saved stay in your trip." : "Save a stay for each overnight stop as you make the trip bookable."}</span></div><BedDouble aria-hidden="true" /></header>
    <div className={styles.stays}>{progress.stops.map((stop) => {
      const booking = stayBookingForStop(trip, stop);
      const action = actions.find((item) => item.stopId === stop.id);
      const sorted = Boolean(booking);
      const datesReady = accommodationDatesReady(stop);
      const plannerHref = `/journey/plan?trip=${encodeURIComponent(trip.id)}&stay=${encodeURIComponent(stop.id)}`;
      return <article key={stop.id} className={sorted ? styles.sortedStay : styles.needsStay}>
        <div className={styles.stayHeading}><div><h3>{stop.name}</h3><p>{accommodationDateLabel(stop)} · {stop.nights} {stop.nights === 1 ? "night" : "nights"} · {trip.travellers} {trip.travellers === 1 ? "traveller" : "travellers"}</p></div><strong>{sorted ? "Stay sorted" : "Needs a stay"}</strong></div>
        {sorted ? <p className={styles.savedName}>{booking?.title || "Accommodation saved"}</p> : null}
        <div className={styles.actions}>
          <Link href={plannerHref} onClick={() => trackEvent("accommodation_map_opened", { trip_id: trip.id, stop_id: stop.id })}>{sorted ? "Manage stay" : "Find a stay"}<Map aria-hidden="true" /></Link>
          {!sorted && datesReady && action ? <a href={action.href} target="_blank" rel={action.affiliate ? "sponsored noopener noreferrer" : "noopener noreferrer"} onClick={() => { if (action.affiliate) trackEvent("affiliate_click", { category: "accommodation", provider: action.provider, trip_id: trip.id, stop_id: stop.id, placement: "trip_prep_accommodation", workspace_view: "prep" }); }}>Check availability <ArrowUpRight aria-hidden="true" /></a> : null}
        </div>
      </article>;
    })}</div>
    {actions.some((action) => action.affiliate) ? <p className={styles.disclosure}>Partner link · Morrovia may earn a commission at no extra cost to you.</p> : null}
  </section>;
}
