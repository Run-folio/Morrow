import { tripHealth } from "./review.ts";
import type { EasyTTrip, TripLeg, TripStop } from "./trip.ts";

export type BookingCategory = "accommodation" | "flight" | "activity" | "car-rental" | "connectivity" | "ground-transport";
export type BookingReadinessAction = {
  id: string;
  category: BookingCategory;
  provider: string;
  title: string;
  detail: string;
  cta: string;
  href: string;
  tripId: string;
  stopId?: string;
  affiliate: boolean;
  livePrice: boolean;
};

export type AffiliateConfiguration = {
  bookingUrl?: string;
  activitiesUrl?: string;
  carHireUrl?: string;
  sailyUrl?: string;
  groundTransportUrl?: string;
};

const withParams = (base: string, params: Record<string, string | undefined>) => {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  return url.toString();
};

const stopDatesAreStable = (stop: TripStop, trip: EasyTTrip) => Boolean(
  stop.arrivalDate && stop.departureDate
  && stop.arrivalDate >= trip.startDate
  && stop.departureDate <= new Date(+new Date(`${trip.endDate}T00:00:00`) + 86400000).toISOString().slice(0, 10)
  && !(trip.brief.cascadeStatus?.conflicts ?? []).some((conflict) => conflict.includes(stop.name)),
);

const selectedDecision = (trip: EasyTTrip, leg: TripLeg) => trip.brief.decisionSelections?.transportByLeg[leg.id];

/**
 * Builds next actions from stable itinerary facts. URLs and providers are kept
 * here so UI components never need partner-specific query construction.
 */
