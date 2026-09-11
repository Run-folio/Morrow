/** Editorial image identity is independent of the overnight-base model.
 * Keys resolve only through Morrovia's reviewed, attributed inventories. */
export type RouteVisualMoment = { name: string; stopName: string; photoKey: string; context: string };
export const homepageFirstPartyPhotoSlots = {
  "japan-south-korea": { photoKey: "morrovia-homepage-japan-south-korea", cloudinaryPublicId: "japan_tyklgc", sourceUrl: "https://res.cloudinary.com/dbt3wkwa3/image/upload/v1746628499/japan_tyklgc.jpg", focalPosition: "35% center" },
  "iceland-ring-road": { photoKey: "morrovia-homepage-iceland-ring-road", cloudinaryPublicId: "iceland_rmehmy", sourceUrl: "https://res.cloudinary.com/dbt3wkwa3/image/upload/v1746628507/iceland_rmehmy.jpg", focalPosition: "67% center" },
  "balkans-overland": { photoKey: "morrovia-homepage-balkans-overland", cloudinaryPublicId: "montenegro_qdjqbm", sourceUrl: "https://res.cloudinary.com/dbt3wkwa3/image/upload/v1746628489/montenegro_qdjqbm.png", focalPosition: "56% center" },
  "vietnam-cambodia": { photoKey: "morrovia-homepage-vietnam-cambodia", cloudinaryPublicId: "cambodia_ki9fqp", sourceUrl: "https://res.cloudinary.com/dbt3wkwa3/image/upload/v1746628426/cambodia_ki9fqp.jpg", focalPosition: "73% center" },
  "namibia-self-drive": { photoKey: "morrovia-homepage-namibia-self-drive", cloudinaryPublicId: "namibia_vwfyeb", sourceUrl: "https://res.cloudinary.com/dbt3wkwa3/image/upload/v1746632023/namibia_vwfyeb.jpg", focalPosition: "34% center" },
  "peru-bolivia": { photoKey: "morrovia-homepage-peru-bolivia", cloudinaryPublicId: "bolivia_tn5l1g", sourceUrl: "https://res.cloudinary.com/dbt3wkwa3/image/upload/v1744679348/bolivia_tn5l1g.jpg", focalPosition: "38% center" },
  "mexico-guatemala": { photoKey: "morrovia-homepage-mexico-guatemala", cloudinaryPublicId: "guatemala_jkuqfl", sourceUrl: "https://res.cloudinary.com/dbt3wkwa3/image/upload/v1744679360/guatemala_jkuqfl.jpg", focalPosition: "46% center" },
} as const;

export type RouteEditorialImagery = {
  /** Route-card and route-detail identity. */
  hero: string;
  /** Independent homepage scene; never implicitly falls back to the route hero. */
  homepageHero: ({ photoKey: string } | { generatedAsset: string; credit: string; creditEs: string }) & { focalPosition?: string };
  closing: string;
  bases: Record<string, { photoKey: string; panelPhotoKey?: string | null; caption: string }>;
  /** Optional homepage-only projection. Canonical route stops remain unchanged. */
  panelStopIndexes?: number[];
  moments: RouteVisualMoment[];
};

