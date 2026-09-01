import { buildCanonicalTripLegs } from "./trip-legs.ts";
import {
  defaultTripIntent,
  tripFromBuilder,
  type EasyTTrip,
  type PlanItem,
  type TripBooking,
  type TripLeg,
} from "./trip.ts";

export const SPREADSHEET_IMPORT_LIMITS = {
  fileBytes: 5 * 1024 * 1024,
  rows: 1_000,
  columns: 60,
  cellCharacters: 5_000,
} as const;

export const SPREADSHEET_IMPORT_PARSER_VERSION = "spreadsheet-v1";

export type SpreadsheetCell = string | number | boolean | Date | null;

export type SpreadsheetTable = {
  name: string;
  headers: string[];
  rows: SpreadsheetCell[][];
  blankRowNumbers: number[];
};

export const spreadsheetImportFields = [
  "destination",
  "country",
  "arrivalDate",
  "departureDate",
  "nights",
  "accommodation",
  "transportMode",
  "transportFrom",
  "transportTo",
  "transportDate",
  "activity",
  "activityDate",
  "bookingReference",
  "notes",
  "origin",
] as const;

export type SpreadsheetImportField = (typeof spreadsheetImportFields)[number];

export const spreadsheetImportFieldLabels: Record<SpreadsheetImportField, string> = {
  destination: "Destination / stop",
  country: "Country",
  arrivalDate: "Arrival / start date",
  departureDate: "Departure / end date",
  nights: "Nights",
  accommodation: "Accommodation / hotel",
  transportMode: "Transport mode",
  transportFrom: "Transport from",
  transportTo: "Transport to",
  transportDate: "Transport date",
  activity: "Activity / experience",
  activityDate: "Activity date",
  bookingReference: "Booking / confirmation reference",
  notes: "Notes / comments",
  origin: "Trip origin",
};

export type SpreadsheetColumnMapping = {
  index: number;
  header: string;
  field: SpreadsheetImportField | null;
  state: "mapped" | "ambiguous" | "ignored";
  suggestions: SpreadsheetImportField[];
};

export type SpreadsheetImportIssue = {
  id: string;
  status: "needs-review" | "not-imported" | "info";
  title: string;
  detail: string;
  rowNumber?: number;
  columnIndex?: number;
};

export type ImportStopProposal = {
  id: string;
  sourceRows: number[];
  name: string;
  country: string;
  arrivalDate: string | null;
  departureDate: string | null;
  nights: number | null;
  notes: Array<{ date: string; text: string }>;
};

export type ImportBookingProposal = {
  id: string;
  sourceRow: number;
  type: "stay" | "transport";
  title: string;
  date: string;
  endDate: string | null;
  confirmation: string;
  location: string | null;
  notes: string[];
  transportDetails?: {
    mode: "flight" | "train" | "road" | "ferry" | null;
    sourceMode: string | null;
    from: string;
    to: string;
  };
};

export type ImportActivityProposal = {
  id: string;
  sourceRow: number;
  stopId: string;
  title: string;
  date: string;
  notes: string[];
};

export type ImportRowReview = {
  rowNumber: number;
  status: "detected" | "needs-review" | "not-imported";
  recognised: string[];
  detail: string;
};

export type SpreadsheetImportProposal = {
  sourceName: string;
  columns: SpreadsheetColumnMapping[];
  stops: ImportStopProposal[];
  bookings: ImportBookingProposal[];
  activities: ImportActivityProposal[];
  origin: string | null;
  issues: SpreadsheetImportIssue[];
  rows: ImportRowReview[];
  ignoredColumns: string[];
  startDate: string | null;
  endDate: string | null;
  totalNights: number;
  canConfirmStructure: boolean;
};

export type ResolvedImportPlace = {
  sourceStopId: string;
  canonicalPlaceId: string;
  name: string;
  country: string;
  countryCode?: string;
  region?: string;
  providerId?: string;
  coordinates: [number, number];
};

