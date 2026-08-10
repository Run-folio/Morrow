export type TravelProfile = {
  pace: "slow" | "balanced" | "full";
  priority: "food" | "nature" | "culture" | "mix";
  hotelMoves: "few" | "some" | "open";
  budget: "value" | "mid" | "high";
};

export const defaultTravelProfile: TravelProfile = {
  pace: "balanced",
  priority: "mix",
  hotelMoves: "few",
  budget: "mid",
};

export const isTravelProfile = (value: unknown): value is TravelProfile => {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<TravelProfile>;
  return ["slow", "balanced", "full"].includes(profile.pace ?? "")
    && ["food", "nature", "culture", "mix"].includes(profile.priority ?? "")
    && ["few", "some", "open"].includes(profile.hotelMoves ?? "")
    && ["value", "mid", "high"].includes(profile.budget ?? "");
};
