import { STAMP_COUNTRIES_BY_REGION, STAMP_REGIONS } from "./stamps.ts";

/**
 * Small, deterministic place and alias catalog used at the place-intelligence
 * boundary. It deliberately contains identity and containment only: no route,
 * transfer, accommodation, or inferred base claims belong here.
 */

export type PlaceTypeLiteral =
  | "continent"
  | "country"
  | "macro_region"
  | "region"
  | "sub_region"
  | "island"
  | "archipelago"
  | "city"
  | "town"
  | "natural_area"
  | "coast"
  | "mountain_range"
  | "valley"
  | "travel_corridor"
  | "landmark"
  | "transport_gateway"
  | "unknown";

export type RoutabilityLiteral =
  | "direct_destination"
  | "planning_area"
  | "anchor_or_poi"
  | "needs_base_selection"
  | "non_routable_reference";

export type PlaceCatalogEntry = {
  canonicalPlaceId: string;
  canonicalName: string;
  aliases: readonly string[];
  placeType: PlaceTypeLiteral;
  routability: RoutabilityLiteral;
  parentCountries: readonly string[];
  parentRegionId?: string;
  coordinates?: readonly [number, number];
  ambiguityGroup?: string;
  provenance: {
    id: string;
    label: string;
    kind: "curated" | "canonical";
    supports: string;
    reviewedAt: string;
  };
};

export type PlaceCatalogMatch = {
  sourceText: string;
  normalizedPhrase: string;
  start: number;
  end: number;
  entries: readonly PlaceCatalogEntry[];
};

type EntryOptions = {
  parentRegionId?: string;
  ambiguityGroup?: string;
  coordinates?: readonly [number, number];
};

const REVIEWED_AT = "2026-08-23";

function place(
  canonicalPlaceId: string,
  canonicalName: string,
  aliases: readonly string[],
  placeType: PlaceTypeLiteral,
  routability: RoutabilityLiteral,
  parentCountries: readonly string[],
  options: EntryOptions = {},
): PlaceCatalogEntry {
  return {
    canonicalPlaceId,
    canonicalName,
    aliases,
    placeType,
    routability,
    parentCountries,
    ...options,
    provenance: {
      id: `morrovia-place-catalog:${canonicalPlaceId}`,
      label: "Morrovia curated place catalog",
      kind: aliases.length ? "curated" : "canonical",
      supports: `Canonical identity, aliases, type and stable containment for ${canonicalName}.`,
      reviewedAt: REVIEWED_AT,
    },
  };
}

const country = (id: string, name: string, aliases: readonly string[] = []) =>
  place(id, name, aliases, "country", "planning_area", [name]);

const continents: PlaceCatalogEntry[] = STAMP_REGIONS.map((region) => place(
  `continent-${region.toLocaleLowerCase()}`,
  region,
  [],
  "continent",
  "planning_area",
  STAMP_COUNTRIES_BY_REGION[region].map((entry) => entry.name),
));

const city = (id: string, name: string, parentCountry: string, aliases: readonly string[] = [], options: EntryOptions = {}) =>
  place(id, name, aliases, "city", "direct_destination", [parentCountry], options);

const town = (id: string, name: string, parentCountry: string, aliases: readonly string[] = [], options: EntryOptions = {}) =>
  place(id, name, aliases, "town", "direct_destination", [parentCountry], options);