export type ResolvedImportOrigin = Omit<ResolvedImportPlace, "sourceStopId">;

const aliases: Record<SpreadsheetImportField, string[]> = {
  destination: ["destination", "destinations", "stop", "stops", "city", "cities", "place", "places", "location", "overnight stop"],
  country: ["country", "nation"],
  arrivalDate: ["arrival", "arrival date", "arrive", "arrive date", "start date", "check in", "check-in", "checkin"],
  departureDate: ["departure", "departure date", "depart", "depart date", "end date", "check out", "check-out", "checkout"],
  nights: ["night", "nights", "number of nights", "stay nights", "duration nights"],
  accommodation: ["accommodation", "hotel", "stay", "lodging", "property", "property name"],
  transportMode: ["transport", "transport mode", "mode", "travel mode", "flight", "train", "bus", "ferry"],
  transportFrom: ["origin", "from", "departing from", "transport from"],
  transportTo: ["to", "arriving at", "transport to", "destination to"],
  transportDate: ["transport date", "travel date", "flight date", "train date", "transfer date"],
  activity: ["activity", "activities", "attraction", "attractions", "experience", "experiences", "thing to do"],
  activityDate: ["activity date", "experience date", "attraction date"],
  bookingReference: ["booking", "booking reference", "booking ref", "confirmation", "confirmation reference", "confirmation number", "reference", "ref", "pnr"],
  notes: ["notes", "note", "comments", "comment", "details", "remarks"],
  origin: ["trip origin", "journey origin", "starting point", "home airport"],
};

const genericAmbiguousAliases: Record<string, SpreadsheetImportField[]> = {
  date: ["arrivalDate", "departureDate", "transportDate", "activityDate"],
  start: ["arrivalDate", "transportFrom", "origin"],
  end: ["departureDate", "transportTo"],
};

function normalise(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function cellText(value: SpreadsheetCell | undefined) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  return String(value).trim();
}

function isBlankRow(row: SpreadsheetCell[]) {
  return row.every((cell) => !cellText(cell));
}

function issueId(prefix: string, rowNumber?: number, columnIndex?: number) {
  return [prefix, rowNumber, columnIndex].filter((value) => value !== undefined).join("-");
}

export function spreadsheetColumnMappings(headers: string[]): SpreadsheetColumnMapping[] {
  const claimed = new Map<SpreadsheetImportField, number[]>();
  const mappings = headers.map((header, index): SpreadsheetColumnMapping => {
    const key = normalise(header);
    const ambiguous = genericAmbiguousAliases[key];
    if (ambiguous) return { index, header, field: null, state: "ambiguous", suggestions: ambiguous };
    const matches = spreadsheetImportFields.filter((field) => aliases[field].some((alias) => normalise(alias) === key));
    if (matches.length !== 1) return {
      index,
      header,
      field: null,
      state: matches.length ? "ambiguous" : "ignored",
      suggestions: matches,
    };
    const field = matches[0];
    claimed.set(field, [...(claimed.get(field) ?? []), index]);
    return { index, header, field, state: "mapped", suggestions: [field] };
  });
  for (const [field, indexes] of claimed) {
    if (indexes.length < 2) continue;
    for (const index of indexes) mappings[index] = { ...mappings[index], field: null, state: "ambiguous", suggestions: [field] };
  }
  return mappings;
}

function delimiterScore(line: string, delimiter: string) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (line[index] === delimiter && !quoted) count += 1;
  }
  return count;
}

