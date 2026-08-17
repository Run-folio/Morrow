"use client";

import Link from "next/link";
import { ArrowRight, Clock3, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { findRoutePhotos, readRoutePhoto, saveRoutePhoto, trackRoutePhoto, type CachedRoutePhoto } from "@/lib/easyt/route-photo-cache";
import styles from "./home-explorer.module.css";
import fidelity from "./home-fidelity.module.css";

const routes = [
  { key: "home-peru-bolivia", place: "Peru + Bolivia", title: ["Peru + Bolivia", "Perú + Bolivia"], detail: ["High-altitude history, local culture, and otherworldly landscapes.", "Historia de altura, cultura local y paisajes extraordinarios."], href: "/journey/routes/andean-highlands", bases: "Lima → Cusco → La Paz", query: ["Machu Picchu Peru mountains", "Cusco Peru travel", "Bolivia Andes travel"], stats: "2–3 stops · 10–14 days" },
  { key: "home-spain-portugal", place: "Spain + Portugal", title: ["Spain + Portugal", "España + Portugal"], detail: ["Timeless cities, coastal escapes, and world-class foodscapes.", "Ciudades atemporales, costas y gastronomía memorable."], href: "/journey/routes/portugal-spain", bases: "Barcelona → Lisbon → Porto", query: ["Portugal Spain coastal city travel", "Lisbon Portugal travel", "Seville Spain travel"], stats: "2–3 stops · 10–14 days" },
  { key: "home-vietnam-thailand-cambodia", place: "Vietnam + Thailand + Cambodia", title: ["Vietnam + Thailand + Cambodia", "Vietnam + Tailandia + Camboya"], detail: ["Temples, street food, beaches, and slow moments that stay with you.", "Templos, comida callejera, playas y momentos que se quedan contigo."], href: "/journey/routes/thailand-vietnam-cambodia", bases: "Hanoi → Bangkok → Siem Reap", query: ["Southeast Asia temples travel", "Hoi An Vietnam travel", "Angkor Wat Cambodia travel"], stats: "2–4 stops · 14–20 days" },
];

export default function InspirationExplorer() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [photos, setPhotos] = useState<Record<string, CachedRoutePhoto>>({});
  useEffect(() => { setLanguage(languageFromStorage()); const update = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail); window.addEventListener("easyt-language-change", update); return () => window.removeEventListener("easyt-language-change", update); }, []);
  useEffect(() => {
    let active = true;
    const cached = Object.fromEntries(routes.flatMap((route) => { const image = readRoutePhoto(route.key); return image ? [[route.key, image] as const] : []; }));
    if (Object.keys(cached).length) setPhotos((current) => ({ ...current, ...cached }));
    const missing = routes.filter((route) => !cached[route.key]);
    if (!missing.length) return;
    void Promise.all(missing.map(async (route) => ({ key: route.key, result: await findRoutePhotos(route.query) }))).then((results) => {
      if (!active) return;
      const next = Object.fromEntries(results.flatMap(({ key, result }) => { const photo = result.candidates[0]; if (!photo) return []; saveRoutePhoto(key, photo); trackRoutePhoto(photo); return [[key, photo] as const]; }));
      if (Object.keys(next).length) setPhotos((current) => ({ ...current, ...next }));
    });
    return () => { active = false; };
  }, []);
  const index = language === "es" ? 1 : 0;
  return <section className={styles.explorer} id="routes"><header className={styles.explorerHead}><div><p className={styles.eyebrow}>{language === "es" ? "EXPLORA RUTAS MULTIPAÍS" : "EXPLORE MULTI-COUNTRY ROUTES"}</p><h2>{language === "es" ? "Elige una ruta con una mirada propia." : "Choose a route with a point of view."}</h2></div><Link className={styles.browseLink} href="/journey/discover">{language === "es" ? "Ver todas las rutas" : "View all routes"} <ArrowRight aria-hidden="true" /></Link></header><div className={styles.routeGrid}>{routes.map((route) => { const photo = photos[route.key]; return <Link className={`${styles.routeCard} ${fidelity.routeCard}`} key={route.key} href={route.href}><div className={`${styles.routeImage} ${fidelity.routeImage} ${!photo ? styles.routeImageLoading : ""}`} style={photo ? { ["--route-photo" as string]: `url(${photo.src})` } : undefined}>{photo ? <small>{photo.sourceLabel}</small> : null}</div><div><strong>{route.title[index]}</strong><span className={styles.routeBases}>{route.bases}</span><span className={styles.routeStats}><MapPin aria-hidden="true" /> {route.stats.split(" · ")[0]} <Clock3 aria-hidden="true" /> {route.stats.split(" · ")[1]}</span><p>{route.detail[index]}</p><i>{language === "es" ? "Explorar ruta" : "Explore route"} <ArrowRight aria-hidden="true" /></i></div></Link>; })}</div></section>;
}
