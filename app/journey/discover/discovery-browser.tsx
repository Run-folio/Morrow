"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteFamily, RouteInterest, RouteRegion } from "@/lib/easyt/route-catalog";
import { routeImages } from "@/lib/easyt/route-images";
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

export default function DiscoveryBrowser({ routes }: { routes: RouteFamily[] }) {
  const [region, setRegion] = useState<RouteRegion | "all">("all");
  const [interest, setInterest] = useState<RouteInterest | "all">("all");
  const [country, setCountry] = useState("all");
  const countries = useMemo(() => Array.from(new Set(routes.flatMap((route) => route.countries))).sort(), [routes]);
  const filtered = useMemo(() => routes.filter((route) => (region === "all" || route.region === region) && (interest === "all" || route.interests.includes(interest)) && (country === "all" || route.countries.includes(country))), [routes, region, interest, country]);
  const [liveImages, setLiveImages] = useState<Record<string, { src: string; sourceUrl: string; sourceLabel: string }>>({});
  const requestedImages = useRef(new Set<string>());
  useEffect(() => {
    let active = true;
    const pending = routes.filter((route) => !routeImages[route.key] && !liveImages[route.key] && !requestedImages.current.has(route.key)).slice(0, 12);
    if (!pending.length) return;
    pending.forEach((route) => requestedImages.current.add(route.key));
    void Promise.all(pending.map(async (route) => {
      const response = await fetch(`/api/journey-route-image?query=${encodeURIComponent(route.imageQuery ?? `${route.bases[0]} ${route.countries[0]} travel`)}`);
      const payload = await response.json() as { image?: { src: string; sourceUrl: string; sourceLabel: string } | null };
      return payload.image ? [route.key, payload.image] as const : null;
    })).then((results) => { if (active) setLiveImages((current) => ({ ...current, ...Object.fromEntries(results.filter((result): result is readonly [string, { src: string; sourceUrl: string; sourceLabel: string }] => Boolean(result))) })); });
    return () => { active = false; };
  }, [routes, liveImages]);

  return (
    <section className={styles.browser}>
      <div className={styles.filters}>
        <div><small>REGION</small><div className={styles.pills}>{regions.map(([key, label]) => <button key={key} className={region === key ? styles.selected : ""} onClick={() => setRegion(key)}>{label}</button>)}</div></div>
        <div><small>WHAT PULLS YOU IN</small><div className={styles.pills}>{interests.map(([key, label]) => <button key={key} className={interest === key ? styles.selected : ""} onClick={() => setInterest(key)}>{label}</button>)}</div></div>
        <div><label className={styles.selectLabel} htmlFor="discover-country">COUNTRY</label><select id="discover-country" className={styles.select} value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">Any country</option>{countries.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
      </div>
      <div className={styles.resultHead}><p>{filtered.length} thoughtful starting points</p><span>Every route is editable.</span></div>
      <div className={styles.grid}>
        {filtered.map((route) => {
          const curatedImage = routeImages[route.key];
          const liveImage = liveImages[route.key];
          const image = liveImage?.src ?? curatedImage;
          return <Link className={styles.card} href={`/journey/routes/${route.key}`} key={route.key}>
          <div className={`${styles.image} ${!image ? styles.imagePending : ""}`} style={image ? { backgroundImage: `url(${image})` } : undefined}><span>{route.region.replace("-", " ")} · {route.suggestedDays.ideal} days</span>{liveImage ? <a className={styles.imageCredit} href={liveImage.sourceUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{liveImage.sourceLabel}</a> : !image ? <em>Finding a photograph…</em> : null}</div>
          <div className={styles.cardBody}><small>{route.countries.join(" · ")}</small><h2>{route.title}</h2><p>{route.bestFor}</p><dl><div><dt><MapPin /> Bases</dt><dd>{route.bases.join(" · ")}</dd></div><div><dt><CalendarDays /> Shape</dt><dd>{route.suggestedDays.min}–{route.suggestedDays.max} days · {route.confidence} confidence</dd></div></dl><b>See the route <ArrowRight /></b></div>
        </Link>;
        })}
      </div>
      {!filtered.length && <div className={styles.empty}><strong>Nothing matches that combination yet.</strong><span>Try a broader region or feeling.</span></div>}
    </section>
  );
}
