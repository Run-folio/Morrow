"use client";

import Link from "next/link";
import { ArrowRight, BedDouble, Compass, Luggage, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import HomeTripStarter from "./home-trip-starter";
import styles from "./home.module.css";

const copy = {
  en: { eyebrow: "Route-led planning", title: "Turn a complex trip into a route you can trust.", lede: "Morrovia finds the best flow, balances time and transfers, and shows you the trade-offs—up front.", routes: "See featured routes", scratch: "Start from scratch", personal: "Personal, not packaged", useful: "Useful before and during the trip", chapter: "Start with what you know", japan: "Places, timing\nand what matters", routeMeta: "Your trip brief", routeStops: "Tell us where, when and how you want it to feel", exploreJapan: "Start shaping a trip", out: "Useful before you book", nearby: "Passport to destination", nearbyText: "See the tourist-entry position and permitted stay for your passport and destination.", story: "Plan with confidence", stamps: "Stays where the route settles", stampsText: "Find accommodation when the route and nights are ready to act on.", openMap: "Check your passport", prep: "Travel prep", prepText: "Keep the practical checks and next actions close to the route you are planning.", openPrep: "Open trip prep", lisbon: "Lisbon", seville: "Seville", marrakech: "Marrakech", train: "3h 15m by train", flight: "1h 10m by flight", seamless: "10 nights · 2 transfers · One seamless route" },
  es: { eyebrow: "Planificación guiada por la ruta", title: "Convierte un viaje complejo en una ruta en la que puedes confiar.", lede: "Morrovia encuentra el mejor flujo, equilibra el tiempo y los traslados, y te muestra las decisiones importantes desde el principio.", routes: "Ver rutas destacadas", scratch: "Empezar desde cero", personal: "Personal, no empaquetado", useful: "Útil antes y durante el viaje", chapter: "Empieza con lo que sabes", japan: "Lugares, fechas\ny lo que importa", routeMeta: "Tu idea de viaje", routeStops: "Cuéntanos dónde, cuándo y cómo quieres que se sienta", exploreJapan: "Empieza a dar forma al viaje", out: "Útil antes de reservar", nearby: "Pasaporte al destino", nearbyText: "Consulta la posición de entrada turística y la estancia permitida para tu pasaporte y destino.", story: "Planifica con confianza", stamps: "Alojamientos donde la ruta se asienta", stampsText: "Encuentra alojamiento cuando la ruta y las noches están listas para actuar.", openMap: "Consultar pasaporte", prep: "Preparativos", prepText: "Mantén las comprobaciones prácticas y los próximos pasos cerca de la ruta que estás planificando.", openPrep: "Abrir preparativos", lisbon: "Lisboa", seville: "Sevilla", marrakech: "Marrakech", train: "3h 15m en tren", flight: "1h 10m en vuelo", seamless: "10 noches · 2 traslados · Una ruta fluida" },
} as const;

export default function HomeHeroTools({ showHero = true, showTools = true }: { showHero?: boolean; showTools?: boolean }) {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => { setLanguage(languageFromStorage()); const update = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail); window.addEventListener("easyt-language-change", update); return () => window.removeEventListener("easyt-language-change", update); }, []);
  const text = copy[language];
  return <>
    {showHero ? <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{text.eyebrow}</p><h1>{text.title}</h1><p className={styles.lede}>{text.lede}</p>
        <HomeTripStarter />
      </div>
      <div className={styles.heroRoute} aria-label={text.exploreJapan}>
        <img className={styles.heroRouteMap} src="/journey/illustrations/iberia-route-hero.png" alt="Illustrated route from Lisbon through Seville to Marrakech" />
        <div className={styles.heroRouteStrip}>
          <div><b>1</b><span><strong>{text.lisbon}</strong><small>3 {language === "es" ? "noches" : "nights"}</small></span></div>
          <em>{text.train}</em>
          <div><b>2</b><span><strong>{text.seville}</strong><small>3 {language === "es" ? "noches" : "nights"}</small></span></div>
          <em>{text.flight}</em>
          <div><b>3</b><span><strong>{text.marrakech}</strong><small>4 {language === "es" ? "noches" : "nights"}</small></span></div>
          <p><Sparkles aria-hidden="true" /> {text.seamless}</p>
        </div>
      </div>
    </section> : null}
    {showTools ? <section className={styles.tools}>
      <header className={styles.toolsHeader}><p className={styles.eyebrow}>{text.out}</p><h2>{language === "es" ? "Todo en un solo lugar, antes de partir." : "Everything in one place, before you go."}</h2></header>
      <div className={styles.prepGrid}>
        <article className={styles.prepCard}><Compass aria-hidden="true" /><h3>{text.nearby}</h3><p>{text.nearbyText}</p><Link href="/journey/passport">{text.openMap} <ArrowRight aria-hidden="true" /></Link></article>
        <article className={styles.prepCard}><BedDouble aria-hidden="true" /><h3>{text.stamps}</h3><p>{text.stampsText}</p><Link href="/journey/new">{language === "es" ? "Empezar una ruta" : "Start with a route"} <ArrowRight aria-hidden="true" /></Link></article>
        <article className={styles.prepCard}><Luggage aria-hidden="true" /><h3>{text.prep}</h3><p>{text.prepText}</p><Link href="/journey/prep">{text.openPrep} <ArrowRight aria-hidden="true" /></Link></article>
      </div>
    </section> : null}
  </>;
}
