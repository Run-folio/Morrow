export type JourneyTheme = "city" | "mountain" | "coast" | "transit";
export type JourneyMarker = "plane" | "runner" | "garden" | "town" | "onsen" | "castle" | "panda" | "temple" | "pillars" | "gate" | "skyline";

export interface JourneyStop {
  id: string;
  city: string;
  country: string;
  date: string;
  coordinates: [number, number] | null;
  theme: JourneyTheme;
  marker: JourneyMarker;
  description: string;
  highlights: string[];
  aiPrompt: string;
}

export interface JourneyLeg {
  from: string;
  to: string;
  mode: "flight" | "rail" | "road";
  label: string;
  detail: string;
  duration?: string;
}

export interface JourneyDetailSection {
  title: string;
  copy: string;
}

export interface JourneyDay {
  label: string;
  title: string;
  items: string[];
}

export interface JourneyCalendarDay extends JourneyDay {
  id: string;
  date: string;
  stopId: string;
  city: string;
  travel?: { mode: JourneyLeg["mode"]; from?: string; detail: string; duration: string };
}

export interface JourneyImage {
  src: string;
  alt: string;
  caption: string;
  sourceUrl: string;
}

export interface JourneyMedia {
  hero: JourneyImage;
  gallery?: JourneyImage[];
}

export type RestaurantPace = "quick" | "relaxed" | "occasion";
export type RestaurantCraving = "signature" | "comfort" | "surprise";
export type RestaurantSpend = "budget" | "mid" | "treat";
export type RestaurantMeal = "lunch" | "dinner";
export type RestaurantDish = "noodles" | "curry" | "sushi" | "rice" | "beef" | "dim-sum" | "local";

export interface JourneyRestaurant {
  name: string;
  area: string;
  summary: string;
  order: string;
  pace: RestaurantPace[];
  craving: RestaurantCraving[];
  spend: RestaurantSpend[];
  meal: RestaurantMeal[];
  dish: RestaurantDish[];
  coordinates: [number, number];
  dayIds?: string[];
  fit: string;
  mapsUrl: string;
}

export interface JourneyDiningContext {
  base: string;
  notes: Record<string, string>;
}

export const march2027Journey = {
  title: "Tokyo Marathon+",
  dateRange: "Mar 1 — Mar 23, 2027",
  stops: [
    { id: "guatemala", city: "Guatemala City", country: "Guatemala", date: "Mar 1", coordinates: [-90.5069, 14.6349], theme: "transit", marker: "plane", description: "The starting point: one long journey east, threaded through cities, mountains and old routes.", highlights: ["Departure", "Pacific crossing"], aiPrompt: "What should I pack in my cabin bag for the long-haul journey?" },
    { id: "los-angeles-out", city: "Los Angeles", country: "United States", date: "Mar 1", coordinates: [-118.2437, 34.0522], theme: "transit", marker: "plane", description: "A deliberate pause before Tokyo — dinner, sleep and a soft reset before the Pacific.", highlights: ["Overnight reset", "Airport connection"], aiPrompt: "Suggest a calm evening near LAX." },
    { id: "tokyo", city: "Tokyo", country: "Japan", date: "Mar 2—8", coordinates: [139.6917, 35.6895], theme: "city", marker: "runner", description: "A seven-night base for time-zone adjustment, Mt. Takao and the Tokyo Marathon.", highlights: ["Tokyo Marathon", "Mt. Takao", "Ginza & Ryogoku"], aiPrompt: "Plan an easy pre-marathon day in Tokyo." },
    { id: "kanazawa", city: "Kanazawa", country: "Japan", date: "Mar 8—10", coordinates: [136.6562, 36.5613], theme: "city", marker: "garden", description: "Seafood, samurai streets and a slow first stop after the marathon.", highlights: ["Omicho Market", "Kenroku-en", "Higashi Chaya"], aiPrompt: "Create a low-walking Kanazawa day after a marathon." },
    { id: "takayama", city: "Takayama", country: "Japan", date: "Mar 10—12", coordinates: [137.252, 36.1461], theme: "mountain", marker: "town", description: "Old timber streets, Hida food and the transition into the Japanese Alps.", highlights: ["Shirakawa-go", "Hida beef", "Old town"], aiPrompt: "What are the unmissable food stops in Takayama?" },
    { id: "hirayu", city: "Hirayu Onsen", country: "Japan", date: "Mar 12—13", coordinates: [137.505, 36.182], theme: "mountain", marker: "onsen", description: "A mountain ryokan night after the Shin-Hotaka Ropeway: steam, snow and a final quiet Japanese evening.", highlights: ["Shin-Hotaka Ropeway", "Ryokan", "Onsen"], aiPrompt: "What should I know before staying at an onsen ryokan?" },
    { id: "matsumoto", city: "Matsumoto", country: "Japan", date: "Mar 13—14", coordinates: [137.972, 36.238], theme: "city", marker: "castle", description: "A compact final Japanese stop built around one of the country’s finest original castles.", highlights: ["Matsumoto Castle", "Soba", "Nakamachi"], aiPrompt: "Make the most of one afternoon in Matsumoto." },
    { id: "chengdu", city: "Chengdu", country: "China", date: "Mar 14—16", coordinates: [104.0665, 30.5728], theme: "city", marker: "panda", description: "Pandas at opening time, Three Kingdoms history and an exceptional food city.", highlights: ["Panda Valley", "Wuhou Shrine", "Sichuan food"], aiPrompt: "Plan a Chengdu day that starts with the pandas." },
    { id: "fanjingshan", city: "Fanjingshan", country: "China", date: "Mar 16—17", coordinates: [108.698, 27.917], theme: "mountain", marker: "temple", description: "A sacred peak of cloud forests, strange stone and temples perched above the world.", highlights: ["Red Clouds Golden Summit", "Mushroom Stone", "Temple hike"], aiPrompt: "What weather and layers should I plan for at Fanjingshan?" },
    { id: "wulingyuan", city: "Wulingyuan", country: "China", date: "Mar 17—19", coordinates: [110.4792, 29.345], theme: "mountain", marker: "pillars", description: "Two full days among the sandstone pillars of Zhangjiajie National Forest Park.", highlights: ["Yuanjiajie", "Tianzi Mountain", "Golden Whip Stream"], aiPrompt: "Build a two-day route through Zhangjiajie National Forest Park." },
    { id: "zhangjiajie", city: "Zhangjiajie", country: "China", date: "Mar 19—20", coordinates: [110.478, 29.117], theme: "mountain", marker: "gate", description: "A final mountain day: Tianmen’s cableway, cliff paths and Heaven’s Gate.", highlights: ["Tianmen Mountain", "Heaven’s Gate", "Cliff walks"], aiPrompt: "How should I structure a full Tianmen Mountain day?" },
    { id: "hong-kong", city: "Hong Kong", country: "Hong Kong", date: "Mar 20—23", coordinates: [114.1694, 22.3193], theme: "coast", marker: "skyline", description: "A city finale with harbour light, mountain paths, Cantonese food and the coast close at hand.", highlights: ["Victoria Peak", "Dragon’s Back", "Star Ferry"], aiPrompt: "Plan a three-day Hong Kong finale with a hike and beach." },
    { id: "los-angeles-back", city: "Los Angeles", country: "United States", date: "Mar 23", coordinates: [-118.2437, 34.0522], theme: "transit", marker: "plane", description: "A Pacific arrival and a clean same-day connection home.", highlights: ["Connection", "Homeward"], aiPrompt: "What should I allow for when connecting at LAX?" },
  ] satisfies JourneyStop[],
  legs: [
    { from: "guatemala", to: "los-angeles-out", mode: "flight", label: "Guatemala → Los Angeles", detail: "Avianca · nonstop", duration: "~5h 20" },
    { from: "los-angeles-out", to: "tokyo", mode: "flight", label: "Los Angeles → Tokyo", detail: "ZIPAIR · Pacific crossing", duration: "~11h 45" },
    { from: "tokyo", to: "kanazawa", mode: "rail", label: "Tokyo → Kanazawa", detail: "Hokuriku Shinkansen", duration: "~2h 30" },
    { from: "kanazawa", to: "takayama", mode: "road", label: "Kanazawa → Shirakawa-go → Takayama", detail: "Highway bus · village stop", duration: "Half day" },
    { from: "takayama", to: "hirayu", mode: "road", label: "Takayama → Hirayu", detail: "Nohi mountain bus", duration: "~1h" },
    { from: "hirayu", to: "matsumoto", mode: "road", label: "Hirayu → Matsumoto", detail: "Alpico mountain bus", duration: "~1h 30" },
    { from: "matsumoto", to: "chengdu", mode: "flight", label: "Japan → Chengdu", detail: "Rail + international flight", duration: "Travel day" },
    { from: "chengdu", to: "fanjingshan", mode: "rail", label: "Chengdu → Tongren → Fanjingshan", detail: "High-speed rail + taxi", duration: "5h 04 + road" },
    { from: "fanjingshan", to: "wulingyuan", mode: "rail", label: "Fanjingshan → Wulingyuan", detail: "Taxi + rail via Huaihua", duration: "16:22—20:46" },
    { from: "wulingyuan", to: "zhangjiajie", mode: "road", label: "Wulingyuan → Zhangjiajie", detail: "Hotel transfer", duration: "~45 min" },
    { from: "zhangjiajie", to: "hong-kong", mode: "rail", label: "Zhangjiajie → Hong Kong", detail: "Direct high-speed rail · 2nd class", duration: "~6h 40" },
    { from: "hong-kong", to: "los-angeles-back", mode: "flight", label: "Hong Kong → Los Angeles", detail: "Nonstop overnight flight", duration: "Pacific crossing" },
    { from: "los-angeles-back", to: "guatemala", mode: "flight", label: "Los Angeles → Guatemala", detail: "Same-day connection", duration: "~5h" },
  ] satisfies JourneyLeg[],
};

