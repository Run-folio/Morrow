"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EasyTButton, EasyTLinkButton, EasyTSelect, EasyTSegmentedControl } from "@/components/easyt/easyt-controls";
import {
  featuredDiscoveryRoutes,
  publishedDiscoveryStyles,
  publishedDiscoveryWonders,
} from "@/lib/easyt/route-discovery";
import type { RouteFamily, RouteInterest, RouteRegion } from "@/lib/easyt/route-catalog";
import { routeImages } from "@/lib/easyt/route-images";
import {
  findRoutePhotos,
  readRoutePhoto,
  saveRoutePhoto,
  trackRoutePhoto,
  type CachedRoutePhoto,
} from "@/lib/easyt/route-photo-cache";
import styles from "./discover.module.css";

type DiscoveryRegion = RouteRegion | "all" | "americas";
type DiscoveryInterest = RouteInterest | "all" | "slow";
type LiveImage = CachedRoutePhoto;

const regions: Array<[DiscoveryRegion, string]> = [
  ["all", "All"], ["asia", "Asia"], ["europe", "Europe"], ["americas", "Americas"],
  ["africa", "Africa"], ["oceania", "Oceania"],
];
const interests: Array<[DiscoveryInterest, string]> = [
  ["all", "Any style"], ["food", "Food"], ["rail", "Rail"], ["nature", "Nature"],
  ["coast", "Coast"], ["culture", "Culture"], ["heritage", "Heritage"], ["slow", "Slow travel"],
];
const ROUTES_PER_PAGE = 12;

function matchesRegion(route: RouteFamily, region: DiscoveryRegion) {
  if (region === "all") return true;
  if (region === "americas") return ["north-america", "central-america", "south-america"].includes(route.region);
  return route.region === region;
}

function imageQueryFor(route: RouteFamily) {
  const anchor = route.stops[0];
  return route.imageQuery ?? `${anchor?.name ?? route.bases[0]} ${anchor?.country ?? route.countries[0]} ${route.interests[0]} travel`;
}

function imageQueriesFor(route: RouteFamily) {
  const anchor = route.stops[0];
  return [imageQueryFor(route), `${anchor?.name ?? route.bases[0]} ${anchor?.country ?? route.countries[0]}`, `${route.countries[0]} travel`];
}

