import type { PlannerStop, RoutePlanningConstraints } from "../../lib/easyt/planner.ts";

export type BenchmarkQualitativeCheck = {
  dimension: "route-efficiency" | "pacing" | "transfer-quality" | "preference-fit" | "unsupported-claims" | "overall-usability";
  question: string;
};

export type BenchmarkCoverageTag =
  | "africa"
  | "backpacking"
  | "budget-aware"
  | "central-asia"
  | "east-asia"
  | "europe"
  | "family"
  | "ferry"
  | "fixed-booking"
  | "fixed-gateway"
  | "honeymoon"
  | "island-hopping"
  | "mixed-transport"
  | "mobility-needs"
  | "no-driving"
  | "oceania"
  | "overpacked"
  | "rail"
  | "relaxed-pace"
  | "road-trip"
  | "scandinavia"
  | "south-america"
  | "south-asia"
  | "southeast-asia"
  | "seven-plus-stops";

export type BenchmarkScenario = {
  id: string;
  name: string;
  coverage: BenchmarkCoverageTag[];
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
    /** A contradictory fixture passes only when these structured conflicts remain visible. */
    expectedConflictCodes?: Array<
      | "fixed-start-missing"
      | "fixed-end-missing"
      | "fixed-endpoint-conflict"
      | "required-stop-missing"
      | "excluded-stop-present"
      | "maximum-stops-exceeded"
      | "required-stops-exceed-maximum"
      | "fixed-commitment-conflict"
      | "forbidden-transport-mode"
    >;
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
export const ENGINE_V2_BASELINE_BENCHMARKS: BenchmarkScenario[] = [
  {
    id: "sea-anchor",
    name: "Southeast Asia multi-country",
    coverage: ["southeast-asia", "mixed-transport", "fixed-gateway"],
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
    coverage: ["east-asia", "rail", "relaxed-pace"],
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
    coverage: ["europe", "mixed-transport"],
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
    coverage: ["europe", "rail"],
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
    coverage: ["europe", "rail", "fixed-gateway"],
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
    coverage: ["east-asia", "mixed-transport", "fixed-gateway"],
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
    coverage: ["europe", "relaxed-pace"],
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
    coverage: ["europe", "rail"],
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
    coverage: ["southeast-asia", "fixed-gateway", "mixed-transport"],
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
    coverage: ["europe", "overpacked", "seven-plus-stops"],
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

/**
 * Phase-one expansion cases. Each adds a regional, traveller, transport, or
 * contradiction shape that is not already represented by the original ten.
 * Price, accessibility, ferry-operation, and weather judgements remain human
 * review questions unless the current deterministic route boundary has facts.
 */
export const ENGINE_V2_EXPANSION_BENCHMARKS: BenchmarkScenario[] = [
  {
    id: "patagonia-honeymoon",
    name: "Patagonia cross-border honeymoon",
    coverage: ["south-america", "honeymoon", "mixed-transport", "fixed-gateway", "relaxed-pace"],
    prompt: "We have 16 days for a honeymoon starting in Buenos Aires and flying home from Punta Arenas. El Chaltén is essential. Keep the long Patagonia transfers honest and avoid rushing every base.",
    availableDays: 16,
    origin: { name: "Santiago", coordinates: [-70.6693, -33.4489] },
    stops: [
      stop("buenos-aires", "Buenos Aires", "Argentina", [-58.3816, -34.6037]),
      stop("el-calafate", "El Calafate", "Argentina", [-72.2768, -50.3379]),
      stop("el-chalten", "El Chaltén", "Argentina", [-72.8863, -49.3315], "landmark"),
      stop("puerto-natales", "Puerto Natales", "Chile", [-72.5060, -51.7260]),
      stop("punta-arenas", "Punta Arenas", "Chile", [-70.9171, -53.1638]),
    ],
    picks: { "el-chalten": ["Fitz Roy hiking"] },
    constraints: { transportModes: ["flight", "drive"] },
    requirements: { mustInclude: ["buenos-aires", "el-chalten", "puerto-natales", "punta-arenas"], fixedStart: "buenos-aires", fixedEnd: "punta-arenas", preferredModes: ["flight", "road"], pace: "relaxed" },
    expectedCharacteristics: ["Both international gateways remain fixed", "El Chaltén receives usable time", "Southern Patagonia progresses without returning north"],
    unacceptableFailures: ["Drop El Chaltén", "Finish anywhere except Punta Arenas", "Describe cross-border Patagonia transfers as trivial"],
    usefulWarnings: ["Cross-border road timing needs confirmation", "The first Patagonia flight consumes much of a day"],
    acceptableVariations: ["El Calafate and El Chaltén can share one regional base strategy", "Puerto Natales may receive more nights than Punta Arenas"],
    review: [
      { dimension: "pacing", question: "Does the honeymoon retain recovery time after the long arrival and border transfers?" },
      { dimension: "transfer-quality", question: "Are Patagonia road and flight assumptions presented as planning estimates?" },
    ],
  },
  {
    id: "greek-island-ferries",
    name: "Greek island hopping by ferry",
    coverage: ["europe", "island-hopping", "ferry", "fixed-gateway"],
    prompt: "Twelve days from Athens through Naxos and Paros, finishing in Santorini. We want ferries where practical and enough time that bad connections do not turn every island into a one-night stop.",
    availableDays: 12,
    origin: { name: "London", coordinates: [-0.1276, 51.5072] },
    stops: [
      stop("athens", "Athens", "Greece", [23.7275, 37.9838]),
      stop("naxos", "Naxos", "Greece", [25.3764, 37.1036]),
      stop("paros", "Paros", "Greece", [25.1503, 37.0850]),
      stop("santorini", "Santorini", "Greece", [25.4615, 36.3932]),
    ],
    picks: {},
    requirements: { mustInclude: ["athens", "naxos", "paros", "santorini"], fixedStart: "athens", fixedEnd: "santorini", preferredModes: ["ferry"], pace: "balanced" },
    expectedCharacteristics: ["Athens remains the arrival gateway", "Santorini remains the departure island", "Island moves are not treated like ordinary road mileage"],
    unacceptableFailures: ["Reorder Santorini into the middle", "Claim a dated ferry operates without timetable evidence", "Allocate only arrival time to every island"],
    usefulWarnings: ["The current engine may lack ferry-specific mode knowledge", "Sailing days and port access need live confirmation"],
    acceptableVariations: ["Naxos and Paros can swap", "A flight to or from the island chain is acceptable when disclosed"],
    review: [{ dimension: "transfer-quality", question: "Would a traveller understand that ferry availability and port-to-hotel time remain unverified?" }],
  },
  {
    id: "scandinavia-no-driving",
    name: "Scandinavia without driving",
    coverage: ["scandinavia", "no-driving", "rail", "ferry", "mixed-transport"],
    prompt: "Two weeks from Copenhagen to Stockholm, Oslo and Bergen without driving. Prefer trains and ferries, but be honest where a flight or an unverified cross-border connection may be needed.",
    availableDays: 14,
    origin: { name: "London", coordinates: [-0.1276, 51.5072] },
    stops: [
      stop("copenhagen", "Copenhagen", "Denmark", [12.5683, 55.6761]),
      stop("stockholm", "Stockholm", "Sweden", [18.0686, 59.3293]),
      stop("oslo", "Oslo", "Norway", [10.7522, 59.9139]),
      stop("bergen", "Bergen", "Norway", [5.3221, 60.3930]),
    ],
    picks: {},
    constraints: { transportModes: ["train", "flight"], avoidDriving: true },
    requirements: { mustInclude: ["copenhagen", "stockholm", "oslo", "bergen"], fixedStart: "copenhagen", fixedEnd: "bergen", noDriving: true, preferredModes: ["train", "ferry"], pace: "balanced" },
    expectedCharacteristics: ["No road leg is presented as the solution", "The route generally moves Copenhagen–Stockholm–Oslo–Bergen", "Cross-border mode uncertainty remains visible"],
    unacceptableFailures: ["Suggest driving", "Break either gateway", "Claim exact rail or ferry service for the dates"],
    usefulWarnings: ["Some international legs may fall back to a flight estimate", "Cross-border timetables need checking"],
    acceptableVariations: ["Stockholm and Oslo may swap if the total burden is lower", "A disclosed flight can remain an alternative rather than a hidden assumption"],
    review: [{ dimension: "preference-fit", question: "Does the result still feel recognisably no-driving even when exact rail data is absent?" }],
  },
  {
    id: "central-asia-silk-road",
    name: "Central Asia Silk Road",
    coverage: ["central-asia", "rail", "mixed-transport", "fixed-gateway"],
    prompt: "Seventeen days from Tashkent through Samarkand, Bukhara and Khiva, then finish in Almaty. Prefer rail within Uzbekistan and accept a flight for the long final jump.",
    availableDays: 17,
    origin: { name: "Istanbul", coordinates: [28.9784, 41.0082] },
    stops: [
      stop("tashkent", "Tashkent", "Uzbekistan", [69.2401, 41.2995]),
      stop("samarkand", "Samarkand", "Uzbekistan", [66.9597, 39.6542], "landmark"),
      stop("bukhara", "Bukhara", "Uzbekistan", [64.4286, 39.7681], "landmark"),
      stop("khiva", "Khiva", "Uzbekistan", [60.3600, 41.3783]),
      stop("almaty", "Almaty", "Kazakhstan", [76.8512, 43.2220]),
    ],
    picks: { samarkand: ["Registan"], bukhara: ["Old City"] },
    constraints: { transportModes: ["train", "flight"] },
    requirements: { mustInclude: ["samarkand", "bukhara", "khiva", "almaty"], fixedStart: "tashkent", fixedEnd: "almaty", preferredModes: ["train", "flight"], pace: "balanced" },
    expectedCharacteristics: ["Uzbekistan's Silk Road cities stay geographically grouped", "Almaty stays last", "The long international jump remains a substantial transfer"],
    unacceptableFailures: ["Zigzag repeatedly across Uzbekistan", "Drop either historic anchor", "Claim live cross-border schedules"],
    usefulWarnings: ["Khiva connections and the Almaty leg require provider confirmation", "Border and airport time may consume a usable day"],
    acceptableVariations: ["Khiva can be reached through a nearby transport hub", "A flight can replace the final rail ambition"],
    review: [{ dimension: "route-efficiency", question: "Does the route separate the linear Uzbekistan section from the distinct Almaty jump?" }],
  },
  {
    id: "southern-africa-safari",
    name: "Southern Africa city and safari",
    coverage: ["africa", "mixed-transport", "fixed-gateway"],
    prompt: "Fifteen days starting in Cape Town, then Johannesburg and Kruger, finishing at Victoria Falls. Kruger is essential. Use flights for the major jumps without pretending airport days are free.",
    availableDays: 15,
    origin: { name: "London", coordinates: [-0.1276, 51.5072] },
    stops: [
      stop("cape-town", "Cape Town", "South Africa", [18.4241, -33.9249]),
      stop("johannesburg", "Johannesburg", "South Africa", [28.0473, -26.2041]),
      stop("kruger", "Kruger National Park", "South Africa", [31.5913, -24.9950], "landmark"),
      stop("victoria-falls", "Victoria Falls", "Zimbabwe", [25.8572, -17.9243], "landmark"),
    ],
    picks: { kruger: ["Safari"], "victoria-falls": ["Victoria Falls"] },
    constraints: { transportModes: ["flight", "drive"] },
    requirements: { mustInclude: ["cape-town", "kruger", "victoria-falls"], fixedStart: "cape-town", fixedEnd: "victoria-falls", preferredModes: ["flight", "road"], pace: "balanced" },
    expectedCharacteristics: ["Kruger remains protected", "Victoria Falls remains last", "Long flights reduce usable destination time"],
    unacceptableFailures: ["Drop the safari anchor", "Return to Cape Town after moving north", "Treat airport transfers as headline flight time only"],
    usefulWarnings: ["Safari gateway and road transfer details are unverified", "International flight schedules need checking"],
    acceptableVariations: ["Johannesburg can be a transit base rather than a long stay", "Kruger airport choice can change the local transfer"],
    review: [{ dimension: "pacing", question: "Does the allocation protect actual safari and falls time after major flight days?" }],
  },
  {
    id: "morocco-family-access",
    name: "Morocco family trip with mobility needs",
    coverage: ["africa", "family", "mobility-needs", "no-driving", "rail", "relaxed-pace"],
    prompt: "Twelve days for a family including one traveller with limited walking. Start in Casablanca, include Rabat and Fes, finish in Marrakech, and do not drive. Fewer disruptive transfers matter more than squeezing in extras.",
    availableDays: 12,
    origin: { name: "Madrid", coordinates: [-3.7038, 40.4168] },
    stops: [
      stop("casablanca", "Casablanca", "Morocco", [-7.5898, 33.5731]),
      stop("rabat", "Rabat", "Morocco", [-6.8498, 34.0209]),
      stop("fes", "Fes", "Morocco", [-5.0078, 34.0331]),
      stop("marrakech", "Marrakech", "Morocco", [-7.9811, 31.6295]),
    ],
    picks: {},
    constraints: { transportModes: ["train"], avoidDriving: true },
    requirements: { mustInclude: ["casablanca", "rabat", "fes", "marrakech"], fixedStart: "casablanca", fixedEnd: "marrakech", maxStops: 4, noDriving: true, preferredModes: ["train"], pace: "relaxed" },
    expectedCharacteristics: ["No extra bases are introduced", "No-driving remains explicit", "Mobility suitability is not inferred from geographic proximity"],
    unacceptableFailures: ["Recommend a road transfer as settled fact", "Add a fifth base", "Claim step-free access without verified accessibility data"],
    usefulWarnings: ["The current estimator may not know whether short legs are rail-accessible", "Station and accommodation accessibility need confirmation"],
    acceptableVariations: ["Rabat can be a day trip if that reduces hotel changes", "A private accessible transfer can be reviewed by the traveller but not silently assumed"],
    review: [
      { dimension: "preference-fit", question: "Does the route minimise hotel churn while preserving the stated no-driving constraint?" },
      { dimension: "overall-usability", question: "Are accessibility unknowns left for confirmation instead of presented as solved?" },
    ],
  },
  {
    id: "peru-budget-backpacker",
    name: "Peru budget backpacking route",
    coverage: ["south-america", "backpacking", "budget-aware", "mixed-transport"],
    prompt: "Fifteen days backpacking from Lima to Arequipa, Ollantaytambo and Cusco. Keep the route affordable by preferring sensible ground or rail legs, but do not invent fares. Cusco must be the finish.",
    availableDays: 15,
    origin: { name: "Guatemala City", coordinates: [-90.5069, 14.6349] },
    stops: [
      stop("lima", "Lima", "Peru", [-77.0428, -12.0464]),
      stop("arequipa", "Arequipa", "Peru", [-71.5375, -16.4090]),
      stop("ollantaytambo", "Ollantaytambo", "Peru", [-72.2643, -13.2584], "landmark"),
      stop("cusco", "Cusco", "Peru", [-71.9675, -13.5319], "landmark"),
    ],
    picks: { ollantaytambo: ["Sacred Valley"], cusco: ["Cusco historic centre"] },
    constraints: { transportModes: ["train", "drive", "flight"] },
    requirements: { mustInclude: ["lima", "ollantaytambo", "cusco"], fixedStart: "lima", fixedEnd: "cusco", preferredModes: ["train", "road"], pace: "balanced" },
    expectedCharacteristics: ["No unsupported fare or cost total is claimed", "The Sacred Valley stays adjacent to Cusco", "The long Lima movement is treated as consequential"],
    unacceptableFailures: ["Claim the route is within budget without fare inputs", "Separate Ollantaytambo from Cusco unnecessarily", "Drop a required anchor"],
    usefulWarnings: ["Mode preference can be evaluated but actual fares remain unknown", "High-altitude pacing needs human review"],
    acceptableVariations: ["A disclosed flight can replace a very long ground leg", "Arequipa can be identified as the first cut if time or budget tightens"],
    review: [{ dimension: "unsupported-claims", question: "Does the output avoid turning a ground-transport preference into a fabricated affordability claim?" }],
  },
  {
    id: "norway-road-trip",
    name: "Norway scenic road trip",
    coverage: ["scandinavia", "road-trip", "relaxed-pace", "fixed-gateway"],
    prompt: "Fourteen days driving from Oslo through Lillehammer, Geiranger and Ålesund, returning the car in Bergen. This is a scenic road trip, so do not optimise it into unrelated flights or pretend straight-line distance is road time.",
    availableDays: 14,
    origin: { name: "Copenhagen", coordinates: [12.5683, 55.6761] },
    stops: [
      stop("oslo", "Oslo", "Norway", [10.7522, 59.9139]),
      stop("lillehammer", "Lillehammer", "Norway", [10.4662, 61.1153]),
      stop("geiranger", "Geiranger", "Norway", [7.2050, 62.1015]),
      stop("alesund", "Ålesund", "Norway", [6.1495, 62.4722]),
      stop("bergen", "Bergen", "Norway", [5.3221, 60.3930]),
    ],
    picks: {},
    constraints: { transportModes: ["drive"] },
    requirements: { mustInclude: ["oslo", "geiranger", "alesund", "bergen"], fixedStart: "oslo", fixedEnd: "bergen", preferredModes: ["road"], pace: "relaxed" },
    expectedCharacteristics: ["The road-trip direction remains coherent", "Bergen remains the car-return gateway", "Driving-time uncertainty is visible"],
    unacceptableFailures: ["Replace the core road journey with flights", "Break the fixed car-return gateway", "Claim road time from straight-line distance as verified"],
    usefulWarnings: ["The heuristic may misclassify longer domestic legs as rail", "Road, ferry and mountain conditions require dated confirmation"],
    acceptableVariations: ["Lillehammer can be shortened or omitted", "Geiranger and Ålesund can swap only if the overall drive remains defensible"],
    review: [{ dimension: "preference-fit", question: "Does the plan preserve the journey-as-experience purpose of a road trip?" }],
  },
  {
    id: "india-honeymoon-booking",
    name: "India honeymoon with fixed booking",
    coverage: ["south-asia", "honeymoon", "fixed-booking", "mixed-transport", "relaxed-pace"],
    prompt: "Fifteen days from Delhi through Agra, Jaipur and Udaipur, finishing in Mumbai. Our Udaipur palace stay is booked for 14 February 2027, so preserve the entered order until that commitment is fully linked.",
    availableDays: 15,
    origin: { name: "London", coordinates: [-0.1276, 51.5072] },
    stops: [
      stop("delhi", "Delhi", "India", [77.1025, 28.7041]),
      stop("agra", "Agra", "India", [78.0081, 27.1767], "landmark"),
      stop("jaipur", "Jaipur", "India", [75.7873, 26.9124]),
      stop("udaipur", "Udaipur", "India", [73.7125, 24.5854], "landmark"),
      stop("mumbai", "Mumbai", "India", [72.8777, 19.0760]),
    ],
    picks: { agra: ["Taj Mahal"], udaipur: ["Palace stay"] },
    constraints: { transportModes: ["train", "flight"], fixedCommitments: [{ label: "Udaipur palace stay", date: "2027-02-14" }] },
    requirements: { mustInclude: ["delhi", "agra", "udaipur", "mumbai"], fixedStart: "delhi", fixedEnd: "mumbai", preferredModes: ["train", "flight"], pace: "relaxed" },
    expectedCharacteristics: ["The entered order is protected", "The fixed booking remains visible", "Agra and Udaipur retain meaningful time"],
    unacceptableFailures: ["Reorder around an unlinked booking", "Drop Udaipur", "Compress both honeymoon anchors to one night"],
    usefulWarnings: ["The booking needs stop-level dates before safe reordering", "Long domestic connections require live confirmation"],
    acceptableVariations: ["Night allocations can change around the protected order", "A flight can be preferred for Udaipur to Mumbai"],
    review: [{ dimension: "overall-usability", question: "Is preserving the entered order clearly explained as caution around the fixed booking?" }],
  },
  {
    id: "indonesia-seven-islands",
    name: "Indonesia bounded island route",
    coverage: ["southeast-asia", "backpacking", "island-hopping", "ferry", "seven-plus-stops"],
    prompt: "Eighteen days backpacking east from Bali through Nusa Lembongan, Gili Air, Lombok, Labuan Bajo, Ende and Maumere. Keep Bali first and Maumere last, and compare only a bounded useful set rather than every possible island order.",
    availableDays: 18,
    origin: { name: "Singapore", coordinates: [103.8198, 1.3521] },
    stops: [
      stop("bali", "Bali", "Indonesia", [115.1889, -8.4095]),
      stop("nusa-lembongan", "Nusa Lembongan", "Indonesia", [115.4590, -8.6780]),
      stop("gili-air", "Gili Air", "Indonesia", [116.0810, -8.3570]),
      stop("lombok", "Lombok", "Indonesia", [116.3249, -8.6500]),
      stop("labuan-bajo", "Labuan Bajo", "Indonesia", [119.8890, -8.4960], "landmark"),
      stop("ende", "Ende", "Indonesia", [121.6550, -8.8430]),
      stop("maumere", "Maumere", "Indonesia", [122.2117, -8.6199]),
    ],
    picks: { "labuan-bajo": ["Komodo National Park"] },
    requirements: { mustInclude: ["bali", "labuan-bajo", "maumere"], fixedStart: "bali", fixedEnd: "maumere", preferredModes: ["ferry", "flight"], pace: "fast" },
    expectedCharacteristics: ["Candidate generation stays bounded", "The route broadly progresses east", "Komodo remains protected"],
    unacceptableFailures: ["Generate factorially many candidates", "Send the route west again after Flores", "Treat water crossings as verified road legs"],
    usefulWarnings: ["Ferry and island-flight facts are largely unknown", "Seven stops may still feel compressed"],
    acceptableVariations: ["Nusa Lembongan or Gili Air can be identified as optional", "Flights can replace selected ferries when disclosed"],
    review: [{ dimension: "route-efficiency", question: "Is the bounded winner geographically coherent rather than merely the first generated order?" }],
  },
  {
    id: "australia-family-mixed",
    name: "Australia family mixed transport",
    coverage: ["oceania", "family", "mixed-transport", "fixed-gateway"],
    prompt: "Sixteen days as a family starting in Sydney, then Melbourne and Hobart, flying home from Adelaide. Keep airport-heavy days visible and avoid turning every city into a short transfer stop.",
    availableDays: 16,
    origin: { name: "Singapore", coordinates: [103.8198, 1.3521] },
    stops: [
      stop("sydney", "Sydney", "Australia", [151.2093, -33.8688]),
      stop("melbourne", "Melbourne", "Australia", [144.9631, -37.8136]),
      stop("hobart", "Hobart", "Australia", [147.3272, -42.8821]),
      stop("adelaide", "Adelaide", "Australia", [138.6007, -34.9285]),
    ],
    picks: {},
    constraints: { transportModes: ["flight", "drive"] },
    requirements: { mustInclude: ["sydney", "melbourne", "hobart", "adelaide"], fixedStart: "sydney", fixedEnd: "adelaide", preferredModes: ["flight", "road"], pace: "balanced" },
    expectedCharacteristics: ["Sydney and Adelaide gateways remain fixed", "Tasmania is treated as a distinct flight or ferry movement", "Family pacing leaves recovery time"],
    unacceptableFailures: ["Ignore either gateway", "Treat Hobart as a simple road leg from the mainland", "Hide multiple airport-heavy days"],
    usefulWarnings: ["Domestic flight schedules and local airport access are unverified", "Hobart may make the trip flight-heavy"],
    acceptableVariations: ["Hobart can precede Melbourne if flight logic supports it", "A longer Melbourne stay can absorb a slower family pace"],
    review: [{ dimension: "pacing", question: "Does the family itinerary remain credible after realistic airport overhead is counted?" }],
  },
  {
    id: "canada-accessible-no-drive",
    name: "Eastern Canada accessible rail trip",
    coverage: ["family", "mobility-needs", "no-driving", "rail", "relaxed-pace"],
    prompt: "Fourteen days for a family rail trip from Toronto through Ottawa and Montreal to Quebec City. One traveller uses a wheelchair, and nobody will drive. Keep the route simple and leave station accessibility unverified unless supported.",
    availableDays: 14,
    origin: { name: "London", coordinates: [-0.1276, 51.5072] },
    stops: [
      stop("toronto", "Toronto", "Canada", [-79.3832, 43.6532]),
      stop("ottawa", "Ottawa", "Canada", [-75.6972, 45.4215]),
      stop("montreal", "Montreal", "Canada", [-73.5673, 45.5017]),
      stop("quebec-city", "Quebec City", "Canada", [-71.2080, 46.8139]),
    ],
    picks: {},
    constraints: { transportModes: ["train"], avoidDriving: true },
    requirements: { mustInclude: ["toronto", "ottawa", "montreal", "quebec-city"], fixedStart: "toronto", fixedEnd: "quebec-city", noDriving: true, preferredModes: ["train"], pace: "relaxed" },
    expectedCharacteristics: ["No road leg is proposed", "The eastern corridor remains linear", "Accessibility remains a confirmation need rather than an invented fact"],
    unacceptableFailures: ["Recommend driving", "Backtrack west after Montreal", "Claim stations or hotels are step-free without data"],
    usefulWarnings: ["Exact rail schedules and assistance availability need confirmation"],
    acceptableVariations: ["Ottawa and Montreal can receive different night weights", "The first international arrival remains a flight outside the rail preference"],
    review: [{ dimension: "overall-usability", question: "Does the route reduce moves while clearly separating geographic suitability from verified accessibility?" }],
  },
  {
    id: "impossible-required-maximum",
    name: "Impossible required-stop maximum",
    coverage: ["overpacked", "fixed-gateway"],
    prompt: "We have nine days and all five cities are mandatory, but we also insist on no more than four stops. Start in Mexico City and finish in Cancun. Do not silently drop a city to hide the contradiction.",
    availableDays: 9,
    origin: { name: "Guatemala City", coordinates: [-90.5069, 14.6349] },
    stops: [
      stop("mexico-city", "Mexico City", "Mexico", [-99.1332, 19.4326]),
      stop("oaxaca", "Oaxaca", "Mexico", [-96.7266, 17.0732]),
      stop("san-cristobal", "San Cristóbal de las Casas", "Mexico", [-92.6376, 16.7370]),
      stop("merida", "Mérida", "Mexico", [-89.5926, 20.9674]),
      stop("cancun", "Cancún", "Mexico", [-86.8515, 21.1619]),
    ],
    picks: {},
    requirements: {
      mustInclude: ["mexico-city", "oaxaca", "san-cristobal", "merida", "cancun"],
      fixedStart: "mexico-city",
      fixedEnd: "cancun",
      maxStops: 4,
      pace: "fast",
      expectedConflictCodes: ["required-stops-exceed-maximum", "maximum-stops-exceeded"],
    },
    expectedCharacteristics: ["No candidate is presented as valid", "Both maximum-stop conflicts remain structured", "No required city is silently removed"],
    unacceptableFailures: ["Drop a required destination", "Select a hard-invalid winner", "Pretend five mandatory stops satisfy a four-stop maximum"],
    usefulWarnings: ["The traveller must relax either the required list or the maximum", "Nine days is also likely overpacked"],
    acceptableVariations: ["Recommend more days", "Ask the traveller which requirement to relax"],
    review: [{ dimension: "overall-usability", question: "Does the result make the contradiction actionable instead of merely saying route comparison failed?" }],
  },
];

export const ENGINE_V2_BENCHMARKS: BenchmarkScenario[] = [
  ...ENGINE_V2_BASELINE_BENCHMARKS,
  ...ENGINE_V2_EXPANSION_BENCHMARKS,
];