export const journeyDetails: Record<string, JourneyDetailSection[]> = {
  guatemala: [{ title: "Departure rhythm", copy: "Keep the first day deliberately light: fly to Los Angeles, sleep, then start the Pacific crossing rested." }],
  "los-angeles-out": [{ title: "Overnight reset", copy: "Stay near LAX, eat simply and use the stop to separate the Guatemala and Tokyo journeys." }],
  tokyo: [{ title: "Marathon focus", copy: "Prioritise time-zone adjustment, a gentle shakeout, the expo and low-walking neighbourhood time before race day." }, { title: "Worth doing", copy: "Mt. Takao is the one nature escape; keep it early enough to leave the final two days calm." }],
  kanazawa: [{ title: "Pace", copy: "A softer first stop after the marathon: seafood at Omicho, Kenroku-en and the Higashi Chaya district." }, { title: "Move on", copy: "Use the Kanazawa–Shirakawa-go–Takayama bus route rather than backtracking through Tokyo." }],
  takayama: [{ title: "Base", copy: "Use the old town for food and evening wandering, with a separate day for Shirakawa-go or snowboarding." }, { title: "Eat", copy: "Hida beef, local sake and the morning markets are the three things to build around." }],
  hirayu: [{ title: "Mountain pause", copy: "A single ryokan night makes the Alps feel like a destination rather than merely a transfer between towns." }],
  matsumoto: [{ title: "One-night stop", copy: "See the original black castle, eat soba and keep the final Japan transfer straightforward." }],
  chengdu: [{ title: "Morning priority", copy: "Visit Panda Valley at opening, then spend the rest of the day on food and a smaller slice of the city." }, { title: "Train onward", copy: "The direct Chengdu–Tongren train is the backbone of the China section." }],
  fanjingshan: [{ title: "Mountain day", copy: "Sleep by the East Gate, start early and keep the afternoon free for the Tongren–Zhangjiajie transfer." }, { title: "Conditions", copy: "March can bring cloud and cold at the summit; use layers and leave room for cable-car queues." }],
  wulingyuan: [{ title: "Two-day route", copy: "Use Wally House as the park base. Give Yuanjiajie and Tianzi Mountain a full day; Golden Whip Stream takes the other." }, { title: "Why stay here", copy: "Wulingyuan lets you start at the park gate instead of commuting from Zhangjiajie City." }],
  zhangjiajie: [{ title: "Tianmen day", copy: "Move into the city the night before, then take the cableway early and allow the whole day for Heaven’s Gate and cliff walks." }],
  "hong-kong": [{ title: "Finale", copy: "Use the contrast: a harbour evening, Cantonese food, a ride on the Star Ferry and one walk such as Dragon’s Back." }, { title: "Departure", copy: "The direct high-speed train arrives at West Kowloon, keeping the China–Hong Kong transition clean." }],
  "los-angeles-back": [{ title: "Connection", copy: "Leave a realistic immigration and baggage buffer at LAX before the final flight home to Guatemala." }],
};

