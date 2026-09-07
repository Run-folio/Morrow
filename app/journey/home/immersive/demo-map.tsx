"use client";

import { useMemo } from "react";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import type { JourneyStop, JourneyLeg } from "@/lib/journey";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import styles from "./immersive.module.css";
import overviewStyles from "@/components/easyt/trip-overview-workspace.module.css";

export default function DemoMap({ route, selected, nights, onSelect }: { route: ImmersiveRoute; selected: number; nights: number[]; onSelect: (index: number) => void }) {
  const stops = useMemo((): JourneyStop[] => route.stops.map((stop, index) => ({ id: stop.id, city: stop.name, country: stop.country, date: `${nights[index]} nights`, coordinates: stop.coordinates, theme: "city", marker: "town", description: stop.reason, highlights: [], aiPrompt: "" })), [route, nights]);
  const legs = useMemo((): JourneyLeg[] => route.stops.slice(0, -1).map((stop, index) => ({ from: stop.id, to: route.stops[index + 1].id, mode: "unknown", label: "Approximate connection", detail: stop.onward?.note ?? "Transport to confirm" })), [route]);
  return <div className={styles.mapCanvas}><div className={overviewStyles.routeMapPreview}><JourneyPlannerMap stops={stops} legs={legs} selectedId={stops[selected].id} plannerPins={[]} focusCoordinates={null} draftPinCoordinates={null} pinPlacementMode={false} overviewMode previewMode overviewPadding={{ top: 60, right: 60, bottom: 60, left: 60 }} onMapPinDrop={() => undefined} onPlannerPinSelect={() => undefined} onSelect={(id) => { const index = route.stops.findIndex((stop) => stop.id === id); if (index >= 0) onSelect(index); }} /></div><p className={styles.mapCaption}>Illustrative connections · transport and return leg to confirm</p></div>;
}