const countries: PlaceCatalogEntry[] = [
  country("spain", "Spain", ["España", "Espana"]),
  country("japan", "Japan", ["Japón", "Japon"]),
  country("south-korea", "South Korea", ["Korea", "Corea del Sur"]),
  country("china", "China"),
  country("portugal", "Portugal"),
  country("france", "France", ["Francia"]),
  country("italy", "Italy", ["Italia"]),
  country("vietnam", "Vietnam", ["Việt Nam"]),
  country("thailand", "Thailand", ["Tailandia"]),
  country("cambodia", "Cambodia", ["Camboya"]),
  country("peru", "Peru", ["Perú"]),
  country("bolivia", "Bolivia"),
  country("united-kingdom", "United Kingdom", ["UK", "U.K.", "Great Britain", "Britain"]),
  country("chile", "Chile"),
  country("argentina", "Argentina"),
  country("greece", "Greece", ["Hellas"]),
  country("armenia", "Armenia"),
  country("united-states", "United States", ["USA", "U.S.A.", "United States of America"]),
  country("ecuador", "Ecuador"),
  country("denmark", "Denmark"),
  country("norway", "Norway"),
  country("sweden", "Sweden"),
  country("finland", "Finland"),
  country("iceland", "Iceland"),
  country("indonesia", "Indonesia"),
  country("taiwan", "Taiwan"),
  country("laos", "Laos"),
  country("colombia", "Colombia"),
  country("turkey", "Turkey", ["Türkiye", "Turkiye"]),
  country("morocco", "Morocco"),
  country("south-africa", "South Africa"),
  country("kenya", "Kenya"),
  country("nepal", "Nepal"),
  country("india", "India"),
  country("jordan", "Jordan"),
  country("croatia", "Croatia"),
  country("montenegro", "Montenegro"),
  country("albania", "Albania"),
  country("serbia", "Serbia"),
  country("north-macedonia", "North Macedonia", ["Macedonia"]),
  country("bosnia-and-herzegovina", "Bosnia and Herzegovina", ["Bosnia"]),
  country("austria", "Austria"),
  country("switzerland", "Switzerland"),
  country("germany", "Germany"),
  country("slovenia", "Slovenia"),
  country("hungary", "Hungary"),
  country("czechia", "Czechia", ["Czech Republic"]),
  country("netherlands", "Netherlands", ["The Netherlands"]),
  country("uzbekistan", "Uzbekistan"),
  country("kazakhstan", "Kazakhstan"),
  country("zimbabwe", "Zimbabwe"),
  country("canada", "Canada"),
  country("mexico", "Mexico", ["México"]),
  country("guatemala", "Guatemala"),
  country("belize", "Belize"),
  country("antigua-and-barbuda", "Antigua and Barbuda"),
  country("australia", "Australia"),
  country("singapore", "Singapore"),
];