export function buildBookingReadiness(trip: EasyTTrip, config: AffiliateConfiguration = {}): BookingReadinessAction[] {
  const actions: BookingReadinessAction[] = [];
  const health = tripHealth(trip);
  const stableStops = trip.stops.filter((stop) => stopDatesAreStable(stop, trip));

  stableStops.forEach((stop) => {
    const bookingBase = config.bookingUrl || "https://www.booking.com/searchresults.html";
    actions.push({
      id: `stay-${stop.id}`, category: "accommodation", provider: "booking.com", title: `Find a stay in ${stop.name}`,
      detail: `${stop.arrivalDate} to ${stop.departureDate} · ${trip.travellers} traveller${trip.travellers === 1 ? "" : "s"}. Availability and prices are confirmed by the provider.`,
      cta: "Check availability", href: withParams(bookingBase, { ss: `${stop.name}, ${stop.country}`, checkin: stop.arrivalDate ?? undefined, checkout: stop.departureDate ?? undefined, group_adults: String(trip.travellers), no_rooms: "1" }),
      tripId: trip.id, stopId: stop.id, affiliate: Boolean(config.bookingUrl), livePrice: false,
    });
    const selectedActivities = trip.brief.selectedPlaces[stop.id] ?? [];
    if ((stop.nights ?? 0) >= 2 && selectedActivities.length) {
      const activityBase = config.activitiesUrl || "https://www.google.com/search";
      actions.push({
        id: `activity-${stop.id}`, category: "activity", provider: config.activitiesUrl ? "activities-partner" : "google", title: `Check major activities in ${stop.name}`,
        detail: `${selectedActivities.slice(0, 2).join(" · ")}${selectedActivities.length > 2 ? ` · +${selectedActivities.length - 2} more` : ""}. Check dates, opening days and cancellation terms before booking.`,
        cta: "Check options", href: withParams(activityBase, config.activitiesUrl ? { destination: stop.name, from: stop.arrivalDate ?? undefined, to: stop.departureDate ?? undefined } : { q: `${selectedActivities[0]} ${stop.name} official tickets` }),
        tripId: trip.id, stopId: stop.id, affiliate: Boolean(config.activitiesUrl), livePrice: false,
      });
    }
  });

  const first = [...trip.stops].sort((a, b) => a.order - b.order)[0];
  const last = [...trip.stops].sort((a, b) => a.order - b.order).at(-1);
  if (first && last && trip.brief.origin && trip.startDate && trip.endDate && health.blockingCount === 0) {
    const openJaw = first.id !== last.id;
    actions.push({
      id: "trip-flights", category: "flight", provider: "google-flights", title: openJaw ? "Check an open-jaw flight" : "Check return flights",
      detail: `${trip.brief.origin} → ${first.name}${openJaw ? `, returning from ${last.name}` : ""}. Dates are carried into the search; fares remain live on the provider.`,
      cta: "Check flights", href: withParams("https://www.google.com/travel/flights", { q: `Flights from ${trip.brief.origin} to ${first.name} on ${trip.startDate}${openJaw ? ` returning from ${last.name}` : " returning"} on ${trip.endDate}` }),
      tripId: trip.id, affiliate: false, livePrice: false,
    });
  }

  const roadLeg = trip.legs.find((leg) => leg.mode === "road" && (leg.distanceKm ?? 0) >= 120 && Boolean(selectedDecision(trip, leg)));
  const routeCallsForCar = Boolean(roadLeg && (trip.brief.intent?.preferences.transportModes.includes("drive") || selectedDecision(trip, roadLeg) === "simplest"));
  if (roadLeg && routeCallsForCar && !trip.brief.intent?.hardConstraints.avoidDriving) {
    const from = trip.stops.find((stop) => stop.id === roadLeg.fromStopId);
    const to = trip.stops.find((stop) => stop.id === roadLeg.toStopId);
    const carBase = config.carHireUrl || "https://www.google.com/search";
    actions.push({
      id: `car-${roadLeg.id}`, category: "car-rental", provider: config.carHireUrl ? "car-hire-partner" : "google", title: `Compare car hire${from ? ` from ${from.name}` : ""}`,
      detail: `${from?.name ?? "Pickup"} → ${to?.name ?? "drop-off"}. Check one-way fees, cross-border permission, insurance and licence rules.`,
      cta: "Compare car hire", href: withParams(carBase, config.carHireUrl ? { pickup: from?.name, dropoff: to?.name, pickup_date: from?.departureDate ?? undefined, dropoff_date: to?.arrivalDate ?? undefined } : { q: `car hire ${from?.name ?? ""} to ${to?.name ?? ""}` }),
      tripId: trip.id, stopId: from?.id, affiliate: Boolean(config.carHireUrl), livePrice: false,
    });
  }

  if (config.groundTransportUrl) trip.legs.filter((leg) => ["train", "ferry", "road"].includes(leg.mode) && (leg.distanceKm ?? 0) >= 120 && Boolean(selectedDecision(trip, leg))).forEach((leg) => {
    const from = trip.stops.find((stop) => stop.id === leg.fromStopId);
    const to = trip.stops.find((stop) => stop.id === leg.toStopId);
    if (!from || !to) return;
    const groundBase = config.groundTransportUrl!;
    actions.push({
      id: `ground-${leg.id}`, category: "ground-transport", provider: config.groundTransportUrl ? "ground-transport-partner" : "google", title: `Check ${from.name} → ${to.name}`,
      detail: `${leg.mode} selected · ${leg.durationMinutes ? `about ${Math.floor(leg.durationMinutes / 60)}h ${leg.durationMinutes % 60}m planning time` : "duration to verify"}. Confirm the actual service before booking stays around it.`,
      cta: "Check connections", href: withParams(groundBase, { from: from.name, to: to.name, date: from.departureDate ?? undefined }),
      tripId: trip.id, stopId: to.id, affiliate: true, livePrice: false,
    });
  });

  const countries = [...new Set(trip.stops.map((stop) => stop.country).filter(Boolean))];
  if (countries.length > 1 || (countries[0] && !trip.brief.origin.toLowerCase().includes(countries[0].toLowerCase()))) {
    const sailyBase = config.sailyUrl || "https://saily.com/";
    actions.push({
      id: "trip-connectivity", category: "connectivity", provider: "saily", title: "Set up trip connectivity",
      detail: `Coverage for ${countries.join(" · ")}. Compare data amounts and validity on Saily before purchasing.`, cta: "Check eSIM coverage",
      href: withParams(sailyBase, { destination: countries.join(",") }), tripId: trip.id, affiliate: Boolean(config.sailyUrl), livePrice: false,
    });
  }

  return actions;
}
