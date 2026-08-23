"use client";

import { JourneyMapPlannerWorkspace } from "@/components/journey-map-planner-workspace";
import type { EasyTTrip } from "@/lib/easyt/trip";
import styles from "./trip-map-workspace.module.css";

/**
 * TripShell presentation of the production Map planner. The feature state,
 * persistence and interactions remain owned by JourneyMapPlannerWorkspace.
 */
export default function TripMapWorkspace({ trip }: { trip: EasyTTrip }) {
  return <div className={styles.wideMap}><JourneyMapPlannerWorkspace trip={trip} presentation="shell" /></div>;
}
