/**
 * Canonical travel-jurisdiction registry.
 *
 * The code set is the complete ISO 3166-1 alpha-2 assignment list. Display
 * names come from the platform's bundled CLDR data, with a small set of stable
 * Morrovia overrides for familiar travel names. No runtime network request is
 * required. ISO-assigned territories remain independent destinations because
 * they can have distinct entry rules.
 */

export type PassportIssuerStatus = "ordinary-passport" | "distinct-travel-document" | "parent-issued" | "destination-only";

export type Country = {
  code: string;
  name: string;
  flag: string;
  aliases: readonly string[];
  iso3166_1: boolean;
  passportIssuerStatus: PassportIssuerStatus;
  /** Canonical selector value for this jurisdiction, or null when no safe passport equivalence exists. */
  passportSelectionCode: string | null;
};

const ISO_3166_1_ALPHA_2 = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ
EC EE EG EH ER ES ET
FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU
ID IE IL IM IN IO IQ IR IS IT
JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ
LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ
OM
PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA
RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ
VA VC VE VG VI VN VU
WF WS
YE YT
ZA ZM ZW
`.trim().split(/\s+/);

const DISPLAY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  BN: "Brunei",
  BO: "Bolivia",
  CD: "Democratic Republic of the Congo",
  CG: "Republic of the Congo",
  CI: "Côte d’Ivoire",
  CZ: "Czechia",
  FK: "Falkland Islands",
  FM: "Micronesia",
  GB: "United Kingdom",
  HK: "Hong Kong",
  IR: "Iran",
  KP: "North Korea",
  KR: "South Korea",
  LA: "Laos",
  MD: "Moldova",
  MO: "Macao",
  PS: "Palestine",
  RU: "Russia",
  SH: "Saint Helena, Ascension and Tristan da Cunha",
  SY: "Syria",
  TZ: "Tanzania",
  TR: "Türkiye",
  TW: "Taiwan",
  US: "United States",
  VA: "Vatican City",
  VE: "Venezuela",
  VN: "Vietnam",
  XK: "Kosovo",
};

const ALIASES_BY_CODE: Readonly<Record<string, readonly string[]>> = {
  AG: ["Antigua & Barbuda"],
  BA: ["Bosnia & Herzegovina"],
  BN: ["Brunei Darussalam"],
  BO: ["Bolivia, Plurinational State of"],
  CD: ["Congo - Kinshasa", "Congo, Democratic Republic of the", "DR Congo", "DRC"],
  CG: ["Congo - Brazzaville", "Congo, Republic of the"],
  CI: ["Ivory Coast", "Cote d'Ivoire", "Cote dIvoire"],
  CV: ["Cape Verde"],
  CZ: ["Czech Republic"],
  GB: ["UK", "U.K.", "Britain", "Great Britain"],
  HK: ["Hong Kong SAR China", "Hong Kong SAR"],
  IR: ["Iran, Islamic Republic of"],
  KN: ["St Kitts and Nevis", "St. Kitts & Nevis"],
  KP: ["DPRK", "Korea, Democratic People's Republic of"],
  KR: ["Republic of Korea", "Korea", "Korea, Republic of"],
  LA: ["Lao People's Democratic Republic"],
  LC: ["St Lucia", "St. Lucia"],
  MD: ["Moldova, Republic of"],
  MM: ["Burma", "Myanmar (Burma)"],
  MO: ["Macau", "Macao SAR China"],
  PS: ["Palestinian Territories", "State of Palestine"],
  RU: ["Russian Federation"],
  ST: ["Sao Tome and Principe", "São Tomé & Príncipe"],
  SZ: ["Swaziland"],
  TR: ["Turkey", "Turkiye"],
  TT: ["Trinidad & Tobago"],
  TZ: ["United Republic of Tanzania"],
  US: ["USA", "U.S.A.", "US", "United States of America"],
  VA: ["Holy See"],
  VC: ["St Vincent and the Grenadines", "St. Vincent & Grenadines"],
  VE: ["Venezuela, Bolivarian Republic of"],
  VN: ["Viet Nam"],
};

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

/**
 * Positive issuer evidence is owned here, beside canonical country identity,
 * rather than inferred from ISO membership or from the current visa matrix.
 *
 * The base list is the bundled Passport Index issuer snapshot. HK and MO are
 * retained as distinct SAR documents. British Overseas Territory additions
 * are supported by HM Passport Office's BOTC variant-passport guidance:
 * https://www.gov.uk/government/publications/british-overseas-territories-citizens/
 * british-overseas-territories-citizens-accessible-version
 */
const ORDINARY_PASSPORT_ISSUER_CODES = new Set(`
AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI
KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE
SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM
JP JO KZ KE KI XK KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM
MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL
PT QA RO RU RW WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK KN LC VC SD SR
SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW
`.trim().split(/\s+/));

const DISTINCT_TRAVEL_DOCUMENT_CODES = new Set([
  // Chinese SAR passports have their own eligibility and travel treatment.
  "HK", "MO",
  // Territory-named British Overseas Territories Citizen passport variants.
  "AI", "BM", "FK", "GI", "KY", "MS", "PN", "SH", "TC", "VG",
]);

/**
 * Safe legacy restoration for places whose residents use a parent-state
 * passport. This mapping is intentionally narrower than political dependency:
 * ambiguous or uninhabited jurisdictions remain destination-only.
 */
const PARENT_PASSPORT_ISSUER_BY_CODE: Readonly<Record<string, string>> = {
  AS: "US",
  AW: "NL",
  AX: "FI",
  BL: "FR",
  BQ: "NL",
  CC: "AU",
  CK: "NZ",
  CW: "NL",
  CX: "AU",
  FO: "DK",
  GF: "FR",
  GG: "GB",
  GL: "DK",
  GP: "FR",
  GU: "US",
  IM: "GB",
  JE: "GB",
  MF: "FR",
  MP: "US",
  MQ: "FR",
  NC: "FR",
  NF: "AU",
  NU: "NZ",
  PF: "FR",
  PM: "FR",
  PR: "US",
  RE: "FR",
  SX: "NL",
  TK: "NZ",
  VI: "US",
  WF: "FR",
  YT: "FR",
};

const passportIdentityFor = (code: string): Pick<Country, "passportIssuerStatus" | "passportSelectionCode"> => {
  if (DISTINCT_TRAVEL_DOCUMENT_CODES.has(code)) return {
    passportIssuerStatus: "distinct-travel-document",
    passportSelectionCode: code,
  };
  if (ORDINARY_PASSPORT_ISSUER_CODES.has(code)) return {
    passportIssuerStatus: "ordinary-passport",
    passportSelectionCode: code,
  };
  const parentCode = PARENT_PASSPORT_ISSUER_BY_CODE[code];
  if (parentCode) return {
    passportIssuerStatus: "parent-issued",
    passportSelectionCode: parentCode,
  };
  return {
    passportIssuerStatus: "destination-only",
    passportSelectionCode: null,
  };
};

export function countryFlagFromCode(code: string | undefined): string {
  return code && /^[A-Z]{2}$/.test(code)
    ? [...code].map((character) => String.fromCodePoint(127397 + character.charCodeAt(0))).join("")
    : "🌐";
}

/** XK is retained as an explicit travel-system extension for existing Kosovo passport data. */
const TRAVEL_JURISDICTION_CODES = [...ISO_3166_1_ALPHA_2, "XK"];

export const countries: readonly Country[] = TRAVEL_JURISDICTION_CODES.map((code) => ({
  code,
  name: DISPLAY_NAME_OVERRIDES[code] ?? displayNames.of(code) ?? code,
  flag: countryFlagFromCode(code),
  aliases: ALIASES_BY_CODE[code] ?? [],
  iso3166_1: ISO_3166_1_ALPHA_2.includes(code),
  ...passportIdentityFor(code),
})).sort((first, second) => first.name.localeCompare(second.name, "en"));

const normalizeLookup = (value: string) => value
  .trim()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[’']/g, "")
  .toLocaleLowerCase("en")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const countryByCode = new Map(countries.map((country) => [country.code, country]));
const countryByLookup = new Map<string, Country>();

for (const country of countries) {
  for (const value of [country.code, country.name, ...country.aliases]) {
    const key = normalizeLookup(value);
    const existing = countryByLookup.get(key);
    if (existing && existing.code !== country.code) {
      throw new Error(`Country alias collision between ${existing.code} and ${country.code}.`);
    }
    countryByLookup.set(key, country);
  }
}

export function countryFor(value: unknown): Country | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return countryByCode.get(value.trim().toUpperCase()) ?? countryByLookup.get(normalizeLookup(value)) ?? null;
}

export function countryCodeFor(value: unknown): string | null {
  return countryFor(value)?.code ?? null;
}

export function countryNameFor(value: unknown): string | null {
  return countryFor(value)?.name ?? null;
}

export function searchCountries(query: string): Country[] {
  const normalizedQuery = normalizeLookup(query);
  if (!normalizedQuery) return [...countries];
  const exact = countries.filter((country) => [country.code, country.name, ...country.aliases]
    .some((value) => normalizeLookup(value) === normalizedQuery));
  if (exact.length) return exact;
  return countries.filter((country) => [country.code, country.name, ...country.aliases]
    .some((value) => normalizeLookup(value).includes(normalizedQuery)));
}
