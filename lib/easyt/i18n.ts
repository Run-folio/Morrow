export type EasyTLanguage = "en" | "es";

export const easytCopy = {
  en: {
    nav: { back: "Back", home: "Home", prototype: "Prototype", trips: "Trips", newTrip: "New trip", stamped: "Stamps", account: "Account", profile: "Profile", privacy: "Privacy", language: "Language", tour: "Guide", signOut: "Sign out" },
    account: { settings: "Account settings", profileTitle: "Your profile.", personal: "Personal details", preferences: "Preferences", name: "Name", email: "Email", saveProfile: "Save profile", languageHint: "Your language preference is used across EasyT." },
    dashboard: { active: "Active", archived: "Archived", routeWaiting: "Your route is waiting.", edit: "Edit trip", restore: "Restore", archive: "Archive", duplicate: "Duplicate", gift: "Gift this trip", delete: "Delete", emptyArchived: "Nothing archived.", emptyActive: "Your first trip starts here.", archivedHint: "Trips you archive will stay safely available here.", activeHint: "Use “New trip” in the header to turn a few destinations into a plan you can actually travel with.", giftTitle: "Gift an editable copy", inviteSent: "Invitation sent. They can claim an editable copy from their email.", inviteReady: "Your invitation is ready. Copy the private claim link to send it yourself.", copyLink: "Copy claim link", draftHint: "They’ll receive their own draft. Your plan is never changed.", recipient: "Recipient email", note: "Note (optional)", createInvite: "Create invitation", creatingInvite: "Creating invite…" },
    builder: { steps: ["Where", "When", "Places", "Time"], routeFirst: "Route first", datesSetLength: "Dates set length", spendDays: "Spend your days", howFeels: "Make room for what matters", back: "Back", continue: "Continue", buildDraft: "Build the draft", startFrom: "Starting from", addDestination: "Add a destination", startDate: "Start date", endDate: "End date", cityAirport: "City or airport", destinationPlaceholder: "City, region or landmark" },
  },
  es: {
    nav: { back: "Atrás", home: "Inicio", prototype: "Prototipo", trips: "Viajes", newTrip: "Nuevo viaje", stamped: "Sellos", account: "Cuenta", profile: "Perfil", privacy: "Privacidad", language: "Idioma", tour: "Guía", signOut: "Cerrar sesión" },
    account: { settings: "Configuración de la cuenta", profileTitle: "Tu perfil.", personal: "Datos personales", preferences: "Preferencias", name: "Nombre", email: "Correo electrónico", saveProfile: "Guardar perfil", languageHint: "Tu idioma se usa en toda la experiencia de EasyT." },
    dashboard: { active: "Activos", archived: "Archivados", routeWaiting: "Tu ruta está esperando.", edit: "Editar viaje", restore: "Restaurar", archive: "Archivar", duplicate: "Duplicar", gift: "Regalar este viaje", delete: "Eliminar", emptyArchived: "No hay viajes archivados.", emptyActive: "Tu primer viaje empieza aquí.", archivedHint: "Los viajes archivados seguirán disponibles aquí.", activeHint: "Usa “Nuevo viaje” en el encabezado para convertir algunos destinos en un plan que puedas disfrutar.", giftTitle: "Regala una copia editable", inviteSent: "Invitación enviada. Podrán reclamar una copia editable desde su correo.", inviteReady: "Tu invitación está lista. Copia el enlace privado para enviarlo.", copyLink: "Copiar enlace", draftHint: "Recibirán su propio borrador. Tu plan no cambiará.", recipient: "Correo del destinatario", note: "Nota (opcional)", createInvite: "Crear invitación", creatingInvite: "Creando invitación…" },
    builder: { steps: ["Dónde", "Cuándo", "Lugares", "Tiempo"], routeFirst: "Primero la ruta", datesSetLength: "Las fechas definen la duración", spendDays: "Distribuye tus días", howFeels: "Deja espacio para lo importante", back: "Atrás", continue: "Continuar", buildDraft: "Crear borrador", startFrom: "Punto de partida", addDestination: "Añadir destino", startDate: "Fecha de inicio", endDate: "Fecha de fin", cityAirport: "Ciudad o aeropuerto", destinationPlaceholder: "Ciudad, región o lugar" },
  },
} as const;

export function languageFromStorage(): EasyTLanguage {
  if (typeof window === "undefined") return "en";
  return window.localStorage.getItem("easyt-language") === "es" ? "es" : "en";
}
