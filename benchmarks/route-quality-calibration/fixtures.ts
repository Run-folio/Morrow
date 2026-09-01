import type { PlannerStop, RoutePlanningConstraints } from "../../lib/easyt/planner.ts";

export type RouteQualityCalibrationGeography =
  | "japan"
  | "southern-spain"
  | "portugal"
  | "andes"
  | "mexico-guatemala-belize"
  | "italy"
  | "balkans"
  | "thailand"
  | "vietnam"
  | "morocco"
  | "us-southwest"
  | "scotland";

export type RouteQualityCalibrationFixture = {
  id: string;
  name: string;
  geography: RouteQualityCalibrationGeography;
  specialCases: string[];
  origin: {
    name: string;
    country: string;
    canonicalPlaceId: string;
    coordinates: [number, number];
  };
  stops: PlannerStop[];
  days: number;
  pace: "relaxed" | "balanced" | "fast";
  /** Calibration intent only; production routing continues to use its existing constraints. */
  orderIntent: "flexible" | "prefer-entered" | "fixed-entered";
  constraints: RoutePlanningConstraints;
  humanReview: {
    /** Strong human-planner orders. More than one is listed when geography alone cannot settle a preference. */
    goodOrders: string[][];
    /** Defensible orders that should not be classified as objectively poor. */
    acceptableOrders: string[][];
    /** Material faults in the entered order, not differences of taste. */
    objectiveIssues: string[];
    /** Why retaining the entered order is the right result when no material improvement exists. */
    intentionalUnchangedReason?: string;
  };
};

type CalibrationStop = PlannerStop & {
  coordinates: [number, number];
  canonicalPlaceId: string;
};

const stop = (
  id: string,
  name: string,
  country: string,
  coordinates: [number, number],
  canonicalPlaceId = id,
): CalibrationStop => ({ id, name, country, canonicalPlaceId, coordinates });

function fixture(
  input: Omit<RouteQualityCalibrationFixture, "stops" | "constraints"> & {
    stops: CalibrationStop[];
    constraints?: RoutePlanningConstraints;
  },
): RouteQualityCalibrationFixture {
  const stops = input.stops.map((item) => ({
    ...item,
    coordinates: [...item.coordinates] as [number, number],
  }));
  return {
    ...input,
    stops,
    constraints: {
      requiredStopIds: stops.map((item) => item.id),
      ...input.constraints,
    },
  };
}

const japan = [
  stop("tokyo", "Tokyo", "Japan", [139.6917, 35.6895]),
  stop("kanazawa", "Kanazawa", "Japan", [136.6562, 36.5613]),
  stop("takayama", "Takayama", "Japan", [137.2523, 36.1461]),
  stop("kyoto", "Kyoto", "Japan", [135.7681, 35.0116]),
  stop("hiroshima", "Hiroshima", "Japan", [132.4553, 34.3853]),
  stop("osaka", "Osaka", "Japan", [135.5023, 34.6937]),
];

const southernSpain = [
  stop("madrid", "Madrid", "Spain", [-3.7038, 40.4168]),
  stop("cordoba", "Córdoba", "Spain", [-4.7794, 37.8882]),
  stop("seville", "Seville", "Spain", [-5.9845, 37.3891]),
  stop("granada", "Granada", "Spain", [-3.5986, 37.1773]),
  stop("malaga", "Málaga", "Spain", [-4.4214, 36.7213]),
];

const portugal = [
  stop("porto", "Porto", "Portugal", [-8.6291, 41.1579]),
  stop("douro-valley", "Pinhão (Douro Valley)", "Portugal", [-7.545, 41.191], "pinhao"),
  stop("coimbra", "Coimbra", "Portugal", [-8.4292, 40.2033]),
  stop("lisbon", "Lisbon", "Portugal", [-9.1393, 38.7223]),
  stop("sintra", "Sintra", "Portugal", [-9.3817, 38.8029]),
  stop("algarve", "Lagos (Algarve)", "Portugal", [-8.6742, 37.1028], "lagos-portugal"),
];

const andes = [
  stop("lima", "Lima", "Peru", [-77.0428, -12.0464]),
  stop("huacachina", "Huacachina", "Peru", [-75.764, -14.0875]),
  stop("cusco", "Cusco", "Peru", [-71.9675, -13.5319]),
  stop("sacred-valley", "Ollantaytambo (Sacred Valley)", "Peru", [-72.2643, -13.2584], "ollantaytambo"),
  stop("lake-titicaca", "Puno (Lake Titicaca)", "Peru", [-70.0219, -15.8402], "puno"),
  stop("la-paz", "La Paz", "Bolivia", [-68.1193, -16.4897]),
  stop("uyuni", "Uyuni", "Bolivia", [-66.825, -20.46]),
];

