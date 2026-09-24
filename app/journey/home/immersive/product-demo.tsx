"use client";

import dynamic from "next/dynamic";
import { useEffect, useReducer, useRef, useState } from "react";
import { Route, Undo2 } from "lucide-react";
import { EasyTButton, EasyTSegmentedControl } from "@/components/easyt/easyt-controls";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import { createHomepageDemo, homepageDemoReducer, type HomepageDemoState } from "@/lib/easyt/homepage-demo";
import { homepageDemoItinerary, homepageDemoRepresentativeDay } from "@/lib/easyt/homepage-demo-itinerary";
import { homepageJourneyLabel } from "@/lib/easyt/homepage-navigation";
import DemoBuilder from "./demo-builder";
import DemoItinerary from "./demo-itinerary";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";

const DemoMap = dynamic(() => import("./demo-map"), { ssr: false, loading: () => <div className={styles.mapLoading} aria-hidden="true" /> });

export default function ProductDemo({ route, routes, change, initialView = "builder", initialItineraryView = "days", initialDay, initialNights }: { route: ImmersiveRoute; routes: ImmersiveRoute[]; change: (index: number, chapter: string) => void; initialView?: HomepageDemoState["view"]; initialItineraryView?: HomepageDemoState["itineraryView"]; initialDay?: number; initialNights?: number[] }) {
  const [state, dispatch] = useReducer(homepageDemoReducer, routes, (items) => {
    const created = createHomepageDemo(items);
    return { ...created, nights: initialNights ? { ...created.nights, [route.key]: initialNights } : created.nights, view: initialView, itineraryView: initialItineraryView };
  });
  const [mapReady, setMapReady] = useState(false);
  const [notice, setNotice] = useState("");
  const section = useRef<HTMLElement>(null);
  const es = useHomepageLanguage() === "es";
  const nights = state.nights[route.key] ?? route.stops.map((stop) => stop.nights);
  const selected = state.selected[route.key] ?? 0;
  const day = state.manualDay[route.key] ? state.day[route.key] : initialDay ?? (state.view === "itinerary" ? homepageDemoRepresentativeDay(homepageDemoItinerary(route, nights)) : 1);
  const select = (index: number) => dispatch({ type: "select", route, index });
  const view = (value: HomepageDemoState["view"]) => dispatch({ type: "view", view: value });

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setMapReady(true); observer.disconnect(); } }, { rootMargin: "300px" });
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, []);

  return <section id="product" ref={section} className={styles.product}>
    <header className={styles.chapterHeading}><div><span className={styles.eyebrow}>{es ? "Todo el viaje a la vista" : "The whole trip, in view"}</span><h2>{es ? "Todo tu viaje." : "Your whole trip."}<em>{es ? "Conectado." : "Connected."}</em></h2></div></header>
    <div className={styles.demo}>
      <div className={styles.canvasNavigation}><div className={styles.demoIdentity}><Route aria-hidden="true" /><strong>{homepageJourneyLabel(route.key, route.title).short}</strong></div><EasyTSegmentedControl ariaLabel={es ? "Vista del ejemplo" : "Product view"} value={state.view} onChange={(value) => view(value as HomepageDemoState["view"])} options={[{ value: "builder", label: "Builder" }, { value: "itinerary", label: es ? "Itinerario" : "Itinerary" }]} /></div>
      <div className={styles.demoMasthead}><span>{route.countries.join(" → ")}</span><EasyTButton variant="quiet" size="small" icon={Undo2} onClick={() => { dispatch({ type: "reset", route }); setNotice(es ? "Ejemplo restablecido." : "Sample reset."); }}>{es ? "Restablecer" : "Reset"}</EasyTButton></div>
      <div className={styles.demoNotice} role="status" aria-live="polite">{notice}</div>
      {state.view === "builder" ? <DemoBuilder route={route} nights={nights} selected={selected} es={es} onSelect={select} onNight={(index, value) => { dispatch({ type: "night", route, index, value }); setNotice(es ? "Noches redistribuidas. Las fechas no cambian." : "Nights rebalanced. Trip dates stay the same."); }} map={mapReady ? <DemoMap route={route} selected={selected} nights={nights} es={es} /> : <div className={styles.mapLoading} role="status">{es ? "Abriendo el mapa…" : "Opening the route map…"}</div>} /> : <DemoItinerary route={route} nights={nights} day={day} view={state.itineraryView} es={es} onView={(next) => dispatch({ type: "itineraryView", view: next })} onDay={(selectedDay) => dispatch({ type: "day", route, day: selectedDay })} />}
    </div>
    <div className={styles.productExamples}><span className={styles.eyebrow}>{es ? "Prueba otro viaje" : "Try another journey"}</span><div role="group" aria-label={es ? "Viaje de ejemplo" : "Sample journey"}>{routes.map((item, index) => <EasyTButton variant="quiet" key={item.key} aria-pressed={item.key === route.key} onClick={() => { change(index, "product"); setNotice(""); }}>{homepageJourneyLabel(item.key, item.title).short}</EasyTButton>)}</div></div>
  </section>;
}
