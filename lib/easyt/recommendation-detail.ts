import { exploreResultState, type ExploreResult, type ExploreResultState } from "./explore.ts";
import { composeItineraryDay } from "./itinerary-day-composition.ts";
import { itineraryInterestReason } from "./itinerary-day-context.ts";
import { activityDurationLabel, isFullDayActivity, itineraryScheduleWarnings } from "./itinerary-schedule-awareness.ts";
import type { MapResultPlace } from "./map-result-selection.ts";
import { tripIntentForTrip, type EasyTTrip, type ItineraryDayPart, type ItineraryIdea } from "./trip.ts";

export type RecommendationDetailKind = "activity" | "tour" | "restaurant" | "accommodation";

export type RecommendationDetailModel = {
  id: string;
  contextKey?: string;
  kind: RecommendationDetailKind;
  title: string;
  location?: string | null;
  summary?: string | null;
  image?: string | null;
  imageAlt?: string | null;
  category?: string | null;
  duration?: string | null;
  price?: string | null;
  dateSummary?: string | null;
  bookingStatus?: string | null;
  bookingHref?: string | null;
  provider?: string | null;
  providerProductId?: string | null;
  whyFit?: string | null;
  whyFitLabel?: string | null;
  practical?: Array<{ label: string; value: string }>;
  dayPart?: ItineraryDayPart | null;
  canMoveTime?: boolean;
  canRemove?: boolean;
};

export type RecommendationDetailContext = {
  activeDayId?: string | null;
  activeDayPart?: ItineraryDayPart | null;
  surface: "explore" | "itinerary" | "map";
};

function titleCase(value: string) {
  return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}

function money(value: NonNullable<NonNullable<ItineraryIdea["providerMetadata"]>["price"]> | undefined) {
  if (!value || !Number.isFinite(value.amount)) return null;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: value.currency, maximumFractionDigits: 2 }).format(value.amount);
  } catch {
    return `${value.amount} ${value.currency}`;
  }
}

function providerLabel(value: string | null | undefined) {
  if (value === "viator") return "Viator";
  if (value === "google-places") return "Google Places";
  if (value === "openstreetmap") return "OpenStreetMap";
  if (value === "booking-demand") return "Booking provider";
  return null;
}

function ratingFact(rating: number | undefined, reviewCount: number | undefined) {
  if (!Number.isFinite(rating)) return null;
  return `${rating!.toFixed(1)}${Number.isFinite(reviewCount) ? ` · ${reviewCount!.toLocaleString()} reviews` : ""}`;
}

export function recommendationDetailContextKey(input: {
  tripId: string;
  stopId: string | null | undefined;
  resultId: string;
  providerProductId?: string | null;
  activeDayId?: string | null;
  activeDayPart?: ItineraryDayPart | null;
}) {
  return [input.tripId, input.stopId ?? "no-stop", input.resultId, input.providerProductId ?? "no-product", input.activeDayId ?? "no-day", input.activeDayPart ?? "no-part"].join(":");
}

function openFullDay(trip: EasyTTrip, stopId: string, excludedDayId?: string | null) {
  return trip.planItems
    .filter((day) => day.stopId === stopId && day.id !== excludedDayId)
    .sort((left, right) => left.dayNumber - right.dayNumber)
    .find((day) => {
      const composition = composeItineraryDay(trip, day.id);
      return composition && !composition.transfers.length
        && !composition.unslotted.length
        && Object.values(composition.planned).every((items) => !items.length);
    }) ?? null;
}

