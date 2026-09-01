import type { SpreadsheetImportIssue } from "@/lib/easyt/spreadsheet-import";

export type SkippedImportIssueGroup = {
  key: string;
  rowNumber?: number;
  repeatedBookingRow: boolean;
  title: string;
  detail: string;
  issues: SpreadsheetImportIssue[];
};

const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

export function groupSkippedImportIssues(issues: SpreadsheetImportIssue[]): SkippedImportIssueGroup[] {
  const groups = new Map<string, SpreadsheetImportIssue[]>();
  for (const issue of issues.filter((item) => item.status === "not-imported")) {
    const key = issue.rowNumber === undefined ? `issue:${issue.id}` : `row:${issue.rowNumber}`;
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }

  return [...groups.entries()].map(([key, groupedIssues]) => {
    const rowNumber = groupedIssues.find((issue) => issue.rowNumber !== undefined)?.rowNumber;
    const repeatedBookingRow = groupedIssues.some((issue) => /duplicate-reference|duplicate booking|repeated booking|duplicate-row|identical duplicate row|repeated row/i.test(`${issue.id} ${issue.title} ${issue.detail}`));
    if (repeatedBookingRow) return {
      key,
      rowNumber,
      repeatedBookingRow,
      title: "Repeated booking row ignored",
      detail: "This source row repeats booking information already included, so its related booking fields were ignored with it.",
      issues: groupedIssues,
    };

    const reasons = [...new Set(groupedIssues.map((issue) => `${issue.title}: ${issue.detail}`))];
    return {
      key,
      rowNumber,
      repeatedBookingRow,
      title: groupedIssues.length === 1 ? groupedIssues[0].title : `${plural(groupedIssues.length, "entry", "entries")} ignored from this row`,
      detail: reasons.join(" "),
      issues: groupedIssues,
    };
  });
}

export function skippedImportSummary(groups: SkippedImportIssueGroup[]) {
  const repeatedRows = groups.filter((group) => group.repeatedBookingRow).length;
  const otherRows = groups.length - repeatedRows;
  const detail = repeatedRows && otherRows
    ? `${plural(repeatedRows, "repeated booking row")} and ${plural(otherRows, "duplicate/incomplete entry", "duplicate/incomplete entries")} were ignored.`
    : repeatedRows
      ? `${plural(repeatedRows, "repeated booking row")} ${repeatedRows === 1 ? "was" : "were"} ignored.`
      : otherRows
        ? `${plural(otherRows, "duplicate/incomplete entry", "duplicate/incomplete entries")} ${otherRows === 1 ? "was" : "were"} ignored.`
        : "No source rows were skipped.";
  return { title: plural(groups.length, "row") + " skipped", detail };
}

type DateParts = { day: number; month: number; year: number };

function isoDateParts(value: string | null | undefined): DateParts | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

const monthName = (month: number) => new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" })
  .format(new Date(Date.UTC(2027, month - 1, 1)));

export function formatImportDate(value: string | null | undefined) {
  const parts = isoDateParts(value);
  return parts ? `${parts.day} ${monthName(parts.month)} ${parts.year}` : value ?? "Date needed";
}

export function formatImportDateRange(start: string | null | undefined, end: string | null | undefined) {
  const from = isoDateParts(start);
  const to = isoDateParts(end);
  if (!from || !to) return `${formatImportDate(start)} – ${formatImportDate(end)}`;
  if (from.year === to.year && from.month === to.month) return `${from.day}–${to.day} ${monthName(from.month)} ${from.year}`;
  if (from.year === to.year) return `${from.day} ${monthName(from.month)}–${to.day} ${monthName(to.month)} ${from.year}`;
  return `${from.day} ${monthName(from.month)} ${from.year}–${to.day} ${monthName(to.month)} ${to.year}`;
}
