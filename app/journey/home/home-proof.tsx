"use client";

import { MapPinned, Route, Scale } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./home.module.css";
import fidelity from "./home-fidelity.module.css";

const copy = {
  en: {
    eyebrow: "Decisions first", title: "See the decision before the detail.",
    items: [
      [MapPinned, "Your trip, in your words", "Tell us where, when, and what matters."],
      [Route, "We build the best flow", "We order your places for less time travelling and more time enjoying."],
      [Scale, "Nights, trade-offs, your call", "See night recommendations and trade-offs, then make it yours."],
    ],
  },
  es: {
    eyebrow: "Decisiones primero", title: "Ve la decisión antes que el detalle.",
    items: [
      [MapPinned, "Tu viaje, en tus palabras", "Cuéntanos dónde, cuándo y qué importa."],
      [Route, "Creamos el mejor flujo", "Ordenamos tus lugares para pasar menos tiempo viajando y más disfrutando."],
      [Scale, "Noches, alternativas, tu decisión", "Ve las recomendaciones y alternativas de noches; después, hazlo tuyo."],
    ],
  },
} as const;

export default function HomeProof() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);
  const text = copy[language];

  return <section className={styles.proofSection} id="how-it-works" aria-labelledby="real-travel-proof">
    <header><p>{language === "es" ? "VE LA DECISIÓN ANTES QUE EL DETALLE" : "SEE THE DECISION BEFORE THE DETAIL"}</p><h2 id="real-travel-proof">{language === "es" ? "Un camino más claro de la idea al itinerario." : "A clearer path from idea to itinerary."}</h2></header>
    <div className={styles.proofGrid}>{text.items.map(([Icon, title, detail], index) => <article key={title}><div className={`${styles.proofArtwork} ${styles[`proofArt${index + 1}`]} ${fidelity.proofArtwork}`} /><span><b>{index + 1}</b><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{detail}</p></article>)}</div>
  </section>;
}