/** Explain fit from canonical plan composition and sourced facts only. */
export function recommendationTripFit(
  trip: EasyTTrip,
  result: Pick<ExploreResult, "title" | "category" | "tags" | "description" | "stopId" | "idea">,
  state: ExploreResultState,
  context: Pick<RecommendationDetailContext, "activeDayId" | "activeDayPart">,
) {
  const interest = itineraryInterestReason({ title: result.title, type: result.category, tags: result.tags, description: result.description ?? "" }, tripIntentForTrip(trip).preferences.interests);
  if (state.state === "planned") {
    const composition = composeItineraryDay(trip, state.day.id);
    const warning = composition ? itineraryScheduleWarnings(composition).find((candidate) => candidate.activityIds.includes(state.idea.id)) : null;
    return `Already planned for Day ${state.day.dayNumber}${state.idea.dayPart ? ` · ${titleCase(state.idea.dayPart)}` : ""}.${warning ? ` ${warning.message}` : ""}${interest ? ` ${interest}.` : ""}`;
  }
  const day = context.activeDayId
    ? trip.planItems.find((candidate) => candidate.id === context.activeDayId && candidate.stopId === result.stopId) ?? null
    : null;
  const duration = result.idea.providerMetadata?.duration;
  const fullDay = isFullDayActivity(duration);
  if (!day) return interest ? `${interest}. Choose a day to check how it fits the current plan.` : "Choose a day to check how this fits the current plan.";
  const composition = composeItineraryDay(trip, day.id);
  if (!composition) return interest ? `${interest}. Day capacity has not been inferred.` : "Day capacity has not been inferred.";
  const part = context.activeDayPart;
  const occupiedPart = part ? composition.planned[part].length > 0 : false;
  const otherPlans = composition.unslotted.length + Object.values(composition.planned).reduce((total, items) => total + items.length, 0);
  const suffix = interest ? ` ${interest}.` : "";
  if (fullDay && part === "evening") {
    const alternative = openFullDay(trip, result.stopId, day.id);
    return `This ${activityDurationLabel(duration) ?? "full-day"} experience does not fit an evening slot on Day ${day.dayNumber}.${alternative ? ` Day ${alternative.dayNumber} currently has no other activities or transfers.` : " Choose another day and review its existing plans."}${suffix}`;
  }
  if (fullDay && (otherPlans > 0 || composition.transfers.length > 0)) return `This ${activityDurationLabel(duration) ?? "full-day"} experience may overlap with other plans on Day ${day.dayNumber}. Adding it will not replace them.${suffix}`;
  if (fullDay) return `Day ${day.dayNumber} currently has no other activities or transfers, so it is the clearest fit for this ${activityDurationLabel(duration) ?? "full-day"} experience.${suffix}`;
  if (part && occupiedPart) return `Day ${day.dayNumber} already has ${composition.planned[part].length} ${part} ${composition.planned[part].length === 1 ? "plan" : "plans"}. Adding this keeps them in place, so review the order.${suffix}`;
  if (part) return `The ${part} on Day ${day.dayNumber} currently has no planned activity.${suffix}`;
  return `Day ${day.dayNumber} is the selected planning context. Choose a part of day to place it without replacing existing plans.${suffix}`;
}

function sharedDetail(input: {
  trip: EasyTTrip; context: RecommendationDetailContext; id: string; stopId: string | null;
  kind: RecommendationDetailKind; title: string; location?: string | null; summary?: string | null;
  image?: string | null; category?: string | null; duration?: string | null; price?: string | null;
  state: ExploreResultState; provider?: string | null; providerProductId?: string | null;
  bookingHref?: string | null; rating?: number; reviewCount?: number; whyFit: string;
  coordinates?: [number, number];
}): RecommendationDetailModel {
  const when = input.state.state === "planned" ? `Day ${input.state.day.dayNumber}${input.state.idea.dayPart ? ` · ${titleCase(input.state.idea.dayPart)}` : ""}` : null;
  const labelledProvider = providerLabel(input.provider);
  const rating = ratingFact(input.rating, input.reviewCount);
  return {
    id: input.id,
    contextKey: recommendationDetailContextKey({ tripId: input.trip.id, stopId: input.stopId, resultId: input.id, providerProductId: input.providerProductId, activeDayId: input.context.activeDayId, activeDayPart: input.context.activeDayPart }),
    kind: input.kind,
    title: input.title,
    location: input.location,
    summary: input.summary,
    image: input.image,
    imageAlt: input.image ? `${input.title} recommendation` : null,
    category: input.category,
    duration: input.duration,
    price: input.price,
    dateSummary: when,
    bookingStatus: input.state.state === "planned" ? `Added to ${when}` : input.state.state === "saved" ? "Saved for later" : null,
    bookingHref: input.bookingHref,
    provider: input.provider,
    providerProductId: input.providerProductId,
    whyFit: input.whyFit,
    whyFitLabel: "Why this fits your trip",
    practical: [
      ...(labelledProvider ? [{ label: "Source", value: labelledProvider }] : []),
      ...(input.providerProductId ? [{ label: "Product", value: input.providerProductId }] : []),
      ...(rating ? [{ label: "Rating", value: rating }] : []),
      ...(!input.coordinates ? [{ label: "Map", value: "Unavailable · No trustworthy coordinates are attached to this recommendation yet." }] : []),
    ],
    canRemove: input.state.state !== "available",
  };
}

