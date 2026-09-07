"use client";

import dynamic from "next/dynamic";
import { useEffect, useReducer, useRef, useState } from "react";
import { ArrowRight, Undo2 } from "lucide-react";
import { EasyTButton, EasyTSegmentedControl } from "@/components/easyt/easyt-controls";
import { MorroviaQuantitySelector } from "@/components/easyt/morrovia-quantity-selector";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import { createHomepageDemo, homepageDemoReducer, homepageDemoDay, type HomepageDemoState } from "@/lib/easyt/homepage-demo";
import { DestinationPhoto } from "./route-chapters";
import { useHomepageLanguage } from "./immersive-home";
import styles from "./immersive.module.css";

const DemoMap = dynamic(() => import("./demo-map"), { ssr: false, loading: () => <div className={styles.mapLoading} role="status">Opening the route map…</div> });

export default function ProductDemo({ route, routes, change }: { route: ImmersiveRoute; routes: ImmersiveRoute[]; change: (index: number, chapter: string) => void }) {
  const [state, dispatch] = useReducer(homepageDemoReducer, routes, createHomepageDemo);
  const [mapReady, setMapReady] = useState(false);
  const [notice, setNotice] = useState("");
  const section = useRef<HTMLElement>(null);
  const es = useHomepageLanguage() === "es";
  const nights = state.nights[route.key];
  const selected = state.selected[route.key] ?? 0;
  const stop = route.stops[selected];
  const total = nights.reduce((sum, n) => sum + n, 0);
  const select = (index: number) => dispatch({ type: "select", route, index });
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setMapReady(true); observer.disconnect(); } }, { rootMargin: "300px" });
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, []);
  return <section id="product" ref={section} className={styles.product}>
    <header className={styles.chapterHeading}><div><span className={styles.eyebrow}>{es ? "Todo el viaje a la vista" : "The whole trip, in view"}</span><h2>{es ? "Todo tu viaje." : "Your whole trip."}<em>{es ? "Conectado." : "Connected."}</em></h2></div><p>{es ? "Entre países. Entre lugares. En los días que vivirás." : <>Across countries. Between places.<br />Into the days you’ll actually live.</>}</p></header>
    <div className={styles.demo}>
      <div className={styles.canvasNavigation}><EasyTSegmentedControl ariaLabel={es ? "Vista del ejemplo" : "Product view"} value={state.view} onChange={(view) => dispatch({ type: "view", view: view as HomepageDemoState["view"] })} options={[{ value: "map", label: es ? "Mapa" : "Map" }, { value: "builder", label: "Builder" }, { value: "itinerary", label: es ? "Itinerario" : "Itinerary" }]} /></div>
      <div className={styles.demoMasthead}><span>{route.countries.join(" → ")}</span><span>{total} {es ? "noches · ejemplo interactivo" : "nights · interactive sample"}</span><EasyTButton variant="quiet" size="small" icon={Undo2} onClick={() => { dispatch({ type: "reset", route }); setNotice(es ? "Ejemplo restablecido." : "Sample reset."); }}>{es ? "Restablecer" : "Reset"}</EasyTButton></div>
      <div className={styles.demoNotice} role="status" aria-live="polite">{notice}</div>
      <div aria-label={`${state.view} sample`}>
      {state.view === "map" ? <div className={styles.mapDemo}><aside className={styles.mapInfo}><span className={styles.eyebrow}>{es ? "Tu ruta" : "Your route"}</span><h3>{es ? "Todo el viaje." : "The whole journey."}</h3><div className={styles.stopChoices}>{route.stops.map((item, index) => <EasyTButton key={item.id} variant="quiet" aria-pressed={selected === index} onClick={() => select(index)}><span>{index + 1}</span><span>{item.name}<small>{item.country}</small></span><span>{nights[index]}n</span></EasyTButton>)}</div><p>{stop.reason}</p><EasyTButton variant="quiet" icon={ArrowRight} onClick={() => dispatch({ type: "view", view: "builder" })}>{es ? "Ajustar las noches" : "Shape the nights"}</EasyTButton></aside>{mapReady ? <DemoMap route={route} selected={selected} nights={nights} onSelect={select} /> : <div className={styles.mapLoading}>{es ? "El mapa se abre al llegar al ejemplo." : "The map opens as you reach the sample."}</div>}</div>
      : state.view === "builder" ? <div className={styles.builderDemo}><div><span className={styles.eyebrow}>Builder</span><h3>{es ? "Dale tiempo al viaje." : "Make the time feel right."}</h3><p>{es ? "Añade una noche y verás el cambio en cada vista." : "Add a night where you want to linger. Every view stays connected."}</p><strong>{total} <small>{es ? "noches" : "nights"}</small></strong></div><div>{route.stops.map((item, index) => <div className={styles.nightRow} key={item.id}><div><span className={styles.eyebrow}>{index + 1} · {item.country}</span><h4>{item.name}</h4></div><MorroviaQuantitySelector compact showIcon={false} label={`${es ? "Noches en" : "Nights in"} ${item.name}`} noun={es ? "noche" : "night"} nounPlural={es ? "noches" : "nights"} value={nights[index]} min={route.minimumNights[index]} max={28} onChange={(value) => { if (value !== null) { dispatch({ type: "night", route, index, value }); setNotice(`${item.name}: ${value} ${es ? "noches. Actualizado en todas las vistas." : "nights. Updated across every view."}`); } }} /></div>)}</div></div>
      : <div className={styles.itineraryDemo}><div className={styles.itineraryPhoto}><DestinationPhoto route={route} index={selected} /></div><div className={styles.itineraryDay}><span className={styles.eyebrow}>{es ? "Itinerario · día" : "Itinerary · day"} {homepageDemoDay(nights, selected)} · {es ? "ejemplo" : "sample"}</span><h3>{stop.name}.<br />{es ? "Tu próximo capítulo." : "Your next chapter."}</h3><EasyTButton variant="quiet" icon={ArrowRight} onClick={() => select((selected + 1) % route.stops.length)}>{es ? "Siguiente destino" : "Next destination"}</EasyTButton><dl><div><dt>{es ? "Viaje" : "Travel"}</dt><dd>{selected ? `${route.stops[selected - 1].name} → ${stop.name}` : `${es ? "Llegada a" : "Arrive in"} ${stop.name}`}<small>{es ? "Transporte y horarios por confirmar" : "Transport and timing to confirm"}</small></dd></div><div><dt>{es ? "Esta noche" : "Tonight"}</dt><dd>{stop.name} · 1 / {nights[selected]}<small>{es ? "Alojamiento por elegir" : "Accommodation to choose"}</small></dd></div></dl><p>{es ? "Idea para la tarde" : "Afternoon idea"} · {es ? "Explora" : "Explore"} {stop.name}</p><p>{es ? "Idea para la noche · prueba la comida local" : "Evening idea · leave time for a local meal"}</p><small>{es ? "Las actividades y estancias no están reservadas." : "Activities and stays are not booked."}</small></div></div>}
      </div>
    </div>
    <div className={styles.productExamples}><span className={styles.eyebrow}>{es ? "Prueba otro viaje" : "Try another journey"}</span><div role="group" aria-label={es ? "Viaje de ejemplo" : "Sample journey"}>{routes.map((item, index) => <EasyTButton variant="quiet" key={item.key} aria-pressed={item.key === route.key} onClick={() => { change(index, "product"); setNotice(""); }}>{item.title}</EasyTButton>)}</div></div>
  </section>;
}
