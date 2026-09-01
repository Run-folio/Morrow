import { stayBookingForStop } from "./accommodation.ts";
import { itineraryActivityProtection } from "./itinerary-mutations.ts";
import { itineraryNotesWithSourceIndexesForDisplay } from "./itinerary-presentation.ts";
import {
  incomingLegForPlanItem,
  legForTransition,
  orderedTripPlanItems,
} from "./trip-facts.ts";
import { routeEndpointForLeg } from "./trip-legs.ts";
import type {
  EasyTTrip,
  ItineraryDayPart,
  PlanItem,
  TripBooking,
  TripLeg,
  TripStop,
} from "./trip.ts";

export const itineraryDayParts = ["morning", "midday", "afternoon", "evening"] as const satisfies readonly ItineraryDayPart[];

export type ComposedItineraryActivity = {
  id: string;
  title: string;
  category: "restaurant" | "activity" | "other";
  booking: TripBooking | null;
  source: "itinerary-idea" | "authored-activity" | "day-note";
  /** Null is a deliberate "planned, time not set" state. */
  dayPart: ItineraryDayPart | null;
  noteIndex: number | null;
  /** Saved ideas and unambiguous authored notes own explicit day-part intent. */
  dayPartEditable: boolean;
  image?: string;
  sourceUrl?: string;
  area?: string;
  placeType?: string;
};

export type ComposedItineraryTransfer = {
  id: string;
  direction: "arriving" | "departing";
  classification: TripLeg["classification"];
  origin: string | null;
  destination: string | null;
  mode: TripLeg["mode"];
  durationMinutes: number | null;
  durationIsEstimate: boolean;
  provider: string | null;
  confidence: TripLeg["confidence"];
  scheduleNeedsChecking: boolean;
};

export type ComposedItineraryTonight = {
  state: "booked" | "not-organised" | "unknown" | "no-overnight";
  destination: string | null;
  booking: TripBooking | null;
  stopId: string | null;
};

export type ItineraryDayComposition = {
  day: PlanItem;
  stop: TripStop | null;
  context: {
    date: string;
    destination: string;
    stopId: string;
    travelDay: boolean;
  };
  transfers: ComposedItineraryTransfer[];
  planned: Record<ItineraryDayPart, ComposedItineraryActivity[]>;
  unslotted: ComposedItineraryActivity[];
  freeDayParts: ItineraryDayPart[];
  tonight: ComposedItineraryTonight;
  ideas: {
    unscheduledCount: number;
    scheduledHereCount: number;
  };
};

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Deterministically spread legacy untimed rows across the broad day while
 * preserving their exact canonical order. The first and last rows anchor the
 * day, with intermediate rows progressing through Midday and Afternoon.
 */
export function fallbackItineraryDayPart(index: number, count: number): ItineraryDayPart {
  if (count <= 1) return "morning";
  const boundedIndex = Math.max(0, Math.min(index, count - 1));
  const partIndex = Math.round((boundedIndex * (itineraryDayParts.length - 1)) / (count - 1));
  return itineraryDayParts[partIndex] ?? "morning";
}

function outgoingLegForDay(trip: EasyTTrip, day: PlanItem) {
  const ordered = orderedTripPlanItems(trip);
  const index = ordered.findIndex((candidate) => candidate.id === day.id);
  const next = index >= 0 ? ordered[index + 1] : undefined;
  if (!next || next.stopId === day.stopId) return null;
  return legForTransition(trip, day.stopId, next.stopId);
}

function finalDepartureLegForDay(trip: EasyTTrip, day: PlanItem) {
  const laterAtStop = orderedTripPlanItems(trip).some((candidate) => (
    candidate.stopId === day.stopId && candidate.dayNumber > day.dayNumber
  ));
  if (laterAtStop) return null;
  return trip.legs.find((leg) => leg.classification === "departure" && leg.fromStopId === day.stopId) ?? null;
}

function transferForComposition(
  trip: EasyTTrip,
  leg: TripLeg,
  direction: ComposedItineraryTransfer["direction"],
): ComposedItineraryTransfer {
  const from = routeEndpointForLeg(trip, leg, "from");
  const to = routeEndpointForLeg(trip, leg, "to");
  return {
    id: leg.id,
    direction,
    classification: leg.classification,
    origin: from?.name ?? null,
    destination: to?.name ?? null,
    mode: leg.mode,
    durationMinutes: leg.doorToDoorMinutes ?? leg.durationMinutes,
    durationIsEstimate: leg.provenance === "planning_estimate",
    provider: leg.provider,
    confidence: leg.confidence,
    scheduleNeedsChecking: Boolean(leg.scheduleNeedsChecking),
  };
}

function transfersForDay(trip: EasyTTrip, day: PlanItem) {
  const incoming = incomingLegForPlanItem(trip, day);
  const outgoing = outgoingLegForDay(trip, day);
  const finalDeparture = finalDepartureLegForDay(trip, day);
  return [...new Map([
    ...(incoming ? [[incoming.id, transferForComposition(trip, incoming, "arriving")] as const] : []),
    ...(outgoing ? [[outgoing.id, transferForComposition(trip, outgoing, "departing")] as const] : []),
    ...(finalDeparture ? [[finalDeparture.id, transferForComposition(trip, finalDeparture, "departing")] as const] : []),
  ]).values()];
}

