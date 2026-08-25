/**
 * Canonical country and status data for Stamps.
 *
 * Country IDs intentionally retain the exact slugs emitted by the original
 * Stamps implementation. Most are display-name slugs; a small set retain the
 * abbreviated topology-name slug that could already have been persisted.
 * Other topology names and display-name slugs alias into that stable ID space.
 */

export const STAMP_STATUSES = ["visited", "want"] as const;
export type StampStatus = (typeof STAMP_STATUSES)[number];

export const STAMP_STATUS_FILTERS = ["all", ...STAMP_STATUSES] as const;
export type StampStatusFilter = (typeof STAMP_STATUS_FILTERS)[number];

export const STAMP_REGIONS = ["Africa", "Americas", "Asia", "Europe", "Oceania"] as const;
export type StampRegion = (typeof STAMP_REGIONS)[number];
export type StampRegionFilter = "all" | StampRegion;

export type StampCountry = {
  id: string;
  name: string;
  region: StampRegion;
  iso2: string;
};

export type StampStatusRecord = Readonly<Record<string, StampStatus>>;
export type StampMemory = { note?: string | null; photoData?: string | null };
export type StampMemoryRecord = Readonly<Record<string, string | StampMemory | null | undefined>>;
export type StampPhotoRecord = Readonly<Record<string, string | null | undefined>>;

export type StampSummary = {
  visited: number;
  want: number;
  memories: number;
};

export type StampStatusRow = { countryId: string; status: StampStatus };
export type StampMemoryRow = { countryId: string; note?: string | null; photoData?: string | null };

export type StampCountryFilterInput = {
  countries?: readonly StampCountry[];
  statuses?: unknown;
  search?: string;
  region?: StampRegionFilter | "All";
  status?: StampStatusFilter;
};

export type StampCountryGroup = {
  region: StampRegion;
  countries: StampCountry[];
  visited: number;
};

export type StampRecordSummaryInput = {
  statuses?: unknown;
  /** Current UI note records and API `{ note, photoData }` records are both accepted. */
  memories?: StampMemoryRecord;
  /** Current UI keeps photo data in a separate record. */
  photos?: StampPhotoRecord;
};

type StampCountrySeed = { name: string; iso2: string; legacyId?: string };

const countrySeeds = (value: string): StampCountrySeed[] => value.split("|").map((entry) => {
  const [name, iso2, legacyId] = entry.split(":");
  return { name, iso2, legacyId };
});