export default function DiscoveryBrowser({ routes }: { routes: RouteFamily[] }) {
  const [region, setRegion] = useState<DiscoveryRegion>("all");
  const [interest, setInterest] = useState<DiscoveryInterest>("all");
  const [country, setCountry] = useState("all");
  const [visibleCount, setVisibleCount] = useState(ROUTES_PER_PAGE);
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [liveImages, setLiveImages] = useState<Record<string, LiveImage>>({});
  const [imageStatus, setImageStatus] = useState<Record<string, "loading" | "unavailable">>({});
  const [queueVersion, setQueueVersion] = useState(0);
  const inFlightImages = useRef(new Set<string>());

  const countries = useMemo(() => Array.from(new Set(routes.flatMap((route) => route.countries))).sort(), [routes]);
  const featuredRoutes = useMemo(() => featuredDiscoveryRoutes(routes), [routes]);
  const wonders = useMemo(() => publishedDiscoveryWonders(routes), [routes]);
  const travelStyles = useMemo(() => publishedDiscoveryStyles(routes), [routes]);
  const filtered = useMemo(() => routes.filter((route) => {
    const matchesInterest = interest === "all"
      || (interest === "slow" ? route.bestFor.toLowerCase().includes("slow") || route.suggestedDays.ideal >= 12 : route.interests.includes(interest));
    return matchesRegion(route, region) && matchesInterest && (country === "all" || route.countries.includes(country));
  }), [routes, region, interest, country]);
  const displayed = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const imageRoutes = useMemo(() => {
    const unique = new Map<string, RouteFamily>();
    [...featuredRoutes, ...travelStyles.map((style) => style.route), ...displayed].forEach((route) => unique.set(route.key, route));
    return [...unique.values()];
  }, [displayed, featuredRoutes, travelStyles]);
  const hasActiveFilters = region !== "all" || interest !== "all" || country !== "all";

  useEffect(() => {
    setLiveImages((current) => ({
      ...current,
      ...Object.fromEntries(routes.flatMap((route) => {
        const cached = readRoutePhoto(route.key);
        return cached ? [[route.key, cached] as const] : [];
      })),
    }));
  }, [routes]);

  useEffect(() => {
    let active = true;
    const pending = imageRoutes
      .filter((route) => !routeImages[route.key] && !liveImages[route.key] && !inFlightImages.current.has(route.key) && imageStatus[route.key] !== "unavailable")
      .slice(0, 2);
    if (!pending.length) return;
    pending.forEach((route) => inFlightImages.current.add(route.key));
    setImageStatus((current) => ({ ...current, ...Object.fromEntries(pending.map((route) => [route.key, "loading"])) }));
    void Promise.allSettled(pending.map(async (route) => ({ key: route.key, ...await findRoutePhotos(imageQueriesFor(route)) })))
      .then((results) => {
        if (!active) return;
        const settled = results.map((result, index) => result.status === "fulfilled"
          ? result.value
          : { key: pending[index].key, candidates: [] as LiveImage[], configured: true });
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
      })
      .finally(() => {
        pending.forEach((route) => inFlightImages.current.delete(route.key));
        if (active) setQueueVersion((version) => version + 1);
      });
    return () => { active = false; };
  }, [imageRoutes, imageStatus, liveImages, queueVersion]);

  const imageFor = (route: RouteFamily) => liveImages[route.key]?.src ?? routeImages[route.key];
  const resetVisibleCount = () => setVisibleCount(ROUTES_PER_PAGE);
  const openResults = () => {
    setShowAllRoutes(true);
    requestAnimationFrame(() => document.getElementById("all-routes")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const applyStyle = (nextInterest: RouteInterest) => {
    setRegion("all"); setCountry("all"); setInterest(nextInterest); resetVisibleCount(); setShowAllRoutes(true);
    requestAnimationFrame(() => document.getElementById("all-routes")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const routeCard = (route: RouteFamily) => {
    const image = imageFor(route);
    return (
      <Link className={styles.routeCard} key={route.key} href={`/journey/routes/${route.key}`} aria-label={`See ${route.title}`}>
        <span className={`${styles.routeImage} ${!image ? styles.imagePending : ""}`} style={image ? { backgroundImage: `url(${image})` } : undefined} />
        <span className={styles.routeCardBody}>
          <small>{route.countries.join(" · ")}</small>
          <strong>{route.title}</strong>
          <span className={styles.routePath}>{route.stops.map((stop) => stop.name).join(" → ")}</span>
          <span className={styles.routeMeta}>
            <span><CalendarDays aria-hidden="true" />{route.suggestedDays.ideal} days</span>
            <span><MapPin aria-hidden="true" />{route.stops.length} stops</span>
          </span>
          <span className={styles.routeArrow}><ArrowRight aria-hidden="true" /></span>
        </span>
      </Link>
    );
  };

  return (
    <section className={styles.browser} id="discover-routes">
      <div className={styles.filters} aria-label="Filter routes">
        <div className={styles.regionFilter}>
          <span className={styles.filterLabel}>REGION</span>
          <EasyTSegmentedControl<DiscoveryRegion>
            ariaLabel="Region"
            className={styles.pills}
            value={region}
            options={regions.map(([value, label]) => ({ value, label }))}
            onChange={(value) => { setRegion(value); resetVisibleCount(); setShowAllRoutes(true); }}
          />
        </div>
        <EasyTSelect fieldClassName={styles.compactSelect} labelClassName={styles.filterLabel} label="Style" value={interest} onChange={(event) => { setInterest(event.target.value as DiscoveryInterest); resetVisibleCount(); setShowAllRoutes(true); }}>
            {interests.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </EasyTSelect>
        <EasyTSelect fieldClassName={styles.compactSelect} labelClassName={styles.filterLabel} label="Country" value={country} onChange={(event) => { setCountry(event.target.value); resetVisibleCount(); setShowAllRoutes(true); }}>
            <option value="all">Any country</option>{countries.map((name) => <option key={name} value={name}>{name}</option>)}
        </EasyTSelect>
      </div>

      <section className={styles.discoverySection}>
        <header><h2>Featured journeys</h2><EasyTButton size="small" variant="quiet" onClick={openResults}>See all routes <ArrowRight aria-hidden="true" /></EasyTButton></header>
        <div className={styles.featuredGrid}>{featuredRoutes.map(routeCard)}</div>
      </section>

      <section className={styles.discoverySection}>
        <header><h2>World wonders &amp; iconic places</h2></header>
        <div className={styles.wonderRail}>{wonders.map((wonder) => (
          <Link className={styles.wonderCard} key={wonder.key} href={`/journey/routes/${wonder.route.key}`}>
            <span className={styles.wonderImage} style={{ backgroundImage: `url(${wonder.image})` }} />
            <span className={styles.wonderBody}>
              <strong>{wonder.title}</strong><small>{wonder.country}</small>
              <span>{wonder.route.stops.map((stop) => stop.name).join(" → ")}</span>
              <span className={styles.wonderMeta}><CalendarDays aria-hidden="true" />{wonder.route.suggestedDays.ideal} days · {wonder.route.stops.length} stops</span>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
        ))}</div>
      </section>

      <section className={styles.discoverySection}>
        <header><h2>Browse by travel style</h2></header>
        <div className={styles.styleRail}>{travelStyles.map((style) => (
          <button type="button" key={style.key} className={styles.styleCard}
            style={imageFor(style.route) ? { backgroundImage: `url(${imageFor(style.route)})` } : undefined}
            onClick={() => applyStyle(style.interest)}>
            <span>{style.label}</span><ArrowRight aria-hidden="true" />
          </button>
        ))}</div>
      </section>

      {(showAllRoutes || hasActiveFilters) && <section className={styles.allRoutes} id="all-routes">
        <header><span><small>ROUTE CATALOGUE</small><h2>{hasActiveFilters ? `${filtered.length} matching ${filtered.length === 1 ? "route" : "routes"}` : "Keep exploring"}</h2></span></header>
        {displayed.length > 0 ? <div className={styles.grid}>{displayed.map(routeCard)}</div> : <div className={styles.empty}><strong>Nothing matches that combination yet.</strong><span>Try a broader region or style.</span></div>}
        {displayed.length < filtered.length && <div className={styles.moreWrap}><EasyTButton variant="secondary" onClick={() => setVisibleCount((count) => count + ROUTES_PER_PAGE)}>See more routes</EasyTButton></div>}
      </section>}

      <section className={styles.bottomBanner}>
        <div><Sparkles className={styles.bottomIcon} aria-hidden="true" /><span><h2>Start building</h2><p>Build a flexible multi-stop trip that fits your pace, your way.</p></span></div>
        <EasyTLinkButton href="/journey/new" icon={ArrowRight}>Start building</EasyTLinkButton>
      </section>
    </section>
  );
}
