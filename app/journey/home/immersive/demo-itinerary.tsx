"use client";

import { BedDouble, ChevronLeft, ChevronRight, Lightbulb, Route } from "lucide-react";
import { EasyTButton, EasyTSelect, EasyTSegmentedControl } from "@/components/easyt/easyt-controls";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import { homepageDemoItinerary, homepageDemoWeeks, type HomepageDemoItineraryDay } from "@/lib/easyt/homepage-demo-itinerary";
import itinerary from "@/components/easyt/trip-itinerary-workspace.module.css";
import styles from "./product-demo.module.css";

type Props = { route: ImmersiveRoute; nights: number[]; day: number; view: "days" | "calendar"; es: boolean; onDay: (day: number) => void; onView: (view: "days" | "calendar") => void };
function dateLabel(value: string, es: boolean, full = false) {
  return new Intl.DateTimeFormat(es ? "es" : "en", { day: "numeric", month: "short", year: full ? "numeric" : undefined, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
const partLabels = {
  morning: { en: "Morning", es: "Mañana" },
  midday: { en: "Midday", es: "Mediodía" },
  afternoon: { en: "Afternoon", es: "Tarde" },
  evening: { en: "Evening", es: "Noche" },
};

export default function DemoItinerary({ route, nights, day, view, es, onDay, onView }: Props) {
  const sample = homepageDemoItinerary(route, nights);
  const days = sample.days;
  const selected = days[day - 1] ?? days[0];
  const weeks = homepageDemoWeeks(sample);
  const calendar = view === "calendar";
  const selectedWeek = weeks.findIndex((week) => week.days.some((entry) => entry?.number === selected.number));
  const navigate = (direction: -1 | 1) => {
    if (!calendar) { onDay(selected.number + direction); return; }
    const target = weeks[selectedWeek + direction]?.days.find((entry) => entry !== null);
    if (target) onDay(target.number);
  };
  return <section className={`${itinerary.workspace} ${itinerary.workspaceWithoutContext} ${calendar ? itinerary.calendarWorkspace : ""} ${styles.itinerary}`} aria-label={es ? "Itinerario de ejemplo" : "Sample trip itinerary"}>
    <header className={itinerary.workspaceToolbar}>
      <div><h2>{calendar ? (es ? "Calendario" : "Calendar") : (es ? "Día a día" : "Day by day")}</h2><p>{dateLabel(days[0].date, es, true)} – {dateLabel(days.at(-1)!.date, es, true)} · {days.length} {es ? "días" : "days"}</p></div>
      <div className={itinerary.dateNavigation}>
        <EasyTButton icon={ChevronLeft} iconOnly size="small" variant="secondary" disabled={calendar ? selectedWeek <= 0 : selected.number === 1} onClick={() => navigate(-1)}>{calendar ? (es ? "Semana anterior" : "Previous week") : (es ? "Día anterior" : "Previous day")}</EasyTButton>
        <EasyTSelect label={es ? "Ir a fecha o destino" : "Jump to date / destination"} value={String(selected.number)} onChange={(event) => onDay(Number(event.target.value))}>
          {days.map((entry) => <option key={entry.number} value={entry.number}>{dateLabel(entry.date, es)} · {es ? "Día" : "Day"} {entry.number} · {route.stops[entry.stopIndex].name}</option>)}
        </EasyTSelect>
        <EasyTButton icon={ChevronRight} iconOnly size="small" variant="secondary" disabled={calendar ? selectedWeek >= weeks.length - 1 : selected.number === days.length} onClick={() => navigate(1)}>{calendar ? (es ? "Semana siguiente" : "Next week") : (es ? "Día siguiente" : "Next day")}</EasyTButton>
      </div>
      <div className={itinerary.subviewBar}><EasyTSegmentedControl ariaLabel={es ? "Vista del itinerario" : "Itinerary view"} options={[{ value: "days", label: es ? "Día a día" : "Day by day" }, { value: "calendar", label: es ? "Calendario" : "Calendar" }]} value={view} onChange={onView} /></div>
    </header>
    <p className={styles.sampleDisclosure}><Lightbulb aria-hidden="true" />{es ? sample.disclosure.es : sample.disclosure.en}</p>
    {calendar ? <div className={`${itinerary.calendarView} ${styles.demoCalendar}`} role="region" aria-label={es ? "Calendario de ejemplo" : "Sample calendar"}>
      <div className={itinerary.calendarWeekdays} aria-hidden="true">{Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(es ? "es" : "en", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, index + 1)))).map((label, index) => <span key={index}>{label}</span>)}</div>
      {weeks.filter((_, index) => index === selectedWeek).map((week) => <section className={itinerary.calendarWeek} key={week.id} aria-label={`${es ? "Semana del" : "Week of"} ${dateLabel(week.id, es)}`}>
        <h3>{es ? "Semana del" : "Week of"} {dateLabel(week.id, es)}</h3>
        <div className={`${itinerary.calendarBands} ${styles.demoCalendarBands}`} aria-label={es ? "Destinos para pasar la noche" : "Overnight destinations"}>
          {week.bands.map((band) => <div key={`${band.stopId}-${band.start}`} style={{ gridColumn: `${band.start + 1} / span ${band.span}` }}><BedDouble aria-hidden="true" /><b>{band.stopIndex + 1}</b><span>{route.stops[band.stopIndex].name} · {band.span} {es ? (band.span === 1 ? "noche" : "noches") : (band.span === 1 ? "night" : "nights")}{band.continued ? (es ? " · continúa" : " · continued") : ""}</span></div>)}
        </div>
        <div className={`${itinerary.calendarGrid} ${styles.demoCalendarGrid}`}>
          {week.days.map((entry, index) => entry ? <article className={itinerary.calendarDay} data-selected={entry.number === selected.number || undefined} key={entry.number}>
            <EasyTButton className={itinerary.calendarDaySelect} variant="quiet" aria-pressed={entry.number === selected.number} aria-label={`${es ? "Día" : "Day"} ${entry.number}, ${route.stops[entry.stopIndex].name}, ${dateLabel(entry.date, es)}`} onClick={() => onDay(entry.number)}>
              <span><time dateTime={entry.date}>{dateLabel(entry.date, es)}</time><i>{String(entry.number).padStart(2, "0")}</i></span><strong>{route.stops[entry.stopIndex].name}</strong><small>{!entry.overnight ? (es ? "Salida" : "Departure") : entry.transfer ? (es ? "Traslado" : "Transfer") : (es ? "Estancia" : "Stay")}</small>
            </EasyTButton>
            <ul className={`${itinerary.calendarItems} ${styles.demoCalendarItems}`}>
              {entry.transfer && <li className={styles.calendarIdea}><Route aria-hidden="true" /><span><strong>{entry.transfer.from} → {entry.transfer.to}</strong><small>{es ? "Traslado sugerido" : "Suggested transfer"}</small></span></li>}
              {entry.items.slice(0, 3).map((item) => <li className={styles.calendarIdea} key={item.id}><Lightbulb aria-hidden="true" /><span><strong>{es ? item.es : item.en}</strong><small>{partLabels[item.part][es ? "es" : "en"]}</small></span></li>)}
            </ul>
          </article> : <span className={itinerary.calendarBlank} aria-hidden="true" key={`${week.id}-${index}`} />)}
        </div>
      </section>)}
    </div> : <nav className={itinerary.rail} aria-label={es ? "Día a día" : "Day by day"}>
      <div className={itinerary.railHeader}><h2>{es ? "Día a día" : "Day by day"}</h2><span>{days.length} {es ? "días" : "days"}</span></div>
      <div className={itinerary.dayList} role="tablist" aria-label={es ? "Día a día" : "Day by day"}>
        {days.map((entry) => {
          // morrovia-ui-audit-allow-next-line native-control -- The production day rail uses roving focus and arrow-key navigation.
          return <button type="button" role="tab" aria-selected={entry.number === selected.number} aria-controls="homepage-demo-day-panel" id={`homepage-demo-day-${entry.number}`} tabIndex={entry.number === selected.number ? 0 : -1} className={entry.number === selected.number ? itinerary.dayButtonActive : itinerary.dayButton} key={entry.number} onClick={() => onDay(entry.number)} onKeyDown={(event) => {
            const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? Math.min(days.length, entry.number + 1) : event.key === "ArrowLeft" || event.key === "ArrowUp" ? Math.max(1, entry.number - 1) : event.key === "Home" ? 1 : event.key === "End" ? days.length : null;
            if (next === null) return;
            event.preventDefault(); onDay(next);
            window.requestAnimationFrame(() => document.getElementById(`homepage-demo-day-${next}`)?.focus());
          }}><b>{String(entry.number).padStart(2, "0")}</b><span><strong>{route.stops[entry.stopIndex].name}</strong><small>{dateLabel(entry.date, es)}</small></span></button>;
        })}
      </div>
    </nav>}
    <DayPanel entry={selected} route={route} nights={nights} es={es} calendar={calendar} />
  </section>;
}

