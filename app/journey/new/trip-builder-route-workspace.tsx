"use client";

import { AlertTriangle, GripVertical, MoreHorizontal, Plus, Route, Sparkles } from "lucide-react";
import { useMemo, useRef } from "react";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import type { JourneyStop } from "@/lib/journey";
import { formatMapDuration, mapRouteLegsFromTrip } from "@/lib/easyt/map-spatial-context";
import { buildBuilderRoutePreview } from "@/lib/easyt/trip-builder-route-preview";
import { transferJourneyModeLabel } from "@/lib/easyt/transfer-journey";
import type { EasyTTrip } from "@/lib/easyt/trip";
import styles from "./trip-builder.module.css";
import { useBuilderStopReorder } from "./use-builder-stop-reorder";

export type BuilderOrderSource = "drag" | "move-menu" | "route-check";

export type TripBuilderRouteWorkspaceProps = {
  canonicalTrip: EasyTTrip;
  previewStopIds: readonly string[] | null;
  selectedStopId: string | null;
  lockedStopIds: readonly string[];
  fixedOrder: boolean;
  routeCheckProposalStopIds: readonly string[] | null;
  onSelectStop: (stopId: string) => void;
  onPreviewOrder: (stopIds: readonly string[] | null) => void;
  onCommitOrder: (stopIds: readonly string[], source: BuilderOrderSource) => boolean;
  onEditNights: (stopId: string, nights: number) => void;
  onAddStop: () => void;
  onOpenRouteCheck: () => void;
  onDismissRouteCheck: () => void;
  onRouteCheckApplied: () => void;
};

function mapStop(stop: EasyTTrip["stops"][number]): JourneyStop {
  return {
    id: stop.id,
    city: stop.name,
    country: stop.country,
    date: [stop.arrivalDate, stop.departureDate].filter(Boolean).join(" – "),
    coordinates: stop.longitude === null || stop.latitude === null ? null : [stop.longitude, stop.latitude],
    theme: "city",
    marker: "town",
    description: `${stop.nights ?? 0} ${(stop.nights ?? 0) === 1 ? "night" : "nights"}`,
    highlights: [],
    aiPrompt: "",
  };
}

function usableTime(nights: number, transferMinutes: number | null) {
  if (transferMinutes === null) return null;
  const transferDays = transferMinutes >= 480 ? 1 : transferMinutes >= 240 ? .5 : transferMinutes >= 120 ? .25 : 0;
  return Math.max(0, Math.round((nights - transferDays) * 4) / 4);
}

