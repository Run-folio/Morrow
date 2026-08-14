import passportIndex from "./data/passport-index-visa-matrix.json" with { type: "json" };
import { canonicalCountry, entrySourcesByCountry } from "./travel-readiness.ts";

export type TouristEntryStatus = "visa-free" | "visa-on-arrival" | "eta" | "e-visa" | "visa-required" | "no-admission" | "not-verified";
export type VisaLanguage = "en" | "es";

export type TouristEntryRequirement = {
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

const flagFromIso2 = (code: string | undefined) => code && /^[a-z]{2}$/i.test(code)
  ? [...code.toUpperCase()].map((character) => String.fromCodePoint(127397 + character.charCodeAt(0))).join("")
  : "🌐";

/** Available ordinary-passport nationalities in the bundled Passport Index snapshot. */
export const supportedPassportCountries = (dataset.passportCountries?.map(({ name }) => name) ?? Object.keys(dataset.rules))
  .sort((a, b) => a.localeCompare(b));

/** Country flag for passport and destination controls, using the bundled ISO country codes. */
export const countryFlagFor = (country: string) => flagFromIso2(dataset.countryCodes?.[canonicalCountry(country)]);

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
  const officialSource = entrySourcesByCountry[destination];
  return {
    status: "not-verified",
    statusLabel: language === "es" ? "Por verificar" : "Needs verification",
    visaAnswer: language === "es" ? "Morrovia aún no tiene datos para esta combinación" : "Morrovia does not yet have data for this combination",
    permittedStay: language === "es" ? "Consulta la fuente oficial" : "Check the official source",
    detail: language === "es" ? "No mostramos una estimación cuando falta una coincidencia de pasaporte y destino." : "We do not show an estimate when a passport and destination match is missing.",
    conditions: [language === "es" ? "Las reglas pueden depender de residencia, tránsito y propósito de viaje." : "Rules can depend on residence, transit and travel purpose."],
    sourceLabel: officialSource?.label ?? "Official destination authority",
    sourceHref: officialSource?.href ?? "https://www.gov.uk/foreign-travel-advice",
    dataUpdatedAt: "",
  };
};

/**
 * Uses a bundled Passport Index snapshot for the supported picker combinations.
 * It is a travel-planning aid, never a border decision or a real-time guarantee.
 */
export const touristEntryRequirementFor = (passport: string, destination: string, language: VisaLanguage = "en"): TouristEntryRequirement => {
  const passportCountry = canonicalCountry(passport);
  const destinationCountry = canonicalCountry(destination);
  const rule = dataset.rules[passportCountry]?.[destinationCountry];
  const officialSource = entrySourcesByCountry[destinationCountry];

  if (!rule) return missingRequirement(destinationCountry, language);

  if (EU_EEA_PASSPORTS.has(passportCountry) && SCHENGEN_DESTINATIONS.has(destinationCountry)) return {
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
  if (status === "not-verified") return missingRequirement(destinationCountry, language);
  const copy = statusDetails[status][language];
  const schengenAllowance = passportCountry === "United Kingdom" && SCHENGEN_DESTINATIONS.has(destinationCountry);
  const permittedStay = schengenAllowance
    ? (language === "es" ? "Hasta 90 días en cualquier período de 180 días" : "Up to 90 days in any 180-day period")
    : stayFor(rule.days, language);

  return {
    status,
    statusLabel: copy.label,
    visaAnswer: copy.answer,
    permittedStay,
    detail: schengenAllowance
      ? (language === "es" ? `El límite se comparte en todo el espacio Schengen; no se reinicia en ${destinationCountry}.` : `This allowance is shared across the Schengen area, not reset in ${destinationCountry}.`)
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
