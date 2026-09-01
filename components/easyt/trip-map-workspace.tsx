"use client";

import { JourneyMapPlannerWorkspace, type JourneyMapPlannerWorkspaceProps } from "@/components/journey-map-planner-workspace";
import type { EasyTTrip } from "@/lib/easyt/trip";
import styles from "./trip-map-workspace.module.css";

/**
 * TripShell presentation of the production Map planner. The feature state,
 * persistence and interactions remain owned by JourneyMapPlannerWorkspace.
 */
export default function TripMapWorkspace({ trip, storyState, activityAction }: { trip: EasyTTrip; storyState?: JourneyMapPlannerWorkspaceProps["storyState"]; activityAction?: JourneyMapPlannerWorkspaceProps["activityAction"] }) {
  return <div className={styles.wideMap}><JourneyMapPlannerWorkspace trip={trip} presentation="shell" storyState={storyState} activityAction={activityAction} /></div>;
}
