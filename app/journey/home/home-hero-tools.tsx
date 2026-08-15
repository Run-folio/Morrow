"use client";

import Link from "next/link";
import { ArrowRight, Sparkles, Stamp, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { trackEvent } from "@/lib/analytics";
import HomeRestaurantFinder from "./restaurant-finder";
import HomeTripStarter from "./home-trip-starter";
import styles from "./home.module.css";
import polish from "./home-polish.module.css";
import stampCard from "./stamp-card.module.css";

const copy = {
  en: { eyebrow: "Travel, with a little more thought", title: "Complex trips, made simple.", lede: "For independent travellers planning multi-stop international trips. Morrovia gives you a thoughtful first plan, then leaves it open for you to make it yours.", routes: "See featured routes", scratch: "Start from scratch", personal: "Personal, not packaged", useful: "Useful before and during the trip", chapter: "Start with what you know", japan: "Places, timing\nand what matters", routeMeta: "Your trip brief", routeStops: "Tell us where, when and how you want it to feel", exploreJapan: "Start shaping a trip", out: "Out and about", nearby: "Find a good place nearby.", nearbyText: "Choose what you need, then Morrovia will search around your current location.", story: "Keep the story", stamps: "Collect your stamps.", stampsText: "Mark the places you’ve lived, loved and returned to. Your map becomes a record of how you travel.", openMap: "Open your map" },
  es: { eyebrow: "Viaja con un poco más de intención", title: "Viajes complejos, simplificados para ti.", lede: "Para viajeros independientes que planean viajes internacionales con varias paradas. Morrovia te da un primer plan pensado y lo deja abierto para que lo hagas tuyo.", routes: "Ver rutas destacadas", scratch: "Empezar desde cero", personal: "Personal, no empaquetado", useful: "Útil antes y durante el viaje", chapter: "Empieza con lo que sabes", japan: "Lugares, fechas\ny lo que importa", routeMeta: "Tu idea de viaje", routeStops: "Cuéntanos dónde, cuándo y cómo quieres que se sienta", exploreJapan: "Empieza a dar forma al viaje", out: "En movimiento", nearby: "Encuentra un buen lugar cerca.", nearbyText: "Elige lo que necesitas y Morrovia buscará alrededor de tu ubicación actual.", story: "Guarda la historia", stamps: "Colecciona tus sellos.", stampsText: "Marca los lugares donde has vivido, amado y regresado. Tu mapa se convierte en un registro de cómo viajas.", openMap: "Abre tu mapa" },
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
      <div className={styles.heroProduct} aria-label={text.exploreJapan}>
        <div className={styles.heroProductFrame}><img src="/journey/product-shots/map-plan-mobile.jpeg" alt="Morrovia map plan, itinerary and nearby options on a phone" /></div>
        <div className={styles.heroProductNote}><span>{text.routeMeta}</span><strong>{text.routeStops}</strong><small>{text.exploreJapan} <ArrowRight aria-hidden="true" /></small></div>
      </div>
    </section> : null}
    {showTools ? <section className={styles.tools}>
      <article className={`${styles.toolCard} ${styles.restaurantCard} ${polish.toolCard}`}><div className={styles.toolIcon}><Utensils aria-hidden="true" /></div><p className={styles.eyebrow}>{text.out}</p><h2>{text.nearby}</h2><p>{text.nearbyText}</p><HomeRestaurantFinder /></article>
      <article className={`${styles.toolCard} ${styles.stampCard} ${stampCard.stampCard} ${polish.toolCard}`}><div className={`${styles.stampMap} ${stampCard.mapLayer}`}><span className={styles.mapDot} /><span className={styles.mapDot} /><span className={styles.mapDot} /><span className={styles.mapLine} /></div><div className={styles.toolIcon}><Stamp aria-hidden="true" /></div><p className={styles.eyebrow}>{text.story}</p><h2>{text.stamps}</h2><p>{text.stampsText}</p><Link className={styles.secondary} href="/journey/stamped" onClick={() => trackEvent("easyt_stamps_opened", { source: "homepage" })}>{text.openMap} <ArrowRight aria-hidden="true" /></Link></article>
    </section> : null}
  </>;
}
