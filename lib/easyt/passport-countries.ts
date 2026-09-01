import { countries, countryFor, type Country } from "./country-registry.ts";

/** Passport existence is independent from the current entry-intelligence set. */
export const passportNationalityCountries: readonly Country[] = countries.filter((country) => (
  country.passportIssuerStatus === "ordinary-passport"
  || country.passportIssuerStatus === "distinct-travel-document"
));
export const passportDestinationCountries: readonly Country[] = countries;

const PASSPORT_LABEL_BY_CODE: Readonly<Record<string, string>> = {
  AI: "Anguilla (BOTC passport)",
  BM: "Bermuda (BOTC passport)",
  FK: "Falkland Islands (BOTC passport)",
  GI: "Gibraltar (BOTC passport)",
  HK: "Hong Kong SAR passport",
  KY: "Cayman Islands (BOTC passport)",
  MO: "Macao SAR passport",
  MS: "Montserrat (BOTC passport)",
  PN: "Pitcairn Islands (BOTC passport)",
  SH: "Saint Helena, Ascension and Tristan da Cunha (BOTC passport)",
  TC: "Turks and Caicos Islands (BOTC passport)",
  VG: "British Virgin Islands (BOTC passport)",
};

export const passportCountryLabel = (country: Country): string => PASSPORT_LABEL_BY_CODE[country.code] ?? country.name;

/** Restores canonical issuer codes, including safe parent mappings for legacy territory selections. */
export const passportCountryCodeFor = (value: unknown): string | null => countryFor(value)?.passportSelectionCode ?? null;
