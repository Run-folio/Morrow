"use client";

import Link from "next/link";
import { ArrowRight, BedDouble, Compass, Globe2, Luggage, MapPin, Plane, Route, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { EasyTFirstVisitTourPrompt } from "@/components/easyt/easyt-product-tour";
import HomeTripStarter from "./home-trip-starter";
import styles from "./home.module.css";

const copy = {
  en: {
    eyebrow: "FOR THE TRIPS WITH MORE MOVING PARTS", titleLead: "Complex trips,", titleMiddle: "made", titleEmphasis: "simple.",
    ledeLead: "For independent travellers planning multi-stop international trips.", ledeBrand: "Morrovia", ledeTail: " gives you a thoughtful first plan, then it's over to you to make it yours.",
    routes: "See featured routes", scratch: "Start from scratch", personal: "Personal, not packaged", useful: "Useful before and during the trip", chapter: "Start with what you know", japan: "Places, timing\nand what matters", routeMeta: "Your trip brief", routeStops: "Tell us where, when and how you want it to feel", exploreJapan: "A Southeast Asia route from Bangkok to Ho Chi Minh City", out: "Useful before you book", nearby: "Passport to destination", nearbyText: "Visa and tourist-entry rules, passport validity and permitted stay, all clearly explained by country.", story: "Plan with confidence", stamps: "Stays where the route settles", stampsText: "Smart suggestions near the places you’ll actually be, not random lists.", openMap: "Check your passport", prep: "Travel prep", prepText: "Weather, packing tips, local basics and things to know before you go.", openPrep: "Open trip prep",
    bangkok: "Bangkok", siemReap: "Siem Reap", phnomPenh: "Phnom Penh", hoChiMinh: "Ho Chi Minh City", nights: "nights", flightOne: "1h 20m by flight", road: "6h by road", flightTwo: "1h 10m by flight", transfers: "3 transfers", countries: "3 countries", stops: "4 stops", totalNights: "11 nights",
  },
  es: {
    eyebrow: "PARA VIAJES CON MÁS PIEZAS QUE ENCAJAR", titleLead: "Viajes complejos,", titleMiddle: "hechos", titleEmphasis: "sencillos.",
    ledeLead: "Para viajeros independientes que planean viajes internacionales con varias paradas.", ledeBrand: "Morrovia", ledeTail: " te ofrece un primer plan pensado y después te deja hacerlo tuyo.",
    routes: "Ver rutas destacadas", scratch: "Empezar desde cero", personal: "Personal, no empaquetado", useful: "Útil antes y durante el viaje", chapter: "Empieza con lo que sabes", japan: "Lugares, fechas\ny lo que importa", routeMeta: "Tu idea de viaje", routeStops: "Cuéntanos dónde, cuándo y cómo quieres que se sienta", exploreJapan: "Una ruta por el Sudeste Asiático de Bangkok a Ciudad Ho Chi Minh", out: "Útil antes de reservar", nearby: "Pasaporte al destino", nearbyText: "Consulta la posición de entrada turística y la estancia permitida para tu pasaporte y destino.", story: "Planifica con confianza", stamps: "Alojamientos donde la ruta se asienta", stampsText: "Encuentra alojamiento cuando la ruta y las noches están listas para actuar.", openMap: "Consultar pasaporte", prep: "Preparativos", prepText: "Mantén las comprobaciones prácticas y los próximos pasos cerca de la ruta que estás planificando.", openPrep: "Abrir preparativos",
    bangkok: "Bangkok", siemReap: "Siem Reap", phnomPenh: "Phnom Penh", hoChiMinh: "Ciudad Ho Chi Minh", nights: "noches", flightOne: "1 h 20 min en vuelo", road: "6 h por carretera", flightTwo: "1 h 10 min en vuelo", transfers: "3 traslados", countries: "3 países", stops: "4 paradas", totalNights: "11 noches",
  },
} as const;

export default function HomeHeroTools({ showHero = true, showTools = true }: { showHero?: boolean; showTools?: boolean }) {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => { setLanguage(languageFromStorage()); const update = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail); window.addEventListener("easyt-language-change", update); return () => window.removeEventListener("easyt-language-change", update); }, []);
  const text = copy[language];
  return <>
    {showHero ? <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{text.eyebrow}</p>
        <h1><span className={styles.heroTitleLead}>{text.titleLead}</span><span className={styles.heroTitleLine}>{text.titleMiddle} <span className={styles.heroTitleEmphasis}>{text.titleEmphasis}</span></span></h1>
        <p className={styles.lede}>{text.ledeLead}<br /><strong>{text.ledeBrand}</strong>{text.ledeTail}</p>
        <EasyTFirstVisitTourPrompt />
        <HomeTripStarter />
      </div>
      <div className={styles.heroRoute} aria-label={text.exploreJapan}>
        <img className={styles.heroRouteMap} src="/journey/illustrations/southeast-asia-route-hero-v3.png" alt="Watercolor route illustration from Bangkok to Siem Reap, Phnom Penh and Ho Chi Minh City" />
        <div className={styles.heroRouteStrip}>
          <div><b>1</b><span><strong>{text.bangkok}</strong><small>3 {text.nights}</small></span></div>
          <em><Plane aria-hidden="true" /> {text.flightOne}</em>
          <div><b>2</b><span><strong>{text.siemReap}</strong><small>3 {text.nights}</small></span></div>
          <em>{text.road}</em>
          <div><b>3</b><span><strong>{text.phnomPenh}</strong><small>2 {text.nights}</small></span></div>
          <em><Plane aria-hidden="true" /> {text.flightTwo}</em>
          <div><b>4</b><span><strong>{text.hoChiMinh}</strong><small>3 {text.nights}</small></span></div>
          <p><Sparkles aria-hidden="true" /> {text.totalNights}<i>•</i> <Route aria-hidden="true" /> {text.transfers}<i>•</i> <Globe2 aria-hidden="true" /> {text.countries}<i>•</i> <MapPin aria-hidden="true" /> {text.stops}</p>
        </div>
      </div>
    </section> : null}
    {showTools ? <section className={styles.tools}>
      <header className={styles.toolsHeader}><p className={styles.eyebrow}>{text.out}</p><h2>{language === "es" ? "Todo en un solo lugar, antes de partir." : "Everything in one place, before you go."}</h2></header>
      <div className={styles.prepGrid}>
        <Link className={`${styles.prepCard} ${styles.prepCardLink}`} href="/journey/passport"><div className={`${styles.prepArtwork} ${styles.prepArt1}`} /><Compass aria-hidden="true" /><h3>{text.nearby}</h3><p>{text.nearbyText}</p><span className={styles.prepCardAction}>{text.openMap} <ArrowRight aria-hidden="true" /></span></Link>
        <article className={styles.prepCard}><div className={`${styles.prepArtwork} ${styles.prepArt2}`} /><BedDouble aria-hidden="true" /><h3>{text.stamps}</h3><p>{text.stampsText}</p></article>
        <article className={styles.prepCard}><div className={`${styles.prepArtwork} ${styles.prepArt3}`} /><Luggage aria-hidden="true" /><h3>{text.prep}</h3><p>{text.prepText}</p></article>
      </div>
    </section> : null}
  </>;
}
