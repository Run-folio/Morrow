"use client";

import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { PRODUCT_TOUR_COMPLETE_KEY, shouldShowProductTourPrompt } from "@/lib/easyt/product-tour";
import styles from "./easyt-product-tour.module.css";
import mobileStyles from "./easyt-product-tour-mobile.module.css";

export const PRODUCT_TOUR_OPEN_EVENT = "easyt-open-product-tour";

const copy = {
  en: {
    trigger: "Guide", close: "Close product tour", step: "Step", of: "of", back: "Back", next: "Next", finish: "Done", skip: "Skip tour",
    prompt: "New to Morrovia?", takeTour: "Take a 60-second tour", dismissPrompt: "Dismiss tour invitation",
    steps: [
      { label: "01 · Describe your trip", title: "Start with the trip in your head.", copy: "Tell Morrovia the places or regions, dates, pace and constraints that matter. A short description is enough to begin.", image: "/journey/product-shots/tour/describe-trip.png", mobileImage: "/journey/product-shots/tour/describe-trip-mobile.png", alt: "Morrovia trip description prompt on mobile" },
      { label: "02 · Shape the route", title: "Check the route before the detail.", copy: "Morrovia turns your brief into stops, nights and a sensible order. Review what it understood, resolve assumptions and change anything before the plan is built.", image: "/journey/product-shots/tour/shape-route.png", mobileImage: "/journey/product-shots/tour/shape-route-mobile.png", alt: "Morrovia route shaping screen on mobile" },
      { label: "03 · Use your workspace", title: "Know where to refine the trip.", copy: "Overview surfaces the next decision and Trip Health. Itinerary shapes each day, Map keeps the route visible, and Prep holds practical tasks.", image: "/journey/product-shots/tour/trip-workspace.png", mobileImage: "/journey/product-shots/tour/trip-workspace-mobile.png", alt: "Morrovia trip workspace with Overview, Itinerary, Map and Prep" },
    ],
  },
  es: {
    trigger: "Guía", close: "Cerrar recorrido del producto", step: "Paso", of: "de", back: "Atrás", next: "Siguiente", finish: "Listo", skip: "Omitir recorrido",
    prompt: "¿Primera vez en Morrovia?", takeTour: "Haz el recorrido de 60 segundos", dismissPrompt: "Descartar invitación al recorrido",
    steps: [
      { label: "01 · Describe tu viaje", title: "Empieza con el viaje que tienes en mente.", copy: "Cuéntale a Morrovia los lugares o regiones, fechas, ritmo y límites que importan. Una descripción breve basta para empezar.", image: "/journey/product-shots/tour/describe-trip.png", mobileImage: "/journey/product-shots/tour/describe-trip-mobile.png", alt: "Campo para describir un viaje en Morrovia desde móvil" },
      { label: "02 · Da forma a la ruta", title: "Revisa la ruta antes del detalle.", copy: "Morrovia convierte tu idea en paradas, noches y un orden lógico. Revisa lo entendido, resuelve supuestos y cambia lo necesario antes de crear el plan.", image: "/journey/product-shots/tour/shape-route.png", mobileImage: "/journey/product-shots/tour/shape-route-mobile.png", alt: "Pantalla móvil para dar forma a una ruta en Morrovia" },
      { label: "03 · Usa tu espacio de viaje", title: "Ten claro dónde perfeccionar el viaje.", copy: "Resumen muestra la próxima decisión y el estado del viaje. Itinerario organiza cada día, Mapa mantiene visible la ruta y Preparativos reúne las tareas prácticas.", image: "/journey/product-shots/tour/trip-workspace.png", mobileImage: "/journey/product-shots/tour/trip-workspace-mobile.png", alt: "Espacio de viaje de Morrovia con Resumen, Itinerario, Mapa y Preparativos" },
    ],
  },
} as const;

function rememberTourSeen() {
  try { window.localStorage.setItem(PRODUCT_TOUR_COMPLETE_KEY, "1"); } catch { /* Browser storage is optional. */ }
}