export function parseDelimitedText(text: string, name = "Pasted table"): SpreadsheetTable {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = ["\t", ",", ";"].sort((left, right) => delimiterScore(firstLine, right) - delimiterScore(firstLine, left))[0];
  if (!delimiter || delimiterScore(firstLine, delimiter) < 1) throw new Error("Add a header row and at least two spreadsheet columns.");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index <= clean.length; index += 1) {
    const character = clean[index] ?? "\n";
    if (character === '"') {
      if (quoted && clean[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
      continue;
    }
    if (!quoted && character === delimiter) { row.push(cell); cell = ""; continue; }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && clean[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }
  if (quoted) throw new Error("The table contains an unclosed quoted value.");
  return tableFromRows(name, rows);
}

export function tableFromRows(name: string, sourceRows: SpreadsheetCell[][]): SpreadsheetTable {
  const headerIndex = sourceRows.findIndex((row) => !isBlankRow(row));
  if (headerIndex < 0) throw new Error("This sheet is blank.");
  const headerRow = sourceRows[headerIndex];
  const width = Math.max(headerRow.length, ...sourceRows.slice(headerIndex + 1).map((row) => row.length));
  if (width > SPREADSHEET_IMPORT_LIMITS.columns) throw new Error(`This sheet has more than ${SPREADSHEET_IMPORT_LIMITS.columns} columns.`);
  const headers = Array.from({ length: width }, (_, index) => cellText(headerRow[index]) || `Column ${index + 1}`);
  const rows: SpreadsheetCell[][] = [];
  const blankRowNumbers: number[] = [];
  for (let index = headerIndex + 1; index < sourceRows.length; index += 1) {
    const source = sourceRows[index] ?? [];
    if (isBlankRow(source)) { blankRowNumbers.push(index + 1); continue; }
    if (rows.length >= SPREADSHEET_IMPORT_LIMITS.rows) throw new Error(`This sheet has more than ${SPREADSHEET_IMPORT_LIMITS.rows} data rows.`);
    const normalisedRow = Array.from({ length: width }, (_, column) => source[column] ?? "");
    for (const value of normalisedRow) if (cellText(value).length > SPREADSHEET_IMPORT_LIMITS.cellCharacters) {
      throw new Error(`A cell exceeds the ${SPREADSHEET_IMPORT_LIMITS.cellCharacters.toLocaleString()} character limit.`);
    }
    rows.push(normalisedRow);
  }
  if (!rows.length) throw new Error("This sheet has headers but no trip rows.");
  return { name, headers, rows, blankRowNumbers };
}

type ParsedDate = { value: string | null; state: "valid" | "ambiguous" | "invalid" | "blank"; source: string };

function validIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
    : null;
}

const monthNumbers: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
  sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export function parseSpreadsheetDate(value: SpreadsheetCell | undefined): ParsedDate {
  if (value instanceof Date) return { value: Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10), state: Number.isNaN(value.getTime()) ? "invalid" : "valid", source: cellText(value) };
  if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 100_000) {
    const wholeDays = Math.floor(value);
    const date = new Date(Date.UTC(1899, 11, 30 + wholeDays));
    return { value: date.toISOString().slice(0, 10), state: "valid", source: String(value) };
  }
  const source = cellText(value);
  if (!source) return { value: null, state: "blank", source };
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(source);
  if (match) {
    const iso = validIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    return { value: iso, state: iso ? "valid" : "invalid", source };
  }
  match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(source);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);
    if (first <= 12 && second <= 12 && first !== second) return { value: null, state: "ambiguous", source };
    const day = first > 12 || first === second ? first : second;
    const month = first > 12 || first === second ? second : first;
    const iso = validIsoDate(year, month, day);
    return { value: iso, state: iso ? "valid" : "invalid", source };
  }
  match = /^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/.exec(source);
  if (match) {
    const iso = validIsoDate(Number(match[3]), monthNumbers[normalise(match[2])] ?? 0, Number(match[1]));
    return { value: iso, state: iso ? "valid" : "invalid", source };
  }
  match = /^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(source);
  if (match) {
    const iso = validIsoDate(Number(match[3]), monthNumbers[normalise(match[1])] ?? 0, Number(match[2]));
    return { value: iso, state: iso ? "valid" : "invalid", source };
  }
  return { value: null, state: "invalid", source };
}

