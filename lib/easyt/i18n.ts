import type { CountryDiscoveryRecommendationReason, CountryDiscoveryStayGuidance } from "./country-discovery.ts";
import { normalizeTripInterests, tripInterestLabels } from "./trip-interest.ts";

export type EasyTLanguage = "en" | "es";

export const EASYT_LANGUAGE_STORAGE_KEY = "easyt-language";
export const EASYT_LANGUAGE_CHANGE_EVENT = "easyt-language-change";

export type EasyTLanguageRuntime = {
  read: () => string | null;
  write: (language: EasyTLanguage) => void;
  setDocumentLanguage: (language: EasyTLanguage) => void;
  notify: (language: EasyTLanguage) => void;
};

export const easytCopy = {
  en: {
    nav: { back: "Back", home: "Home", prototype: "Prototype", trips: "Trips", newTrip: "New trip", stamped: "Stamps", account: "Account", profile: "Profile", privacy: "Privacy", language: "Language", tour: "Tour", signOut: "Sign out" },
    account: { settings: "Account settings", profileTitle: "Your profile.", personal: "Account details", preferences: "Preferences", name: "Name", email: "Email", saveProfile: "Save profile", languageHint: "Your language preference is used across Morrovia." },
    dashboard: { active: "Active", archived: "Archived", routeWaiting: "Your route is waiting.", edit: "Edit trip", restore: "Restore", archive: "Archive", duplicate: "Duplicate", gift: "Gift this trip", delete: "Delete", emptyArchived: "Nothing archived.", emptyActive: "Your first trip starts here.", archivedHint: "Trips you archive will stay safely available here.", activeHint: "Use “New trip” in the header to turn a few destinations into a plan you can actually travel with.", giftTitle: "Gift an editable copy", inviteSent: "Invitation sent. They can claim an editable copy from their email.", inviteReady: "Your invitation is ready. Copy the private claim link to send it yourself.", copyLink: "Copy claim link", draftHint: "They’ll receive their own draft. Your plan is never changed.", recipient: "Recipient email", note: "Note (optional)", createInvite: "Create invitation", creatingInvite: "Creating invite…" },
    builder: { steps: ["Where", "When", "Places", "Time"], routeFirst: "Route first", datesSetLength: "Dates set length", spendDays: "Spend your days", howFeels: "Make room for what matters", back: "Back", continue: "Continue", buildDraft: "Build the draft", startFrom: "Starting from", addDestination: "Add a destination", startDate: "Start date", endDate: "End date", cityAirport: "City or airport", destinationPlaceholder: "City, region or landmark", countryDiscovery: {
      recommendedPlaces: "Recommended places", recommends: "MORROVIA RECOMMENDS",
      introWithNights: "Based on your trip length, start with a few places and adjust the selection.",
      introSupported: "Start with these supported places and adjust the selection.",
      sparseFallback: "We do not have enough supported places to recommend yet. Your country stays in the trip; search for somewhere specific.",
      source: "Source", alreadyInTrip: "Already in trip", selectedRemove: "Selected · Remove", add: "Add",
      alreadyInTripAria: "already in trip", selectedRemoveAria: "selected, remove", addAria: "not selected, add",
      seeMore: "See more places", searchSpecific: "Search for somewhere specific",
    } },
  },
  es: {
    nav: { back: "Atrás", home: "Inicio", prototype: "Prototipo", trips: "Viajes", newTrip: "Nuevo viaje", stamped: "Sellos", account: "Cuenta", profile: "Perfil", privacy: "Privacidad", language: "Idioma", tour: "Tour", signOut: "Cerrar sesión" },
    account: { settings: "Configuración de la cuenta", profileTitle: "Tu perfil.", personal: "Datos de la cuenta", preferences: "Preferencias", name: "Nombre", email: "Correo electrónico", saveProfile: "Guardar perfil", languageHint: "Tu idioma se usa en toda la experiencia de Morrovia." },
    dashboard: { active: "Activos", archived: "Archivados", routeWaiting: "Tu ruta está esperando.", edit: "Editar viaje", restore: "Restaurar", archive: "Archivar", duplicate: "Duplicar", gift: "Regalar este viaje", delete: "Eliminar", emptyArchived: "No hay viajes archivados.", emptyActive: "Tu primer viaje empieza aquí.", archivedHint: "Los viajes archivados seguirán disponibles aquí.", activeHint: "Usa “Nuevo viaje” en el encabezado para convertir algunos destinos en un plan que puedas disfrutar.", giftTitle: "Regala una copia editable", inviteSent: "Invitación enviada. Podrán reclamar una copia editable desde su correo.", inviteReady: "Tu invitación está lista. Copia el enlace privado para enviarlo.", copyLink: "Copiar enlace", draftHint: "Recibirán su propio borrador. Tu plan no cambiará.", recipient: "Correo del destinatario", note: "Nota (opcional)", createInvite: "Crear invitación", creatingInvite: "Creando invitación…" },
    builder: { steps: ["Dónde", "Cuándo", "Lugares", "Tiempo"], routeFirst: "Primero la ruta", datesSetLength: "Las fechas definen la duración", spendDays: "Distribuye tus días", howFeels: "Deja espacio para lo importante", back: "Atrás", continue: "Continuar", buildDraft: "Crear borrador", startFrom: "Punto de partida", addDestination: "Añadir destino", startDate: "Fecha de inicio", endDate: "Fecha de fin", cityAirport: "Ciudad o aeropuerto", destinationPlaceholder: "Ciudad, región o lugar", countryDiscovery: {
      recommendedPlaces: "Lugares recomendados", recommends: "MORROVIA RECOMIENDA",
      introWithNights: "Según la duración de tu viaje, empieza con unos pocos lugares y ajusta la selección.",
      introSupported: "Empieza con estos lugares verificados y ajusta la selección.",
      sparseFallback: "Aún no tenemos suficientes lugares verificados para recomendar. Tu país sigue en el viaje; busca un lugar concreto.",
      source: "Fuente", alreadyInTrip: "Ya en el viaje", selectedRemove: "Seleccionado · Quitar", add: "Añadir",
      alreadyInTripAria: "ya en el viaje", selectedRemoveAria: "seleccionado, quitar", addAria: "no seleccionado, añadir",
      seeMore: "Ver más lugares", searchSpecific: "Buscar un lugar concreto",
    } },
  },
} as const;

