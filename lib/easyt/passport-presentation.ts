import type { EntrySource } from "./travel-readiness.ts";
import type { TouristEntryRequirement, VisaLanguage } from "./visa-requirements.ts";

export type PassportPresentation = {
  informationState: TouristEntryRequirement["informationState"];
  verification: "verified" | "needs-confirmation";
  freshness: string | null;
  source: { href: string; label: string | null; official: boolean };
  entryConsiderations: string[];
  passportValidityContext: string;
  scopeContext: string;
};

/** Reorganises supported facts without inferring another entry rule. */
export function passportPresentationFor({
  requirement,
  language,
  sourceCoverage,
  passportExpiryMonth,
}: {
  requirement: TouristEntryRequirement;
  language: VisaLanguage;
  sourceCoverage?: EntrySource["coverage"];
  passportExpiryMonth?: string;
}): PassportPresentation {
  const isSpanish = language === "es";
  const expiryContext = passportExpiryMonth
    ? isSpanish
      ? `Tu perfil guardado indica el mes de caducidad ${passportExpiryMonth}. Confirma la validez exigida con la fuente oficial.`
      : `Your saved profile has expiry month ${passportExpiryMonth}. Confirm the required validity with the official source.`
    : isSpanish
      ? "Confirma con la fuente oficial la validez exigida después de la fecha de regreso."
      : "Confirm required validity beyond your return date with the official source.";
  const unsupported = requirement.informationState === "unsupported";

  return {
    informationState: requirement.informationState,
    verification: requirement.informationState === "known" ? "verified" : "needs-confirmation",
    freshness: requirement.dataUpdatedAt || null,
    source: {
      href: requirement.sourceHref,
      label: requirement.sourceLabel || null,
      official: sourceCoverage === "official",
    },
    entryConsiderations: unsupported ? [] : requirement.conditions.filter(Boolean),
    passportValidityContext: unsupported ? "" : expiryContext,
    scopeContext: unsupported ? "" : isSpanish
      ? "Este resultado cubre visitas turísticas con pasaporte ordinario. Tránsito, trabajo, estudios y residencia pueden seguir reglas distintas."
      : "This result covers ordinary-passport tourist visits. Transit, work, study and residence can follow different rules.",
  };
}
