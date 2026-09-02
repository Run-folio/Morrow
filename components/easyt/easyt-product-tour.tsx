"use client";

import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { PRODUCT_TOUR_COMPLETE_KEY, shouldShowProductTourPrompt } from "@/lib/easyt/product-tour";
import styles from "./easyt-product-tour.module.css";
import mobileStyles from "./easyt-product-tour-mobile.module.css";

export const PRODUCT_TOUR_OPEN_EVENT = "easyt-open-product-tour";
export const PRODUCT_TOUR_STATE_EVENT = "easyt-product-tour-state";

const copy = {
  en: {
    trigger: "Guide", close: "Close product tour", step: "Step", of: "of", back: "Back", next: "Next", finish: "Done", skip: "Skip tour",
    prompt: "New to Morrovia?", takeTour: "Take a 60-second tour", dismissPrompt: "Dismiss tour invitation",
    steps: [
      { label: "01 · Describe your trip", title: "Start with the trip in your head.", copy: "Tell Morrovia where you want to go, how long you have and what matters most. A few lines are enough.", image: "/journey/product-shots/tour/describe-trip.png", mobileImage: "/journey/product-shots/tour/describe-trip-mobile.png", alt: "Trip prompt for seven nights across Cusco, the Sacred Valley and Arequipa" },
      { label: "02 · Review your route", title: "Start with a route that makes sense.", copy: "Morrovia suggests the order, nights and travel days. You can change anything before you continue.", image: "/journey/product-shots/tour/shape-route.png", mobileImage: "/journey/product-shots/tour/shape-route-mobile.png", alt: "Route review showing Cusco, the Sacred Valley and Arequipa with nights and transfers" },
      { label: "03 · See the whole trip", title: "Know what needs attention next.", copy: "Overview keeps your route, bookings and practical tasks together, so the next useful step is clear.", image: "/journey/product-shots/tour/trip-workspace.png", mobileImage: "/journey/product-shots/tour/trip-workspace-mobile.png", alt: "Overview for the Peru trip showing the next step, Trip Health and planning progress" },
      { label: "04 · Explore the Map", title: "See how the whole trip connects.", copy: "Focus a stop, find useful places and refine the route without losing the bigger picture.", image: "/journey/product-shots/tour/map-workspace.png", mobileImage: "/journey/product-shots/tour/map-workspace-mobile.png", alt: "Map of the Cusco, Sacred Valley and Arequipa route with Cusco selected" },
      { label: "05 · Shape each day", title: "Make the itinerary yours.", copy: "Add activities, move things around and keep travel and bookings in context as the plan takes shape.", image: "/journey/product-shots/tour/itinerary-workspace.png", mobileImage: "/journey/product-shots/tour/itinerary-workspace-mobile.png", alt: "Populated Cusco day with activities, day parts and planning actions" },
    ],
  },
  es: {
    trigger: "Guía", close: "Cerrar recorrido del producto", step: "Paso", of: "de", back: "Atrás", next: "Siguiente", finish: "Listo", skip: "Omitir recorrido",
    prompt: "¿Primera vez en Morrovia?", takeTour: "Haz el recorrido de 60 segundos", dismissPrompt: "Descartar invitación al recorrido",
    steps: [
      { label: "01 · Describe tu viaje", title: "Empieza con el viaje que tienes en mente.", copy: "Cuéntale a Morrovia adónde quieres ir, cuánto tiempo tienes y qué te importa más. Unas líneas bastan.", image: "/journey/product-shots/tour/describe-trip.png", mobileImage: "/journey/product-shots/tour/describe-trip-mobile.png", alt: "Descripción de siete noches entre Cusco, el Valle Sagrado y Arequipa" },
      { label: "02 · Revisa tu ruta", title: "Empieza con una ruta que tenga sentido.", copy: "Morrovia sugiere el orden, las noches y los días de traslado. Puedes cambiar cualquier cosa antes de continuar.", image: "/journey/product-shots/tour/shape-route.png", mobileImage: "/journey/product-shots/tour/shape-route-mobile.png", alt: "Ruta por Cusco, el Valle Sagrado y Arequipa con noches y traslados" },
      { label: "03 · Ve todo el viaje", title: "Ten claro qué necesita atención.", copy: "Resumen mantiene juntas la ruta, las reservas y las tareas prácticas para que el siguiente paso esté claro.", image: "/journey/product-shots/tour/trip-workspace.png", mobileImage: "/journey/product-shots/tour/trip-workspace-mobile.png", alt: "Resumen del viaje por Perú con el siguiente paso, el estado y el progreso" },
      { label: "04 · Explora el Mapa", title: "Ve cómo se conecta todo el viaje.", copy: "Céntrate en una parada, encuentra lugares útiles y ajusta la ruta sin perder la visión general.", image: "/journey/product-shots/tour/map-workspace.png", mobileImage: "/journey/product-shots/tour/map-workspace-mobile.png", alt: "Mapa de la ruta por Cusco, el Valle Sagrado y Arequipa con Cusco seleccionado" },
      { label: "05 · Organiza cada día", title: "Haz tuyo el itinerario.", copy: "Añade actividades, cambia el orden y mantén los traslados y reservas en contexto mientras el plan toma forma.", image: "/journey/product-shots/tour/itinerary-workspace.png", mobileImage: "/journey/product-shots/tour/itinerary-workspace-mobile.png", alt: "Día completo en Cusco con actividades, momentos del día y acciones de planificación" },
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
  return <div className={styles.firstVisitPrompt} data-product-tour-prompt="true">
    <span>{text.prompt}</span>
    <button type="button" onClick={() => { setVisible(false); window.dispatchEvent(new Event(PRODUCT_TOUR_OPEN_EVENT)); }}>{text.takeTour}</button>
    <button className={styles.promptDismiss} type="button" aria-label={text.dismissPrompt} onClick={() => { rememberTourSeen(); setVisible(false); window.dispatchEvent(new CustomEvent(PRODUCT_TOUR_STATE_EVENT, { detail: { open: false } })); }}><X aria-hidden="true" /></button>
  </div>;
}

export default function EasyTProductTour({ triggerLabel, listenForOpen = false, showTrigger = true, dispatchOpen = false, initialStep = 0 }: { triggerLabel?: string; listenForOpen?: boolean; showTrigger?: boolean; dispatchOpen?: boolean; initialStep?: number }) {
  const initialIndex = Math.max(0, Math.min(copy.en.steps.length - 1, Math.round(initialStep)));
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(initialIndex);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const text = copy[language];
  const current = text.steps[step];
  const close = () => { rememberTourSeen(); setOpen(false); };

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(PRODUCT_TOUR_STATE_EVENT, { detail: { open } }));
  }, [open]);

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
      setStep(initialIndex);
      setOpen(true);
    };
    window.addEventListener(PRODUCT_TOUR_OPEN_EVENT, openTour);
    return () => window.removeEventListener(PRODUCT_TOUR_OPEN_EVENT, openTour);
  }, [initialIndex, listenForOpen]);

  return <div className={mobileStyles.tour}>
    {showTrigger ? <button ref={triggerRef} className={styles.trigger} type="button" aria-label={triggerLabel ?? text.trigger} onClick={() => {
      if (dispatchOpen) { window.dispatchEvent(new Event(PRODUCT_TOUR_OPEN_EVENT)); return; }
      returnFocusRef.current = triggerRef.current;
      setStep(initialIndex);
      setOpen(true);
    }}>{triggerLabel ?? text.trigger}</button> : null}
    {open ? <div className={styles.overlay} role="presentation" onMouseDown={close}>
      <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="easyt-tour-title" aria-describedby="easyt-tour-description" onMouseDown={(event) => event.stopPropagation()}>
        <button className={styles.close} type="button" onClick={close} aria-label={text.close}><X aria-hidden="true" /></button>
        <div className={styles.visual}><div className={styles.mediaFrame}><div className={styles.screen}><picture><source media="(max-width: 680px)" srcSet={current.mobileImage} /><img src={current.image} alt={current.alt} /></picture></div></div></div>
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
