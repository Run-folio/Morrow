"use client";

import { Clock3, MapPinned, PencilRuler, Stamp } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./home.module.css";

const copy = {
  en: {
    eyebrow: "Made for real travel", title: "Less time wrestling with a plan. More room to enjoy it.",
    items: [
      [PencilRuler, "Plans shaped, not packaged", "Start with a thoughtful route, then change every day, place and suggestion."],
      [MapPinned, "Real places nearby", "Find food and stays around you when you are actually out there."],
      [Clock3, "Time protected", "See transfer and pacing signals before a day becomes too ambitious."],
      [Stamp, "Memories kept", "Turn countries, notes and small moments into a record you will want to revisit."],
    ],
  },
  es: {
    eyebrow: "Hecho para viajar de verdad", title: "Menos tiempo peleando con un plan. Más espacio para disfrutarlo.",
    items: [
      [PencilRuler, "Planes a tu medida, no paquetes", "Empieza con una ruta pensada y cambia cada día, lugar y sugerencia."],
      [MapPinned, "Lugares reales cerca", "Encuentra comida y alojamiento cerca de ti cuando ya estás en el viaje."],
      [Clock3, "Tiempo protegido", "Ve señales de traslados y ritmo antes de que un día sea demasiado ambicioso."],
      [Stamp, "Recuerdos guardados", "Convierte países, notas y pequeños momentos en un registro que querrás revisitar."],
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