const legacyPlaces: PlaceCatalogEntry[] = [
  city("london", "London", "United Kingdom", ["Londres", "LHR", "LGW"]),
  city("tokyo", "Tokyo", "Japan", ["Tokio", "HND", "NRT"]),
  city("nikko", "Nikko", "Japan", ["Nikkō", "Nikko, Tochigi"], { parentRegionId: "tochigi", coordinates: [139.6982, 36.7581] }),
  city("seoul", "Seoul", "South Korea", ["Seúl", "SEL", "ICN"]),
  city("busan", "Busan", "South Korea", ["Pusan"]),
  city("kyoto", "Kyoto", "Japan", ["Kioto"]),
  city("osaka", "Osaka", "Japan", ["KIX"]),
  city("kanazawa", "Kanazawa", "Japan"),
  city("takayama", "Takayama", "Japan"),
  city("hiroshima", "Hiroshima", "Japan"),
  city("hong-kong", "Hong Kong", "China", ["HKG"]),
  city("chengdu", "Chengdu", "China", ["CTU"]),
  city("zhangjiajie", "Zhangjiajie", "China", ["DYG"]),
  city("beijing", "Beijing", "China", ["PEK", "PKX"]),
  city("shanghai", "Shanghai", "China", ["PVG", "SHA"]),
  city("xian", "Xi'an", "China", ["Xian"]),
  city("hanoi", "Hanoi", "Vietnam", ["HAN"]),
  town("hoi-an", "Hoi An", "Vietnam", ["Hội An"]),
  city("ho-chi-minh-city", "Ho Chi Minh City", "Vietnam", ["Ho Chi Minh", "Saigon", "SGN"]),
  city("siem-reap", "Siem Reap", "Cambodia", [], { coordinates: [103.8552, 13.3633] }),
  city("phnom-penh", "Phnom Penh", "Cambodia", [], { coordinates: [104.9282, 11.5564] }),
  city("bangkok", "Bangkok", "Thailand", ["BKK"]),
  city("chiang-mai", "Chiang Mai", "Thailand"),
  town("krabi", "Krabi", "Thailand"),
  city("luang-prabang", "Luang Prabang", "Laos"),
  town("vang-vieng", "Vang Vieng", "Laos"),
  city("taipei", "Taipei", "Taiwan", ["TPE"]),
  city("tainan", "Tainan", "Taiwan"),
  city("lima", "Lima", "Peru", ["LIM"]),
  city("cusco", "Cusco", "Peru", ["Cuzco", "CUZ"]),
  city("la-paz", "La Paz", "Bolivia", ["LPB"]),
  city("quito", "Quito", "Ecuador", ["UIO"]),
  city("medellin", "Medellín", "Colombia", ["Medellin"]),
  city("bogota", "Bogotá", "Colombia", ["Bogota"]),
  city("santiago", "Santiago", "Chile", ["SCL"]),
  city("buenos-aires", "Buenos Aires", "Argentina", ["EZE"]),
  city("lisbon", "Lisbon", "Portugal", ["Lisboa", "LIS"]),
  city("porto", "Porto", "Portugal", ["Oporto", "OPO"]),
  city("faro", "Faro", "Portugal", ["FAO"], { coordinates: [-7.9304, 37.0194] }),
  city("barcelona", "Barcelona", "Spain", ["BCN"]),
  city("madrid", "Madrid", "Spain", ["MAD"]),
  city("rome", "Rome", "Italy", ["Roma", "FCO"]),
  city("venice", "Venice", "Italy", ["Venezia", "Venecia", "VCE"]),
  city("milan", "Milan", "Italy", ["Milano", "MXP"]),
  city("paris", "Paris", "France", ["CDG", "ORY"]),
  city("istanbul", "Istanbul", "Turkey", ["Estambul", "IST"]),
  city("marrakech", "Marrakech", "Morocco", ["Marrakesh", "Pachalik de Marrakech", "RAK"], { coordinates: [-7.5898, 31.6295] }),
  city("reykjavik", "Reykjavík", "Iceland", ["Reykjavik", "KEF"]),
  city("cape-town", "Cape Town", "South Africa", ["CPT"]),
  city("nairobi", "Nairobi", "Kenya", ["NBO"]),
  town("moshi", "Moshi", "Tanzania", ["JRO"]),
  city("kathmandu", "Kathmandu", "Nepal"),
  city("agra", "Agra", "India"),
  city("varanasi", "Varanasi", "India", ["Benares", "Banaras"], { coordinates: [82.9739, 25.3176] }),
  place("angkor-wat", "Angkor Wat", ["Angkor", "Ankor Wat", "Ankor"], "landmark", "anchor_or_poi", ["Cambodia"], { parentRegionId: "siem-reap", coordinates: [103.867, 13.4125] }),
  place("machu-picchu", "Machu Picchu", [], "landmark", "anchor_or_poi", ["Peru"], { parentRegionId: "sacred-valley", coordinates: [-72.545, -13.1631] }),
  place("tokyo-marathon", "Tokyo Marathon", [], "landmark", "anchor_or_poi", ["Japan"], { parentRegionId: "tokyo" }),
  place("great-wall-of-china", "Great Wall of China", ["Great Wall"], "landmark", "anchor_or_poi", ["China"], { parentRegionId: "beijing" }),
  place("inca-trail", "Inca Trail", [], "travel_corridor", "anchor_or_poi", ["Peru"], { parentRegionId: "sacred-valley" }),
  place("sagrada-familia", "Sagrada Família", ["Sagrada Familia"], "landmark", "anchor_or_poi", ["Spain"], { parentRegionId: "barcelona" }),
  place("mount-kilimanjaro", "Mount Kilimanjaro", ["Kilimanjaro"], "landmark", "anchor_or_poi", ["Tanzania"], { parentRegionId: "moshi" }),
  place("everest-base-camp", "Everest Base Camp", [], "landmark", "anchor_or_poi", ["Nepal"], { parentRegionId: "kathmandu" }),
  place("taj-mahal", "Taj Mahal", [], "landmark", "anchor_or_poi", ["India"], { parentRegionId: "agra", coordinates: [78.0421, 27.1751] }),
  place("colosseum", "Colosseum", ["the Colosseum", "Coliseum"], "landmark", "anchor_or_poi", ["Italy"], { parentRegionId: "rome", coordinates: [12.4922, 41.8902] }),
  place("chichen-itza", "Chichén Itzá", ["Chichen Itza", "Chichén Itza"], "landmark", "anchor_or_poi", ["Mexico"], { parentRegionId: "yucatan", coordinates: [-88.5678, 20.6843] }),
  place("petra", "Petra", [], "landmark", "anchor_or_poi", ["Jordan"], { parentRegionId: "wadi-musa", coordinates: [35.4444, 30.3285] }),
  place("grand-canyon", "Grand Canyon", ["Grand Canyon National Park"], "landmark", "anchor_or_poi", ["United States"], { parentRegionId: "grand-canyon-village", coordinates: [-112.1129, 36.1069] }),
];

