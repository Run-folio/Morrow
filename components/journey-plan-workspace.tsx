"use client";

import { ArrowDown, ArrowUp, ArrowUpRight, CarFront, CircleHelp, GripVertical, Plane, Plus, Ship, StickyNote, TrainFront, Trash2, Utensils } from "lucide-react";
import { useState, type DragEvent } from "react";
import type { JourneyCalendarDay, JourneyRestaurant, JourneyStop, RestaurantMeal } from "@/lib/journey";
import type { PlanItem } from "@/lib/easyt/trip";
import styles from "@/app/journey/journey.module.css";

export type PlanWorkspaceCopy = {
  travelConnection: string;
  localTransfer: string;
  editingHint: string;
  scheduleHealth: string;
  needsCheck: string;
  comfortable: string;
  dayClear: string;
  moveDay: string;
  earlier: string;
  later: string;
  editActivity: string;
  yours: string;
  addActivity: string;
  add: string;
  notes: string;
  dayOnly: string;
  editNote: string;
  save: string;
  cancel: string;
  addNote: string;
  addNoteButton: string;
  meal: string;
  savedRestaurant: string;
  next: string;
};

type ActivityLocation = { dayNumber: number; index: number };
type NoteLocation = { dayNumber: number; index: number };

/**
 * Render-only contract for the day-planning workspace. The Journey page owns all
 * drafts, drag state, and trip mutations; this component only calls the supplied
 * callbacks in response to user interaction.
 */
export interface PlanWorkspaceProps {
  context: {
    selectedDay: JourneyCalendarDay;
    selectedStop: JourneyStop;
    selectedDayIndex: number;
    totalDays: number;
    planItem?: PlanItem;
    transfer?: JourneyCalendarDay["travel"];
    savedRestaurant?: { restaurant: JourneyRestaurant; meal?: RestaurantMeal };
  };
  schedule: {
    signals: string[];
    warning: string;
  };
  activity: {
    items: string[];
    customItems: readonly string[];
    draft: string;
    dragged: ActivityLocation | null;
    onDraftChange: (value: string) => void;
    onAdd: () => void;
    onRename: (location: ActivityLocation, value: string) => void;
    onRemove: (location: ActivityLocation, title: string) => void;
    onMove: (from: ActivityLocation, to: ActivityLocation) => void;
    onDragStart: (location: ActivityLocation) => void;
    onDragOver: (event: DragEvent<HTMLLIElement>) => void;
    onDrop: (event: DragEvent<HTMLLIElement>, target: ActivityLocation) => void;
    onDragEnd: () => void;
  };
  notes: {
    items: string[];
    draft: string;
    editing: NoteLocation | null;
    editingDraft: string;
    onDraftChange: (value: string) => void;
    onAdd: () => void;
    onBeginEdit: (location: NoteLocation, note: string) => void;
    onEditingDraftChange: (value: string) => void;
    onSaveEdit: () => void;
    onCancelEdit: () => void;
    onRemove: (location: NoteLocation, note: string) => void;
  };
  navigation: {
    previousDay?: Pick<JourneyCalendarDay, "date" | "city">;
    nextDay?: Pick<JourneyCalendarDay, "date" | "city">;
    onMoveDay: (direction: "earlier" | "later") => void;
    onPreviousDay: () => void;
    onNextDay: () => void;
  };
  copy: PlanWorkspaceCopy;
}