function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mappedValue(row: SpreadsheetCell[], mappings: SpreadsheetColumnMapping[], field: SpreadsheetImportField) {
  const mapping = mappings.find((candidate) => candidate.state === "mapped" && candidate.field === field);
  return mapping ? row[mapping.index] : undefined;
}

function transportMode(value: string): ImportBookingProposal["transportDetails"] extends infer _T ? "flight" | "train" | "road" | "ferry" | null : never {
  const key = normalise(value);
  if (/\bflight|plane|air\b/.test(key)) return "flight";
  if (/\btrain|rail\b/.test(key)) return "train";
  if (/\bferry|boat|ship\b/.test(key)) return "ferry";
  if (/\bbus|coach|car|drive|road|taxi|transfer\b/.test(key)) return "road";
  return null;
}

function dateIssue(issues: SpreadsheetImportIssue[], parsed: ParsedDate, label: string, rowNumber: number) {
  if (parsed.state !== "ambiguous" && parsed.state !== "invalid") return;
  issues.push({
    id: issueId(`${normalise(label).replace(/ /g, "-")}-${parsed.state}`, rowNumber),
    status: "needs-review",
    title: parsed.state === "ambiguous" ? `Ambiguous ${label.toLocaleLowerCase()}` : `Invalid ${label.toLocaleLowerCase()}`,
    detail: parsed.state === "ambiguous"
      ? `“${parsed.source}” could use day/month or month/day order. Morrovia did not guess.`
      : `“${parsed.source}” was not recognised as a safe date.`,
    rowNumber,
  });
}