export const routeEditorialImagery: Record<string, RouteEditorialImagery> = {
  "japan-slow": {
    hero: "kyoto", homepageHero: { generatedAsset: "hero-japan", credit: "Imagined landscape · inspired by the Japanese Alps", creditEs: "Paisaje imaginado · inspirado en los Alpes japoneses" }, closing: "tokyo", bases: {},
    moments: [
      { name: "Tokyo after dark", stopName: "Tokyo", photoKey: "tokyo", context: "Neighbourhood time, with the evening left open." },
      { name: "Into the mountain towns", stopName: "Takayama", photoKey: "takayama", context: "A slower chapter between the larger cities." },
      { name: "Kyoto, one lane at a time", stopName: "Kyoto", photoKey: "kyoto", context: "Leave room between the places you came to see." },
    ],
  },
  "japan-south-korea": {
    hero: "kyoto", homepageHero: { photoKey: "south-korea" }, closing: "tokyo",
    bases: {
      Tokyo: { photoKey: "tokyo", caption: "Tokyo · an energetic arrival before the route turns toward the mountains" },
      Kanazawa: { photoKey: "kanazawa", caption: "Kanazawa · a compact cultural chapter on the way inland" },
      Takayama: { photoKey: "takayama", caption: "Takayama · a slower mountain-town pause between larger cities" },
      Kyoto: { photoKey: "kyoto", caption: "Kyoto · several days for neighbourhoods and separate cultural visits" },
      Osaka: { photoKey: "osaka", caption: "Osaka · a food-led pause before the international connection" },
      Seoul: { photoKey: "south-korea", caption: "A quiet Seoul street · the first Korean base" },
      Busan: { photoKey: "south-korea", caption: "South Korea · the rail journey continues to the Busan coast" },
    },
    moments: [
      { name: "Into the Japanese Alps", stopName: "Takayama", photoKey: "takayama", context: "Keep a slower mountain chapter between larger cities." },
      { name: "Kyoto, one lane at a time", stopName: "Kyoto", photoKey: "kyoto", context: "Leave room between the places you came to see." },
      { name: "A different urban rhythm", stopName: "Seoul", photoKey: "south-korea", context: "Protect a full Korean city chapter after the international connection." },
    ],
  },
  "iceland-ring-road": {
    hero: "glacier-lagoon", homepageHero: { photoKey: "skogafoss" }, closing: "skogafoss",
    panelStopIndexes: [0, 1, 2, 3, 5, 6],
    bases: {
      Reykjavík: { photoKey: "thingvellir", caption: "Þingvellir · a landscape day around the Reykjavík chapters" },
      Grundarfjörður: { photoKey: "reykjavik", panelPhotoKey: "kirkjufell", caption: "Kirkjufell · the overnight base for the Snæfellsnes chapter is Grundarfjörður" },
      Akureyri: { photoKey: "akureyri", caption: "Akureyri · a northern city pause before Mývatn" },
      Reykjahlíð: { photoKey: "myvatn", caption: "Mývatn · volcanic landscapes around the Reykjahlíð base" },
      Egilsstaðir: { photoKey: "hofn", caption: "Egilsstaðir · an Eastfjords base that keeps the drive south realistic" },
      Höfn: { photoKey: "glacier-lagoon", caption: "Jökulsárlón · visited from the real overnight base in Höfn" },
      Vík: { photoKey: "skogafoss", caption: "Skógafoss · along the south-coast chapter" },
    },
    moments: [
      { name: "Ice, with room to linger", stopName: "Höfn", photoKey: "glacier-lagoon", context: "Jökulsárlón is a route visit; the overnight base remains Höfn." },
      { name: "A different kind of earth", stopName: "Reykjahlíð", photoKey: "myvatn", context: "Protect the northern landscape days after the longer drive." },
      { name: "The scale of the south coast", stopName: "Vík", photoKey: "skogafoss", context: "Leave space in the driving day for the waterfall." },
    ],
  },
  "balkans-overland": {
    hero: "kotor", homepageHero: { photoKey: "dubrovnik" }, closing: "dubrovnik",
    bases: {
      Split: { photoKey: "dubrovnik", caption: "Croatia's Adriatic coast · the route opens in Split" },
      Dubrovnik: { photoKey: "dubrovnik", caption: "Dubrovnik · old-city time before the first border" },
      Kotor: { photoKey: "kotor", caption: "Kotor Bay · the mountain-and-water heart of the journey" },
      Shkodër: { photoKey: "shkoder", caption: "Shkodër · a northern Albanian pause in the overland sequence" },
      Tirana: { photoKey: "tirana", caption: "Tirana · a capital chapter before turning east" },
      Ohrid: { photoKey: "ohrid", caption: "Lake Ohrid · the final cross-border chapter" },
    },
    moments: [
      { name: "The Adriatic opening", stopName: "Split", photoKey: "dubrovnik", context: "Follow the Croatian coast south before the first border." },
      { name: "Mountains meet the bay", stopName: "Kotor", photoKey: "kotor", context: "A generous bay chapter between border crossings." },
      { name: "The lake beyond the final border", stopName: "Ohrid", photoKey: "ohrid", context: "Finish with time for Ohrid and the lake." },
    ],
  },
  "vietnam-cambodia": {
    hero: "angkor-wat", homepageHero: { photoKey: "trang-an" }, closing: "trang-an",
    bases: {
      Hanoi: { photoKey: "hanoi", caption: "Hanoi · a food-led arrival before the route moves south" },
      "Ninh Bình": { photoKey: "trang-an", caption: "Tràng An · a full landscape day from the Ninh Bình base" },
      "Huế": { photoKey: "hoi-an", caption: "Central Vietnam · the route gives Huế its own heritage chapter" },
      "Hội An": { photoKey: "hoi-an", caption: "Hội An · a slower central-Vietnam base" },
      "Ho Chi Minh City": { photoKey: "saigon", caption: "Ho Chi Minh City · a substantial southern base before the border" },
      "Phnom Penh": { photoKey: "siem-reap", caption: "Cambodia · the first base after the international border" },
      "Siem Reap": { photoKey: "angkor-wat", caption: "Angkor Wat · temple days from the Siem Reap base" },
    },
    moments: [
      { name: "Between limestone and water", stopName: "Ninh Bình", photoKey: "trang-an", context: "Give Tràng An a full landscape day from Ninh Bình." },
      { name: "Lanterns, lanes and slower days", stopName: "Hội An", photoKey: "hoi-an", context: "A central pause for the old town, bicycles and coast." },
      { name: "The journey to Angkor", stopName: "Siem Reap", photoKey: "angkor-wat", context: "Stay in Siem Reap; give the temples their own days." },
    ],
  },
  "namibia-self-drive": {
    hero: "sossusvlei", homepageHero: { photoKey: "etosha" }, closing: "etosha",
    bases: {
      Windhoek: { photoKey: "windhoek", caption: "Windhoek · the circular self-drive starts and ends in the capital" },
      Sossusvlei: { photoKey: "sossusvlei", caption: "Sossusvlei · dunes and long desert roads" },
      Swakopmund: { photoKey: "swakopmund", caption: "Swakopmund · an Atlantic pause between remote road chapters" },
      Damaraland: { photoKey: "damaraland", caption: "Damaraland · open roads and a distinct northern landscape chapter" },
      Etosha: { photoKey: "etosha", caption: "Etosha · a multi-night wildlife chapter" },
      Waterberg: { photoKey: "waterberg", caption: "Waterberg · the red escarpment before the return to Windhoek" },
    },
    moments: [
      { name: "Desert roads, deliberately", stopName: "Sossusvlei", photoKey: "sossusvlei", context: "Protect the long road day and a full early-start landscape day." },
      { name: "A pause by the Atlantic", stopName: "Swakopmund", photoKey: "sossusvlei", context: "Use the coast as a recovery chapter between remote drives." },
      { name: "Wildlife needs time", stopName: "Etosha", photoKey: "etosha", context: "Keep internal park movement separate from the arrival and departure days." },
    ],
  },
  "peru-bolivia": {
    hero: "uyuni", homepageHero: { photoKey: "andean-highlands" }, closing: "andean-highlands",
    bases: {
      Lima: { photoKey: "lima", caption: "Lima · a low-altitude Pacific opening" },
      Huacachina: { photoKey: "huacachina", caption: "Huacachina · a focused desert-oasis chapter before continuing south" },
      Arequipa: { photoKey: "arequipa", caption: "Arequipa · the route begins its gradual climb into the highlands" },
      Cusco: { photoKey: "andean-highlands", caption: "Cusco · a longer altitude-aware cultural base" },
      Puno: { photoKey: "titicaca", caption: "Puno · the real overnight base for Lake Titicaca" },
      "La Paz": { photoKey: "lapaz", caption: "La Paz · a high-altitude city chapter before Uyuni" },
      Uyuni: { photoKey: "uyuni", caption: "Salar de Uyuni · a landscape day from the Uyuni base" },
    },
    moments: [
      { name: "Climb slowly", stopName: "Cusco", photoKey: "andean-highlands", context: "Protect acclimatisation time before fuller days." },
      { name: "The lake has a real base", stopName: "Puno", photoKey: "andean-highlands", context: "Stay in Puno for Lake Titicaca instead of inventing a lake hotel stop." },
      { name: "The horizon opens", stopName: "Uyuni", photoKey: "uyuni", context: "Keep a full salt-flat day separate from the transfer." },
    ],
  },
  "mexico-guatemala": {
    hero: "atitlan", homepageHero: { photoKey: "oaxaca" }, closing: "oaxaca",
    bases: {
      "Mexico City": { photoKey: "oaxaca", caption: "Central Mexico · the route begins with a substantial Mexico City chapter" },
      Oaxaca: { photoKey: "oaxaca", caption: "Oaxaca · food, colour and time beyond the transfer day" },
      "San Cristóbal de las Casas": { photoKey: "oaxaca", caption: "Southern Mexico · the route rises into the Chiapas highlands" },
      Palenque: { photoKey: "oaxaca", caption: "Southern Mexico · the final base before the Guatemala border" },
      Flores: { photoKey: "tikal", caption: "Tikal · a landmark visit from the canonical overnight base in Flores" },
      "Antigua Guatemala": { photoKey: "atitlan", panelPhotoKey: null, caption: "Guatemala's highlands · a slower chapter in Antigua" },
      Panajachel: { photoKey: "atitlan", caption: "Panajachel · the practical Lake Atitlán base for the final chapter" },
    },
    moments: [
      { name: "Oaxaca, with time to taste it", stopName: "Oaxaca", photoKey: "oaxaca", context: "Keep two full local days between long road journeys." },
      { name: "Tikal is a visit, not a hotel base", stopName: "Flores", photoKey: "tikal", context: "Stay in Flores and protect a full day for the Tikal visit." },
      { name: "Finish by the lake", stopName: "Panajachel", photoKey: "atitlan", context: "Use a real lakeside base before booking accommodation." },
    ],
  },
};
