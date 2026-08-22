"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Gauge, Route as RouteIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteFamily, RouteInterest, RouteRegion } from "@/lib/easyt/route-catalog";
import { routeImages } from "@/lib/easyt/route-images";
import { findRoutePhotos, readRoutePhoto, saveRoutePhoto, trackRoutePhoto, type CachedRoutePhoto } from "@/lib/easyt/route-photo-cache";
import styles from "./discover.module.css";

const regions: Array<[RouteRegion | "all", string]> = [
  ["all", "Everywhere"],
  ["asia", "Asia"],
  ["south-america", "South America"],
  ["central-america", "Central America"],
  ["europe", "Europe"],
  ["africa", "Africa"],
  ["north-america", "North America"],
  ["oceania", "Oceania"],
];
type DiscoveryInterest = RouteInterest | "all" | "slow";
const interests: Array<[DiscoveryInterest, string]> = [
  ["all", "Any feeling"], ["food", "Food"], ["rail", "Rail"], ["nature", "Nature"], ["coast", "Coast"], ["culture", "Culture"], ["heritage", "Heritage"], ["slow", "Slow travel"],
];

type LiveImage = CachedRoutePhoto;
const ROUTES_PER_PAGE = 12;

function imageQueryFor(route: RouteFamily) {
  // Unsplash search quality drops sharply when every stop is packed into one
  // query. Use the route's editorial image query where supplied; otherwise
  // anchor the photograph to the first chapter and one defining interest.
  const anchor = route.stops[0];
  return route.imageQuery ?? `${anchor?.name ?? route.bases[0]} ${anchor?.country ?? route.countries[0]} ${route.interests[0]} travel`;
}

function imageQueriesFor(route: RouteFamily) {
  const anchor = route.stops[0];
  return [imageQueryFor(route), `${anchor?.name ?? route.bases[0]} ${anchor?.country ?? route.countries[0]}`, `${route.countries[0]} travel`];
}

