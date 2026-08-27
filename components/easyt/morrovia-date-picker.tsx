"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  addLocalDays,
  addLocalMonths,
  formatLocalDate,
  localDateFromIso,
  localMonthDays,
  parseTypedLocalDate,
  startOfLocalMonth,
  todayLocalIso,
} from "@/lib/easyt/local-date";
import styles from "./morrovia-date-picker.module.css";

type DateBoundary = "start" | "end";
type PickerSize = "compact" | "default";

type SharedDatePickerProps = {
  className?: string;
  defaultOpen?: boolean;
  disabled?: boolean;
  locale?: "en" | "es";
  max?: string;
  min?: string;
  name?: string;
  size?: PickerSize;
};

type SingleDatePickerProps = SharedDatePickerProps & {
  ariaLabel?: string;
  label: string;
  mode?: "single";
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
};

type RangeDatePickerProps = SharedDatePickerProps & {
  endLabel: string;
  endName?: string;
  endValue: string;
  mode: "range";
  onChange: (range: { end: string; start: string }) => void;
  placeholder?: string;
  startLabel: string;
  startName?: string;
  startValue: string;
};

export type MorroviaDatePickerProps = SingleDatePickerProps | RangeDatePickerProps;

const copy = {
  en: {
    chooseDate: "Choose date",
    close: "Close calendar",
    dateFormat: "Date (YYYY-MM-DD)",
    nextMonth: "Next month",
    previousMonth: "Previous month",
    rangeHelp: "Choose the start date, then the end date.",
    selected: "Selected",
    today: "Today",
    typeIt: "Or type it",
  },
  es: {
    chooseDate: "Elegir fecha",
    close: "Cerrar calendario",
    dateFormat: "Fecha (AAAA-MM-DD)",
    nextMonth: "Mes siguiente",
    previousMonth: "Mes anterior",
    rangeHelp: "Elige la fecha de salida y después la fecha de regreso.",
    selected: "Seleccionada",
    today: "Hoy",
    typeIt: "O escríbela",
  },
} as const;

function isWithin(value: string, min?: string, max?: string) {
  return (!min || value >= min) && (!max || value <= max);
}

function CalendarPanel({
  activeBoundary,
  endValue,
  locale,
  max,
  min,
  month,
  onMonthChange,
  onPick,
  startValue,
}: {
  activeBoundary: DateBoundary;
  endValue: string;
  locale: "en" | "es";
  max?: string;
  min?: string;
  month: string;
  onMonthChange: (value: string) => void;
  onPick: (value: string) => void;
  startValue: string;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const today = todayLocalIso();
  const monthDate = localDateFromIso(month) ?? new Date();
  const days = localMonthDays(month);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2026, 7, 2 + index);
    return {
      long: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date),
      short: new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(date),
    };
  }), [locale]);
  const focusDate = (value: string) => {
    const targetMonth = startOfLocalMonth(value);
    if (targetMonth !== month) onMonthChange(targetMonth);
    window.requestAnimationFrame(() => {
      const button = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>("button[data-date]") ?? [])]
        .find((item) => item.dataset.date === value && !item.disabled);
      button?.focus({ preventScroll: true });
    });
  };
  const findEnabled = (origin: string, amount: number) => {
    let candidate = addLocalDays(origin, amount);
    for (let index = 0; index < 370; index += 1) {
      if (isWithin(candidate, min, max)) return candidate;
      candidate = addLocalDays(candidate, amount > 0 ? 1 : -1);
    }
    return origin;
  };
  const onDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, value: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPick(value);
      return;
    }
    let next: string | null = null;
    if (event.key === "ArrowLeft") next = findEnabled(value, -1);
    if (event.key === "ArrowRight") next = findEnabled(value, 1);
    if (event.key === "ArrowUp") next = findEnabled(value, -7);
    if (event.key === "ArrowDown") next = findEnabled(value, 7);
    if (event.key === "Home") next = findEnabled(value, -localDateFromIso(value)!.getDay());
    if (event.key === "End") next = findEnabled(value, 6 - localDateFromIso(value)!.getDay());
    if (event.key === "PageUp") next = addLocalMonths(value, -1);
    if (event.key === "PageDown") next = addLocalMonths(value, 1);
    if (!next) return;
    event.preventDefault();
    focusDate(next);
  };

  return <div className={styles.calendar}>
    <div className={styles.calendarHead}>
      <button type="button" onClick={() => onMonthChange(addLocalMonths(month, -1))} aria-label={copy[locale].previousMonth}><ChevronLeft aria-hidden="true" /></button>
      <strong aria-live="polite">{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(monthDate)}</strong>
      <button type="button" onClick={() => onMonthChange(addLocalMonths(month, 1))} aria-label={copy[locale].nextMonth}><ChevronRight aria-hidden="true" /></button>
    </div>
    <div className={styles.calendarWeekdays} aria-hidden="true">
      {weekdays.map((day) => <span key={day.long} title={day.long}>{day.short}</span>)}
    </div>
    <div className={styles.calendarGrid} role="grid" aria-label={new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(monthDate)} ref={gridRef}>
      {days.map((day, index) => day ? (() => {
        const disabled = !isWithin(day, min, max);
        const selected = day === startValue || day === endValue;
        const inRange = Boolean(startValue && endValue && day > startValue && day < endValue);
        const focusValue = activeBoundary === "end" ? endValue || startValue : startValue;
        return <button
          type="button"
          role="gridcell"
          key={day}
          data-date={day}
          disabled={disabled}
          tabIndex={day === focusValue || (!focusValue && day === today) ? 0 : -1}
          aria-current={day === today ? "date" : undefined}
          aria-label={`${formatLocalDate(day, locale, { dateStyle: "full" })}${selected ? `, ${copy[locale].selected}` : ""}`}
          aria-selected={selected || inRange}
          className={`${selected ? styles.calendarDaySelected : ""} ${inRange ? styles.calendarDayInRange : ""} ${day === startValue ? styles.calendarRangeStart : ""} ${day === endValue ? styles.calendarRangeEnd : ""}`}
          onClick={() => onPick(day)}
          onKeyDown={(event) => onDayKeyDown(event, day)}
        >{localDateFromIso(day)!.getDate()}</button>;
      })() : <span key={`blank-${index}`} aria-hidden="true" />)}
    </div>
  </div>;
}

