import type { PlannerStop, RoutePlanningConstraints } from "../../lib/easyt/planner.ts";

export type BenchmarkQualitativeCheck = {
  dimension: "route-efficiency" | "pacing" | "transfer-quality" | "preference-fit" | "unsupported-claims" | "overall-usability";
  question: string;
};

export type BenchmarkScenario = {
  id: string;
  name: string;
  prompt: string;
  availableDays: number;
  origin: { name: string; coordinates?: [number, number] };
  stops: Array<PlannerStop & { intent?: "place" | "landmark" }>;
  picks: Record<string, string[]>;
  constraints?: RoutePlanningConstraints;
  requirements: {
    mustInclude: string[];
    fixedStart?: string;
    fixedEnd?: string;
    maxStops?: number;
    noDriving?: boolean;
    preferredModes?: Array<"flight" | "train" | "road" | "ferry">;
    pace?: "relaxed" | "balanced" | "fast";
  };
  expectedCharacteristics: string[];
  unacceptableFailures: string[];
  usefulWarnings: string[];
  acceptableVariations: string[];
  review: BenchmarkQualitativeCheck[];
};

const stop = (
  id: string,
  name: string,
  country: string,
  coordinates: [number, number],
  intent: "place" | "landmark" = "place",
): BenchmarkScenario["stops"][number] => ({ id, name, country, coordinates, intent });

/**
 * Fixed destination facts make this suite deterministic and free of geocoding,
 * model, or network variance. Prompts are retained as the human-readable input
 * contract; the benchmark deliberately begins at the current route boundary.
 */