const COUNTRY_SEEDS_BY_REGION: Record<StampRegion, StampCountrySeed[]> = {
  Africa: countrySeeds("Algeria:DZ|Angola:AO|Benin:BJ|Botswana:BW|Burkina Faso:BF|Burundi:BI|Cabo Verde:CV|Cameroon:CM|Central African Republic:CF|Chad:TD|Comoros:KM|Democratic Republic of the Congo:CD|Djibouti:DJ|Egypt:EG|Equatorial Guinea:GQ|Eritrea:ER|Eswatini:SZ|Ethiopia:ET|Gabon:GA|Gambia:GM|Ghana:GH|Guinea:GN|Guinea-Bissau:GW|Ivory Coast:CI|Kenya:KE|Lesotho:LS|Liberia:LR|Libya:LY|Madagascar:MG|Malawi:MW|Mali:ML|Mauritania:MR|Mauritius:MU|Morocco:MA|Mozambique:MZ|Namibia:NA|Niger:NE|Nigeria:NG|Republic of the Congo:CG|Rwanda:RW|Sao Tome and Principe:ST:s-o-tom-and-principe|Senegal:SN|Seychelles:SC|Sierra Leone:SL|Somalia:SO|South Africa:ZA|South Sudan:SS|Sudan:SD|Tanzania:TZ|Togo:TG|Tunisia:TN|Uganda:UG|Zambia:ZM|Zimbabwe:ZW"),
  Americas: countrySeeds("Antigua and Barbuda:AG:antigua-and-barb|Argentina:AR|Bahamas:BS|Barbados:BB|Belize:BZ|Bolivia:BO|Brazil:BR|Canada:CA|Chile:CL|Colombia:CO|Costa Rica:CR|Cuba:CU|Dominica:DM|Dominican Republic:DO:dominican-rep|Ecuador:EC|El Salvador:SV|Grenada:GD|Guatemala:GT|Guyana:GY|Haiti:HT|Honduras:HN|Jamaica:JM|Mexico:MX|Nicaragua:NI|Panama:PA|Paraguay:PY|Peru:PE|Saint Kitts and Nevis:KN:st-kitts-and-nevis|Saint Lucia:LC|Saint Vincent and the Grenadines:VC:st-vin-and-gren|Suriname:SR|Trinidad and Tobago:TT|United States:US|Uruguay:UY|Venezuela:VE"),
  Asia: countrySeeds("Afghanistan:AF|Armenia:AM|Azerbaijan:AZ|Bahrain:BH|Bangladesh:BD|Bhutan:BT|Brunei:BN|Cambodia:KH|China:CN|Cyprus:CY|Georgia:GE|India:IN|Indonesia:ID|Iran:IR|Iraq:IQ|Israel:IL|Japan:JP|Jordan:JO|Kazakhstan:KZ|Kuwait:KW|Kyrgyzstan:KG|Laos:LA|Lebanon:LB|Malaysia:MY|Maldives:MV|Mongolia:MN|Myanmar:MM|Nepal:NP|North Korea:KP|Oman:OM|Pakistan:PK|Palestine:PS|Philippines:PH|Qatar:QA|Saudi Arabia:SA|Singapore:SG|South Korea:KR|Sri Lanka:LK|Syria:SY|Taiwan:TW|Tajikistan:TJ|Thailand:TH|Timor-Leste:TL|Turkey:TR|Turkmenistan:TM|United Arab Emirates:AE|Uzbekistan:UZ|Vietnam:VN|Yemen:YE"),
  Europe: countrySeeds("Albania:AL|Andorra:AD|Austria:AT|Belarus:BY|Belgium:BE|Bosnia and Herzegovina:BA|Bulgaria:BG|Croatia:HR|Czechia:CZ|Denmark:DK|Estonia:EE|Finland:FI|France:FR|Germany:DE|Greece:GR|Hungary:HU|Iceland:IS|Ireland:IE|Italy:IT|Kosovo:XK|Latvia:LV|Liechtenstein:LI|Lithuania:LT|Luxembourg:LU|Malta:MT|Moldova:MD|Monaco:MC|Montenegro:ME|Netherlands:NL|North Macedonia:MK|Norway:NO|Poland:PL|Portugal:PT|Romania:RO|Russia:RU|San Marino:SM|Serbia:RS|Slovakia:SK|Slovenia:SI|Spain:ES|Sweden:SE|Switzerland:CH|Ukraine:UA|United Kingdom:GB|Vatican City:VA:vatican"),
  Oceania: countrySeeds("Australia:AU|Fiji:FJ|Kiribati:KI|Marshall Islands:MH:marshall-is|Micronesia:FM|Nauru:NR|New Zealand:NZ|Palau:PW|Papua New Guinea:PG|Samoa:WS|Solomon Islands:SB|Tonga:TO|Tuvalu:TV|Vanuatu:VU"),
};

/** Exact ID generation used by the original Stamps client and persisted records. */
export const legacyStampCountryId = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

export const STAMP_COUNTRIES: readonly StampCountry[] = STAMP_REGIONS.flatMap((region) =>
  COUNTRY_SEEDS_BY_REGION[region].map(({ name, iso2, legacyId }) => ({
    id: legacyId ?? legacyStampCountryId(name),
    name,
    region,
    iso2,
  })),
);

export const STAMP_COUNTRIES_BY_REGION: Readonly<Record<StampRegion, readonly StampCountry[]>> = Object.fromEntries(
  STAMP_REGIONS.map((region) => [region, STAMP_COUNTRIES.filter((country) => country.region === region)]),
) as Record<StampRegion, StampCountry[]>;

/**
 * Names emitted by Natural Earth/world-atlas and older country inputs.
 * Values are canonical Stamps display names, not new persisted IDs.
 */
