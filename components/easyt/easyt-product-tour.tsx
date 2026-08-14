"use client";

import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./easyt-product-tour.module.css";
import mobileStyles from "./easyt-product-tour-mobile.module.css";

const copy = {
  en: {
    trigger: "Guide", close: "Close product tour", step: "Step", of: "of", back: "Back", next: "Next", finish: "Start exploring", skip: "Skip tour",
    steps: [
      { label: "01 · Find a direction", title: "Start with a feeling, not a blank form.", copy: "Browse routes with a point of view, or start from scratch. Every route is a useful first thought, not a fixed package.", image: "/journey/product-shots/map-plan-mobile.jpeg", alt: "Morrovia itinerary and map" },
      { label: "02 · Make it yours", title: "Set the pace before Morrovia starts suggesting.", copy: "Your travel profile sets the starting rhythm: slow or full days, what draws you in, comfort level and how often you want to move hotels.", image: "/journey/product-shots/profile-mobile.jpeg", alt: "Morrovia travel profile" },
      { label: "03 · Shape the route", title: "Put time where it matters.", copy: "Choose places, then adjust the days. Morrovia makes the trade-offs visible so the plan has room to breathe.", image: "/journey/product-shots/time-mobile.jpeg", alt: "Morrovia time allocation" },
      { label: "04 · Use it out there", title: "Your itinerary stays useful on the move.", copy: "Open the map for the day, find a place to eat or stay nearby, add a pin, and keep notes attached to the right day.", image: "/journey/product-shots/finder-mobile.jpeg", alt: "Morrovia nearby finder" },
      { label: "05 · Keep the story", title: "Turn travel into a personal record.", copy: "Stamps is where countries, photos and small memories collect over time, beyond a single trip.", image: "/journey/product-shots/stamps-mobile.jpeg", alt: "Morrovia Stamps" },
    ],
  },
  es: {
    trigger: "Guía", close: "Cerrar recorrido del producto", step: "Paso", of: "de", back: "Atrás", next: "Siguiente", finish: "Empezar a explorar", skip: "Omitir recorrido",
    steps: [
      { label: "01 · Encuentra una dirección", title: "Empieza con una sensación, no con un formulario vacío.", copy: "Explora rutas con un punto de vista o empieza desde cero. Cada ruta es una buena primera idea, no un paquete fijo.", image: "/journey/product-shots/map-plan-mobile.jpeg", alt: "Itinerario y mapa de Morrovia" },
      { label: "02 · Hazla tuya", title: "Define el ritmo antes de que Morrovia empiece a sugerir.", copy: "Tu perfil de viaje establece el ritmo inicial: días lentos o intensos, lo que te atrae, el nivel de comodidad y la frecuencia con la que quieres cambiar de hotel.", image: "/journey/product-shots/profile-mobile.jpeg", alt: "Perfil de viaje de Morrovia" },
      { label: "03 · Da forma a la ruta", title: "Pon el tiempo donde importa.", copy: "Elige lugares y ajusta los días. Morrovia hace visibles las decisiones para que el plan tenga espacio para respirar.", image: "/journey/product-shots/time-mobile.jpeg", alt: "Distribución de tiempo de Morrovia" },
      { label: "04 · Úsala en el momento", title: "Tu itinerario sigue siendo útil cuando estás fuera.", copy: "Abre el mapa del día, encuentra dónde comer o dormir cerca, añade un pin y guarda notas en el día correcto.", image: "/journey/product-shots/finder-mobile.jpeg", alt: "Buscador cercano de Morrovia" },
      { label: "05 · Conserva la historia", title: "Convierte los viajes en un registro personal.", copy: "Sellos reúne países, fotos y recuerdos pequeños a lo largo del tiempo, más allá de un solo viaje.", image: "/journey/product-shots/stamps-mobile.jpeg", alt: "Sellos de Morrovia" },
    ],
  },
} as const;

export default function EasyTProductTour({ triggerLabel }: { triggerLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const text = copy[language];
  const current = text.steps[step];
  const close = () => { window.localStorage.setItem("easyt-product-tour-complete", "1"); setOpen(false); };

  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  useEffect(() => {
    const openTour = () => { setStep(0); setOpen(true); };
    window.addEventListener("easyt-open-product-tour", openTour);
    return () => window.removeEventListener("easyt-open-product-tour", openTour);
  }, []);

  return <div className={mobileStyles.tour}>
    <button className={styles.trigger} type="button" aria-label={triggerLabel ?? text.trigger} onClick={() => { setStep(0); setOpen(true); }}>{triggerLabel ?? text.trigger}</button>
    {open ? <div className={styles.overlay} role="presentation" onMouseDown={close}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="easyt-tour-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className={styles.close} type="button" onClick={close} aria-label={text.close}><X aria-hidden="true" /></button>
        <div className={styles.visual}><div className={styles.phone}><div className={styles.speaker} /><div className={styles.screen}><img src={current.image} alt={current.alt} /></div></div></div>
        <div className={styles.content}><p className={styles.label}>{current.label}</p><h2 id="easyt-tour-title">{current.title}</h2><p>{current.copy}</p><div className={styles.dots} aria-label={`${text.step} ${step + 1} ${text.of} ${text.steps.length}`}>{text.steps.map((item, index) => <i className={index === step ? styles.dotActive : ""} key={item.label} />)}</div><div className={styles.actions}>{step > 0 ? <button className={styles.back} type="button" onClick={() => setStep(step - 1)}><ArrowLeft aria-hidden="true" /> {text.back}</button> : <span />}{step === text.steps.length - 1 ? <button className={styles.next} type="button" onClick={close}><Check aria-hidden="true" /> {text.finish}</button> : <button className={styles.next} type="button" onClick={() => setStep(step + 1)}>{text.next} <ArrowRight aria-hidden="true" /></button>}</div><button className={styles.skip} type="button" onClick={close}>{text.skip}</button></div>
      </section>
    </div> : null}
  </div>;
}
