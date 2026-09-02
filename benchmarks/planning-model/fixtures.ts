export type PlanningModelBenchmarkFixture = {
  id: string;
  prompt: string;
  cohort: "simple" | "complex";
};

/** Fixed before the Terra rollout decision. Expectations are evaluated by the
 * benchmark harness; this source corpus must not be rewritten after results. */
export const PLANNING_MODEL_BENCHMARK_FIXTURES: PlanningModelBenchmarkFixture[] = [
  { id: "explicit-europe", cohort: "simple", prompt: "Paris, Amsterdam and Brussels for 8 days." },
  { id: "africa-serengeti", cohort: "complex", prompt: "I would like to go to Africa to see the Serengeti." },
  { id: "thailand-country", cohort: "complex", prompt: "Thailand for 12 days." },
  { id: "thailand-interests", cohort: "complex", prompt: "Thailand for 12 days, food, beaches and temples." },
  { id: "philippines-archipelago", cohort: "complex", prompt: "Philippines for two weeks." },
  { id: "australia-short", cohort: "complex", prompt: "Australia for 10 days." },
  { id: "tikal-landmark", cohort: "complex", prompt: "I want to visit Tikal." },
  { id: "atitlan-natural-area", cohort: "complex", prompt: "Lake Atitlán." },
  { id: "tokyo-thailand-mixed", cohort: "complex", prompt: "Tokyo, then somewhere relaxing in Thailand." },
  { id: "explicit-japan", cohort: "simple", prompt: "Tokyo, Kanazawa, Takayama, Kyoto." },
  { id: "short-italy-coast", cohort: "complex", prompt: "5 days in Italy, Rome and somewhere on the coast." },
  { id: "incoherent-seven-days", cohort: "complex", prompt: "London, Tokyo, Bali and New York in 7 days." },
];
