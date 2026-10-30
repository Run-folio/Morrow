"use client";

import Link from "next/link";
import { ArrowRight, Check, ChevronDown, CircleDot, Map, SlidersHorizontal, Stamp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { mapWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "../account.module.css";
import { EasyTButton } from "@/components/easyt/easyt-controls";

const copy = {
  en: {
    eyebrow: "Your first trip", title: "One clear next step at a time.", dismiss: "Hide guide", complete: "Done", start: "Start a trip", choose: "Choose places", shape: "Shape the days", map: "Open the map", stamps: "Add a stamp", startDetail: "Begin with where you are leaving from, where you are going and your dates.", chooseDetail: "Pick the parts of the trip that matter most. You can always add more later.", shapeDetail: "Give each place enough time, then let Morrovia show the trade-offs.", mapDetail: "Use the day view to find nearby places, pins and notes while you travel.", stampsDetail: "Keep one small memory from a place you want to remember.", action: "Continue",
  },
  es: {
    eyebrow: "Tu primer viaje", title: "Un siguiente paso claro a la vez.", dismiss: "Ocultar guía", complete: "Listo", start: "Crea un viaje", choose: "Elige lugares", shape: "Organiza los días", map: "Abre el mapa", stamps: "Añade un sello", startDetail: "Empieza con tu ciudad de salida, destino y fechas.", chooseDetail: "Elige las partes del viaje que más importan. Siempre puedes añadir más después.", shapeDetail: "Da tiempo suficiente a cada lugar y deja que EasyT muestre las decisiones.", mapDetail: "Usa la vista del día para encontrar lugares cercanos, pines y notas mientras viajas.", stampsDetail: "Guarda un pequeño recuerdo de un lugar que quieras recordar.", action: "Continuar",
  },
} as const;

export default function FirstTripGuide({ trips }: { trips: EasyTTrip[] }) {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const focusRequest = useRef<"open" | "close" | null>(null);
  const text = copy[language];
  const firstTrip = trips.find((trip) => trip.status !== "archived");

  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);
  useEffect(() => {
    const request = focusRequest.current;
    focusRequest.current = null;
    if (!request) return;
    const focused = document.activeElement;
    if (focused !== document.body && focused !== document.documentElement && !rootRef.current?.contains(focused)) return;
    (request === "open" ? closeRef.current : triggerRef.current)?.focus();
  }, [expanded]);
  const toggle = (next: boolean) => { focusRequest.current = next ? "open" : "close"; setExpanded(next); };

  const steps = firstTrip
    ? [
      { icon: Check, title: text.start, detail: text.startDetail, done: true, href: `/journey/new?trip=${encodeURIComponent(firstTrip.id)}` },
      { icon: SlidersHorizontal, title: text.shape, detail: text.shapeDetail, done: false, href: `/journey/new?trip=${encodeURIComponent(firstTrip.id)}` },
      { icon: Map, title: text.map, detail: text.mapDetail, done: false, href: mapWorkspaceHref(firstTrip.id, null, "plan", null, null, null, "/journey/dashboard") },
      { icon: Stamp, title: text.stamps, detail: text.stampsDetail, done: false, href: "/journey/stamped" },
    ]
    : [
      { icon: CircleDot, title: text.start, detail: text.startDetail, done: false, href: "/#start-building" },
      { icon: Map, title: text.choose, detail: text.chooseDetail, done: false, href: "/journey/new" },
      { icon: SlidersHorizontal, title: text.shape, detail: text.shapeDetail, done: false, href: "/journey/new" },
      { icon: Stamp, title: text.stamps, detail: text.stampsDetail, done: false, href: "/journey/stamped" },
    ];
  const activeIndex = steps.findIndex((step) => !step.done);
  const active = steps[activeIndex < 0 ? steps.length - 1 : activeIndex];

  return <section ref={rootRef} aria-label={text.eyebrow} onKeyDown={(event) => {
    if (expanded && event.key === "Escape") { event.preventDefault(); toggle(false); }
  }}>
    {!expanded ? <EasyTButton ref={triggerRef} variant="quiet" icon={ChevronDown} aria-expanded={false} aria-controls={panelId} onClick={() => toggle(true)}>{text.eyebrow}</EasyTButton> : null}
    <div id={panelId} hidden={!expanded}>
      {expanded ? <div className={styles.firstTripGuide}>
        <div className={styles.guideHead}><div><p className={styles.eyebrow}>{text.eyebrow}</p><h2>{text.title}</h2></div><EasyTButton ref={closeRef} variant="quiet" aria-expanded={true} aria-controls={panelId} onClick={() => toggle(false)}>{text.dismiss}</EasyTButton></div>
        <div className={styles.guideSteps}>{steps.map((step, index) => { const Icon = step.icon; const isActive = index === activeIndex; return <div aria-current={isActive ? "step" : undefined} className={`${styles.guideStep} ${step.done ? styles.guideDone : ""} ${isActive ? styles.guideActive : ""}`} key={step.title}><span><Icon aria-hidden="true" /></span><div><small>{step.done ? text.complete : String(index + 1).padStart(2, "0")}</small><strong>{step.title}</strong></div></div>; })}</div>
        <div className={styles.guideAction}><div><p>{active.detail}</p></div><Link href={active.href}>{text.action} <ArrowRight aria-hidden="true" /></Link></div>
      </div> : null}
    </div>
  </section>;
}
