import type { FinalPlanConstraints, PlanValidationIssueCode } from "../../lib/easyt/plan-validator.ts";
import type { EstimatedLeg, PlannerStop } from "../../lib/easyt/planner.ts";

export type ConstraintOutcome = "valid" | "valid-but-poor" | "constrained-compromise" | "impossible";

export type ConstraintGauntletCase = {
  id: string;
  name: string;
  rawPrompt: string;
  hardFacts: string[];
  hardConflict: string | null;
  possibleSoftCompromise: string | null;
  expectedCanBuildTrip: boolean;
  expectedOutcome: ConstraintOutcome;
  expectedValidatorIssues: PlanValidationIssueCode[];
  prohibitedPlannerBehaviour: string[];
  origin: { name: string; coordinates: [number, number] };
  stops: Array<PlannerStop & {
    required?: boolean;
    optional?: boolean;
    anchor?: boolean;
    fixedNights?: number;
    fallbackMinimumNights?: number;
    fallbackIdealNights?: number;
    arrivalDate?: string;
    departureDate?: string;
  }>;
  totalNights: number;
  pace?: "relaxed" | "balanced" | "fast" | "packed";
  constraints?: FinalPlanConstraints;
  excludedDestinations?: string[];
  planNights?: Record<string, number>;
  estimateLeg?: (from: PlannerStop | { name: string; coordinates?: [number, number] }, to: PlannerStop) => EstimatedLeg;
};

const stop = (
  id: string,
  name: string,
  country: string,
  coordinates: [number, number],
  extra: Omit<ConstraintGauntletCase["stops"][number], keyof PlannerStop> = {},
): ConstraintGauntletCase["stops"][number] => ({ id, name, country, coordinates, ...extra });

const origin = { name: "Verified origin", coordinates: [0, 0] as [number, number] };
const linearStops = (count: number, required = true) => Array.from({ length: count }, (_, index) => stop(
  `stop-${index + 1}`,
  `Stop ${index + 1}`,
  "Testland",
  [index + 1, 0],
  { required },
));

const threeHourLeg: ConstraintGauntletCase["estimateLeg"] = (from, to) => ({
  mode: "train",
  distanceKm: Math.round(Math.abs((to.coordinates?.[0] ?? 0) - (from.coordinates?.[0] ?? 0)) * 100),
  durationMinutes: 180,
  label: `${from.name} → ${to.name}`,
  note: "Deterministic gauntlet connection.",
  confidence: "high",
});

