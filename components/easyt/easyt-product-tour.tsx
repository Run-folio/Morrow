"use client";

import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { PRODUCT_TOUR_COMPLETE_KEY, shouldShowProductTourPrompt } from "@/lib/easyt/product-tour";
import styles from "./easyt-product-tour.module.css";
import mobileStyles from "./easyt-product-tour-mobile.module.css";

export const PRODUCT_TOUR_OPEN_EVENT = "easyt-open-product-tour";
export const PRODUCT_TOUR_STATE_EVENT = "easyt-product-tour-state";

const copy = {
  en: {
    trigger: "Guide", close: "Close product tour", step: "Step", of: "of", back: "Back", next: "Next", finish: "Done", skip: "Skip tour",
    prompt: "New to Morrovia?", takeTour: "See how planning works", dismissPrompt: "Dismiss tour invitation", example: "Example screens · not a booking", credits: "Image credits", creditsLabel: "Image credits (opens in a new tab)",
    steps: [
      { label: "01 · Start your way", title: "A few stops. Or a few words.", copy: "Choose “Plan with stops” to add destinations, or “Describe my trip” to tell us your idea. Add dates and travellers when you know them.", image: "/journey/product-shots/tour/current/describe-trip.jpg", mobileImage: "/journey/product-shots/tour/current/describe-trip-mobile.jpg", alt: "Current trip starter with Plan with stops and Describe my trip and editable destinations" },
      { label: "02 · Review your route", title: "Start with a route that makes sense.", copy: "Review the stop order, nights and travel days before you continue. Transfer times are estimates: check schedules before booking.", image: "/journey/product-shots/tour/current/shape-route.jpg", mobileImage: "/journey/product-shots/tour/current/shape-route-mobile.jpg", alt: "Route review showing Cusco, Ollantaytambo in the Sacred Valley and Arequipa with nights and transfer estimates" },
      { label: "03 · See the whole trip", title: "Know what needs attention next.", copy: "Overview brings your route, next steps and practical prep together. See what still needs a decision as your plan takes shape.", image: "/journey/product-shots/tour/current/trip-workspace.jpg", mobileImage: "/journey/product-shots/tour/current/trip-workspace-mobile.jpg", alt: "Overview for the Peru trip showing the route, travel estimates and timing warning" },
      { label: "04 · Explore the Map", title: "See how the whole trip connects.", copy: "Explore your stops on the Map, find places nearby and save ideas for your trip. Keep the whole route in view as you refine it.", image: "/journey/product-shots/tour/current/map-workspace.jpg", mobileImage: "/journey/product-shots/tour/current/map-workspace-mobile.jpg", alt: "Current Map workspace showing Lima, Cusco, Ollantaytambo and Arequipa connected as one Peru route" },
      { label: "05 · Shape each day", title: "Make the itinerary yours.", copy: "Add places and activities to your days, move them when plans change, and keep travel in context. Partner links open on the provider’s site when you’re ready to book.", image: "/journey/product-shots/tour/current/itinerary-workspace.jpg", mobileImage: "/journey/product-shots/tour/current/itinerary-workspace-mobile.jpg", alt: "Populated Cusco day with activities, day parts and planning actions" },
    ],
  },
  es: {
    trigger: "Guía", close: "Cerrar recorrido del producto", step: "Paso", of: "de", back: "Atrás", next: "Siguiente", finish: "Listo", skip: "Omitir recorrido",
    prompt: "¿Primera vez en Morrovia?", takeTour: "Descubre cómo planificar", dismissPrompt: "Descartar invitación al recorrido", example: "Ejemplos en inglés · no son reservas", credits: "Créditos de imágenes", creditsLabel: "Créditos de imágenes (se abre en otra pestaña)",
    steps: [
      { label: "01 · Empieza a tu manera", title: "Unas paradas. O unas palabras.", copy: "Elige «Planificar con paradas» para añadir destinos o «Describir mi viaje» para contar tu idea. Añade fechas y viajeros cuando los sepas.", image: "/journey/product-shots/tour/current/describe-trip.jpg", mobileImage: "/journey/product-shots/tour/current/describe-trip-mobile.jpg", alt: "Pantalla de inicio en inglés con dos formas de planificar y destinos editables" },
      { label: "02 · Revisa tu ruta", title: "Empieza con una ruta que tenga sentido.", copy: "Revisa el orden de las paradas, las noches y los días de traslado. Los tiempos son estimados: comprueba los horarios antes de reservar.", image: "/journey/product-shots/tour/current/shape-route.jpg", mobileImage: "/journey/product-shots/tour/current/shape-route-mobile.jpg", alt: "Ruta por Cusco, Ollantaytambo en el Valle Sagrado y Arequipa con noches y traslados" },
      { label: "03 · Ve todo el viaje", title: "Ten claro qué necesita atención.", copy: "Resumen reúne tu ruta, los próximos pasos y los preparativos. Ve qué decisiones quedan mientras tu plan toma forma.", image: "/journey/product-shots/tour/current/trip-workspace.jpg", mobileImage: "/journey/product-shots/tour/current/trip-workspace-mobile.jpg", alt: "Resumen en inglés del viaje por Perú con ruta, tiempos estimados y aviso sobre el tiempo disponible" },
      { label: "04 · Explora el Mapa", title: "Ve cómo se conecta todo el viaje.", copy: "Explora las paradas en el Mapa, encuentra lugares cercanos y guarda ideas para tu viaje. Mantén toda la ruta a la vista mientras la ajustas.", image: "/journey/product-shots/tour/current/map-workspace.jpg", mobileImage: "/journey/product-shots/tour/current/map-workspace-mobile.jpg", alt: "Mapa actual en inglés con la ruta por Lima, Cusco, Ollantaytambo y Arequipa" },
      { label: "05 · Organiza cada día", title: "Haz tuyo el itinerario.", copy: "Añade lugares y actividades a tus días, muévelos si cambian tus planes y ten presentes los traslados. Los enlaces de colaboradores abren su web para reservar.", image: "/journey/product-shots/tour/current/itinerary-workspace.jpg", mobileImage: "/journey/product-shots/tour/current/itinerary-workspace-mobile.jpg", alt: "Día completo en Cusco con actividades, momentos del día y acciones de planificación" },
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
  const nextRef = useRef<HTMLButtonElement>(null);
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
    {open ? createPortal(<div className={mobileStyles.tour}><div className={styles.overlay} role="presentation" onMouseDown={close}>
      <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="easyt-tour-title" aria-describedby="easyt-tour-description" onMouseDown={(event) => event.stopPropagation()}>
        <button className={styles.close} type="button" onClick={close} aria-label={text.close}><X aria-hidden="true" /></button>
        <div className={styles.visual}><p className={styles.example}>{text.example} · <a href="/journey/product-shots/tour/credits.html" target="_blank" rel="noreferrer" aria-label={text.creditsLabel}>{text.credits}</a></p><div className={styles.mediaFrame}><div className={styles.screen}><picture><source media="(max-width: 680px)" srcSet={current.mobileImage} /><img src={current.image} alt={current.alt} /></picture></div></div></div>
        <div className={styles.content}>
          <div className={styles.stepCopy} aria-live="polite" aria-atomic="true">
          <p className={styles.label}>{current.label}</p>
          <h2 id="easyt-tour-title">{current.title}</h2>
          <p id="easyt-tour-description">{current.copy}</p>
          </div>
          <div className={styles.dots}><span className={styles.progress}>{`${text.step} ${step + 1} ${text.of} ${text.steps.length}`}</span>{text.steps.map((item, index) => <i aria-hidden="true" className={index === step ? styles.dotActive : ""} key={item.label} />)}</div>
          <div className={styles.actions}>{step > 0 ? <button className={styles.back} type="button" onClick={() => { setStep(step - 1); nextRef.current?.focus(); }}><ArrowLeft aria-hidden="true" /> {text.back}</button> : <span />}{step === text.steps.length - 1 ? <button ref={nextRef} className={styles.next} type="button" onClick={close}><Check aria-hidden="true" /> {text.finish}</button> : <button ref={nextRef} className={styles.next} type="button" onClick={() => setStep(step + 1)}>{text.next} <ArrowRight aria-hidden="true" /></button>}</div>
          <button className={styles.skip} type="button" onClick={close}>{text.skip}</button>
        </div>
      </section>
    </div></div>, document.body) : null}
  </div>;
}
