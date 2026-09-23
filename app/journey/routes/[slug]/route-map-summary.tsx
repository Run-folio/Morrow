"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, MoonStar } from "lucide-react";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import type { PublicRouteConnection, PublicRouteStop } from "@/lib/easyt/public-route";
import type { RouteNightGuide } from "./route-detail-presentation";
import { transferStatus, nightLabel } from "./route-detail-labels";
import { editorialConnectionId, routeMapHashForSelection, routeMapSelectionFromHash, validRouteSelection, type RouteMapSelection } from "./route-map-selection";
import RouteLiveMap from "./route-live-map";
import styles from "./route-overview.module.css";

export type RouteMapSummaryConnection = Omit<PublicRouteConnection, "mode"> & { id?: string; mode: string | null };

export type RouteMapSummaryStop = Omit<PublicRouteStop, "coordinates" | "nights" | "onward"> & {
  coordinates: [number, number] | null;
  nights: number | null;
  onward: RouteMapSummaryConnection | null;
};

function journeySelectionKey(selection: RouteMapSelection) {
  return selection.kind === "route" ? "route" : selection.kind === "stop" ? `stop:${selection.stopId}` : `connection:${selection.connectionId}`;
}

export default function RouteMapSummary({ title, stops, countries, nights, durationDays, totalNights, character, rationale, warning, initialSelection = { kind: "route" }, tripFacts = false }: {
  title: string; stops: RouteMapSummaryStop[]; countries: string[]; nights: RouteNightGuide[]; durationDays: number | null; totalNights: number | null;
  character: string; rationale?: string; warning?: string; initialSelection?: RouteMapSelection; tripFacts?: boolean;
}) {
  const [selected, setSelected] = useState<RouteMapSelection>(() => validRouteSelection(initialSelection, stops));
  const [navigatorWidth, setNavigatorWidth] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const navigatorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const navigator = navigatorRef.current;
    if (!navigator || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const mobile = typeof matchMedia === "function" && matchMedia("(max-width: 700px)").matches;
      const width = mobile ? 0 : Math.round(navigator.getBoundingClientRect().width);
      setNavigatorWidth((current) => current === width ? current : width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(navigator);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    navigatorRef.current?.querySelector<HTMLElement>('[aria-current="location"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);
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
  const items = [
    { selection: { kind: "route" } as const, label: "Whole journey", meta: `${stops.length} stops` },
    ...stops.flatMap((item, index) => {
      const next = stops[index + 1];
      return [
        { selection: { kind: "stop", stopId: item.id } as const, label: `${index + 1}. ${item.name}`, meta: item.country },
        ...(item.onward && next ? [{ selection: { kind: "connection", connectionId: editorialConnectionId(item.id, next.id, item.onward.id) } as const, label: `${item.name} to ${item.onward.to}`, meta: item.onward.modeLabel }] : []),
      ];
    }),
  ];
  const activateSelection = (selection: RouteMapSelection) => {
    const hash = routeMapHashForSelection(selection, stops);
    history.replaceState(history.state, "", hash);
    setSelected(selection);
  };
  return <div ref={root}>
    <div className={styles.mapToolbar}><span>{countries.join(" → ")}</span></div>
    <div className={styles.mapLayout}>
      <nav ref={navigatorRef} className={styles.journeyNavigator} aria-label="Explore this journey">
        <ol>{items.map((item) => {
          const active = journeySelectionKey(item.selection) === journeySelectionKey(selected);
          return <li key={journeySelectionKey(item.selection)}>
            <EasyTButton variant="quiet" className={styles.journeyNavigatorButton} aria-current={active ? "location" : undefined} onClick={() => activateSelection(item.selection)}>
              <span>{item.label}</span><small>{item.meta}</small>{item.selection.kind === "connection" && <ArrowRight aria-hidden="true" />}
            </EasyTButton>
          </li>;
        })}</ol>
      </nav>
      <RouteLiveMap title={title} stops={stops} className={styles.liveRouteMap} selected={selected} onSelect={activateSelection} cameraOcclusions={{ right: navigatorWidth }} />
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
        {stops.map((item, index) => <span className={styles.srOnly} id={`route-map-stop-${index}`} key={`anchor-stop-${item.id}`}>{item.name}</span>)}
        {stops.slice(0, -1).map((item, index) => <span className={styles.srOnly} id={`route-map-connection-${index}`} key={`anchor-connection-${item.id}`}>{item.name} to {item.onward?.to}</span>)}
      </aside>
    </div>
  </div>;
}
