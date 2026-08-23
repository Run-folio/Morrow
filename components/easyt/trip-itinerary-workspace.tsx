"use client";

import {
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Route,
  Sparkles,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { EasyTTrip, PlanItem, TripLeg, TripStop } from "@/lib/easyt/trip";
import type { JourneyImage } from "@/lib/journey";
import { itineraryImageFor } from "@/lib/easyt/itinerary-media";
import legacyStyles from "@/app/journey/new/trip-builder.module.css";
import legacyMobile from "@/app/journey/new/trip-builder-mobile.module.css";
import styles from "./trip-itinerary-workspace.module.css";

type ItineraryWorkspaceProps = {
  trip: EasyTTrip;
  presentation?: "shell" | "legacy";
  language?: "en" | "es";
  selectedPlaceCount?: number;
  onEditBrief?: () => void;
  onOpenMap?: () => void;
};

const pad = (value: number) => String(value).padStart(2, "0");

function displayDate(value: string, language: "en" | "es", compact = false) {
  const date = value ? new Date(`${value}T12:00:00`) : null;
  if (!date || Number.isNaN(date.getTime())) return value || "Date to confirm";
  return new Intl.DateTimeFormat(language === "es" ? "es" : "en", compact
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function durationLabel(minutes: number | null) {
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `${hours}h ` : ""}${remainder ? `${remainder}m` : ""}`.trim();
}

function stopForDay(trip: EasyTTrip, day: PlanItem) {
  return trip.stops.find((stop) => stop.id === day.stopId) ?? null;
}

function incomingLegForDay(trip: EasyTTrip, day: PlanItem, index: number) {
  if (index === 0) return null;
  const previous = trip.planItems[index - 1];
  if (!previous || previous.stopId === day.stopId) return null;
  return trip.legs.find((leg) => leg.fromStopId === previous.stopId && leg.toStopId === day.stopId)
    ?? trip.legs.find((leg) => leg.toStopId === day.stopId)
    ?? null;
}

function imageFromPlanItem(day: PlanItem, stop: TripStop | null, index: number): JourneyImage | null {
  if (day.image) {
    return {
      src: day.image,
      alt: day.title,
      caption: stop?.name ?? day.title,
      sourceUrl: day.sourceUrl ?? "",
    };
  }
  return itineraryImageFor({
    title: day.title,
    destination: stop?.name ?? "",
    items: day.notes,
  }, index);
}

function itineraryCopy(language: "en" | "es") {
  return language === "es" ? {
    draft: "Borrador · editable",
    editBrief: "Editar resumen",
    dayByDay: "Día a día",
    days: "DÍAS",
    destinations: "destinos · reparto personalizado",
    placesSelected: "lugares seleccionados",
    previousDay: "Día anterior",
    nextDay: "Día siguiente",
    openMap: "Abrir mapa →",
    source: "Fuente ↗",
    itineraryEmpty: "Este itinerario aún no tiene días planificados.",
    transfer: "Traslado",
    estimate: "Estimación puerta a puerta",
  } : {
    draft: "Draft · editable",
    editBrief: "Edit brief",
    dayByDay: "Day by day",
    days: "DAYS",
    destinations: "destinations · custom split",
    placesSelected: "places selected",
    previousDay: "Previous day",
    nextDay: "Next day",
    openMap: "Open map view →",
    source: "Source ↗",
    itineraryEmpty: "This itinerary does not have any planned days yet.",
    transfer: "Transfer",
    estimate: "Door-to-door estimate",
  };
}

export default function TripItineraryWorkspace({
  trip,
  presentation = "shell",
  language = "en",
  selectedPlaceCount,
  onEditBrief,
  onOpenMap,
}: ItineraryWorkspaceProps) {
  const days = useMemo(
    () => [...trip.planItems].sort((left, right) => left.dayNumber - right.dayNumber),
    [trip.planItems],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [remoteImages, setRemoteImages] = useState<Record<string, JourneyImage>>({});
  const tabIdPrefix = useId().replaceAll(":", "");
  const copy = itineraryCopy(language);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(0, days.length - 1)));
  }, [days.length]);

  useEffect(() => {
    if (!days.length) return;
    const missing = days.filter((day, index) => !imageFromPlanItem(day, stopForDay(trip, day), index));
    if (!missing.length) return;
    let active = true;
    const controller = new AbortController();
    void Promise.all(missing.map(async (day) => {
      const stop = stopForDay(trip, day);
      const response = await fetch(`/api/journey-place?title=${encodeURIComponent(day.title)}&area=${encodeURIComponent(stop?.name ?? "")}&country=${encodeURIComponent(stop?.country ?? "")}`, { signal: controller.signal });
      if (!response.ok) return null;
      const payload = await response.json() as { place?: { image?: string; alt?: string; sourceUrl?: string; sourceLabel?: string } | null };
      if (!payload.place?.image) return null;
      return [day.id, {
        src: payload.place.image,
        alt: payload.place.alt ?? day.title,
        caption: stop?.name ?? day.title,
        sourceUrl: payload.place.sourceUrl ?? payload.place.image,
        sourceLabel: payload.place.sourceLabel,
      } satisfies JourneyImage] as const;
    })).then((results) => {
      if (!active) return;
      const resolved = results.reduce<Record<string, JourneyImage>>((images, result) => {
        if (result) images[result[0]] = result[1];
        return images;
      }, {});
      setRemoteImages((current) => ({
        ...current,
        ...resolved,
      }));
    }).catch(() => undefined);
    return () => { active = false; controller.abort(); };
  }, [days, trip]);

  if (!days.length) {
    return (
      <section className={styles.empty} aria-live="polite">
        <CalendarDays aria-hidden="true" />
        <h2>Itinerary to confirm</h2>
        <p>{copy.itineraryEmpty}</p>
      </section>
    );
  }

  const index = Math.min(selectedIndex, days.length - 1);
  const active = days[index];
  const stop = stopForDay(trip, active);
  const image = imageFromPlanItem(active, stop, index) ?? remoteImages[active.id] ?? null;
  const incomingLeg = incomingLegForDay({ ...trip, planItems: days }, active, index);

  if (presentation === "legacy") {
    return (
      <div className={`${legacyStyles.shellWide} ${legacyMobile.builder}`}>
        <div className={legacyStyles.draftHead}>
          <div>
            <p className={legacyStyles.eyebrow}>{copy.draft}</p>
            <h2>{trip.title}</h2>
          </div>
          {onEditBrief ? <button type="button" className={legacyStyles.primary} onClick={onEditBrief}>{copy.editBrief}</button> : null}
        </div>
        <div className={legacyStyles.draftSummary}>
          <span><CalendarDays /> {days.length} days</span>
          <span><Clock3 /> {trip.stops.length} {copy.destinations}</span>
          <span><MapPin /> {selectedPlaceCount ?? days.reduce((sum, day) => sum + day.notes.length, 0)} {copy.placesSelected}</span>
        </div>
        <div className={legacyStyles.draftBody}>
          <LegacyDayRail days={days} trip={trip} selectedIndex={index} setSelectedIndex={setSelectedIndex} copy={copy} language={language} />
          <section className={legacyStyles.dayDetail}>
            <LegacyDayContent day={active} stop={stop} image={image} index={index} days={days} setSelectedIndex={setSelectedIndex} copy={copy} language={language} />
          </section>
        </div>
        {onOpenMap ? <div className={legacyStyles.draftFoot}><button type="button" className={legacyStyles.primary} onClick={onOpenMap}>{copy.openMap}</button></div> : null}
      </div>
    );
  }

  return (
    <section className={styles.workspace} aria-label="Trip itinerary">
      <div className={styles.rail}>
        <div className={styles.railHeader}>
          <h2>{copy.dayByDay}</h2>
          <span>{days.length} {copy.days}</span>
        </div>
        <div className={styles.dayList} role="tablist" aria-label={copy.dayByDay}>
          {days.map((day, dayIndex) => {
            const dayStop = stopForDay(trip, day);
            return (
              <button
                type="button"
                role="tab"
                aria-selected={dayIndex === index}
                aria-controls={`${tabIdPrefix}-panel`}
                id={`${tabIdPrefix}-tab-${dayIndex}`}
                tabIndex={dayIndex === index ? 0 : -1}
                className={dayIndex === index ? styles.dayButtonActive : styles.dayButton}
                key={day.id}
                onClick={() => setSelectedIndex(dayIndex)}
                onKeyDown={(event) => {
                  const nextIndex = event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? Math.min(days.length - 1, dayIndex + 1)
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? Math.max(0, dayIndex - 1)
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? days.length - 1
                          : null;
                  if (nextIndex === null) return;
                  event.preventDefault();
                  setSelectedIndex(nextIndex);
                  window.requestAnimationFrame(() => document.getElementById(`${tabIdPrefix}-tab-${nextIndex}`)?.focus());
                }}
              >
                <b>{pad(day.dayNumber)}</b>
                <span><small>{dayStop?.name ?? "Route"}</small><strong>{day.title}</strong></span>
                <time dateTime={day.date}>{displayDate(day.date, language, true)}</time>
              </button>
            );
          })}
        </div>
      </div>

      <article
        className={styles.dayPanel}
        role="tabpanel"
        id={`${tabIdPrefix}-panel`}
        aria-labelledby={`${tabIdPrefix}-tab-${index}`}
      >
        <header className={styles.dayHeader}>
          <div>
            <p><span>{displayDate(active.date, language, true)}</span><i aria-hidden="true">·</i> DAY {pad(active.dayNumber)}</p>
            <h2>{active.title}</h2>
            {active.reason ? <span>{active.reason}</span> : null}
          </div>
          {stop ? <span className={styles.location}><MapPin aria-hidden="true" />{stop.name}</span> : null}
        </header>

        <DayImage image={image} day={active} stop={stop} sourceLabel={copy.source} className={styles.dayImage} fallbackClassName={styles.dayImageFallback} />

        <div className={styles.details}>
          {incomingLeg ? <TransferRow leg={incomingLeg} copy={copy} trip={trip} /> : null}
          {active.notes.map((note, noteIndex) => (
            <div className={styles.detailRow} key={`${active.id}-note-${noteIndex}`}>
              <span className={styles.detailIcon}>{noteIndex === 0 ? <Route aria-hidden="true" /> : noteIndex === 1 ? <Clock3 aria-hidden="true" /> : active.type === "stay" ? <BedDouble aria-hidden="true" /> : <Sparkles aria-hidden="true" />}</span>
              <b>{pad(noteIndex + 1 + (incomingLeg ? 1 : 0))}</b>
              <p>{note}</p>
            </div>
          ))}
          {!active.notes.length && !incomingLeg ? <p className={styles.noDetails}>No additional details have been added for this day.</p> : null}
        </div>

        <DayNavigation index={index} count={days.length} setSelectedIndex={setSelectedIndex} copy={copy} />
      </article>
    </section>
  );
}

function LegacyDayRail({ days, trip, selectedIndex, setSelectedIndex, copy, language }: {
  days: PlanItem[]; trip: EasyTTrip; selectedIndex: number; setSelectedIndex: (index: number) => void;
  copy: ReturnType<typeof itineraryCopy>; language: "en" | "es";
}) {
  return (
    <div className={legacyStyles.timeline}>
      <div className={legacyStyles.timelineHead}><strong>{copy.dayByDay}</strong><small>{days.length} {copy.days}</small></div>
      {days.map((day, index) => (
        <button type="button" key={day.id} className={`${legacyStyles.timelineRow} ${index === selectedIndex ? legacyStyles.timelineRowOn : ""}`} onClick={() => setSelectedIndex(index)}>
          <b>{pad(day.dayNumber)}</b>
          <span><em>{stopForDay(trip, day)?.name ?? "Route"}</em><strong>{day.title}</strong></span>
          <small>{displayDate(day.date, language, true)}</small>
        </button>
      ))}
    </div>
  );
}

function LegacyDayContent({ day, stop, image, index, days, setSelectedIndex, copy, language }: {
  day: PlanItem; stop: TripStop | null; image: JourneyImage | null; index: number; days: PlanItem[];
  setSelectedIndex: (index: number) => void; copy: ReturnType<typeof itineraryCopy>; language: "en" | "es";
}) {
  return <>
    <div className={legacyStyles.dayMeta}>
      <p><span>{displayDate(day.date, language, true)}</span> · DAY {pad(day.dayNumber)}</p>
      {stop ? <span><MapPin /> {stop.name}</span> : null}
    </div>
    <h3>{day.title}</h3>
    <p className={legacyStyles.dayReason}>{day.reason}</p>
    <DayImage image={image} day={day} stop={stop} sourceLabel={copy.source} className={legacyStyles.dayImage} fallbackClassName={legacyStyles.dayImageFallback} />
    <ol className={legacyStyles.dayItems}>{day.notes.map((text, noteIndex) => <li key={noteIndex}><b>{pad(noteIndex + 1)}</b>{text}</li>)}</ol>
    <div className={legacyStyles.dayNav}>
      <button type="button" disabled={index === 0} onClick={() => setSelectedIndex(index - 1)}>← {copy.previousDay}</button>
      <button type="button" disabled={index >= days.length - 1} onClick={() => setSelectedIndex(index + 1)}>{copy.nextDay} →</button>
    </div>
  </>;
}

function DayImage({ image, day, stop, sourceLabel, className, fallbackClassName }: {
  image: JourneyImage | null; day: PlanItem; stop: TripStop | null; sourceLabel: string; className: string; fallbackClassName: string;
}) {
  if (!image) return <div className={`${className} ${fallbackClassName}`} role="img" aria-label={`Image for ${day.title}`}><span>{stop?.name ?? day.title}</span></div>;
  return (
    <figure className={className}>
      <img src={image.src} alt={image.alt || day.title} />
      <figcaption>
        <span>{image.caption || stop?.name || day.title}</span>
        {image.sourceUrl ? <a href={image.sourceUrl} target="_blank" rel="noreferrer">{image.sourceLabel ?? sourceLabel}</a> : null}
      </figcaption>
    </figure>
  );
}

function TransferRow({ leg, copy, trip }: { leg: TripLeg; copy: ReturnType<typeof itineraryCopy>; trip: EasyTTrip }) {
  const from = trip.stops.find((stop) => stop.id === leg.fromStopId)?.name;
  const to = trip.stops.find((stop) => stop.id === leg.toStopId)?.name;
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailIcon}><Route aria-hidden="true" /></span>
      <b>01</b>
      <p><strong>{copy.transfer}</strong>{from && to ? `${from} → ${to}` : leg.mode}</p>
      {durationLabel(leg.durationMinutes) ? <span className={styles.duration}><small>{copy.estimate}</small>{durationLabel(leg.durationMinutes)}</span> : null}
    </div>
  );
}

function DayNavigation({ index, count, setSelectedIndex, copy }: {
  index: number; count: number; setSelectedIndex: (index: number) => void; copy: ReturnType<typeof itineraryCopy>;
}) {
  return (
    <nav className={styles.dayNavigation} aria-label="Day navigation">
      <button type="button" disabled={index === 0} onClick={() => setSelectedIndex(index - 1)}><ChevronLeft aria-hidden="true" />{copy.previousDay}</button>
      <span>Day {index + 1} of {count}</span>
      <button type="button" disabled={index === count - 1} onClick={() => setSelectedIndex(index + 1)}>{copy.nextDay}<ChevronRight aria-hidden="true" /></button>
    </nav>
  );
}
