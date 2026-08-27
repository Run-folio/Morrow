"use client";

import Link from "next/link";
import { ChevronRight, Maximize2, Minimize2, MoreHorizontal, Plus } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./journey-planner-strip.module.css";

export type JourneyPlannerStripStop = {
  id: string;
  name: string;
  dayLabel: string;
  image?: string;
  active: boolean;
};

export function JourneyPlannerStrip({
  summary,
  stops,
  addStopHref,
  fullTripHref,
  fullTripLabel = "View full trip",
  fullTripExpanded = false,
  onFullTrip,
  onSelectStop,
  overflow,
  presentation = "focused",
}: {
  summary: string;
  stops: JourneyPlannerStripStop[];
  addStopHref: string;
  fullTripHref?: string;
  fullTripLabel?: string;
  fullTripExpanded?: boolean;
  onFullTrip?: () => void;
  onSelectStop: (id: string) => void;
  overflow: ReactNode;
  presentation?: "focused" | "integrated";
}) {
  return (
    <header className={`${styles.strip} ${presentation === "integrated" ? styles.integrated : ""}`}>
      {presentation === "focused" ? <Link className={styles.brand} href="/journey/home" aria-label="Morrovia home">
        Morrovia
      </Link> : null}

      {presentation === "focused" ? <div className={styles.tripSummary}>
        <strong>Your trip</strong>
        <span>{summary}</span>
      </div> : null}

      <nav className={styles.stopTrack} aria-label="Trip stops">
        {stops.map((stop, index) => (
          <div className={styles.stopGroup} key={stop.id}>
            <button
              type="button"
              className={`${styles.stop} ${stop.active ? styles.stopActive : ""}`}
              aria-current={stop.active ? "step" : undefined}
              onClick={() => onSelectStop(stop.id)}
            >
              {stop.image ? <img src={stop.image} alt="" /> : <span className={styles.stopIndex}>{index + 1}</span>}
              <span><strong>{stop.name}</strong><small>{stop.dayLabel}</small></span>
            </button>
            {index < stops.length - 1 ? <ChevronRight className={styles.connector} aria-hidden="true" /> : null}
          </div>
        ))}
        <Link className={styles.addStop} href={addStopHref}><Plus aria-hidden="true" />Add stop</Link>
      </nav>

      <div className={styles.actions}>
        {onFullTrip ? <button data-map-expand-control type="button" className={styles.fullTrip} onClick={onFullTrip} aria-pressed={fullTripExpanded} title={fullTripLabel}>{fullTripExpanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}{fullTripLabel}</button> : fullTripHref ? <Link className={styles.fullTrip} href={fullTripHref}>{fullTripLabel}</Link> : null}
        <details className={styles.overflow}>
          <summary aria-label="Trip actions"><MoreHorizontal aria-hidden="true" /></summary>
          <div>{overflow}</div>
        </details>
      </div>
    </header>
  );
}