export const journeyDays: Record<string, JourneyDay[]> = {
  guatemala: [{ label: "Day 1", title: "Leave Guatemala", items: ["Fly Guatemala City to Los Angeles", "Keep all Tokyo essentials in the cabin bag"] }],
  "los-angeles-out": [{ label: "Day 1", title: "A deliberate overnight", items: ["Check in near LAX", "Easy dinner and an early night", "Fly LA → Tokyo next morning"] }],
  tokyo: [{ label: "Day 2", title: "Arrive and reset", items: ["Ginza check-in", "Short neighbourhood walk", "Stay awake until evening"] }, { label: "Day 3", title: "Settle into Tokyo", items: ["Easy shakeout run", "Keep sightseeing local", "Eat normally and hydrate"] }, { label: "Day 4", title: "A nature break", items: ["Mt. Takao if energy is good", "Return to Ginza by evening"] }, { label: "Day 5", title: "Expo and final prep", items: ["Collect race pack", "Short run only", "Lay out race kit"] }, { label: "Day 6", title: "Tokyo Marathon", items: ["Race morning", "Recovery meal", "No major plans afterwards"] }],
  kanazawa: [{ label: "Day 7", title: "Ease into Kanazawa", items: ["Tokyo → Kanazawa train", "Omicho Market", "Low-key evening"] }, { label: "Day 8", title: "Garden and old quarters", items: ["Kenroku-en", "Nagamachi or Higashi Chaya", "Seafood dinner"] }],
  takayama: [{ label: "Day 9", title: "Into the Alps", items: ["Bus via Shirakawa-go", "Check into Takayama", "Old-town evening walk"] }, { label: "Day 10", title: "Choose your mountain day", items: ["Hounoki Daira snowboarding or Shirakawa-go", "Hida beef dinner"] }],
  hirayu: [{ label: "Day 11", title: "Onsen pause", items: ["Takayama → Hirayu", "Shin-Hotaka Ropeway", "Ryokan dinner and outdoor onsen"] }],
  matsumoto: [{ label: "Day 12", title: "Castle town", items: ["Hirayu → Matsumoto", "Matsumoto Castle", "Soba and Nakamachi"] }],
  chengdu: [{ label: "Day 13", title: "Arrive in Chengdu", items: ["Japan → Chengdu flight", "Settle into the food city", "Early night for pandas"] }, { label: "Day 14", title: "Pandas then Sichuan", items: ["Panda Valley at opening", "Wuhou Shrine or People’s Park", "Sichuan dinner"] }],
  fanjingshan: [{ label: "Day 15", title: "Travel to the mountain", items: ["Chengdu → Tongren train", "Taxi to Fanjingshan East Gate", "Sleep close to the entrance"] }, { label: "Day 16", title: "Summit and transfer", items: ["Early Fanjingshan cable car", "Red Clouds Golden Summit", "Afternoon train to Zhangjiajie"] }],
  wulingyuan: [{ label: "Day 17", title: "Avatar mountains", items: ["Check into Wulingyuan", "Yuanjiajie and Bailong Elevator", "Tianzi Mountain"] }, { label: "Day 18", title: "The quieter side", items: ["Golden Whip Stream", "Ten Mile Gallery", "Move to Zhangjiajie City"] }],
  zhangjiajie: [{ label: "Day 19", title: "Tianmen Mountain", items: ["Cable car at opening", "Cliff paths and glass walk", "Heaven’s Gate", "Evening train to Hong Kong"] }],
  "hong-kong": [{ label: "Day 20", title: "Harbour arrival", items: ["Arrive at West Kowloon", "Star Ferry at dusk", "Cantonese dinner"] }, { label: "Day 21", title: "City and peak", items: ["Victoria Peak", "Central and Sheung Wan", "Street-food evening"] }, { label: "Day 22", title: "A coastal finale", items: ["Dragon’s Back hike", "Shek O or Big Wave Bay", "Pack for the Pacific flight"] }],
  "los-angeles-back": [{ label: "Day 23", title: "Connect home", items: ["Hong Kong → Los Angeles", "Clear immigration and collect bags", "Continue to Guatemala"] }],
};

export const journeyCalendar: JourneyCalendarDay[] = [
  { id: "day-01", date: "Mar 1", label: "Day 1", stopId: "guatemala", city: "Guatemala → LA", title: "The journey begins", items: ["Fly Guatemala City to Los Angeles", "Check in close to LAX", "Simple dinner and an early night"] },
  { id: "day-02", date: "Mar 2", label: "Day 2", stopId: "tokyo", city: "Tokyo", title: "Cross the Pacific", items: ["Fly Los Angeles to Tokyo", "Keep race essentials in the cabin bag", "Set clocks to Tokyo time after boarding"] },
  { id: "day-03", date: "Mar 3", label: "Day 3", stopId: "tokyo", city: "Tokyo", title: "Arrive and reset", items: ["Check into Ginza", "Short neighbourhood walk", "Stay awake until evening"] },
  { id: "day-04", date: "Mar 4", label: "Day 4", stopId: "tokyo", city: "Tokyo", title: "Settle into the city", items: ["Easy shakeout run", "Keep sightseeing local", "Eat normally and hydrate"] },
  { id: "day-05", date: "Mar 5", label: "Day 5", stopId: "tokyo", city: "Mt. Takao", title: "A nature break", items: ["Early train to Mt. Takao", "Choose a gentle summit route", "Return to Ginza by evening"] },
  { id: "day-06", date: "Mar 6", label: "Day 6", stopId: "tokyo", city: "Tokyo", title: "Expo and final prep", items: ["Collect the race pack", "Short run only", "Lay out race kit and fuel"] },
  { id: "day-07", date: "Mar 7", label: "Day 7", stopId: "tokyo", city: "Tokyo", title: "Tokyo Marathon", items: ["Race morning", "Recovery meal near the finish", "No major plans afterwards"] },
  { id: "day-08", date: "Mar 8", label: "Day 8", stopId: "kanazawa", city: "Kanazawa", title: "Ease into Kanazawa", items: ["Shinkansen from Tokyo", "Lunch at Omicho Market", "Low-key evening walk"] },
  { id: "day-09", date: "Mar 9", label: "Day 9", stopId: "kanazawa", city: "Kanazawa", title: "Garden and old quarters", items: ["Kenroku-en at opening", "Nagamachi samurai district", "Higashi Chaya and seafood dinner"] },
  { id: "day-10", date: "Mar 10", label: "Day 10", stopId: "takayama", city: "Takayama", title: "Across the Japanese Alps", items: ["Bus via Shirakawa-go", "Continue to Takayama", "Old-town evening walk"] },
  { id: "day-11", date: "Mar 11", label: "Day 11", stopId: "takayama", city: "Takayama", title: "Snow or old-town day", items: ["Choose Hounoki Daira snowboarding or local exploring", "Morning markets", "Hida beef dinner"] },
  { id: "day-12", date: "Mar 12", label: "Day 12", stopId: "hirayu", city: "Hirayu Onsen", title: "A mountain pause", items: ["Travel into Okuhida", "Shin-Hotaka Ropeway", "Ryokan dinner and outdoor onsen"] },
  { id: "day-13", date: "Mar 13", label: "Day 13", stopId: "matsumoto", city: "Matsumoto", title: "Castle town", items: ["Bus from Hirayu", "Matsumoto Castle", "Soba and Nakamachi"] },
  { id: "day-14", date: "Mar 14", label: "Day 14", stopId: "chengdu", city: "Chengdu", title: "Japan to Sichuan", items: ["Travel to the airport", "Fly to Chengdu", "Settle into the food city"] },
  { id: "day-15", date: "Mar 15", label: "Day 15", stopId: "chengdu", city: "Chengdu", title: "Pandas then Sichuan", items: ["Panda Valley at opening", "Wuhou Shrine or People’s Park", "Sichuan dinner"] },
  { id: "day-16", date: "Mar 16", label: "Day 16", stopId: "fanjingshan", city: "Fanjingshan", title: "Travel to the mountain", items: ["Chengdu to Tongren train", "Taxi to Fanjingshan East Gate", "Sleep close to the entrance"] },
  { id: "day-17", date: "Mar 17", label: "Day 17", stopId: "fanjingshan", city: "Fanjingshan", title: "Summit and transfer", items: ["First cable car up", "Red Clouds Golden Summit", "Afternoon train to Zhangjiajie"] },
  { id: "day-18", date: "Mar 18", label: "Day 18", stopId: "wulingyuan", city: "Wulingyuan", title: "Avatar mountains", items: ["Yuanjiajie and Bailong Elevator", "Tianzi Mountain", "Evening in Wulingyuan"] },
  { id: "day-19", date: "Mar 19", label: "Day 19", stopId: "zhangjiajie", city: "Zhangjiajie", title: "Tianmen Mountain", items: ["Cable car at opening", "Cliff paths and glass walk", "Heaven’s Gate"] },
  { id: "day-20", date: "Mar 20", label: "Day 20", stopId: "hong-kong", city: "Hong Kong", title: "Rail to the harbour", items: ["High-speed train to West Kowloon", "Check in and reset", "Star Ferry at dusk"] },
  { id: "day-21", date: "Mar 21", label: "Day 21", stopId: "hong-kong", city: "Hong Kong", title: "City and peak", items: ["Victoria Peak", "Central and Sheung Wan", "Cantonese food evening"] },
  { id: "day-22", date: "Mar 22", label: "Day 22", stopId: "hong-kong", city: "Hong Kong", title: "A coastal finale", items: ["Dragon’s Back hike", "Shek O or Big Wave Bay", "Pack for the Pacific flight"] },
  { id: "day-23", date: "Mar 23", label: "Day 23", stopId: "los-angeles-back", city: "Los Angeles → Guatemala", title: "Connect home", items: ["Fly Hong Kong to Los Angeles", "Clear immigration and collect bags", "Continue to Guatemala"] },
];

