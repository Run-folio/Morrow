import passportIndex from "./data/passport-index-visa-matrix.json" with { type: "json" };
import { countryFor, countryFlagFromCode } from "./country-registry.ts";
import { passportNationalityCountries } from "./passport-countries.ts";
import { entrySourceForCountry } from "./travel-readiness.ts";

export type TouristEntryStatus = "visa-free" | "visa-on-arrival" | "eta" | "e-visa" | "visa-required" | "no-admission" | "not-verified";
export type VisaLanguage = "en" | "es";

export type TouristEntryRequirement = {
  informationState: "known" | "unsupported" | "stale";
  status: TouristEntryStatus;
  statusLabel: string;
  visaAnswer: string;
  permittedStay: string;
  detail: string;
  conditions: string[];
  sourceLabel: string;
  sourceHref: string;
  dataUpdatedAt: string;
};

type DatasetRule = { status: string; days?: number };
type Dataset = {
  source: string;
  sourceUpdatedAt: string;
  passportCountries?: { code: string; name: string }[];
  countryCodes?: Record<string, string>;
  rules: Record<string, Record<string, DatasetRule>>;
};
const dataset = passportIndex as Dataset;

/** Backwards-compatible display-name export. Availability no longer depends on the visa snapshot. */
export const supportedPassportCountries = passportNationalityCountries.map(({ name }) => name);

/** Country flag for passport and destination controls, derived from ISO alpha-2 identity. */
export const countryFlagFor = (country: string) => countryFlagFromCode(countryFor(country)?.code);

const passportDatasetNameByCode = new Map((dataset.passportCountries ?? []).map(({ code, name }) => {
  const normalizedCode = code.toUpperCase();
  if (!countryFor(normalizedCode)) throw new Error(`Passport dataset country ${normalizedCode} is not mapped to the canonical registry.`);
  return [normalizedCode, name];
}));
const destinationDatasetNameByCode = new Map<string, string>();
for (const rules of Object.values(dataset.rules)) {
  for (const destinationName of Object.keys(rules)) {
    const code = countryFor(destinationName)?.code ?? dataset.countryCodes?.[destinationName]?.toUpperCase();
    if (!code || !countryFor(code)) throw new Error(`Passport dataset destination "${destinationName}" is not mapped to the canonical registry.`);
    const existing = destinationDatasetNameByCode.get(code);
    if (existing && existing !== destinationName) throw new Error(`Passport dataset destination collision for ${code}: "${existing}" and "${destinationName}".`);
    destinationDatasetNameByCode.set(code, destinationName);
  }
}

const missingRequirement = (destination: string, language: VisaLanguage): TouristEntryRequirement => {
  const destinationCountry = countryFor(destination);
  const destinationName = destinationCountry?.name ?? destination;
  const officialSource = entrySourceForCountry(destination);
  return {
    informationState: "unsupported",
    status: "not-verified",
    statusLabel: language === "es" ? "Información de entrada no disponible" : "Entry information unavailable",
    visaAnswer: language === "es" ? "Información de entrada no disponible" : "Entry information unavailable",
    permittedStay: "",
    detail: language === "es"
      ? `Actualmente no tenemos requisitos de entrada fiables para este pasaporte y ${destinationName}. Consulta la guía oficial del gobierno, inmigración o la embajada del destino antes de viajar.`
      : `We don't currently have reliable entry requirements for this passport and ${destinationName}. Check the destination's official government, immigration or embassy guidance before travelling.`,
    conditions: [],
    sourceLabel: officialSource?.label ?? (language === "es" ? "Guía oficial del destino" : "Official destination guidance"),
    sourceHref: officialSource?.href ?? "",
    dataUpdatedAt: "",
  };
};

/**
 * The bundled Passport Index snapshot has no verified update contract or
 * pair-level government evidence. Keep it source-first until that contract exists.
 */
export const touristEntryRequirementFor = (passport: string, destination: string, language: VisaLanguage = "en"): TouristEntryRequirement => {
  const passportCountry = countryFor(passport);
  const destinationCountry = countryFor(destination);
  const passportName = passportCountry?.name ?? passport.trim();
  const destinationName = destinationCountry?.name ?? destination.trim();
  const passportDatasetName = passportCountry ? passportDatasetNameByCode.get(passportCountry.code) : passportName;
  const destinationDatasetName = destinationCountry ? destinationDatasetNameByCode.get(destinationCountry.code) : destinationName;
  const rule = passportDatasetName && destinationDatasetName ? dataset.rules[passportDatasetName]?.[destinationDatasetName] : undefined;
  const officialSource = entrySourceForCountry(destination);

  if (!rule) return missingRequirement(destinationName, language);

  return {
    informationState: "stale",
    status: "not-verified",
    statusLabel: language === "es" ? "Requiere confirmación" : "Needs confirmation",
    visaAnswer: language === "es"
      ? "Consulta el requisito actual con la autoridad oficial del destino."
      : "Check the current entry requirement with the destination's official authority.",
    permittedStay: "",
    detail: language === "es"
      ? `La instantánea de Passport Index del ${dataset.sourceUpdatedAt} no está verificada frente a los requisitos gubernamentales actuales para este pasaporte. Confirma la información oficial antes de reservar o viajar.`
      : `The Passport Index snapshot dated ${dataset.sourceUpdatedAt} is not verified against current government requirements for this passport. Confirm the official information before booking or travel.`,
    conditions: [],
    sourceLabel: officialSource?.label ?? "Official destination authority",
    sourceHref: officialSource?.href ?? dataset.source,
    dataUpdatedAt: dataset.sourceUpdatedAt,
  };
};
