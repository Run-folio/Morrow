"use client";

import Link from "next/link";
import { ArrowUpRight, CarFront, CircleHelp, MapPin, Plane, Plus, Ship, TrainFront } from "lucide-react";
import { useState } from "react";
import type { JourneyCalendarDay, JourneyStop } from "@/lib/journey";
import type { MapPlanAgendaItem, MapPlanDayOption } from "@/lib/easyt/map-plan-agenda";
import type { ItineraryDayPart, PlanItem } from "@/lib/easyt/trip";
import styles from "@/app/journey/journey.module.css";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";

export type PlanWorkspaceCopy = {
  addActivity: string;
  add: string;
  cancel: string;
};

export interface PlanWorkspaceProps {
  context: {
    selectedDay: JourneyCalendarDay;
    selectedStop: JourneyStop;
    planItem?: PlanItem;
    days: MapPlanDayOption[];
    items: MapPlanAgendaItem[];
    freeTime: ItineraryDayPart | null;
  };
  activity: {
    draft: string;
    onDraftChange: (value: string) => void;
    onAdd: () => void;
  };
  navigation: {
    onSelectDay: (dayNumber: number) => void;
    onSelectItem: (selectionId: string) => void;
    onSelectTransfer: (legId: string) => void;
    onFindNearby: (dayPart: ItineraryDayPart) => void;
  };
  editHref: string;
  copy: PlanWorkspaceCopy;
  googlePlacesAvailable?: boolean;
  savedReferences?: readonly { id: string; placeId: string; dayLabel: string | null; mapsUrl: string }[];
  onSelectSavedReference?: (referenceId: string, placeId: string) => void;
}

function dayDateLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "Date to confirm";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(parsed);
}

function titleCase(value: string) {
  return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}

function TransferIcon({ item }: { item: MapPlanAgendaItem }) {
  const Icon = item.transferMode === "flight" ? Plane
    : item.transferMode === "train" ? TrainFront
      : item.transferMode === "ferry" ? Ship
        : item.transferMode === "road" ? CarFront
          : CircleHelp;
  return <Icon aria-hidden="true" />;
}

function AgendaRow({ item, navigation }: { item: MapPlanAgendaItem; navigation: PlanWorkspaceProps["navigation"] }) {
  const content = item.kind === "transfer" ? <>
    <TransferIcon item={item} />
    <strong className={styles.mapPlanTitle}>{item.title}</strong>
    {item.metadata ? <small className={styles.mapPlanMeta}>{item.metadata}</small> : null}
  </> : <>
    <span className={styles.mapPlanSchedule}>{item.scheduleLabel ?? ""}</span>
    <strong className={styles.mapPlanTitle}>{item.title}</strong>
    {item.metadata ? <small className={styles.mapPlanMeta}>{item.metadata}</small> : null}
    {item.kind === "activity" && item.mapSelectionId ? <MapPin className={styles.mapPlanMappable} aria-hidden="true" /> : null}
  </>;
  return <li className={`${styles.mapPlanAgendaItem} ${item.kind === "transfer" ? styles.mapPlanTransfer : ""}`}>
    {item.kind === "transfer" ? <button type="button" className={styles.mapPlanAgendaRow} onClick={() => navigation.onSelectTransfer(item.id)} aria-label={`Show transfer ${item.title} on the map`}>{content}</button>
      : item.mapSelectionId ? <button type="button" className={styles.mapPlanAgendaRow} onClick={() => navigation.onSelectItem(item.mapSelectionId!)} aria-label={`Show ${item.title} on the map`}>{content}</button>
        : <div className={styles.mapPlanAgendaRow}>{content}</div>}
    {item.detail ? <details className={styles.mapPlanTransferDetail}><summary>Transfer details</summary><p>{item.detail}</p></details> : null}
  </li>;
}

export function PlanWorkspace({ context, activity, navigation, editHref, copy, googlePlacesAvailable = false, savedReferences = [], onSelectSavedReference }: PlanWorkspaceProps) {
  const { selectedDay, selectedStop, planItem, days, items, freeTime } = context;
  const [addingActivity, setAddingActivity] = useState(false);

  return (
    <section className={styles.shapeDayPlan} aria-label="Selected day plan">
      <p className={styles.shapeDayContext}>{selectedDay.date} · {selectedStop.city}</p>
      {days.length > 1 ? <nav className={styles.mapPlanDays} aria-label={`Days in ${selectedStop.city}`}>
        {days.map((day) => {
          const active = day.dayNumber === planItem?.dayNumber;
          return <button key={day.id} type="button" aria-current={active ? "date" : undefined} aria-pressed={active} onClick={() => navigation.onSelectDay(day.dayNumber)}><strong>Day {day.dayNumber}</strong><small>{dayDateLabel(day.date)}</small></button>;
        })}
      </nav> : null}

      {items.length ? <ol className={styles.mapPlanAgenda}>
        {items.map((item) => <AgendaRow key={`${item.kind}-${item.id}`} item={item} navigation={navigation} />)}
      </ol> : <p className={styles.mapPlanEmpty}>Nothing is scheduled for this day yet.</p>}

      {savedReferences.length ? <section aria-label="Saved for later">
        <h3>Saved for later</h3>
        <ul className={`${styles.mapPlanAgenda} ${styles.mapPlanSavedReferences}`}>
          {savedReferences.map((reference) => <li key={reference.id}>
            {googlePlacesAvailable && onSelectSavedReference
              ? <EasyTButton variant="quiet" fullWidth onClick={() => onSelectSavedReference(reference.id, reference.placeId)}>
                  Saved place{reference.dayLabel ? ` · ${reference.dayLabel}` : " · for later"}
                </EasyTButton>
              : <EasyTLinkButton className={styles.mapPlanSavedReferenceLink} variant="quiet" fullWidth icon={ArrowUpRight} href={reference.mapsUrl} target="_blank" rel="noopener noreferrer">
                  Saved Google place{reference.dayLabel ? ` · ${reference.dayLabel}` : " · for later"} · Open in Google Maps
                </EasyTLinkButton>}
          </li>)}
        </ul>
      </section> : null}

      {freeTime ? <button type="button" className={styles.mapPlanFreeTime} onClick={() => navigation.onFindNearby(freeTime)}><span><strong>{titleCase(freeTime)} free</strong><small>Find something nearby</small></span><ArrowUpRight aria-hidden="true" /></button> : null}

      <footer className={styles.mapPlanActions}>
        <button type="button" aria-expanded={addingActivity} onClick={() => setAddingActivity((open) => !open)}><Plus aria-hidden="true" />{copy.addActivity}</button>
        <Link href={editHref}>Edit full itinerary</Link>
      </footer>
      {addingActivity ? <form className={styles.addActivity} onSubmit={(event) => {
        event.preventDefault();
        if (!activity.draft.trim()) return;
        activity.onAdd();
        setAddingActivity(false);
      }}>
        <input autoFocus value={activity.draft} onChange={(event) => activity.onDraftChange(event.target.value)} placeholder={copy.addActivity} aria-label={copy.addActivity} />
        <button type="submit" disabled={!activity.draft.trim()}>{copy.add}</button>
        <button type="button" className={styles.cancelDayTool} onClick={() => { activity.onDraftChange(""); setAddingActivity(false); }}>{copy.cancel}</button>
      </form> : null}
    </section>
  );
}
