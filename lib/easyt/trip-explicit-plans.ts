import { fixedCommitmentDisplayLabel, projectFixedCommitmentsToStops, type FixedCommitmentConstraint } from "./fixed-commitment.ts";
import { scheduleItineraryIdea, removeItineraryIdea, itineraryIdeaDayOptions, type ItineraryIdeaDayOption } from "./itinerary-ideas.ts";
import { haversineKm } from "./planner.ts";
import { tripIntentForTrip, type EasyTTrip, type FixedTripCommitment, type ItineraryDayPart, type ItineraryIdea, type TripStop } from "./trip.ts";
import { normalizePlacePhrase } from "./place-intelligence.ts";

export type ExplicitVisitBase = { stop: TripStop; distanceKm: number | null };
export type ExplicitVisitPlan = {
  mentionId: string;
  name: string;
  canonicalPlaceId?: string;
  coordinates?: [number, number];
  bases: ExplicitVisitBase[];
  scheduledIdea: ItineraryIdea | null;
};

export type FixedCommitmentPlan = {
  commitment: FixedTripCommitment;
  displayLabel: string;
  stop: TripStop | null;
  state: "protected" | "needs-route-change" | "outside-stop-dates" | "outside-trip-dates";
  message: string;
};

const normalize = (value?: string) => normalizePlacePhrase(value ?? "");
const coordinatesForStop = (stop: TripStop): [number, number] | undefined =>
  stop.longitude == null || stop.latitude == null ? undefined : [stop.longitude, stop.latitude];

function samePlace(mention: { canonicalPlaceId?: string; canonicalName: string }, stop: TripStop) {
  return Boolean(mention.canonicalPlaceId && stop.canonicalPlaceId === mention.canonicalPlaceId)
    || normalize(mention.canonicalName) === normalize(stop.name);
}

function basesForVisit(trip: EasyTTrip, mention: { coordinates?: [number, number]; parentCountries: string[] }) {
  const countries = new Set(mention.parentCountries.map(normalize));
  const candidates = trip.stops
    .filter((stop) => !countries.size || countries.has(normalize(stop.country)))
    .map((stop) => ({ stop, distanceKm: haversineKm(mention.coordinates, coordinatesForStop(stop)) }))
    .sort((left, right) => (left.distanceKm ?? Number.MAX_SAFE_INTEGER) - (right.distanceKm ?? Number.MAX_SAFE_INTEGER));
  const nearby = candidates.filter((candidate) => candidate.distanceKm == null || candidate.distanceKm <= 350);
  return (nearby.length ? nearby : candidates).slice(0, 2);
}

/** Projects preserved prompt attractions into actionable finished-trip state. */
export function explicitVisitIntentsForTrip(trip: EasyTTrip): ExplicitVisitPlan[] {
  const structured = trip.brief.structuredBrief;
  if (!structured?.placeMentions?.length) return [];
  const removed = new Set(structured.removedPlaceMentionIds ?? []);
  return structured.placeMentions.flatMap((mention) => {
    if (removed.has(mention.mentionId) || (!mention.isAnchor && mention.role !== "anchor" && mention.routability !== "anchor_or_poi")) return [];
    if (trip.stops.some((stop) => samePlace(mention, stop))) return [];
    const scheduledIdea = (trip.brief.itineraryIdeas ?? []).find((idea) => idea.explicitVisitMentionId === mention.mentionId) ?? null;
    return [{
      mentionId: mention.mentionId,
      name: mention.canonicalName || mention.sourceText,
      canonicalPlaceId: mention.canonicalPlaceId,
      coordinates: mention.coordinates,
      bases: basesForVisit(trip, mention),
      scheduledIdea,
    }];
  });
}

export function explicitVisitDayOptions(trip: EasyTTrip, visit: ExplicitVisitPlan): ItineraryIdeaDayOption[] {
  return visit.bases.flatMap(({ stop }) => itineraryIdeaDayOptions(trip, stop.id));
}

