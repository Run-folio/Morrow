export const tripInterestIds = ["food", "culture", "nature", "cities", "beach", "hiking"] as const;

export type TripInterest = (typeof tripInterestIds)[number];

export const tripInterestLabels: Record<"en" | "es", Record<TripInterest, string>> = {
  en: {
    food: "Food",
    culture: "Culture",
    nature: "Nature",
    cities: "Cities",
    beach: "Beach",
    hiking: "Hiking",
  },
  es: {
    food: "Comida",
    culture: "Cultura",
    nature: "Naturaleza",
    cities: "Ciudades",
    beach: "Playa",
    hiking: "Senderismo",
  },
};

const canonicalInterestByLegacyValue: Record<string, TripInterest | undefined> = {
  food: "food",
  culture: "culture",
  nature: "nature",
  cities: "cities",
  city: "cities",
  beach: "beach",
  coast: "beach",
  hiking: "hiking",
};

/**
 * Normalize persisted, capture and editorial values at the canonical trip
 * boundary. Unknown values stay neutral rather than becoming invented fit.
 */
export function normalizeTripInterests(values: readonly string[] | null | undefined): TripInterest[] {
  return (values ?? []).flatMap((value) => {
    const normalized = canonicalInterestByLegacyValue[value.trim().toLocaleLowerCase()];
    return normalized ? [normalized] : [];
  }).filter((value, index, all) => all.indexOf(value) === index);
}

const evidenceTagsByInterest: Record<TripInterest, readonly string[]> = {
  food: ["food"],
  culture: ["culture"],
  nature: ["nature"],
  cities: ["cities", "city"],
  beach: ["beach", "coast"],
  hiking: ["hiking"],
};

/** Match only explicit, evidenced destination tags. No evidence is neutral. */
export function matchingTripInterests(
  interests: readonly TripInterest[],
  destinationTags: readonly string[],
): TripInterest[] {
  const normalizedTags = new Set(destinationTags.map((tag) => tag.trim().toLocaleLowerCase()));
  return interests.filter((interest) => evidenceTagsByInterest[interest].some((tag) => normalizedTags.has(tag)));
}
