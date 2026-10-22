import type { HomepageInputSnapshot } from "./home-trip-handoff.ts";
import { parseTypedLocalDate, todayLocalIso } from "./local-date.ts";

export type SearchDateDraft = Partial<Record<"start" | "end", string>>;
export type SearchDateIssue = "invalid" | "past" | "reversed" | "unapplied";

/** Search is a new planning action. Existing trip documents keep their dates. */
export function homepageSearchDateIssue(snapshot: HomepageInputSnapshot, typedDraft: SearchDateDraft = {}, now = new Date()): SearchDateIssue | null {
  const range = snapshot.dates.state === "selected" ? snapshot.dates.value
    : { start: "", end: "" };
  const pending = Object.entries(typedDraft).filter(([, raw]) => raw.trim());
  const effective = { ...range, ...Object.fromEntries(pending.map(([boundary, raw]) => [boundary, raw.trim()])) };
  if ([effective.start, effective.end].some(value => value && !parseTypedLocalDate(value))) return "invalid";
  const today = todayLocalIso(now);
  if ([effective.start, effective.end].some(value => value && value < today)) return "past";
  if (effective.start && effective.end && effective.end < effective.start) return "reversed";
  // Unaccepted typed text must not silently fall back to the last selected date.
  return pending.length ? "unapplied" : null;
}

export function searchDateIssueMessage(issue: SearchDateIssue, language: "en" | "es") {
  const messages = {
    en: {
      invalid: "Enter a valid date in YYYY-MM-DD format.",
      past: "Choose travel dates that are today or later.",
      reversed: "Choose an end date on or after the start date.",
      unapplied: "Press Enter to apply the typed date before searching.",
    },
    es: {
      invalid: "Introduce una fecha válida con el formato AAAA-MM-DD.",
      past: "Elige fechas de viaje a partir de hoy.",
      reversed: "Elige una fecha de fin igual o posterior a la de inicio.",
      unapplied: "Pulsa Intro para aplicar la fecha escrita antes de buscar.",
    },
  };
  return messages[language][issue];
}
