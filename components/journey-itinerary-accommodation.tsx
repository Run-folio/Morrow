"use client";

import { ArrowUpRight, BedDouble, Map } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { BookingReadinessAction } from "@/lib/easyt/booking-readiness";
import type { EasyTTrip, TripStop } from "@/lib/easyt/trip";
import styles from "./journey-itinerary-accommodation.module.css";

const dateLabel = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));

function stayIsSorted(trip: EasyTTrip, stop: TripStop) {
  return (trip.brief.bookings ?? []).some((booking) => booking.type === "stay" && (
    (booking.date !== null && booking.date >= (stop.arrivalDate ?? "") && booking.date < (stop.departureDate ?? ""))
    || booking.title.toLowerCase().includes(stop.name.toLowerCase())
  ));
}

export function JourneyItineraryAccommodation({ trip, currentStopId, onExploreMap }: { trip: EasyTTrip; currentStopId: string; onExploreMap: () => void }) {
  const [actions, setActions] = useState<BookingReadinessAction[]>([]);
  const overnightStops = useMemo(() => trip.stops.filter((stop) => (stop.nights ?? 0) > 0 && stop.arrivalDate && stop.departureDate), [trip.stops]);
  const sortedCount = overnightStops.filter((stop) => stayIsSorted(trip, stop)).length;
  const currentStop = overnightStops.find((stop) => stop.id === currentStopId);
  const currentAction = actions.find((action) => action.category === "accommodation" && action.stopId === currentStopId);

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
  const currentSorted = currentStop ? stayIsSorted(trip, currentStop) : false;

  return <section className={styles.panel} aria-labelledby="itinerary-accommodation-title">
    <header><div><p>ACCOMMODATION</p><h3 id="itinerary-accommodation-title">{sortedCount} of {overnightStops.length} stays sorted</h3></div><BedDouble aria-hidden="true" /></header>
    <details className={styles.stayList}>
      <summary>See stays by destination</summary>
      <ul>{overnightStops.map((stop) => <li key={stop.id}><span><b>{stop.name}</b><small>{dateLabel(stop.arrivalDate!)}–{dateLabel(stop.departureDate!)} · {stop.nights} {stop.nights === 1 ? "night" : "nights"}</small></span><em>{stayIsSorted(trip, stop) ? "Sorted" : "Needs a stay"}</em></li>)}</ul>
    </details>
    {currentStop ? <div className={styles.currentStay}>
      <p>{currentStop.name} · {dateLabel(currentStop.arrivalDate!)}–{dateLabel(currentStop.departureDate!)} · {currentStop.nights} {currentStop.nights === 1 ? "night" : "nights"}</p>
      {currentSorted ? <strong>Accommodation sorted</strong> : <><strong>Find a stay for this stop</strong><span>{trip.travellers} {trip.travellers === 1 ? "traveller" : "travellers"} · availability and final prices are confirmed by Booking.com.</span><div>{currentAction ? <a href={currentAction.href} target="_blank" rel={currentAction.affiliate ? "noreferrer sponsored" : "noreferrer"} onClick={() => trackEvent("affiliate_click", { category: "accommodation", provider: currentAction.provider, trip_id: trip.id, stop_id: currentStop.id })}>Find a stay <ArrowUpRight /></a> : <span className={styles.loading}>Preparing stay search…</span>}<button type="button" onClick={() => { trackEvent("accommodation_map_opened", { trip_id: trip.id, stop_id: currentStop.id }); onExploreMap(); }}>Explore on map <Map /></button></div></>}
    </div> : null}
    {actions.some((action) => action.affiliate) ? <small className={styles.disclosure}>Partner link · Morrovia may earn a commission at no extra cost to you.</small> : null}
  </section>;
}
