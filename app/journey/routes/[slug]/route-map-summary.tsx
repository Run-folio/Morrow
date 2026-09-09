"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, MoonStar, Route } from "lucide-react";
import { EasyTButton, EasyTSelect } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import type { PublicRouteStop } from "@/lib/easyt/public-route";
import type { RouteNightGuide } from "./route-detail-presentation";
import { transferStatus, nightLabel } from "./route-detail-labels";
import { routeMapSelectionFromHash, validRouteSelection, type RouteMapSelection } from "./route-map-selection";
import RouteLiveMap from "./route-live-map";
import styles from "./route-overview.module.css";

export default function RouteMapSummary({ title, stops, countries, nights, durationDays, totalNights, character, rationale, warning, initialSelection = null }: {
  title: string; stops: PublicRouteStop[]; countries: string[]; nights: RouteNightGuide[]; durationDays: number; totalNights: number;
  character: string; rationale?: string; warning?: string; initialSelection?: RouteMapSelection;
}) {
  const [selected, setSelected] = useState<RouteMapSelection>(() => validRouteSelection(initialSelection, stops.length));
  const [reset, setReset] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const followAnchor = () => {
      if (!/^#route-map(?:$|-)/.test(location.hash)) return;
      setSelected(routeMapSelectionFromHash(location.hash, stops.length));
      // Native links retain a no-JS destination. Hydrated links converge on the
      // map heading, not a control far down the side list. No scroll animation.
      const section = root.current?.closest<HTMLElement>("section");
      section?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
      section?.scrollIntoView({ block: "start", behavior: "instant" });
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
  }, [stops.length]);
  const stop = selected?.type === "stop" ? stops[selected.index] : null;
  const connection = selected?.type === "connection" ? stops[selected.index]?.onward : null;
  const guide = selected?.type === "stop" ? nights[selected.index] : null;
  const selectionValue = selected ? `${selected.type}:${selected.index}` : "whole";
  const changeSelection = (value: string) => {
    if (value === "whole") { setSelected(null); setReset(current => current + 1); return; }
    const [type, index] = value.split(":");
    setSelected({ type: type as "stop" | "connection", index: Number(index) });
  };
  return <div ref={root}>
    <div className={styles.mapToolbar}><span>{countries.join(" → ")}</span><EasyTButton variant="secondary" icon={Route} onClick={() => changeSelection("whole")}>Whole route</EasyTButton></div>
    <div className={styles.mapLayout}>
      <RouteLiveMap title={title} stops={stops} className={styles.liveRouteMap} selected={selected} onSelect={setSelected} resetVersion={reset} />
      <aside className={styles.mapDetail} aria-label="Route map details">
        <div className={styles.mapContext} aria-live="polite" aria-atomic="true">
          <p className={styles.eyebrow}>{stop ? `${stop.country} · Stop ${selected!.index + 1}` : connection ? "Connection context" : "The whole route"}</p>
          <h3>{stop?.name ?? (connection ? `${connection.from} → ${connection.to}` : `${stops[0]?.name} to ${stops.at(-1)?.name}`)}</h3>
          {stop && <><p>{stop.reason}</p>{guide?.minimum != null && <p className={styles.minimum}><MoonStar aria-hidden="true" />Minimum {nightLabel(guide.minimum)}</p>}{guide?.recommended != null && <p>Reviewed guidance: {nightLabel(guide.recommended)}</p>}</>}
          {connection && <><p>{connection.note}</p><MorroviaStatusBanner tone={connection.planningMinutes === null || connection.confidence === "needs-review" ? "warning" : "info"} title={transferStatus(connection)} detail={connection.planningMinutes === null ? "No reviewed duration. Confirm the connection before booking." : `${connection.durationLabel}. A planning allowance, not a verified schedule.`} /></>}
          {!stop && !connection && <><p>{rationale ?? `${stops.length} bases connect ${stops[0]?.name} with ${stops.at(-1)?.name}.`}</p><dl className={styles.mapFacts}>
            <div><dt>Shape</dt><dd>{stops.length} bases</dd></div><div><dt>Example</dt><dd>{durationDays} days · {totalNights} nights</dd></div><div><dt>Character</dt><dd>{character}</dd></div>
          </dl>{warning && <MorroviaStatusBanner tone="warning" title="Check before booking" detail={warning} />}</>}
        </div>
        {stop?.onward && <EasyTButton variant="quiet" icon={ArrowRight} onClick={() => setSelected({ type: "connection", index: selected!.index })}>Next: {stop.onward.to}</EasyTButton>}
        <EasyTSelect label="Explore the map" value={selectionValue} onChange={(event) => changeSelection(event.target.value)}>
          <option value="whole">Whole route</option>
          {stops.flatMap((item, index) => [
            <option key={`stop-${item.id}`} value={`stop:${index}`}>{String(index + 1).padStart(2, "0")} · {item.name}, {item.country}</option>,
            item.onward ? <option key={`connection-${item.id}`} value={`connection:${index}`}>{item.name} → {item.onward.to} · {transferStatus(item.onward)}</option> : null,
          ])}
        </EasyTSelect>
        {stops.map((item, index) => <span className={styles.srOnly} id={`route-map-stop-${index}`} key={`anchor-stop-${item.id}`}>{item.name}</span>)}
        {stops.slice(0, -1).map((item, index) => <span className={styles.srOnly} id={`route-map-connection-${index}`} key={`anchor-connection-${item.id}`}>{item.name} to {item.onward?.to}</span>)}
      </aside>
    </div>
  </div>;
}
