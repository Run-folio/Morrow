import { createHash } from "node:crypto";

export const BOOKING_EMAIL_BODY_MAX_BYTES = 120_000;
export const BOOKING_EMAIL_HTML_MAX_BYTES = 180_000;
export const BOOKING_EMAIL_SUBJECT_MAX_CHARS = 500;

export type BookingCandidateSource = "calendar" | "forwarded_email";
export type BookingCandidateType = "accommodation" | "flight" | "activity" | "ground_transport" | "car_rental" | "other";
export type BookingCandidateConfidence = "high" | "medium" | "low";
export type BookingCandidateStatus = "pending" | "added" | "ignored";
export type BookingCandidateField = "type" | "title" | "provider" | "startDate" | "endDate" | "location" | "reference" | "confirmationUrl";
export type BookingCandidateEvidence = "message_metadata" | "provider_template" | "labelled_text" | "generic_pattern" | "calendar_event";

export type BookingCandidateProvenance = {
  field: BookingCandidateField;
  evidence: BookingCandidateEvidence;
  confidence: BookingCandidateConfidence;
};

export type BookingCandidateProposal = {
  source: BookingCandidateSource;
  sources: BookingCandidateSource[];
  type: BookingCandidateType;
  title: string;
  provider: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  reference: string | null;
  confirmationUrl: string | null;
  confidence: BookingCandidateConfidence;
  provenance: BookingCandidateProvenance[];
  fingerprint: string;
  strictFingerprint: string | null;
};