export function EasyTFirstVisitTourPrompt() {
  const [visible, setVisible] = useState(false);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const text = copy[language];

  useEffect(() => {
    setLanguage(languageFromStorage());
    try { setVisible(shouldShowProductTourPrompt(window.localStorage.getItem(PRODUCT_TOUR_COMPLETE_KEY))); } catch { setVisible(true); }
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  if (!visible) return null;
  return <div className={styles.firstVisitPrompt}>
    <span>{text.prompt}</span>
    <button type="button" onClick={() => { setVisible(false); window.dispatchEvent(new Event(PRODUCT_TOUR_OPEN_EVENT)); }}>{text.takeTour}</button>
    <button className={styles.promptDismiss} type="button" aria-label={text.dismissPrompt} onClick={() => { rememberTourSeen(); setVisible(false); }}><X aria-hidden="true" /></button>
  </div>;
}

export default function EasyTProductTour({ triggerLabel, listenForOpen = false, showTrigger = true, dispatchOpen = false }: { triggerLabel?: string; listenForOpen?: boolean; showTrigger?: boolean; dispatchOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const text = copy[language];
  const current = text.steps[step];
  const close = () => { rememberTourSeen(); setOpen(false); };

  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>("button, [href], select, textarea, input, [tabindex]:not([tabindex='-1'])"))
      .filter((element) => !element.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      const firstItem = items[0];
      const lastItem = items.at(-1);
      if (!firstItem || !lastItem) return;
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem.focus(); }
      if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus(); }
    };
    dialog.addEventListener("keydown", trapFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      dialog.removeEventListener("keydown", trapFocus);
      (returnFocusRef.current ?? triggerRef.current)?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!listenForOpen) return;
    const openTour = () => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(PRODUCT_TOUR_OPEN_EVENT, openTour);
    return () => window.removeEventListener(PRODUCT_TOUR_OPEN_EVENT, openTour);
  }, [listenForOpen]);

  return <div className={mobileStyles.tour}>
    {showTrigger ? <button ref={triggerRef} className={styles.trigger} type="button" aria-label={triggerLabel ?? text.trigger} onClick={() => {
      if (dispatchOpen) { window.dispatchEvent(new Event(PRODUCT_TOUR_OPEN_EVENT)); return; }
      returnFocusRef.current = triggerRef.current;
      setStep(0);
      setOpen(true);
    }}>{triggerLabel ?? text.trigger}</button> : null}
    {open ? <div className={styles.overlay} role="presentation" onMouseDown={close}>
      <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="easyt-tour-title" aria-describedby="easyt-tour-description" onMouseDown={(event) => event.stopPropagation()}>
        <button className={styles.close} type="button" onClick={close} aria-label={text.close}><X aria-hidden="true" /></button>
        <div className={styles.visual}><div className={styles.device}><div className={styles.screen}><picture><source media="(max-width: 680px)" srcSet={current.mobileImage} /><img src={current.image} alt={current.alt} /></picture></div></div></div>
        <div className={styles.content}>
          <p className={styles.label}>{current.label}</p>
          <h2 id="easyt-tour-title">{current.title}</h2>
          <p id="easyt-tour-description">{current.copy}</p>
          <div className={styles.dots} aria-live="polite"><span className={styles.srOnly}>{`${text.step} ${step + 1} ${text.of} ${text.steps.length}`}</span>{text.steps.map((item, index) => <i aria-hidden="true" className={index === step ? styles.dotActive : ""} key={item.label} />)}</div>
          <div className={styles.actions}>{step > 0 ? <button className={styles.back} type="button" onClick={() => setStep(step - 1)}><ArrowLeft aria-hidden="true" /> {text.back}</button> : <span />}{step === text.steps.length - 1 ? <button className={styles.next} type="button" onClick={close}><Check aria-hidden="true" /> {text.finish}</button> : <button className={styles.next} type="button" onClick={() => setStep(step + 1)}>{text.next} <ArrowRight aria-hidden="true" /></button>}</div>
          <button className={styles.skip} type="button" onClick={close}>{text.skip}</button>
        </div>
      </section>
    </div> : null}
  </div>;
}
