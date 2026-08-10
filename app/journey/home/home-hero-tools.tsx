"use client";

import Link from "next/link";
import { ArrowRight, Compass, Plus, Sparkles, Stamp, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { trackEvent } from "@/lib/analytics";
import HomeRestaurantFinder from "./restaurant-finder";
import styles from "./home.module.css";
import polish from "./home-polish.module.css";
import stampCard from "./stamp-card.module.css";

const copy = {
  en: { eyebrow: "Travel, with a little more thought", title: "Complex trips simplified for you.", lede: "Pick a route that matches the break you need. EasyT gives you a thoughtful first plan, then leaves it open for you to make it yours.", routes: "See featured routes", scratch: "Start from scratch", personal: "Personal, not packaged", useful: "Useful before and during the trip", chapter: "A route you can make yours", japan: "Tokyo, Kanazawa\nand the Japanese Alps", routeMeta: "Japan · 10 days", routeStops: "Tokyo → Kanazawa → Kyoto", exploreJapan: "Explore the Japan route", out: "Out and about", nearby: "Find a good place nearby.", nearbyText: "Choose what you need, then EasyT will search around your current location.", story: "Keep the story", stamps: "Collect your stamps.", stampsText: "Mark the places you’ve lived, loved and returned to. Your map becomes a record of how you travel.", openMap: "Open your map" },
  es: { eyebrow: "Viaja con un poco más de intención", title: "Viajes complejos, simplificados para ti.", lede: "Elige una ruta que encaje con el descanso que necesitas. EasyT te da un primer plan pensado y lo deja abierto para que lo hagas tuyo.", routes: "Ver rutas destacadas", scratch: "Empezar desde cero", personal: "Personal, no empaquetado", useful: "Útil antes y durante el viaje", chapter: "Una ruta que haces tuya", japan: "Tokio, Kanazawa\ny los Alpes japoneses", routeMeta: "Japón · 10 días", routeStops: "Tokio → Kanazawa → Kioto", exploreJapan: "Explora la ruta de Japón", out: "En movimiento", nearby: "Encuentra un buen lugar cerca.", nearbyText: "Elige lo que necesitas y EasyT buscará alrededor de tu ubicación actual.", story: "Guarda la historia", stamps: "Colecciona tus sellos.", stampsText: "Marca los lugares donde has vivido, amado y regresado. Tu mapa se convierte en un registro de cómo viajas.", openMap: "Abre tu mapa" },
} as const;

export default function HomeHeroTools({ showHero = true, showTools = true }: { showHero?: boolean; showTools?: boolean }) {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => { setLanguage(languageFromStorage()); const update = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail); window.addEventListener("easyt-language-change", update); return () => window.removeEventListener("easyt-language-change", update); }, []);
  const text = copy[language];
  return <>
    {showHero ? <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{text.eyebrow}</p><h1>{text.title}</h1><p className={styles.lede}>{text.lede}</p>
        <div className={styles.heroActions}><a className={styles.primary} href="#start-building" onClick={() => trackEvent("easyt_trip_started", { source: "homepage_hero" })}><Plus aria-hidden="true" /> {text.scratch}</a><a className={styles.secondaryPill} href="#routes" onClick={() => trackEvent("easyt_featured_route_opened", { source: "homepage_hero" })}><Sparkles aria-hidden="true" /> {text.routes}</a></div>
        <div className={styles.heroProof}><span><Sparkles aria-hidden="true" /> {text.personal}</span><span><Compass aria-hidden="true" /> {text.useful}</span></div>
      </div>
      <Link href="/journey/routes/japan-slow" className={`${styles.heroCard} ${polish.heroCard}`} aria-label={text.exploreJapan} onClick={() => trackEvent("easyt_featured_route_opened", { source: "homepage_hero_card", route: "japan-slow" })}><div className={styles.heroImage} style={{ backgroundImage: "url(/journey/tokyo.jpg)" }} /><div className={styles.heroCardOverlay}><div className={styles.heroRouteMeta}><span>{text.routeMeta} · {text.routeStops}</span></div><small>{text.exploreJapan} <ArrowRight aria-hidden="true" /></small></div></Link>
    </section> : null}
    {showTools ? <section className={styles.tools}>
      <article className={`${styles.toolCard} ${styles.restaurantCard} ${polish.toolCard}`}><div className={styles.toolIcon}><Utensils aria-hidden="true" /></div><p className={styles.eyebrow}>{text.out}</p><h2>{text.nearby}</h2><p>{text.nearbyText}</p><HomeRestaurantFinder /></article>
      <article className={`${styles.toolCard} ${styles.stampCard} ${stampCard.stampCard} ${polish.toolCard}`}><div className={`${styles.stampMap} ${stampCard.mapLayer}`}><span className={styles.mapDot} /><span className={styles.mapDot} /><span className={styles.mapDot} /><span className={styles.mapLine} /></div><div className={styles.toolIcon}><Stamp aria-hidden="true" /></div><p className={styles.eyebrow}>{text.story}</p><h2>{text.stamps}</h2><p>{text.stampsText}</p><Link className={styles.secondary} href="/journey/stamped" onClick={() => trackEvent("easyt_stamps_opened", { source: "homepage" })}>{text.openMap} <ArrowRight aria-hidden="true" /></Link></article>
    </section> : null}
  </>;
}
