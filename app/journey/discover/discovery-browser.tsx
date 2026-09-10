"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, ArrowUpRight, Compass, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { EasyTButton as Button, EasyTLinkButton as LinkButton, EasyTField as Field, EasyTSelect as Select, EasyTSegmentedControl as Segments } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import { MorroviaMapLoading } from "@/components/easyt/morrovia-loading-states";
import { discoveryDuration, discoveryShape, discoverySequence, discoveryRegions, discoveryStyles, discoveryLengths, filterDiscoveryRoutes, initialDiscoveryFilters, resetDiscoveryFilter, type DiscoveryFilters } from "@/lib/easyt/route-discovery";
import type { DiscoveryRoute } from "@/lib/easyt/discovery-catalogue";
import type { RoutesOverviewEditorial } from "@/lib/easyt/routes-overview-editorial";
import EditorialCarousel from "./editorial-carousel";
import RoutesOverviewHero from "./routes-overview-hero";
import DiscoveryPhoto from "./discovery-photo";
import styles from "./discover.module.css";

const RoutePreview = dynamic(() => import("./route-preview"), { loading: () => <div role="status" className={styles.previewLoading}>Opening route…</div>, ssr: false });
const DiscoveryMap = dynamic(() => import("./discovery-map"), { loading: () => <MorroviaMapLoading>Route geography</MorroviaMapLoading>, ssr: false });
type Shortcut = { label: string; interest?: DiscoveryFilters["style"]; routeKey?: string };
export type DiscoveryBrowserProps = { routes: DiscoveryRoute[]; navigation?: ReactNode; editorial?: RoutesOverviewEditorial; shortcuts?: Shortcut[]; unavailable?: boolean; initialFilters?: DiscoveryFilters; initialSelected?: string; initialView?: "gallery" | "map"; imageUnavailable?: boolean };

