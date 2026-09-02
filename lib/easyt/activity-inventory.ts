import type { ItineraryIdea } from "./trip.ts";
import type { TripInterest } from "./trip-interest.ts";
import { itineraryInterestAffinity } from "./itinerary-day-context.ts";

export type ActivityInventoryItem = {
  provider: "viator";
  source: "viator";
  providerProductId: string;
  title: string;
  destination: { canonicalPlaceId: string; label: string; providerDestinationId?: string };
  image?: string;
  tags?: string[];
  rating?: number;
  reviewCount?: number;
  duration?: { fixedMinutes?: number; fromMinutes?: number; toMinutes?: number };
  price?: { amount: number; currency: string };
  productUrl?: string;
  provenance: { kind: "live_provider_search"; provider: "viator"; checkedAt: string };
};

export function activityInventoryIdentity(item: Pick<ActivityInventoryItem, "provider" | "providerProductId">) {
  return `${item.provider}:${item.providerProductId}`;
}

function ideaId(stopId: string, item: Pick<ActivityInventoryItem, "provider" | "providerProductId">) {
  const productId = item.providerProductId.replace(/[^a-z0-9_-]+/gi, "-");
  return `idea-${stopId}-${item.provider}-${productId}`;
}

/** Persist only the selected product's useful identity and display evidence. */
export function itineraryIdeaForActivityInventory(stopId: string, item: ActivityInventoryItem, interests: readonly TripInterest[] = []): ItineraryIdea {
  const affinity = itineraryInterestAffinity({ title: item.title, type: "Experience", tags: item.tags ?? [], description: "" }, interests);
  return {
    id: ideaId(stopId, item),
    stopId,
    placeId: activityInventoryIdentity(item),
    title: item.title,
    category: "activity",
    image: item.image,
    sourceUrl: item.productUrl,
    area: item.destination.label,
    placeType: "Bookable experience",
    source: "live-provider-inventory",
    reasons: affinity.matchedInterests.length ? ["interest-relevance"] : [],
    provider: item.provider,
    providerProductId: item.providerProductId,
    providerMetadata: {
      ...(item.rating !== undefined ? { rating: item.rating } : {}),
      ...(item.reviewCount !== undefined ? { reviewCount: item.reviewCount } : {}),
      ...(item.duration ? { duration: { ...item.duration } } : {}),
      ...(item.price ? { price: { ...item.price } } : {}),
      provenance: { ...item.provenance },
    },
  };
}

/** Existing Morrovia affinity is a bounded boost over provider order. */
export function rankActivityInventory(items: readonly ActivityInventoryItem[], interests: readonly TripInterest[]) {
  return items.map((item, index) => ({
    item,
    index,
    score: Math.max(0, 12 - index) + itineraryInterestAffinity({ title: item.title, type: "Experience", tags: item.tags ?? [], description: "" }, interests).score,
  })).sort((left, right) => right.score - left.score || left.index - right.index).map(({ item }) => item);
}
