export type PlanningExpectation = {
  preserved: string[];
  broad?: string[];
  visit?: string[];
  interests?: string[];
  suggestionRange: [number, number];
  coherence?: "coherent" | "needs-review";
};

/** Human-reviewed acceptance ranges frozen before the Terra candidate run. */
export const PLANNING_MODEL_EXPECTATIONS: Record<string, PlanningExpectation> = {
  "explicit-europe": { preserved: ["Paris", "Amsterdam", "Brussels"], suggestionRange: [0, 0], coherence: "coherent" },
  "africa-serengeti": { preserved: ["Africa", "Serengeti"], broad: ["Africa"], visit: ["Serengeti"], suggestionRange: [2, 6] },
  "thailand-country": { preserved: ["Thailand"], broad: ["Thailand"], suggestionRange: [3, 6] },
  "thailand-interests": { preserved: ["Thailand"], broad: ["Thailand"], interests: ["food", "coast", "culture"], suggestionRange: [3, 6] },
  "philippines-archipelago": { preserved: ["Philippines"], broad: ["Philippines"], suggestionRange: [3, 6] },
  "australia-short": { preserved: ["Australia"], broad: ["Australia"], suggestionRange: [2, 4] },
  "tikal-landmark": { preserved: ["Tikal"], visit: ["Tikal"], suggestionRange: [1, 4] },
  "atitlan-natural-area": { preserved: ["Lake Atitlán"], visit: ["Lake Atitlán"], suggestionRange: [1, 4] },
  "tokyo-thailand-mixed": { preserved: ["Tokyo", "Thailand"], broad: ["Thailand"], suggestionRange: [2, 5] },
  "explicit-japan": { preserved: ["Tokyo", "Kanazawa", "Takayama", "Kyoto"], suggestionRange: [0, 0], coherence: "coherent" },
  "short-italy-coast": { preserved: ["Italy", "Rome", "coast"], broad: ["Italy"], suggestionRange: [1, 4] },
  "incoherent-seven-days": { preserved: ["London", "Tokyo", "Bali", "New York"], suggestionRange: [0, 0], coherence: "needs-review" },
};
