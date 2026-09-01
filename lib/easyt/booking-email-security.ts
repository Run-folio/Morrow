import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const BOOKING_WEBHOOK_MAX_BYTES = 64_000;
export const BOOKING_RECEIVED_EMAIL_MAX_BYTES = 512_000;

export async function readTextWithLimit(stream: ReadableStream<Uint8Array> | null, maxBytes: number) {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("payload_too_large");
    }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}

export function verifyResendWebhookSignature(body: string, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature")?.split(" ").filter(Boolean) ?? [];
  if (!id || !timestamp || !signatures.length) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(now / 1000 - timestampNumber) > 300) return false;
  try {
    const encodedSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const key = Buffer.from(encodedSecret, "base64");
    const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
    return signatures.some((signature) => {
      const value = signature.replace(/^v\d+,/, "");
      const actual = Buffer.from(value);
      const wanted = Buffer.from(expected);
      return actual.length === wanted.length && timingSafeEqual(actual, wanted);
    });
  } catch {
    return false;
  }
}

export function normalizeEmailAddress(value: string) {
  const bracketed = value.match(/<([^<>]+)>/)?.[1] ?? value;
  const normalized = bracketed.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function bookingAliasTokenFromRecipients(recipients: string[], configuredDomain: string) {
  const domain = configuredDomain.trim().toLowerCase();
  if (!domain) return null;
  for (const recipient of recipients) {
    const address = normalizeEmailAddress(recipient);
    if (!address) continue;
    const [local, recipientDomain] = address.split("@");
    if (recipientDomain !== domain) continue;
    const token = local.match(/^bookings\+([a-z0-9_-]{20,64})$/i)?.[1];
    if (token) return token;
  }
  return null;
}

function headerValue(headers: Record<string, unknown>, name: string) {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  return Array.isArray(entry) ? entry.join(" ") : typeof entry === "string" ? entry : "";
}

/**
 * A private alias alone is not enough. The outer message must also come from
 * the verified account address and carry an upstream DMARC pass for that
 * address's domain. Unknown or unverifiable messages remain unattached.
 */
export function authenticatedForwardingSender(input: {
  from: string;
  accountEmail: string;
  headers: Record<string, unknown>;
}) {
  const sender = normalizeEmailAddress(input.from);
  const account = normalizeEmailAddress(input.accountEmail);
  if (!sender || !account || sender !== account) return false;
  const domain = account.split("@")[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const authentication = headerValue(input.headers, "authentication-results");
  if (!/\bdmarc=pass\b/i.test(authentication)) return false;
  const headerFrom = authentication.match(/\bheader\.from=([^\s;]+)/i)?.[1]?.replace(/[<>]/g, "").toLowerCase();
  return !headerFrom || new RegExp(`(?:^|\\.)${domain}$`, "i").test(headerFrom);
}

export type ResendInboundWebhook = {
  type: "email.received";
  created_at?: string;
  data: {
    email_id: string;
    from?: string;
    to: string[];
    subject?: string;
    message_id?: string;
    attachments?: Array<{ id?: string; filename?: string; content_type?: string; content_disposition?: string | null }>;
  };
};

export function parseResendInboundWebhook(value: unknown): ResendInboundWebhook | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Partial<ResendInboundWebhook>;
  if (event.type !== "email.received" || !event.data || typeof event.data !== "object") return null;
  if (typeof event.data.email_id !== "string" || !event.data.email_id || !Array.isArray(event.data.to)) return null;
  if (!event.data.to.every((item) => typeof item === "string")) return null;
  return event as ResendInboundWebhook;
}
