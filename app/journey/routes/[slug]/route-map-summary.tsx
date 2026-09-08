"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, MoonStar, Route } from "lucide-react";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import type { PublicRouteStop } from "@/lib/easyt/public-route";
import type { RouteNightGuide } from "./route-detail-presentation";
import { transferStatus, nightLabel } from "./route-detail-labels";
import { routeMapSelectionFromHash, validRouteSelection, type RouteMapSelection } from "./route-map-selection";
import RouteLiveMap from "./route-live-map";
import styles from "./route-overview.module.css";

export default function RouteMapSummary({ title, stops, countries, nights, initialSelection = null }: {
  title: string; stops: PublicRouteStop[]; countries: string[]; nights: RouteNightGuide[]; initialSelection?: RouteMapSelection;
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
  return <div ref={root}>
    <div className={styles.mapToolbar}><span>{countries.join(" → ")}</span><EasyTButton variant="secondary" icon={Route} onClick={() => { setSelected(null); setReset(value => value + 1); }}>Whole route</EasyTButton></div>
    <div className={styles.mapLayout}>
      <RouteLiveMap title={title} stops={stops} className={styles.liveRouteMap} selected={selected} onSelect={setSelected} resetVersion={reset} />
      <aside className={styles.mapDetail} aria-label="Route map details">
        <div className={styles.mapContext} aria-live="polite" aria-atomic="true">
          <p className={styles.eyebrow}>{stop ? `${stop.country} · Stop ${selected!.index + 1}` : connection ? "Connection context" : "The whole route"}</p>
          <h3>{stop?.name ?? (connection ? `${connection.from} → ${connection.to}` : `${stops[0]?.name} to ${stops.at(-1)?.name}`)}</h3>
          {stop && <><p>{stop.reason}</p>{guide?.minimum != null && <p className={styles.minimum}><MoonStar aria-hidden="true" />Minimum {nightLabel(guide.minimum)}</p>}{guide?.recommended != null && <p>Reviewed guidance: {nightLabel(guide.recommended)}</p>}</>}
          {connection && <><p>{connection.note}</p><MorroviaStatusBanner tone={connection.planningMinutes === null || connection.confidence === "needs-review" ? "warning" : "info"} title={transferStatus(connection)} detail={connection.planningMinutes === null ? "No reviewed duration. Confirm the connection before booking." : `${connection.durationLabel}. A planning allowance, not a verified schedule.`} /></>}
          {!stop && !connection && <p>{stops.length} bases · {countries.join(" · ")}. Select a place or connection to see what is known.</p>}
        </div>
        {stop?.onward && <EasyTButton variant="quiet" icon={ArrowRight} onClick={() => setSelected({ type: "connection", index: selected!.index })}>Next: {stop.onward.to}</EasyTButton>}
        <ol className={styles.mapStops} aria-label={`Ordered stops on ${title}`}>{stops.map((item, index) => <li key={item.id}>
          <EasyTButton id={`route-map-stop-${index}`} variant="quiet" aria-pressed={selected?.type === "stop" && selected.index === index} onClick={() => setSelected({ type: "stop", index })}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><strong>{item.name}</strong><small>{item.country}</small></EasyTButton>
          {item.onward && <EasyTButton id={`route-map-connection-${index}`} variant="quiet" icon={ArrowDown} className={styles.mapConnection} aria-label={`Connection ${item.name} to ${item.onward.to}`} aria-pressed={selected?.type === "connection" && selected.index === index} onClick={() => setSelected({ type: "connection", index })}>{transferStatus(item.onward)}</EasyTButton>}
        </li>)}</ol>
      </aside>
    </div>
  </div>;
}
