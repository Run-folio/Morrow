export type TripLifecycleState =
  | "unavailable"
  | "invalid"
  | "upcoming"
  | "starts-today"
  | "started"
  | "in-progress"
  | "ends-today"
  | "ended";

export type TripLifecycle = {
  state: TripLifecycleState;
  start: Date | null;
  end: Date | null;
  today: Date | null;
  daysUntilStart: number | null;
};

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const millisecondsPerDay = 86_400_000;

/** Parse an exact ISO calendar date without UTC timezone drift or rollover. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = isoDatePattern.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(2000, 0, 1, 12, 0, 0, 0);
  parsed.setFullYear(year, month - 1, day);

  return parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day
    ? parsed
    : null;
}

/** Return a local calendar date key. Invalid Date values produce an empty key. */
export function isoDateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarDay(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / millisecondsPerDay;
}

/** Derive calendar lifecycle from both trip boundaries. An absent end stays generically started. */
export function tripLifecycle(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  now = new Date(),
): TripLifecycle {
  const startProvided = Boolean(startDate);
  const endProvided = Boolean(endDate);
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const today = parseIsoDate(isoDateKey(now));

  if (!today || (startProvided && !start) || (endProvided && !end)) {
    return { state: "invalid", start, end, today, daysUntilStart: null };
  }
  if (!start) return { state: "unavailable", start, end, today, daysUntilStart: null };

  const startDay = calendarDay(start);
  const todayDay = calendarDay(today);
  const endDay = end ? calendarDay(end) : null;
  const daysUntilStart = startDay - todayDay;

  if (endDay !== null && endDay < startDay) {
    return { state: "invalid", start, end, today, daysUntilStart };
  }
  if (todayDay < startDay) return { state: "upcoming", start, end, today, daysUntilStart };
  if (todayDay === startDay) return { state: "starts-today", start, end, today, daysUntilStart };
  if (endDay === null) return { state: "started", start, end, today, daysUntilStart };
  if (todayDay < endDay) return { state: "in-progress", start, end, today, daysUntilStart };
  if (todayDay === endDay) return { state: "ends-today", start, end, today, daysUntilStart };
  return { state: "ended", start, end, today, daysUntilStart };
}

export function formatIsoDate(
  value: string | null | undefined,
  locale: string | string[] = "en",
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string | null {
  const parsed = parseIsoDate(value);
  return parsed ? new Intl.DateTimeFormat(locale, options).format(parsed) : null;
}