export const STAMP_TOPOLOGY_ALIASES: Readonly<Record<string, string>> = {
  "United States of America": "United States",
  Korea: "South Korea",
  "Czech Republic": "Czechia",
  "Czech Rep.": "Czechia",
  "Côte d'Ivoire": "Ivory Coast",
  "Côte d’Ivoire": "Ivory Coast",
  "Cote d'Ivoire": "Ivory Coast",
  Swaziland: "Eswatini",
  eSwatini: "Eswatini",
  "São Tomé and Príncipe": "Sao Tome and Principe",
  "São Tomé and Principe": "Sao Tome and Principe",
  Congo: "Republic of the Congo",
  "Dem. Rep. Congo": "Democratic Republic of the Congo",
  "Russian Federation": "Russia",
  "Viet Nam": "Vietnam",
  "The Bahamas": "Bahamas",
  "The Gambia": "Gambia",
  "Kyrgyz Republic": "Kyrgyzstan",
  Macedonia: "North Macedonia",
  "Bosnia and Herz.": "Bosnia and Herzegovina",
  "Central African Rep.": "Central African Republic",
  "Eq. Guinea": "Equatorial Guinea",
  "S. Sudan": "South Sudan",
  "Solomon Is.": "Solomon Islands",
  "United Republic of Tanzania": "Tanzania",
  "Bolivia (Plurinational State of)": "Bolivia",
  "Venezuela (Bolivarian Republic of)": "Venezuela",
  Türkiye: "Turkey",
  "Antigua and Barb.": "Antigua and Barbuda",
  "Dominican Rep.": "Dominican Republic",
  "St. Kitts and Nevis": "Saint Kitts and Nevis",
  "St. Vin. and Gren.": "Saint Vincent and the Grenadines",
  Vatican: "Vatican City",
  "Marshall Is.": "Marshall Islands",
};

const INPUT_ALIASES: Readonly<Record<string, string>> = {
  USA: "United States",
  US: "United States",
  UK: "United Kingdom",
  UAE: "United Arab Emirates",
  "Republic of Korea": "South Korea",
  "Cape Verde": "Cabo Verde",
  Burma: "Myanmar",
  "Myanmar (Burma)": "Myanmar",
  "East Timor": "Timor-Leste",
  "State of Palestine": "Palestine",
  ...STAMP_TOPOLOGY_ALIASES,
};