export const CONSTRAINT_GAUNTLET_CASES: ConstraintGauntletCase[] = [
  {
    id: "eight-stops-three-days",
    name: "Eight stops in three days",
    rawPrompt: "Three days and all eight stops are required.",
    hardFacts: ["3 calendar days", "2 nights", "8 retained required stops"],
    hardConflict: "There are fewer nights than retained required stops.",
    possibleSoftCompromise: "Add time or explicitly remove required stops.",
    expectedCanBuildTrip: false,
    expectedOutcome: "impossible",
    expectedValidatorIssues: ["minimum-stay-conflict", "below-minimum-stay"],
    prohibitedPlannerBehaviour: ["Present zero-night stops as valid.", "Drop required stops to make the arithmetic fit."],
    origin,
    stops: linearStops(8),
    totalNights: 2,
  },
  {
    id: "required-stops-exceed-maximum",
    name: "Three required destinations under a maximum of two",
    rawPrompt: "Tokyo, Kyoto and Osaka are all essential, but no more than 2 stops.",
    hardFacts: ["Tokyo required", "Kyoto required", "Osaka required", "maximumStops = 2"],
    hardConflict: "Three protected destinations cannot fit a hard two-stop maximum.",
    possibleSoftCompromise: "Raise the stop maximum or choose which requirement to release.",
    expectedCanBuildTrip: false,
    expectedOutcome: "impossible",
    expectedValidatorIssues: ["hard-constraint-violation"],
    prohibitedPlannerBehaviour: ["Silently discard one destination.", "Score a two-stop candidate as satisfying all three requirements."],
    origin: { name: "Tokyo", coordinates: [139.6917, 35.6895] },
    stops: [
      stop("tokyo", "Tokyo", "Japan", [139.6917, 35.6895], { required: true }),
      stop("kyoto", "Kyoto", "Japan", [135.7681, 35.0116], { required: true }),
      stop("osaka", "Osaka", "Japan", [135.5023, 34.6937], { required: true }),
    ],
    totalNights: 5,
    constraints: { requiredStopIds: ["tokyo", "kyoto", "osaka"], maximumStops: 2 },
  },
  {
    id: "six-day-relaxed-japan",
    name: "Six Japanese cities in six days without rushing",
    rawPrompt: "Six days: Tokyo, Kyoto, Osaka, Hiroshima, Kanazawa and Takayama. Don't rush.",
    hardFacts: ["6 calendar days", "5 nights", "6 retained cities", "relaxed pace"],
    hardConflict: "Every retained city cannot receive even one night.",
    possibleSoftCompromise: "Add days or let the traveller remove cities; relaxed pace cannot override required-stop arithmetic.",
    expectedCanBuildTrip: false,
    expectedOutcome: "impossible",
    expectedValidatorIssues: ["minimum-stay-conflict", "below-minimum-stay"],
    prohibitedPlannerBehaviour: ["Relabel a rushed route as relaxed.", "Retain a zero-night city in a valid plan."],
    origin: { name: "Tokyo", coordinates: [139.6917, 35.6895] },
    stops: [
      stop("tokyo", "Tokyo", "Japan", [139.6917, 35.6895], { required: true }),
      stop("kyoto", "Kyoto", "Japan", [135.7681, 35.0116], { required: true }),
      stop("osaka", "Osaka", "Japan", [135.5023, 34.6937], { required: true }),
      stop("hiroshima", "Hiroshima", "Japan", [132.4553, 34.3853], { required: true }),
      stop("kanazawa", "Kanazawa", "Japan", [136.6562, 36.5613], { required: true }),
      stop("takayama", "Takayama", "Japan", [137.2522, 36.1461], { required: true }),
    ],
    totalNights: 5,
    pace: "relaxed",
  },
  {
    id: "fixed-gateways-insufficient-time",
    name: "Fixed gateways leave no time for must-visits",
    rawPrompt: "Start at Gateway A and end at Gateway B in four days; X, Y and Z are all must-visits.",
    hardFacts: ["fixed arrival gateway", "fixed departure gateway", "3 must-visits", "3 nights"],
    hardConflict: "Five protected stops cannot receive a night inside the fixed window.",
    possibleSoftCompromise: "Move a gateway, add nights or explicitly release a must-visit.",
    expectedCanBuildTrip: false,
    expectedOutcome: "impossible",
    expectedValidatorIssues: ["minimum-stay-conflict", "below-minimum-stay"],
    prohibitedPlannerBehaviour: ["Move either fixed gateway.", "Drop a must-visit without a traveller decision."],
    origin,
    stops: [
      stop("gateway-a", "Gateway A", "Testland", [0, 0], { required: true }),
      stop("x", "X", "Testland", [1, 0], { required: true }),
      stop("y", "Y", "Testland", [2, 0], { required: true }),
      stop("z", "Z", "Testland", [3, 0], { required: true }),
      stop("gateway-b", "Gateway B", "Testland", [4, 0], { required: true }),
    ],
    totalNights: 3,
    constraints: { fixedStartStopId: "gateway-a", fixedEndStopId: "gateway-b", requiredStopIds: ["gateway-a", "x", "y", "z", "gateway-b"] },
  },
  {
    id: "fixed-accommodation-route-order",
    name: "Fixed accommodation conflicts with route order",
    rawPrompt: "A then B then C, with B accommodation fixed on 2 October.",
    hardFacts: ["entered order protected", "B booking fixed on 2026-10-02", "B is reached on 2026-10-03"],
    hardConflict: "The protected route reaches B after its fixed accommodation date.",
    possibleSoftCompromise: "Change the route order only after the traveller unlocks it, or change the booking.",
    expectedCanBuildTrip: false,
    expectedOutcome: "impossible",
    expectedValidatorIssues: ["fixed-date-conflict"],
    prohibitedPlannerBehaviour: ["Move the fixed booking date.", "Reorder protected stops during repair."],
    origin,
    stops: [
      stop("a", "A", "Testland", [1, 0], { required: true, arrivalDate: "2026-10-01", departureDate: "2026-10-03" }),
      stop("b", "B", "Testland", [2, 0], { required: true, arrivalDate: "2026-10-03", departureDate: "2026-10-05" }),
      stop("c", "C", "Testland", [3, 0], { required: true, arrivalDate: "2026-10-05", departureDate: "2026-10-07" }),
    ],
    totalNights: 6,
    planNights: { a: 2, b: 2, c: 2 },
    constraints: { requiredStopIds: ["a", "b", "c"], fixedCommitments: [{ label: "B accommodation", date: "2026-10-02", stopId: "b" }] },
  },
  {
    id: "no-flights-impossible-geography",
    name: "No flights across impossible geography",
    rawPrompt: "Four days from London to Tokyo and Sydney. No flights; both cities are required.",
    hardFacts: ["flight excluded", "Tokyo required", "Sydney required", "4 calendar days"],
    hardConflict: "Current supported estimates require a flight and no compliant alternative is known.",
    possibleSoftCompromise: "Allow flying, change the geography or add time after confirming a ground/sea route.",
    expectedCanBuildTrip: false,
    expectedOutcome: "impossible",
    expectedValidatorIssues: ["transport-restriction-conflict"],
    prohibitedPlannerBehaviour: ["Treat no flights as a soft preference.", "Invent a rail or ferry service."],
    origin: { name: "London", coordinates: [-0.1276, 51.5072] },
    stops: [
      stop("tokyo", "Tokyo", "Japan", [139.6917, 35.6895], { required: true }),
      stop("sydney", "Sydney", "Australia", [151.2093, -33.8688], { required: true }),
    ],
    totalNights: 3,
    constraints: { requiredStopIds: ["tokyo", "sydney"], excludedTransportModes: ["flight"] },
  },
  {
    id: "no-driving-road-only-connection",
    name: "No driving on a known road-only route",
    rawPrompt: "Visit Road A and Road B in three days. No driving.",
    hardFacts: ["road travel excluded", "current deterministic connection is road"],
    hardConflict: "The known connection violates the no-driving constraint.",
    possibleSoftCompromise: "Confirm a supported non-road service or change a stop.",
    expectedCanBuildTrip: false,
    expectedOutcome: "impossible",
    expectedValidatorIssues: ["transport-restriction-conflict"],
    prohibitedPlannerBehaviour: ["Replace the known road leg with an unexplained unknown and pass the route.", "Invent rail availability."],
    origin,
    stops: [
      stop("road-a", "Road A", "Testland", [0.1, 0], { required: true }),
      stop("road-b", "Road B", "Testland", [0.3, 0], { required: true }),
    ],
    totalNights: 2,
    constraints: { requiredStopIds: ["road-a", "road-b"], avoidDriving: true, excludedTransportModes: ["road"] },
  },
  {
    id: "maximum-transfer-every-candidate",
    name: "Every candidate violates maximum transfer time",
    rawPrompt: "A, B and C with no transfer over 2 hours.",
    hardFacts: ["maximum transfer = 120 minutes", "every supported leg = 180 minutes"],
    hardConflict: "No candidate satisfies the maximum transfer-time ceiling.",
    possibleSoftCompromise: "Raise the transfer ceiling, add an intermediate stop or change destinations.",
    expectedCanBuildTrip: false,
    expectedOutcome: "impossible",
    expectedValidatorIssues: ["maximum-transfer-time-conflict"],
    prohibitedPlannerBehaviour: ["Select the least-bad violating candidate as valid.", "Hide the violated ceiling inside scoring."],
    origin,
    stops: [
      stop("a", "A", "Testland", [1, 0], { required: true }),
      stop("b", "B", "Testland", [2, 0], { required: true }),
      stop("c", "C", "Testland", [3, 0], { required: true }),
    ],
    totalNights: 5,
    constraints: { requiredStopIds: ["a", "b", "c"], maximumTransferMinutes: 120 },
    estimateLeg: threeHourLeg,
  },
  {
    id: "fixed-minimum-nights-exceed-window",
    name: "Fixed minimum nights exceed available nights",
    rawPrompt: "A, B and C for eight days; each fixed booking is three nights.",
    hardFacts: ["7 available nights", "9 fixed nights", "all fixed stays protected"],
    hardConflict: "The immutable fixed-night total exceeds the trip window.",
    possibleSoftCompromise: "Extend the dates or change a booking.",
    expectedCanBuildTrip: false,
    expectedOutcome: "impossible",
    expectedValidatorIssues: ["total-nights-mismatch"],
    prohibitedPlannerBehaviour: ["Shorten a fixed stay during allocation or repair.", "Save a plan whose night total does not reconcile."],
    origin,
    stops: [
      stop("a", "A", "Testland", [1, 0], { required: true, fixedNights: 3 }),
      stop("b", "B", "Testland", [2, 0], { required: true, fixedNights: 3 }),
      stop("c", "C", "Testland", [3, 0], { required: true, fixedNights: 3 }),
    ],
    totalNights: 7,
    planNights: { a: 3, b: 3, c: 3 },
    constraints: { requiredStopIds: ["a", "b", "c"] },
  },
  {
    id: "required-stop-added-after-allocation",
    name: "Required stop added after all nights are consumed",
    rawPrompt: "A and B already use all four nights; C is now also required.",
    hardFacts: ["4 available nights", "A required", "B required", "new C required"],
    hardConflict: "The new required stop cannot be retained with a valid positive-night allocation under the current minimums.",
    possibleSoftCompromise: "Rebalance only if every retained stop remains valid, otherwise add time or release a stop.",
    expectedCanBuildTrip: false,
    expectedOutcome: "impossible",
    expectedValidatorIssues: ["minimum-stay-conflict", "below-minimum-stay"],
    prohibitedPlannerBehaviour: ["Keep C at zero nights and call the trip valid.", "Drop A or B without permission."],
    origin,
    stops: [
      stop("a", "A", "Testland", [1, 0], { required: true, fixedNights: 2, fallbackMinimumNights: 2, fallbackIdealNights: 2 }),
      stop("b", "B", "Testland", [2, 0], { required: true, fixedNights: 2, fallbackMinimumNights: 2, fallbackIdealNights: 2 }),
      stop("c", "C", "Testland", [3, 0], { required: true, fallbackMinimumNights: 2, fallbackIdealNights: 2 }),
    ],
    totalNights: 4,
    constraints: { requiredStopIds: ["a", "b", "c"] },
  },
  {
    id: "required-and-excluded-same-place",
    name: "A destination is both required and excluded",
    rawPrompt: "X is essential, but never enter Testland.",
    hardFacts: ["X must be visited", "X lies in explicitly excluded Testland"],
    hardConflict: "A required destination cannot be retained while its country is excluded.",
    possibleSoftCompromise: "Ask the traveller which constraint to release.",
    expectedCanBuildTrip: false,
    expectedOutcome: "impossible",
    expectedValidatorIssues: ["hard-constraint-violation"],
    prohibitedPlannerBehaviour: ["Ignore the exclusion.", "Drop the must-visit and proceed silently."],
    origin,
    stops: [stop("x", "X", "Testland", [1, 0], { required: true })],
    totalNights: 2,
    constraints: { requiredStopIds: ["x"], excludedStopIds: ["x"] },
    excludedDestinations: ["Testland"],
  },
  {
    id: "unsupported-total-budget-certainty",
    name: "Exact total budget outside reliable pricing capability",
    rawPrompt: "£500 total for two weeks of luxury in Zurich and Zermatt, for two travellers.",
    hardFacts: ["£500 total cap", "14 days", "luxury request", "2 travellers", "no live price evidence"],
    hardConflict: "Morrovia cannot establish that the trip meets an exact total budget with current non-live pricing evidence.",
    possibleSoftCompromise: "Plan the route without claiming budget compliance, after the traveller accepts that limitation.",
    expectedCanBuildTrip: false,
    expectedOutcome: "impossible",
    expectedValidatorIssues: [],
    prohibitedPlannerBehaviour: ["Fabricate accommodation, transport or activity prices.", "Present the trip as verified within £500."],
    origin: { name: "Zurich", coordinates: [8.5417, 47.3769] },
    stops: [
      stop("zurich", "Zurich", "Switzerland", [8.5417, 47.3769], { required: true }),
      stop("zermatt", "Zermatt", "Switzerland", [7.7491, 46.0207], { required: true }),
    ],
    totalNights: 13,
    constraints: { requiredStopIds: ["zurich", "zermatt"] },
  },
  {
    id: "multiple-fixed-bookings-chronology",
    name: "Multiple fixed bookings make chronology impossible",
    rawPrompt: "A then B then C, with fixed bookings in C on 2 October and B on 6 October.",
    hardFacts: ["A → B → C order", "C fixed before arrival", "B fixed after departure"],
    hardConflict: "The protected order cannot place both bookings inside their linked stays.",
    possibleSoftCompromise: "Change booking dates or explicitly unlock and rebuild the route order.",
    expectedCanBuildTrip: false,
    expectedOutcome: "impossible",
    expectedValidatorIssues: ["fixed-date-conflict"],
    prohibitedPlannerBehaviour: ["Move either booking date.", "Delete a conflicting booking during repair."],
    origin,
    stops: [
      stop("a", "A", "Testland", [1, 0], { required: true, arrivalDate: "2026-10-01", departureDate: "2026-10-03" }),
      stop("b", "B", "Testland", [2, 0], { required: true, arrivalDate: "2026-10-03", departureDate: "2026-10-05" }),
      stop("c", "C", "Testland", [3, 0], { required: true, arrivalDate: "2026-10-05", departureDate: "2026-10-07" }),
    ],
    totalNights: 6,
    planNights: { a: 2, b: 2, c: 2 },
    constraints: {
      requiredStopIds: ["a", "b", "c"],
      fixedCommitments: [
        { label: "C booking", date: "2026-10-02", stopId: "c" },
        { label: "B booking", date: "2026-10-06", stopId: "b" },
      ],
    },
  },
  {
    id: "fixed-order-severe-backtracking",
    name: "Fixed endpoints and stop order force severe backtracking",
    rawPrompt: "Keep Start, Far, Near, End in exactly that order; the endpoints and order are fixed.",
    hardFacts: ["fixed start", "fixed end", "explicit stop order", "severe unavoidable backtracking"],
    hardConflict: null,
    possibleSoftCompromise: "The route remains buildable but poor; unlocking the middle order removes the backtracking.",
    expectedCanBuildTrip: true,
    expectedOutcome: "valid-but-poor",
    expectedValidatorIssues: ["unnecessary-backtracking"],
    prohibitedPlannerBehaviour: ["Silently reorder the protected route.", "Describe the backtracking route as efficient."],
    origin,
    stops: [
      stop("start", "Start", "Testland", [0, 0], { required: true }),
      stop("far", "Far", "Testland", [10, 0], { required: true }),
      stop("near", "Near", "Testland", [1, 0], { required: true }),
      stop("end", "End", "Testland", [11, 0], { required: true }),
    ],
    totalNights: 8,
    planNights: { start: 2, far: 2, near: 2, end: 2 },
    constraints: {
      fixedStartStopId: "start",
      fixedEndStopId: "end",
      requiredStopIds: ["start", "far", "near", "end"],
      fixedCommitments: [{ label: "Traveller-fixed stop order" }],
    },
  },
  {
    id: "soft-minimums-visible-compromise",
    name: "Planning minimums yield a visible viable compromise",
    rawPrompt: "A, B and C in five days; keep all three if possible.",
    hardFacts: ["4 available nights", "3 retained stops", "2-night planning guidance for each stop"],
    hardConflict: null,
    possibleSoftCompromise: "Allocate at least one night to every stop and explicitly retain the minimum-stay shortfall.",
    expectedCanBuildTrip: true,
    expectedOutcome: "constrained-compromise",
    expectedValidatorIssues: ["minimum-stay-conflict", "below-minimum-stay"],
    prohibitedPlannerBehaviour: ["Claim every planning minimum was met.", "Hide allocator compromise warnings."],
    origin,
    stops: [
      stop("a", "A", "Testland", [1, 0], { required: true, fallbackMinimumNights: 2, fallbackIdealNights: 2 }),
      stop("b", "B", "Testland", [2, 0], { required: true, fallbackMinimumNights: 2, fallbackIdealNights: 2 }),
      stop("c", "C", "Testland", [3, 0], { required: true, fallbackMinimumNights: 2, fallbackIdealNights: 2 }),
    ],
    totalNights: 4,
    constraints: { requiredStopIds: ["a", "b", "c"] },
  },
  {
    id: "clean-valid-control",
    name: "Clean valid control route",
    rawPrompt: "A and B in five days with no fixed conflicts.",
    hardFacts: ["4 available nights", "2 required stops", "all hard constraints satisfiable"],
    hardConflict: null,
    possibleSoftCompromise: "No compromise is required.",
    expectedCanBuildTrip: true,
    expectedOutcome: "valid",
    expectedValidatorIssues: [],
    prohibitedPlannerBehaviour: ["Invent a conflict for a consistent request.", "Alter the required stop set."],
    origin,
    stops: [
      stop("a", "A", "Testland", [0.1, 0], { required: true }),
      stop("b", "B", "Testland", [0.2, 0], { required: true }),
    ],
    totalNights: 4,
    planNights: { a: 2, b: 2 },
    constraints: { requiredStopIds: ["a", "b"] },
  },
];