export const ENGINE_V2_BENCHMARKS: BenchmarkScenario[] = [
  {
    id: "sea-anchor",
    name: "Southeast Asia multi-country",
    prompt: "We have 11 nights from Bangkok and Angkor Wat is the whole reason for the trip. We would also like Cambodia and southern Vietnam, using ground transport where it makes sense. Two travellers.",
    availableDays: 12,
    origin: { name: "Bangkok", coordinates: [100.5018, 13.7563] },
    stops: [
      stop("bangkok", "Bangkok", "Thailand", [100.5018, 13.7563]),
      stop("siem-reap", "Siem Reap", "Cambodia", [103.8552, 13.3633], "landmark"),
      stop("phnom-penh", "Phnom Penh", "Cambodia", [104.9282, 11.5564]),
      stop("ho-chi-minh-city", "Ho Chi Minh City", "Vietnam", [106.6297, 10.8231]),
    ],
    picks: { "siem-reap": ["Angkor Wat"] },
    constraints: { transportModes: ["train", "drive"] },
    requirements: { mustInclude: ["siem-reap"], fixedStart: "bangkok", preferredModes: ["train", "road"], pace: "balanced" },
    expectedCharacteristics: ["Angkor remains protected", "Cambodia stops stay grouped", "The route progresses east toward Vietnam"],
    unacceptableFailures: ["Remove Siem Reap", "Backtrack from Vietnam into Cambodia", "Treat Angkor as a token arrival stop"],
    usefulWarnings: ["Cross-border schedules need verification", "Long transfers consume usable time"],
    acceptableVariations: ["Flight or ground transport where the current estimator cannot verify a service"],
    review: [
      { dimension: "pacing", question: "Does Angkor receive meaningful usable time rather than only an arrival day?" },
      { dimension: "overall-usability", question: "Would an experienced traveller consider this a credible first multi-country plan?" },
    ],
  },
  {
    id: "japan-classic-alps",
    name: "Japan classic and Alps",
    prompt: "About two weeks in Japan. Tokyo is essential, then Kyoto and a few nights in the Japanese Alps. We prefer trains and do not want to rush or double back.",
    availableDays: 14,
    origin: { name: "Tokyo", coordinates: [139.6917, 35.6895] },
    stops: [
      stop("tokyo", "Tokyo", "Japan", [139.6917, 35.6895], "landmark"),
      stop("kyoto", "Kyoto", "Japan", [135.7681, 35.0116]),
      stop("takayama", "Takayama", "Japan", [137.2522, 36.1461]),
      stop("kanazawa", "Kanazawa", "Japan", [136.6562, 36.5613]),
    ],
    picks: { tokyo: ["Tokyo essentials"], takayama: ["Japanese Alps"] },
    constraints: { transportModes: ["train"] },
    requirements: { mustInclude: ["tokyo", "takayama"], fixedStart: "tokyo", preferredModes: ["train"], pace: "relaxed" },
    expectedCharacteristics: ["Tokyo is preserved", "Alps stops are grouped", "A rail-friendly direction avoids a Kyoto-Alps-Kyoto loop"],
    unacceptableFailures: ["Drop Tokyo", "Scatter the Alps across the route", "Compress every base to one night"],
    usefulWarnings: ["Regional Alps connections should be timetable-checked"],
    acceptableVariations: ["Kanazawa before Takayama or the reverse when the overall direction remains coherent"],
    review: [{ dimension: "route-efficiency", question: "Does the proposed order avoid an obvious Alps/Kyoto backtrack?" }],
  },
  {
    id: "balkans",
    name: "Balkans difficult geography",
    prompt: "We have around 12 days for Sarajevo, Kotor, Belgrade and Skopje. We know borders can be slow, so keep the route coherent rather than trying to optimise every hour.",
    availableDays: 12,
    origin: { name: "Sarajevo", coordinates: [18.4131, 43.8563] },
    stops: [
      stop("sarajevo", "Sarajevo", "Bosnia and Herzegovina", [18.4131, 43.8563]),
      stop("kotor", "Kotor", "Montenegro", [18.7712, 42.4247]),
      stop("belgrade", "Belgrade", "Serbia", [20.4489, 44.7866]),
      stop("skopje", "Skopje", "North Macedonia", [21.4316, 41.9981]),
    ],
    picks: {},
    requirements: { mustInclude: ["sarajevo", "kotor", "belgrade", "skopje"], fixedStart: "sarajevo", pace: "balanced" },
    expectedCharacteristics: ["No repeated border zigzag", "Transfer uncertainty remains visible"],
    unacceptableFailures: ["Repeat a country crossing unnecessarily", "Claim live border or timetable certainty"],
    usefulWarnings: ["Road and border timings require confirmation"],
    acceptableVariations: ["Belgrade or Skopje may finish the trip depending on onward travel"],
    review: [
      { dimension: "transfer-quality", question: "Are difficult border legs framed as estimates rather than dependable schedules?" },
      { dimension: "overall-usability", question: "Is the route usable despite the region's transport uncertainty?" },
    ],
  },
  {
    id: "italy-train",
    name: "Italy by train",
    prompt: "Eleven days in Italy by train: Rome, Florence and Venice, with Bologna if it fits without making the trip frantic.",
    availableDays: 11,
    origin: { name: "Rome", coordinates: [12.4964, 41.9028] },
    stops: [
      stop("rome", "Rome", "Italy", [12.4964, 41.9028]),
      stop("florence", "Florence", "Italy", [11.2558, 43.7696]),
      stop("bologna", "Bologna", "Italy", [11.3426, 44.4949]),
      stop("venice", "Venice", "Italy", [12.3155, 45.4408]),
    ],
    picks: {},
    constraints: { transportModes: ["train"], optionalStopIds: ["bologna"] },
    requirements: { mustInclude: ["rome", "florence", "venice"], fixedStart: "rome", preferredModes: ["train"], pace: "balanced" },
    expectedCharacteristics: ["Rome–Florence–Bologna–Venice remains linear", "Bologna is treated as optional if time is tight"],
    unacceptableFailures: ["Recommend geographic backtracking", "Make a flight the default between these stops"],
    usefulWarnings: ["Remove Bologna if the available time becomes compressed"],
    acceptableVariations: ["Omit Bologna", "Reverse the route when the international gateway changes"],
    review: [{ dimension: "preference-fit", question: "Does the plan read as a rail trip rather than a sequence of airport transfers?" }],
  },
  {
    id: "iberia-long-finish",
    name: "Portugal and Spain",
    prompt: "Ten days starting in Lisbon, then Seville, Granada and Barcelona. We are happy with trains but do not want the final transfer hand-waved.",
    availableDays: 10,
    origin: { name: "Lisbon", coordinates: [-9.1393, 38.7223] },
    stops: [
      stop("lisbon", "Lisbon", "Portugal", [-9.1393, 38.7223]),
      stop("seville", "Seville", "Spain", [-5.9845, 37.3891]),
      stop("granada", "Granada", "Spain", [-3.5986, 37.1773]),
      stop("barcelona", "Barcelona", "Spain", [2.1734, 41.3851]),
    ],
    picks: {},
    constraints: { transportModes: ["train"] },
    requirements: { mustInclude: ["lisbon", "seville", "granada", "barcelona"], fixedStart: "lisbon", fixedEnd: "barcelona", preferredModes: ["train"], pace: "balanced" },
    expectedCharacteristics: ["Andalusia is grouped", "The Granada–Barcelona burden is visible"],
    unacceptableFailures: ["Return west after reaching Barcelona", "Describe the final transfer as trivial"],
    usefulWarnings: ["The final long transfer reduces usable time"],
    acceptableVariations: ["A flight may be preferable for the final leg if clearly disclosed"],
    review: [{ dimension: "transfer-quality", question: "Is the long final movement worth the time it consumes in a ten-day trip?" }],
  },
  {
    id: "china-regions",
    name: "China complex itinerary",
    prompt: "We have three weeks for Beijing, Xi'an, Chengdu, Zhangjiajie and Shanghai. The Terracotta Army and Zhangjiajie are must-sees. Group the long-distance travel sensibly.",
    availableDays: 21,
    origin: { name: "Beijing", coordinates: [116.4074, 39.9042] },
    stops: [
      stop("beijing", "Beijing", "China", [116.4074, 39.9042]),
      stop("xian", "Xi'an", "China", [108.9398, 34.3416], "landmark"),
      stop("chengdu", "Chengdu", "China", [104.0665, 30.5728]),
      stop("zhangjiajie", "Zhangjiajie", "China", [110.4792, 29.1171], "landmark"),
      stop("shanghai", "Shanghai", "China", [121.4737, 31.2304]),
    ],
    picks: { xian: ["Terracotta Army"], zhangjiajie: ["National Forest Park"] },
    requirements: { mustInclude: ["xian", "zhangjiajie"], fixedStart: "beijing", fixedEnd: "shanghai", pace: "balanced" },
    expectedCharacteristics: ["Western/central stops are grouped", "Major anchors receive protected time", "No Beijing–south–north zigzag"],
    unacceptableFailures: ["Drop either anchor", "Claim live high-speed rail availability", "Create an absurd cross-country zigzag"],
    usefulWarnings: ["Long-distance legs need live transport confirmation"],
    acceptableVariations: ["Flights may replace rail for selected long legs"],
    review: [{ dimension: "route-efficiency", question: "Are China's major regions grouped in a direction an experienced traveller could defend?" }],
  },
  {
    id: "slow-three-bases",
    name: "Slow traveller",
    prompt: "Two weeks in Scotland with only three bases. We hate changing hotels and want slow days for Edinburgh, Inverness and the Isle of Skye.",
    availableDays: 14,
    origin: { name: "Edinburgh", coordinates: [-3.1883, 55.9533] },
    stops: [
      stop("edinburgh", "Edinburgh", "United Kingdom", [-3.1883, 55.9533]),
      stop("inverness", "Inverness", "United Kingdom", [-4.2247, 57.4778]),
      stop("skye", "Isle of Skye", "United Kingdom", [-6.2155, 57.2736]),
    ],
    picks: {},
    requirements: { mustInclude: ["edinburgh", "inverness", "skye"], maxStops: 3, pace: "relaxed" },
    expectedCharacteristics: ["Exactly three bases", "Several usable days per base", "No gratuitous hotel move"],
    unacceptableFailures: ["Add extra bases", "Produce a one-night base", "Ignore the slow pace"],
    usefulWarnings: ["Skye transport remains weather and schedule dependent"],
    acceptableVariations: ["Inverness and Skye can swap when gateway logistics justify it"],
    review: [{ dimension: "pacing", question: "Does this feel materially slower than the fast-traveller benchmark?" }],
  },
  {
    id: "fast-central-europe",
    name: "Fast traveller",
    prompt: "We have two weeks and are comfortable moving often. Give us maximum variety across Prague, Vienna, Budapest, Ljubljana and Zagreb, mostly by rail.",
    availableDays: 14,
    origin: { name: "Prague", coordinates: [14.4378, 50.0755] },
    stops: [
      stop("prague", "Prague", "Czechia", [14.4378, 50.0755]),
      stop("vienna", "Vienna", "Austria", [16.3738, 48.2082]),
      stop("budapest", "Budapest", "Hungary", [19.0402, 47.4979]),
      stop("ljubljana", "Ljubljana", "Slovenia", [14.5058, 46.0569]),
      stop("zagreb", "Zagreb", "Croatia", [15.9819, 45.8150]),
    ],
    picks: {},
    constraints: { transportModes: ["train"] },
    requirements: { mustInclude: ["prague", "vienna", "budapest", "ljubljana", "zagreb"], fixedStart: "prague", preferredModes: ["train"], pace: "fast" },
    expectedCharacteristics: ["More bases than the slow benchmark", "A broadly linear central-European route"],
    unacceptableFailures: ["Drop requested variety", "Introduce unnecessary backtracking"],
    usefulWarnings: ["Verify cross-border train services"],
    acceptableVariations: ["Ljubljana and Zagreb may swap"],
    review: [{ dimension: "preference-fit", question: "Does this usefully differ from the slow-traveller output without becoming implausible?" }],
  },
  {
    id: "fixed-gateways",
    name: "Fixed gateway constraint",
    prompt: "Start in Hanoi and fly home internationally from Ho Chi Minh City. We have 12 days and want Hue and Hoi An between them. Do not reverse the gateways.",
    availableDays: 12,
    origin: { name: "Hanoi", coordinates: [105.8342, 21.0278] },
    stops: [
      stop("hanoi", "Hanoi", "Vietnam", [105.8342, 21.0278]),
      stop("hue", "Hue", "Vietnam", [107.5909, 16.4637]),
      stop("hoi-an", "Hoi An", "Vietnam", [108.3380, 15.8801]),
      stop("ho-chi-minh-city", "Ho Chi Minh City", "Vietnam", [106.6297, 10.8231]),
    ],
    picks: {},
    requirements: { mustInclude: ["hanoi", "hue", "hoi-an", "ho-chi-minh-city"], fixedStart: "hanoi", fixedEnd: "ho-chi-minh-city", pace: "balanced" },
    expectedCharacteristics: ["Hanoi remains first", "Ho Chi Minh City remains last", "Hue and Hoi An stay adjacent"],
    unacceptableFailures: ["Reverse either gateway", "Break the central Vietnam grouping"],
    usefulWarnings: ["Domestic long-distance transport needs confirmation"],
    acceptableVariations: ["Hue and Hoi An can swap if the route still runs north to south"],
    review: [{ dimension: "overall-usability", question: "Does the plan visibly honour both international gateway constraints?" }],
  },
  {
    id: "overpacked-europe",
    name: "Intentionally overpacked request",
    prompt: "Eight days for Paris, Amsterdam, Berlin, Prague, Vienna, Budapest and Rome. They all matter, but tell us honestly if it is too much rather than pretending it fits.",
    availableDays: 8,
    origin: { name: "Paris", coordinates: [2.3522, 48.8566] },
    stops: [
      stop("paris", "Paris", "France", [2.3522, 48.8566]),
      stop("amsterdam", "Amsterdam", "Netherlands", [4.9041, 52.3676]),
      stop("berlin", "Berlin", "Germany", [13.4050, 52.5200]),
      stop("prague", "Prague", "Czechia", [14.4378, 50.0755]),
      stop("vienna", "Vienna", "Austria", [16.3738, 48.2082]),
      stop("budapest", "Budapest", "Hungary", [19.0402, 47.4979]),
      stop("rome", "Rome", "Italy", [12.4964, 41.9028]),
    ],
    picks: {},
    requirements: { mustInclude: ["paris", "amsterdam", "berlin", "prague", "vienna", "budapest", "rome"], pace: "fast" },
    expectedCharacteristics: ["The overload is surfaced", "The engine does not describe the request as comfortable"],
    unacceptableFailures: ["Claim all seven bases fit comfortably", "Silently omit a requested city"],
    usefulWarnings: ["Too many bases", "Insufficient route-comparison capacity", "Excessive transfer burden"],
    acceptableVariations: ["Recommend adding time", "Recommend removing two or more bases"],
    review: [{ dimension: "overall-usability", question: "Does the output help the traveller confront the impossible trade-off rather than legitimising it?" }],
  },
];
