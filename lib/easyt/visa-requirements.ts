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
  reviewDueAt?: string;
};

// Manually checked against the linked, passport-specific official guidance on 5 October 2026.
// The result expires after 30 days unless a human reviews the source again.
const pilotReview = { checkedAt: "2026-10-05", reviewDueAt: "2026-11-04" };
const britishCitizenTouristRules: Record<string, {
  stay: string;
  stayEs: string;
  conditions: string[];
  conditionsEs: string[];
  href: string;
}> = {
  KZ: {
    stay: "Up to 30 days per visit; no more than 90 days in any 180-day period",
    stayEs: "Hasta 30 días por visita; no más de 90 días en cualquier período de 180 días",
    conditions: ["Passport valid for at least 30 days from arrival, with one blank page.", "Your hotel or host must register your arrival within 3 working days."],
    conditionsEs: ["Pasaporte válido al menos 30 días desde la llegada, con una página en blanco.", "El hotel o anfitrión debe registrar tu llegada en 3 días laborables."],
    href: "https://www.gov.uk/foreign-travel-advice/kazakhstan/entry-requirements",
  },
  UZ: {
    stay: "Up to 30 days",
    stayEs: "Hasta 30 días",
    conditions: ["Passport expiry must be at least 3 months after arrival.", "Register within 3 days of arrival; register again if staying more than 3 days in another city. Hotels normally register guests."],
    conditionsEs: ["El pasaporte debe caducar al menos 3 meses después de la llegada.", "Regístrate en los 3 días posteriores a la llegada y de nuevo si permaneces más de 3 días en otra ciudad. Los hoteles suelen registrar a sus huéspedes."],
    href: "https://www.gov.uk/foreign-travel-advice/uzbekistan/entry-requirements",
  },
  KG: {
    stay: "Up to 30 calendar days in each 60-day period",
    stayEs: "Hasta 30 días naturales en cada período de 60 días",
    conditions: ["Passport expiry must be at least 6 months after arrival.", "For a longer stay, arrange the appropriate documents before the visa-free period ends; registration rules may apply."],
    conditionsEs: ["El pasaporte debe caducar al menos 6 meses después de la llegada.", "Para una estancia más larga, tramita los documentos adecuados antes de que termine el período sin visado; pueden aplicarse reglas de registro."],
    href: "https://www.gov.uk/foreign-travel-advice/kyrgyzstan/entry-requirements",
  },
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
export const touristEntryRequirementFor = (passport: string, destination: string, language: VisaLanguage = "en", asOf = new Date()): TouristEntryRequirement => {
  const passportCountry = countryFor(passport);
  const destinationCountry = countryFor(destination);
  const reviewedRule = passportCountry?.code === "GB" && destinationCountry ? britishCitizenTouristRules[destinationCountry.code] : undefined;
  if (reviewedRule && asOf.toISOString().slice(0, 10) <= pilotReview.reviewDueAt) {
    const isSpanish = language === "es";
    return {
      informationState: "known",
      status: "visa-free",
      statusLabel: isSpanish ? "Regla oficial revisada" : "Reviewed official rule",
      visaAnswer: isSpanish ? "Sin visado para turismo" : "Visa-free for tourism",
      permittedStay: isSpanish ? reviewedRule.stayEs : reviewedRule.stay,
      detail: isSpanish
        ? "Para turismo con un pasaporte completo de ciudadano británico. Otros tipos de pasaporte y motivos de viaje pueden tener reglas distintas."
        : "For tourism with a full British citizen passport. Other passport types and travel purposes may have different rules.",
      conditions: isSpanish ? reviewedRule.conditionsEs : reviewedRule.conditions,
      sourceLabel: "UK Government – entry requirements",
      sourceHref: reviewedRule.href,
      dataUpdatedAt: pilotReview.checkedAt,
      reviewDueAt: pilotReview.reviewDueAt,
    };
  }
  const passportName = passportCountry?.name ?? passport.trim();
  const destinationName = destinationCountry?.name ?? destination.trim();
  const passportDatasetName = passportCountry ? passportDatasetNameByCode.get(passportCountry.code) : passportName;
  const destinationDatasetName = destinationCountry ? destinationDatasetNameByCode.get(destinationCountry.code) : destinationName;
  const rule = passportDatasetName && destinationDatasetName ? dataset.rules[passportDatasetName]?.[destinationDatasetName] : undefined;
  const officialSource = entrySourceForCountry(destination);

  if (!rule && !reviewedRule) return missingRequirement(destinationName, language);

  return {
    informationState: "stale",
    status: "not-verified",
    statusLabel: language === "es" ? "Requiere confirmación" : "Needs confirmation",
    visaAnswer: language === "es"
      ? "Consulta el requisito actual con la autoridad oficial del destino."
      : "Check the current entry requirement with the destination's official authority.",
    permittedStay: "",
    detail: reviewedRule
      ? language === "es" ? "Esta regla requiere una nueva revisión. Confirma las condiciones actuales en la fuente oficial antes de reservar o viajar." : "This rule is due for review. Confirm the current conditions with the official source before booking or travel."
      : language === "es" ? "No hemos verificado el requisito actual para este pasaporte. Confírmalo con la autoridad oficial del destino antes de reservar o viajar." : "We have not verified the current requirement for this passport. Confirm it with the destination's official authority before booking or travel.",
    conditions: [],
    sourceLabel: reviewedRule ? "UK Government – entry requirements" : officialSource?.label ?? "Official destination authority",
    sourceHref: reviewedRule?.href ?? officialSource?.href ?? "",
    dataUpdatedAt: reviewedRule ? pilotReview.checkedAt : dataset.sourceUpdatedAt,
    reviewDueAt: reviewedRule ? pilotReview.reviewDueAt : undefined,
  };
};