const planningAreas: PlaceCatalogEntry[] = [
  place("patagonia", "Patagonia", [], "region", "needs_base_selection", ["Argentina", "Chile"]),
  place("argentine-patagonia", "Argentine Patagonia", ["Argentinian Patagonia"], "sub_region", "needs_base_selection", ["Argentina"], { parentRegionId: "patagonia" }),
  place("chilean-patagonia", "Chilean Patagonia", [], "sub_region", "needs_base_selection", ["Chile"], { parentRegionId: "patagonia" }),
  place("northern-patagonia", "Northern Patagonia", [], "sub_region", "needs_base_selection", ["Argentina", "Chile"], { parentRegionId: "patagonia" }),
  place("tierra-del-fuego", "Tierra del Fuego", [], "sub_region", "needs_base_selection", ["Argentina", "Chile"], { parentRegionId: "patagonia" }),
  place("rapa-nui", "Rapa Nui", ["Easter Island", "Isla de Pascua"], "island", "needs_base_selection", ["Chile"]),
  place("dolomites", "Dolomites", ["Dolomite Mountains"], "mountain_range", "needs_base_selection", ["Italy"], { parentRegionId: "alps" }),
  place("alps", "Alps", ["European Alps"], "mountain_range", "needs_base_selection", ["Austria", "France", "Germany", "Italy", "Liechtenstein", "Slovenia", "Switzerland"]),
  place("french-alps", "French Alps", ["Alpes françaises", "Alpes francaises"], "mountain_range", "needs_base_selection", ["France"], { parentRegionId: "alps" }),
  place("swiss-alps", "Swiss Alps", ["Swiss Alps Region"], "mountain_range", "needs_base_selection", ["Switzerland"], { parentRegionId: "alps" }),
  place("japanese-alps", "Japanese Alps", ["Japan Alps", "Alpes japoneses"], "mountain_range", "needs_base_selection", ["Japan"]),
  place("balkans", "Balkans", ["Balkan Peninsula"], "macro_region", "needs_base_selection", ["Albania", "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Greece", "Kosovo", "Montenegro", "North Macedonia", "Serbia", "Slovenia"]),
  place("scottish-highlands", "Scottish Highlands", ["Highlands of Scotland", "Highlands"], "region", "needs_base_selection", ["United Kingdom"], { ambiguityGroup: "highlands" }),
  place("icelandic-highlands", "Icelandic Highlands", ["Highlands of Iceland", "Highlands"], "region", "needs_base_selection", ["Iceland"], { ambiguityGroup: "highlands" }),
  place("amalfi-coast", "Amalfi Coast", ["Costiera Amalfitana"], "coast", "needs_base_selection", ["Italy"]),
  place("sacred-valley", "Sacred Valley", ["Sacred Valley of the Incas", "Valle Sagrado", "Valle Sagrado de los Incas"], "valley", "needs_base_selection", ["Peru"]),
  place("greek-islands", "Greek Islands", ["Islands of Greece"], "archipelago", "needs_base_selection", ["Greece"]),
  place("lake-district", "Lake District", ["The Lakes"], "natural_area", "needs_base_selection", ["United Kingdom"]),
  place("galapagos-islands", "Galápagos Islands", ["Galapagos Islands", "Galápagos"], "archipelago", "needs_base_selection", ["Ecuador"]),
  place("canary-islands", "Canary Islands", ["Canaries", "Islas Canarias"], "archipelago", "needs_base_selection", ["Spain"]),
  place("azores", "Azores", ["Açores", "Acores"], "archipelago", "needs_base_selection", ["Portugal"]),
  place("faroe-islands", "Faroe Islands", ["Faroes", "Føroyar"], "archipelago", "needs_base_selection", ["Denmark"]),
  place("tuscany", "Tuscany", ["Toscana"], "region", "needs_base_selection", ["Italy"]),
  place("lake-annecy", "Lake Annecy", ["Lac d'Annecy", "Lac de Annecy"], "natural_area", "anchor_or_poi", ["France"], { parentRegionId: "french-alps" }),
  place("lake-atitlan", "Lake Atitlán", ["Lake Atitlan", "Lago de Atitlán", "Lago de Atitlan"], "natural_area", "needs_base_selection", ["Guatemala"], { parentRegionId: "solola", coordinates: [-91.186, 14.69] }),
  place("southeast-asia", "Southeast Asia", ["South East Asia", "Asia Sudoriental", "Sudeste Asiático", "Sudeste Asiatico"], "macro_region", "planning_area", ["Brunei", "Cambodia", "Indonesia", "Laos", "Malaysia", "Myanmar", "Philippines", "Singapore", "Thailand", "Timor-Leste", "Vietnam"]),
];

