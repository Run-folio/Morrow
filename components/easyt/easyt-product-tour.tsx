"use client";
import { MotionButton } from "@/components/easyt/app-motion";

import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { PRODUCT_TOUR_COMPLETE_KEY, shouldShowProductTourPrompt } from "@/lib/easyt/product-tour";
import styles from "./easyt-product-tour.module.css";
import mobileStyles from "./easyt-product-tour-mobile.module.css";

export const PRODUCT_TOUR_OPEN_EVENT = "easyt-open-product-tour";
export const PRODUCT_TOUR_STATE_EVENT = "easyt-product-tour-state";

const screenshots = [
  { image: "/journey/product-shots/tour/2026-11-20/describe-trip.jpg", mobileImage: "/journey/product-shots/tour/2026-11-20/describe-trip-mobile.jpg",
    alt: { en: "Morrovia trip starter with destination fields and trip planning controls", es: "Pantalla de inicio de Morrovia en inglés con campos de destino y controles para planificar" } },
  { image: "/journey/product-shots/tour/2026-11-20/shape-route.jpg", mobileImage: "/journey/product-shots/tour/2026-11-20/shape-route-mobile.jpg",
    alt: { en: "Morrovia route planner with editable overnight stops and night counts", es: "Plan de ruta de Morrovia en inglés con paradas y número de noches editables" } },
  { image: "/journey/product-shots/tour/2026-11-20/trip-workspace.jpg", mobileImage: "/journey/product-shots/tour/2026-11-20/trip-workspace-mobile.jpg",
    alt: { en: "Morrovia Overview showing the Peru trip route and overnight stops", es: "Resumen de Morrovia en inglés con la ruta por Perú y sus paradas nocturnas" } },
  { image: "/journey/product-shots/tour/2026-11-20/transport-workspace.jpg", mobileImage: "/journey/product-shots/tour/2026-11-20/transport-workspace-mobile.jpg",
    alt: { en: "Morrovia Transport listing the connections and estimated durations for an example trip", es: "Transporte de Morrovia en inglés con las conexiones y duraciones estimadas de un viaje de ejemplo" } },
  { image: "/journey/product-shots/tour/2026-11-20/itinerary-workspace.jpg", mobileImage: "/journey/product-shots/tour/2026-11-20/itinerary-workspace-mobile.jpg",
    alt: { en: "Morrovia Itinerary showing the day-by-day trip plan and planning controls", es: "Itinerario de Morrovia en inglés con el plan día a día y controles de planificación" } },
] as const;