const normalizeLookupKey = (value: string) => value
  .trim()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[’']/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const COUNTRY_BY_ID = new Map(STAMP_COUNTRIES.map((country) => [country.id, country]));
const COUNTRY_ID_BY_NAME = new Map(STAMP_COUNTRIES.map((country) => [country.name, country.id]));
const COUNTRY_ID_BY_LOOKUP = new Map<string, string>();

for (const country of STAMP_COUNTRIES) {
  COUNTRY_ID_BY_LOOKUP.set(normalizeLookupKey(country.name), country.id);
  COUNTRY_ID_BY_LOOKUP.set(normalizeLookupKey(country.id), country.id);
}

for (const [alias, canonicalName] of Object.entries(INPUT_ALIASES)) {
  const canonicalId = COUNTRY_ID_BY_NAME.get(canonicalName);
  if (!canonicalId) continue;
  COUNTRY_ID_BY_LOOKUP.set(normalizeLookupKey(alias), canonicalId);
  // Preserve IDs emitted when the old client slugged an unrecognised topology name.
  COUNTRY_ID_BY_LOOKUP.set(normalizeLookupKey(legacyStampCountryId(alias)), canonicalId);
}

export function normalizeStampCountryId(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const direct = value.trim();
  if (COUNTRY_BY_ID.has(direct)) return direct;
  return COUNTRY_ID_BY_LOOKUP.get(normalizeLookupKey(direct)) ?? null;
}

export function isStampCountryId(value: unknown): value is string {
  return typeof value === "string" && COUNTRY_BY_ID.has(value);
}

export function stampCountryFor(value: unknown): StampCountry | null {
  const id = normalizeStampCountryId(value);
  return id ? COUNTRY_BY_ID.get(id) ?? null : null;
}

export function isStampStatus(value: unknown): value is StampStatus {
  return value === "visited" || value === "want";
}

export function stampCountryFlag(value: unknown): string {
  const country = stampCountryFor(value);
  if (!country || !/^[A-Z]{2}$/.test(country.iso2)) return "🌐";
  return [...country.iso2].map((character) => String.fromCodePoint(127397 + character.charCodeAt(0))).join("");
}

/** Selecting the current status removes it; selecting the other status replaces it. */
export function nextStampStatus(
  current: StampStatus | null | undefined,
  requested: StampStatus,
): StampStatus | null {
  return current === requested ? null : requested;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function normalizeStampStatuses(value: unknown): Record<string, StampStatus> {
  if (!isRecord(value)) return {};
  const normalized: Record<string, StampStatus> = {};
  const priority: Record<string, number> = {};

  for (const [candidateId, candidateStatus] of Object.entries(value)) {
    const countryId = normalizeStampCountryId(candidateId);
    if (!countryId || !isStampStatus(candidateStatus)) continue;
    const candidatePriority = candidateId === countryId ? 2 : 1;
    if ((priority[countryId] ?? 0) > candidatePriority) continue;
    normalized[countryId] = candidateStatus;
    priority[countryId] = candidatePriority;
  }

  return normalized;
}

const SEARCH_TERMS_BY_COUNTRY_ID = new Map<string, readonly string[]>();
for (const country of STAMP_COUNTRIES) {
  const aliases = Object.entries(INPUT_ALIASES)
    .filter(([, canonicalName]) => canonicalName === country.name)
    .map(([alias]) => normalizeLookupKey(alias));
  SEARCH_TERMS_BY_COUNTRY_ID.set(country.id, [normalizeLookupKey(country.name), normalizeLookupKey(country.id), ...aliases]);
}

export function filterStampCountries(input: StampCountryFilterInput = {}): StampCountry[] {
  const countries = input.countries ?? STAMP_COUNTRIES;
  const statuses = normalizeStampStatuses(input.statuses);
  const query = normalizeLookupKey(input.search ?? "");
  const region = input.region === "All" ? "all" : input.region ?? "all";
  const status = input.status ?? "all";

  return countries.filter((country) => {
    if (region !== "all" && country.region !== region) return false;
    if (status !== "all" && statuses[country.id] !== status) return false;
    if (!query) return true;
    return (SEARCH_TERMS_BY_COUNTRY_ID.get(country.id) ?? [normalizeLookupKey(country.name)])
      .some((term) => term.includes(query));
  }).sort((first, second) => first.name.localeCompare(second.name));
}

export function groupStampCountries(
  countries: readonly StampCountry[],
  statuses: unknown,
): StampCountryGroup[] {
  const normalizedStatuses = normalizeStampStatuses(statuses);
  return STAMP_REGIONS.flatMap((region) => {
    const regionCountries = countries.filter((country) => country.region === region);
    if (!regionCountries.length) return [];
    return [{
      region,
      countries: regionCountries,
      visited: STAMP_COUNTRIES_BY_REGION[region].filter((country) => normalizedStatuses[country.id] === "visited").length,
    }];
  });
}

const hasContent = (value: unknown) => typeof value === "string" && value.trim().length > 0;

const collectMemoryIds = (target: Set<string>, value: unknown, photoOnly = false) => {
  if (!isRecord(value)) return;
  for (const [candidateId, memory] of Object.entries(value)) {
    const countryId = normalizeStampCountryId(candidateId);
    if (!countryId) continue;
    if (hasContent(memory)) {
      target.add(countryId);
      continue;
    }
    if (!photoOnly && isRecord(memory) && (hasContent(memory.note) || hasContent(memory.photoData))) {
      target.add(countryId);
    }
  }
};

export function summarizeStampRecords(input: StampRecordSummaryInput): StampSummary {
  const statuses = normalizeStampStatuses(input.statuses);
  const memoryIds = new Set<string>();
  collectMemoryIds(memoryIds, input.memories);
  collectMemoryIds(memoryIds, input.photos, true);

  return {
    visited: Object.values(statuses).filter((status) => status === "visited").length,
    want: Object.values(statuses).filter((status) => status === "want").length,
    memories: memoryIds.size,
  };
}

export function summarizeStampRows(
  statusRows: readonly StampStatusRow[],
  memoryRows: readonly StampMemoryRow[] = [],
): StampSummary {
  const statuses = Object.fromEntries(statusRows.map((row) => [row.countryId, row.status]));
  const memories = Object.fromEntries(memoryRows.map((row) => [row.countryId, { note: row.note, photoData: row.photoData }]));
  return summarizeStampRecords({ statuses, memories });
}
