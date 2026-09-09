"use client";

import dynamic from "next/dynamic";
import { useEffect, useReducer, useRef, useState } from "react";
import { ArrowRight, Undo2, MoonStar, Route, Clock3, BedDouble, Sun, Sunrise, Sunset, TrainFront, Plane, CarFront } from "lucide-react";
import { EasyTButton, EasyTSegmentedControl } from "@/components/easyt/easyt-controls";
import { MorroviaQuantitySelector } from "@/components/easyt/morrovia-quantity-selector";
import { MorroviaContextualDisclosure } from "@/components/easyt/morrovia-feedback";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import { createHomepageDemo, homepageDemoReducer, homepageDemoDay, type HomepageDemoState } from "@/lib/easyt/homepage-demo";
import { homepageSampleMorning } from "@/lib/easyt/homepage-demo-editorial";
import { DestinationPhoto } from "./route-chapters";
import { homepageJourneyLabel } from "@/lib/easyt/homepage-navigation";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";

const DemoMap = dynamic(() => import("./demo-map"), { ssr: false, loading: () => <div className={styles.mapLoading} role="status">Opening the route map…</div> });

export default function ProductDemo({ route, routes, change }: { route: ImmersiveRoute; routes: ImmersiveRoute[]; change: (index: number, chapter: string) => void }) {
  const [state, dispatch] = useReducer(homepageDemoReducer, routes, createHomepageDemo);
  const [mapReady, setMapReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [insightOpen, setInsightOpen] = useState(false);
  const [arrivalDay, setArrivalDay] = useState(false);
  const section = useRef<HTMLElement>(null);
  const es = useHomepageLanguage() === "es";
  const nights = state.nights[route.key];
  const selected = state.selected[route.key] ?? 0;
  const stop = route.stops[selected];
  const total = nights.reduce((sum, n) => sum + n, 0);
  const select = (index: number) => dispatch({ type: "select", route, index });
  const connection = selected ? route.stops[selected - 1].onward : null;
  const view = (value: HomepageDemoState["view"]) => dispatch({ type: "view", view: value });
  const stayDays = Math.max(0, nights[selected] - 1);
  const Transport = connection?.mode === "train" ? TrainFront : connection?.mode === "flight" ? Plane : CarFront;
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setMapReady(true); observer.disconnect(); } }, { rootMargin: "300px" });
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, []);
  return <section id="product" ref={section} className={styles.product}>
    <header className={styles.chapterHeading}><div><span className={styles.eyebrow}>{es ? "Todo el viaje a la vista" : "The whole trip, in view"}</span><h2>{es ? "Todo tu viaje." : "Your whole trip."}<em>{es ? "Conectado." : "Connected."}</em></h2></div><p>{es ? "Los lugares. El tiempo entre ellos. Y tiempo para vivirlos." : <>The places. The time between them.<br />And room to actually be there.</>}</p></header>
    <div className={styles.demo}>
      <div className={styles.canvasNavigation}><div className={styles.demoIdentity}><Route aria-hidden="true" /><strong>{homepageJourneyLabel(route.key, route.title).short}</strong><span>{route.stops.length} {es ? "bases" : "overnight bases"}</span></div><EasyTSegmentedControl ariaLabel={es ? "Vista del ejemplo" : "Product view"} value={state.view} onChange={(value) => view(value as HomepageDemoState["view"])} options={[{ value: "map", label: es ? "Mapa" : "Map" }, { value: "builder", label: "Builder" }, { value: "itinerary", label: es ? "Itinerario" : "Itinerary" }]} /></div>
      <div className={styles.demoMasthead}><span>{route.countries.join(" → ")}</span><span>{total} {es ? "noches · ejemplo interactivo" : "nights · interactive sample"}</span><EasyTButton variant="quiet" size="small" icon={Undo2} onClick={() => { dispatch({ type: "reset", route }); setNotice(es ? "Ejemplo restablecido." : "Sample reset."); }}>{es ? "Restablecer" : "Reset"}</EasyTButton></div>
      <div className={styles.demoNotice} role="status" aria-live="polite">{notice}</div>
      <div aria-label={`${state.view} sample`}>
      {state.view === "map" ? <div className={styles.mapDemo}><aside className={styles.mapInfo}><span className={styles.eyebrow}>{es ? "En orden" : "One place into the next"}</span><h3>{es ? "Así encaja." : "See how it fits."}</h3><div className={styles.stopChoices}>{route.stops.map((item, index) => <div key={item.id}><EasyTButton variant="quiet" aria-pressed={selected === index} onClick={() => select(index)}><span className={styles.stopNumber}>{index + 1}</span><span>{item.name}<small>{es ? "Día" : "Day"} {homepageDemoDay(nights, index)} · {item.country}</small></span><span>{nights[index]} <small>{es ? "noches" : "nights"}</small></span></EasyTButton>{item.onward && <p className={styles.railConnection}>{item.onward.modeLabel} · {item.onward.planningMinutes ? item.onward.durationLabel : (es ? "tiempo por confirmar" : "timing to confirm")}</p>}</div>)}</div><EasyTButton variant="quiet" icon={ArrowRight} onClick={() => view("builder")}>{es ? "Ajustar las noches" : "Shape the nights"}</EasyTButton></aside>{mapReady ? <DemoMap route={route} selected={selected} nights={nights} onSelect={select} /> : <div className={styles.mapLoading}>{es ? "Abriendo el mapa" : "Opening the map"}</div>}</div>
      : state.view === "builder" ? <div className={styles.builderDemo}>
        <div className={styles.builderContext}><span className={styles.eyebrow}>{es ? "El ritmo del viaje" : "The rhythm of your trip"}</span><h3>{es ? "Más que llegar." : "More than getting there."}<em>{es ? "Tiempo para estar." : "Time to be there."}</em></h3><div className={styles.builderSelectedPhoto}><DestinationPhoto route={route} index={selected} sizes="(max-width:840px) 100vw, 50vw" /><span>{stop.name}</span></div><div className={styles.usableTime}><Clock3 aria-hidden="true" /><p><strong>{stayDays} {es ? (stayDays === 1 ? "día entre traslados" : "días entre traslados") : (stayDays === 1 ? "day between travel days" : "days between travel days")}</strong><span>{es ? "Sin contar llegada y salida." : "Arrival and departure kept separate."}</span></p></div><MorroviaContextualDisclosure align="start" open={insightOpen} onOpenChange={setInsightOpen} triggerLabel={es ? "Por qué esta ruta" : "Why this route works"} title={es ? "Geografía y tiempo, juntos" : "Geography and time, together"} detail={`${[route.reasons[0] ?? route.summary, stop.reason].filter((reason, index, reasons) => reasons.indexOf(reason) === index).join(" ")} ${es ? "Cambiar noches amplía o acorta este ejemplo; no cambia el orden de las bases." : "Changing nights lengthens or shortens this sample; the base order stays the same."}`} /></div>
        <div className={styles.nightLedgerDemo}><header><span>{es ? "Tus bases" : "Your overnight bases"}</span><strong>{total} {es ? "noches" : "nights"}</strong></header>{route.stops.map((item, index) => <div key={item.id} className={styles.demoStay}><div className={styles.nightRow}><div><EasyTButton variant="quiet" aria-pressed={selected === index} onClick={() => select(index)}><span className={styles.stopNumber}>{index + 1}</span>{item.name}</EasyTButton><small>{Math.max(0, nights[index] - 1)} {es ? (nights[index] === 2 ? "día entre llegada y salida" : "días entre llegada y salida") : (nights[index] === 2 ? "day between arrival and departure" : "days between arrival and departure")}</small></div><MorroviaQuantitySelector compact showIcon={false} locale={es ? "es" : "en"} label={`${es ? "Noches en" : "Nights in"} ${item.name}`} noun={es ? "noche" : "night"} nounPlural={es ? "noches" : "nights"} value={nights[index]} min={route.minimumNights[index]} max={28} onChange={(value) => { dispatch({ type: "night", route, index, value }); setNotice(`${item.name}: ${value} ${es ? "noches. Todas las vistas actualizadas." : "nights. Every view updated."}`); }} /></div>{item.onward && <div className={styles.demoTransfer}><ArrowRight aria-hidden="true" /><span>{item.onward.modeLabel}<small>{item.onward.planningMinutes ? item.onward.durationLabel : (es ? "Duración por confirmar" : "Duration to confirm")}</small></span><span>{item.onward.to}</span></div>}</div>)}<p className={styles.demoLedgerNote}>{es ? "Prueba los controles + / −. El mapa y los días cambian contigo." : "Try + / −. Your map and day numbers change with you."}</p></div>
      </div>
      : <div className={styles.itineraryDemo}><div className={styles.itineraryPhoto}><DestinationPhoto route={route} index={selected} sizes="(max-width:840px) 100vw, 50vw" /><div className={styles.itineraryPhotoCopy}><span>{stop.country}</span><h3>{stop.name}<em>{es ? "A tu ritmo." : "At your own pace."}</em></h3><p>{stop.reason}</p></div></div><div className={styles.itineraryDay}><div className={styles.dayHeading}><span className={styles.eyebrow}>{es ? "Día" : "Day"} {homepageDemoDay(nights, selected) + (arrivalDay ? 0 : 1)} · {es ? "ejemplo" : "sample"}</span><EasyTButton size="small" variant="quiet" icon={ArrowRight} onClick={() => select((selected + 1) % route.stops.length)}>{es ? "Siguiente base" : "Next base"}</EasyTButton></div><h3>{arrivalDay ? (es ? "Llegar, sin prisas." : "Arrive. Ease into it.") : (es ? "Un día para estar aquí." : "A day to be here.")}</h3><EasyTSegmentedControl ariaLabel={es ? "Tipo de día" : "Sample day"} value={arrivalDay ? "arrival" : "stay"} onChange={value => setArrivalDay(value === "arrival")} options={[{value:"stay",label:es ? "Explorar" : "Explore"},{value:"arrival",label:es ? "Llegada" : "Arrival"}]} />
        <ol className={styles.sampleDayParts}>
          {arrivalDay && <li><Transport aria-hidden="true" /><div><span>{es ? "Viaje" : "Travel"}</span><strong>{connection ? `${connection.from} → ${stop.name}` : `${es ? "Llegada a" : "Arrive in"} ${stop.name}`}</strong><small>{connection?.planningMinutes ? connection.durationLabel : (es ? "Transporte y horarios por confirmar" : "Transport and timing to confirm")}</small></div></li>}
          <li><Sunrise aria-hidden="true" /><div><span>{es ? "Mañana" : "Morning"}</span><strong>{arrivalDay ? (es ? "Deja espacio para el traslado" : "Leave room for the journey") : (es ? `Descubre ${stop.name}` : homepageSampleMorning(stop.name))}</strong></div></li>
          <li><Sun aria-hidden="true" /><div><span>{es ? "Mediodía" : "Midday"}</span><strong>{es ? "Una pausa para comer" : "A local lunch. No rush."}</strong><small>{es ? "Tiempo abierto entre planes" : "A pause between plans"}</small></div></li>
          <li><Sunset aria-hidden="true" /><div><span>{es ? "Tarde" : "Afternoon"}</span><strong>{arrivalDay ? (es ? "Instálate y conoce el barrio" : "Settle in. Get to know the neighbourhood.") : (es ? "Sigue tu curiosidad" : "Follow your curiosity")}</strong><small>{es ? "Deja espacio para lo inesperado" : "Keep space for an unplanned discovery"}</small></div></li>
          <li><MoonStar aria-hidden="true" /><div><span>{es ? "Noche" : "Evening"}</span><strong>{es ? "Cena y un paseo tranquilo" : "Dinner, then a slower way home"}</strong></div></li>
          <li className={styles.sampleTonight}><BedDouble aria-hidden="true" /><div><span>{es ? "Esta noche" : "Tonight"}</span><strong>{stop.name} · {nights[selected]} {es ? "noches" : "nights"}</strong><small>{es ? "Alojamiento por elegir" : "Accommodation to choose"}</small></div></li>
        </ol><small>{es ? "Ideas de ejemplo. Actividades y estancias sin reservar." : "Sample ideas. Activities and stays are not booked."}</small></div></div>}
      </div>
    </div>
    <div className={styles.productExamples}><span className={styles.eyebrow}>{es ? "Prueba otro viaje" : "Try another journey"}</span><div role="group" aria-label={es ? "Viaje de ejemplo" : "Sample journey"}>{routes.map((item, index) => <EasyTButton variant="quiet" key={item.key} aria-pressed={item.key === route.key} onClick={() => { change(index, "product"); setNotice(""); setInsightOpen(false); }}>{homepageJourneyLabel(item.key, item.title).short}</EasyTButton>)}</div></div>
  </section>;
}
