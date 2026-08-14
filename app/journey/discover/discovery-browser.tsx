"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
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
const interests: Array<[RouteInterest | "all", string]> = [
  ["all", "Any feeling"], ["food", "Food"], ["rail", "Rail"], ["nature", "Nature"], ["coast", "Coast"], ["culture", "Culture"], ["heritage", "Heritage"],
];

type LiveImage = CachedRoutePhoto;

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
  const [interest, setInterest] = useState<RouteInterest | "all">("all");
  const [country, setCountry] = useState("all");
  const countries = useMemo(() => Array.from(new Set(routes.flatMap((route) => route.countries))).sort(), [routes]);
  const filtered = useMemo(() => routes.filter((route) => (region === "all" || route.region === region) && (interest === "all" || route.interests.includes(interest)) && (country === "all" || route.countries.includes(country))), [routes, region, interest, country]);
  const [liveImages, setLiveImages] = useState<Record<string, LiveImage>>({});
  const [imageStatus, setImageStatus] = useState<Record<string, "loading" | "unavailable">>({});
  const [visibleRoutes, setVisibleRoutes] = useState<Set<string>>(new Set());
  const requestedImages = useRef(new Set<string>());
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setLiveImages((current) => ({ ...current, ...Object.fromEntries(routes.flatMap((route) => {
      const cached = readRoutePhoto(route.key);
      return cached ? [[route.key, cached] as const] : [];
    })) }));
  }, [routes]);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const observer = new IntersectionObserver((entries) => {
      setVisibleRoutes((current) => {
        const next = new Set(current);
        entries.forEach((entry) => { if (entry.isIntersecting) next.add((entry.target as HTMLElement).dataset.routeKey ?? ""); });
        return next;
      });
    }, { rootMargin: "500px 0px" });
    grid.querySelectorAll<HTMLElement>("[data-route-key]").forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [filtered]);
  useEffect(() => {
    let active = true;
    const pending = filtered.filter((route) => visibleRoutes.has(route.key) && !routeImages[route.key] && !liveImages[route.key] && !requestedImages.current.has(route.key)).slice(0, 4);
    if (!pending.length) return;
    pending.forEach((route) => requestedImages.current.add(route.key));
    setImageStatus((current) => ({ ...current, ...Object.fromEntries(pending.map((route) => [route.key, "loading"])) }));
    void Promise.allSettled(pending.map(async (route) => {
      const result = await findRoutePhotos(imageQueriesFor(route));
      return { key: route.key, ...result };
    })).then((results) => {
      if (!active) return;
      const settled = results.map((result, index) => result.status === "fulfilled" ? result.value : { key: pending[index].key, candidates: [] as LiveImage[], configured: true });
      const missingConfiguration = settled.some((result) => result.configured === false);
      if (missingConfiguration) routes.forEach((route) => requestedImages.current.add(route.key));
      const usedIds = new Set(Object.values(liveImages).map((image) => image.id ?? image.src));
      const images = settled.flatMap((result) => {
        const image = result.candidates.find((candidate) => !usedIds.has(candidate.id ?? candidate.src)) ?? result.candidates[0];
        if (!image) return [];
        usedIds.add(image.id ?? image.src);
        return [[result.key, image] as const];
      });
      images.forEach(([key, image]) => { saveRoutePhoto(key, image); trackRoutePhoto(image); });
      setLiveImages((current) => ({ ...current, ...Object.fromEntries(images) }));
      const unavailableKeys = missingConfiguration
        ? routes.filter((route) => !routeImages[route.key]).map((route) => route.key)
        : settled.filter((result) => !result.candidates.length).map((result) => result.key);
      setImageStatus((current) => ({ ...current, ...Object.fromEntries(unavailableKeys.map((key) => [key, "unavailable"])) }));
    });
    return () => { active = false; };
  }, [filtered, routes, liveImages, visibleRoutes]);

  return (
    <section className={styles.browser}>
      <div className={styles.filters}>
        <div><small>REGION</small><div className={styles.pills}>{regions.map(([key, label]) => <button key={key} className={region === key ? styles.selected : ""} onClick={() => setRegion(key)}>{label}</button>)}</div></div>
        <div><small>WHAT PULLS YOU IN</small><div className={styles.pills}>{interests.map(([key, label]) => <button key={key} className={interest === key ? styles.selected : ""} onClick={() => setInterest(key)}>{label}</button>)}</div></div>
        <div><label className={styles.selectLabel} htmlFor="discover-country">COUNTRY</label><select id="discover-country" className={styles.select} value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">Any country</option>{countries.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
      </div>
      <div className={styles.resultHead}><p>{filtered.length} thoughtful starting points</p><span>Every route is editable.</span></div>
      <div className={styles.grid} ref={gridRef}>
        {filtered.map((route) => {
          const curatedImage = routeImages[route.key];
          const liveImage = liveImages[route.key];
          const image = liveImage?.src ?? curatedImage;
          const status = imageStatus[route.key];
          return <Link className={styles.card} href={`/journey/routes/${route.key}`} key={route.key} data-route-key={route.key}>
          <div className={`${styles.image} ${!image ? styles.imagePending : ""}`} style={image ? { backgroundImage: `url(${image})` } : undefined}><span>{route.region.replace("-", " ")} · {route.suggestedDays.ideal} days</span>{liveImage ? <a className={styles.imageCredit} href={liveImage.sourceUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{liveImage.sourceLabel}</a> : !image && status === "loading" ? <em>Finding a photograph…</em> : !image && status === "unavailable" ? <em>Photography unavailable</em> : null}</div>
          <div className={styles.cardBody}><small>{route.countries.join(" · ")}</small><h2>{route.title}</h2><p>{route.bestFor}</p><dl><div><dt><MapPin /> Bases</dt><dd>{route.bases.join(" · ")}</dd></div><div><dt><CalendarDays /> Shape</dt><dd>{route.suggestedDays.min}–{route.suggestedDays.max} days · {route.confidence} confidence</dd></div></dl><b>See the route <ArrowRight /></b></div>
        </Link>;
        })}
      </div>
      {!filtered.length && <div className={styles.empty}><strong>Nothing matches that combination yet.</strong><span>Try a broader region or feeling.</span></div>}
    </section>
  );
}