export function buildSpreadsheetImportProposal(
  table: SpreadsheetTable,
  suppliedMappings: SpreadsheetColumnMapping[] = spreadsheetColumnMappings(table.headers),
): SpreadsheetImportProposal {
  const mappings = suppliedMappings.map((mapping) => ({ ...mapping, suggestions: [...mapping.suggestions] }));
  const issues: SpreadsheetImportIssue[] = [];
  const rowReviews: ImportRowReview[] = [];
  const stops: ImportStopProposal[] = [];
  const bookings: ImportBookingProposal[] = [];
  const activities: ImportActivityProposal[] = [];
  const stopByKey = new Map<string, ImportStopProposal>();
  const seenRows = new Set<string>();
  const seenBookingReferences = new Set<string>();
  const seenActivities = new Set<string>();
  const originValues = new Set<string>();

  for (const mapping of mappings) if (mapping.state === "ambiguous") issues.push({
    id: issueId("column-ambiguous", undefined, mapping.index),
    status: "needs-review",
    title: `Map “${mapping.header}”`,
    detail: "This heading has more than one material meaning, so it was not assigned automatically.",
    columnIndex: mapping.index,
  });
  for (const rowNumber of table.blankRowNumbers) issues.push({
    id: issueId("blank-row", rowNumber), status: "not-imported", title: "Blank row not imported", detail: "Blank rows do not create trip records.", rowNumber,
  });

  table.rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const signature = row.map(cellText).map(normalise).join("\u241f");
    if (seenRows.has(signature)) {
      issues.push({ id: issueId("duplicate-row", rowNumber), status: "not-imported", title: "Duplicate row not imported", detail: "This row is identical to an earlier row.", rowNumber });
      rowReviews.push({ rowNumber, status: "not-imported", recognised: [], detail: "Identical duplicate row" });
      return;
    }
    seenRows.add(signature);

    const destination = cellText(mappedValue(row, mappings, "destination"));
    const country = cellText(mappedValue(row, mappings, "country"));
    const origin = cellText(mappedValue(row, mappings, "origin"));
    if (origin) originValues.add(origin);
    const arrival = parseSpreadsheetDate(mappedValue(row, mappings, "arrivalDate"));
    const departure = parseSpreadsheetDate(mappedValue(row, mappings, "departureDate"));
    const rawNights = cellText(mappedValue(row, mappings, "nights"));
    const parsedNights = rawNights && /^\d+$/.test(rawNights) ? Number(rawNights) : null;
    dateIssue(issues, arrival, "Arrival date", rowNumber);
    dateIssue(issues, departure, "Departure date", rowNumber);
    if (rawNights && parsedNights === null) issues.push({ id: issueId("invalid-nights", rowNumber), status: "needs-review", title: "Invalid nights", detail: `“${rawNights}” is not a whole number of nights.`, rowNumber });

    let arrivalDate = arrival.value;
    let departureDate = departure.value;
    let nights = parsedNights;
    if (arrivalDate && departureDate) {
      const derived = daysBetween(arrivalDate, departureDate);
      if (derived < 0) issues.push({ id: issueId("date-order", rowNumber), status: "needs-review", title: "Departure is before arrival", detail: "Correct the dates before confirming this trip.", rowNumber });
      else if (nights !== null && nights !== derived) issues.push({ id: issueId("nights-conflict", rowNumber), status: "needs-review", title: "Nights conflict with dates", detail: `The dates equal ${derived} nights, but the row says ${nights}. Morrovia kept the dates and surfaced the conflict.`, rowNumber });
      else nights = derived;
    } else if (arrivalDate && nights !== null) departureDate = addDays(arrivalDate, nights);
    else if (departureDate && nights !== null) arrivalDate = addDays(departureDate, -nights);

    let stop: ImportStopProposal | undefined;
    if (destination) {
      const stopKey = [normalise(destination), normalise(country), arrivalDate ?? "", departureDate ?? ""].join("|");
      stop = stopByKey.get(stopKey);
      if (!stop) {
        stop = { id: `import-stop-${stops.length + 1}`, sourceRows: [rowNumber], name: destination, country, arrivalDate, departureDate, nights, notes: [] };
        stopByKey.set(stopKey, stop);
        stops.push(stop);
      } else stop.sourceRows.push(rowNumber);
      if (!arrivalDate || !departureDate || nights === null) issues.push({
        id: issueId("incomplete-stop-dates", rowNumber), status: "needs-review", title: `Dates needed for ${destination}`,
        detail: "Each imported stop needs a reliable arrival, departure and nights value before confirmation.", rowNumber,
      });
    }

    const notes = cellText(mappedValue(row, mappings, "notes"));
    const reference = cellText(mappedValue(row, mappings, "bookingReference"));
    const accommodation = cellText(mappedValue(row, mappings, "accommodation"));
    const sourceMode = cellText(mappedValue(row, mappings, "transportMode"));
    const from = cellText(mappedValue(row, mappings, "transportFrom"));
    const to = cellText(mappedValue(row, mappings, "transportTo"));
    const transportDate = parseSpreadsheetDate(mappedValue(row, mappings, "transportDate"));
    const activity = cellText(mappedValue(row, mappings, "activity"));
    const activityDate = parseSpreadsheetDate(mappedValue(row, mappings, "activityDate"));
    dateIssue(issues, transportDate, "Transport date", rowNumber);
    dateIssue(issues, activityDate, "Activity date", rowNumber);

    const recognised = [destination && `Stop: ${destination}`, accommodation && `Stay: ${accommodation}`, (sourceMode || from || to) && "Transport", activity && `Activity: ${activity}`, notes && "Notes"].filter((value): value is string => Boolean(value));
    let rowNeedsReview = false;

    const duplicateReference = reference && seenBookingReferences.has(normalise(reference));
    if (duplicateReference) {
      issues.push({ id: issueId("duplicate-reference", rowNumber), status: "not-imported", title: "Duplicate booking reference not imported", detail: `Reference “${reference}” already appears in an earlier booking.`, rowNumber });
    }
    if (accommodation) {
      if (reference && stop && arrivalDate && departureDate && !duplicateReference) {
        const booking: ImportBookingProposal = {
          id: `import-stay-${bookings.length + 1}`, sourceRow: rowNumber, type: "stay", title: accommodation,
          date: arrivalDate, endDate: departureDate, confirmation: reference, location: stop.name, notes: notes ? [notes] : [],
        };
        bookings.push(booking);
        seenBookingReferences.add(normalise(reference));
      } else {
        rowNeedsReview = true;
        issues.push({ id: issueId("stay-incomplete", rowNumber), status: "not-imported", title: `${accommodation} not imported as booked`, detail: "A stay needs a confirmation reference, destination, arrival date and departure date. A hotel name alone is never marked booked.", rowNumber });
      }
    }

    if (sourceMode || from || to) {
      if (reference && from && to && transportDate.value && !duplicateReference) {
        bookings.push({
          id: `import-transport-${bookings.length + 1}`, sourceRow: rowNumber, type: "transport",
          title: sourceMode ? `${sourceMode}: ${from} to ${to}` : `${from} to ${to}`,
          date: transportDate.value, endDate: null, confirmation: reference, location: null, notes: notes ? [notes] : [],
          transportDetails: { mode: transportMode(sourceMode), sourceMode: sourceMode || null, from, to },
        });
        seenBookingReferences.add(normalise(reference));
      } else {
        rowNeedsReview = true;
        issues.push({ id: issueId("transport-incomplete", rowNumber), status: "not-imported", title: "Transport not imported as booked", detail: "Booked transport needs an explicit from, to, date and confirmation reference. Missing mode stays unknown.", rowNumber });
      }
    }

    if (activity) {
      const date = activityDate.value;
      const belongsToStop = Boolean(stop && date && stop.arrivalDate && stop.departureDate && date >= stop.arrivalDate && date <= stop.departureDate);
      const key = `${stop?.id ?? ""}|${date ?? ""}|${normalise(activity)}`;
      if (stop && date && belongsToStop && !seenActivities.has(key)) {
        activities.push({ id: `import-activity-${activities.length + 1}`, sourceRow: rowNumber, stopId: stop.id, title: activity, date, notes: notes ? [notes] : [] });
        seenActivities.add(key);
      } else if (seenActivities.has(key)) {
        issues.push({ id: issueId("duplicate-activity", rowNumber), status: "not-imported", title: "Duplicate activity not imported", detail: "The same activity already appears for this stop and date.", rowNumber });
      } else {
        rowNeedsReview = true;
        issues.push({ id: issueId("activity-unresolved", rowNumber), status: "not-imported", title: `${activity} not assigned`, detail: "An activity needs an explicit activity date and a destination whose stay includes that date. Morrovia did not invent the relationship.", rowNumber });
      }
    }

    if (notes && stop && (activityDate.value || transportDate.value || arrivalDate)) {
      const noteDate = activityDate.value ?? transportDate.value ?? arrivalDate!;
      if (!activity && !accommodation && !(sourceMode || from || to)) stop.notes.push({ date: noteDate, text: notes });
    } else if (notes && !activity && !accommodation && !(sourceMode || from || to)) {
      rowNeedsReview = true;
      issues.push({ id: issueId("unassigned-note", rowNumber), status: "not-imported", title: "Note has no reliable trip date", detail: "The note remains visible here but was not converted into a structured fact.", rowNumber });
    }

    if (!destination && !accommodation && !activity && !(sourceMode || from || to)) {
      rowNeedsReview = true;
      issues.push({ id: issueId("missing-destination", rowNumber), status: "not-imported", title: "Row has no destination", detail: "Map a destination column or leave this row out of the import.", rowNumber });
    }
    rowReviews.push({ rowNumber, status: rowNeedsReview ? "needs-review" : recognised.length ? "detected" : "not-imported", recognised, detail: rowNeedsReview ? "Some information was not safe to import" : recognised.length ? "Recognised information will be proposed" : "No supported trip information" });
  });

  if (originValues.size > 1) issues.push({ id: "origin-conflict", status: "needs-review", title: "More than one trip origin", detail: "Enter the intended starting point during review." });
  const origin = originValues.size === 1 ? [...originValues][0] : null;
  const dates = stops.flatMap((stop) => [stop.arrivalDate, stop.departureDate]).filter((value): value is string => Boolean(value));
  const startDate = dates.length ? [...dates].sort()[0] : null;
  const endDate = dates.length ? [...dates].sort().at(-1) ?? null : null;
  const totalNights = stops.reduce((total, stop) => total + (stop.nights ?? 0), 0);
  if (!stops.length) issues.push({ id: "no-stops", status: "needs-review", title: "No destinations detected", detail: "Map a destination column before continuing." });
  const blockingIssuePrefixes = ["column-ambiguous", "arrival-date-ambiguous", "arrival-date-invalid", "departure-date-ambiguous", "departure-date-invalid", "invalid-nights", "date-order", "nights-conflict", "incomplete-stop-dates", "no-stops"];
  const canConfirmStructure = stops.length > 0 && stops.every((stop) => Boolean(stop.arrivalDate && stop.departureDate && stop.nights !== null))
    && !issues.some((issue) => blockingIssuePrefixes.some((prefix) => issue.id.startsWith(prefix)));

  return {
    sourceName: table.name, columns: mappings, stops, bookings, activities, origin, issues, rows: rowReviews,
    ignoredColumns: mappings.filter((mapping) => mapping.state === "ignored").map((mapping) => mapping.header),
    startDate, endDate, totalNights, canConfirmStructure,
  };
}