const benchmarkPlaces: PlaceCatalogEntry[] = [
  city("new-york-city", "New York City", "United States", ["New York", "NYC"]),
  city("boston", "Boston", "United States"),
  city("zurich", "Zürich", "Switzerland", ["Zurich"]),
  city("florence", "Florence", "Italy", ["Firenze"]),
  city("pisa", "Pisa", "Italy", [], { coordinates: [10.4017, 43.7228] }),
  city("bologna", "Bologna", "Italy"),
  city("naples", "Naples", "Italy", ["Napoli"]),
  city("seville", "Seville", "Spain", ["Sevilla"]),
  city("granada-spain", "Granada", "Spain", [], { ambiguityGroup: "granada" }),
  place("granada-province", "Granada Province", ["Granada"], "region", "planning_area", ["Spain"], { ambiguityGroup: "granada" }),
  city("sarajevo", "Sarajevo", "Bosnia and Herzegovina"),
  town("kotor", "Kotor", "Montenegro"),
  city("belgrade", "Belgrade", "Serbia", ["Beograd"]),
  city("skopje", "Skopje", "North Macedonia"),
  city("edinburgh", "Edinburgh", "United Kingdom"),
  city("inverness", "Inverness", "United Kingdom"),
  city("prague", "Prague", "Czechia", ["Praha"]),
  city("vienna", "Vienna", "Austria", ["Wien"]),
  city("budapest", "Budapest", "Hungary"),
  city("ljubljana", "Ljubljana", "Slovenia"),
  city("zagreb", "Zagreb", "Croatia"),
  city("hue", "Hue", "Vietnam", ["Huế"]),
  city("amsterdam", "Amsterdam", "Netherlands"),
  city("berlin", "Berlin", "Germany"),
  city("punta-arenas", "Punta Arenas", "Chile"),
  town("el-chalten", "El Chaltén", "Argentina", ["El Chalten"], { parentRegionId: "patagonia" }),
  town("el-calafate", "El Calafate", "Argentina", [], { parentRegionId: "patagonia" }),
  town("puerto-natales", "Puerto Natales", "Chile", [], { parentRegionId: "patagonia" }),
  city("athens", "Athens", "Greece", ["Athína", "Athina"]),
  place("naxos", "Naxos", [], "island", "direct_destination", ["Greece"], { parentRegionId: "greek-islands" }),
  place("paros", "Paros", [], "island", "direct_destination", ["Greece"], { parentRegionId: "greek-islands" }),
  place("santorini", "Santorini", ["Thira"], "island", "direct_destination", ["Greece"], { parentRegionId: "greek-islands" }),
  city("copenhagen", "Copenhagen", "Denmark", ["København", "Kobenhavn"]),
  city("stockholm", "Stockholm", "Sweden"),
  city("oslo", "Oslo", "Norway"),
  city("bergen", "Bergen", "Norway"),
  city("tashkent", "Tashkent", "Uzbekistan"),
  city("samarkand", "Samarkand", "Uzbekistan", ["Samarqand"]),
  city("bukhara", "Bukhara", "Uzbekistan", ["Buxoro"]),
  city("khiva", "Khiva", "Uzbekistan"),
  city("almaty", "Almaty", "Kazakhstan"),
  city("johannesburg", "Johannesburg", "South Africa"),
  town("victoria-falls", "Victoria Falls", "Zimbabwe"),
  city("casablanca", "Casablanca", "Morocco"),
  city("rabat", "Rabat", "Morocco"),
  city("fes", "Fes", "Morocco", ["Fez"], { coordinates: [-5.0078, 34.0181] }),
  town("chefchaouen", "Chefchaouen", "Morocco", ["Chaouen"], { coordinates: [-5.2636, 35.1714] }),
  city("arequipa", "Arequipa", "Peru"),
  town("ollantaytambo", "Ollantaytambo", "Peru", [], { parentRegionId: "sacred-valley" }),
  town("aguas-calientes", "Aguas Calientes", "Peru", ["Machu Picchu Pueblo"], { parentRegionId: "sacred-valley" }),
  town("lillehammer", "Lillehammer", "Norway"),
  town("geiranger", "Geiranger", "Norway"),
  city("alesund", "Ålesund", "Norway", ["Alesund"]),
  city("delhi", "Delhi", "India", ["New Delhi"]),
  city("jaipur", "Jaipur", "India"),
  city("udaipur", "Udaipur", "India"),
  city("mumbai", "Mumbai", "India", ["Bombay"]),
  place("bali", "Bali", [], "island", "direct_destination", ["Indonesia"]),
  place("nusa-lembongan", "Nusa Lembongan", [], "island", "direct_destination", ["Indonesia"], { parentRegionId: "bali" }),
  place("gili-air", "Gili Air", [], "island", "direct_destination", ["Indonesia"]),
  place("lombok", "Lombok", [], "island", "direct_destination", ["Indonesia"]),
  town("labuan-bajo", "Labuan Bajo", "Indonesia"),
  town("ende", "Ende", "Indonesia"),
  town("maumere", "Maumere", "Indonesia"),
  city("sydney", "Sydney", "Australia"),
  city("melbourne", "Melbourne", "Australia"),
  city("hobart", "Hobart", "Australia"),
  city("adelaide", "Adelaide", "Australia"),
  city("toronto", "Toronto", "Canada"),
  city("ottawa", "Ottawa", "Canada"),
  city("montreal", "Montreal", "Canada", ["Montréal"]),
  city("quebec-city", "Quebec City", "Canada", ["Québec City", "Québec"]),
  city("mexico-city", "Mexico City", "Mexico", ["Ciudad de México", "CDMX"]),
  city("oaxaca-city", "Oaxaca", "Mexico", ["Oaxaca de Juárez", "Oaxaca de Juarez"], { coordinates: [-96.7266, 17.0732] }),
  city("merida-mexico", "Mérida", "Mexico", ["Merida", "Mérida, Mexico"], { parentRegionId: "yucatan", coordinates: [-89.5926, 20.9674] }),
  city("tulum", "Tulum", "Mexico", [], { parentRegionId: "quintana-roo", coordinates: [-87.4654, 20.2114] }),
  city("antigua-guatemala", "Antigua Guatemala", "Guatemala", ["Antigua", "Antigua, Guatemala"], { parentRegionId: "sacatepequez", coordinates: [-90.7339, 14.5586], ambiguityGroup: "antigua" }),
  place("antigua-island", "Antigua", [], "island", "needs_base_selection", ["Antigua and Barbuda"], { ambiguityGroup: "antigua", coordinates: [-61.8175, 17.0747] }),
  place("tikal", "Tikal", [], "landmark", "anchor_or_poi", ["Guatemala"], { parentRegionId: "peten", coordinates: [-89.6237, 17.222] }),
  town("san-ignacio-belize", "San Ignacio", "Belize", ["San Ignacio, Belize"], { coordinates: [-89.079, 17.1561] }),
  town("caye-caulker", "Caye Caulker", "Belize", [], { coordinates: [-88.0246, 17.7425] }),
  town("san-pedro-belize", "San Pedro Town", "Belize", ["San Pedro", "San Pedro, Belize"], { coordinates: [-87.9611, 17.9214], ambiguityGroup: "san-pedro" }),
  city("belize-city", "Belize City", "Belize", [], { coordinates: [-88.1962, 17.5046] }),
  city("cancun", "Cancún", "Mexico", ["Cancun"], { parentRegionId: "quintana-roo", coordinates: [-86.8515, 21.1619] }),
  city("los-angeles", "Los Angeles", "United States", ["L.A.", "LA"], { coordinates: [-118.2437, 34.0522] }),
  town("wadi-musa", "Wadi Musa", "Jordan", ["Wadi Mousa"], { coordinates: [35.4801, 30.3222] }),
  town("grand-canyon-village", "Grand Canyon Village", "United States", [], { coordinates: [-112.1401, 36.0544] }),
  city("dubrovnik", "Dubrovnik", "Croatia"),
  town("shkoder", "Shkodër", "Albania", ["Shkoder"]),
  city("tirana", "Tirana", "Albania"),
  place("torres-del-paine", "Torres del Paine", [], "natural_area", "direct_destination", ["Chile"], { parentRegionId: "patagonia" }),
  place("georgia-country", "Georgia", ["Republic of Georgia"], "country", "planning_area", ["Georgia"], { ambiguityGroup: "georgia" }),
  place("georgia-us-state", "Georgia, United States", ["Georgia", "Georgia State", "State of Georgia"], "region", "planning_area", ["United States"], { ambiguityGroup: "georgia" }),
  place("florida", "Florida", [], "region", "planning_area", ["United States"]),
];

