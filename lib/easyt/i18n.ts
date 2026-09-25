import type { CountryDiscoveryRecommendationReason, CountryDiscoveryStayGuidance } from "./country-discovery.ts";
import { normalizeTripInterests, tripInterestLabels } from "./trip-interest.ts";
import type { DiscoveryPlace } from "./discovery-content.ts";

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
    }, visualDiscovery: {
      actions: { shortlist: "Add", remove: "Remove", explore: "Explore", showMore: "Show more", showMap: "Map", showCards: "Cards", showOnMap: "Show on map", chooseBase: "Choose base", changeBase: "Change base", stayHere: "Stay here", visitFromBase: "Visit from base", splitStay: "Split stay", reset: "Reset choices", back: "Back", continue: "Continue", confirm: "Confirm places", finishLater: "Finish later", search: "Search for a place" },
      steps: { directions: "Choose a direction", places: "Explore places", bases: "Choose a base", review: "Review choices" },
      roles: { "overnight-base": "Overnight base", visit: "Visit from a base", "browse-only": "Explore only", existing: "Already in your trip", chosen: "Chosen base", selected: "On your shortlist" },
      reviewStatus: { ready: "Ready to add", exploreOnly: "Not ready to add", unavailable: "No longer reviewed", outsideDirection: "Outside your selected direction", resolveTitle: "Some choices can’t be added yet.", resolveDetail: "Remove unavailable places or Finish later." },
      types: { continent: "Continent", country: "Country", region: "Region", city: "City", town: "Town", landmark: "Landmark", natural_area: "Natural area", island: "Island", transport_gateway: "Transport gateway", other: "Place" },
      status: { noFitClaim: "Route fit checked later", evidence: "Reviewed source", searchError: "Search is unavailable. Your idea is saved.", saveBlocked: "Changes are not saved yet", loading: "Finding places…", openingMap: "Opening map", openingMapDetail: "The place cards remain available.", mapUnavailable: "Map unavailable", mapUnavailableDetail: "Keep exploring the places in the cards." },
      accessibility: { close: "Close Discovery", direction: "Explore direction", shortlist: "Shortlist places", addToShortlist: "Add to shortlist", removeFromShortlist: "Remove from shortlist", search: "Search within", source: "Read reviewed source", noPhoto: "No licensed photo available" },
      directions: { australiaEastCoast: "East coast", australiaSouth: "Southern cities and coast", australiaTasmania: "Tasmania and nature", australiaWest: "Western Australia", australiaNorthInterior: "North and interior", fixtureA: "Direction A (fixture)", fixtureB: "Direction B (fixture)", supported: "Explore" },
      directionIntro: "Pick a route direction to explore.", placesIntro: "Choose places to add.", baseIntro: "Choose a supported base for this visit.", shortlist: "Shortlist", reviewIntro: "Confirm the places you want to add.", sparse: "Limited coverage here", sparseDetail: "Explore what’s available or search for a place.", empty: "We don't have reviewed places here yet.", emptyDetail: "Search for a place or finish later.", emptyBase: "We don't have a reviewed base here yet.", emptyBaseDetail: "Search for one or finish later.", noPhoto: "No licensed photo yet", sources: "Sources", notBase: "Base not verified", directionCount: "places", noDecision: "Nothing to review yet", noDecisionDetail: "Go back to choose a place.", searchPlaceholder: "Search for a place", searchWithin: "Search within", source: "Source",
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
    }, visualDiscovery: {
      actions: { shortlist: "Añadir", remove: "Quitar", explore: "Explorar", showMore: "Ver más", showMap: "Mapa", showCards: "Tarjetas", showOnMap: "Ver en el mapa", chooseBase: "Elegir base", changeBase: "Cambiar base", stayHere: "Alojarse aquí", visitFromBase: "Visitar desde la base", splitStay: "Dividir la estancia", reset: "Restablecer elecciones", back: "Atrás", continue: "Continuar", confirm: "Confirmar lugares", finishLater: "Terminar más tarde", search: "Buscar un lugar" },
      steps: { directions: "Elige una dirección", places: "Explora lugares", bases: "Elige una base", review: "Revisa tus elecciones" },
      roles: { "overnight-base": "Base para pernoctar", visit: "Visita desde una base", "browse-only": "Solo para explorar", existing: "Ya está en tu viaje", chosen: "Base elegida", selected: "En tu selección" },
      reviewStatus: { ready: "Listo para añadir", exploreOnly: "Aún no se puede añadir", unavailable: "Ya no figura entre los lugares revisados", outsideDirection: "Fuera de la dirección elegida", resolveTitle: "Algunas elecciones aún no se pueden añadir.", resolveDetail: "Quita los lugares no disponibles o termina más tarde." },
      types: { continent: "Continente", country: "País", region: "Región", city: "Ciudad", town: "Localidad", landmark: "Lugar de interés", natural_area: "Área natural", island: "Isla", transport_gateway: "Centro de transporte", other: "Lugar" },
      status: { noFitClaim: "El encaje en la ruta se comprobará después", evidence: "Fuente revisada", searchError: "La búsqueda no está disponible. Tu idea sigue guardada.", saveBlocked: "Los cambios aún no se han guardado", loading: "Buscando lugares…", openingMap: "Abriendo mapa", openingMapDetail: "Las tarjetas de lugares siguen disponibles.", mapUnavailable: "Mapa no disponible", mapUnavailableDetail: "Puedes seguir explorando los lugares en las tarjetas." },
      accessibility: { close: "Cerrar Discovery", direction: "Explorar dirección", shortlist: "Lugares seleccionados", addToShortlist: "Añadir a la selección", removeFromShortlist: "Quitar de la selección", search: "Buscar dentro de", source: "Leer fuente revisada", noPhoto: "No hay foto con licencia disponible" },
      directions: { australiaEastCoast: "Costa este", australiaSouth: "Ciudades y costa del sur", australiaTasmania: "Tasmania y naturaleza", australiaWest: "Australia Occidental", australiaNorthInterior: "Norte e interior", fixtureA: "Dirección A (maqueta)", fixtureB: "Dirección B (maqueta)", supported: "Explorar" },
      directionIntro: "Elige una dirección de ruta para explorar.", placesIntro: "Elige lugares para añadir.", baseIntro: "Elige una base compatible para esta visita.", shortlist: "Selección", reviewIntro: "Confirma los lugares que quieres añadir.", sparse: "Cobertura limitada aquí", sparseDetail: "Explora lo disponible o busca un lugar.", empty: "Aún no tenemos lugares revisados aquí.", emptyDetail: "Busca un lugar o termina más tarde.", emptyBase: "Aún no tenemos una base revisada aquí.", emptyBaseDetail: "Busca una o termina más tarde.", noPhoto: "Aún no hay foto con licencia", sources: "Fuentes", notBase: "Base sin verificar", directionCount: "lugares", noDecision: "Aún no hay nada que revisar", noDecisionDetail: "Vuelve para elegir un lugar.", searchPlaceholder: "Buscar un lugar", searchWithin: "Buscar dentro de", source: "Fuente",
    } },
  },
} as const;