export function MorroviaDatePicker(props: MorroviaDatePickerProps) {
  const locale = props.locale ?? "en";
  const isRange = props.mode === "range";
  const currentStart = isRange ? props.startValue : props.value;
  const currentEnd = isRange ? props.endValue : "";
  const [open, setOpen] = useState(Boolean(props.defaultOpen));
  const [portalReady, setPortalReady] = useState(false);
  const [activeBoundary, setActiveBoundary] = useState<DateBoundary>("start");
  const [month, setMonth] = useState(() => startOfLocalMonth(currentStart || todayLocalIso()));
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; maxHeight?: number; top: number } | null>(null);
  const [typedDate, setTypedDate] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const startTriggerRef = useRef<HTMLButtonElement>(null);
  const endTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const helpId = useId();

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => (activeBoundary === "end" ? endTriggerRef.current : startTriggerRef.current)?.focus({ preventScroll: true }));
  };
  const openFor = (boundary: DateBoundary) => {
    if (props.disabled) return;
    const nextValue = boundary === "end" ? currentEnd || currentStart : currentStart;
    setActiveBoundary(boundary);
    setMonth(startOfLocalMonth(nextValue || todayLocalIso()));
    setPopoverPosition(null);
    setTypedDate("");
    setOpen(true);
  };

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) close(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  });

  useEffect(() => {
    if (!open) return;
    const positionPopover = () => {
      if (window.matchMedia("(max-width: 520px)").matches) {
        setPopoverPosition(null);
        return;
      }
      const root = rootRef.current?.getBoundingClientRect();
      const popover = popoverRef.current?.getBoundingClientRect();
      if (!root || !popover) return;
      const gutter = 16;
      const below = root.bottom + 8;
      const above = root.top - popover.height - 8;
      const spaceBelow = window.innerHeight - below - gutter;
      const spaceAbove = root.top - 8 - gutter;
      const fitsBelow = popover.height <= spaceBelow;
      const fitsAbove = popover.height <= spaceAbove;
      const useBelow = fitsBelow || (!fitsAbove && spaceBelow >= spaceAbove);
      const top = useBelow ? below : fitsAbove ? above : gutter;
      const maxHeight = fitsBelow || fitsAbove ? undefined : Math.max(280, useBelow ? spaceBelow : spaceAbove);
      const left = Math.max(gutter, Math.min(root.left, window.innerWidth - popover.width - gutter));
      setPopoverPosition({ left, maxHeight, top });
    };
    window.requestAnimationFrame(positionPopover);
    window.addEventListener("resize", positionPopover);
    window.addEventListener("scroll", positionPopover, true);
    return () => {
      window.removeEventListener("resize", positionPopover);
      window.removeEventListener("scroll", positionPopover, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      const preferred = activeBoundary === "end" ? currentEnd || currentStart : currentStart;
      const buttons = [...(popoverRef.current?.querySelectorAll<HTMLButtonElement>("button[data-date]") ?? [])];
      (buttons.find((button) => button.dataset.date === preferred && !button.disabled)
        ?? buttons.find((button) => button.dataset.date === todayLocalIso() && !button.disabled)
        ?? buttons.find((button) => !button.disabled))?.focus({ preventScroll: true });
    });
  }, [activeBoundary, currentEnd, currentStart, month, open]);

  const pick = (value: string) => {
    if (!isWithin(value, props.min, props.max)) return;
    if (!isRange) {
      props.onChange(value);
      close(true);
      return;
    }
    if (activeBoundary === "start") {
      const nextEnd = props.endValue && props.endValue >= value ? props.endValue : value;
      props.onChange({ start: value, end: nextEnd });
      setActiveBoundary("end");
      setMonth(startOfLocalMonth(nextEnd));
      setTypedDate("");
      return;
    }
    if (value < props.startValue) return;
    props.onChange({ start: props.startValue, end: value });
    close(true);
  };
  const submitTypedDate = () => {
    const parsed = parseTypedLocalDate(typedDate);
    if (parsed) pick(parsed);
  };
  const trapDialogFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = [...(popoverRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") ?? [])];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };
  const calendarMin = isRange && activeBoundary === "end"
    ? [props.min, props.startValue].filter(Boolean).sort().at(-1)
    : props.min;
  const panelLabel = isRange
    ? `${activeBoundary === "start" ? props.startLabel : props.endLabel}: ${copy[locale].chooseDate}`
    : `${props.label}: ${copy[locale].chooseDate}`;
  const placeholder = props.placeholder ?? copy[locale].chooseDate;
  const rootClass = [styles.root, props.size === "compact" ? styles.compact : "", props.className ?? ""].filter(Boolean).join(" ");

  const trigger = (boundary: DateBoundary, label: string, value: string, triggerRef: typeof startTriggerRef) => <button
    type="button"
    className={`${styles.trigger} ${open && activeBoundary === boundary ? styles.triggerOpen : ""}`}
    ref={triggerRef}
    aria-expanded={open && activeBoundary === boundary}
    aria-haspopup="dialog"
    aria-controls={open ? dialogId : undefined}
    disabled={props.disabled}
    onClick={() => open && activeBoundary === boundary ? close(false) : openFor(boundary)}
  >
    <span>{label}</span>
    <b><CalendarDays aria-hidden="true" /><strong>{formatLocalDate(value, locale) || placeholder}</strong><ChevronDown aria-hidden="true" /></b>
  </button>;

  const calendarOverlay = open ? <>
    <button type="button" className={styles.mobileBackdrop} tabIndex={-1} aria-label={copy[locale].close} onClick={() => close(true)} />
    <div className={`${styles.popover} ${popoverPosition ? styles.popoverPositioned : ""}`} style={popoverPosition ?? undefined} ref={popoverRef} id={dialogId} role="dialog" aria-modal="true" aria-label={panelLabel} aria-describedby={isRange ? helpId : undefined} onKeyDown={trapDialogFocus}>
      <div className={styles.popoverTitle}>
        <div><strong>{panelLabel}</strong>{isRange ? <span id={helpId}>{copy[locale].rangeHelp}</span> : null}</div>
        <button type="button" aria-label={copy[locale].close} onClick={() => close(true)}><X aria-hidden="true" /></button>
      </div>
      <CalendarPanel
        activeBoundary={activeBoundary}
        startValue={currentStart}
        endValue={currentEnd}
        locale={locale}
        month={month}
        min={calendarMin}
        max={props.max}
        onMonthChange={(value) => setMonth(startOfLocalMonth(value))}
        onPick={pick}
      />
      <div className={styles.calendarFooter}>
        <button type="button" onClick={() => pick(todayLocalIso())} disabled={!isWithin(todayLocalIso(), calendarMin, props.max)}>{copy[locale].today}</button>
        <label><span>{copy[locale].typeIt}</span><input value={typedDate} inputMode="numeric" placeholder={locale === "es" ? "AAAA-MM-DD" : "YYYY-MM-DD"} aria-label={copy[locale].dateFormat} onChange={(event) => setTypedDate(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitTypedDate(); } }} /></label>
      </div>
    </div>
  </> : null;

  return <div className={rootClass} ref={rootRef}>
    <div className={isRange ? styles.rangeFields : styles.singleField}>
      {isRange ? <>
        {trigger("start", props.startLabel, props.startValue, startTriggerRef)}
        {trigger("end", props.endLabel, props.endValue, endTriggerRef)}
        {props.startName ? <input type="hidden" name={props.startName} value={props.startValue} /> : null}
        {props.endName ? <input type="hidden" name={props.endName} value={props.endValue} /> : null}
      </> : <>
        {trigger("start", props.label, props.value, startTriggerRef)}
        {props.name ? <input type="hidden" name={props.name} value={props.value} /> : null}
      </>}
    </div>
    {portalReady ? createPortal(calendarOverlay, document.body) : calendarOverlay}
  </div>;
}
