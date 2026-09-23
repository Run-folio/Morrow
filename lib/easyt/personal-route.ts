import { itineraryImageFor } from "./itinerary-media.ts";
import { tripDisplayTitle } from "./trip-display.ts";
import { deriveTripDateFacts, formatTripDuration, formatTripNights, legForTransition, orderedTripPlanItems } from "./trip-facts.ts";
import { formatIsoDate } from "./trip-lifecycle.ts";
import type { EasyTTrip, ItineraryIdea, PlanItem, TripLeg, TripStop } from "./trip.ts";

export type PersonalRouteImage = { src: string; alt: string };

export type PersonalRouteHighlight = {
  id: string;
  stopId: string;
  title: string;
  dayNumber: number | null;
  dateLabel: string;
  kind: "activity" | "food" | "saved idea";
  image: PersonalRouteImage | null;
  sourceUrl: string | null;
};

export type PersonalRouteConnection = {
  id: string;
  from: string;
  to: string;
  mode: string | null;
  modeLabel: string;
  planningMinutes: number | null;
  durationLabel: string;
  note: string;
  confidence: "high" | "medium" | "needs-review" | "unknown";
};

export type PersonalRouteStop = {
  id: string;
  name: string;
  country: string;
  coordinates: [number, number] | null;
  nights: number | null;
  days: number;
  dayStart: number;
  dayEnd: number;
  dayLabel: string;
  reason: string;
  image: PersonalRouteImage | null;
  highlights: PersonalRouteHighlight[];
  onward: PersonalRouteConnection | null;
};

export type PersonalRoutePresentation = {
  tripId: string;
  title: string;
  routeOrder: string;
  summary: string;
  dateLabel: string;
  durationDays: number | null;
  totalNights: number | null;
  countries: string[];
  character: string;
  hero: PersonalRouteImage | null;
  stops: PersonalRouteStop[];
  highlights: PersonalRouteHighlight[];
  missingFacts: string[];
};

const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

function dateLabel(value: string | null | undefined) {
  return value ? formatIsoDate(value, "en-GB", { day: "numeric", month: "short", year: "numeric" }) ?? "Date to confirm" : "Date to confirm";
}

function imageFromItem(item: Pick<PlanItem, "image" | "title"> | Pick<ItineraryIdea, "image" | "title">): PersonalRouteImage | null {
  return item.image ? { src: item.image, alt: item.title } : null;
}

function connectionFor(leg: TripLeg | null, from: TripStop, to: TripStop): PersonalRouteConnection {
  const minutes = leg?.doorToDoorMinutes ?? leg?.headlineMinutes ?? leg?.durationMinutes ?? null;
  const knownMode = leg && leg.mode !== "unknown" ? leg.mode : null;
  const confidence = !leg || leg.confidence === "unknown" || leg.confidence === "low"
    ? "unknown"
    : leg.confidence ?? (minutes === null ? "unknown" : "medium");
  const modeLabel = knownMode ? titleCase(knownMode) : "Transfer";
  return {
    id: leg?.id ?? `connection:${from.id}:${to.id}`,
    from: from.name,
    to: to.name,
    mode: knownMode,
    modeLabel,
    planningMinutes: minutes,
    durationLabel: formatTripDuration(minutes, "Timing to confirm"),
    note: leg
      ? `${modeLabel} from ${from.name} to ${to.name}. ${leg.scheduleNeedsChecking === false ? "Saved timing is part of this plan." : "Check current schedules and conditions before booking."}`
      : `No saved transport detail is attached to ${from.name} → ${to.name}.`,
    confidence,
  };
}

function stopItems(trip: EasyTTrip, stopId: string) {
  return orderedTripPlanItems(trip).filter((item) => item.stopId === stopId);
}

function highlightForIdea(idea: ItineraryIdea, trip: EasyTTrip): PersonalRouteHighlight | null {
  if (!idea.dayId) return null;
  const day = trip.planItems.find((item) => item.id === idea.dayId);
  return {
    id: `idea:${idea.id}`,
    stopId: idea.stopId,
    title: idea.title,
    dayNumber: day?.dayNumber ?? null,
    dateLabel: day ? dateLabel(day.date) : "Date to confirm",
    kind: "saved idea",
    image: imageFromItem(idea),
    sourceUrl: idea.sourceUrl ?? null,
  };
}