export const journeyMedia: Record<string, JourneyMedia> = {
  guatemala: {
    hero: { src: "/journey/guatemala-city.jpg", alt: "Guatemala City skyline", caption: "Guatemala City / departure", sourceUrl: "https://commons.wikimedia.org/wiki/File:Guatemala_City_-_Cityscape_-_Skyline_-_Downtown.jpg" },
    gallery: [{ src: "/journey/guatemala-skyline.jpg", alt: "A broad view across Guatemala City", caption: "Guatemala City / the journey begins", sourceUrl: "https://commons.wikimedia.org/wiki/File:Guatemala_City_Skyline.jpg" }],
  },
  "los-angeles-out": {
    hero: { src: "/journey/los-angeles.jpg", alt: "Los Angeles skyline", caption: "Los Angeles / Pacific pause", sourceUrl: "https://commons.wikimedia.org/wiki/File:Lax_skyline_01212012.jpg" },
    gallery: [{ src: "/journey/los-angeles-coast.jpg", alt: "Los Angeles landscape from mountains to the Pacific", caption: "Los Angeles / mountains to ocean", sourceUrl: "https://commons.wikimedia.org/wiki/File:Los_angeles_mountains_to_ocean_pano.jpg" }],
  },
  tokyo: {
    hero: { src: "/journey/tokyo.jpg", alt: "The Tokyo skyline seen across Shinjuku", caption: "Tokyo / Shinjuku skyline", sourceUrl: "https://en.wikipedia.org/wiki/Tokyo" },
    gallery: [
      { src: "/journey/ginza-night.jpg", alt: "An illuminated Ginza street corner at blue hour", caption: "Ginza / arrival-night wander", sourceUrl: "https://commons.wikimedia.org/wiki/File:Illuminated_street_corner_at_blue_hour_-_facade_of_the_building_Fujiya_in_Ginza_Chuo-ku_Tokyo_Japan.jpg" },
      { src: "/journey/imperial-palace.jpg", alt: "Spring scenery around the Tokyo Imperial Palace", caption: "Imperial Palace / gentle city day", sourceUrl: "https://commons.wikimedia.org/wiki/File:Spring_season_at_the_Imperial_Palace,_Tokyo;_March_2013_(03).jpg" },
      { src: "/journey/imperial-palace-run.jpg", alt: "A waterside path around the Tokyo Imperial Palace", caption: "Imperial Palace / shakeout route", sourceUrl: "https://commons.wikimedia.org/wiki/File:Spring_season_at_the_Imperial_Palace,_Tokyo;_March_2013_(17).jpg" },
      { src: "/journey/takao.jpg", alt: "Forest scenery on Mount Takao", caption: "Mt. Takao / pre-marathon nature day", sourceUrl: "https://commons.wikimedia.org/wiki/File:Mount_Takao.jpg" },
      { src: "/journey/takao-summit.jpg", alt: "The broad view from the summit of Mount Takao", caption: "Mt. Takao / summit view", sourceUrl: "https://commons.wikimedia.org/wiki/File:View_@_Summit_@_Mount_Takao_(9876498975).jpg" },
      { src: "/journey/tokyo-big-sight-night.jpg", alt: "Tokyo Big Sight illuminated at night", caption: "Tokyo Big Sight / expo evening", sourceUrl: "https://commons.wikimedia.org/wiki/File:Tokyo_Big_Sight_at_Night.jpg" },
      { src: "/journey/tokyo-big-sight.jpg", alt: "The distinctive Tokyo Big Sight exhibition centre", caption: "Tokyo Big Sight / race expo", sourceUrl: "https://commons.wikimedia.org/wiki/File:Tokyo_Big_Sight_Inc.,_at_Ariake,_Koto,_Tokyo_(2018-08-09)_01.jpg" },
      { src: "/journey/tokyo-marathon.jpg", alt: "Runners moving through the streets during the Tokyo Marathon", caption: "Tokyo Marathon / race-day energy", sourceUrl: "https://commons.wikimedia.org/wiki/File:Tokyo_Marathon_-_47322102021.jpg" },
      { src: "/journey/tokyo-marathon-runner.jpg", alt: "A runner competing in the Tokyo Marathon", caption: "Tokyo Marathon / the centrepiece", sourceUrl: "https://commons.wikimedia.org/wiki/File:Tokyo_Marathon_2019_Runner_(46539748864)_(cropped).jpg" },
    ],
  },
  kanazawa: {
    hero: { src: "/journey/kanazawa.jpg", alt: "Winter scenery in Kanazawa", caption: "Kanazawa / garden city", sourceUrl: "https://en.wikipedia.org/wiki/Kanazawa" },
    gallery: [
      { src: "/journey/omicho-market.jpg", alt: "Fresh seafood at Omicho Market", caption: "Omicho Market / seafood lunch", sourceUrl: "https://commons.wikimedia.org/wiki/File:Kanazawa_fish_market.jpg" },
      { src: "/journey/kenrokuen.jpg", alt: "The stone lantern beside the pond at Kenroku-en", caption: "Kenroku-en / one of Japan’s great gardens", sourceUrl: "https://en.wikipedia.org/wiki/Kenroku-en" },
      { src: "/journey/higashi-chaya.jpg", alt: "Traditional timber buildings in Higashi Chaya", caption: "Higashi Chaya / old teahouse district", sourceUrl: "https://commons.wikimedia.org/wiki/File:Higashi_Chaya_district,_Kanazawa_(3810720612).jpg" },
    ],
  },
  takayama: {
    hero: { src: "/journey/takayama.jpg", alt: "Takayama streets in early winter", caption: "Takayama / early winter", sourceUrl: "https://en.wikipedia.org/wiki/Takayama,_Gifu" },
    gallery: [
      { src: "/journey/shirakawa-go.jpg", alt: "Traditional houses in snowy Shirakawa-go", caption: "Shirakawa-go / mountain village stop", sourceUrl: "https://commons.wikimedia.org/wiki/File:Shirakawa-go_winter_(51815452116).jpg" },
      { src: "/journey/takayama-old-town.jpg", alt: "Historic timber streets in Takayama old town", caption: "Takayama / old-town walk", sourceUrl: "https://commons.wikimedia.org/wiki/File:Hida_Takayama_old_town_streets_(48519369602).jpg" },
      { src: "/journey/hounoki-daira.jpg", alt: "Snowy slopes at Hounoki Daira ski area", caption: "Hounoki Daira / mountain day", sourceUrl: "https://commons.wikimedia.org/wiki/File:%E9%A3%9B%E9%A8%A8%E3%81%BB%E3%81%86%E3%81%AE%E3%81%8D%E5%B9%B3%E3%82%B9%E3%82%AD%E3%83%BC%E5%A0%B4_-_panoramio.jpg" },
    ],
  },
  hirayu: {
    hero: { src: "/journey/hirayu-onsen.jpg", alt: "A traditional outdoor bath at Hirayu Onsen", caption: "Hirayu Onsen / mountain pause", sourceUrl: "https://commons.wikimedia.org/wiki/File:Hirayu_onsen02n3872.jpg" },
    gallery: [
      { src: "/journey/shinhotaka-ropeway.jpg", alt: "Shin-Hotaka Ropeway over the Japanese Alps", caption: "Shin-Hotaka / alpine ropeway", sourceUrl: "https://commons.wikimedia.org/wiki/File:Shinhotaka_Ropeway_001.jpg" },
      { src: "/journey/hirayu-mountain.jpg", alt: "Mount Akandana seen from Hirayu Onsen", caption: "Okuhida / mountain road", sourceUrl: "https://commons.wikimedia.org/wiki/File:View_of_Mount_Akandana_and_National_Route_158_from_west_of_Hirayu_Onsen,_Takayama,_2016.jpg" },
    ],
  },
  matsumoto: { hero: { src: "/journey/matsumoto.jpg", alt: "Matsumoto Castle and its reflecting moat", caption: "Matsumoto Castle", sourceUrl: "https://en.wikipedia.org/wiki/Matsumoto_Castle" }, gallery: [{ src: "/journey/matsumoto-nakamachi.jpg", alt: "Traditional merchant buildings along Nakamachi Street", caption: "Nakamachi / merchant quarter", sourceUrl: "https://commons.wikimedia.org/wiki/File:Nakamachi_street_Matsumoto_Nagano_pref_Japan01s3.jpg" }] },
  chengdu: {
    hero: { src: "/journey/chengdu.jpg", alt: "Chengdu skyline with snow-capped mountains beyond", caption: "Chengdu / gateway to western China", sourceUrl: "https://en.wikipedia.org/wiki/Chengdu" },
    gallery: [
      { src: "/journey/panda.jpg", alt: "A giant panda eating bamboo", caption: "Panda morning", sourceUrl: "https://en.wikipedia.org/wiki/Giant_panda" },
      { src: "/journey/wuhou-shrine.jpg", alt: "Historic architecture at Wuhou Shrine", caption: "Wuhou Shrine / Three Kingdoms history", sourceUrl: "https://en.wikipedia.org/wiki/Wuhou_Shrine" },
      { src: "/journey/peoples-park-chengdu.jpg", alt: "Lake and greenery in Chengdu People's Park", caption: "People’s Park / tea-house pause", sourceUrl: "https://en.wikipedia.org/wiki/People%27s_Park_(Chengdu)" },
    ],
  },
  fanjingshan: { hero: { src: "/journey/fanjingshan.jpg", alt: "The twin temples on Fanjingshan’s Red Clouds Golden Summit", caption: "Red Clouds Golden Summit", sourceUrl: "https://en.wikipedia.org/wiki/Fanjingshan" }, gallery: [{ src: "/journey/fanjingshan-mountain.jpg", alt: "The forested ridges of Mount Fanjing", caption: "Mount Fanjing / mountain approach", sourceUrl: "https://commons.wikimedia.org/wiki/File:Mount_Fanjing,_31_March_2020c.jpg" }] },
  wulingyuan: { hero: { src: "/journey/wulingyuan.jpg", alt: "Sandstone pillars rising through mist in Wulingyuan", caption: "Yuanjiajie / sandstone pillars", sourceUrl: "https://en.wikipedia.org/wiki/Zhangjiajie_National_Forest_Park" }, gallery: [
    { src: "/journey/tianzi-mountain.jpg", alt: "Sandstone pillars at Tianzi Mountain", caption: "Tianzi Mountain / high viewpoints", sourceUrl: "https://commons.wikimedia.org/wiki/File:1_tianzishan_wulingyuan_zhangjiajie_2012.jpg" },
    { src: "/journey/golden-whip-stream.jpg", alt: "Forest and water along Golden Whip Stream", caption: "Golden Whip Stream / valley walk", sourceUrl: "https://commons.wikimedia.org/wiki/File:%E9%87%91%E9%9E%AD%E6%BA%AA_-_panoramio_(1).jpg" },
  ] },
  zhangjiajie: { hero: { src: "/journey/zhangjiajie.jpg", alt: "Tianmen Mountain above Zhangjiajie", caption: "Heaven’s Gate / Tianmen Mountain", sourceUrl: "https://en.wikipedia.org/wiki/Tianmen_Mountain" }, gallery: [{ src: "/journey/tianmen-cableway.jpg", alt: "Cableway climbing Tianmen Mountain", caption: "Tianmen / city-to-summit cableway", sourceUrl: "https://commons.wikimedia.org/wiki/File:Tianmen_Mountain_20180326_094808.jpg" }] },
  "hong-kong": {
    hero: { src: "/journey/hong-kong.jpg", alt: "Hong Kong skyline and Victoria Harbour from the Peak", caption: "Victoria Harbour / from the Peak", sourceUrl: "https://en.wikipedia.org/wiki/Victoria_Harbour" },
    gallery: [
      { src: "/journey/star-ferry.jpg", alt: "Tsim Sha Tsui Star Ferry Pier", caption: "Star Ferry / harbour crossing", sourceUrl: "https://en.wikipedia.org/wiki/Star_Ferry" },
      { src: "/journey/dragons-back.jpg", alt: "Coastal views from the Dragon’s Back trail", caption: "Dragon’s Back / coastal hike", sourceUrl: "https://commons.wikimedia.org/wiki/File:Dragon%27s_Back,_Hong_Kong_02.jpg" },
      { src: "/journey/hong-kong-central-tram.jpg", alt: "A tram moving through Central Hong Kong", caption: "Central / city streets by tram", sourceUrl: "https://commons.wikimedia.org/wiki/File:HK_Tram_64_view_%E4%B8%AD%E7%92%B0_Central_%E5%BE%B7%E8%BC%94%E9%81%93%E4%B8%AD_Des_Voeux_Road_Central_HSBC_Hong_Kong_headquarters_building_Bank_Street_November_2019_SS2.jpg" },
      { src: "/journey/shek-o-beach.jpg", alt: "The sand and headlands of Shek O Beach", caption: "Shek O / post-hike coast", sourceUrl: "https://commons.wikimedia.org/wiki/File:Shek_O_Beach.JPG" },
    ],
  },
  "los-angeles-back": {
    hero: { src: "/journey/los-angeles-coast.jpg", alt: "Los Angeles landscape from mountains to the Pacific", caption: "Los Angeles / Pacific connection", sourceUrl: "https://commons.wikimedia.org/wiki/File:Los_angeles_mountains_to_ocean_pano.jpg" },
    gallery: [{ src: "/journey/los-angeles.jpg", alt: "Los Angeles skyline", caption: "Los Angeles / homeward connection", sourceUrl: "https://commons.wikimedia.org/wiki/File:Lax_skyline_01212012.jpg" }],
  },
};

