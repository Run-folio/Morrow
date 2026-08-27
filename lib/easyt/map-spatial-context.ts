import type { EasyTTrip, TripLeg } from "./trip.ts";
import type { PlanningConfidence } from "./planning-confidence.ts";
import type { TransferImpact } from "./transfer-impact.ts";

export type MapTransportMode = TripLeg["mode"];

export type MapRouteLeg = {
  id: string;
  fromStopId: string;
  toStopId: string;
  fromName: string;
  toName: string;
  fromCoordinates: [number, number];
  toCoordinates: [number, number];
  mode: MapTransportMode;
  modeLabel: string;
  distanceKm: number | null;
  headlineMinutes: number | null;
  doorToDoorMinutes: number | null;
  confidence: PlanningConfidence | null;
  provenanceLabel: string;
  scheduleNeedsChecking: boolean;
  planningNote: string | null;
};

export type MapCopilotScope =
  | "whole-trip"
  | "selected-stop"
  | "selected-day"
  | "selected-transfer"
  | "selected-place";

type RouteMetadata = {
  planningEstimate?: boolean;
  transferImpact?: TransferImpact;
  planningConfidence?: { overall?: PlanningConfidence; schedule?: PlanningConfidence };
  curatedRouteTransfer?: { note?: string };
};

function routeMetadata(leg: TripLeg): RouteMetadata {
  return leg.routeMetadata as RouteMetadata;
}

export function mapTransportModeLabel(mode: MapTransportMode) {
  if (mode === "flight") return "Flight";
  if (mode === "train") return "Train";
  if (mode === "road") return "Road";
  if (mode === "ferry") return "Ferry";
  if (mode === "walk") return "Walk";
  return "Unknown transport";
}

function knownPlanningMinutes(value: TransferImpact["headline"] | TransferImpact["doorToDoor"] | undefined) {
  return value?.status === "known" ? value.value.planningMinutes : null;
}

/**
 * Project the canonical TripDocument into honest spatial planning connections.
 * No route geometry, transport mode or timing is inferred here: missing facts
 * stay missing, and the UI labels each straight connection as approximate.
 */
export function mapRouteLegsFromTrip(trip: Pick<EasyTTrip, "stops" | "legs">): MapRouteLeg[] {
  const stops = new Map(trip.stops.map((stop) => [stop.id, stop]));
  return trip.legs.flatMap((leg) => {
    const from = stops.get(leg.fromStopId);
    const to = stops.get(leg.toStopId);
    if (!from || !to || from.longitude === null || from.latitude === null || to.longitude === null || to.latitude === null) return [];
    const metadata = routeMetadata(leg);
    const impact = metadata.transferImpact;
    const confidence = metadata.planningConfidence?.overall
      ?? impact?.claimConfidence?.doorToDoor
      ?? null;
    const scheduleConfidence = metadata.planningConfidence?.schedule;
    const scheduleNeedsChecking = leg.mode === "unknown"
      || scheduleConfidence?.confirmation.needed !== false
      || metadata.planningEstimate !== false;
    const curated = Boolean(metadata.curatedRouteTransfer);
    return [{
      id: leg.id,
      fromStopId: leg.fromStopId,
      toStopId: leg.toStopId,
      fromName: from.name,
      toName: to.name,
      fromCoordinates: [from.longitude, from.latitude],
      toCoordinates: [to.longitude, to.latitude],
      mode: leg.mode,
      modeLabel: mapTransportModeLabel(leg.mode),
      distanceKm: leg.distanceKm,
      headlineMinutes: knownPlanningMinutes(impact?.headline),
      doorToDoorMinutes: knownPlanningMinutes(impact?.doorToDoor) ?? leg.durationMinutes,
      confidence,
      provenanceLabel: curated
        ? "Curated route guidance"
        : metadata.planningEstimate
          ? "Morrovia planning estimate"
          : leg.provider?.trim() || "Saved transfer",
      scheduleNeedsChecking,
      planningNote: leg.provider?.trim() || metadata.curatedRouteTransfer?.note?.trim() || null,
    }];
  });
}