export type DiscoveryPlaceAction = "explore" | "shortlist" | "stay-here" | "visit-from-base" | "choose-base";

export function discoveryPendingDecisionLabel(language: EasyTLanguage, placeType: string): string {
  if (placeType === "landmark") return language === "es" ? "Base aún por elegir" : "Base still to choose";
  if (placeType === "natural_area") return language === "es" ? "Estancia o base aún por elegir" : "Stay or base still to choose";
  return language === "es" ? "Lugares aún por elegir" : "Places still to choose";
}

/** Action affordances follow reviewed role evidence, never a display geography. */
export function availableActions(place: DiscoveryPlace): DiscoveryPlaceAction[] {
  return place.actionability === "overnight-base"
    ? ["explore", "shortlist", "stay-here", "choose-base"]
    : place.actionability === "visit"
      ? ["explore", "shortlist", "visit-from-base"]
      : ["explore", "shortlist"];
}

export function renderDiscoveryReason(language: EasyTLanguage, place: DiscoveryPlace): string {
  return place.relevance[language];
}

export function discoveryShortlistCount(language: EasyTLanguage, count: number): string {
  return language === "es"
    ? `${count} ${count === 1 ? "lugar" : "lugares"}`
    : `${count} ${count === 1 ? "place" : "places"}`;
}

export function discoveryStayInLabel(language: EasyTLanguage, placeName: string): string {
  return language === "es" ? `Alojarse en ${placeName}` : `Stay in ${placeName}`;
}

export function discoveryVisitBaseAriaLabel(language: EasyTLanguage, baseName: string, intentName: string): string {
  return language === "es"
    ? `Usar ${baseName} como base para visitar ${intentName}`
    : `Use ${baseName} as the base for visiting ${intentName}`;
}

const discoveryDirectionKeys = {
  "discovery.direction.australiaEastCoast": "australiaEastCoast",
  "discovery.direction.australiaSouth": "australiaSouth",
  "discovery.direction.australiaTasmania": "australiaTasmania",
  "discovery.direction.australiaWest": "australiaWest",
  "discovery.direction.australiaNorthInterior": "australiaNorthInterior",
  "fixture.direction.a": "fixtureA",
  "fixture.direction.b": "fixtureB",
} as const;

export function discoveryDirectionTitle(language: EasyTLanguage, titleKey: string, reviewedTitle?: string): string {
  if (reviewedTitle) return reviewedTitle;
  const key = discoveryDirectionKeys[titleKey as keyof typeof discoveryDirectionKeys];
  return key ? easytCopy[language].builder.visualDiscovery.directions[key]
    : easytCopy[language].builder.visualDiscovery.directions.supported;
}