function bookingFromProposal(proposal: ImportBookingProposal): TripBooking {
  return {
    id: proposal.id,
    type: proposal.type,
    title: proposal.title,
    date: proposal.date,
    endDate: proposal.endDate,
    confirmation: proposal.confirmation,
    url: null,
    location: proposal.location,
    notes: proposal.notes,
    ...(proposal.transportDetails ? { transportDetails: {
      mode: proposal.transportDetails.mode,
      from: proposal.transportDetails.from,
      to: proposal.transportDetails.to,
    } } : {}),
  };
}

function modeForLeg(mode: ImportBookingProposal["transportDetails"] extends infer _T ? "flight" | "train" | "road" | "ferry" | null : never): TripLeg["mode"] {
  return mode ?? "unknown";
}

export function canonicalTripFromSpreadsheetProposal(input: {
  id: string;
  proposal: SpreadsheetImportProposal;
  origin: ResolvedImportOrigin;
  places: ResolvedImportPlace[];
  createdAt?: string;
}): EasyTTrip {
  const { id, proposal, origin, places } = input;
  if (!proposal.canConfirmStructure || !proposal.startDate || !proposal.endDate) throw new Error("The import proposal still has structural conflicts.");
  const placeByStop = new Map(places.map((place) => [place.sourceStopId, place]));
  if (proposal.stops.some((stop) => !placeByStop.has(stop.id))) throw new Error("Every imported destination must be resolved before confirmation.");
  const nightAllocations = Object.fromEntries(proposal.stops.map((stop) => [stop.id, stop.nights ?? 0]));
  const intent = defaultTripIntent({ durationDays: Math.max(1, daysBetween(proposal.startDate, proposal.endDate) + 1), stopIds: proposal.stops.map((stop) => stop.id) });
  const base = tripFromBuilder({
    id,
    origin: origin.name,
    originCoordinates: origin.coordinates,
    originCanonicalPlaceId: origin.canonicalPlaceId,
    originCountry: origin.country,
    originProviderId: origin.providerId,
    stops: proposal.stops.map((stop) => {
      const place = placeByStop.get(stop.id)!;
      return { id: stop.id, name: place.name, country: place.country, canonicalPlaceId: place.canonicalPlaceId, countryCode: place.countryCode, region: place.region, providerId: place.providerId, coordinates: place.coordinates };
    }),
    startDate: proposal.startDate,
    endDate: proposal.endDate,
    picks: {},
    mustDo: "",
    pace: "slow",
    hotels: "some",
    budget: "mid",
    nightAllocations,
    manualNightStopIds: proposal.stops.map((stop) => stop.id),
    draft: [],
    createdAt: input.createdAt,
    status: "planned",
    intent,
    scheduleLocks: { stopIds: proposal.stops.map((stop) => stop.id), arrivalDates: Object.fromEntries(proposal.stops.map((stop) => [stop.id, stop.arrivalDate!])) },
    capturedIntent: {
      originalBrief: "Imported from a spreadsheet after traveller review.",
      parserVersion: SPREADSHEET_IMPORT_PARSER_VERSION,
      regions: [],
      routeHints: [],
      mentions: proposal.stops.map((stop, order) => {
        const place = placeByStop.get(stop.id)!;
        return { sourceText: stop.name, canonicalName: place.name, canonicalPlaceId: place.canonicalPlaceId, role: "stop" as const, order, status: "resolved" as const, country: place.country };
      }),
    },
  });
  const stops = base.stops.map((stop) => {
    const imported = proposal.stops.find((candidate) => candidate.id === stop.id)!;
    return { ...stop, arrivalDate: imported.arrivalDate, departureDate: imported.departureDate, nights: imported.nights };
  });
  const planItems: PlanItem[] = proposal.activities.map((activity) => {
    const place = placeByStop.get(activity.stopId)!;
    return {
      id: activity.id,
      stopId: activity.stopId,
      dayNumber: daysBetween(proposal.startDate!, activity.date) + 1,
      date: activity.date,
      type: "activity",
      title: activity.title,
      reason: "Imported from the traveller’s reviewed spreadsheet.",
      notes: activity.notes,
      startsAt: null,
      endsAt: null,
      bookingUrl: null,
      latitude: place.coordinates[1],
      longitude: place.coordinates[0],
    };
  });
  const dayNotes: Record<number, string[]> = {};
  for (const stop of proposal.stops) for (const note of stop.notes) {
    const day = daysBetween(proposal.startDate, note.date) + 1;
    dayNotes[day] = [...(dayNotes[day] ?? []), note.text];
  }
  let legs = buildCanonicalTripLegs({
    tripId: id,
    origin: { name: origin.name, country: origin.country, canonicalPlaceId: origin.canonicalPlaceId, providerId: origin.providerId, coordinates: origin.coordinates },
    stops,
  });
  for (const booking of proposal.bookings) {
    if (!booking.transportDetails) continue;
    const fromKey = normalise(booking.transportDetails.from);
    const toKey = normalise(booking.transportDetails.to);
    legs = legs.map((leg) => {
      const fromName = normalise(leg.fromEndpoint?.name ?? "");
      const toName = normalise(leg.toEndpoint?.name ?? "");
      if (fromName !== fromKey || toName !== toKey) return leg;
      const mode = modeForLeg(booking.transportDetails!.mode);
      return {
        ...leg,
        mode,
        provider: null,
        provenance: "unknown" as const,
        confidence: booking.transportDetails!.mode ? "high" as const : "unknown" as const,
        scheduleNeedsChecking: true,
        routeMetadata: { ...leg.routeMetadata, importedBookingId: booking.id, sourceMode: booking.transportDetails!.sourceMode },
      };
    });
  }
  return {
    ...base,
    stops,
    legs,
    planItems,
    brief: {
      ...base.brief,
      bookings: proposal.bookings.map(bookingFromProposal),
      ...(Object.keys(dayNotes).length ? { dayNotes } : {}),
    },
  };
}

export function spreadsheetImportSummary(proposal: SpreadsheetImportProposal) {
  return {
    stops: proposal.stops.length,
    nights: proposal.totalNights,
    stays: proposal.bookings.filter((booking) => booking.type === "stay").length,
    transportBookings: proposal.bookings.filter((booking) => booking.type === "transport").length,
    activities: proposal.activities.length,
    needsReview: proposal.issues.filter((issue) => issue.status === "needs-review").length,
    notImported: proposal.issues.filter((issue) => issue.status === "not-imported").length,
  };
}
