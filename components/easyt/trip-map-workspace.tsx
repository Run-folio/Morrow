"use client";

import { JourneyMapPlannerWorkspace, type JourneyMapPlannerWorkspaceProps } from "@/components/journey-map-planner-workspace";
import type { EasyTTrip } from "@/lib/easyt/trip";
import styles from "./trip-map-workspace.module.css";

/**
 * TripShell presentation of the production Map planner. The feature state,
 * persistence and interactions remain owned by JourneyMapPlannerWorkspace.
 */
export default function TripMapWorkspace({ trip, storyState }: { trip: EasyTTrip; storyState?: JourneyMapPlannerWorkspaceProps["storyState"] }) {
  return <div className={styles.wideMap}><JourneyMapPlannerWorkspace trip={trip} presentation="shell" storyState={storyState} /></div>;
}
