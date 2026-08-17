"use client";

import Link from "next/link";
import { ArrowRight, Signal, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./home.module.css";
import fidelity from "./home-fidelity.module.css";

const copy = {
  en: { title: "A first route is a better place to start.", lede: "Tell us the shape of your trip and we’ll do the hard part—then leave the rest in your hands.", action: "Start my trip", copyright: "© 2026 Morrovia Ltd. All rights reserved.", about: "About", privacy: "Privacy", terms: "Terms", help: "Help", partnerTitle: "Stay connected, wherever the route takes you.", partnerBody: "Choose a travel eSIM before you leave, so maps, tickets and the useful details stay within reach.", partnerAction: "Explore Saily eSIMs", partnerDisclosure: "Partner link · Morrovia may earn a commission at no extra cost to you." },
  es: { title: "Una primera ruta es un mejor lugar para empezar.", lede: "Cuéntanos la forma de tu viaje y haremos la parte difícil; después, el resto queda en tus manos.", action: "Empezar mi viaje", copyright: "© 2026 Morrovia Ltd. Todos los derechos reservados.", about: "Acerca de", privacy: "Privacidad", terms: "Términos", help: "Ayuda", partnerTitle: "Mantente conectado, dondequiera que te lleve la ruta.", partnerBody: "Elige una eSIM de viaje antes de salir para tener mapas, billetes y los detalles útiles siempre a mano.", partnerAction: "Ver las eSIM de Saily", partnerDisclosure: "Enlace de socio · Morrovia puede recibir una comisión sin coste adicional para ti." },
} as const;

export default function HomeFooter() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => { setLanguage(languageFromStorage()); const update = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail); window.addEventListener("easyt-language-change", update); return () => window.removeEventListener("easyt-language-change", update); }, []);
  const text = copy[language];
  return <footer className={styles.homeFooter}>
    <section className={`${styles.footerCta} ${fidelity.footerCta}`}>
      <img src="/journey/illustrations/home-closing-banner-v2.png" alt="" />
      <div className={`${styles.footerCtaCopy} ${fidelity.footerCtaCopy}`}><p className={styles.eyebrow}>{language === "es" ? "EMPIEZA CON LA RUTA" : "START WITH THE ROUTE"}</p><h2>{text.title}</h2><p>{text.lede}</p><div className={styles.footerCtaActions}><Link className={styles.footerPrompt} href="/journey/new">{language === "es" ? "¿Dónde, cuándo y qué importa más?" : "Where to, when, and what matters most?"}</Link><Link className={styles.footerAction} href="/journey/new"><Sparkles aria-hidden="true" /> {text.action} <ArrowRight aria-hidden="true" /></Link></div></div>
    </section>
    <section className={styles.sailyBanner} aria-label="Saily travel eSIM">
      <div className={styles.sailyLogo}><img src="/journey/partners/saily-logo-negative-bg.svg" alt="Saily" /></div>
      <div className={styles.sailyCopy}><span><Signal aria-hidden="true" /> {language === "es" ? "CONECTIVIDAD DE VIAJE" : "TRAVEL CONNECTIVITY"}</span><h2>{text.partnerTitle}</h2><p>{text.partnerBody}</p></div>
      <div className={styles.sailyAction}><a href="https://go.saily.site/aff_c?offer_id=101&aff_id=16085" target="_blank" rel="noreferrer sponsored">{text.partnerAction} <ArrowRight aria-hidden="true" /></a><small>{text.partnerDisclosure}</small></div>
    </section>
    <div className={styles.footerBottom}>
      <Link className={styles.footerBrand} href="/journey/home">Morrovia</Link>
      <p>{text.copyright}</p>
      <nav aria-label="Footer"><Link href="/journey/home">{text.about}</Link><Link href="/journey/privacy">{text.privacy}</Link><Link href="/journey/privacy">{text.terms}</Link><Link href="/journey/home">{text.help}</Link></nav>
    </div>
  </footer>;
}