const mayaRoute = [
  stop("cancun", "Cancún", "Mexico", [-86.8515, 21.1619]),
  stop("tulum", "Tulum", "Mexico", [-87.4654, 20.2114]),
  stop("caye-caulker", "Caye Caulker", "Belize", [-88.0317, 17.7425]),
  stop("flores", "Flores (Tikal base)", "Guatemala", [-89.892, 16.9304], "flores-guatemala"),
  stop("lake-atitlan", "Panajachel (Lake Atitlán base)", "Guatemala", [-91.156, 14.741], "panajachel"),
  stop("antigua", "Antigua Guatemala", "Guatemala", [-90.734, 14.5586], "antigua-guatemala"),
];

const italy = [
  stop("rome", "Rome", "Italy", [12.4964, 41.9028]),
  stop("florence", "Florence", "Italy", [11.2558, 43.7696]),
  stop("bologna", "Bologna", "Italy", [11.3426, 44.4949]),
  stop("venice", "Venice", "Italy", [12.3155, 45.4408]),
  stop("milan", "Milan", "Italy", [9.19, 45.4642]),
];

const balkans = [
  stop("ljubljana", "Ljubljana", "Slovenia", [14.5058, 46.0569]),
  stop("zagreb", "Zagreb", "Croatia", [15.9819, 45.815]),
  stop("split", "Split", "Croatia", [16.4402, 43.5081]),
  stop("sarajevo", "Sarajevo", "Bosnia and Herzegovina", [18.4131, 43.8563]),
  stop("mostar", "Mostar", "Bosnia and Herzegovina", [17.8078, 43.3438]),
  stop("dubrovnik", "Dubrovnik", "Croatia", [18.0944, 42.6507]),
];

const thailand = [
  stop("bangkok", "Bangkok", "Thailand", [100.5018, 13.7563]),
  stop("chiang-mai", "Chiang Mai", "Thailand", [98.9853, 18.7883]),
  stop("krabi", "Krabi", "Thailand", [98.9063, 8.0863]),
  stop("koh-lanta", "Koh Lanta", "Thailand", [99.0863, 7.6244]),
];

const vietnam = [
  stop("hanoi", "Hanoi", "Vietnam", [105.8342, 21.0278]),
  stop("ninh-binh", "Ninh Bình", "Vietnam", [105.9745, 20.2506]),
  stop("hue", "Huế", "Vietnam", [107.5909, 16.4637]),
  stop("hoi-an", "Hội An", "Vietnam", [108.338, 15.8801]),
  stop("ho-chi-minh-city", "Ho Chi Minh City", "Vietnam", [106.6297, 10.8231]),
];

const morocco = [
  stop("casablanca", "Casablanca", "Morocco", [-7.5898, 33.5731]),
  stop("rabat", "Rabat", "Morocco", [-6.8498, 34.0209]),
  stop("chefchaouen", "Chefchaouen", "Morocco", [-5.2636, 35.1688]),
  stop("fes", "Fes", "Morocco", [-5.0078, 34.0331]),
  stop("marrakech", "Marrakech", "Morocco", [-7.9811, 31.6295]),
  stop("essaouira", "Essaouira", "Morocco", [-9.7595, 31.5085]),
];

const usSouthwest = [
  stop("las-vegas", "Las Vegas", "United States", [-115.1398, 36.1699]),
  stop("zion", "Springdale (Zion)", "United States", [-112.9986, 37.1889], "springdale-utah"),
  stop("bryce-canyon", "Bryce Canyon City", "United States", [-112.1677, 37.6283], "bryce-canyon-city"),
  stop("page", "Page", "United States", [-111.4558, 36.9147], "page-arizona"),
  stop("grand-canyon", "Grand Canyon Village", "United States", [-112.1401, 36.0544], "grand-canyon-village"),
  stop("sedona", "Sedona", "United States", [-111.761, 34.8697]),
];