function mediaImages(id: string) {
  const media = journeyMedia[id];
  return media ? [media.hero, ...(media.gallery ?? [])] : [];
}

function leadWith(images: JourneyImage[], index: number) {
  return [...images.slice(index), ...images.slice(0, index)];
}

const tokyoImages = mediaImages("tokyo");
const kanazawaImages = mediaImages("kanazawa");
const takayamaImages = mediaImages("takayama");
const chengduImages = mediaImages("chengdu");
const hongKongImages = mediaImages("hong-kong");

function imagesBySrc(images: JourneyImage[], ...sources: string[]) {
  return sources.flatMap((source) => images.find((image) => image.src === source) ?? []);
}

export const journeyDayMedia: Record<string, JourneyImage[]> = {
  "day-01": [...mediaImages("guatemala"), ...mediaImages("los-angeles-out")],
  "day-02": imagesBySrc(tokyoImages, "/journey/tokyo.jpg", "/journey/ginza-night.jpg"),
  "day-03": imagesBySrc(tokyoImages, "/journey/ginza-night.jpg", "/journey/imperial-palace.jpg", "/journey/tokyo.jpg"),
  "day-04": imagesBySrc(tokyoImages, "/journey/imperial-palace.jpg", "/journey/ginza-night.jpg", "/journey/imperial-palace-run.jpg"),
  "day-05": imagesBySrc(tokyoImages, "/journey/takao-summit.jpg", "/journey/takao.jpg"),
  "day-06": imagesBySrc(tokyoImages, "/journey/tokyo-big-sight-night.jpg", "/journey/imperial-palace.jpg", "/journey/tokyo-big-sight.jpg"),
  "day-07": imagesBySrc(tokyoImages, "/journey/tokyo-marathon-runner.jpg", "/journey/tokyo-marathon.jpg"),
  "day-08": leadWith(kanazawaImages, 0),
  "day-09": leadWith(kanazawaImages, 2),
  "day-10": leadWith(takayamaImages, 1),
  "day-11": leadWith(takayamaImages, 3),
  "day-12": [...mediaImages("hirayu"), ...takayamaImages],
  "day-13": [...mediaImages("matsumoto"), ...mediaImages("hirayu")],
  "day-14": leadWith(chengduImages, 0),
  "day-15": leadWith(chengduImages, 1),
  "day-16": imagesBySrc(mediaImages("fanjingshan"), "/journey/fanjingshan-mountain.jpg", "/journey/fanjingshan.jpg"),
  "day-17": imagesBySrc(mediaImages("fanjingshan"), "/journey/fanjingshan-mountain.jpg", "/journey/fanjingshan.jpg"),
  "day-18": [...mediaImages("wulingyuan"), ...mediaImages("zhangjiajie"), ...mediaImages("fanjingshan")],
  "day-19": [...mediaImages("zhangjiajie"), ...mediaImages("wulingyuan")],
  "day-20": imagesBySrc(hongKongImages, "/journey/hong-kong.jpg", "/journey/star-ferry.jpg"),
  "day-21": imagesBySrc(hongKongImages, "/journey/hong-kong-central-tram.jpg", "/journey/hong-kong.jpg"),
  "day-22": imagesBySrc(hongKongImages, "/journey/shek-o-beach.jpg", "/journey/dragons-back.jpg"),
  "day-23": [...mediaImages("los-angeles-back"), ...hongKongImages],
};