export default function DiscoveryBrowser({ routes }: { routes: RouteFamily[] }) {
  const [region, setRegion] = useState<RouteRegion | "all">("all");
  const [interest, setInterest] = useState<DiscoveryInterest>("all");
  const [country, setCountry] = useState("all");
  const countries = useMemo(() => Array.from(new Set(routes.flatMap((route) => route.countries))).sort(), [routes]);
  const filtered = useMemo(() => routes.filter((route) => {
    const matchesInterest = interest === "all" || (interest === "slow" ? route.bestFor.toLowerCase().includes("slow") || route.suggestedDays.ideal >= 12 : route.interests.includes(interest));
    return (region === "all" || route.region === region) && matchesInterest && (country === "all" || route.countries.includes(country));
  }), [routes, region, interest, country]);
  const [visibleCount, setVisibleCount] = useState(ROUTES_PER_PAGE);
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const displayed = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const [liveImages, setLiveImages] = useState<Record<string, LiveImage>>({});
  const [imageStatus, setImageStatus] = useState<Record<string, "loading" | "unavailable">>({});
  const inFlightImages = useRef(new Set<string>());
  const [queueVersion, setQueueVersion] = useState(0);
  useEffect(() => {
    setLiveImages((current) => ({ ...current, ...Object.fromEntries(routes.flatMap((route) => {
      const cached = readRoutePhoto(route.key);
      return cached ? [[route.key, cached] as const] : [];
    })) }));
  }, [routes]);
  useEffect(() => {
    let active = true;
    // Resolve only the routes the traveller has asked to see, with a small
    // queue rather than an intersection-observer race or an API burst.
    const pending = displayed.filter((route) => !routeImages[route.key] && !liveImages[route.key] && !inFlightImages.current.has(route.key) && imageStatus[route.key] !== "unavailable").slice(0, 2);
    if (!pending.length) return;
    pending.forEach((route) => inFlightImages.current.add(route.key));
    setImageStatus((current) => ({ ...current, ...Object.fromEntries(pending.map((route) => [route.key, "loading"])) }));
    void Promise.allSettled(pending.map(async (route) => {
      const result = await findRoutePhotos(imageQueriesFor(route));
      return { key: route.key, ...result };
    })).then((results) => {
      if (!active) return;
      const settled = results.map((result, index) => result.status === "fulfilled" ? result.value : { key: pending[index].key, candidates: [] as LiveImage[], configured: true });
      const usedIds = new Set(Object.values(liveImages).map((image) => image.id ?? image.src));
      const images = settled.flatMap((result) => {
        const image = result.candidates.find((candidate) => !usedIds.has(candidate.id ?? candidate.src)) ?? result.candidates[0];
        if (!image) return [];
        usedIds.add(image.id ?? image.src);
        return [[result.key, image] as const];
      });
      images.forEach(([key, image]) => { saveRoutePhoto(key, image); trackRoutePhoto(image); });
      setLiveImages((current) => ({ ...current, ...Object.fromEntries(images) }));
      const unavailableKeys = settled.filter((result) => !result.candidates.length).map((result) => result.key);
      setImageStatus((current) => ({ ...current, ...Object.fromEntries(unavailableKeys.map((key) => [key, "unavailable"])) }));
    }).finally(() => {
      pending.forEach((route) => inFlightImages.current.delete(route.key));
      if (active) setQueueVersion((version) => version + 1);
    });
    return () => { active = false; };
  }, [displayed, liveImages, queueVersion]);

  const resetVisibleCount = () => setVisibleCount(ROUTES_PER_PAGE);

  const imageFor = (route: RouteFamily) => liveImages[route.key]?.src ?? routeImages[route.key];
  const quickPicks = filtered.slice(0, 6);
  const storyLead = filtered[0];
  const storySupports = filtered.slice(1, 4);
  const travelStyles = [
    { label: "Weekend escapes", interest: "culture" as RouteInterest },
    { label: "Rail journeys", interest: "rail" as RouteInterest },
    { label: "Soft adventure", interest: "nature" as RouteInterest },
    { label: "Coastal calm", interest: "coast" as RouteInterest },
    { label: "Fine culture", interest: "heritage" as RouteInterest },
  ].map((item) => ({ ...item, route: routes.find((route) => route.interests.includes(item.interest)) })).filter((item): item is typeof item & { route: RouteFamily } => Boolean(item.route));
  const collections = [
    { label: "Food-focused", interest: "food" as RouteInterest },
    { label: "Coastal calm", interest: "coast" as RouteInterest },
    { label: "Culture-rich", interest: "culture" as RouteInterest },
    { label: "Mountain escapes", interest: "hiking" as RouteInterest },
    { label: "Family friendly", interest: "heritage" as RouteInterest },
    { label: "Slow travel", interest: "rail" as RouteInterest },
  ].map((item) => ({ ...item, route: routes.find((route) => route.interests.includes(item.interest)) })).filter((item): item is typeof item & { route: RouteFamily } => Boolean(item.route));

  const routeCard = (route: RouteFamily, compact = false) => {
    const image = imageFor(route);
    return <article className={`${styles.routeCard} ${compact ? styles.routeCardCompact : ""}`} key={route.key}>
      <Link className={`${styles.routeImage} ${!image ? styles.imagePending : ""}`} href={`/journey/routes/${route.key}`} style={image ? { backgroundImage: `url(${image})` } : undefined} aria-label={`See ${route.title}`} />
      <div className={styles.routeCardBody}>
        <small>{route.countries.join(" · ")} · {route.region.replace("-", " ")}</small>
        <h3>{route.title}</h3>
        <p>{route.bestFor}</p>
        <div className={styles.routeMeta}>
          <span><RouteIcon aria-hidden="true" />{route.bases.join(" → ")}</span>
          <span><CalendarDays aria-hidden="true" />{route.suggestedDays.min}–{route.suggestedDays.max} days</span>
          <span><Gauge aria-hidden="true" />{route.confidence} confidence</span>
        </div>
        <Link className={styles.routeCta} href={`/journey/routes/${route.key}`}>See the route <ArrowRight aria-hidden="true" /></Link>
      </div>
    </article>;
  };

  return (
    <section className={styles.browser} id="discover-routes">
      <div className={styles.filters}>
        <div><small>REGION</small><div className={styles.pills}>{regions.map(([key, label]) => <button key={key} className={region === key ? styles.selected : ""} onClick={() => { setRegion(key); resetVisibleCount(); }}>{label}</button>)}</div></div>
        <div><small>WHAT PULLS YOU IN</small><div className={styles.pills}>{interests.map(([key, label]) => <button key={key} className={interest === key ? styles.selected : ""} onClick={() => { setInterest(key); resetVisibleCount(); }}>{label}</button>)}</div></div>
        <div><label className={styles.selectLabel} htmlFor="discover-country">COUNTRY</label><select id="discover-country" className={styles.select} value={country} onChange={(event) => { setCountry(event.target.value); resetVisibleCount(); }}><option value="all">Any country</option>{countries.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
      </div>
      <div className={styles.resultHead}><div><p>Quick picks for you</p></div><button type="button" className={styles.seeAllButton} onClick={() => setShowAllRoutes(true)}>See all</button></div>
      {quickPicks.length > 0 && <div className={styles.cardRail}>{quickPicks.map((route) => routeCard(route, true))}</div>}

      {storyLead && <section className={styles.discoverySection}>
        <header><h2>Stories worth following</h2><button type="button" className={styles.seeAllButton} onClick={() => setShowAllRoutes(true)}>See all</button></header>
        <div className={styles.storyGrid}>
          <article className={styles.storyLead} style={imageFor(storyLead) ? { backgroundImage: `url(${imageFor(storyLead)})` } : undefined}>
            <div><small>{storyLead.countries.join(" · ")}</small><h3>{storyLead.title}</h3><p>{storyLead.bestFor}</p><Link href={`/journey/routes/${storyLead.key}`}>Read the route story <ArrowRight aria-hidden="true" /></Link></div>
          </article>
          <div className={styles.storySupports}>{storySupports.map((route) => routeCard(route, true))}</div>
        </div>
      </section>}

      <section className={styles.discoverySection}>
        <header><h2>Browse by travel style</h2><button type="button" className={styles.seeAllButton} onClick={() => setShowAllRoutes(true)}>See all</button></header>
        <div className={styles.styleRail}>{travelStyles.map(({ label, route }) => <Link key={label} href={`/journey/routes/${route.key}`} className={styles.styleCard} style={imageFor(route) ? { backgroundImage: `url(${imageFor(route)})` } : undefined}><span>{label}</span><ArrowRight aria-hidden="true" /></Link>)}</div>
      </section>

      <section className={styles.discoverySection}>
        <header><h2>Curated collections</h2><button type="button" className={styles.seeAllButton} onClick={() => setShowAllRoutes(true)}>See all</button></header>
        <div className={styles.collectionGrid}>{collections.map(({ label, route }) => <Link key={label} href={`/journey/routes/${route.key}`} className={styles.collectionCard}><span className={styles.collectionImage} style={imageFor(route) ? { backgroundImage: `url(${imageFor(route)})` } : undefined} /><span><small>{route.region.replace("-", " ")}</small><strong>{label}</strong></span><ArrowRight aria-hidden="true" /></Link>)}</div>
      </section>

      {showAllRoutes && <section className={styles.allRoutes} id="all-routes">
        <header><small>ALL ROUTES</small><h2>Keep exploring</h2></header>
        <div className={styles.grid}>{displayed.map((route) => routeCard(route))}</div>
      </section>}
      {showAllRoutes && displayed.length < filtered.length && <div className={styles.moreWrap}>
        <button type="button" className={styles.moreButton} onClick={() => setVisibleCount((count) => count + ROUTES_PER_PAGE)}>
          See more routes <span>{Math.min(ROUTES_PER_PAGE, filtered.length - displayed.length)} more</span>
        </button>
      </div>}
      {!filtered.length && <div className={styles.empty}><strong>Nothing matches that combination yet.</strong><span>Try a broader region or feeling.</span></div>}
      <section className={styles.bottomBanner}><div><small>BUILD FROM ANY STARTING POINT</small><h2>Your trip, your way</h2><p>Every route is fully editable - change pace, swap places, add days.</p></div><a href="#discover-routes">Start exploring <ArrowRight aria-hidden="true" /></a></section>
    </section>
  );
}
