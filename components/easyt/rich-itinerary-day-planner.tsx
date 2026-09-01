"use client";

import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  CalendarDays,
  CirclePlus,
  Clock3,
  MapPin,
  Route,
  Utensils,
} from "lucide-react";
import { useEffect, useId, useRef } from "react";
import {
  formatTripDuration,
} from "@/lib/easyt/trip-facts";
import { tripLegClassificationLabel } from "@/lib/easyt/trip-legs";
import {
  itineraryDayParts,
  type ComposedItineraryActivity,
  type ItineraryDayComposition,
} from "@/lib/easyt/itinerary-day-composition";
import type { ItineraryDayPart } from "@/lib/easyt/trip";
import { EasyTButton, EasyTField, EasyTLinkButton, EasyTSelect } from "./easyt-controls";
import styles from "./rich-itinerary-day-planner.module.css";

type RichItineraryDayPlannerProps = {
  composition: ItineraryDayComposition;
  addComposerDayPart?: ItineraryDayPart | null;
  addDraft?: string;
  addError?: string;
  ideasHref?: string;
  language?: "en" | "es";
  pendingActivityId?: string | null;
  onAddCancel?: () => void;
  onAddDraftChange?: (value: string) => void;
  onAddOpen?: (dayPart: ItineraryDayPart) => void;
  onAddSubmit?: () => void;
  onDayPartChange?: (activity: ComposedItineraryActivity, dayPart: ItineraryDayPart | null) => void;
  onMoveActivity?: (activity: ComposedItineraryActivity, direction: "earlier" | "later") => void;
  showHeader?: boolean;
};

const dayPartLabels: Record<"en" | "es", Record<ItineraryDayPart, string>> = {
  en: { morning: "Morning", midday: "Midday", afternoon: "Afternoon", evening: "Evening" },
  es: { morning: "Mañana", midday: "Mediodía", afternoon: "Tarde", evening: "Noche" },
};

function copyFor(language: "en" | "es") {
  return language === "es" ? {
    travel: "Viaje",
    arriving: "Llegada",
    departing: "Salida",
    estimate: "estimación de planificación",
    timingUnknown: "Horario por confirmar",
    scheduleCheck: "Consulta los horarios actuales antes de reservar.",
    free: "Libre",
    freeDetail: "No hay ninguna actividad fijada para este periodo.",
    addActivity: "Añadir actividad",
    addHere: "Añadir aquí",
    activityName: "Actividad para",
    save: "Guardar",
    cancel: "Cancelar",
    moveEarlier: "Mover antes en",
    moveLater: "Mover después en",
    bookedActivity: "Reservado",
    timeNotSet: "PLANIFICADO · HORA SIN FIJAR",
    choosePeriod: "Momento del día",
    unsetPeriod: "Hora sin fijar",
    tonight: "Esta noche",
    booked: "Reservado",
    notOrganised: "Alojamiento aún no organizado",
    stayUnknown: "Alojamiento por confirmar",
    noOvernight: "No hay una estancia nocturna en este día.",
    ideasAvailable: "ideas guardadas disponibles",
  } : {
    travel: "Travel",
    arriving: "Arriving",
    departing: "Departing",
    estimate: "planning estimate",
    timingUnknown: "Timing to confirm",
    scheduleCheck: "Check current schedules before booking.",
    free: "Free",
    freeDetail: "No activity is set for this part of the day.",
    addActivity: "Add activity",
    addHere: "Add here",
    activityName: "Activity for",
    save: "Save",
    cancel: "Cancel",
    moveEarlier: "Move earlier in",
    moveLater: "Move later in",
    bookedActivity: "Booked",
    timeNotSet: "PLANNED · TIME NOT SET",
    choosePeriod: "Part of day",
    unsetPeriod: "Time not set",
    tonight: "Tonight",
    booked: "Booked",
    notOrganised: "Stay not yet organised",
    stayUnknown: "Stay context to confirm",
    noOvernight: "There is no overnight stay on this day.",
    ideasAvailable: "saved ideas available",
  };
}