type CountryDiscoveryPresentationCandidate = {
  reason: string;
  recommendationReason: CountryDiscoveryRecommendationReason;
  stayGuidance?: string;
  recommendationStayGuidance?: CountryDiscoveryStayGuidance;
};

const spanishInterestPhrase = {
  food: `la ${tripInterestLabels.es.food.toLocaleLowerCase("es")}`,
  culture: `la ${tripInterestLabels.es.culture.toLocaleLowerCase("es")}`,
  nature: `la ${tripInterestLabels.es.nature.toLocaleLowerCase("es")}`,
  cities: `las ${tripInterestLabels.es.cities.toLocaleLowerCase("es")}`,
  beach: `la ${tripInterestLabels.es.beach.toLocaleLowerCase("es")}`,
  hiking: `el ${tripInterestLabels.es.hiking.toLocaleLowerCase("es")}`,
} as const;

const spanishEvidenceInterestPhrase: Record<string, string | undefined> = {
  adventure: "la aventura",
  city: spanishInterestPhrase.cities,
  coast: "la costa",
  heritage: "el patrimonio",
  rail: "los viajes en tren",
  wildlife: "la fauna",
};

function spanishCountryDiscoveryReason(reason: CountryDiscoveryRecommendationReason): string {
  if (reason.kind === "interest-match") {
    const interest = normalizeTripInterests([reason.interest])[0];
    const phrase = interest
      ? spanishInterestPhrase[interest]
      : spanishEvidenceInterestPhrase[reason.interest.trim().toLocaleLowerCase()];
    return phrase
      ? `Coincide con tu interés por ${phrase}.`
      : "Coincide con uno de tus intereses.";
  }
  if (reason.kind === "named-place-country-match") return "Está en el mismo país que un lugar que nombraste expresamente.";
  if (reason.kind === "minimum-stay-fits") return "Su estancia mínima conocida cabe en una parte de las noches de este viaje.";
  return `Un lugar respaldado dentro de ${reason.parentName}; revisa cómo encaja en tu ruta.`;
}