export function RouteItem({ route, index, onSelect, featured = false, compact = false, active = false, imageUnavailable = false }: { route: DiscoveryRoute; index: number; onSelect: (route: DiscoveryRoute) => void; featured?: boolean; compact?: boolean; active?: boolean; imageUnavailable?: boolean }) {
  return <article className={`${featured ? styles["route-story"] : styles["route-row"]} ${active ? styles.active : ""}`}>
    <DiscoveryPhoto route={route} className={styles.itemPhoto} sizes={featured ? "(max-width:700px) 100vw, 55vw" : "100px"} unavailable={imageUnavailable} />
    {featured && <span className={styles["story-wash"]} />}
    <Button variant="quiet" className={styles.itemSelect} aria-label={`${compact ? "Show on map:" : "Preview"} ${route.title}`} aria-pressed={compact ? active : undefined} onClick={() => onSelect(route)}>
      <span className={styles["row-number"]}>{String(index + 1).padStart(2, "0")}</span>
      <span className={featured ? styles["story-copy"] : styles["row-copy"]}>
        <small>{route.countries.join(" → ")}</small><strong>{route.title}</strong>
        <span className={styles["row-sequence"]}>{discoverySequence(route)}</span>
        <span className={styles["row-meta"]}>{discoveryDuration(route)} · {discoveryShape(route)}</span>
        <span className={styles.character}>{route.character}</span>
      </span><ArrowUpRight aria-hidden="true" />
    </Button>
    <Link className={styles.itemExplore} prefetch={false} href={route.href} aria-label={`Explore route: ${route.title}`}>Explore route <ArrowUpRight aria-hidden="true" /></Link>
  </article>;
}
export default function DiscoveryBrowser({ routes, navigation, editorial, shortcuts = [], unavailable = false, initialFilters = initialDiscoveryFilters, initialSelected, initialView = "gallery", imageUnavailable = false }: DiscoveryBrowserProps) {
  const [filters, setFilters] = useState(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState(initialView);
  const [count, setCount] = useState(12);
  const [selected, setSelected] = useState<DiscoveryRoute | null>(() => routes.find((route) => route.key === initialSelected) ?? null);
  const [mapKey, setMapKey] = useState(routes[0]?.key);
  const [overview, setOverview] = useState(true);
  const [mapStop, setMapStop] = useState(0);
  const countries = useMemo(() => [...new Set(routes.flatMap((route) => route.countries))].sort(), [routes]);
  const results = useMemo(() => filterDiscoveryRoutes(routes, filters), [routes, filters]);
  const active = Object.entries(filters).filter(([key, value]) => value !== initialDiscoveryFilters[key as keyof DiscoveryFilters]);
  const visible = results.slice(0, count);
  const featured = !editorial?.chapters.length && !active.length ? visible.slice(0, 2) : [];
  const rest = featured.length ? visible.slice(2) : visible;
  const mapRoute = results.find((route) => route.key === mapKey) ?? results[0];
  const update = <K extends keyof DiscoveryFilters>(key: K, value: DiscoveryFilters[K]) => { setFilters((current) => ({ ...current, [key]: value })); setCount(12); };
  const reset = () => { setFilters(initialDiscoveryFilters); setCount(12); };
  const selectMap = (route: DiscoveryRoute) => { setMapKey(route.key); setMapStop(0); setOverview(false); };
  const filterLabel = (key: keyof DiscoveryFilters, value: unknown) => key === "search" ? `Search: ${value}` : key === "multi" ? "Multi-country" : key === "region" ? discoveryRegions.find(([id]) => id === value)?.[1] ?? String(value) : key === "style" ? discoveryStyles.find(([id]) => id === value)?.[1] ?? String(value) : key === "length" ? discoveryLengths.find(([id]) => id === value)?.[1] ?? String(value) : String(value);

  return <>
    <RoutesOverviewHero image={editorial?.hero ?? null} navigation={navigation} count={routes.length} imageUnavailable={imageUnavailable} />
    <div id="route-discovery">
    <div className={styles.discovery} id="discover-routes">
      <div className={styles["discovery-bar"]}>
        <div className={styles["search-wrap"]}><Search aria-hidden="true" /><Field id="route-search" label="Search routes" labelClassName="sr-only" type="search" placeholder="A country, a place, a way to go…" value={filters.search} onChange={(event) => update("search", event.target.value)} /></div>
        <Button variant={filters.multi ? "primary" : "secondary"} aria-pressed={filters.multi} onClick={() => update("multi", !filters.multi)}>Multi-country</Button>
        <Button variant="secondary" icon={SlidersHorizontal} aria-expanded={filtersOpen} aria-controls="route-filters" onClick={() => setFiltersOpen(!filtersOpen)}>Filters</Button>
        <Segments ariaLabel="Catalogue view" value={view} options={[{ value: "gallery", label: "Gallery" }, { value: "map", label: "Map" }]} onChange={setView} />
      </div>
      {filtersOpen && <div className={styles["filter-panel"]} id="route-filters">
        <Select label="Region" value={filters.region} onChange={(event) => update("region", event.target.value as DiscoveryFilters["region"])}>{discoveryRegions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
        <Select label="Country" value={filters.country} onChange={(event) => update("country", event.target.value)}><option value="all">Any country</option>{countries.map((country) => <option key={country}>{country}</option>)}</Select>
        <Select label="Travel style" value={filters.style} onChange={(event) => update("style", event.target.value as DiscoveryFilters["style"])}>{discoveryStyles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
        <Select label="Trip length" value={filters.length} onChange={(event) => update("length", event.target.value as DiscoveryFilters["length"])}>{discoveryLengths.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
        <p>Trip length matches overlapping suggested ranges.</p>
      </div>}
      {!!active.length && <div className={styles.activeFilters} aria-label="Active filters">{active.map(([key, value]) => <Button key={key} variant="secondary" size="small" icon={X} aria-label={`Remove ${filterLabel(key as keyof DiscoveryFilters, value)}`} onClick={() => { setFilters((current) => resetDiscoveryFilter(current, key as keyof DiscoveryFilters)); setCount(12); }}>{filterLabel(key as keyof DiscoveryFilters, value)}</Button>)}<Button variant="quiet" size="small" onClick={reset}>Reset all</Button></div>}
    </div>
    <section className={styles["catalogue-content"]} aria-label="Route catalogue" id="all-routes">
      <div className={styles["catalogue-heading"]}><div><span className={styles.eyebrow}>THE FULL ROUTE CATALOGUE</span><h2>{active.length ? "Find your kind of journey." : "More starting points."}</h2></div><div className={styles["result-count"]} role="status" aria-live="polite"><strong>{results.length}</strong><span>{active.length ? `matching ${results.length === 1 ? "route" : "routes"}` : routes.length === 1 ? "starting point" : "starting points"}</span></div></div>
      {unavailable ? <MorroviaStatusBanner tone="warning" title="Routes are temporarily unavailable" detail="We couldn’t check the current catalogue. Please try again shortly." actions={<><LinkButton href="/journey/discover" variant="secondary">Try again</LinkButton><LinkButton href="/journey/new">Start your own trip</LinkButton></>} /> : !routes.length ? <MorroviaStatusBanner title="New routes are on their way" detail="There are no public routes to browse right now. You can still start with your own idea." actions={<LinkButton href="/journey/new">Start your own trip</LinkButton>} /> : !results.length ? <div className={styles["empty-state"]}><Compass aria-hidden="true" /><h2>No routes match just yet.</h2><p>Try fewer filters, another country or a broader search.</p><div><Button onClick={reset}>Clear filters</Button><LinkButton variant="secondary" href="/journey/new">Start your own trip</LinkButton></div></div> : view === "map" ? <div className={styles["map-mode"]}>
        <div className={styles["map-list"]} aria-label="Routes on the map">{results.map((route, index) => <RouteItem compact key={route.key} route={route} index={index} onSelect={selectMap} active={!overview && route.key === mapRoute.key} imageUnavailable={imageUnavailable} />)}</div>
        <div className={styles["map-stage"]}><div className={styles["map-mode-toolbar"]}><span className={styles.eyebrow}>{overview ? "EVERY JOURNEY HAS A SHAPE" : mapRoute.countries.join(" → ")}</span><Button size="small" variant="secondary" onClick={() => setSelected(mapRoute)}>Open route</Button><Button size="small" variant="secondary" onClick={() => setOverview(!overview)}>{overview ? "Focus selected route" : "Show all routes"}</Button></div><DiscoveryMap routes={results} route={mapRoute} overview={overview} selectedStop={mapStop} onStop={setMapStop} onRoute={selectMap} /></div>
      </div> : <>
        {!!featured.length && <div className={styles["featured-stories"]}>{featured.map((route, index) => <RouteItem key={route.key} featured route={route} index={index} onSelect={setSelected} imageUnavailable={imageUnavailable} />)}</div>}
        {!!featured.length && <div className={styles["browse-heading"]}><h3>Keep your options open.</h3><p>Suggested ranges · every stop is yours to change</p></div>}
        <div className={styles["route-rows"]}>{rest.map((route, index) => <RouteItem key={route.key} route={route} index={index + featured.length} onSelect={setSelected} imageUnavailable={imageUnavailable} />)}</div>
        {visible.length < results.length && <div className={styles["load-more"]}><span>Showing {visible.length} of {results.length} routes</span><Button variant="secondary" onClick={() => setCount((current) => current + 12)}>See {Math.min(12, results.length - visible.length)} more routes</Button></div>}
      </>}
      {!!shortcuts.length && <div className={styles["browse-shortcuts"]}><span className={styles.eyebrow}>FOLLOW A FEELING. OR A PLACE.</span><div>{shortcuts.map((shortcut) => shortcut.interest ? <Button key={shortcut.label} variant="quiet" size="small" onClick={() => { setFilters({ ...initialDiscoveryFilters, style: shortcut.interest! }); setCount(12); document.getElementById("discover-routes")?.scrollIntoView({ block: "start" }); }}>{shortcut.label}<ArrowUpRight aria-hidden="true" /></Button> : <LinkButton key={shortcut.label} href={routes.find((route) => route.key === shortcut.routeKey)?.href ?? "/journey/discover"} prefetch={false} variant="quiet" size="small">{shortcut.label}<ArrowUpRight aria-hidden="true" /></LinkButton>)}</div></div>}
      <Link className={styles.creditsLink} href="/journey/immersive/credits.html" prefetch={false}>Route photography credits</Link>
    </section>
    </div>
    {!unavailable && editorial && <EditorialCarousel chapters={editorial.chapters} imageUnavailable={imageUnavailable} />}
    <section className={styles.closing}><span className={styles.eyebrow}>NO TWO JOURNEYS NEED TO BE THE SAME.</span><h2>Your starting point.<br /><em>Your way from here.</em></h2><LinkButton href="/journey/new" prefetch={false} icon={ArrowRight}>Start with your own idea</LinkButton></section>
    {selected && <RoutePreview route={selected} onClose={() => setSelected(null)} imageUnavailable={imageUnavailable} />}
  </>;
}
