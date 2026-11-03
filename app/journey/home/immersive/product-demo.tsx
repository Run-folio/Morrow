"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { mapTransportIcon } from "@/components/easyt/morrovia-transport-icons";
import { formatTripDuration } from "@/lib/easyt/trip-facts";
import { previewConnections, previewStops } from "./product-preview-data";
import { useHomepageLanguage } from "./use-homepage-language";
import page from "./immersive.module.css";
import styles from "./product-preview.module.css";

const DemoMap = dynamic(() => import("./demo-map"), { ssr: false, loading: () => <div className={styles.mapLoading} aria-hidden="true" /> });

export default function ProductDemo() {
  const [selected, setSelected] = useState<{ id: string } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const section = useRef<HTMLElement>(null);
  const es = useHomepageLanguage() === "es";
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") { setMapReady(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setMapReady(true); observer.disconnect(); } }, { rootMargin: "300px" });
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, []);

  return <section id="product" ref={section} className={`${page.product} ${styles.product}`} aria-labelledby="product-preview-title">
    <header className={page.chapterHeading}><div><span className={page.eyebrow}>{es ? "Todo el viaje a la vista" : "The whole trip, in view"}</span><h2 id="product-preview-title">{es ? "Todo tu viaje." : "Your whole trip."}<em>{es ? "Conectado." : "Connected."}</em></h2></div></header>
    <div className={page.demo}>
      <header className={styles.sampleHeading}><h3>{es ? "Un poco más de Japón." : "A little more Japan."}</h3></header>
      <div className={styles.layout}>
        <div className={styles.mapSlot}>{mapReady ? <DemoMap selected={selected} onSelect={(id) => setSelected({ id })} es={es} /> : <div className={styles.mapLoading} role="status">{es ? "Abriendo el mapa…" : "Opening the route map…"}</div>}</div>
        <aside className={styles.sidebar} aria-label={es ? "Paradas del ejemplo" : "Sample route stops"}>
          <div className={styles.photo}><img src="/journey/immersive/hero-japan-480.webp" alt="" loading="lazy" /><span>{es ? "Espacio para explorar." : "Room to explore."}</span><a href="/journey/immersive/credits.html" aria-label={es ? "Créditos de las imágenes; paisaje imaginado" : "Image credits; imagined landscape"}>{es ? "Créditos" : "Credits"}</a></div>
          <ol className={styles.stops}>{previewStops.map((stop, index) => {
            const incoming = previewConnections[index - 1];
            const Icon = mapTransportIcon(incoming?.mode);
            return <li key={stop.id}>
              {incoming && <div className={styles.connection} aria-label={`${previewStops[index - 1].name} → ${stop.name}`}><Icon aria-hidden="true" /><span>{es ? "Tren" : "Train"} · {incoming.minutes === null ? (es ? "Tiempo por confirmar" : "Timing to confirm") : `${es ? "Estimado" : "Estimated"} ${formatTripDuration(incoming.minutes)}`}</span></div>}
              <EasyTButton variant="quiet" className={styles.stop} data-preview-stop={stop.id} aria-pressed={selected?.id === stop.id} onClick={() => setSelected({ id: stop.id })}><img src={`/journey/immersive/${stop.image}`} alt="" width={44} height={44} loading="lazy" /><strong>{stop.name}</strong><span>{stop.nights} {es ? "noches" : "nights"}</span></EasyTButton>
            </li>;
          })}</ol>
          <div className={styles.cta}><EasyTLinkButton href="#start-building" icon={ArrowUpRight} fullWidth onClick={(event) => { const input = document.querySelector<HTMLInputElement>('#start-building [data-homepage-origin] input'); if (input && !input.disabled) { input.focus(); if (document.activeElement === input) event.preventDefault(); } }}>{es ? "Planifica tu viaje" : "Plan your trip"}</EasyTLinkButton></div>
        </aside>
      </div>
    </div>
  </section>;
}
