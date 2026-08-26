import { tripHealth } from "./review.ts";
import type { EasyTTrip, TripLeg, TripStop } from "./trip.ts";
import { deriveTripDateFacts, stableStopDateRange } from "./trip-facts.ts";

export type BookingCategory = "accommodation" | "flight" | "activity" | "car-rental" | "connectivity" | "ground-transport" | "transport";
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
  transferId?: string;
  originStopId?: string;
  destinationStopId?: string;
  affiliate: boolean;
  livePrice: boolean;
};

export type AffiliateConfiguration = {
  activitiesUrl?: string;
  activitiesProvider?: string;
  carHireUrl?: string;
  sailyUrl?: string;
  groundTransportUrl?: string;
};

/**
 * Approved partner destinations. General links stay intact here rather than
 * being recreated in individual surfaces or enriched with trip data.
 */
export const affiliatePartners = {
  tripCom: {
    provider: "trip.com",
    accommodationUrl: "https://www.trip.com/t/pdAWQqi56W2",
  },
  viator: {
    provider: "viator",
    activitiesUrl: "https://www.viator.com/?pid=P00315646&mcid=42383&medium=link&campaign=morrovia-general-activities",
  },
  omio: {
    provider: "omio",
    transportUrl: "https://omio.sjv.io/2RBeqD",
  },
} as const;

export type AccommodationBookingUrlInput = {
  stop: Pick<TripStop, "id" | "name" | "country">;
  dates: { checkIn: string; checkOut: string };
  travellers: number;
};

/**
 * Trip.com currently approves this generic affiliate URL only. Contextual
 * Trip.com links or API support can be added here later without changing UI callers.
 */
export function getAccommodationBookingUrl(_input: AccommodationBookingUrlInput) {
  return affiliatePartners.tripCom.accommodationUrl;
}

const withParams = (base: string, params: Record<string, string | undefined>) => {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  return url.toString();
};

const stopDatesAreStable = (stop: TripStop, trip: EasyTTrip) => Boolean(
  stableStopDateRange(stop, trip)
  && !(trip.brief.cascadeStatus?.conflicts ?? []).some((conflict) => conflict.includes(stop.name)),
);

const selectedDecision = (trip: EasyTTrip, leg: TripLeg) => trip.brief.decisionSelections?.transportByLeg[leg.id];

const normalise = (value: string) => value.trim().toLocaleLowerCase();

function transportBookingForLeg(trip: EasyTTrip, leg: TripLeg, from: TripStop, to: TripStop) {
  const fromName = normalise(from.name);
  const toName = normalise(to.name);
  return (trip.brief.bookings ?? []).find((booking) => {
    if (booking.type !== "transport") return false;
    if (booking.id === leg.id || booking.id === `transport-${leg.id}`) return true;
    const title = normalise(booking.title);
    return Boolean(fromName && toName && title.includes(fromName) && title.includes(toName));
  });
}

function describesCoachOrBus(leg: TripLeg) {
  const detail = `${leg.provider ?? ""} ${JSON.stringify(leg.routeMetadata)}`.toLocaleLowerCase();
  return /\b(bus|coach|shuttle)\b/.test(detail);
}

function isLocalTransfer(leg: TripLeg) {
  const detail = `${leg.provider ?? ""} ${JSON.stringify(leg.routeMetadata)}`.toLocaleLowerCase();
  return /\b(local|taxi|private transfer|walking|walk)\b/.test(detail)
    || (typeof leg.distanceKm === "number" && leg.distanceKm < 40);
}