export function recommendationDetailForExploreResult(input: { trip: EasyTTrip; result: ExploreResult; context: RecommendationDetailContext; state?: ExploreResultState }) {
  const state = input.state ?? exploreResultState(input.trip, input.result);
  return sharedDetail({
    trip: input.trip, context: input.context, id: input.result.identity, stopId: input.result.stopId,
    kind: input.result.kind, title: input.result.title, location: input.result.location,
    summary: input.result.description, image: input.result.image, category: input.result.category,
    duration: input.result.duration, price: input.result.price, state, provider: input.result.provider,
    providerProductId: input.result.providerProductId, bookingHref: null,
    rating: input.result.rating, reviewCount: input.result.reviewCount,
    whyFit: recommendationTripFit(input.trip, input.result, state, input.context), coordinates: input.result.coordinates,
  });
}

export function recommendationDetailForMapResult(input: { trip: EasyTTrip; result: MapResultPlace; context: RecommendationDetailContext }) {
  const idea = input.result.canonicalItemId
    ? (input.trip.brief.itineraryIdeas ?? []).find((candidate) => candidate.id === input.result.canonicalItemId)
    : (input.trip.brief.itineraryIdeas ?? []).find((candidate) => candidate.stopId === input.result.stopId && candidate.placeId === input.result.sourceId);
  const stopId = input.result.stopId ?? idea?.stopId ?? "";
  const projectedIdea: ItineraryIdea = idea ?? {
    id: `map-detail-${input.result.selectionId}`, stopId, placeId: input.result.sourceId, title: input.result.name,
    category: input.result.kind === "eat" ? "restaurant" : "activity",
    coordinates: input.result.coordinates, image: input.result.image, sourceUrl: input.result.providerUrl,
    area: input.result.address || undefined, placeType: input.result.category || undefined,
    description: input.result.description, source: "personalised-recommendation", reasons: [],
  };
  const plannedDay = idea?.dayId ? input.trip.planItems.find((day) => day.id === idea.dayId) ?? null : null;
  const state: ExploreResultState = input.result.state === "scheduled" && idea && plannedDay
    ? { state: "planned", idea, day: plannedDay }
    : input.result.state === "saved" && idea ? { state: "saved", idea, day: null } : { state: "available", idea: null, day: null };
  const localPrice = input.result.price && Number.isFinite(input.result.price.total)
    ? money({ amount: input.result.price.total, currency: input.result.price.currency })
    : input.result.priceLevel?.replace(/^PRICE_LEVEL_/, "").replaceAll("_", " ").toLocaleLowerCase();
  const result: ExploreResult = {
    identity: input.result.selectionId, stopId, sourceId: input.result.sourceId,
    kind: input.result.kind === "eat" ? "restaurant" : "activity", title: input.result.name,
    location: input.result.address, category: input.result.category, tags: input.result.tags ?? [],
    description: input.result.description, image: input.result.image, coordinates: input.result.coordinates,
    duration: input.result.duration ?? activityDurationLabel(idea?.providerMetadata?.duration) ?? undefined,
    price: input.result.priceLabel ?? localPrice ?? money(idea?.providerMetadata?.price) ?? undefined,
    rating: input.result.rating ?? idea?.providerMetadata?.rating,
    reviewCount: input.result.reviewCount ?? idea?.providerMetadata?.reviewCount,
    provider: input.result.provider ?? idea?.provider, providerProductId: input.result.providerProductId ?? idea?.providerProductId,
    providerUrl: input.result.providerUrl ?? idea?.sourceUrl, idea: projectedIdea,
  };
  const detail = recommendationDetailForExploreResult({ trip: input.trip, result, context: input.context, state });
  return {
    ...detail,
    practical: [
      ...(detail.practical ?? []),
      ...(input.result.distanceKm !== undefined ? [{ label: "Distance", value: `${input.result.distanceKm.toFixed(1)} km` }] : []),
      ...(input.result.operational === true ? [{ label: "Status", value: "Operational" }] : []),
      ...(input.result.availability ? [{ label: "Availability", value: input.result.availability === "available" ? "Available in provider response" : "Check with provider" }] : []),
      ...(input.result.cancellation ? [{ label: "Cancellation", value: input.result.cancellation }] : []),
    ],
  };
}