export function TripBuilderRouteWorkspace({
  canonicalTrip,
  previewStopIds,
  selectedStopId,
  lockedStopIds,
  fixedOrder,
  routeCheckProposalStopIds,
  onSelectStop,
  onPreviewOrder,
  onCommitOrder,
  onEditNights,
  onAddStop,
  onOpenRouteCheck,
  onDismissRouteCheck,
  onRouteCheckApplied,
}: TripBuilderRouteWorkspaceProps) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const preview = previewStopIds ? buildBuilderRoutePreview(canonicalTrip, previewStopIds) : null;
  const presentedTrip = preview?.ok ? preview.trip : canonicalTrip;
  const mapStops = useMemo(() => presentedTrip.stops.map(mapStop), [presentedTrip.stops]);
  const mapLegs = useMemo(() => mapRouteLegsFromTrip(presentedTrip), [presentedTrip]);
  const routeCheckProposal = useMemo(() => routeCheckProposalStopIds ? buildBuilderRoutePreview(canonicalTrip, routeCheckProposalStopIds) : null, [canonicalTrip, routeCheckProposalStopIds]);
  const comparisonLegs = useMemo(() => routeCheckProposal?.ok ? mapRouteLegsFromTrip(routeCheckProposal.trip) : [], [routeCheckProposal]);
  const locked = useMemo(() => new Set(lockedStopIds), [lockedStopIds]);
  const stopIds = useMemo(() => canonicalTrip.stops.map((stop) => stop.id), [canonicalTrip.stops]);
  const reorder = useBuilderStopReorder({
    stopIds,
    lockedStopIds,
    fixedOrder,
    onPreview: onPreviewOrder,
    onCommit: onCommitOrder,
  });

  const selectStop = (stopId: string, reveal = false) => {
    onSelectStop(stopId);
    if (reveal) rowRefs.current.get(stopId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  return <section data-builder-route-workspace className={styles.builderRouteWorkspace} aria-labelledby="builder-route-title">
    <header className={styles.builderRouteHeader}>
      <div>
        <p>YOUR ROUTE</p>
        <h2 id="builder-route-title">Shape the route<span className="sr-only"> — Nights per stop</span></h2>
        <span>Reorder stops, adjust the nights, and check how travel affects your time.</span>
      </div>
      <EasyTButton size="small" variant="secondary" icon={Plus} onClick={onAddStop}>Add stop</EasyTButton>
    </header>

    <div className={styles.builderRouteGrid}>
      <section className={styles.builderRouteRows} aria-label="Route stops" role="table">
        <div className={styles.builderRouteColumns} role="row">
          <span role="columnheader">Stop</span><span role="columnheader">Transfer</span><span role="columnheader">Nights</span><span role="columnheader">Usable time</span>
        </div>
        <div role="rowgroup">
          {presentedTrip.stops.map((stop, index) => {
            const leg = presentedTrip.legs.find((candidate) => candidate.toStopId === stop.id) ?? null;
            const transferMinutes = leg?.doorToDoorMinutes ?? leg?.durationMinutes ?? null;
            const usableDays = usableTime(stop.nights ?? 0, transferMinutes);
            const isLocked = fixedOrder || locked.has(stop.id);
            const isSelected = selectedStopId === stop.id;
            return <div
              key={stop.id}
              data-builder-stop-index={index}
              ref={(node) => { if (node) rowRefs.current.set(stop.id, node); else rowRefs.current.delete(stop.id); }}
              role="row"
              tabIndex={isSelected ? 0 : -1}
              aria-selected={isSelected}
              className={`${styles.builderRouteRow} ${isSelected ? styles.builderRouteRowSelected : ""}`}
              onClick={() => selectStop(stop.id)}
              onDragOver={(event) => { event.preventDefault(); reorder.previewAt(reorder.draggingId ?? "", index); }}
              onDrop={(event) => { event.preventDefault(); reorder.drop(); }}
            >
              <button type="button" className={styles.builderRouteGrip} aria-label={`Reorder ${stop.name}, stop ${index + 1}`} disabled={isLocked} {...reorder.gripProps(stop.id)}>
                <GripVertical aria-hidden="true" />
              </button>
              <div className={styles.builderRouteIdentity} role="cell"><b>{index + 1}</b><span><strong>{stop.name}</strong><small>{stop.country}</small></span></div>
              <div className={styles.builderRouteTransfer} role="cell">
                <Route aria-hidden="true" />
                <span><strong>{leg ? `${leg.fromEndpoint?.name ? `From ${leg.fromEndpoint.name} · ` : ""}${transferJourneyModeLabel(leg)}` : index === 0 ? "Starts here" : "Transfer to confirm"}</strong><small>{leg ? formatMapDuration(transferMinutes) : "No arrival transfer"}</small></span>
              </div>
              <div className={styles.builderRouteNights} role="cell">
                <span className={styles.mobileFieldLabel}>Nights</span>
                <button type="button" aria-label={`Remove one night from ${stop.name}; ${stop.nights ?? 0} nights currently`} disabled={isLocked || (stop.nights ?? 0) <= 0} onClick={(event) => { event.stopPropagation(); onEditNights(stop.id, (stop.nights ?? 0) - 1); }}>−</button>
                <strong>{stop.nights ?? 0}</strong>
                <button type="button" aria-label={`Add one night to ${stop.name}; ${stop.nights ?? 0} nights currently`} disabled={isLocked} onClick={(event) => { event.stopPropagation(); onEditNights(stop.id, (stop.nights ?? 0) + 1); }}>+</button>
              </div>
              <div className={styles.builderRouteUsable} role="cell">
                <span className={styles.mobileFieldLabel}>Usable time</span>
                <strong>{usableDays === null ? "To confirm" : `~${usableDays} ${usableDays === 1 ? "day" : "days"}`}</strong>
                {usableDays !== null && usableDays < 1 ? <AlertTriangle aria-label="Compressed stop" /> : null}
              </div>
              <details className={styles.builderRouteActions} onClick={(event) => event.stopPropagation()}>
                <summary aria-label={`Actions for ${stop.name}`}><MoreHorizontal aria-hidden="true" /></summary>
                <div><strong>Move stop</strong><button type="button" disabled={isLocked || index === 0} onClick={() => reorder.moveFromMenu(stop.id, index - 1)}>Earlier</button><button type="button" disabled={isLocked || index === presentedTrip.stops.length - 1} onClick={() => reorder.moveFromMenu(stop.id, index + 1)}>Later</button></div>
              </details>
            </div>;
          })}
        </div>
      </section>

      <section className={styles.builderRouteMap} aria-label="Route map">
        <JourneyPlannerMap
          stops={mapStops}
          legs={mapLegs}
          comparisonLegs={comparisonLegs}
          comparisonLabel={routeCheckProposal?.ok ? "Morrovia's proposed route order" : undefined}
          selectedId={selectedStopId ?? presentedTrip.stops[0]?.id ?? ""}
          plannerPins={[]}
          focusCoordinates={null}
          draftPinCoordinates={null}
          pinPlacementMode={false}
          overviewMode
          previewMode
          previewLabel="Builder route map"
          overviewPadding={{ top: 54, right: 54, bottom: 54, left: 54 }}
          onMapPinDrop={() => undefined}
          onPlannerPinSelect={() => undefined}
          onSelect={(stopId) => selectStop(stopId, true)}
        />
      </section>
    </div>

    <section className={styles.builderRouteCheck} aria-label="Route Check">
      <div><Sparkles aria-hidden="true" /><span><strong>Route Check</strong><small>{routeCheckProposal?.ok ? routeCheckProposal.trip.stops.map((stop) => stop.name).join(" → ") : "Review the sequence before Morrovia builds the detailed trip."}</small></span></div>
      {routeCheckProposal?.ok ? <div className={styles.builderRouteCheckActions}>
        <EasyTButton size="small" onClick={() => { if (routeCheckProposalStopIds && onCommitOrder(routeCheckProposalStopIds, "route-check")) { onRouteCheckApplied(); onDismissRouteCheck(); } }}>Apply order</EasyTButton>
        <EasyTButton size="small" variant="secondary" onClick={onDismissRouteCheck}>Dismiss</EasyTButton>
      </div> : <EasyTButton size="small" variant="secondary" onClick={onOpenRouteCheck}>Check route</EasyTButton>}
    </section>
    <p className="sr-only" aria-live="polite">{reorder.draggingId ? `Moving stop ${reorder.draggingId}` : ""}</p>
  </section>;
}