export const journeyRestaurants: Record<string, JourneyRestaurant[]> = {
  tokyo: [
    { name: "Ginza Kagari Honten", area: "Ginza · near your hotel", summary: "Polished chicken paitan ramen without sending you across Tokyo after a travel or preparation day.", order: "Tori paitan soba", pace: ["quick", "relaxed"], craving: ["comfort", "signature"], spend: ["budget", "mid"], meal: ["lunch", "dinner"], dish: ["noodles"], coordinates: [139.7618, 35.6696], dayIds: ["day-03", "day-04", "day-06"], fit: "Best fit for a low-effort evening from the Ginza base.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Ginza+Kagari+Honten" },
    { name: "Fuunji", area: "Shinjuku · Takao return route", summary: "A compact noodle stop built around intensely savoury chicken-and-fish tsukemen.", order: "Special dipping noodles", pace: ["quick"], craving: ["comfort", "signature"], spend: ["budget", "mid"], meal: ["lunch", "dinner"], dish: ["noodles"], coordinates: [139.6975, 35.6871], dayIds: ["day-05"], fit: "Makes most sense while returning from Mt. Takao through Shinjuku.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Fuunji+Shinjuku+Tokyo" },
    { name: "Tsujihan Nihonbashi", area: "Nihonbashi · one stop from Ginza", summary: "A focused seafood rice bowl that feels special without becoming a long formal meal.", order: "Zeitaku-don, finished with broth", pace: ["relaxed", "occasion"], craving: ["signature", "surprise"], spend: ["mid"], meal: ["lunch", "dinner"], dish: ["rice", "sushi"], coordinates: [139.7732, 35.6826], dayIds: ["day-03", "day-04", "day-07"], fit: "Close enough for the arrival base and gentle enough for post-marathon recovery.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Tsujihan+Nihonbashi+Tokyo" },
    { name: "Ginza Swiss", area: "Ginza · near your hotel", summary: "A long-running yoshoku counter associated with the original Japanese katsu curry.", order: "Katsu curry", pace: ["quick", "relaxed"], craving: ["comfort", "signature"], spend: ["budget", "mid"], meal: ["lunch", "dinner"], dish: ["curry"], coordinates: [139.7662, 35.6701], dayIds: ["day-03", "day-04", "day-06", "day-07"], fit: "An easy Japanese curry option close to the Ginza base.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Ginza+Swiss+Tokyo" },
  ],
  kanazawa: [
    { name: "Mori Mori Sushi Omicho", area: "Omicho Market", summary: "An easy, lively way to explore Hokuriku seafood exactly where the arrival-day itinerary already stops.", order: "Local fish and three-piece specials", pace: ["quick", "relaxed"], craving: ["signature"], spend: ["budget", "mid"], meal: ["lunch", "dinner"], dish: ["sushi"], coordinates: [136.6563, 36.5718], dayIds: ["day-08"], fit: "No detour: use it for the planned Omicho lunch after the Shinkansen.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Mori+Mori+Sushi+Omicho+Kanazawa" },
    { name: "Kourin Sushi", area: "Owaricho · between Omicho and Higashi Chaya", summary: "A small sushi counter positioned naturally between the market and eastern teahouse district.", order: "Chef’s local-fish selection", pace: ["relaxed"], craving: ["signature", "surprise"], spend: ["mid"], meal: ["lunch", "dinner"], dish: ["sushi"], coordinates: [136.6613, 36.5719], dayIds: ["day-09"], fit: "The cleanest geographic fit after Kenroku-en and Higashi Chaya.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Kourin+Sushi+Kanazawa" },
    { name: "Itaru Honten", area: "Kakinokibatake · near the garden side", summary: "An izakaya-style dinner for sashimi, grilled fish and regional dishes.", order: "Sashimi platter and nodoguro", pace: ["relaxed", "occasion"], craving: ["signature", "comfort"], spend: ["mid", "treat"], meal: ["dinner"], dish: ["sushi", "local"], coordinates: [136.6505, 36.5605], dayIds: ["day-09"], fit: "Worth choosing when the seafood dinner is the evening’s main event.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Itaru+Honten+Kanazawa" },
  ],
  takayama: [
    { name: "Menya Shirakawa", area: "Old town", summary: "A tiny counter for Takayama’s light soy-based ramen after the bus and old-town walk.", order: "Chuka soba", pace: ["quick"], craving: ["comfort", "signature"], spend: ["budget"], meal: ["lunch", "dinner"], dish: ["noodles"], coordinates: [137.25688, 36.142734], dayIds: ["day-10"], fit: "Best on the arrival evening when you are already walking the old town.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Menya+Shirakawa+Takayama" },
    { name: "Center4 Hamburgers", area: "Kamiichinomachi · old town", summary: "A characterful hideaway serving a Takayama take on the burger.", order: "Limited Hida beef burger", pace: ["relaxed"], craving: ["comfort", "surprise"], spend: ["mid"], meal: ["lunch", "dinner"], dish: ["beef"], coordinates: [137.2593, 36.1416], dayIds: ["day-10", "day-11"], fit: "A useful flexible option if ski timing makes a formal dinner awkward.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Center4+Hamburgers+Takayama" },
    { name: "Hidagyu Maruaki", area: "Near Takayama Station", summary: "A full Hida beef meal for the night when the local speciality is the main event.", order: "Yakiniku cuts to share", pace: ["relaxed", "occasion"], craving: ["signature"], spend: ["treat"], meal: ["lunch", "dinner"], dish: ["beef"], coordinates: [137.2508, 36.1426], dayIds: ["day-11"], fit: "Matches the planned Hida beef dinner after Hounoki Daira or the morning markets.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Hidagyu+Maruaki+Takayama" },
  ],
  matsumoto: [
    { name: "Restaurant Kitamon", area: "Inside the former castle grounds", summary: "Handmade soba that fits directly into the castle visit rather than adding another cross-town stop.", order: "Zaru soba and a local side", pace: ["quick", "relaxed"], craving: ["signature", "comfort"], spend: ["budget", "mid"], meal: ["lunch"], dish: ["noodles", "local"], coordinates: [137.9688, 36.2389], dayIds: ["day-13"], fit: "The most efficient lunch for the castle-and-Nakamachi afternoon.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Restaurant+Kitamon+Matsumoto" },
    { name: "Shizuka", area: "Otemachi · castle quarter", summary: "A homely local restaurant for regional dishes in a calm traditional room.", order: "Sanzokuyaki and seasonal sides", pace: ["relaxed"], craving: ["signature", "comfort"], spend: ["mid"], meal: ["lunch", "dinner"], dish: ["local"], coordinates: [137.9687, 36.2358], dayIds: ["day-13"], fit: "A slower alternative still close to the castle and Nakamachi route.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Shizuka+Matsumoto+restaurant" },
  ],
  chengdu: [
    { name: "Chen Mapo Tofu", area: "Qingyang · central Chengdu", summary: "A direct introduction to Chengdu’s defining dish without committing to a long tasting meal.", order: "Mapo tofu with rice", pace: ["quick", "relaxed"], craving: ["signature", "comfort"], spend: ["budget", "mid"], meal: ["lunch", "dinner"], dish: ["rice", "local"], coordinates: [104.066584, 30.666926], dayIds: ["day-14", "day-15"], fit: "Reliable for the arrival night or after People’s Park.", mapsUrl: "https://www.amap.com/search?query=%E9%99%88%E9%BA%BB%E5%A9%86%E8%B1%86%E8%85%90%20%E6%88%90%E9%83%BD" },
    { name: "Ming Ting Restaurant", area: "Caojiaxiang", summary: "A bustling neighbourhood institution for bold shared Sichuan plates.", order: "Lotus-leaf pork ribs and house specials", pace: ["relaxed"], craving: ["signature", "surprise"], spend: ["budget", "mid"], meal: ["lunch", "dinner"], dish: ["local"], coordinates: [104.083, 30.679], dayIds: ["day-15"], fit: "Use it after the full panda-and-city day, when sharing several dishes makes sense.", mapsUrl: "https://www.amap.com/search?query=%E6%98%8E%E5%A9%B7%E9%A5%AD%E5%BA%97%20%E6%88%90%E9%83%BD" },
    { name: "Yu’s Family Kitchen", area: "Qingyang", summary: "A reservation-worthy tasting experience for a more expressive view of Sichuan cooking.", order: "Set tasting menu", pace: ["occasion"], craving: ["surprise"], spend: ["treat"], meal: ["dinner"], dish: ["local"], coordinates: [104.055, 30.666], dayIds: ["day-15"], fit: "Only choose this if dinner itself replaces the evening plan.", mapsUrl: "https://www.amap.com/search?query=%E5%96%BB%E5%AE%B6%E5%8E%A8%E6%88%BF%20%E6%88%90%E9%83%BD" },
  ],
  "hong-kong": [
    { name: "Tim Ho Wan", area: "West Kowloon Station", summary: "Accessible dim sum exactly where the high-speed train arrives.", order: "Baked barbecue-pork buns and dim sum", pace: ["quick", "relaxed"], craving: ["signature", "comfort"], spend: ["budget", "mid"], meal: ["lunch", "dinner"], dish: ["dim-sum"], coordinates: [114.165402, 22.303807], dayIds: ["day-20"], fit: "The strongest arrival-day match before checking in or walking to the harbour.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Tim+Ho+Wan+West+Kowloon+Hong+Kong" },
    { name: "Mak’s Noodle", area: "Central · Wellington Street", summary: "A quick heritage stop for springy noodles and shrimp wontons between city sights.", order: "Wonton noodle soup", pace: ["quick"], craving: ["signature", "comfort"], spend: ["budget"], meal: ["lunch", "dinner"], dish: ["noodles"], coordinates: [114.1556, 22.2817], dayIds: ["day-21"], fit: "Drops neatly into the Central–Sheung Wan walking day.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Mak%27s+Noodle+Wellington+Street+Hong+Kong" },
    { name: "Kau Kee", area: "Sheung Wan", summary: "A no-frills favourite for rich beef-brisket noodles in the middle of an urban wander.", order: "Beef brisket noodles", pace: ["quick"], craving: ["comfort", "surprise"], spend: ["budget"], meal: ["lunch", "dinner"], dish: ["noodles", "beef"], coordinates: [114.1512, 22.2841], dayIds: ["day-21"], fit: "Best when the itinerary has already carried you west through Sheung Wan.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Kau+Kee+Restaurant+Hong+Kong" },
    { name: "Shek O Chinese & Thai Restaurant", area: "Shek O village", summary: "A casual post-hike meal that avoids returning hungry across the island.", order: "Seafood, fried rice and shared plates", pace: ["quick", "relaxed"], craving: ["comfort", "surprise"], spend: ["budget", "mid"], meal: ["lunch", "dinner"], dish: ["rice", "local"], coordinates: [114.2519, 22.2307], dayIds: ["day-22"], fit: "The practical finish after Dragon’s Back and Shek O beach.", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Shek+O+Chinese+and+Thai+Restaurant+Hong+Kong" },
  ],
};

export const journeyDiningContext: Record<string, JourneyDiningContext> = {
  tokyo: { base: "Ginza hotel", notes: { "day-03": "Keep the first meal walkable from Ginza after landing.", "day-05": "A Shinjuku stop works naturally on the return from Mt. Takao.", "day-06": "Choose familiar, carb-forward food and avoid a long queue before the race.", "day-07": "Recovery beats ceremony: favour something close, salty and easy." } },
  kanazawa: { base: "Central Kanazawa", notes: { "day-08": "You already plan to eat at Omicho Market after the Shinkansen.", "day-09": "Recommendations favour the Kenroku-en–Higashi Chaya sightseeing corridor." } },
  takayama: { base: "Takayama old town", notes: { "day-10": "Arrival night stays close to the old-town walk.", "day-11": "After Hounoki Daira, the station side is useful for a proper Hida beef dinner." } },
  hirayu: { base: "Hirayu ryokan", notes: { "day-12": "Dinner is already part of the ryokan experience—do not schedule another restaurant." } },
  matsumoto: { base: "Castle and Nakamachi", notes: { "day-13": "With one afternoon, restaurants should sit directly on the castle-to-Nakamachi route." } },
  chengdu: { base: "Central Chengdu", notes: { "day-14": "Arrival night should be straightforward.", "day-15": "The full sightseeing day can support a longer Sichuan dinner." } },
  fanjingshan: { base: "East Gate guesthouse", notes: { "day-16": "Eat beside the East Gate and get an early night; ask the guesthouse for the best open kitchen.", "day-17": "Carry snacks for the summit and eat during the Huaihua train connection." } },
  wulingyuan: { base: "Wally House · East Gate", notes: { "day-18": "Let Wally recommend a currently good local Hunan kitchen near the East Gate after the park." } },
  zhangjiajie: { base: "Shile Minsu · Tianmen cableway", notes: { "day-19": "Keep food close to the cableway and station because the Hong Kong train controls the evening." } },
  "hong-kong": { base: "West Kowloon / harbour", notes: { "day-20": "Arrival-day options are weighted to West Kowloon.", "day-21": "Central and Sheung Wan restaurants rise to the top.", "day-22": "The coastal day favours eating in Shek O before returning." } },
};