export function formatMapDuration(minutes: number | null) {
  if (minutes === null) return "To confirm";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function conciseMapDescription(value: string | undefined, maxLength = 220) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (normalized.length <= maxLength) return normalized;
  const candidate = normalized.slice(0, maxLength + 1);
  const sentence = candidate.lastIndexOf(". ");
  if (sentence >= Math.floor(maxLength * .55)) return candidate.slice(0, sentence + 1);
  const word = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, word > 0 ? word : maxLength).replace(/[,:;\s]+$/, "")}…`;
}

export function mapCopilotPrompts(scope: MapCopilotScope, language: "en" | "es" = "en") {
  if (language === "es") {
    if (scope === "whole-trip") return ["Explica esta ruta", "¿Dónde cansa más el viaje?", "¿Podría fluir mejor esta ruta?"] as const;
    if (scope === "selected-transfer") return ["Explica este traslado", "¿Hay una alternativa más fácil?", "¿Cuánto día ocupará?"] as const;
    if (scope === "selected-stop") return ["¿Qué debería priorizar aquí?", "Encuentra algo cerca", "¿Es muy corta esta estancia?"] as const;
    if (scope === "selected-place") return ["¿Cómo encaja en el día?", "¿Qué hay cerca?", "¿Qué debería comprobar?"] as const;
    return ["Haz este día más ligero", "Explica este día", "¿Qué encaja cerca?"] as const;
  }
  if (scope === "whole-trip") return ["Explain this route", "Where is the trip most tiring?", "Could this route flow better?"] as const;
  if (scope === "selected-transfer") return ["Explain this transfer", "Is there an easier alternative?", "How much of the day will this take?"] as const;
  if (scope === "selected-stop") return ["What should I prioritise here?", "Find something nearby", "Is this stay too short?"] as const;
  if (scope === "selected-place") return ["How could this fit the day?", "What is nearby?", "What should I check first?"] as const;
  return ["Make this day lighter", "Explain this day", "What fits nearby?"] as const;
}

export function mapCopilotAnswers(scope: MapCopilotScope, language: "en" | "es" = "en") {
  if (language === "es") {
    if (scope === "whole-trip") return [
      "La ruta sigue el orden guardado. Revisa cada traslado para ver qué estimaciones aún necesitan horarios reales.",
      "Empieza por el traslado puerta a puerta más largo. Morrovia mantiene visible su impacto en el día.",
      "Un flujo mejor reduce retrocesos o protege tiempo útil. Cualquier cambio se propondrá para revisión antes de modificar el viaje.",
    ] as const;
    if (scope === "selected-transfer") return [
      "Esta conexión usa los datos guardados y una estimación puerta a puerta; no es un horario ni una ruta navegable en vivo.",
      "Compara el modo guardado con alternativas realistas y revisa el impacto antes de aprobar un cambio.",
      "Usa la cifra puerta a puerta para planificar. El tiempo principal, si existe, solo cubre el transporte central.",
    ] as const;
    if (scope === "selected-stop") return [
      "Empieza con un lugar que explique por qué elegiste esta parada y mantén el resto geográficamente coherente.",
      "Abre el buscador local para opciones en el mapa y comprueba los datos actuales antes de depender de una.",
      "Compara la estancia con el impacto de llegada y salida. Morrovia propondrá cambios sin modificarla en silencio.",
    ] as const;
    if (scope === "selected-place") return [
      "Úsalo como un ancla y acompáñalo con tiempo cercano, no con paradas desconectadas por la ciudad.",
      "El buscador local muestra opciones mapeadas sin afirmar disponibilidad en vivo salvo confirmación del proveedor.",
      "Comprueba horarios, acceso y reservas actuales en la fuente enlazada antes de fijarlo en el día.",
    ] as const;
    return [
      "Mantén la actividad más importante y protege un bloque libre. Todo cambio seguirá pendiente de tu aprobación.",
      "Este día combina actividades guardadas e impacto de traslado; es un plan flexible, no un horario en vivo.",
      "Usa el buscador local y guarda solo la opción que encaje con el ritmo de hoy.",
    ] as const;
  }
  if (scope === "whole-trip") return [
    "The route follows the saved stop order. Inspect each transfer to see where planning estimates still need a real schedule check.",
    "The longest door-to-door transfer is the best place to start. Morrovia keeps that travel-day impact visible instead of treating it as free time.",
    "A better flow should reduce backtracking or protect more usable time. Any reordering would be proposed for review before it changed the trip.",
  ] as const;
  if (scope === "selected-transfer") return [
    "This connection uses the saved transport facts and Morrovia's door-to-door planning allowance. It is not a live timetable or navigable route.",
    "Compare the saved mode with realistic alternatives, then review the time and stop-order impact before approving a change.",
    "Use the door-to-door figure as the planning impact. The shorter headline time, when available, covers only the main transport portion.",
  ] as const;
  if (scope === "selected-stop") return [
    "Start with one place that defines why you chose this stop, then keep the rest geographically coherent.",
    "Open the local finder when you want mapped options. Check current opening or availability before relying on one.",
    "Compare the stay length with arrival and departure impact. Morrovia can propose a change, but it will not alter the stop silently.",
  ] as const;
  if (scope === "selected-place") return [
    "Use this as one anchor, then pair it with nearby time instead of adding unrelated stops across the city.",
    "The local finder can surface mapped options around the selected location without claiming live availability unless a provider confirms it.",
    "Check current hours, access and booking requirements at the linked source before locking it into the day.",
  ] as const;
  return [
    "Keep the most important activity and protect one open block. Any change remains a proposal until you review and approve it.",
    "This day combines the saved activities and transfer impact. It is a flexible plan, not a live timetable.",
    "Use the local finder for mapped options around this stop, then save only the one that fits today's pace.",
  ] as const;
}
