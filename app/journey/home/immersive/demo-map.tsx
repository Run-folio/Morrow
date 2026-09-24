"use client";

import { useMemo, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import type { JourneyStop } from "@/lib/journey";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import type { MapRouteLeg } from "@/lib/easyt/map-spatial-context";
import builder from "@/app/journey/new/trip-builder.module.css";

export default function DemoMap({ route, selected, nights, es }: { route: ImmersiveRoute; selected: number; nights: number[]; es: boolean }) {
  const [lifecycle, setLifecycle] = useState<"loading" | "ready" | "unavailable">("loading");
  const stops = useMemo((): JourneyStop[] => route.stops.map((stop, index) => ({ id: stop.id, city: stop.name, country: stop.country, date: `${nights[index]} ${es ? (nights[index] === 1 ? "noche" : "noches") : (nights[index] === 1 ? "night" : "nights")}`, coordinates: stop.coordinates, theme: "city", marker: "town", description: stop.reason, highlights: [], aiPrompt: "" })), [route, nights, es]);
  const legs = useMemo((): MapRouteLeg[] => route.stops.slice(0, -1).map((stop, index) => {
    const next = route.stops[index + 1];
    const connection = stop.onward;
    const mode: MapRouteLeg["mode"] = connection?.mode === "train" ? "train" : connection?.mode === "flight" ? "flight" : connection?.mode === "ferry" ? "ferry" : connection?.mode ? "road" : "unknown";
    return { id: `${stop.id}-${next.id}`, fromStopId: stop.id, toStopId: next.id, fromName: stop.name, toName: next.name, fromCoordinates: stop.coordinates, toCoordinates: next.coordinates, mode, modeLabel: connection?.modeLabel ?? "Transport to confirm", distanceKm: null, headlineMinutes: connection?.planningMinutes ?? null, doorToDoorMinutes: connection?.planningMinutes ?? null, confidence: null, provenanceLabel: "Published route guidance", scheduleNeedsChecking: connection?.planningMinutes == null, planningNote: connection?.note ?? null, classification: "intercity", warnings: [] };
  }), [route]);
  if (lifecycle === "unavailable") return <div className={builder.builderRouteMapFallback} role="status"><MapIcon aria-hidden="true" /><strong>{es ? "Mapa de la ruta no disponible" : "Route map unavailable"}</strong><span>{es ? "La lista de paradas sigue disponible y puedes explorar este ejemplo." : "The route list still works, and you can continue exploring this sample."}</span></div>;
  return <JourneyPlannerMap stops={stops} legs={legs} selectedId={stops[selected].id} plannerPins={[]} focusCoordinates={null} draftPinCoordinates={null} pinPlacementMode={false} overviewMode surface={{ variant: "preview" }} previewLabel={es ? "Mapa de la ruta del Builder" : "Builder route map"} cameraSafeEdge={54} onLifecycleChange={setLifecycle} onMapPinDrop={() => undefined} onPlannerPinSelect={() => undefined} onSelect={() => undefined} />;
}