export function scheduleExplicitVisitIntent(trip: EasyTTrip, mentionId: string, dayId: string, dayPart?: ItineraryDayPart | null) {
  const visit = explicitVisitIntentsForTrip(trip).find((item) => item.mentionId === mentionId);
  const day = trip.planItems.find((item) => item.id === dayId);
  if (!visit || !day || !visit.bases.some(({ stop }) => stop.id === day.stopId)) return trip;
  const idea: ItineraryIdea = {
    id: `explicit-visit-${mentionId.replace(/[^a-z0-9_-]+/gi, "-")}`,
    stopId: day.stopId,
    placeId: visit.canonicalPlaceId ?? mentionId,
    title: visit.name,
    category: "activity",
    coordinates: visit.coordinates,
    source: "traveller-visit-intent",
    explicitVisitMentionId: mentionId,
    reasons: ["destination-significance"],
  };
  return scheduleItineraryIdea(trip, idea, dayId, dayPart);
}

export function removeExplicitVisitIntent(trip: EasyTTrip, mentionId: string) {
  const idea = (trip.brief.itineraryIdeas ?? []).find((item) => item.explicitVisitMentionId === mentionId);
  const withoutIdea = idea ? removeItineraryIdea(trip, idea.id) : trip;
  const structured = withoutIdea.brief.structuredBrief;
  if (!structured) return withoutIdea;
  return {
    ...withoutIdea,
    brief: {
      ...withoutIdea.brief,
      structuredBrief: {
        ...structured,
        removedPlaceMentionIds: [...new Set([...(structured.removedPlaceMentionIds ?? []), mentionId])],
      },
    },
  };
}

function isoWithin(date: string, start?: string | null, end?: string | null) {
  return Boolean(start && end && date >= start && date < end);
}

export function fixedCommitmentPlansForTrip(trip: EasyTTrip): FixedCommitmentPlan[] {
  const commitments = projectFixedCommitmentsToStops(tripIntentForTrip(trip).hardConstraints.fixedCommitments, trip.stops);
  return commitments.map((commitment) => {
    const stop = trip.stops.find((item) => item.id === commitment.stopId) ?? null;
    const displayLabel = fixedCommitmentDisplayLabel(commitment);
    if (!stop) return { commitment, displayLabel, stop, state: "needs-route-change", message: `${displayLabel} doesn’t fit your current route.` };
    if (commitment.date && (commitment.date < trip.startDate || commitment.date > trip.endDate)) {
      return { commitment, displayLabel, stop, state: "outside-trip-dates", message: `${displayLabel} falls outside your trip dates.` };
    }
    if (commitment.date && !isoWithin(commitment.date, stop.arrivalDate, stop.departureDate)) {
      return { commitment, displayLabel, stop, state: "outside-stop-dates", message: `${displayLabel} isn’t covered by your current stay in ${stop.name}.` };
    }
    return { commitment, displayLabel, stop, state: "protected", message: `${displayLabel} is protected in this trip.` };
  });
}

function commitmentMatches(constraint: FixedCommitmentConstraint, commitment: FixedTripCommitment) {
  if (constraint.date !== commitment.date) return false;
  const left = constraint.place?.canonicalPlaceId;
  const right = commitment.place?.canonicalPlaceId;
  return Boolean(left && right && left === right)
    || normalize(constraint.place?.name || constraint.label) === normalize(commitment.place?.name || commitment.label);
}

export function removeFixedCommitment(trip: EasyTTrip, commitmentId: string) {
  const commitment = tripIntentForTrip(trip).hardConstraints.fixedCommitments.find((item) => item.id === commitmentId);
  if (!commitment) return trip;
  const intent = trip.brief.intent;
  const structured = trip.brief.structuredBrief;
  return {
    ...trip,
    brief: {
      ...trip.brief,
      ...(intent ? { intent: { ...intent, hardConstraints: { ...intent.hardConstraints, fixedCommitments: intent.hardConstraints.fixedCommitments.filter((item) => item.id !== commitmentId && !commitmentMatches(item, commitment)) } } } : {}),
      ...(structured ? { structuredBrief: { ...structured, hardConstraints: structured.hardConstraints.filter((item) => item.type !== "fixed-commitment" || !commitmentMatches({ label: item.value, date: item.date, commitmentType: item.commitmentType, place: item.place, stopId: item.stopId }, commitment)) } } : {}),
    },
  };
}