const explicitPlaces = [
  ...countries,
  ...legacyPlaces,
  ...planningAreas,
  ...benchmarkPlaces,
];
const registryCountries = STAMP_REGIONS.flatMap((region) => STAMP_COUNTRIES_BY_REGION[region])
  .filter((countryEntry) => !explicitPlaces.some((entry) => entry.placeType === "country"
    && entry.canonicalName.toLocaleLowerCase() === countryEntry.name.toLocaleLowerCase()))
  .map((countryEntry) => country(countryEntry.id, countryEntry.name));

export const PLACE_CATALOG: readonly PlaceCatalogEntry[] = Object.freeze([
  ...continents,
  ...explicitPlaces,
  ...registryCountries,
]);

function normalizedWithMap(value: string) {
  let text = "";
  const sourceIndexes: number[] = [];
  let previousWasSpace = true;
  for (let index = 0; index < value.length;) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    const sourceCharacter = String.fromCodePoint(codePoint);
    const folded = sourceCharacter.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
    for (const character of folded) {
      if (/^[\p{L}\p{N}]$/u.test(character)) {
        text += character;
        sourceIndexes.push(index);
        previousWasSpace = false;
      } else if (!previousWasSpace && text.length) {
        text += " ";
        sourceIndexes.push(index);
        previousWasSpace = true;
      }
    }
    index += sourceCharacter.length;
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    sourceIndexes.pop();
  }
  return { text, sourceIndexes };
}