const copy = {
  en: {
    trigger: "Guide", close: "Close product tour", step: "Step", of: "of", back: "Back", next: "Next", finish: "Done", skip: "Skip tour",
    prompt: "New to Morrovia?", takeTour: "See how planning works", dismissPrompt: "Dismiss tour invitation", example: "Example product screens", credits: "Image credits", creditsLabel: "Image credits (opens in a new tab)",
    steps: [
      { label: "01 · Home", title: "Start your trip", copy: "Add destinations or describe the trip you have in mind. Add dates if you know them." },
      { label: "02 · Route", title: "Plan your route", copy: "Reorder stops and choose how many nights to spend in each. Travel times are estimates." },
      { label: "03 · Overview", title: "Pick up where you left off", copy: "Open Transport, Stay or Itinerary from Overview. Your guest trip stays on this device. To use it elsewhere, sign in and save it to your account." },
      { label: "04 · Transport and Stay", title: "Plan connections and stays", copy: "Use Transport for travel between stops and Stay for accommodation. Where a search link is available, check availability and book on the provider’s site." },
      { label: "05 · Itinerary", title: "Plan each day", copy: "Add activities to a day or move them when your plans change." },
    ],
  },
  es: {
    trigger: "Guía", close: "Cerrar recorrido del producto", step: "Paso", of: "de", back: "Atrás", next: "Siguiente", finish: "Listo", skip: "Omitir recorrido",
    prompt: "¿Primera vez en Morrovia?", takeTour: "Descubre cómo planificar", dismissPrompt: "Descartar invitación al recorrido", example: "Pantallas de ejemplo del producto", credits: "Créditos de imágenes", creditsLabel: "Créditos de imágenes (se abre en otra pestaña)",
    steps: [
      { label: "01 · Inicio del viaje", title: "Empieza tu viaje", copy: "Añade destinos o describe el viaje que tienes en mente. Si ya sabes las fechas, añádelas." },
      { label: "02 · Ruta", title: "Planifica tu ruta", copy: "Ordena las paradas y elige cuántas noches pasar en cada una. Los tiempos de viaje son estimaciones." },
      { label: "03 · Resumen", title: "Retoma tu viaje", copy: "Desde Resumen, abre Transporte, Alojamiento o Itinerario. Sin cuenta, tu viaje se queda en este dispositivo. Para usarlo en otro, inicia sesión y guárdalo en tu cuenta." },
      { label: "04 · Transporte y alojamiento", title: "Planifica traslados y estancias", copy: "Usa Transporte para los traslados y Alojamiento para las estancias. Cuando haya un enlace de búsqueda, consulta la disponibilidad y reserva en el sitio del proveedor." },
      { label: "05 · Itinerario", title: "Organiza cada día", copy: "Añade actividades a un día o cámbialas de día si cambian tus planes." },
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
    <MotionButton type="button" onClick={() => { setVisible(false); window.dispatchEvent(new Event(PRODUCT_TOUR_OPEN_EVENT)); }}>{text.takeTour}</MotionButton>
    <MotionButton className={styles.promptDismiss} type="button" aria-label={text.dismissPrompt} onClick={() => { rememberTourSeen(); setVisible(false); window.dispatchEvent(new CustomEvent(PRODUCT_TOUR_STATE_EVENT, { detail: { open: false } })); }}><X aria-hidden="true" /></MotionButton>
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
  const screenshot = screenshots[step];
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
    {showTrigger ? <MotionButton ref={triggerRef} className={styles.trigger} type="button" aria-label={triggerLabel ?? text.trigger} onClick={() => {
      if (dispatchOpen) { window.dispatchEvent(new Event(PRODUCT_TOUR_OPEN_EVENT)); return; }
      returnFocusRef.current = triggerRef.current;
      setStep(initialIndex);
      setOpen(true);
    }}>{triggerLabel ?? text.trigger}</MotionButton> : null}
    {open ? createPortal(<div className={mobileStyles.tour}><div className={styles.overlay} role="presentation" onMouseDown={close}>
      <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="easyt-tour-title" aria-describedby="easyt-tour-description" onMouseDown={(event) => event.stopPropagation()}>
        <MotionButton className={styles.close} type="button" onClick={close} aria-label={text.close}><X aria-hidden="true" /></MotionButton>
        <div className={styles.visual}><p className={styles.example}>{text.example} · <a href="/journey/product-shots/tour/credits.html" target="_blank" rel="noreferrer" aria-label={text.creditsLabel}>{text.credits}</a></p><div className={styles.mediaFrame}><div className={styles.screen}><picture><source media="(max-width: 680px)" srcSet={screenshot.mobileImage} /><img src={screenshot.image} alt={screenshot.alt[language]} /></picture></div></div></div>
        <div className={styles.content}>
          <div className={styles.stepCopy} aria-live="polite" aria-atomic="true">
          <p className={styles.label}>{current.label}</p>
          <h2 id="easyt-tour-title">{current.title}</h2>
          <p id="easyt-tour-description">{current.copy}</p>
          </div>
          <div className={styles.dots}><span className={styles.progress}>{`${text.step} ${step + 1} ${text.of} ${text.steps.length}`}</span>{text.steps.map((item, index) => <i aria-hidden="true" className={index === step ? styles.dotActive : ""} key={item.label} />)}</div>
          <div className={styles.actions}>{step > 0 ? <MotionButton className={styles.back} type="button" onClick={() => { setStep(step - 1); nextRef.current?.focus(); }}><ArrowLeft aria-hidden="true" /> {text.back}</MotionButton> : <span />}{step === text.steps.length - 1 ? <MotionButton ref={nextRef} className={styles.next} type="button" onClick={close}><Check aria-hidden="true" /> {text.finish}</MotionButton> : <MotionButton ref={nextRef} className={styles.next} type="button" onClick={() => setStep(step + 1)}>{text.next} <ArrowRight aria-hidden="true" /></MotionButton>}</div>
          <MotionButton className={styles.skip} type="button" onClick={close}>{text.skip}</MotionButton>
        </div>
      </section>
    </div></div>, document.body) : null}
  </div>;
}
