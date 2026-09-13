export const discoveryCategories = ["for-you", "must-see", "food", "tours", "day-trips", "outdoors"] as const;
export type DiscoveryCategory = typeof discoveryCategories[number];

export const discoveryCategoryLabels: Record<DiscoveryCategory, string> = {
  "for-you": "For you",
  "must-see": "Must-see",
  food: "Food",
  tours: "Tours",
  "day-trips": "Day trips",
  outdoors: "Outdoors",
};

/** Map keeps Eat as a top-level mode, so Food is not repeated inside See. */
export const mapSeeDiscoveryCategories = discoveryCategories.filter(
  (category): category is Exclude<DiscoveryCategory, "food"> => category !== "food",
);

type DiscoveryCandidate = {
  kind?: "activity" | "restaurant" | "tour";
  category?: string;
  tags?: readonly string[];
  qualityScore?: number;
};

const normalized = (value: string | undefined) => value?.trim().replace(/\s+/g, " ").toLocaleLowerCase() ?? "";

const outdoorTypes = new Set([
  "beach",
  "coast",
  "garden",
  "hike",
  "island",
  "lake",
  "mountain",
  "natural area",
  "nature",
  "outdoors",
  "park",
  "trail",
  "viewpoint",
]);

const indoorTypes = new Set([
  "cafe",
  "culture",
  "gallery",
  "historic site",
  "market",
  "museum",
  "restaurant",
  "shopping",
  "theater",
  "theatre",
]);

/**
 * Shared Explore/Map membership boundary. Free prose and a name containing
 * “Park” are deliberately excluded from outdoors evidence: a provider must
 * classify the place or attach a semantic tag.
 */
export function discoveryCategoryMatches(candidate: DiscoveryCandidate, category: DiscoveryCategory) {
  if (category === "for-you") return true;
  if (category === "must-see") return normalized(candidate.category) !== "day trip"
    && typeof candidate.qualityScore === "number" && candidate.qualityScore >= 10;
  if (category === "food") return candidate.kind === "restaurant";
  if (category === "tours") return candidate.kind === "tour";

  const semanticCategory = normalized(candidate.category);
  const semanticTags = new Set((candidate.tags ?? []).map((tag) => normalized(tag)));
  if (category === "day-trips") {
    return semanticCategory === "day trip"
      || semanticTags.has("day trip")
      || semanticTags.has("day-trips");
  }

  if (indoorTypes.has(semanticCategory)) return false;
  return outdoorTypes.has(semanticCategory)
    || [...semanticTags].some((tag) => outdoorTypes.has(tag));
}
