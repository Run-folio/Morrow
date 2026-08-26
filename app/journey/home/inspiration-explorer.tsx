"use client";

import Link from "next/link";
import { ArrowRight, Clock3, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import type { HomepageRouteCard } from "@/lib/easyt/homepage-routes";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { findRoutePhotos, readRoutePhoto, saveRoutePhoto, trackRoutePhoto, type CachedRoutePhoto } from "@/lib/easyt/route-photo-cache";
import styles from "./home-explorer.module.css";
import fidelity from "./home-fidelity.module.css";

export default function InspirationExplorer({ routes }: { routes: HomepageRouteCard[] }) {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [photos, setPhotos] = useState<Record<string, CachedRoutePhoto>>({});
  const [pendingPhotoKeys, setPendingPhotoKeys] = useState<Set<string>>(() => new Set(routes.map((route) => route.key)));
  useEffect(() => { setLanguage(languageFromStorage()); const update = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail); window.addEventListener("easyt-language-change", update); return () => window.removeEventListener("easyt-language-change", update); }, []);
  useEffect(() => {
    let active = true;
    const cached = Object.fromEntries(routes.flatMap((route) => { const image = readRoutePhoto(route.key); return image ? [[route.key, image] as const] : []; }));
    const cachedKeys = Object.keys(cached);
    if (cachedKeys.length) {
      setPhotos((current) => ({ ...current, ...cached }));
      setPendingPhotoKeys((current) => { const next = new Set(current); cachedKeys.forEach((key) => next.delete(key)); return next; });
    }
    const missing = routes.filter((route) => !cached[route.key]);
    if (!missing.length) { setPendingPhotoKeys(new Set()); return; }
    void Promise.allSettled(missing.map(async (route) => ({ key: route.key, result: await findRoutePhotos(route.query) }))).then((results) => {
      if (!active) return;
      const next = Object.fromEntries(results.flatMap((settled) => { if (settled.status === "rejected") return []; const { key, result } = settled.value; const photo = result.candidates[0]; if (!photo) return []; saveRoutePhoto(key, photo); trackRoutePhoto(photo); return [[key, photo] as const]; }));
      if (Object.keys(next).length) setPhotos((current) => ({ ...current, ...next }));
      setPendingPhotoKeys((current) => { const settledKeys = new Set(current); missing.forEach((route) => settledKeys.delete(route.key)); return settledKeys; });
    });
    return () => { active = false; };
  }, []);
  return <section className={styles.explorer} id="routes"><header className={styles.explorerHead}><div><p className={styles.eyebrow}>{language === "es" ? "EXPLORA RUTAS MULTIPAÍS" : "EXPLORE MULTI-COUNTRY ROUTES"}</p><h2>{language === "es" ? "Elige una ruta con una mirada propia." : "Choose a route with a point of view."}</h2></div><Link className={styles.browseLink} href="/journey/discover">{language === "es" ? "Ver todas las rutas" : "View all routes"} <ArrowRight aria-hidden="true" /></Link></header><div className={styles.routeGrid}>{routes.map((route) => { const photo = photos[route.key]; const photoPending = !photo && pendingPhotoKeys.has(route.key); return <Link className={`${styles.routeCard} ${fidelity.routeCard}`} key={route.key} href={route.href}><div className={`${styles.routeImage} ${fidelity.routeImage} ${photoPending ? styles.routeImageLoading : ""}`} style={photo ? { ["--route-photo" as string]: `url(${photo.src})` } : undefined}>{photo ? <small>{photo.sourceLabel}</small> : null}</div><div><strong>{route.title}</strong><span className={styles.routeBases}>{route.bases}</span><span className={styles.routeStats}><MapPin aria-hidden="true" /> {route.stopCount} {language === "es" ? "paradas" : "stops"} <Clock3 aria-hidden="true" /> {route.dayRange.min}–{route.dayRange.max} {language === "es" ? "días" : "days"}</span><p>{route.detail}</p><i>{language === "es" ? "Explorar ruta" : "Explore route"} <ArrowRight aria-hidden="true" /></i></div></Link>; })}</div></section>;
}