function tonightForDay(trip: EasyTTrip, day: PlanItem, stop: TripStop | null): ComposedItineraryTonight {
  if (!stop) return { state: "unknown", destination: null, booking: null, stopId: null };
  const booking = stayBookingForStop(trip, stop) ?? null;
  const datesKnown = Boolean(stop.arrivalDate && stop.departureDate);
  const ownsThisNight = datesKnown
    ? day.date >= stop.arrivalDate! && day.date < stop.departureDate!
    : null;

  if (ownsThisNight === true) {
    return {
      state: booking ? "booked" : "not-organised",
      destination: stop.name,
      booking,
      stopId: stop.id,
    };
  }
  if (ownsThisNight === null && (stop.nights ?? 0) > 0) {
    return { state: "unknown", destination: stop.name, booking, stopId: stop.id };
  }
  return { state: "no-overnight", destination: null, booking: null, stopId: null };
}

/** Produce one truthful day view from canonical trip state. */
export function composeItineraryDay(trip: EasyTTrip, dayId: string): ItineraryDayComposition | null {
  const day = trip.planItems.find((candidate) => candidate.id === dayId);
  if (!day) return null;
  const stop = trip.stops.find((candidate) => candidate.id === day.stopId) ?? null;
  const transfers = transfersForDay(trip, day);
  const scheduledIdeas = (trip.brief.itineraryIdeas ?? []).filter((idea) => idea.dayId === day.id);
  const incoming = incomingLegForPlanItem(trip, day);
  const ideasByTitle = scheduledIdeas.reduce<Map<string, typeof scheduledIdeas>>((result, idea) => {
    const key = normalized(idea.title);
    result.set(key, [...(result.get(key) ?? []), idea]);
    return result;
  }, new Map());
  const rows = itineraryNotesWithSourceIndexesForDisplay(day, incoming, trip);
  type ActivityDraft = Omit<ComposedItineraryActivity, "dayPart"> & { explicitPart: ItineraryDayPart | null };
  const drafts: ActivityDraft[] = rows.map(({ note, sourceIndex }) => {
    const ideaQueue = ideasByTitle.get(normalized(note));
    const idea = ideaQueue?.shift();
    const protection = itineraryActivityProtection(trip, { dayNumber: day.dayNumber, noteIndex: sourceIndex, title: note });
    const booking = (trip.brief.bookings ?? []).find((candidate) => normalized(candidate.title) === normalized(note)) ?? null;
    const explicitPart = idea?.dayPart ?? day.noteDayParts?.[sourceIndex] ?? null;
    return {
      id: idea?.id ?? (protection.editable ? `${day.id}-activity-${normalized(note)}` : `${day.id}-note-${sourceIndex}`),
      title: note,
      category: idea?.category ?? (day.type === "food" ? "restaurant" as const : "other" as const),
      booking,
      source: idea ? "itinerary-idea" as const : protection.editable ? "authored-activity" as const : "day-note" as const,
      explicitPart,
      noteIndex: sourceIndex,
      dayPartEditable: !booking && (Boolean(idea) || protection.editable),
      image: idea?.image,
      sourceUrl: idea?.sourceUrl,
      area: idea?.area,
      placeType: idea?.placeType,
    };
  });
  for (const ideas of ideasByTitle.values()) {
    for (const idea of ideas) drafts.push({
      id: idea.id,
      title: idea.title,
      category: idea.category,
      booking: null,
      source: "itinerary-idea",
      explicitPart: idea.dayPart ?? null,
      noteIndex: null,
      dayPartEditable: true,
      image: idea.image,
      sourceUrl: idea.sourceUrl,
      area: idea.area,
      placeType: idea.placeType,
    });
  }
  const allActivities: ComposedItineraryActivity[] = drafts.map((activity, index) => ({
    id: activity.id,
    title: activity.title,
    category: activity.category,
    booking: activity.booking,
    source: activity.source,
    dayPart: activity.explicitPart ?? fallbackItineraryDayPart(index, drafts.length),
    noteIndex: activity.noteIndex,
    dayPartEditable: activity.dayPartEditable,
    image: activity.image,
    sourceUrl: activity.sourceUrl,
    area: activity.area,
    placeType: activity.placeType,
  }));
  const planned = Object.fromEntries(itineraryDayParts.map((part) => [
    part,
    allActivities.filter((activity) => activity.dayPart === part),
  ])) as Record<ItineraryDayPart, ComposedItineraryActivity[]>;
  const unslotted: ComposedItineraryActivity[] = [];

  return {
    day,
    stop,
    context: {
      date: day.date,
      destination: stop?.name ?? day.title,
      stopId: day.stopId,
      travelDay: transfers.length > 0,
    },
    transfers,
    planned,
    unslotted,
    freeDayParts: itineraryDayParts.filter((part) => planned[part].length === 0),
    tonight: tonightForDay(trip, day, stop),
    ideas: {
      unscheduledCount: (trip.brief.itineraryIdeas ?? []).filter((idea) => idea.stopId === day.stopId && !idea.dayId).length,
      scheduledHereCount: scheduledIdeas.length,
    },
  };
}