function DayPanel({ entry, route, nights, es, calendar }: { entry: HomepageDemoItineraryDay; route: ImmersiveRoute; nights: number[]; es: boolean; calendar: boolean }) {
  const stop = route.stops[entry.stopIndex];
  return <div className={itinerary.dayPanel} role={calendar ? "region" : "tabpanel"} id="homepage-demo-day-panel" aria-label={calendar ? (es ? "Día seleccionado" : "Selected day") : undefined} aria-labelledby={calendar ? undefined : `homepage-demo-day-${entry.number}`}>
    <header className={itinerary.dayHeader}><div><p><span>{es ? "DÍA" : "DAY"} {String(entry.number).padStart(2, "0")}</span><i aria-hidden="true">·</i><time dateTime={entry.date}>{dateLabel(entry.date, es, true)}</time></p><h2>{stop.name}</h2><span className={itinerary.dayRole}>{stop.country}</span></div></header>
    {entry.overnight ? <div className={itinerary.stayContext} data-state="missing"><BedDouble aria-hidden="true" /><div className={itinerary.stayContextCopy}><strong>{es ? "Estancia por elegir" : "Stay to choose"}</strong><span>{stop.name} · {nights[entry.stopIndex]} {es ? "noches" : "nights"}</span></div></div> : <div className={itinerary.stayContext} data-state="unknown"><Route aria-hidden="true" /><div className={itinerary.stayContextCopy}><strong>{es ? "Fin del viaje de ejemplo" : "End of sample trip"}</strong><span>{es ? "Sin noche adicional prevista" : "No additional overnight planned"}</span></div></div>}
    <div className={styles.dayPlan}>
      {entry.transfer && <div className={styles.transferItem}><Route aria-hidden="true" /><div><strong>{entry.transfer.from} → {entry.transfer.to}</strong><span>{es ? "Ruta y horario por confirmar" : "Route and timing to confirm"}</span></div></div>}
      {entry.items.length ? <ol className={styles.sampleTimeline}>{entry.items.map((item) => <li key={item.id}><span className={styles.dayPart}>{partLabels[item.part][es ? "es" : "en"]}</span><div><Lightbulb aria-hidden="true" /><strong>{es ? item.es : item.en}</strong></div></li>)}</ol> : <p className={itinerary.timelineEmpty}>{es ? "Aún no hay actividades para este día." : "No activities planned for this day yet."}</p>}
    </div>
  </div>;
}
