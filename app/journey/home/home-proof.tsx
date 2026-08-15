"use client";

import { MapPinned, Route, Scale } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./home.module.css";

const copy = {
  en: {
    eyebrow: "Decisions first", title: "See the decision before the detail.",
    items: [
      [MapPinned, "Your trip, in your words", "Share the places, dates and priorities that matter. Morrovia keeps the important parts in view."],
      [Route, "We build the best flow", "See the route order, transfers and the reason the sequence works before you commit to it."],
      [Scale, "Nights, trade-offs, your call", "Compare a realistic rhythm with faster or slower alternatives, then make the plan your own."],
    ],
  },
  es: {
    eyebrow: "Decisiones primero", title: "Ve la decisión antes que el detalle.",
    items: [
      [MapPinned, "Tu viaje, en tus palabras", "Comparte los lugares, fechas y prioridades que importan. Morrovia mantiene lo importante a la vista."],
      [Route, "Creamos el mejor flujo", "Ve el orden de la ruta, los traslados y por qué funciona la secuencia antes de decidir."],
      [Scale, "Noches, alternativas, tu decisión", "Compara un ritmo realista con alternativas más rápidas o más lentas y haz el plan tuyo."],
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

  return <section className={styles.proofSection} aria-labelledby="real-travel-proof">
    <header><p>{text.eyebrow}</p><h2 id="real-travel-proof">{text.title}</h2></header>
    <div className={styles.proofGrid}>{text.items.map(([Icon, title, detail]) => <article key={title}><span><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{detail}</p></article>)}</div>
  </section>;
}
