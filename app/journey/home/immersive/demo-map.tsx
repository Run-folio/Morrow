"use client";

import { useMemo } from "react";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import type { JourneyStop, JourneyLeg } from "@/lib/journey";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";

export default function DemoMap({ route, selected, nights }: { route: ImmersiveRoute; selected: number; nights: number[] }) {
  const stops = useMemo((): JourneyStop[] => route.stops.map((stop, index) => ({ id: stop.id, city: stop.name, country: stop.country, date: `${nights[index]} nights`, coordinates: stop.coordinates, theme: "city", marker: "town", description: stop.reason, highlights: [], aiPrompt: "" })), [route, nights]);
  const legs = useMemo((): JourneyLeg[] => route.stops.slice(0, -1).map((stop, index) => ({ from: stop.id, to: route.stops[index + 1].id, mode: stop.onward?.mode === "train" ? "rail" : stop.onward?.mode === "flight" ? "flight" : stop.onward?.mode === "ferry" ? "ferry" : stop.onward?.mode ? "road" : "unknown", label: stop.onward?.modeLabel ?? "Connection to confirm", detail: stop.onward?.note ?? "Transport to confirm" })), [route]);
  return <JourneyPlannerMap stops={stops} legs={legs} selectedId={stops[selected].id} plannerPins={[]} focusCoordinates={null} draftPinCoordinates={null} pinPlacementMode={false} overviewMode surface={{ variant: "preview" }} previewLabel="Builder route map" cameraSafeEdge={54} onMapPinDrop={() => undefined} onPlannerPinSelect={() => undefined} onSelect={() => undefined} />;
}
