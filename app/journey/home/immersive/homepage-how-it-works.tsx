"use client";

import { ChevronDown, Compass, Luggage, Route } from "lucide-react";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { useId, useRef, useState } from "react";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";

const steps = {
  en: [
    { title: "Start your trip", copy: "Choose destinations or describe the trip you have in mind.", icon: Compass },
    { title: "Plan your route", copy: "Reorder stops and choose how many nights to spend in each.", icon: Route },
    { title: "Open Overview", copy: "Plan connections in Transport, find accommodation in Stay and add activities in Itinerary.", icon: Luggage },
  ],
  es: [
    { title: "Empieza tu viaje", copy: "Elige destinos o describe el viaje que tienes en mente.", icon: Compass },
    { title: "Planifica tu ruta", copy: "Ordena las paradas y elige cuántas noches pasar en cada una.", icon: Route },
    { title: "Abre el Resumen", copy: "Planifica los traslados en Transporte, busca dónde dormir en Alojamiento y añade actividades en Itinerario.", icon: Luggage },
  ],
};

export default function HomepageHowItWorks() {
  const language = useHomepageLanguage();
  const es = language === "es";
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  return <section id="how-it-works" className={styles.howItWorks} aria-label={es ? "Cómo funciona" : "How it works"} onKeyDown={(event) => {
    if (expanded && event.key === "Escape") { event.preventDefault(); setExpanded(false); triggerRef.current?.focus(); }
  }}>
    <header className={styles.howHeading}>
      {expanded ? <div><h2 id="homepage-how-heading">{es ? "Cómo funciona" : "How it works"}</h2></div> : null}
      <EasyTButton ref={triggerRef} variant="quiet" icon={ChevronDown} aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded((current) => !current)}>{expanded ? es ? "Ocultar cómo funciona" : "Hide how it works" : es ? "Ver cómo funciona" : "See how it works"}</EasyTButton>
    </header>
    <div id={panelId} hidden={!expanded}><ol className={styles.howSteps}>
      {steps[language].map(({ title, copy, icon: Icon }, index) => <li key={title}>
        <span className={styles.howStepIcon}><Icon aria-hidden="true" /></span>
        <span className={styles.howStepNumber}>{String(index + 1).padStart(2, "0")}</span>
        <div><h3>{title}</h3><p>{copy}</p></div>
      </li>)}
    </ol></div>
  </section>;
}
