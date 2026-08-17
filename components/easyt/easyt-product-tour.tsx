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
      { label: "01 · Start with the places", title: "A complex trip starts with the stops that matter.", copy: "Tell Morrovia where you want to go and what cannot move. You stay in control of every place from the start.", image: "/journey/product-shots/map-plan-mobile.jpeg", alt: "Morrovia itinerary and map" },
      { label: "02 · Set the time", title: "Confirm the dates, then make the nights work.", copy: "Give each stop the time it deserves. If the plan no longer fits, Morrovia makes the date trade-off clear before anything changes.", image: "/journey/product-shots/time-mobile.jpeg", alt: "Morrovia time allocation" },
      { label: "03 · Make the route work", title: "See the cleaner route before you commit.", copy: "Morrovia flags backtracking and travel-heavy days, then lets you choose the order that feels right for the trip.", image: "/journey/product-shots/profile-mobile.jpeg", alt: "Morrovia route choices" },
      { label: "04 · Use it out there", title: "Your itinerary stays useful on the move.", copy: "Open the map for the day, find a place to eat or stay nearby, add a pin, and keep notes attached to the right day.", image: "/journey/product-shots/finder-mobile.jpeg", alt: "Morrovia nearby finder" },
      { label: "05 · Keep the story", title: "Turn travel into a personal record.", copy: "Stamps is where countries, photos and small memories collect over time, beyond a single trip.", image: "/journey/product-shots/stamps-mobile.jpeg", alt: "Morrovia Stamps" },
    ],
  },
  es: {
    trigger: "Guía", close: "Cerrar recorrido del producto", step: "Paso", of: "de", back: "Atrás", next: "Siguiente", finish: "Empezar a explorar", skip: "Omitir recorrido",
    steps: [
      { label: "01 · Empieza por los lugares", title: "Un viaje complejo empieza por las paradas que importan.", copy: "Cuéntale a Morrovia adónde quieres ir y qué no puede cambiar. Mantienes el control de cada lugar desde el principio.", image: "/journey/product-shots/map-plan-mobile.jpeg", alt: "Itinerario y mapa de Morrovia" },
      { label: "02 · Define el tiempo", title: "Confirma las fechas y haz que las noches encajen.", copy: "Da a cada parada el tiempo que merece. Si el plan deja de encajar, Morrovia muestra claramente el cambio de fechas antes de modificar nada.", image: "/journey/product-shots/time-mobile.jpeg", alt: "Distribución de tiempo de Morrovia" },
      { label: "03 · Haz que la ruta funcione", title: "Ve la ruta más directa antes de comprometerte.", copy: "Morrovia señala los retrocesos y los días de viaje pesados, y te deja elegir el orden que mejor encaja con el viaje.", image: "/journey/product-shots/profile-mobile.jpeg", alt: "Opciones de ruta de Morrovia" },
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
