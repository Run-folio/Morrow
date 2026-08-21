"use client";

import Link from "next/link";
import { ChevronRight, MoreHorizontal, Plus } from "lucide-react";
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
  onSelectStop,
  overflow,
}: {
  summary: string;
  stops: JourneyPlannerStripStop[];
  addStopHref: string;
  fullTripHref: string;
  onSelectStop: (id: string) => void;
  overflow: ReactNode;
}) {
  return (
    <header className={styles.strip}>
      <Link className={styles.brand} href="/journey/home" aria-label="Morrovia home">
        Morrovia
      </Link>

      <div className={styles.tripSummary}>
        <strong>Your trip</strong>
        <span>{summary}</span>
      </div>

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
        <Link className={styles.fullTrip} href={fullTripHref}>View full trip</Link>
        <details className={styles.overflow}>
          <summary aria-label="Trip actions"><MoreHorizontal aria-hidden="true" /></summary>
          <div>{overflow}</div>
        </details>
      </div>
    </header>
  );
}
