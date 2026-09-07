"use client";

import { useEffect, useState } from "react";
import { ArrowDown, Pause } from "lucide-react";
import EasyTNavigation from "../../easyt-navigation";
import HomeTripStarter from "../home-trip-starter";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";
import RouteChapters from "./route-chapters";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import ProductDemo from "./product-demo";
import AffiliateChapter from "./affiliate-chapter";
import ClosingChapter from "./closing-chapter";

export default function ImmersiveHome({ routes, initialIndex }: { routes: ImmersiveRoute[]; initialIndex: number }) {
  const language = useHomepageLanguage();
  const es = language === "es";
  const [quiet, setQuiet] = useState(false);
  const [systemQuiet, setSystemQuiet] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setSystemQuiet(media.matches);
    change(); media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return <main className={styles.page} data-quiet={quiet || systemQuiet}>
    <a className={styles.skip} href="#start-building">{es ? "Ir al formulario" : "Skip to trip prompt"}</a>
    <section id="hero" className={styles.hero} onPointerMove={(event) => {
      if (quiet || systemQuiet || event.pointerType !== "mouse" || event.currentTarget.matches(":focus-within")) return;
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.style.setProperty("--depth-x", `${((event.clientX - rect.left) / rect.width - .5) * 10}px`);
    }} onPointerLeave={(event) => event.currentTarget.style.setProperty("--depth-x", "0px")}>
      <img className={styles.landscape} src="/journey/immersive/hero-1536.webp" srcSet="/journey/immersive/hero-480.webp 480w, /journey/immersive/hero-768.webp 768w, /journey/immersive/hero-1536.webp 1536w" sizes="100vw" width={1536} height={1024} alt="" fetchPriority="high" />
      <div className={styles.heroShade} />
      <div className={styles.navigation}><EasyTNavigation current="home" landing deferPrefetch /></div>
      <div className={styles.heroBody}>
        <div className={styles.heroCopy}><span className={styles.eyebrow}>{es ? "Viajes complejos, hechos sencillos." : "Complex trips, made simple."}</span><h1>{es ? "Ve más lejos." : "Go further."}<em>{es ? "Hazlo tuyo." : "Make it yours."}</em></h1><p>{es ? "Convierte tus ideas en una primera ruta pensada. Después, hazla tuya." : "Turn your multi-stop ideas into a thoughtful first route. Then make it your own."}</p></div>
        <div className={styles.planner}><HomeTripStarter /></div>
      </div>
      <div className={styles.heroBottom}><span>{es ? "Paisaje imaginado · inspirado en los Andes" : "Imagined landscape · inspired by the Andes"}</span><EasyTButton variant="quiet" icon={Pause} aria-pressed={quiet || systemQuiet} disabled={systemQuiet} onClick={() => setQuiet(!quiet)}>{systemQuiet ? (es ? "Movimiento reducido" : "Reduced motion") : (es ? "Vista tranquila" : "Quiet view")}</EasyTButton><a href="#routes">{es ? "De una idea a un viaje" : "From an idea to a journey"} <ArrowDown aria-hidden="true" /></a></div>
    </section>
    <RouteChapters quiet={quiet || systemQuiet} routes={routes} initialIndex={initialIndex}>{(route, change) => <><ProductDemo route={route} routes={routes} change={change} /><AffiliateChapter routeKey={route.key} /></>}</RouteChapters>
    <ClosingChapter />
  </main>;
}