export function PlanWorkspace({ context, schedule, activity, notes, navigation, copy }: PlanWorkspaceProps) {
  const { selectedDay, selectedStop, selectedDayIndex, totalDays, planItem, transfer, savedRestaurant } = context;
  const TransferIcon = transfer?.mode === "flight" ? Plane : transfer?.mode === "rail" ? TrainFront : transfer?.mode === "road" ? CarFront : transfer?.mode === "ferry" ? Ship : CircleHelp;
  const [openTool, setOpenTool] = useState<"activity" | "notes" | null>(null);

  const closeTool = () => setOpenTool(null);

  return (
    <section className={styles.shapeDayPlan} aria-label="Selected day plan">
      <p className={styles.shapeDayContext}>{selectedDay.date} · {selectedStop.city}</p>
      {transfer ? <div className={styles.dayTravel}><TransferIcon /><div><small>{transfer.mode === "flight" ? copy.travelConnection : copy.localTransfer}</small><strong>{transfer.from ? `${transfer.from} → ${selectedDay.city}` : transfer.detail}</strong><span>{transfer.duration}</span>{transfer.from && transfer.detail ? <details><summary>Transfer details</summary><p>{transfer.detail}</p></details> : null}</div></div> : null}
      {planItem ? <>
        {schedule.warning ? <p className={styles.plannerWarning}>{schedule.warning}</p> : null}
        {schedule.signals.length ? <section className={styles.scheduleHealth} aria-label={copy.scheduleHealth}>
          <div><span>{copy.scheduleHealth}</span><strong>{copy.needsCheck}</strong></div>
          <p>{schedule.signals.join(" ")}</p>
        </section> : null}
        <div className={styles.dayUtilities} aria-label="Day utilities">
          <button type="button" aria-pressed={openTool === "activity"} aria-label={copy.addActivity} title={copy.addActivity} onClick={() => setOpenTool((tool) => tool === "activity" ? null : "activity")}><Plus /> <span>{copy.addActivity}</span></button>
          <button type="button" aria-pressed={openTool === "notes"} aria-label="Day notes" title="Day notes" onClick={() => setOpenTool((tool) => tool === "notes" ? null : "notes")}><StickyNote />{notes.items.length ? <b>{notes.items.length}</b> : null}</button>
        </div>
        <div className={styles.mobileDayMove} aria-label={copy.moveDay}>
          <span>{copy.moveDay}</span>
          <button type="button" disabled={selectedDayIndex === 0} onClick={() => navigation.onMoveDay("earlier")}><ArrowUp /> {copy.earlier}</button>
          <button type="button" disabled={selectedDayIndex >= totalDays - 1} onClick={() => navigation.onMoveDay("later")}><ArrowDown /> {copy.later}</button>
        </div>
        <ol className={styles.editableActivities}>
          {activity.items.map((item, index) => {
            const location = { dayNumber: planItem.dayNumber, index };
            const isCustom = activity.customItems.includes(item);
            return <li key={`${item}-${index}`} draggable onDragStart={() => activity.onDragStart(location)} onDragOver={activity.onDragOver} onDrop={(event) => activity.onDrop(event, location)} onDragEnd={activity.onDragEnd}>
              <b>{String(index + 1).padStart(2, "0")}</b><GripVertical className={styles.activityGrip} />
              {isCustom ? <input className={styles.customActivityInput} value={item} onChange={(event) => activity.onRename(location, event.target.value)} aria-label={copy.editActivity} /> : <span>{item}</span>}
              {isCustom ? <small className={styles.yourActivity}>{copy.yours}</small> : null}
              <span className={styles.mobileActivityMove}><button type="button" disabled={index === 0} onClick={() => activity.onMove(location, { dayNumber: planItem.dayNumber, index: index - 1 })} aria-label={`Move ${item} earlier`}><ArrowUp /></button><button type="button" disabled={index === activity.items.length - 1} onClick={() => activity.onMove(location, { dayNumber: planItem.dayNumber, index: index + 2 })} aria-label={`Move ${item} later`}><ArrowDown /></button></span>
              <button type="button" className={styles.removeActivity} onClick={() => activity.onRemove(location, item)} aria-label={`Remove ${item}`}><Trash2 /></button>
            </li>;
          })}
        </ol>
        {openTool === "activity" ? <form className={styles.addActivity} onSubmit={(event) => { event.preventDefault(); if (!activity.draft.trim()) return; activity.onAdd(); closeTool(); }}>
          <input autoFocus value={activity.draft} onChange={(event) => activity.onDraftChange(event.target.value)} placeholder={copy.addActivity} aria-label={copy.addActivity} />
          <button type="submit" disabled={!activity.draft.trim()}><Plus /> {copy.add}</button>
          <button type="button" className={styles.cancelDayTool} onClick={() => { activity.onDraftChange(""); closeTool(); }}>{copy.cancel}</button>
        </form> : null}
        {openTool === "notes" ? <section className={styles.notesToSelf} aria-label={copy.notes}>
          <div><StickyNote /><span><small>{copy.notes}</small><strong>{copy.dayOnly}</strong></span></div>
          {notes.items.map((note, index) => {
            const location = { dayNumber: planItem.dayNumber, index };
            return notes.editing?.dayNumber === location.dayNumber && notes.editing.index === index
              ? <form key={`${note}-${index}`} className={styles.editingNoteForm} onSubmit={(event) => { event.preventDefault(); notes.onSaveEdit(); }}><input value={notes.editingDraft} onChange={(event) => notes.onEditingDraftChange(event.target.value)} aria-label={copy.editNote} autoFocus /><button type="submit" disabled={!notes.editingDraft.trim()}>{copy.save}</button><button type="button" onClick={notes.onCancelEdit}>{copy.cancel}</button></form>
              : <p key={`${note}-${index}`}><button type="button" className={styles.editNoteButton} onClick={() => notes.onBeginEdit(location, note)}>{note}</button><button type="button" onClick={() => notes.onRemove(location, note)} aria-label={`Remove note ${note}`}><Trash2 /></button></p>;
          })}
          <form onSubmit={(event) => { event.preventDefault(); if (!notes.draft.trim()) return; notes.onAdd(); closeTool(); }}><input autoFocus value={notes.draft} onChange={(event) => notes.onDraftChange(event.target.value)} placeholder={copy.addNote} /><button type="submit" disabled={!notes.draft.trim()}>{copy.addNoteButton}</button><button type="button" className={styles.cancelDayTool} onClick={() => { notes.onDraftChange(""); closeTool(); }}>{copy.cancel}</button></form>
        </section> : null}
      </> : <ol>
        {selectedDay.items.map((item, index) => <li key={item}><b>{String(index + 1).padStart(2, "0")}</b><span>{item}</span></li>)}
        {savedRestaurant ? <li className={styles.savedRestaurant}>
          <b>{String(selectedDay.items.length + 1).padStart(2, "0")}</b>
          <a href={savedRestaurant.restaurant.mapsUrl} target="_blank" rel="noreferrer"><span className={styles.savedRestaurantIcon}><Utensils /></span><span className={styles.savedRestaurantCopy}><small>{savedRestaurant.meal ?? copy.meal} · {copy.savedRestaurant}</small><strong>{savedRestaurant.restaurant.name}</strong><em>{savedRestaurant.restaurant.area}</em></span><ArrowUpRight /></a>
        </li> : null}
      </ol>}
      {navigation.nextDay ? <button type="button" className={styles.nextDay} onClick={navigation.onNextDay}><small>{copy.next}</small><span>{navigation.nextDay.date}</span><strong>{navigation.nextDay.city} →</strong></button> : null}
    </section>
  );
}
