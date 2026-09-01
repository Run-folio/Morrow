"use client";

import Link from "next/link";
import { ArrowRight, BedDouble, Route, Signal, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { affiliateProviderLabel, getCurrentPartnerAction, type CurrentPartnerCategory, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import { affiliateDisclosure, MorroviaAffiliateLink } from "@/components/easyt/affiliate-link";
import styles from "./home.module.css";
import fidelity from "./home-fidelity.module.css";

const copy = {
  en: { title: "A first route is a better place to start.", lede: "Tell us the shape of your trip and we’ll do the hard part. The rest stays in your hands.", action: "Start my trip" },
  es: { title: "Una primera ruta es un mejor lugar para empezar.", lede: "Cuéntanos la forma de tu viaje y haremos la parte difícil; después, el resto queda en tus manos.", action: "Empezar mi viaje" },
} as const;

export type HomePartnerActions = Partial<Record<CurrentPartnerCategory, ResolvedAffiliateAction | null>>;

const partnerCards: Array<{ category: CurrentPartnerCategory; icon: LucideIcon; placement: string }> = [
  { category: "accommodation", icon: BedDouble, placement: "homepage_stays" },
  { category: "activities", icon: Sparkles, placement: "homepage_experiences" },
  { category: "transport", icon: Route, placement: "homepage_transport" },
  { category: "connectivity", icon: Signal, placement: "homepage_connectivity" },
];

const partnerCopy = {
  en: {
    eyebrow: "Around your trip", title: "Plan it here. Book what you need when you’re ready.", detail: "Morrovia keeps the plan connected, then helps you reach trusted booking options when the time is right.", provider: "Booking options from", unavailable: "Booking options unavailable",
    cards: { accommodation: ["Find a stay", "Accommodation options for each stop."], activities: ["Explore experiences", "Tours and activities around your route."], transport: ["Compare transport", "Train, bus and other options between stops."], connectivity: ["Stay connected", "Set up an eSIM before you travel."] },
  },
  es: {
    eyebrow: "Alrededor de tu viaje", title: "Planifícalo aquí. Reserva lo que necesites cuando estés listo.", detail: "Morrovia mantiene el plan conectado y te ayuda a llegar a opciones de reserva fiables en el momento adecuado.", provider: "Opciones de reserva de", unavailable: "Opciones de reserva no disponibles",
    cards: { accommodation: ["Encuentra alojamiento", "Opciones de alojamiento para cada parada."], activities: ["Explora experiencias", "Tours y actividades a lo largo de tu ruta."], transport: ["Compara transporte", "Trenes, autobuses y otras opciones entre paradas."], connectivity: ["Mantente conectado", "Configura una eSIM antes de viajar."] },
  },
} as const;

export function HomePartnerEssentials({ actions, language = "en" }: { actions?: HomePartnerActions; language?: EasyTLanguage }) {
  const resolved = (category: CurrentPartnerCategory) => actions && Object.prototype.hasOwnProperty.call(actions, category)
    ? actions[category]
    : getCurrentPartnerAction(category);
  const text = partnerCopy[language];
  return <section className={styles.partnerEssentials} aria-labelledby="home-partner-essentials-title">
    <header>
      <p className={styles.eyebrow}>{text.eyebrow}</p>
      <h2 id="home-partner-essentials-title">{text.title}</h2>
      <p>{text.detail}</p>
    </header>
    <div className={`${styles.prepGrid} ${styles.partnerGrid}`}>
      {partnerCards.map(({ category, icon: Icon, placement }) => {
        const action = resolved(category);
        const [title, detail] = text.cards[category];
        return <article className={`${styles.prepCard} ${styles.partnerCard}`} key={category}>
          <Icon aria-hidden="true" />
          <span>{action ? `${text.provider} ${affiliateProviderLabel(action.provider)}` : text.unavailable}</span>
          <h3>{title}</h3>
          <p>{detail}</p>
          {action ? <MorroviaAffiliateLink action={action} context={{ placement }} fullWidth /> : null}
        </article>;
      })}
    </div>
    <small className={styles.partnerDisclosure}>{affiliateDisclosure}</small>
  </section>;
}

export default function HomeFooter() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => { setLanguage(languageFromStorage()); const update = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail); window.addEventListener("easyt-language-change", update); return () => window.removeEventListener("easyt-language-change", update); }, []);
  const text = copy[language];
  return <div className={styles.homeFooter}>
    <section className={`${styles.footerCta} ${fidelity.footerCta}`}>
      <img
        src="/journey/illustrations/home-closing-banner-v2.webp"
        alt=""
        width="1942"
        height="809"
        loading="lazy"
        decoding="async"
        fetchPriority="low"
      />
      <div className={`${styles.footerCtaCopy} ${fidelity.footerCtaCopy}`}><p className={styles.eyebrow}>{language === "es" ? "EMPIEZA CON LA RUTA" : "START WITH THE ROUTE"}</p><h2>{text.title}</h2><p>{text.lede}</p><div className={styles.footerCtaActions}><Link className={styles.footerAction} href="/journey/new"><Sparkles aria-hidden="true" /> {text.action} <ArrowRight aria-hidden="true" /></Link></div></div>
    </section>
    <HomePartnerEssentials language={language} />
  </div>;
}