export type BookingCandidate = BookingCandidateProposal & {
  id: string;
  ownerId: string;
  status: BookingCandidateStatus;
  suggestedTripId: string | null;
  canonicalTripId: string | null;
  canonicalBookingId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookingProviderDetection = {
  provider: string | null;
  kind: "booking_com" | "trip_com" | "viator" | "omio" | "airline" | "hotel_direct" | "unknown";
  confidence: BookingCandidateConfidence;
};

export type ForwardedBookingEmail = {
  subject: string;
  text?: string | null;
  html?: string | null;
};

export class BookingEmailParseError extends Error {
  readonly code: "oversized" | "malformed";

  constructor(code: "oversized" | "malformed") {
    super(code === "oversized" ? "Inbound email exceeds the supported size." : "Inbound email is malformed.");
    this.code = code;
    this.name = "BookingEmailParseError";
  }
}

const monthNumbers: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9,
  sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

const knownProviderHosts: Record<BookingProviderDetection["kind"], string[]> = {
  booking_com: ["booking.com"],
  trip_com: ["trip.com"],
  viator: ["viator.com"],
  omio: ["omio.com"],
  airline: [],
  hotel_direct: [],
  unknown: [],
};

const byteLength = (value: string) => Buffer.byteLength(value, "utf8");

export function sanitizeBookingText(value: string, maxLength = 180) {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Convert hostile HTML to inert extraction text. The result is never rendered as HTML. */
export function htmlToSafeBookingText(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(img|link|meta|source|video|audio)\b[^>]*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d{1,6});/g, (_, code: string) => {
      const value = Number(code);
      return Number.isFinite(value) && value >= 32 && value <= 0x10ffff ? String.fromCodePoint(value) : " ";
    })
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractionBody(input: ForwardedBookingEmail) {
  if (input.subject.length > BOOKING_EMAIL_SUBJECT_MAX_CHARS) throw new BookingEmailParseError("oversized");
  if (input.text && byteLength(input.text) > BOOKING_EMAIL_BODY_MAX_BYTES) throw new BookingEmailParseError("oversized");
  if (input.html && byteLength(input.html) > BOOKING_EMAIL_HTML_MAX_BYTES) throw new BookingEmailParseError("oversized");
  const body = input.text?.trim() || (input.html ? htmlToSafeBookingText(input.html) : "");
  if (!body) throw new BookingEmailParseError("malformed");
  // Deliberately bound forwarded chains. One original confirmation is enough;
  // older quoted messages are unrelated input and are discarded.
  const chainParts = body.split(/\n-{2,}\s*(?:Forwarded message|Original Message)\s*-{2,}\n/i);
  return chainParts.slice(0, 2).join("\n").slice(0, BOOKING_EMAIL_BODY_MAX_BYTES);
}

function labelledValue(text: string, labels: string[]) {
  const label = labels.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*(?::|#|–|—|-)\\s*([^\\n]{1,180})`, "i"));
  return match ? sanitizeBookingText(match[1]) : null;
}

function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseExplicitBookingDate(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(/(\d)(st|nd|rd|th)\b/gi, "$1").replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
  const direct = normalized.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (direct) return isoDate(Number(direct[1]), Number(direct[2]), Number(direct[3]));
  const dayFirst = normalized.match(new RegExp(`\\b(\\d{1,2})\\s+(${Object.keys(monthNumbers).join("|")})\\s+(20\\d{2})\\b`, "i"));
  if (dayFirst) return isoDate(Number(dayFirst[3]), monthNumbers[dayFirst[2].toLowerCase()], Number(dayFirst[1]));
  const monthFirst = normalized.match(new RegExp(`\\b(${Object.keys(monthNumbers).join("|")})\\s+(\\d{1,2})\\s+(20\\d{2})\\b`, "i"));
  if (monthFirst) return isoDate(Number(monthFirst[3]), monthNumbers[monthFirst[1].toLowerCase()], Number(monthFirst[2]));
  return null;
}

function forwardedSenderDomain(text: string) {
  const from = text.match(/(?:^|\n)\s*From:\s*[^\n<]*<?[A-Z0-9._%+-]+@([A-Z0-9.-]+)>?/i);
  return from?.[1]?.toLowerCase() ?? "";
}

/** Provider recognition is separate from field extraction by design. */
export function detectBookingProvider(subject: string, text: string): BookingProviderDetection {
  const haystack = `${subject}\n${text}`.toLowerCase();
  const forwardedDomain = forwardedSenderDomain(text);
  if (/\bbooking\.com\b/.test(haystack) || forwardedDomain.endsWith("booking.com")) return { provider: "Booking.com", kind: "booking_com", confidence: "high" };
  if (/\btrip\.com\b/.test(haystack) || forwardedDomain.endsWith("trip.com")) return { provider: "Trip.com", kind: "trip_com", confidence: "high" };
  if (/\bviator\b/.test(haystack) || forwardedDomain.endsWith("viator.com")) return { provider: "Viator", kind: "viator", confidence: "high" };
  if (/\bomio\b/.test(haystack) || forwardedDomain.endsWith("omio.com")) return { provider: "Omio", kind: "omio", confidence: "high" };
  const operator = labelledValue(text, ["Airline", "Carrier", "Operator"]);
  if (/\b(flight|airline|airways|boarding|pnr)\b/.test(haystack)) return { provider: operator, kind: "airline", confidence: operator ? "high" : "medium" };
  const hotel = labelledValue(text, ["Hotel", "Property", "Accommodation"]);
  if (/\b(check[- ]?in|check[- ]?out|hotel|property|room|guest)\b/.test(haystack)) return { provider: hotel ? "Direct hotel" : null, kind: "hotel_direct", confidence: "medium" };
  return { provider: null, kind: "unknown", confidence: "low" };
}

function bookingType(provider: BookingProviderDetection, subject: string, text: string): BookingCandidateType {
  const haystack = `${subject}\n${text}`.toLowerCase();
  if (provider.kind === "viator" || /\b(tour|activity|experience|voucher)\b/.test(haystack)) return "activity";
  if (provider.kind === "omio" || /\b(train|rail|coach|bus|ferry)\b/.test(haystack)) return "ground_transport";
  if (provider.kind === "airline" || /\b(flight|airline|airways|boarding|pnr)\b/.test(haystack)) return "flight";
  if (/\b(car rental|rental car|vehicle hire)\b/.test(haystack)) return "car_rental";
  if (provider.kind === "booking_com" || provider.kind === "hotel_direct" || /\b(check[- ]?in|check[- ]?out|hotel|property|room|guest)\b/.test(haystack)) return "accommodation";
  return "other";
}

function firstExplicitDates(text: string) {
  const matches = text.match(/\b20\d{2}-\d{1,2}-\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2}\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+20\d{2}\b/gi) ?? [];
  return [...new Set(matches.map((value) => parseExplicitBookingDate(value)).filter((value): value is string => Boolean(value)))];
}

function safeConfirmationUrl(text: string, provider: BookingProviderDetection) {
  const allowed = knownProviderHosts[provider.kind];
  if (!allowed.length) return null;
  const urls = text.match(/https:\/\/[^\s<>"']{1,500}/gi) ?? [];
  for (const raw of urls) {
    try {
      const url = new URL(raw.replace(/[),.;]+$/, ""));
      const host = url.hostname.toLowerCase();
      if (allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) return url.toString().slice(0, 1000);
    } catch { /* Unsupported URLs are ignored and never fetched. */ }
  }
  return null;
}

const fingerprintValue = (value: string | null) => (value ?? "")
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\b(hotel|hostel|resort|booking|reservation|confirmation|stay)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function hashFingerprint(parts: Array<string | null>) {
  return createHash("sha256").update(parts.map(fingerprintValue).join("|")).digest("hex");
}

export function bookingCandidateFingerprints(input: Pick<BookingCandidateProposal, "type" | "title" | "startDate" | "endDate" | "location" | "provider" | "reference">) {
  return {
    fingerprint: hashFingerprint([input.type, input.title, input.startDate, input.endDate, input.location]),
    strictFingerprint: input.provider && input.reference ? hashFingerprint([input.provider, input.reference]) : null,
  };
}

function titleForCandidate(type: BookingCandidateType, subject: string, text: string, provider: BookingProviderDetection) {
  const labelled = labelledValue(text, type === "activity"
    ? ["Activity", "Tour", "Experience"]
    : type === "flight"
      ? ["Flight", "Route"]
      : ["Property", "Hotel", "Accommodation", "Stay"]);
  if (labelled) return labelled;
  const flightNumber = text.match(/\b(?:Flight(?: number| no\.?)?|Flight)\s*[:#-]?\s*([A-Z]{2,3}\s?\d{2,4})\b/i)?.[1];
  if (type === "flight" && flightNumber) return sanitizeBookingText(`${provider.provider ?? "Airline"} flight ${flightNumber}`);
  const subjectTitle = subject.match(/(?:booking|reservation|stay|flight|activity)\s+(?:is\s+)?confirmed\s*[:–—-]\s*(.+)$/i)?.[1]
    ?? subject.match(/confirmation\s*[:–—-]\s*(.+)$/i)?.[1];
  return sanitizeBookingText(subjectTitle ?? (provider.provider ? `${provider.provider} booking` : "Travel booking"));
}

export function extractForwardedBookingCandidate(input: ForwardedBookingEmail): BookingCandidateProposal | null {
  const subject = sanitizeBookingText(input.subject, BOOKING_EMAIL_SUBJECT_MAX_CHARS);
  const text = extractionBody(input);
  const provider = detectBookingProvider(subject, text);
  const type = bookingType(provider, subject, text);
  const hasConfirmationSignal = /\b(booking|reservation|confirmation|confirmed|voucher|ticket|itinerary|pnr)\b/i.test(`${subject}\n${text}`);
  if (!hasConfirmationSignal || type === "other") return null;

  const startLabel = type === "accommodation"
    ? labelledValue(text, ["Check-in", "Check in", "Arrival", "Start date"])
    : labelledValue(text, ["Departure", "Depart", "Start date", "Date"]);
  const endLabel = type === "accommodation"
    ? labelledValue(text, ["Check-out", "Check out", "Departure", "End date"])
    : labelledValue(text, ["Arrival", "Return", "End date"]);
  const dates = firstExplicitDates(text);
  const startDate = parseExplicitBookingDate(startLabel) ?? dates[0] ?? null;
  const endDate = parseExplicitBookingDate(endLabel) ?? dates[1] ?? (type === "accommodation" ? null : startDate);
  const title = titleForCandidate(type, subject, text, provider);
  const location = labelledValue(text, ["Location", "Destination", "City", "Address", "Route"]);
  const reference = labelledValue(text, ["Booking reference", "Confirmation number", "Confirmation code", "Reservation number", "Reference", "PNR"])
    ?.replace(/[^A-Z0-9._/-]/gi, "")
    .slice(0, 64) || null;
  const confirmationUrl = safeConfirmationUrl(text, provider);
  const strongFields = [title !== "Travel booking", Boolean(startDate), Boolean(location), Boolean(reference)].filter(Boolean).length;
  if (!startDate && !reference) return null;
  const confidence: BookingCandidateConfidence = provider.confidence === "high" && strongFields >= 3
    ? "high"
    : strongFields >= 2 ? "medium" : "low";
  if (confidence === "low" && provider.kind === "unknown") return null;

  const provenance: BookingCandidateProvenance[] = [
    { field: "type", evidence: provider.kind === "unknown" ? "generic_pattern" : "provider_template", confidence: provider.confidence },
    { field: "title", evidence: "labelled_text", confidence: title === "Travel booking" ? "low" : "high" },
    ...(provider.provider ? [{ field: "provider" as const, evidence: "provider_template" as const, confidence: provider.confidence }] : []),
    ...(startDate ? [{ field: "startDate" as const, evidence: startLabel ? "labelled_text" as const : "generic_pattern" as const, confidence: startLabel ? "high" as const : "medium" as const }] : []),
    ...(endDate ? [{ field: "endDate" as const, evidence: endLabel ? "labelled_text" as const : "generic_pattern" as const, confidence: endLabel ? "high" as const : "medium" as const }] : []),
    ...(location ? [{ field: "location" as const, evidence: "labelled_text" as const, confidence: "high" as const }] : []),
    ...(reference ? [{ field: "reference" as const, evidence: "labelled_text" as const, confidence: "high" as const }] : []),
    ...(confirmationUrl ? [{ field: "confirmationUrl" as const, evidence: "provider_template" as const, confidence: "high" as const }] : []),
  ];
  const fields = { type, title, provider: provider.provider, startDate, endDate, location, reference, confirmationUrl };
  return {
    source: "forwarded_email",
    sources: ["forwarded_email"],
    ...fields,
    confidence,
    provenance,
    ...bookingCandidateFingerprints(fields),
  };
}

const confidenceRank: Record<BookingCandidateConfidence, number> = { low: 0, medium: 1, high: 2 };

/** Merge new evidence into one provider-neutral candidate without touching a trip. */
export function mergeBookingCandidate(existing: BookingCandidate, incoming: BookingCandidateProposal): BookingCandidate {
  const prefer = <T>(current: T | null, next: T | null) => next ?? current;
  const incomingIsStronger = confidenceRank[incoming.confidence] > confidenceRank[existing.confidence];
  return {
    ...existing,
    source: incoming.source,
    sources: [...new Set([...existing.sources, ...incoming.sources])],
    type: incomingIsStronger ? incoming.type : existing.type,
    title: incomingIsStronger && incoming.title !== "Travel booking" ? incoming.title : existing.title,
    provider: prefer(existing.provider, incoming.provider),
    startDate: prefer(existing.startDate, incoming.startDate),
    endDate: prefer(existing.endDate, incoming.endDate),
    location: prefer(existing.location, incoming.location),
    reference: prefer(existing.reference, incoming.reference),
    confirmationUrl: prefer(existing.confirmationUrl, incoming.confirmationUrl),
    confidence: incomingIsStronger ? incoming.confidence : existing.confidence,
    provenance: [...new Map([...existing.provenance, ...incoming.provenance].map((item) => [`${item.field}:${item.evidence}`, item])).values()],
    strictFingerprint: incoming.strictFingerprint ?? existing.strictFingerprint,
    // A newly arrived source is reviewable even when the earlier version was
    // already added; confirmation then enriches the same canonical booking.
    status: existing.status === "added" ? "pending" : existing.status,
    updatedAt: new Date().toISOString(),
  };
}

export function maskBookingReference(reference: string | null) {
  if (!reference) return null;
  const visible = reference.slice(-4);
  return `${"•".repeat(Math.max(4, Math.min(8, reference.length - visible.length)))}${visible}`;
}

export function isBookingCandidate(value: unknown): value is BookingCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BookingCandidate>;
  return typeof candidate.id === "string"
    && typeof candidate.ownerId === "string"
    && candidate.source !== undefined
    && Array.isArray(candidate.sources)
    && typeof candidate.title === "string"
    && typeof candidate.fingerprint === "string"
    && (candidate.status === "pending" || candidate.status === "added" || candidate.status === "ignored");
}
