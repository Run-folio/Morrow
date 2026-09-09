/** Editorial image identity is independent of the overnight-base model.
 * Keys resolve only through Morrovia's attributed, locally hosted inventories. */
export type RouteVisualMoment = { name: string; stopName: string; photoKey: string; context: string };
export type RouteEditorialImagery = {
  /** Route-card and route-detail identity. */
  hero: string;
  /** Independent homepage scene; never implicitly falls back to the route hero. */
  homepageHero: { photoKey: string } | { generatedAsset: string; credit: string; creditEs: string };
  closing: string;
  bases: Record<string, { photoKey: string; caption: string }>;
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
  "iceland-ring-road": {
    hero: "glacier-lagoon", homepageHero: { photoKey: "skogafoss" }, closing: "skogafoss",
    bases: {
      "Reykjavík": { photoKey: "thingvellir", caption: "Þingvellir · an optional landscape day from Reykjavík" },
      "Vík": { photoKey: "skogafoss", caption: "Skógafoss · along the south-coast chapter" },
      "Höfn": { photoKey: "glacier-lagoon", caption: "Jökulsárlón · a stop along the southeast journey, with nights in Höfn" },
      "Reykjahlíð": { photoKey: "myvatn", caption: "Mývatn · volcanic landscapes around the Reykjahlíð base" },
    },
    moments: [
      { name: "Ice, with room to linger", stopName: "Höfn", photoKey: "glacier-lagoon", context: "Jökulsárlón · a southeast route stop, not an overnight base." },
      { name: "The scale of the south coast", stopName: "Vík", photoKey: "skogafoss", context: "Skógafoss · leave space in the driving day for the waterfall." },
      { name: "Where the landscape opens", stopName: "Reykjavík", photoKey: "thingvellir", context: "Þingvellir · an optional day before heading along the coast." },
      { name: "A different kind of earth", stopName: "Reykjahlíð", photoKey: "myvatn", context: "Mývatn · protect the northern landscape days after the longer drive." },
    ],
  },
  "vietnam-cambodia": {
    hero: "angkor-wat", homepageHero: { photoKey: "trang-an" }, closing: "trang-an",
    bases: {
      "Hanoi": { photoKey: "trang-an", caption: "Tràng An, Ninh Bình · an optional excursion from the Hanoi base" },
      "Siem Reap": { photoKey: "angkor-wat", caption: "Angkor Wat · temple days from your Siem Reap base" },
    },
    moments: [
      { name: "The journey to Angkor", stopName: "Siem Reap", photoKey: "angkor-wat", context: "Stay in Siem Reap; give the temples their own days." },
      { name: "Between limestone and water", stopName: "Hanoi", photoKey: "trang-an", context: "Tràng An, Ninh Bình · choose a full excursion day from Hanoi." },
      { name: "Lanterns, lanes and slower days", stopName: "Hoi An", photoKey: "hoi-an", context: "A central pause for the old town, bicycles and coast." },
    ],
  },
  "balkans-overland": {
    hero: "kotor", homepageHero: { photoKey: "dubrovnik" }, closing: "dubrovnik",
    bases: { "Kotor": { photoKey: "kotor", caption: "Kotor Bay · the mountain-and-water heart of the journey" } },
    moments: [
      { name: "Mountains meet the bay", stopName: "Kotor", photoKey: "kotor", context: "A generous bay chapter between border crossings." },
      { name: "The Adriatic opening", stopName: "Dubrovnik", photoKey: "dubrovnik", context: "Coastal light and old-town time before moving south." },
      { name: "Northern Albania, at its own pace", stopName: "Shkodër", photoKey: "shkoder", context: "Keep the local day. A Theth mountain extension needs additional nights and arranged transport." },
    ],
  },
};
