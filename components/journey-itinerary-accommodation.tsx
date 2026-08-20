"use client";

import { ArrowUpRight, BedDouble, Map } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { BookingReadinessAction } from "@/lib/easyt/booking-readiness";
import type { EasyTTrip, TripBooking, TripStop } from "@/lib/easyt/trip";
import styles from "./journey-itinerary-accommodation.module.css";

const dateLabel = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));

function stayBookingForStop(trip: EasyTTrip, stop: TripStop): TripBooking | undefined {
  return (trip.brief.bookings ?? []).find((booking) => booking.type === "stay" && (
    booking.id === `stay-${stop.id}`
    || (booking.date !== null && booking.date >= (stop.arrivalDate ?? "") && booking.date < (stop.departureDate ?? ""))
    || booking.title.toLowerCase().includes(stop.name.toLowerCase())
  ));
}

export function JourneyItineraryAccommodation({ trip, currentStopId, onExploreMap }: { trip: EasyTTrip; currentStopId: string; onExploreMap: (stop: TripStop) => void }) {
  const [actions, setActions] = useState<BookingReadinessAction[]>([]);
  const overnightStops = useMemo(() => trip.stops.filter((stop) => (stop.nights ?? 0) > 0 && stop.arrivalDate && stop.departureDate), [trip.stops]);
  const sortedCount = overnightStops.filter((stop) => Boolean(stayBookingForStop(trip, stop))).length;

  useEffect(() => {
    let active = true;
    void fetch("/api/journey-booking-readiness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trip }) })
      .then(async (response) => response.ok ? response.json() as Promise<{ actions?: BookingReadinessAction[] }> : { actions: [] })
      .then((payload) => { if (active) setActions(payload.actions?.filter((action) => action.category === "accommodation") ?? []); })
      .catch(() => { if (active) setActions([]); });
    return () => { active = false; };
  }, [trip]);

  useEffect(() => {
    const key = `morrovia:accommodation-viewed:${trip.id}:${currentStopId}`;
    if (sessionStorage.getItem(key)) return;
    trackEvent("accommodation_action_viewed", { trip_id: trip.id, stop_id: currentStopId, sorted_count: sortedCount, stay_count: overnightStops.length });
    sessionStorage.setItem(key, "1");
  }, [currentStopId, overnightStops.length, sortedCount, trip.id]);

  if (!overnightStops.length) return null;
  return <section className={styles.panel} aria-labelledby="itinerary-accommodation-title">
    <header><div><p>ACCOMMODATION</p><h3 id="itinerary-accommodation-title">{sortedCount} of {overnightStops.length} stays sorted</h3></div><BedDouble aria-hidden="true" /></header>
    <div className={styles.stayList}>
      {overnightStops.map((stop) => {
        const booking = stayBookingForStop(trip, stop);
        const action = actions.find((item) => item.category === "accommodation" && item.stopId === stop.id);
        const sorted = Boolean(booking);
        return <article key={stop.id} className={styles.stay}>
          <div className={styles.stayHeader}>
            <div><strong>{stop.name}</strong><small>{dateLabel(stop.arrivalDate!)}–{dateLabel(stop.departureDate!)} · {stop.nights} {stop.nights === 1 ? "night" : "nights"} · {trip.travellers} {trip.travellers === 1 ? "traveller" : "travellers"}</small></div>
            <em className={sorted ? styles.sorted : styles.needsStay}>{sorted ? "Stay sorted" : "Needs a stay"}</em>
          </div>
          {sorted ? <><span className={styles.savedStay}>{booking?.title ?? "Accommodation saved"}</span><div className={styles.stayActions}><button type="button" onClick={() => { trackEvent("accommodation_map_opened", { trip_id: trip.id, stop_id: stop.id }); onExploreMap(stop); }}>Manage stay <Map /></button></div></> : <div className={styles.stayActions}>
            <button type="button" className={styles.findStay} onClick={() => { trackEvent("accommodation_map_opened", { trip_id: trip.id, stop_id: stop.id }); onExploreMap(stop); }}>Find a stay <Map /></button>
            {action ? <a href={action.href} target="_blank" rel={action.affiliate ? "noreferrer sponsored" : "noreferrer"} onClick={() => trackEvent("affiliate_click", { category: "accommodation", provider: action.provider, trip_id: trip.id, stop_id: stop.id })}>Check availability <ArrowUpRight /></a> : null}
          </div>}
        </article>;
      })}
    </div>
    {actions.some((action) => action.affiliate) ? <small className={styles.disclosure}>Partner link · Morrovia may earn a commission at no extra cost to you.</small> : null}
  </section>;
}