export function discoveryAddPlacesLabel(language: EasyTLanguage, count: number): string {
  if (count === 0) return language === "es" ? "Añadir lugares" : "Add places";
  return language === "es"
    ? `Añadir ${count} ${count === 1 ? "lugar" : "lugares"}`
    : `Add ${count} ${count === 1 ? "place" : "places"}`;
}

export function discoveryAddToTripLabel(language: EasyTLanguage): string {
  return language === "es" ? "Añadir al viaje" : "Add to trip";
}

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

export function discoveryConfirmLabel(language: EasyTLanguage, baseCount: number, visitCount: number): string {
  const actions = [baseCount ? `${baseCount} ${baseCount === 1 ? 'base' : 'bases'}` : '',
    visitCount ? `${visitCount} ${language === 'es' ? visitCount === 1 ? 'visita' : 'visitas' : visitCount === 1 ? 'visit' : 'visits'}` : ''].filter(Boolean);
  return actions.length ? `${language === 'es' ? 'Añadir' : 'Add'} ${actions.join(language === 'es' ? ' y ' : ' and ')}`
    : language === 'es' ? 'Confirmar lugares existentes' : 'Confirm existing places';
}

/** Translate the existing diagnostic code; never generate a new travel assertion. */
export function discoveryWarningText(language: EasyTLanguage, warning: { code: string; message: string; stopIds?: string[] },
  stops: readonly { id: string; name: string }[]): string {
  if (language === 'en') return warning.message;
  const messages: Record<string, string> = {
    'hard-constraint-violation': 'La propuesta entra en conflicto con una condición del viaje.',
    'required-stop-missing': 'Falta una parada obligatoria.',
    'fixed-start-broken': 'La propuesta cambia el inicio fijado.', 'fixed-start-missing': 'Falta el inicio fijado.',
    'fixed-end-broken': 'La propuesta cambia el final fijado.', 'fixed-end-missing': 'Falta el final fijado.',
    'fixed-endpoint-conflict': 'Los extremos fijados de la ruta entran en conflicto.',
    'total-nights-mismatch': 'El total de noches no coincide con la duración.',
    'below-minimum-stay': 'La estancia queda por debajo del mínimo recomendado.',
    'minimum-stay-conflict': 'La duración no permite respetar las estancias mínimas.',
    'minimum-stay-compromise': 'Algunas estancias requieren reducir el tiempo recomendado.',
    'one-night-anchor-after-large-transfer': 'Una parada importante tiene una sola noche después de un traslado largo.',
    'one-night-anchor': 'Una parada importante tiene una sola noche.',
    'extreme-pacing': 'La ruta tiene demasiadas estancias muy cortas.',
    'excessive-travel-day-burden': 'Los traslados consumen demasiado tiempo del viaje.',
    'unnecessary-backtracking': 'El orden de la ruta requiere retrocesos que conviene revisar.',
    'unsupported-transfer': 'No hay información suficiente para confirmar un traslado.',
    'duplicate-stop': 'La ruta repite una parada.', 'duplicate-stop-id': 'La ruta repite una parada.',
    'fixed-date-conflict': 'La propuesta entra en conflicto con una fecha fijada.',
    'fixed-commitment-conflict': 'La propuesta entra en conflicto con un compromiso fijado.',
    'transport-restriction-conflict': 'Un traslado entra en conflicto con tus restricciones de transporte.',
    'forbidden-transport-mode': 'Un traslado utiliza un medio de transporte excluido.',
    'maximum-transfer-time-conflict': 'Un traslado supera tu límite de tiempo.',
    'maximum-transfer-time-exceeded': 'Un traslado supera tu límite de tiempo.',
    'country-reentry': 'La ruta vuelve a entrar en un país; revisa el orden y los compromisos fijados.',
    'invalid-total-nights': 'Falta una duración válida para repartir las noches.',
    'no-stops': 'No hay bases para repartir las noches.',
    'fixed-nights-exceed-total': 'Las noches fijadas superan la duración disponible.',
    'fixed-night-mismatch': 'La distribución no respeta una estancia fijada.',
    'fixed-below-minimum': 'Una estancia fijada queda por debajo del mínimo recomendado.',
    'unallocated-nights': 'Quedan noches por asignar.', 'overallocated-nights': 'Hay más noches asignadas que disponibles.',
    'unlinked-fixed-commitment': 'Un compromiso fijado todavía no está vinculado a una parada.',
    'excluded-stop-present': 'La propuesta incluye una parada excluida.',
    'maximum-stops-exceeded': 'La propuesta supera tu límite de paradas.',
    'required-stops-exceed-maximum': 'Las paradas obligatorias superan tu límite de paradas.',
  };
  const names = warning.stopIds?.map(id => stops.find(stop => stop.id === id)?.name).filter(Boolean).join(', ');
  return `${messages[warning.code] ?? 'Hay una comprobación pendiente de ruta o tiempo.'}${names ? ` (${names})` : ''}`;
}