export function normalizeCatalogPhrase(value: string) {
  return normalizedWithMap(value).text;
}

const catalogById = new Map(PLACE_CATALOG.map((entry) => [entry.canonicalPlaceId, entry]));

export function findCatalogPlaceById(canonicalPlaceId: string) {
  return catalogById.get(canonicalPlaceId);
}

export function findCatalogPlacesByPhrase(phrase: string) {
  const matchesFor = (normalizedPhrase: string) => PLACE_CATALOG.filter((entry) => [entry.canonicalName, ...entry.aliases]
    .some((label) => normalizeCatalogPhrase(label) === normalizedPhrase));
  const exactPhrase = normalizeCatalogPhrase(phrase);
  if (!exactPhrase) return [];
  const exactMatches = matchesFor(exactPhrase);
  if (exactMatches.length) return exactMatches;
  const withoutArticle = normalizeCatalogPhrase(phrase.replace(/^\s*(?:the|el|la|los|las)\s+/iu, ""));
  return withoutArticle === exactPhrase ? [] : matchesFor(withoutArticle);
}

/** Returns a unique exact match; ambiguous catalog phrases intentionally return undefined. */
export function matchCatalogPlace(phrase: string) {
  const matches = findCatalogPlacesByPhrase(phrase);
  return matches.length === 1 ? matches[0] : undefined;
}