function highlightsForStop(trip: EasyTTrip, stop: TripStop) {
  const items = stopItems(trip, stop.id);
  const candidates: PersonalRouteHighlight[] = [
    ...(trip.brief.itineraryIdeas ?? [])
      .filter((idea) => idea.stopId === stop.id)
      .flatMap((idea) => highlightForIdea(idea, trip) ?? []),
    ...items
      .filter((item): item is PlanItem & { type: "activity" | "food" } => item.type === "activity" || item.type === "food")
      .map((item) => ({
        id: `plan:${item.id}`,
        stopId: item.stopId,
        title: item.title,
        dayNumber: item.dayNumber,
        dateLabel: dateLabel(item.date),
        kind: item.type,
        image: imageFromItem(item),
        sourceUrl: item.sourceUrl ?? item.bookingUrl,
      }) satisfies PersonalRouteHighlight),
  ];
  const seen = new Set<string>();
  return candidates.filter((item) => {
    const key = normalized(item.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => (left.dayNumber ?? Number.MAX_SAFE_INTEGER) - (right.dayNumber ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id));
}

function stopImage(trip: EasyTTrip, stop: TripStop, index: number, highlights: PersonalRouteHighlight[]) {
  const direct = stopItems(trip, stop.id).map(imageFromItem).find(Boolean)
    ?? highlights.map((item) => item.image).find(Boolean);
  if (direct) return direct;
  const day = stopItems(trip, stop.id)[0];
  if (!day) return null;
  const image = itineraryImageFor({ title: day.title, destination: stop.name, items: day.notes }, index);
  return image ? { src: image.src, alt: image.alt } : null;
}

/**
 * A pure, read-only projection of the canonical trip document. The original
 * trip object and every nested collection remain untouched.
 */
export function personalRoutePresentation(trip: EasyTTrip): PersonalRoutePresentation {
  const dateFacts = deriveTripDateFacts(trip);
  const orderedStops = [...trip.stops].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const projectedStops = orderedStops.map((stop, index): PersonalRouteStop => {
    const days = stopItems(trip, stop.id);
    const dayNumbers = days.map((item) => item.dayNumber).filter((day) => Number.isInteger(day) && day > 0);
    const dayStart = dayNumbers.length ? Math.min(...dayNumbers) : 0;
    const dayEnd = dayNumbers.length ? Math.max(...dayNumbers) : dayStart;
    const highlights = highlightsForStop(trip, stop);
    const next = orderedStops[index + 1] ?? null;
    return {
      id: stop.id,
      name: stop.name,
      country: stop.country || "Country to confirm",
      coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] : null,
      nights: Number.isInteger(stop.nights) && (stop.nights ?? -1) >= 0 ? stop.nights : null,
      days: dayNumbers.length ? new Set(dayNumbers).size : 0,
      dayStart,
      dayEnd,
      dayLabel: stop.arrivalDate && stop.departureDate
        ? `${dateLabel(stop.arrivalDate)} – ${dateLabel(stop.departureDate)}`
        : stop.arrivalDate
          ? `From ${dateLabel(stop.arrivalDate)}`
          : "Dates to confirm",
      reason: days.find((item) => item.reason.trim())?.reason.trim() || `A saved stop in your ${trip.brief.pace === "slow" ? "unhurried" : "full"} route.`,
      image: stopImage(trip, stop, index, highlights),
      highlights,
      onward: next ? connectionFor(legForTransition(trip, stop.id, next.id), stop, next) : null,
    };
  });
  const knownNights = projectedStops.map((stop) => stop.nights).filter((value): value is number => value !== null);
  const countries = [...new Set(projectedStops.map((stop) => stop.country).filter((country) => country !== "Country to confirm"))];
  const missingFacts = [
    projectedStops.some((stop) => stop.nights === null) ? "Some stop nights are still to confirm." : null,
    projectedStops.some((stop) => stop.coordinates === null) ? "Some stops do not yet have trustworthy map coordinates." : null,
    projectedStops.some((stop) => stop.onward && stop.onward.mode === null) ? "Some transport details are still to confirm." : null,
    projectedStops.some((stop) => stop.image === null) ? "Some stops do not yet have a suitable saved photograph." : null,
  ].filter((value): value is string => Boolean(value));
  const routeOrder = projectedStops.map((stop) => stop.name).join(" → ") || "Stops to confirm";
  const finalStop = projectedStops.at(-1)?.name;
  const summary = finalStop
    ? `Your saved journey from ${trip.brief.origin || "your starting point"} to ${finalStop}, following ${projectedStops.length} ${projectedStops.length === 1 ? "stop" : "stops"} in the order you planned.`
    : "Your trip is saved, but its route still needs a first stop.";
  return {
    tripId: trip.id,
    title: tripDisplayTitle(trip),
    routeOrder,
    summary,
    dateLabel: dateFacts.rangeLabel,
    durationDays: dateFacts.durationDays,
    totalNights: knownNights.length === projectedStops.length ? knownNights.reduce((sum, nights) => sum + nights, 0) : null,
    countries,
    character: trip.brief.pace === "slow" ? "An unhurried journey" : "A full, connected journey",
    hero: projectedStops.map((stop) => stop.image).find(Boolean) ?? null,
    stops: projectedStops,
    highlights: projectedStops.flatMap((stop) => stop.highlights),
    missingFacts,
  };
}

export function personalRouteHref(tripId: string) {
  return `/journey/my-routes/${encodeURIComponent(tripId)}`;
}

export function personalRouteBackHref(tripId: string) {
  return `/journey/${encodeURIComponent(tripId)}`;
}

export function personalRouteNightLabel(nights: number | null) {
  return formatTripNights(nights);
}
