import type { RoadEstimateReference } from "./trip.ts";

function durationLabel(minutes: number, language: "en" | "es") {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (language === "es") return hours
    ? `${hours} h${remainder ? ` ${remainder} min` : ""}`
    : `${remainder} min`;
  return hours
    ? `${hours}h${remainder ? ` ${remainder}m` : ""}`
    : `${remainder}m`;
}

/** A routed driving reference is never phrased as the selected transfer. */
export function formatRoadEstimateReference(estimate: RoadEstimateReference, language: "en" | "es" = "en") {
  const distance = Math.round(estimate.distanceKm).toLocaleString(language === "es" ? "es" : "en-GB");
  const duration = durationLabel(estimate.durationMinutes, language);
  return language === "es"
    ? `Estimación por carretera · ${distance} km · aprox. ${duration}`
    : `Road estimate only · ${distance} km · about ${duration} driving`;
}
