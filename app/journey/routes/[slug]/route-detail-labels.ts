import type { PublicRouteConnection } from "../../../../lib/easyt/public-route.ts";

export function transferStatus(connection: PublicRouteConnection) {
  if (connection.mode === null) return "Unknown transfer";
  if (connection.planningMinutes === null || connection.confidence === "needs-review" || connection.confidence === "unknown") return `${connection.modeLabel} · details to confirm`;
  return `${connection.modeLabel} · planning estimate`;
}

export function nightLabel(value: number) { return `${value} ${value === 1 ? "night" : "nights"}`; }
