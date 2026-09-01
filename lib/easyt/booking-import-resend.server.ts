import "server-only";

import { BOOKING_RECEIVED_EMAIL_MAX_BYTES, readTextWithLimit } from "./booking-email-security";

const RESEND_RECEIVING_TIMEOUT_MS = 8_000;

export type ReceivedBookingEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  headers: Record<string, unknown>;
  attachments: Array<{ id?: string; filename?: string; content_type?: string; content_disposition?: string | null }>;
};

export class BookingInboundProviderError extends Error {
  readonly code: "not_configured" | "unavailable" | "oversized" | "malformed";

  constructor(code: "not_configured" | "unavailable" | "oversized" | "malformed") {
    super(`Inbound email provider error: ${code}`);
    this.code = code;
    this.name = "BookingInboundProviderError";
  }
}

/** Resend adapter. No body, raw MIME, URL, or attachment is logged or persisted here. */
export async function retrieveResendBookingEmail(emailId: string): Promise<ReceivedBookingEmail> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new BookingInboundProviderError("not_configured");
  let response: Response;
  try {
    response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(RESEND_RECEIVING_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new BookingInboundProviderError("unavailable");
  }
  if (!response.ok) throw new BookingInboundProviderError("unavailable");
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > BOOKING_RECEIVED_EMAIL_MAX_BYTES) {
    throw new BookingInboundProviderError("oversized");
  }
  let raw: string;
  try {
    raw = await readTextWithLimit(response.body, BOOKING_RECEIVED_EMAIL_MAX_BYTES);
  } catch {
    throw new BookingInboundProviderError("oversized");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new BookingInboundProviderError("malformed");
  }
  if (!value || typeof value !== "object") throw new BookingInboundProviderError("malformed");
  const email = value as Partial<ReceivedBookingEmail>;
  if (typeof email.id !== "string" || typeof email.from !== "string" || !Array.isArray(email.to) || typeof email.subject !== "string") {
    throw new BookingInboundProviderError("malformed");
  }
  return {
    id: email.id,
    from: email.from,
    to: email.to.filter((item): item is string => typeof item === "string"),
    subject: email.subject,
    text: typeof email.text === "string" ? email.text : null,
    html: typeof email.html === "string" ? email.html : null,
    headers: email.headers && typeof email.headers === "object" ? email.headers : {},
    attachments: Array.isArray(email.attachments) ? email.attachments : [],
  };
}
