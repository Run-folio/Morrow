"use client";

import Link from "next/link";
import { ChevronRight, Maximize2, Minimize2, MoreHorizontal, Plus, Route } from "lucide-react";
import type { ReactNode, Ref } from "react";
import ResilientImage from "@/components/easyt/resilient-image";
import styles from "./journey-planner-strip.module.css";

export type JourneyPlannerStripStop = {
  id: string;
  name: string;
  dayLabel: string;
  image?: string;
  active: boolean;
  kind?: "origin" | "stop";
};

export function JourneyPlannerStrip({
  summary,
  stops,
  addStopHref,
  fullTripHref,
  fullTripLabel = "View full trip",
  fullTripExpanded = false,
  wholeRouteActive = false,
  onWholeRoute,
  onFullTrip,
  onSelectStop,
  overflow,
  presentation = "focused",
  containerRef,
}: {
  summary: string;
  stops: JourneyPlannerStripStop[];
  addStopHref: string;
  fullTripHref?: string;
  fullTripLabel?: string;
  fullTripExpanded?: boolean;
  wholeRouteActive?: boolean;
  onWholeRoute?: () => void;
  onFullTrip?: () => void;
  onSelectStop: (id: string) => void;
  overflow: ReactNode;
  presentation?: "focused" | "integrated";
  containerRef?: Ref<HTMLElement>;
}) {
  return (
    <header ref={containerRef} className={`${styles.strip} ${presentation === "integrated" ? styles.integrated : ""}`}>
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
              <ResilientImage src={stop.image} alt="" fallback={<span className={`${styles.stopIndex} ${stop.kind === "origin" ? styles.originIndex : ""}`}>{stop.kind === "origin" ? "From" : stops.slice(0, index + 1).filter((item) => item.kind !== "origin").length}</span>} />
              <span><strong>{stop.name}</strong><small>{stop.dayLabel}</small></span>
            </button>
            {index < stops.length - 1 ? <ChevronRight className={styles.connector} aria-hidden="true" /> : null}
          </div>
        ))}
        <Link className={styles.addStop} href={addStopHref}><Plus aria-hidden="true" />Add stop</Link>
      </nav>

      <div className={styles.actions}>
        {onWholeRoute ? <button data-map-route-reset type="button" className={`${styles.fullTrip} ${styles.wholeRoute}`} onClick={onWholeRoute} aria-pressed={wholeRouteActive} title="Fit map to whole route"><Route aria-hidden="true" />Whole route</button> : null}
        {onFullTrip ? <button data-map-expand-control type="button" className={styles.fullTrip} onClick={onFullTrip} aria-pressed={fullTripExpanded} title={fullTripLabel}>{fullTripExpanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}{fullTripLabel}</button> : fullTripHref ? <Link className={styles.fullTrip} href={fullTripHref}>{fullTripLabel}</Link> : null}
        <details className={styles.overflow}>
          <summary aria-label="Trip actions"><MoreHorizontal aria-hidden="true" /></summary>
          <div>{overflow}</div>
        </details>
      </div>
    </header>
  );
}