function formatDayDate(date: string, language: "en" | "es") {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(language === "es" ? "es" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(parsed);
}

function ActivityRow({
  activity,
  language,
  pending,
  controlId,
  canMoveEarlier,
  canMoveLater,
  onBeforeDayPartChange,
  onDayPartChange,
  onMoveActivity,
}: {
  activity: ComposedItineraryActivity;
  language: "en" | "es";
  pending: boolean;
  controlId: string;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onBeforeDayPartChange: (activityId: string) => void;
  onDayPartChange?: RichItineraryDayPlannerProps["onDayPartChange"];
  onMoveActivity?: RichItineraryDayPlannerProps["onMoveActivity"];
}) {
  const Icon = activity.category === "restaurant" ? Utensils : MapPin;
  const copy = copyFor(language);
  return (
    <article className={styles.activity} aria-busy={pending || undefined}>
      <Icon aria-hidden="true" />
      <div className={styles.activityTitle}>
        <strong>{activity.title}</strong>
        {activity.booking ? <span>{copy.bookedActivity}</span> : null}
      </div>
      {activity.dayPartEditable ? (
        <EasyTSelect
          id={controlId}
          fieldClassName={styles.dayPartField}
          label={`${copy.choosePeriod}: ${activity.title}`}
          value={activity.dayPart ?? ""}
          disabled={pending || !onDayPartChange}
          onChange={(event) => {
            onBeforeDayPartChange(activity.id);
            onDayPartChange?.(activity, event.target.value ? event.target.value as ItineraryDayPart : null);
          }}
        >
          <option value="">{copy.unsetPeriod}</option>
          {itineraryDayParts.map((part) => (
            <option value={part} key={part}>{dayPartLabels[language][part]}</option>
          ))}
        </EasyTSelect>
      ) : null}
      {activity.dayPartEditable && activity.dayPart !== null && onMoveActivity ? <div className={styles.activityMoveActions}>
        <EasyTButton
          icon={ArrowUp}
          iconOnly
          size="small"
          variant="quiet"
          disabled={pending || !canMoveEarlier}
          onClick={() => { onBeforeDayPartChange(activity.id); onMoveActivity(activity, "earlier"); }}
        >{copy.moveEarlier} {dayPartLabels[language][activity.dayPart]}: {activity.title}</EasyTButton>
        <EasyTButton
          icon={ArrowDown}
          iconOnly
          size="small"
          variant="quiet"
          disabled={pending || !canMoveLater}
          onClick={() => { onBeforeDayPartChange(activity.id); onMoveActivity(activity, "later"); }}
        >{copy.moveLater} {dayPartLabels[language][activity.dayPart]}: {activity.title}</EasyTButton>
      </div> : null}
    </article>
  );
}

export default function RichItineraryDayPlanner({
  composition,
  addComposerDayPart = null,
  addDraft = "",
  addError = "",
  ideasHref,
  language = "en",
  pendingActivityId,
  onAddCancel,
  onAddDraftChange,
  onAddOpen,
  onAddSubmit,
  onDayPartChange,
  onMoveActivity,
  showHeader = true,
}: RichItineraryDayPlannerProps) {
  const copy = copyFor(language);
  const titleId = `rich-day-${composition.day.id}`;
  const tonight = composition.tonight;
  const controlPrefix = useId().replaceAll(":", "");
  const focusAfterMoveRef = useRef<string | null>(null);
  useEffect(() => {
    const activityId = focusAfterMoveRef.current;
    if (!activityId) return;
    const control = document.getElementById(`${controlPrefix}-${activityId}`);
    if (control instanceof HTMLSelectElement) {
      control.focus();
      focusAfterMoveRef.current = null;
    }
  }, [composition, controlPrefix]);
  return (
    <section className={styles.planner} aria-labelledby={showHeader ? titleId : undefined} aria-label={showHeader ? undefined : `Day ${composition.day.dayNumber} planner`}>
      {showHeader ? <header className={styles.header}>
        <div>
          <p><CalendarDays aria-hidden="true" />Day {composition.day.dayNumber} · <time dateTime={composition.context.date}>{formatDayDate(composition.context.date, language)}</time></p>
          <h2 id={titleId}>{composition.context.destination}</h2>
        </div>
        {composition.context.travelDay ? <span className={styles.travelDay}><Route aria-hidden="true" />{copy.travel}</span> : null}
      </header> : null}

      {composition.transfers.length ? (
        <section className={styles.travel} aria-labelledby={`${titleId}-travel`}>
          <div className={styles.sectionHeading}>
            <Route aria-hidden="true" />
            <h3 id={`${titleId}-travel`}>{copy.travel}</h3>
          </div>
          <div className={styles.transferList}>
            {composition.transfers.map((transfer) => {
              const duration = transfer.durationMinutes === null ? null : formatTripDuration(transfer.durationMinutes);
              return (
                <article className={styles.transfer} key={`${transfer.direction}-${transfer.id}`}>
                  <span>{transfer.direction === "arriving" ? copy.arriving : copy.departing}</span>
                  <strong>{transfer.origin && transfer.destination ? `${transfer.origin} → ${transfer.destination}` : tripLegClassificationLabel(transfer.classification)}</strong>
                  <p>
                    {transfer.mode !== "unknown" ? transfer.mode : tripLegClassificationLabel(transfer.classification)}
                    {duration ? ` · ${transfer.durationIsEstimate ? "~" : ""}${duration}` : ` · ${copy.timingUnknown}`}
                    {duration && transfer.durationIsEstimate ? ` · ${copy.estimate}` : ""}
                  </p>
                  {transfer.scheduleNeedsChecking ? <small>{copy.scheduleCheck}</small> : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className={styles.periodGrid}>
        {itineraryDayParts.map((part) => {
          const activities = composition.planned[part];
          const headingId = `${titleId}-${part}`;
          return (
            <section className={styles.period} aria-labelledby={headingId} key={part}>
              <div className={styles.periodHeading}>
                <h3 id={headingId}>{dayPartLabels[language][part]}</h3>
                {activities.length ? <span>{activities.length}</span> : null}
              </div>
              {activities.length ? (
                <div className={styles.activityList}>
                  {activities.map((activity, activityIndex) => (
                    <ActivityRow
                      activity={activity}
                      language={language}
                      pending={pendingActivityId === activity.id}
                      controlId={`${controlPrefix}-${activity.id}`}
                      canMoveEarlier={activity.noteIndex !== null && (activities[activityIndex - 1]?.noteIndex ?? null) !== null}
                      canMoveLater={activity.noteIndex !== null && (activities[activityIndex + 1]?.noteIndex ?? null) !== null}
                      onBeforeDayPartChange={(activityId) => { focusAfterMoveRef.current = activityId; }}
                      onDayPartChange={onDayPartChange}
                      onMoveActivity={onMoveActivity}
                      key={activity.id}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.freePeriod}>
                  <strong>{copy.free}</strong>
                  <p>{copy.freeDetail}</p>
                </div>
              )}
              <div className={styles.addHere}>
                {addComposerDayPart === part ? <form onSubmit={(event) => { event.preventDefault(); onAddSubmit?.(); }}>
                  <EasyTField
                    autoFocus
                    label={`${copy.activityName} ${dayPartLabels[language][part]}`}
                    error={addError || undefined}
                    value={addDraft}
                    onChange={(event) => onAddDraftChange?.(event.target.value)}
                  />
                  <div>
                    <EasyTButton type="submit" icon={CirclePlus} size="small" disabled={!addDraft.trim()}>{copy.save}</EasyTButton>
                    <EasyTButton size="small" variant="quiet" onClick={onAddCancel}>{copy.cancel}</EasyTButton>
                  </div>
                </form> : onAddOpen ? (
                  <EasyTButton
                    aria-label={`${copy.addActivity} ${language === "es" ? "a" : "to"} ${dayPartLabels[language][part]}`}
                    icon={CirclePlus}
                    size="small"
                    variant="quiet"
                    onClick={() => onAddOpen(part)}
                  >{copy.addHere}</EasyTButton>
                ) : ideasHref ? <EasyTLinkButton href={ideasHref} icon={CirclePlus} size="small" variant="quiet">{copy.addHere}</EasyTLinkButton> : null}
              </div>
            </section>
          );
        })}
      </div>

      {composition.unslotted.length ? (
        <section className={styles.unslotted} aria-labelledby={`${titleId}-unslotted`}>
          <div className={styles.unslottedHeading}>
            <div>
              <Clock3 aria-hidden="true" />
              <h3 id={`${titleId}-unslotted`}>{copy.timeNotSet}</h3>
            </div>
            <span>{composition.unslotted.length}</span>
          </div>
          <div className={styles.unslottedList}>
            {composition.unslotted.map((activity) => (
              <ActivityRow
                activity={activity}
                language={language}
                pending={pendingActivityId === activity.id}
                controlId={`${controlPrefix}-${activity.id}`}
                canMoveEarlier={false}
                canMoveLater={false}
                onBeforeDayPartChange={(activityId) => { focusAfterMoveRef.current = activityId; }}
                onDayPartChange={onDayPartChange}
                onMoveActivity={onMoveActivity}
                key={activity.id}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.tonight} aria-labelledby={`${titleId}-tonight`}>
        <BedDouble aria-hidden="true" />
        <div>
          <h3 id={`${titleId}-tonight`}>{copy.tonight}</h3>
          {tonight.state === "booked" ? (
            <><strong>{tonight.booking?.title}</strong><p>{copy.booked} · {tonight.destination}</p></>
          ) : tonight.state === "not-organised" ? (
            <><strong>{tonight.destination}</strong><p>{copy.notOrganised}</p></>
          ) : tonight.state === "unknown" ? (
            <><strong>{tonight.destination ?? copy.stayUnknown}</strong><p>{copy.stayUnknown}</p></>
          ) : <p>{copy.noOvernight}</p>}
        </div>
        {composition.ideas.unscheduledCount ? <small>{composition.ideas.unscheduledCount} {copy.ideasAvailable}</small> : null}
      </section>
    </section>
  );
}