export function catalogAliasesForPlace(canonicalPlaceId: string) {
  return findCatalogPlaceById(canonicalPlaceId)?.aliases ?? [];
}

function sourceCharacterEnd(value: string, sourceIndex: number) {
  const codePoint = value.codePointAt(sourceIndex);
  return sourceIndex + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
}

function leadingArticleStart(value: string, start: number) {
  const prefix = value.slice(0, start);
  const article = /\b(?:the|el|la|los|las)\s+$/iu.exec(prefix);
  return article ? start - article[0].length : start;
}

/**
 * Finds deterministic, longest non-overlapping exact catalog phrases while
 * retaining the traveller's exact source wording and all ambiguity options.
 */
export function findCatalogMatches(value: string): PlaceCatalogMatch[] {
  const normalized = normalizedWithMap(value);
  if (!normalized.text) return [];
  const grouped = new Map<string, { start: number; end: number; normalizedPhrase: string; entries: PlaceCatalogEntry[] }>();

  for (const entry of PLACE_CATALOG) {
    for (const label of [entry.canonicalName, ...entry.aliases]) {
      const phrase = normalizeCatalogPhrase(label);
      if (!phrase) continue;
      let offset = 0;
      while (offset <= normalized.text.length - phrase.length) {
        const found = normalized.text.indexOf(phrase, offset);
        if (found < 0) break;
        offset = found + Math.max(1, phrase.length);
        const before = found === 0 ? " " : normalized.text[found - 1];
        const afterIndex = found + phrase.length;
        const after = afterIndex >= normalized.text.length ? " " : normalized.text[afterIndex];
        if (/^[\p{L}\p{N}]$/u.test(before) || /^[\p{L}\p{N}]$/u.test(after)) continue;
        const mappedStart = normalized.sourceIndexes[found];
        const mappedEndIndex = normalized.sourceIndexes[found + phrase.length - 1];
        if (mappedStart === undefined || mappedEndIndex === undefined) continue;
        const mappedEnd = sourceCharacterEnd(value, mappedEndIndex);
        const rawSource = value.slice(mappedStart, mappedEnd);
        const airportLikeAlias = label.length === 3 && label === label.toUpperCase() && /^[A-Z]{3}$/.test(label);
        if (airportLikeAlias && rawSource !== rawSource.toUpperCase()) continue;
        const key = `${mappedStart}:${mappedEnd}:${phrase}`;
        const current = grouped.get(key) ?? { start: mappedStart, end: mappedEnd, normalizedPhrase: phrase, entries: [] };
        if (!current.entries.some((candidate) => candidate.canonicalPlaceId === entry.canonicalPlaceId)) current.entries.push(entry);
        grouped.set(key, current);
      }
    }
  }

  const candidates = [...grouped.values()].sort((left, right) =>
    (right.normalizedPhrase.length - left.normalizedPhrase.length) || (left.start - right.start));
  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    if (selected.some((match) => candidate.start < match.end && candidate.end > match.start)) continue;
    selected.push(candidate);
  }

  return selected.sort((left, right) => left.start - right.start).map((match) => {
    const start = leadingArticleStart(value, match.start);
    return {
      sourceText: value.slice(start, match.end),
      normalizedPhrase: match.normalizedPhrase,
      start,
      end: match.end,
      entries: match.entries.sort((left, right) => left.canonicalPlaceId.localeCompare(right.canonicalPlaceId)),
    };
  });
}
