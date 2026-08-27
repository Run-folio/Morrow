export type LocalDateParts = {
  day: number;
  month: number;
  year: number;
};

const ISO_LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function localDateParts(value: string): LocalDateParts | null {
  const match = ISO_LOCAL_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { day, month, year };
}

export function localDateFromIso(value: string): Date | null {
  const parts = localDateParts(value);
  return parts ? new Date(parts.year, parts.month - 1, parts.day) : null;
}

export function isoFromLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayLocalIso(now = new Date()): string {
  return isoFromLocalDate(now);
}

export function addLocalDays(value: string, amount: number): string {
  const date = localDateFromIso(value);
  if (!date) return value;
  date.setDate(date.getDate() + amount);
  return isoFromLocalDate(date);
}

export function addLocalMonths(value: string, amount: number): string {
  const date = localDateFromIso(value);
  if (!date) return value;
  date.setDate(1);
  date.setMonth(date.getMonth() + amount);
  return isoFromLocalDate(date);
}

export function startOfLocalMonth(value: string): string {
  const date = localDateFromIso(value);
  if (!date) return value;
  date.setDate(1);
  return isoFromLocalDate(date);
}

export function formatLocalDate(value: string, locale = "en", options?: Intl.DateTimeFormatOptions): string {
  const date = localDateFromIso(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(locale, options ?? { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function parseTypedLocalDate(value: string): string | null {
  const trimmed = value.trim();
  return localDateParts(trimmed) ? trimmed : null;
}

export function localMonthDays(value: string): Array<string | null> {
  const date = localDateFromIso(startOfLocalMonth(value));
  if (!date) return [];
  const offset = date.getDay();
  const total = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, index) => {
      const day = new Date(date.getFullYear(), date.getMonth(), index + 1);
      return isoFromLocalDate(day);
    }),
  ];
}
