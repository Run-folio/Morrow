"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, MoonStar } from "lucide-react";
import { EasyTButton, EasyTSelect } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import type { PublicRouteConnection, PublicRouteStop } from "@/lib/easyt/public-route";
import type { RouteNightGuide } from "./route-detail-presentation";
import { transferStatus, nightLabel } from "./route-detail-labels";
import { editorialConnectionId, routeMapSelectionFromHash, validRouteSelection, type RouteMapSelection } from "./route-map-selection";
import RouteLiveMap from "./route-live-map";
import styles from "./route-overview.module.css";

export type RouteMapSummaryConnection = Omit<PublicRouteConnection, "mode"> & { id?: string; mode: string | null };

export type RouteMapSummaryStop = Omit<PublicRouteStop, "coordinates" | "nights" | "onward"> & {
  coordinates: [number, number] | null;
  nights: number | null;
  onward: RouteMapSummaryConnection | null;
};

export default function RouteMapSummary({ title, stops, countries, nights, durationDays, totalNights, character, rationale, warning, initialSelection = { kind: "route" }, tripFacts = false }: {
  title: string; stops: RouteMapSummaryStop[]; countries: string[]; nights: RouteNightGuide[]; durationDays: number | null; totalNights: number | null;
  character: string; rationale?: string; warning?: string; initialSelection?: RouteMapSelection; tripFacts?: boolean;
}) {
  const [selected, setSelected] = useState<RouteMapSelection>(() => validRouteSelection(initialSelection, stops));
  const [reset, setReset] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const followAnchor = () => {
      if (!/^#route-map(?:$|-)/.test(location.hash)) return;
      setSelected(routeMapSelectionFromHash(location.hash, stops));
      // Native links retain a no-JS destination. Hydrated links converge on the
      // focusable map region so mobile users remain beside the selected detail.
      const mapRegion = root.current?.closest<HTMLElement>("#route-map");
      mapRegion?.focus({ preventScroll: true });
      mapRegion?.scrollIntoView({ block: "start", behavior: "instant" });
    };
    const followLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest("a");
      if (!link || link.origin !== location.origin || link.pathname !== location.pathname || !/^#route-map(?:$|-)/.test(link.hash)) return;
      event.preventDefault();
      history.replaceState(history.state, "", link.hash);
      followAnchor();
    };
    followAnchor();
    document.addEventListener("click", followLink, true);
    window.addEventListener("hashchange", followAnchor);
    return () => { document.removeEventListener("click", followLink, true); window.removeEventListener("hashchange", followAnchor); };
  }, [stops]);
  const stopIndex = selected.kind === "stop" ? stops.findIndex((item) => item.id === selected.stopId) : -1;
  const connectionIndex = selected.kind === "connection" ? stops.findIndex((item, index) => {
    const next = stops[index + 1];
    return Boolean(next && editorialConnectionId(item.id, next.id, item.onward?.id) === selected.connectionId);
  }) : -1;
  const stop = stopIndex >= 0 ? stops[stopIndex] : null;
  const connection = connectionIndex >= 0 ? stops[connectionIndex]?.onward : null;
  const guide = stopIndex >= 0 ? nights[stopIndex] : null;
  const selectionValue = selected.kind === "route" ? "whole" : selected.kind === "stop" ? `stop:${selected.stopId}` : `connection:${selected.connectionId}`;
  const changeSelection = (value: string) => {
    if (value === "whole") { setSelected({ kind: "route" }); setReset(current => current + 1); return; }
    if (value.startsWith("stop:")) setSelected({ kind: "stop", stopId: value.slice(5) });
    if (value.startsWith("connection:")) setSelected({ kind: "connection", connectionId: value.slice(11) });
  };
  return <div ref={root}>
    <div className={styles.mapToolbar}><span>{countries.join(" → ")}</span></div>
    <div className={styles.mapLayout}>
      <RouteLiveMap title={title} stops={stops} className={styles.liveRouteMap} selected={selected} onSelect={setSelected} resetVersion={reset} />
      <aside className={styles.mapDetail} aria-label="Route map details">
        <div className={styles.mapContext} aria-live="polite" aria-atomic="true">
          <p className={styles.eyebrow}>{stop ? `${stop.country} · Stop ${stopIndex + 1}` : connection ? "Connection context" : "The whole route"}</p>
          <h3>{stop?.name ?? (connection ? `${connection.from} → ${connection.to}` : `${stops[0]?.name} to ${stops.at(-1)?.name}`)}</h3>
          {stop && <><p>{stop.reason}</p>{guide?.minimum != null && <p className={styles.minimum}><MoonStar aria-hidden="true" />Minimum {nightLabel(guide.minimum)}</p>}{guide?.recommended != null && <p>Reviewed guidance: {nightLabel(guide.recommended)}</p>}</>}
          {connection && <><p>{connection.note}</p><MorroviaStatusBanner tone={connection.planningMinutes === null || connection.confidence === "needs-review" ? "warning" : "info"} title={transferStatus(connection)} detail={connection.planningMinutes === null ? "No reviewed duration. Confirm the connection before booking." : `${connection.durationLabel}. A planning allowance, not a verified schedule.`} /></>}
          {!stop && !connection && <><p>{rationale ?? `${stops.length} bases connect ${stops[0]?.name} with ${stops.at(-1)?.name}.`}</p><dl className={styles.mapFacts}>
            <div><dt>Shape</dt><dd>{stops.length} bases</dd></div><div><dt>{tripFacts ? "Trip" : "Example"}</dt><dd>{durationDays === null ? "Dates to confirm" : `${durationDays} days`}{totalNights === null ? " · nights to confirm" : ` · ${totalNights} nights`}</dd></div><div><dt>Character</dt><dd>{character}</dd></div>
          </dl>{warning && <MorroviaStatusBanner tone="warning" title="Check before booking" detail={warning} />}</>}
        </div>
        {stop?.onward && stops[stopIndex + 1] && <EasyTButton variant="quiet" icon={ArrowRight} onClick={() => setSelected({ kind: "connection", connectionId: editorialConnectionId(stop.id, stops[stopIndex + 1].id, stop.onward?.id) })}>Next: {stop.onward.to}</EasyTButton>}
        <EasyTSelect label="Explore the map" value={selectionValue} onChange={(event) => changeSelection(event.target.value)}>
          <option value="whole">Whole route</option>
          {stops.flatMap((item, index) => [
            <option key={`stop-${item.id}`} value={`stop:${item.id}`}>{String(index + 1).padStart(2, "0")} · {item.name}, {item.country}</option>,
            item.onward && stops[index + 1] ? <option key={`connection-${item.id}`} value={`connection:${editorialConnectionId(item.id, stops[index + 1].id, item.onward.id)}`}>{item.name} → {item.onward.to} · {transferStatus(item.onward)}</option> : null,
          ])}
        </EasyTSelect>
        {stops.map((item, index) => <span className={styles.srOnly} id={`route-map-stop-${index}`} key={`anchor-stop-${item.id}`}>{item.name}</span>)}
        {stops.slice(0, -1).map((item, index) => <span className={styles.srOnly} id={`route-map-connection-${index}`} key={`anchor-connection-${item.id}`}>{item.name} to {item.onward?.to}</span>)}
      </aside>
    </div>
  </div>;
}
