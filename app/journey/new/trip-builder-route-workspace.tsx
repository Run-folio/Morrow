"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, GripVertical, Map as MapIcon, MoreHorizontal, Route } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import TripTransportChoiceControl from "@/components/easyt/trip-transport-choice-control";
import { MorroviaSectionStatus } from "@/components/easyt/morrovia-loading-states";
import type { JourneyStop } from "@/lib/journey";
import { formatMapDuration, mapRouteLegsFromTrip } from "@/lib/easyt/map-spatial-context";
import { buildBuilderRoutePreview } from "@/lib/easyt/trip-builder-route-preview";
import { transferJourneyModeLabel } from "@/lib/easyt/transfer-journey";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { effectiveTripLeg, tripWithEffectiveTransportChoices } from "@/lib/easyt/transport-mode-choice";
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
  nightStatus: { total: number; allocated: number; complete: boolean; language: "en" | "es" };
  onSelectStop: (stopId: string) => void;
  onPreviewOrder: (stopIds: readonly string[] | null) => void;
  onCommitOrder: (stopIds: readonly string[], source: BuilderOrderSource) => boolean;
  onEditNights: (stopId: string, nights: number) => void;
  onTransportChoiceChange: (legId: string, identity: string | null) => void;
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
  nightStatus,
  onSelectStop,
  onPreviewOrder,
  onCommitOrder,
  onEditNights,
  onTransportChoiceChange,
}: TripBuilderRouteWorkspaceProps) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const [mapLifecycle, setMapLifecycle] = useState<"loading" | "ready" | "unavailable">("loading");
  const [JourneyPlannerMap, setJourneyPlannerMap] = useState<typeof import("@/components/journey-planner-map").JourneyPlannerMap | null>(null);
  useEffect(() => {
    let active = true;
    import("@/components/journey-planner-map").then(module => {
      if (active) setJourneyPlannerMap(() => module.JourneyPlannerMap);
    }).catch(() => {
      if (active) setMapLifecycle("unavailable");
    });
    return () => { active = false; };
  }, []);
  const preview = previewStopIds ? buildBuilderRoutePreview(canonicalTrip, previewStopIds) : null;
  const recommendedTrip = preview?.ok ? preview.trip : canonicalTrip;
  const presentedTrip = tripWithEffectiveTransportChoices(recommendedTrip);
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
        <p>ROUTE PLAN</p>
        <h2 id="builder-route-title">Your route<span className="sr-only"> — Nights per stop</span></h2>
        <span className={`${styles.builderRouteNightStatus} ${nightStatus.complete ? "" : styles.builderRouteNightStatusIncomplete}`} role="status">
          {nightStatus.complete ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
          <strong>{nightStatus.total} {nightStatus.language === "es" ? "en total" : "total"}</strong>
          <span aria-hidden="true">·</span>
          <b>{nightStatus.complete
            ? (nightStatus.language === "es" ? "Todas asignadas" : "All allocated")
            : (nightStatus.language === "es" ? `${nightStatus.allocated} de ${nightStatus.total} asignadas` : `${nightStatus.allocated} of ${nightStatus.total} allocated`)}</b>
        </span>
      </div>
    </header>

    <div className={styles.builderRouteGrid}>
      <section className={styles.builderRouteRows} aria-label="Route stops" role="table">
        <div className={styles.builderRouteColumns} role="row">
          <span role="columnheader">Stop</span><span role="columnheader">Transfer</span><span role="columnheader">Nights</span><span role="columnheader">Usable time</span>
        </div>
        <div role="rowgroup">
          {presentedTrip.stops.map((stop, index) => {
            const recommendedLeg = recommendedTrip.legs.find((candidate) => candidate.toStopId === stop.id) ?? null;
            const leg = recommendedLeg ? effectiveTripLeg(recommendedTrip, recommendedLeg) : null;
            const transferMinutes = leg?.doorToDoorMinutes ?? leg?.durationMinutes ?? null;
            const usableDays = usableTime(stop.nights ?? 0, transferMinutes);
            const isLocked = fixedOrder || locked.has(stop.id);
            const isSelected = selectedStopId === stop.id;
            const isDragging = reorder.draggingId === stop.id;
            const isDropTarget = Boolean(reorder.previewIds && reorder.draggingId === stop.id);
            return <div
              key={stop.id}
              data-builder-stop-index={index}
              ref={(node) => { if (node) rowRefs.current.set(stop.id, node); else rowRefs.current.delete(stop.id); }}
              role="row"
              tabIndex={isSelected ? 0 : -1}
              aria-selected={isSelected}
              className={`${styles.builderRouteRow} ${isSelected ? styles.builderRouteRowSelected : ""} ${isDragging ? styles.builderRouteRowDragging : ""} ${isDropTarget ? styles.builderRouteDropTarget : ""}`}
              onClick={() => selectStop(stop.id)}
              onDragEnter={(event) => { event.preventDefault(); reorder.previewActiveAt(index); }}
              onDragOver={(event) => { event.preventDefault(); reorder.previewActiveAt(index); }}
              onDrop={(event) => { event.preventDefault(); reorder.drop(); }}
            >
              {/* morrovia-ui-audit-allow-next-line native-control -- The drag grip owns native draggable pointer and keyboard semantics rather than a standard push-button action. */}
              <button type="button" className={styles.builderRouteGrip} aria-label={`Reorder ${stop.name}, stop ${index + 1}`} disabled={isLocked} {...reorder.gripProps(stop.id)}>
                <GripVertical aria-hidden="true" />
              </button>
              <div className={styles.builderRouteIdentity} role="cell"><b>{index + 1}</b><span><strong>{stop.name}</strong><small>{stop.country}</small></span></div>
              <div className={styles.builderRouteTransfer} role="cell">
                <Route aria-hidden="true" />
                <span><strong>{leg ? `${leg.fromEndpoint?.name ? `From ${leg.fromEndpoint.name} · ` : ""}${transferJourneyModeLabel(leg)}` : index === 0 ? "Starts here" : "Transfer to confirm"}</strong><small>{leg ? formatMapDuration(transferMinutes) : "No arrival transfer"}</small>
                  {recommendedLeg && !preview?.ok ? <span onClick={(event) => event.stopPropagation()}>
                    <TripTransportChoiceControl
                      trip={canonicalTrip}
                      leg={recommendedLeg}
                      onChange={(identity) => onTransportChoiceChange(recommendedLeg.id, identity)}
                    />
                  </span> : null}
                </span>
              </div>
              <div className={styles.builderRouteNights} role="cell">
                <span className={styles.mobileFieldLabel}>Nights</span>
                {/* morrovia-ui-audit-allow-next-line native-control -- This compact stepper button is part of a labelled nights field and cannot use the shared action-button dimensions. */}
                <button type="button" aria-label={`Remove one night from ${stop.name}; ${stop.nights ?? 0} nights currently`} disabled={isLocked || (stop.nights ?? 0) <= 0} onClick={(event) => { event.stopPropagation(); onEditNights(stop.id, (stop.nights ?? 0) - 1); }}>−</button>
                <strong>{stop.nights ?? 0}</strong>
                {/* morrovia-ui-audit-allow-next-line native-control -- This compact stepper button is part of a labelled nights field and cannot use the shared action-button dimensions. */}
                <button type="button" aria-label={`Add one night to ${stop.name}; ${stop.nights ?? 0} nights currently`} disabled={isLocked} onClick={(event) => { event.stopPropagation(); onEditNights(stop.id, (stop.nights ?? 0) + 1); }}>+</button>
              </div>
              <div className={styles.builderRouteUsable} role="cell">
                <span className={styles.mobileFieldLabel}>Usable time</span>
                <strong>{usableDays === null ? "To confirm" : `~${usableDays} ${usableDays === 1 ? "day" : "days"}`}</strong>
                {usableDays !== null && usableDays < 1 ? <AlertTriangle aria-label="Compressed stop" /> : null}
              </div>
              <details className={styles.builderRouteActions} onClick={(event) => event.stopPropagation()}>
                <summary aria-label={`Actions for ${stop.name}`}><MoreHorizontal aria-hidden="true" /></summary>
                <div>
                  <strong>Move stop</strong>
                  {/* morrovia-ui-audit-allow-next-line native-control -- The accessible reorder fallback is a menu item whose compact row semantics differ from a standard action button. */}
                  <button type="button" disabled={isLocked || index === 0} onClick={() => reorder.moveFromMenu(stop.id, index - 1)}>Earlier</button>
                  {/* morrovia-ui-audit-allow-next-line native-control -- The accessible reorder fallback is a menu item whose compact row semantics differ from a standard action button. */}
                  <button type="button" disabled={isLocked || index === presentedTrip.stops.length - 1} onClick={() => reorder.moveFromMenu(stop.id, index + 1)}>Later</button>
                </div>
              </details>
            </div>;
          })}
        </div>
      </section>

      <section className={styles.builderRouteMap} aria-label="Route map" data-map-lifecycle={mapLifecycle}>
        {/* morrovia-ui-audit-allow-next-line native-control -- This mobile disclosure owns aria-expanded and the embedded map region rather than a standard push-button action. */}
        <button type="button" className={styles.builderRouteMapToggle} aria-expanded={!mapCollapsed} onClick={() => setMapCollapsed((current) => !current)}>
          <MapIcon aria-hidden="true" />
          {mapCollapsed ? "Show map" : "Collapse map"}
          {mapCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </button>
        <div className={styles.builderRouteMapBody} hidden={mapCollapsed}>
          {mapLifecycle === "unavailable" ? <div className={styles.builderRouteMapFallback} role="status">
            <MapIcon aria-hidden="true" />
            <strong>Route map unavailable</strong>
            <span>The route list still works, and you can continue building your trip.</span>
          </div> : JourneyPlannerMap ? <JourneyPlannerMap
            stops={mapStops}
            legs={mapLegs}
            comparisonLegs={comparisonLegs}
            comparisonLabel={routeCheckProposal?.ok ? "Morrovia's proposed route order" : undefined}
            onLifecycleChange={setMapLifecycle}
            selectedId={selectedStopId ?? presentedTrip.stops[0]?.id ?? ""}
            plannerPins={[]}
            focusCoordinates={null}
            draftPinCoordinates={null}
            pinPlacementMode={false}
            overviewMode
            surface={{ variant: "embedded", interaction: "selection-only" }}
            cameraSafeEdge={54}
            onMapPinDrop={() => undefined}
            onPlannerPinSelect={() => undefined}
            onSelect={(stopId) => selectStop(stopId, true)}
          /> : <MorroviaSectionStatus compact title="Opening route map" detail="The route list remains available." />}
        </div>
      </section>
    </div>

    <p className="sr-only" aria-live="polite">{reorder.draggingId ? `Moving stop ${reorder.draggingId}` : ""}</p>
  </section>;
}
