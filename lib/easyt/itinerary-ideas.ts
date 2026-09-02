import { addMappedPlaceToTrip, removeMappedPlaceFromTrip } from "./map-place-itinerary.ts";
import type { EasyTTrip, ItineraryDayPart, ItineraryIdea, PlanItem } from "./trip.ts";
import type { ItineraryDiscoveryPlace } from "./itinerary-day-context.ts";

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const ideaId = (stopId: string, placeId: string) => `idea-${stopId}-${placeId.replace(/[^a-z0-9_-]+/gi, "-")}`;

export type IdeaDiscoveryReason = "destination-significance" | "interest-relevance";

export function itineraryIdeaForPlace(input: {
  stopId: string;
  place: ItineraryDiscoveryPlace;
  reasons: IdeaDiscoveryReason[];
}): ItineraryIdea {
  const { stopId, place, reasons } = input;
  return {
    id: ideaId(stopId, place.id), stopId, placeId: place.id, title: place.title,
    category: place.type === "Food" || place.tags.includes("Food") ? "restaurant" : "activity",
    coordinates: place.coordinates, image: place.image, sourceUrl: place.sourceUrl,
    area: place.area, placeType: place.type, description: place.description,
    source: reasons.includes("destination-significance") ? "destination-highlight" : "personalised-recommendation",
    reasons: [...new Set(reasons)],
  };
}

export function ideaStateForPlace(trip: EasyTTrip, stopId: string, placeId: string) {
  const providerIdentity = placeId.startsWith("viator:");
  const idea = (trip.brief.itineraryIdeas ?? []).find((item) => item.placeId === placeId && (providerIdentity || item.stopId === stopId));
  if (!idea) return { state: "available" as const, idea: null, day: null };
  const day = idea.dayId ? trip.planItems.find((item) => item.id === idea.dayId) ?? null : null;
  return day ? { state: "planned" as const, idea, day } : { state: "saved" as const, idea, day: null };
}

export function saveItineraryIdea(trip: EasyTTrip, idea: ItineraryIdea): EasyTTrip {
  const existing = (trip.brief.itineraryIdeas ?? []).find((item) => item.id === idea.id
    || Boolean(idea.provider && idea.providerProductId && item.provider === idea.provider && item.providerProductId === idea.providerProductId));
  if (existing) return trip;
  if (!trip.stops.some((stop) => stop.id === idea.stopId)) return trip;
  return { ...trip, brief: { ...trip.brief, itineraryIdeas: [...(trip.brief.itineraryIdeas ?? []), idea] } };
}

export function scheduleItineraryIdea(
  trip: EasyTTrip,
  idea: ItineraryIdea,
  dayId: string,
  dayPart?: ItineraryDayPart | null,
): EasyTTrip {
  const day = trip.planItems.find((item) => item.id === dayId && item.stopId === idea.stopId);
  if (!day) return trip;
  const existing = (trip.brief.itineraryIdeas ?? []).find((item) => item.id === idea.id
    || Boolean(idea.provider && idea.providerProductId && item.provider === idea.provider && item.providerProductId === idea.providerProductId));
  if (existing && existing.id !== idea.id) return trip;
  const scheduledDayPart = dayPart === undefined ? existing?.dayPart ?? null : dayPart;
  const exactDuplicate = existing?.placeId === idea.placeId
    && existing.dayId === dayId
    && (existing.dayPart ?? null) === scheduledDayPart;
  if (exactDuplicate) return trip;
  const previousDay = existing?.dayId ? trip.planItems.find((item) => item.id === existing.dayId) : undefined;
  const base = existing && previousDay
    ? existing.coordinates
      ? removeMappedPlaceFromTrip(trip, { id: existing.placeId, name: existing.title, coordinates: existing.coordinates }, existing.category, previousDay.dayNumber, existing.stopId)
      : removeCoordinateLessIdeaFromTrip(trip, existing, previousDay)
    : trip;
  const stored = { ...idea, dayId, dayPart: scheduledDayPart };
  const ideas = [...(base.brief.itineraryIdeas ?? []).filter((item) => item.id !== idea.id), stored];
  const withIdea = { ...base, brief: { ...base.brief, itineraryIdeas: ideas } };
  return idea.coordinates
    ? addMappedPlaceToTrip(withIdea, { id: idea.placeId, name: idea.title, coordinates: idea.coordinates }, idea.category, day.dayNumber, idea.stopId)
    : addCoordinateLessIdeaToTrip(withIdea, stored, day);
}

/** Broad scheduling is explicit traveller intent and never changes the item's day. */
export function assignItineraryIdeaDayPart(
  trip: EasyTTrip,
  ideaId: string,
  dayPart: ItineraryDayPart | null,
): EasyTTrip {
  const ideas = trip.brief.itineraryIdeas ?? [];
  const idea = ideas.find((item) => item.id === ideaId);
  if (!idea?.dayId || !trip.planItems.some((day) => day.id === idea.dayId && day.stopId === idea.stopId)) return trip;
  if ((idea.dayPart ?? null) === dayPart) return trip;
  return {
    ...trip,
    brief: {
      ...trip.brief,
      itineraryIdeas: ideas.map((item) => item.id === ideaId ? { ...item, dayPart } : item),
    },
  };
}