function spanishCountryDiscoveryStayGuidance(guidance: CountryDiscoveryStayGuidance | undefined): string | undefined {
  if (!guidance) return undefined;
  const nights = `${guidance.nights} ${guidance.nights === 1 ? "noche" : "noches"}`;
  return guidance.kind === "typical"
    ? `Normalmente, ${nights} según la guía de rutas revisada de Morrovia`
    : `Reserva al menos ${nights} según la guía de rutas existente`;
}

export function countryDiscoveryCandidatePresentation<T extends CountryDiscoveryPresentationCandidate>(
  language: EasyTLanguage,
  candidate: T,
): T {
  if (language === "en") return candidate;
  return {
    ...candidate,
    reason: spanishCountryDiscoveryReason(candidate.recommendationReason),
    stayGuidance: spanishCountryDiscoveryStayGuidance(candidate.recommendationStayGuidance),
  };
}

export function countryDiscoveryContinueLabel(language: EasyTLanguage, count: number): string {
  if (language === "es") return `Continuar con ${count} ${count === 1 ? "lugar" : "lugares"}`;
  return `Continue with ${count} ${count === 1 ? "place" : "places"}`;
}

function browserLanguageRuntime(): EasyTLanguageRuntime {
  return {
    read: () => window.localStorage.getItem(EASYT_LANGUAGE_STORAGE_KEY),
    write: (language) => window.localStorage.setItem(EASYT_LANGUAGE_STORAGE_KEY, language),
    setDocumentLanguage: (language) => { document.documentElement.lang = language; },
    notify: (language) => window.dispatchEvent(new CustomEvent(EASYT_LANGUAGE_CHANGE_EVENT, { detail: language })),
  };
}

function supportedLanguage(value: unknown): EasyTLanguage | null {
  return value === "en" || value === "es" ? value : null;
}

export function resolveSessionLanguage(
  storedLanguage: unknown,
  accountLanguage?: unknown,
): EasyTLanguage {
  return supportedLanguage(storedLanguage) ?? supportedLanguage(accountLanguage) ?? "en";
}

export function commitSessionLanguage(
  language: EasyTLanguage,
  runtime: EasyTLanguageRuntime = browserLanguageRuntime(),
): EasyTLanguage {
  try { runtime.write(language); } catch { /* Browser preference storage is optional. */ }
  runtime.setDocumentLanguage(language);
  runtime.notify(language);
  return language;
}

export function establishSessionLanguage(
  accountLanguage?: EasyTLanguage,
  runtime: EasyTLanguageRuntime = browserLanguageRuntime(),
): EasyTLanguage {
  let storedLanguage: string | null = null;
  try { storedLanguage = runtime.read(); } catch { /* Fall back to the account or English. */ }
  const establishedLanguage = supportedLanguage(storedLanguage) ?? supportedLanguage(accountLanguage);
  if (establishedLanguage) return commitSessionLanguage(establishedLanguage, runtime);

  // English is the rendering fallback, not an explicit session preference.
  // Leaving storage empty lets a subsequently loaded account preference seed
  // the current browser session instead of being masked by a provisional value.
  runtime.setDocumentLanguage("en");
  runtime.notify("en");
  return "en";
}

export function languageFromStorage(): EasyTLanguage {
  if (typeof window === "undefined") return "en";
  try {
    return resolveSessionLanguage(window.localStorage.getItem(EASYT_LANGUAGE_STORAGE_KEY));
  } catch {
    return "en";
  }
}
