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

const SCHENGEN_DESTINATIONS = new Set([
  "Austria", "Croatia", "Denmark", "Finland", "France", "Germany", "Greece", "Italy",
  "Malta", "Netherlands", "Norway", "Poland", "Portugal", "Spain", "Sweden",
]);
const EU_EEA_PASSPORTS = new Set([
  "Denmark", "Finland", "France", "Germany", "Ireland", "Netherlands", "Norway", "Spain", "Sweden",
]);

const statusDetails: Record<Exclude<TouristEntryStatus, "not-verified">, Record<VisaLanguage, { label: string; answer: string }>> = {
  "visa-free": {
    en: { label: "Visa-free", answer: "Not required for a tourist visit" },
    es: { label: "Sin visado", answer: "No se requiere para una visita turística" },
  },
  "visa-on-arrival": {
    en: { label: "Visa on arrival", answer: "Visa on arrival is listed" },
    es: { label: "Visado a la llegada", answer: "Se indica visado a la llegada" },
  },
  eta: {
    en: { label: "Travel authorisation", answer: "Electronic travel authorisation required" },
    es: { label: "Autorización de viaje", answer: "Se requiere autorización electrónica de viaje" },
  },
  "e-visa": {
    en: { label: "eVisa", answer: "eVisa required before travel" },
    es: { label: "Visado electrónico", answer: "Se requiere visado electrónico antes de viajar" },
  },
  "visa-required": {
    en: { label: "Visa required", answer: "Apply for a tourist visa before travel" },
    es: { label: "Visado requerido", answer: "Solicita un visado turístico antes de viajar" },
  },
  "no-admission": {
    en: { label: "Entry restricted", answer: "Entry is listed as not permitted" },
    es: { label: "Entrada restringida", answer: "La entrada figura como no permitida" },
  },
};

const statusFromDataset = (status: string): TouristEntryStatus => (({
  "visa free": "visa-free",
  "visa on arrival": "visa-on-arrival",
  eta: "eta",
  "e-visa": "e-visa",
  "visa required": "visa-required",
  "no admission": "no-admission",
} as const)[status as "visa free" | "visa on arrival" | "eta" | "e-visa" | "visa required" | "no admission"] ?? "not-verified");

const stayFor = (days: number | undefined, language: VisaLanguage) => {
  if (!days) return language === "es" ? "La duración no figura en los datos" : "Stay length is not stated in the data";
  return language === "es" ? `Hasta ${days} días` : `Up to ${days} days`;
};

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
 * Uses a bundled Passport Index snapshot for the supported picker combinations.
 * It is a travel-planning aid, never a border decision or a real-time guarantee.
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

  if (EU_EEA_PASSPORTS.has(passportName) && SCHENGEN_DESTINATIONS.has(destinationName)) return {
    informationState: "known",
    status: "visa-free",
    statusLabel: language === "es" ? "Libre circulación" : "Free movement",
    visaAnswer: language === "es" ? "No se requiere visado para una visita turística" : "No tourist visa required",
    permittedStay: language === "es" ? "Hasta 3 meses sin registro de residencia" : "Up to 3 months without residence registration",
    detail: language === "es" ? "Para estancias más largas, pueden aplicarse condiciones de residencia o registro local." : "For longer stays, residence conditions or local registration may apply.",
    conditions: [language === "es" ? "Algunos países pueden requerir que comuniques tu presencia tras la llegada." : "Some countries may require you to report your presence after arrival."],
    sourceLabel: "Your Europe — EU residence rights",
    sourceHref: "https://europa.eu/youreurope/citizens/residence/residence-rights/index_en.htm",
    dataUpdatedAt: "2026-08-14",
  };

  const status = statusFromDataset(rule.status);
  if (status === "not-verified") return missingRequirement(destinationName, language);
  const copy = statusDetails[status][language];
  const schengenAllowance = passportName === "United Kingdom" && SCHENGEN_DESTINATIONS.has(destinationName);
  const permittedStay = schengenAllowance
    ? (language === "es" ? "Hasta 90 días en cualquier período de 180 días" : "Up to 90 days in any 180-day period")
    : stayFor(rule.days, language);

  return {
    informationState: "known",
    status,
    statusLabel: copy.label,
    visaAnswer: copy.answer,
    permittedStay,
    detail: schengenAllowance
      ? (language === "es" ? `El límite se comparte en todo el espacio Schengen; no se reinicia en ${destinationName}.` : `This allowance is shared across the Schengen area, not reset in ${destinationName}.`)
      : (language === "es" ? "Clasificación indicativa para visitas turísticas con pasaporte ordinario." : "An indicative classification for ordinary tourist travel."),
    conditions: schengenAllowance
      ? [
          language === "es" ? "Las visitas previas a otros países Schengen en los últimos 180 días cuentan para el límite." : "Previous visits to other Schengen countries in the rolling 180-day period count towards this limit.",
          language === "es" ? "Las reglas para trabajo, estudios, tránsito o estancias más largas son diferentes." : "Rules for work, study, transit and longer stays are different.",
        ]
      : [language === "es" ? "El trabajo, los estudios, el tránsito y la residencia pueden tener requisitos distintos." : "Work, study, transit and residence can have different requirements."],
    sourceLabel: officialSource?.label ?? "Official destination authority",
    sourceHref: officialSource?.href ?? dataset.source,
    dataUpdatedAt: dataset.sourceUpdatedAt,
  };
};