const scotland = [
  stop("edinburgh", "Edinburgh", "United Kingdom", [-3.1883, 55.9533]),
  stop("glencoe", "Glencoe", "United Kingdom", [-5.102, 56.6826]),
  stop("isle-of-skye", "Portree (Isle of Skye)", "United Kingdom", [-6.1946, 57.4125], "portree"),
  stop("inverness", "Inverness", "United Kingdom", [-4.2247, 57.4778]),
];

export const ROUTE_QUALITY_CALIBRATION_FIXTURES: RouteQualityCalibrationFixture[] = [
  fixture({
    id: "japan-excellent-entered-order",
    name: "Japan westbound order is already excellent",
    geography: "japan",
    specialCases: ["excellent-entered-order", "fixed-first", "fixed-final", "rail"],
    origin: { name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", coordinates: [139.6917, 35.6895] },
    stops: japan,
    days: 19,
    pace: "relaxed",
    orderIntent: "prefer-entered",
    constraints: { fixedStartStopId: "tokyo", fixedEndStopId: "osaka", transportModes: ["train"] },
    humanReview: {
      goodOrders: [["tokyo", "kanazawa", "takayama", "kyoto", "hiroshima", "osaka"]],
      acceptableOrders: [["tokyo", "takayama", "kanazawa", "kyoto", "hiroshima", "osaka"]],
      objectiveIssues: [],
      intentionalUnchangedReason: "The entered order progresses west, preserves both gateways and does not justify overriding traveller intent for a marginal alternative.",
    },
  }),
  fixture({
    id: "japan-deliberate-backtracking",
    name: "Japan entered order doubles back through the Alps",
    geography: "japan",
    specialCases: ["deliberate-backtracking", "fixed-first", "fixed-final", "rail"],
    origin: { name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", coordinates: [139.6917, 35.6895] },
    stops: [japan[0], japan[3], japan[1], japan[2], japan[4], japan[5]],
    days: 17,
    pace: "balanced",
    orderIntent: "flexible",
    constraints: { fixedStartStopId: "tokyo", fixedEndStopId: "osaka", transportModes: ["train"] },
    humanReview: {
      goodOrders: [["tokyo", "kanazawa", "takayama", "kyoto", "hiroshima", "osaka"]],
      acceptableOrders: [["tokyo", "takayama", "kanazawa", "kyoto", "hiroshima", "osaka"]],
      objectiveIssues: ["Kyoto before Kanazawa and Takayama creates a material eastward reversal before returning west."],
    },
  }),
  fixture({
    id: "southern-spain-linear",
    name: "Southern Spain follows a practical rail-and-road arc",
    geography: "southern-spain",
    specialCases: ["mixed-transport", "fixed-first", "fixed-final"],
    origin: { name: "Madrid", country: "Spain", canonicalPlaceId: "madrid", coordinates: [-3.7038, 40.4168] },
    stops: [southernSpain[0], southernSpain[3], southernSpain[1], southernSpain[2], southernSpain[4]],
    days: 14,
    pace: "balanced",
    orderIntent: "flexible",
    constraints: { fixedStartStopId: "madrid", fixedEndStopId: "malaga", transportModes: ["train", "drive"] },
    humanReview: {
      goodOrders: [["madrid", "cordoba", "seville", "granada", "malaga"]],
      acceptableOrders: [
        ["madrid", "seville", "cordoba", "granada", "malaga"],
        ["madrid", "granada", "cordoba", "seville", "malaga"],
      ],
      objectiveIssues: ["Visiting Granada before Córdoba and Seville introduces avoidable east-west backtracking."],
    },
  }),
  fixture({
    id: "southern-spain-very-short",
    name: "A seven-day Andalusia trip must not allocate every stop equally",
    geography: "southern-spain",
    specialCases: ["very-short", "unequal-nights", "fixed-first", "fixed-final"],
    origin: { name: "Madrid", country: "Spain", canonicalPlaceId: "madrid", coordinates: [-3.7038, 40.4168] },
    stops: southernSpain,
    days: 7,
    pace: "fast",
    orderIntent: "prefer-entered",
    constraints: { fixedStartStopId: "madrid", fixedEndStopId: "malaga", transportModes: ["train", "drive"] },
    humanReview: {
      goodOrders: [["madrid", "cordoba", "seville", "granada", "malaga"]],
      acceptableOrders: [["madrid", "seville", "cordoba", "granada", "malaga"]],
      objectiveIssues: ["Six nights across five required stops is compressed; equal stays would underweight Seville or Granada and overstate usable time in transit stops."],
      intentionalUnchangedReason: "The geographic sequence is already defensible; the material quality question is unequal night allocation, not another reorder.",
    },
  }),
  fixture({
    id: "portugal-fixed-algarve-gateway",
    name: "Portugal runs north to a fixed Algarve finish",
    geography: "portugal",
    specialCases: ["fixed-first", "fixed-final", "gateway", "base-day-trip"],
    origin: { name: "Porto", country: "Portugal", canonicalPlaceId: "porto", coordinates: [-8.6291, 41.1579] },
    stops: portugal,
    days: 16,
    pace: "balanced",
    orderIntent: "flexible",
    constraints: { fixedStartStopId: "porto", fixedEndStopId: "algarve", transportModes: ["train", "drive"] },
    humanReview: {
      goodOrders: [
        ["porto", "douro-valley", "coimbra", "sintra", "lisbon", "algarve"],
        ["porto", "douro-valley", "coimbra", "lisbon", "sintra", "algarve"],
      ],
      acceptableOrders: [],
      objectiveIssues: [],
      intentionalUnchangedReason: "Both Lisbon/Sintra variants preserve the north-to-south arc and fixed Algarve gateway; the entered order is already one of the strong options.",
    },
  }),
  fixture({
    id: "portugal-long-fixed-order",
    name: "A long Portugal trip keeps a traveller-fixed coherent order",
    geography: "portugal",
    specialCases: ["long-trip", "no-one-night-churn", "fixed-order", "excellent-entered-order"],
    origin: { name: "Porto", country: "Portugal", canonicalPlaceId: "porto", coordinates: [-8.6291, 41.1579] },
    stops: portugal,
    days: 42,
    pace: "relaxed",
    orderIntent: "fixed-entered",
    constraints: {
      fixedStartStopId: "porto",
      fixedEndStopId: "algarve",
      transportModes: ["train", "drive"],
      fixedCommitments: [{ label: "Traveller explicitly fixed the reviewed route sequence" }],
    },
    humanReview: {
      goodOrders: [["porto", "douro-valley", "coimbra", "lisbon", "sintra", "algarve"]],
      acceptableOrders: [["porto", "douro-valley", "coimbra", "sintra", "lisbon", "algarve"]],
      objectiveIssues: [],
      intentionalUnchangedReason: "The sequence is coherent and explicitly protected; extra duration should deepen bases rather than manufacture one-night churn or reorder the trip.",
    },
  }),
  fixture({
    id: "andes-cross-border-linear",
    name: "Andes route continues south across Peru and Bolivia",
    geography: "andes",
    specialCases: ["cross-border", "seven-stops", "fixed-first", "fixed-final", "altitude"],
    origin: { name: "Lima", country: "Peru", canonicalPlaceId: "lima", coordinates: [-77.0428, -12.0464] },
    stops: andes,
    days: 26,
    pace: "relaxed",
    orderIntent: "prefer-entered",
    constraints: { fixedStartStopId: "lima", fixedEndStopId: "uyuni", transportModes: ["flight", "drive"] },
    humanReview: {
      goodOrders: [
        ["lima", "huacachina", "cusco", "sacred-valley", "lake-titicaca", "la-paz", "uyuni"],
        ["lima", "huacachina", "sacred-valley", "cusco", "lake-titicaca", "la-paz", "uyuni"],
      ],
      acceptableOrders: [],
      objectiveIssues: [],
      intentionalUnchangedReason: "Cusco and the Sacred Valley can reasonably swap; the entered route otherwise progresses toward Bolivia and the fixed Uyuni finish.",
    },
  }),
  fixture({
    id: "andes-deliberate-backtracking",
    name: "Andes entered order returns to the coast and crosses the highlands twice",
    geography: "andes",
    specialCases: ["cross-border", "seven-stops", "deliberate-backtracking", "fixed-first", "fixed-final"],
    origin: { name: "Lima", country: "Peru", canonicalPlaceId: "lima", coordinates: [-77.0428, -12.0464] },
    stops: [andes[0], andes[2], andes[1], andes[3], andes[5], andes[4], andes[6]],
    days: 24,
    pace: "balanced",
    orderIntent: "flexible",
    constraints: { fixedStartStopId: "lima", fixedEndStopId: "uyuni" },
    humanReview: {
      goodOrders: [
        ["lima", "huacachina", "cusco", "sacred-valley", "lake-titicaca", "la-paz", "uyuni"],
        ["lima", "huacachina", "sacred-valley", "cusco", "lake-titicaca", "la-paz", "uyuni"],
      ],
      acceptableOrders: [],
      objectiveIssues: ["Cusco before Huacachina forces a major return toward the coast.", "La Paz before Lake Titicaca repeats the Peru-Bolivia corridor before the fixed Uyuni finish."],
    },
  }),
  fixture({
    id: "maya-cross-border-island",
    name: "Yucatán, Belize island and Guatemala bases form one southbound trip",
    geography: "mexico-guatemala-belize",
    specialCases: ["cross-border", "island-transition", "fixed-first", "fixed-final", "base-day-trip"],
    origin: { name: "Cancún", country: "Mexico", canonicalPlaceId: "cancun", coordinates: [-86.8515, 21.1619] },
    stops: mayaRoute,
    days: 19,
    pace: "balanced",
    orderIntent: "prefer-entered",
    constraints: { fixedStartStopId: "cancun", fixedEndStopId: "antigua" },
    humanReview: {
      goodOrders: [["cancun", "tulum", "caye-caulker", "flores", "lake-atitlan", "antigua"]],
      acceptableOrders: [],
      objectiveIssues: [],
      intentionalUnchangedReason: "The entered order groups the Caribbean island transition before continuing overland through Guatemala; Flores and Panajachel remain bases rather than duplicating Tikal or lake attractions as stops.",
    },
  }),
  fixture({
    id: "maya-fixed-antigua-backtracking",
    name: "A fixed Antigua finish still allows obvious regional backtracking to be removed",
    geography: "mexico-guatemala-belize",
    specialCases: ["cross-border", "island-transition", "deliberate-backtracking", "fixed-final"],
    origin: { name: "Cancún", country: "Mexico", canonicalPlaceId: "cancun", coordinates: [-86.8515, 21.1619] },
    stops: [mayaRoute[0], mayaRoute[3], mayaRoute[1], mayaRoute[2], mayaRoute[4], mayaRoute[5]],
    days: 18,
    pace: "balanced",
    orderIntent: "flexible",
    constraints: { fixedEndStopId: "antigua" },
    humanReview: {
      goodOrders: [["cancun", "tulum", "caye-caulker", "flores", "lake-atitlan", "antigua"]],
      acceptableOrders: [["tulum", "cancun", "caye-caulker", "flores", "lake-atitlan", "antigua"]],
      objectiveIssues: ["Flores before returning north to Tulum and Belize creates an unnecessary international reversal."],
    },
  }),
  fixture({
    id: "italy-excellent-entered-order",
    name: "Italy entered order already follows the main northbound corridor",
    geography: "italy",
    specialCases: ["excellent-entered-order", "fixed-first", "rail"],
    origin: { name: "Rome", country: "Italy", canonicalPlaceId: "rome", coordinates: [12.4964, 41.9028] },
    stops: italy,
    days: 15,
    pace: "balanced",
    orderIntent: "prefer-entered",
    constraints: { fixedStartStopId: "rome", transportModes: ["train"] },
    humanReview: {
      goodOrders: [
        ["rome", "florence", "bologna", "venice", "milan"],
        ["rome", "florence", "bologna", "milan", "venice"],
      ],
      acceptableOrders: [["rome", "florence", "venice", "bologna", "milan"]],
      objectiveIssues: [],
      intentionalUnchangedReason: "The route is already coherent; Venice and Milan can reasonably swap depending on the departure gateway, so a marginal score must not churn the plan.",
    },
  }),
  fixture({
    id: "italy-very-short-anchors",
    name: "Eight days in five Italian cities needs anchor-weighted nights",
    geography: "italy",
    specialCases: ["very-short", "unequal-nights", "fixed-first", "fixed-final", "rail"],
    origin: { name: "Rome", country: "Italy", canonicalPlaceId: "rome", coordinates: [12.4964, 41.9028] },
    stops: italy,
    days: 8,
    pace: "fast",
    orderIntent: "prefer-entered",
    constraints: { fixedStartStopId: "rome", fixedEndStopId: "milan", transportModes: ["train"] },
    humanReview: {
      goodOrders: [["rome", "florence", "bologna", "venice", "milan"]],
      acceptableOrders: [["rome", "florence", "venice", "bologna", "milan"]],
      objectiveIssues: ["Seven nights cannot give five cities equal meaningful stays; Rome and Florence are anchors while Bologna can serve as the shortest stop."],
      intentionalUnchangedReason: "The order is not the defect; a realistic unequal allocation and visible compression are required.",
    },
  }),
  fixture({
    id: "balkans-adriatic-flow",
    name: "Balkans route preserves two defensible Bosnia sequences",
    geography: "balkans",
    specialCases: ["cross-border", "fixed-first", "fixed-final", "mixed-transport"],
    origin: { name: "Ljubljana", country: "Slovenia", canonicalPlaceId: "ljubljana", coordinates: [14.5058, 46.0569] },
    stops: balkans,
    days: 18,
    pace: "balanced",
    orderIntent: "prefer-entered",
    constraints: { fixedStartStopId: "ljubljana", fixedEndStopId: "dubrovnik" },
    humanReview: {
      goodOrders: [["ljubljana", "zagreb", "split", "sarajevo", "mostar", "dubrovnik"]],
      acceptableOrders: [
        ["ljubljana", "zagreb", "split", "mostar", "sarajevo", "dubrovnik"],
        ["ljubljana", "zagreb", "sarajevo", "mostar", "split", "dubrovnik"],
      ],
      objectiveIssues: [],
      intentionalUnchangedReason: "Sarajevo-before-Mostar is geographically cleaner, while the reverse remains defensible once actual cross-border services are considered.",
    },
  }),
  fixture({
    id: "balkans-deliberate-reversal",
    name: "Balkans entered order jumps to Sarajevo before returning north",
    geography: "balkans",
    specialCases: ["cross-border", "deliberate-backtracking", "fixed-first", "fixed-final"],
    origin: { name: "Ljubljana", country: "Slovenia", canonicalPlaceId: "ljubljana", coordinates: [14.5058, 46.0569] },
    stops: [balkans[0], balkans[3], balkans[1], balkans[2], balkans[4], balkans[5]],
    days: 17,
    pace: "balanced",
    orderIntent: "flexible",
    constraints: { fixedStartStopId: "ljubljana", fixedEndStopId: "dubrovnik" },
    humanReview: {
      goodOrders: [["ljubljana", "zagreb", "split", "sarajevo", "mostar", "dubrovnik"]],
      acceptableOrders: [
        ["ljubljana", "zagreb", "split", "mostar", "sarajevo", "dubrovnik"],
        ["ljubljana", "zagreb", "sarajevo", "mostar", "split", "dubrovnik"],
      ],
      objectiveIssues: ["Sarajevo before Zagreb forces a long southeast jump followed by an avoidable return north and west."],
    },
  }),
  fixture({
    id: "thailand-island-flight-transition",
    name: "Thailand protects the north-to-Andaman flight and island finish",
    geography: "thailand",
    specialCases: ["island-flight-transition", "fixed-first", "fixed-final", "mixed-transport"],
    origin: { name: "Bangkok", country: "Thailand", canonicalPlaceId: "bangkok", coordinates: [100.5018, 13.7563] },
    stops: thailand,
    days: 14,
    pace: "balanced",
    orderIntent: "prefer-entered",
    constraints: { fixedStartStopId: "bangkok", fixedEndStopId: "koh-lanta", transportModes: ["flight", "drive"] },
    humanReview: {
      goodOrders: [["bangkok", "chiang-mai", "krabi", "koh-lanta"]],
      acceptableOrders: [],
      objectiveIssues: [],
      intentionalUnchangedReason: "The route uses one material north-to-south flight transition, then keeps Krabi and Koh Lanta together instead of bouncing between mainland and island bases.",
    },
  }),
  fixture({
    id: "vietnam-north-south-correction",
    name: "Vietnam corrects the Huế and Hội An reversal",
    geography: "vietnam",
    specialCases: ["deliberate-backtracking", "fixed-first", "fixed-final", "rail"],
    origin: { name: "Hanoi", country: "Vietnam", canonicalPlaceId: "hanoi", coordinates: [105.8342, 21.0278] },
    stops: [vietnam[0], vietnam[1], vietnam[3], vietnam[2], vietnam[4]],
    days: 15,
    pace: "balanced",
    orderIntent: "flexible",
    constraints: { fixedStartStopId: "hanoi", fixedEndStopId: "ho-chi-minh-city", transportModes: ["train"] },
    humanReview: {
      goodOrders: [["hanoi", "ninh-binh", "hue", "hoi-an", "ho-chi-minh-city"]],
      acceptableOrders: [["hanoi", "ninh-binh", "hoi-an", "hue", "ho-chi-minh-city"]],
      objectiveIssues: ["Hội An before Huế reverses the otherwise continuous north-to-south progression."],
    },
  }),
  fixture({
    id: "vietnam-excellent-slow-route",
    name: "A slower Vietnam route should preserve the entered sequence",
    geography: "vietnam",
    specialCases: ["excellent-entered-order", "long-trip", "fixed-first", "fixed-final"],
    origin: { name: "Hanoi", country: "Vietnam", canonicalPlaceId: "hanoi", coordinates: [105.8342, 21.0278] },
    stops: vietnam,
    days: 28,
    pace: "relaxed",
    orderIntent: "prefer-entered",
    constraints: { fixedStartStopId: "hanoi", fixedEndStopId: "ho-chi-minh-city", transportModes: ["train", "flight"] },
    humanReview: {
      goodOrders: [["hanoi", "ninh-binh", "hue", "hoi-an", "ho-chi-minh-city"]],
      acceptableOrders: [["hanoi", "ninh-binh", "hoi-an", "hue", "ho-chi-minh-city"]],
      objectiveIssues: [],
      intentionalUnchangedReason: "The entered order is the standard north-to-south arc and the longer window should deepen stays rather than trigger route churn.",
    },
  }),
  fixture({
    id: "morocco-north-to-atlantic",
    name: "Morocco groups the northern cities before Marrakech and Essaouira",
    geography: "morocco",
    specialCases: ["fixed-first", "fixed-final", "mixed-transport"],
    origin: { name: "Casablanca", country: "Morocco", canonicalPlaceId: "casablanca", coordinates: [-7.5898, 33.5731] },
    stops: [morocco[0], morocco[4], morocco[5], morocco[1], morocco[2], morocco[3]],
    days: 18,
    pace: "balanced",
    orderIntent: "flexible",
    constraints: { fixedStartStopId: "casablanca", fixedEndStopId: "essaouira" },
    humanReview: {
      goodOrders: [["casablanca", "rabat", "chefchaouen", "fes", "marrakech", "essaouira"]],
      acceptableOrders: [["casablanca", "rabat", "fes", "chefchaouen", "marrakech", "essaouira"]],
      objectiveIssues: ["Marrakech and Essaouira before Rabat, Chefchaouen and Fes creates a country-scale south-north-south reversal and violates the fixed Essaouira finish."],
    },
  }),
  fixture({
    id: "us-southwest-road-arc",
    name: "US Southwest road trip follows the canyon-country arc",
    geography: "us-southwest",
    specialCases: ["road-trip", "excellent-entered-order", "fixed-first", "fixed-final"],
    origin: { name: "Las Vegas", country: "United States", canonicalPlaceId: "las-vegas", coordinates: [-115.1398, 36.1699] },
    stops: usSouthwest,
    days: 15,
    pace: "balanced",
    orderIntent: "prefer-entered",
    constraints: { fixedStartStopId: "las-vegas", fixedEndStopId: "sedona", transportModes: ["drive"] },
    humanReview: {
      goodOrders: [["las-vegas", "zion", "bryce-canyon", "page", "grand-canyon", "sedona"]],
      acceptableOrders: [],
      objectiveIssues: [],
      intentionalUnchangedReason: "The entered road order follows a continuous arc through the parks; small mileage differences do not justify rewriting a coherent trip.",
    },
  }),
  fixture({
    id: "scotland-highlands-to-inverness",
    name: "Scotland reaches Skye through Glencoe before the Inverness gateway",
    geography: "scotland",
    specialCases: ["island-mainland", "road-trip", "fixed-first", "fixed-final"],
    origin: { name: "Edinburgh", country: "United Kingdom", canonicalPlaceId: "edinburgh", coordinates: [-3.1883, 55.9533] },
    stops: scotland,
    days: 11,
    pace: "relaxed",
    orderIntent: "prefer-entered",
    constraints: { fixedStartStopId: "edinburgh", fixedEndStopId: "inverness", transportModes: ["drive"] },
    humanReview: {
      goodOrders: [["edinburgh", "glencoe", "isle-of-skye", "inverness"]],
      acceptableOrders: [],
      objectiveIssues: [],
      intentionalUnchangedReason: "Glencoe before Skye creates a natural westbound progression and Inverness remains the practical fixed departure gateway; weather affects timing but does not justify the avoidable return to Glencoe.",
    },
  }),
];
