import { normalizeTripInterests, tripInterestIds, type TripInterest } from "./trip-interest.ts";

export type TravelProfile = {
  pace: "slow" | "balanced" | "full";
  usualInterests: TripInterest[];
  hotelMoves: "few" | "some" | "open";
  budget: "value" | "mid" | "high";
};

export const defaultTravelProfile: TravelProfile = {
  pace: "balanced",
  usualInterests: [],
  hotelMoves: "few",
  budget: "mid",
};

function hasValidBaseProfile(value: unknown): value is Record<string, unknown> & Pick<TravelProfile, "pace" | "hotelMoves" | "budget"> {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<TravelProfile>;
  return ["slow", "balanced", "full"].includes(profile.pace ?? "")
    && ["few", "some", "open"].includes(profile.hotelMoves ?? "")
    && ["value", "mid", "high"].includes(profile.budget ?? "");
}

/**
 * Read both current and legacy profile documents without treating the old
 * single priority field as permanent canonical interests. Only an explicit
 * usualInterests array can become a reusable default.
 */
export function travelProfileFromUnknown(value: unknown): TravelProfile | null {
  if (!hasValidBaseProfile(value)) return null;
  const usualInterests = Array.isArray(value.usualInterests)
    ? normalizeTripInterests(value.usualInterests.filter((item): item is string => typeof item === "string"))
    : [];
  return {
    pace: value.pace,
    usualInterests,
    hotelMoves: value.hotelMoves,
    budget: value.budget,
  };
}

export const isTravelProfile = (value: unknown): value is TravelProfile => {
  if (!hasValidBaseProfile(value) || !Array.isArray(value.usualInterests)) return false;
  return value.usualInterests.every((interest) => typeof interest === "string" && tripInterestIds.includes(interest as TripInterest))
    && new Set(value.usualInterests).size === value.usualInterests.length;
};

/** Profile defaults seed an untouched new trip; they never overwrite edits. */
export function tripInterestsWithProfileDefaults(
  current: readonly TripInterest[],
  profile: TravelProfile | null | undefined,
  explicitlyEdited: boolean,
) {
  return explicitlyEdited || current.length ? [...current] : [...(profile?.usualInterests ?? [])];
}
