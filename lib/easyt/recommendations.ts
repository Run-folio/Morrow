import type { TravelProfile } from "./travel-profile";

export type FinderMoment = "now" | "free-hour" | "rainy" | "last-night" | "before-transfer";
export type FinderPlace = { id: string; name: string; category: string; distanceKm?: number; address: string };

export type FinderRecommendation = {
  score: number;
  reasons: string[];
  confidence: "high" | "medium";
};

/**
 * A small, deterministic recommendation layer shared by finders. It only
 * explains facts we hold locally or receive from the mapped-venue response;
 * it deliberately makes no claim about live opening hours or availability.
 */
export function recommendNearbyPlace(
  place: FinderPlace,
  input: {
    kind: "restaurant" | "stay";
    moment?: FinderMoment;
    mood?: "local" | "comfort" | "surprise";
    pace?: "quick" | "relaxed" | "occasion";
    profile?: Partial<TravelProfile>;
  },
): FinderRecommendation {
  const text = `${place.name} ${place.category}`.toLowerCase();
  const reasons: string[] = [];
  let score = 0;
  const distance = place.distanceKm;

  if (typeof distance === "number") {
    if (distance <= 0.6) { score += 8; reasons.push(`${Math.round(distance * 1000)} m from this day’s location`); }
    else if (distance <= 1.5) { score += 5; reasons.push(`${distance.toFixed(1)} km from this day’s location`); }
    else if (distance <= 3) { score += 2; reasons.push(`${distance.toFixed(1)} km away, still a practical detour`); }
  }

  const quick = /cafe|fast.?food|bakery|noodle|ramen|counter|market/i.test(text);
  const local = /local|regional|traditional|seafood|sushi|curry|noodle|market/i.test(text);
  const sheltered = /cafe|restaurant|museum|gallery|hotel|guest/i.test(text);
  if (input.pace === "quick" || input.moment === "now" || input.moment === "free-hour") {
    if (quick) { score += 6; reasons.push("suited to a quick, low-detour stop"); }
  }
  if (input.mood === "local" || input.profile?.priority === "food") {
    if (local) { score += 6; reasons.push("matches your interest in local food"); }
  }
  if (input.mood === "comfort" || input.profile?.pace === "slow") {
    if (/cafe|bakery|hotel|guest|restaurant/i.test(text)) { score += 3; reasons.push("a calmer fit for your preferred pace"); }
  }
  if (input.moment === "rainy" && sheltered) { score += 4; reasons.push("an indoor-friendly option for a rainy spell"); }
  if (input.moment === "before-transfer" && typeof distance === "number" && distance <= 1.5) { score += 4; reasons.push("close enough to keep your transfer day simple"); }
  if (input.kind === "stay" && typeof distance === "number" && distance <= 1.5) { score += 3; reasons.push("keeps tomorrow’s base close to today’s plan"); }
  if (!reasons.length) reasons.push("a named, mapped place near today’s location");

  return { score, reasons: reasons.slice(0, 2), confidence: typeof distance === "number" ? "high" : "medium" };
}

export const finderMoments: Array<{ value: FinderMoment; label: string }> = [
  { value: "now", label: "Right now" },
  { value: "free-hour", label: "One free hour" },
  { value: "rainy", label: "Rainy afternoon" },
  { value: "last-night", label: "Last evening" },
  { value: "before-transfer", label: "Before a transfer" },
];