export function removeItineraryIdea(trip: EasyTTrip, id: string): EasyTTrip {
  const idea = (trip.brief.itineraryIdeas ?? []).find((item) => item.id === id);
  if (!idea) return trip;
  let next = trip;
  const day = idea.dayId ? trip.planItems.find((item) => item.id === idea.dayId) : undefined;
  if (day && idea.coordinates) next = removeMappedPlaceFromTrip(next, { id: idea.placeId, name: idea.title, coordinates: idea.coordinates }, idea.category, day.dayNumber, idea.stopId);
  else if (day) next = removeCoordinateLessIdeaFromTrip(next, idea, day);
  return { ...next, brief: { ...next.brief, itineraryIdeas: (next.brief.itineraryIdeas ?? []).filter((item) => item.id !== id) } };
}

export function validIdeaDays(trip: EasyTTrip, stopId: string): PlanItem[] {
  return trip.planItems.filter((day) => day.stopId === stopId).sort((a, b) => a.dayNumber - b.dayNumber);
}

export type ItineraryIdeaDayOption = {
  day: PlanItem;
  itemCount: number;
  protectedDay: boolean;
};

/**
 * Builds the day picker from canonical stop/day identity. The count mirrors
 * the itinerary rows already stored on the day; it is not a capacity claim.
 */
export function itineraryIdeaDayOptions(trip: EasyTTrip, stopId: string): ItineraryIdeaDayOption[] {
  return validIdeaDays(trip, stopId).map((day) => ({
    day,
    itemCount: day.notes.length,
    protectedDay: day.type === "arrival" || day.type === "transport",
  }));
}

/**
 * Deterministic scheduling hint: after stop identity has filtered the list,
 * prefer an ordinary local day, then a lighter day, then the earliest day.
 */
export function preferredItineraryIdeaDay(trip: EasyTTrip, stopId: string): PlanItem | null {
  return [...itineraryIdeaDayOptions(trip, stopId)]
    .sort((left, right) => Number(left.protectedDay) - Number(right.protectedDay)
      || left.itemCount - right.itemCount
      || left.day.dayNumber - right.day.dayNumber)[0]?.day ?? null;
}

/** Removes orphans and keeps scheduled choices attached by stable day ID. */
export function reconcileItineraryIdeas(trip: EasyTTrip): EasyTTrip {
  const stopIds = new Set(trip.stops.map((stop) => stop.id));
  const dayIds = new Set(trip.planItems.map((day) => day.id));
  const ideas = (trip.brief.itineraryIdeas ?? []).flatMap((idea) => {
    if (!stopIds.has(idea.stopId)) return [];
    return [{
      ...idea,
      ...(idea.dayId && !dayIds.has(idea.dayId) ? { dayId: undefined, dayPart: undefined } : {}),
    }];
  });
  return { ...trip, brief: { ...trip.brief, itineraryIdeas: ideas } };
}

export function sameIdeaTitle(left: string, right: string) { return normalize(left) === normalize(right); }

function addCoordinateLessIdeaToTrip(trip: EasyTTrip, idea: ItineraryIdea, day: PlanItem) {
  const activities = trip.brief.customActivities?.[day.dayNumber] ?? [];
  const alreadyStored = activities.some((activity) => normalize(activity) === normalize(idea.title));
  const alreadyNoted = day.notes.some((note) => normalize(note) === normalize(idea.title));
  if (alreadyStored && alreadyNoted) return trip;
  return {
    ...trip,
    brief: { ...trip.brief, customActivities: { ...(trip.brief.customActivities ?? {}), [day.dayNumber]: alreadyStored ? activities : [...activities, idea.title] } },
    planItems: trip.planItems.map((item) => item.id === day.id && !alreadyNoted
      ? { ...item, notes: [...item.notes, idea.title], ...(item.noteDayParts ? { noteDayParts: [...item.noteDayParts, idea.dayPart ?? null] } : {}) }
      : item),
  };
}

function removeCoordinateLessIdeaFromTrip(trip: EasyTTrip, idea: ItineraryIdea, day: PlanItem) {
  return {
    ...trip,
    brief: { ...trip.brief, customActivities: { ...(trip.brief.customActivities ?? {}), [day.dayNumber]: (trip.brief.customActivities?.[day.dayNumber] ?? []).filter((item) => normalize(item) !== normalize(idea.title)) } },
    planItems: trip.planItems.map((item) => item.id === day.id ? {
      ...item,
      notes: item.notes.filter((note) => normalize(note) !== normalize(idea.title)),
      ...(item.noteDayParts ? { noteDayParts: item.notes.flatMap((note, index) => normalize(note) === normalize(idea.title) ? [] : [item.noteDayParts?.[index] ?? null]) } : {}),
    } : item),
  };
}
