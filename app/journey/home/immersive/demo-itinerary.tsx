"use client";

import { BedDouble, ChevronLeft, ChevronRight, CirclePlus, Route } from "lucide-react";
import { EasyTButton, EasyTSelect } from "@/components/easyt/easyt-controls";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import { homepageDemoDate, homepageDemoDay, homepageDemoStopForDay } from "@/lib/easyt/homepage-demo";
import itinerary from "@/components/easyt/trip-itinerary-workspace.module.css";
import styles from "./product-demo.module.css";

type Props = { route: ImmersiveRoute; nights: number[]; day: number; es: boolean; onDay: (day: number) => void };

function dateLabel(value: string, es: boolean, full = false) {
  return new Intl.DateTimeFormat(es ? "es" : "en", { day: "numeric", month: "short", year: full ? "numeric" : undefined, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export default function DemoItinerary({ route, nights, day, es, onDay }: Props) {
  const totalDays = nights.reduce((sum, value) => sum + value, 1);
  const days = Array.from({ length: totalDays }, (_, index) => index + 1);
  const stopIndex = homepageDemoStopForDay(nights, day);
  const stop = route.stops[stopIndex];
  const incoming = stopIndex > 0 && day === homepageDemoDay(nights, stopIndex) ? route.stops[stopIndex - 1].onward : null;
  return <section className={`${itinerary.workspace} ${itinerary.workspaceWithoutContext} ${styles.itinerary}`} aria-label={es ? "Itinerario de ejemplo" : "Sample trip itinerary"}>
    <header className={itinerary.workspaceToolbar}>
      <div><h2>{es ? "Día a día" : "Day by day"}</h2><p>{dateLabel(homepageDemoDate(route.key, 1), es, true)} – {dateLabel(homepageDemoDate(route.key, totalDays), es, true)} · {totalDays} {es ? "días" : "days"}</p></div>
      <div className={itinerary.dateNavigation}>
        <EasyTButton icon={ChevronLeft} iconOnly size="small" variant="secondary" disabled={day === 1} onClick={() => onDay(day - 1)}>{es ? "Día anterior" : "Previous day"}</EasyTButton>
        <EasyTSelect label={es ? "Ir a fecha o destino" : "Jump to date / destination"} value={String(day)} onChange={(event) => onDay(Number(event.target.value))}>
          {days.map((number) => <option key={number} value={number}>{dateLabel(homepageDemoDate(route.key, number), es)} · {es ? "Día" : "Day"} {number} · {route.stops[homepageDemoStopForDay(nights, number)].name}</option>)}
        </EasyTSelect>
        <EasyTButton icon={ChevronRight} iconOnly size="small" variant="secondary" disabled={day === totalDays} onClick={() => onDay(day + 1)}>{es ? "Día siguiente" : "Next day"}</EasyTButton>
      </div>
    </header>
    <div className={itinerary.dayPanel} role="region" aria-label={`${es ? "Día" : "Day"} ${day}: ${stop.name}`}>
      <header className={itinerary.dayHeader}><div><p><span>{es ? "DÍA" : "DAY"} {String(day).padStart(2, "0")}</span><i aria-hidden="true">·</i><time dateTime={homepageDemoDate(route.key, day)}>{dateLabel(homepageDemoDate(route.key, day), es, true)}</time></p><h2>{stop.name}</h2><span className={itinerary.dayRole}>{stop.country}</span></div></header>
      <div className={itinerary.stayContext} data-state="missing"><BedDouble aria-hidden="true" /><div className={itinerary.stayContextCopy}><strong>{es ? "Estancia por elegir" : "Stay to choose"}</strong><span>{stop.name} · {nights[stopIndex]} {es ? "noches" : "nights"}</span></div></div>
      <div className={styles.dayPlan}>
        {incoming && <div className={styles.transferItem}><Route aria-hidden="true" /><div><strong>{incoming.from} → {stop.name}</strong><span>{incoming.modeLabel} · {incoming.planningMinutes ? incoming.durationLabel : (es ? "Tiempo por confirmar" : "Timing to confirm")}</span></div></div>}
        <div className={itinerary.timelineEmpty}><CirclePlus aria-hidden="true" /><p>{es ? "Aún no hay actividades para este día." : "No activities planned for this day yet."}</p></div>
      </div>
    </div>
  </section>;
}
