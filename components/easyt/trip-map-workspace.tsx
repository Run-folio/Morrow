"use client";

import { JourneyMapPlannerWorkspace, type JourneyMapPlannerWorkspaceProps } from "@/components/journey-map-planner-workspace";
import { useTripShellMutation } from "@/components/easyt/trip-shell-client";
import type { EasyTTrip } from "@/lib/easyt/trip";
import styles from "./trip-map-workspace.module.css";

/**
 * TripShell presentation of the production Map planner. Map interaction state
 * remains local; canonical EasyTTrip mutations use the shell's shared owner.
 */
export default function TripMapWorkspace({ trip, storyState, activityAction }: { trip: EasyTTrip; storyState?: JourneyMapPlannerWorkspaceProps["storyState"]; activityAction?: JourneyMapPlannerWorkspaceProps["activityAction"] }) {
  const canonicalMutation = useTripShellMutation();
  return <div className={styles.wideMap}><JourneyMapPlannerWorkspace trip={trip} presentation="shell" canonicalMutation={canonicalMutation} storyState={storyState} activityAction={activityAction} /></div>;
}
