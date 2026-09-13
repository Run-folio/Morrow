"use client";

import Link from "next/link";
import { ChevronRight, Maximize2, Minimize2, MoreHorizontal, Plus, Route } from "lucide-react";
import { useEffect, useRef, type ReactNode, type Ref } from "react";
import ResilientImage from "@/components/easyt/resilient-image";
import MorroviaBrandLogo from "@/components/morrovia-brand-logo";
import type { RouteTimelineStop } from "@/lib/easyt/route-timeline";
import styles from "./journey-planner-strip.module.css";

export type JourneyPlannerStripStop = RouteTimelineStop;

export function JourneyStopNavigation({
  stops,
  onSelectStop,
  ariaLabel = "Trip stops",
  trailing,
}: {
  stops: JourneyPlannerStripStop[];
  onSelectStop: (id: string) => void;
  ariaLabel?: string;
  trailing?: ReactNode;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const activeId = stops.find((stop) => stop.active)?.id;

  useEffect(() => {
    const active = activeRef.current;
    if (!active) return;
    const frame = window.requestAnimationFrame(() => active.scrollIntoView?.({ block: "nearest", inline: "nearest" }));
    return () => window.cancelAnimationFrame(frame);
  }, [activeId]);

  return <nav className={styles.stopTrack} aria-label={ariaLabel} data-route-stop-navigation>
    {stops.map((stop, index) => (
      <div className={styles.stopGroup} key={stop.id}>
        <button
          ref={stop.active ? activeRef : undefined}
          type="button"
          className={`${styles.stop} ${stop.active ? styles.stopActive : ""}`}
          aria-current={stop.active ? (stop.kind === "origin" ? "page" : "step") : undefined}
          aria-pressed={stop.active}
          onClick={() => onSelectStop(stop.id)}
        >
          <ResilientImage
            src={stop.image}
            alt=""
            fallback={<span className={`${styles.stopIndex} ${stop.kind === "origin" ? styles.originIndex : ""}`}>{stop.kind === "origin" ? "All" : stops.slice(0, index + 1).filter((item) => item.kind !== "origin").length}</span>}
          />
          <span><strong>{stop.name}</strong><small>{stop.dayLabel}</small></span>
        </button>
        {index < stops.length - 1 ? <ChevronRight className={styles.connector} aria-hidden="true" /> : null}
      </div>
    ))}
    {trailing}
  </nav>;
}

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
      {presentation === "focused" ? <Link className={styles.brand} href="/" aria-label="Morrovia home">
        <MorroviaBrandLogo variant="full" size="compact" decorative />
      </Link> : null}

      {presentation === "focused" ? <div className={styles.tripSummary}>
        <strong>Your trip</strong>
        <span>{summary}</span>
      </div> : null}

      <JourneyStopNavigation
        stops={stops}
        onSelectStop={onSelectStop}
        trailing={<Link className={styles.addStop} href={addStopHref}><Plus aria-hidden="true" />Add stop</Link>}
      />

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
