"use client";

import { useMemo } from "react";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import type { JourneyStop, JourneyLeg } from "@/lib/journey";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import { DestinationPhoto } from "./route-chapters";
import styles from "./immersive.module.css";
import overviewStyles from "@/components/easyt/trip-overview-workspace.module.css";

export default function DemoMap({ route, selected, nights, onSelect }: { route: ImmersiveRoute; selected: number; nights: number[]; onSelect: (index: number) => void }) {
  const stops = useMemo((): JourneyStop[] => route.stops.map((stop, index) => ({ id: stop.id, city: stop.name, country: stop.country, date: `${nights[index]} nights`, coordinates: stop.coordinates, theme: "city", marker: "town", description: stop.reason, highlights: [], aiPrompt: "" })), [route, nights]);
  const legs = useMemo((): JourneyLeg[] => route.stops.slice(0, -1).map((stop, index) => ({ from: stop.id, to: route.stops[index + 1].id, mode: stop.onward?.mode === "train" ? "rail" : stop.onward?.mode === "flight" ? "flight" : stop.onward?.mode === "ferry" ? "ferry" : stop.onward?.mode ? "road" : "unknown", label: stop.onward?.modeLabel ?? "Connection to confirm", detail: stop.onward?.note ?? "Transport to confirm" })), [route]);
  return <div className={styles.mapCanvas}><div className={overviewStyles.routeMapPreview}><JourneyPlannerMap stops={stops} legs={legs} selectedId={stops[selected].id} plannerPins={[]} focusCoordinates={null} draftPinCoordinates={null} pinPlacementMode={false} overviewMode previewMode overviewPadding={{ top: 60, right: 60, bottom: 60, left: 60 }} onMapPinDrop={() => undefined} onPlannerPinSelect={() => undefined} onSelect={(id) => { const index = route.stops.findIndex((stop) => stop.id === id); if (index >= 0) onSelect(index); }} /></div><div className={styles.mapPlacePreview}><DestinationPhoto route={route} index={selected} /><div><small>Base {selected + 1} · {route.stops[selected].country}</small><strong>{route.stops[selected].name}</strong><span>{nights[selected]} nights · your overnight base</span>{route.photos[selected] && route.photos[selected]?.place !== route.stops[selected].name && <small>Pictured: {route.photos[selected]?.place}</small>}</div></div><p className={styles.mapCaption}>Base sequence · lines are not exact travel paths</p></div>;
}
