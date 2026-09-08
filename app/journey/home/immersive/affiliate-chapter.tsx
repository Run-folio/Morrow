"use client";

import { useEffect, useRef, useState } from "react";
import { BedDouble, Compass, Route, Wifi } from "lucide-react";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { affiliateDisclosure, MorroviaAffiliateLink } from "@/components/easyt/affiliate-link";
import ResilientImage from "@/components/easyt/resilient-image";
import { affiliateProviderLabel, getCurrentPartnerAction } from "@/lib/easyt/booking-readiness";
import { homepageAffiliateImage } from "@/lib/easyt/homepage-affiliate-imagery";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";

const needs = [
  { category: "accommodation", label: "Stays", es: "Alojamiento", cta: "Find a stay", ctaEs: "Busca alojamiento", placement: "homepage_stays", icon: BedDouble },
  { category: "activities", label: "Experiences", es: "Experiencias", cta: "Explore experiences", ctaEs: "Explora experiencias", placement: "homepage_experiences", icon: Compass },
  { category: "transport", label: "Transport", es: "Transporte", cta: "Compare transport", ctaEs: "Compara transporte", placement: "homepage_transport", icon: Route },
  { category: "connectivity", label: "Connectivity", es: "Conectividad", cta: "Stay connected", ctaEs: "Mantente conectado", placement: "homepage_connectivity", icon: Wifi },
] as const;

export default function AffiliateChapter({ routeKey }: { routeKey: string }) {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const container = useRef<HTMLElement>(null);
  const es = useHomepageLanguage() === "es";
  const visual = homepageAffiliateImage(routeKey, needs[active].category);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "350px" });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    // Warm one adjacent category after the active image, never all sixteen.
    const timer = setTimeout(() => {
      const next = homepageAffiliateImage(routeKey, needs[(active + 1) % needs.length].category);
      if (next) { const image = new Image(); image.src = next.variants[innerWidth < 600 ? 0 : 1].src; }
    }, 1800);
    return () => clearTimeout(timer);
  }, [routeKey, active, visible]);
  return <section id="booking-support" ref={container} className={styles.booking}>
    <header className={styles.chapterHeading}><div><span className={styles.eyebrow}>{es ? "Cuando tu viaje toma forma" : "When your trip takes shape"}</span><h2>{es ? "Planifícalo aquí." : "Plan it here."}<em>{es ? "Reserva cuando quieras." : "Book when you’re ready."}</em></h2></div></header>
    <div className={styles.bookingComposition}><figure className={styles.bookingImage}>
      {visible && visual ? <ResilientImage key={visual.file} src={visual.variants[1].src} srcSet={visual.variants.map((variant) => `${variant.src} ${variant.width}w`).join(", ")} sizes="(max-width:840px) 90vw, 44vw" width={768} height={511} alt={visual.alt} loading="lazy" decoding="async" fallback={<div className={styles.imageFallback} aria-label={es ? "Imagen no disponible" : "Image unavailable"} />} /> : null}
      <figcaption><span>{visual?.label} · {es ? needs[active].es : needs[active].label}</span><em>{es ? "Una parte más de tu viaje." : visual?.context}</em></figcaption>
    </figure><div className={styles.partnerActions}>{needs.map((need, index) => {
      const action = getCurrentPartnerAction(need.category);
      const Icon = need.icon;
      return <div key={need.category} data-active={active === index} onPointerEnter={() => setActive(index)} onFocusCapture={() => setActive(index)}><Icon aria-hidden="true" /><div><EasyTButton variant="quiet" className={styles.needSelect} aria-pressed={active === index} onClick={() => setActive(index)}>{es ? need.es : need.label}</EasyTButton>{action ? <><MorroviaAffiliateLink action={{ ...action, cta: es ? need.ctaEs : need.cta }} context={{ placement: need.placement }} variant="quiet" /><small>{affiliateProviderLabel(action.provider)}{need.category === "transport" ? (es ? " · cobertura según ruta" : " · coverage varies by route") : ""}</small></> : <p>{es ? "Opciones no disponibles" : "Options currently unavailable"}</p>}</div></div>;
    })}</div></div>
    <p className={styles.partnerDisclosure}>{es ? "Enlaces de socios · Morrovia puede recibir una comisión sin coste adicional para ti." : affiliateDisclosure}</p>
  </section>;
}