export function omioBookingActionForLeg(trip: EasyTTrip, leg: TripLeg, now = new Date()): BookingReadinessAction | null {
  const dateFacts = deriveTripDateFacts(trip, now);
  if (dateFacts.state !== "valid" || dateFacts.lifecycle.state === "ended") return null;
  const from = trip.stops.find((stop) => stop.id === leg.fromStopId);
  const to = trip.stops.find((stop) => stop.id === leg.toStopId);
  if (!from || !to || from.id === to.id || !from.name.trim() || !to.name.trim()) return null;
  if (transportBookingForLeg(trip, leg, from, to) || isLocalTransfer(leg)) return null;

  const supported = ["train", "flight", "ferry"].includes(leg.mode)
    || (leg.mode === "road" && describesCoachOrBus(leg));
  const needsComparison = leg.mode === "unknown" && typeof leg.distanceKm === "number" && leg.distanceKm >= 40;
  if (!supported && !needsComparison) return null;

  const partial = leg.mode === "unknown" || leg.durationMinutes === null || leg.distanceKm === null;
  return {
    id: `omio-${leg.id}`,
    category: "transport",
    provider: affiliatePartners.omio.provider,
    title: partial ? `Check transport options for ${from.name} → ${to.name}` : `Compare transport for ${from.name} → ${to.name}`,
    detail: partial
      ? "Check live options before relying on this connection; coverage and schedules vary by route."
      : `${leg.mode === "road" ? "Coach or bus" : leg.mode} selected · compare live options before booking.`,
    cta: partial ? "Check transport options on Omio" : "Compare transport on Omio",
    href: affiliatePartners.omio.transportUrl,
    tripId: trip.id,
    stopId: to.id,
    transferId: leg.id,
    originStopId: from.id,
    destinationStopId: to.id,
    affiliate: true,
    livePrice: false,
  };
}

/**
 * Builds next actions from stable itinerary facts. URLs and providers are kept
 * here so UI components never need partner-specific query construction.
 */
export function buildBookingReadiness(trip: EasyTTrip, config: AffiliateConfiguration = {}, now = new Date()): BookingReadinessAction[] {
  const actions: BookingReadinessAction[] = [];
  const health = tripHealth(trip);
  const dateFacts = deriveTripDateFacts(trip, now);
  if (dateFacts.lifecycle.state === "ended") return actions;
  const stableStops = trip.stops.filter((stop) => stopDatesAreStable(stop, trip));

  stableStops.forEach((stop) => {
    const dates = stableStopDateRange(stop, trip);
    if (!dates) return;
    actions.push({
      id: `stay-${stop.id}`, category: "accommodation", provider: affiliatePartners.tripCom.provider, title: `Find a stay in ${stop.name}`,
      detail: `${dates.checkIn} to ${dates.checkOut} · ${trip.travellers} traveller${trip.travellers === 1 ? "" : "s"}. Availability and prices are confirmed by Trip.com.`,
      cta: "Find accommodation on Trip.com", href: getAccommodationBookingUrl({ stop, dates, travellers: trip.travellers }),
      tripId: trip.id, stopId: stop.id, affiliate: true, livePrice: false,
    });
    const selectedActivities = trip.brief.selectedPlaces[stop.id] ?? [];
    if ((stop.nights ?? 0) >= 2 && selectedActivities.length) {
      const activityBase = config.activitiesUrl || "https://www.google.com/search";
      actions.push({
        id: `activity-${stop.id}`, category: "activity", provider: config.activitiesProvider ?? (config.activitiesUrl ? "activities-partner" : "google"), title: `Check major activities in ${stop.name}`,
        detail: `${selectedActivities.slice(0, 2).join(" · ")}${selectedActivities.length > 2 ? ` · +${selectedActivities.length - 2} more` : ""}. Check dates, opening days and cancellation terms before booking.`,
        cta: config.activitiesProvider === "viator" ? "Find activities on Viator" : "Check options", href: config.activitiesUrl ?? withParams(activityBase, { q: `${selectedActivities[0]} ${stop.name} official tickets` }),
        tripId: trip.id, stopId: stop.id, affiliate: Boolean(config.activitiesUrl), livePrice: false,
      });
    }
  });

  const first = [...trip.stops].sort((a, b) => a.order - b.order)[0];
  const last = [...trip.stops].sort((a, b) => a.order - b.order).at(-1);
  if (first && last && trip.brief.origin && dateFacts.state === "valid" && health.isReady) {
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

  const omioActions = trip.legs.map((leg) => omioBookingActionForLeg(trip, leg, now)).filter((action): action is BookingReadinessAction => Boolean(action));
  actions.push(...omioActions);

  if (config.groundTransportUrl) trip.legs.filter((leg) => !omioActions.some((action) => action.transferId === leg.id) && ["train", "ferry", "road"].includes(leg.mode) && (leg.distanceKm ?? 0) >= 120 && Boolean(selectedDecision(trip, leg))).forEach((leg) => {
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
