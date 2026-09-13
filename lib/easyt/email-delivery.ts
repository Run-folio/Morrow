import type { MorroviaEmail } from "./email-template.ts";
import { emailDeliveryDecision, morroviaSender, normalizedEmailAddress } from "./email-policy.ts";

export const EMAIL_PROVIDER_TIMEOUT_MS = 8_000;

type Environment = Record<string, string | undefined>;

type DeliveryReservation = {
  duplicate: boolean;
  eventId?: string;
  providerId?: string | null;
};

type DeliveryDependencies = {
  environment: Environment;
  fetcher: typeof fetch;
  reserveDelivery?: (input: {
    recipientEmail: string;
    subject: string;
    template: string;
    idempotencyKey: string;
  }) => Promise<DeliveryReservation>;
  finishDelivery?: (input: {
    eventId: string;
    providerId?: string | null;
    status: "sent" | "failed";
    errorMessage?: string | null;
  }) => Promise<void>;
};

export class MorroviaEmailDeliveryError extends Error {
  readonly code: "not_configured" | "recipient_blocked" | "provider_unavailable" | "provider_rejected";

  constructor(code: "not_configured" | "recipient_blocked" | "provider_unavailable" | "provider_rejected") {
    super("Email delivery is temporarily unavailable. Try again.");
    this.name = "MorroviaEmailDeliveryError";
    this.code = code;
  }
}

function validIdempotencyKey(value: string) {
  return value.length > 0 && value.length <= 256 && /^[A-Za-z0-9._:/-]+$/.test(value);
}

export async function deliverMorroviaEmail(email: MorroviaEmail, dependencies: DeliveryDependencies) {
  const { environment } = dependencies;
  const apiKey = environment.RESEND_API_KEY;
  const configuredFrom = environment.EMAIL_FROM;
  if (!apiKey || !configuredFrom) throw new MorroviaEmailDeliveryError("not_configured");

  const recipient = normalizedEmailAddress(email.to);
  const decision = emailDeliveryDecision(environment, recipient);
  if (!decision.allowed) throw new MorroviaEmailDeliveryError("recipient_blocked");
  if (!validIdempotencyKey(email.idempotencyKey)) throw new MorroviaEmailDeliveryError("not_configured");

  const from = morroviaSender(configuredFrom);
  const replyTo = email.replyTo ? normalizedEmailAddress(email.replyTo) : undefined;
  let reservation: DeliveryReservation | undefined;
  if (email.recordEvent !== false && dependencies.reserveDelivery) {
    reservation = await dependencies.reserveDelivery({
      recipientEmail: recipient,
      subject: email.subject,
      template: email.template,
      idempotencyKey: email.idempotencyKey,
    }).catch(() => undefined);
    if (reservation?.duplicate) {
      return { id: reservation.providerId ?? undefined, deduplicated: true as const };
    }
  }

  let response: Response;
  try {
    response = await dependencies.fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: recipient,
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(EMAIL_PROVIDER_TIMEOUT_MS),
    });
  } catch {
    if (reservation?.eventId && dependencies.finishDelivery) {
      await dependencies.finishDelivery({
        eventId: reservation.eventId,
        status: "failed",
        errorMessage: "Email provider unavailable or timed out",
      }).catch(() => undefined);
    }
    throw new MorroviaEmailDeliveryError("provider_unavailable");
  }

  if (!response.ok) {
    if (reservation?.eventId && dependencies.finishDelivery) {
      await dependencies.finishDelivery({
        eventId: reservation.eventId,
        status: "failed",
        errorMessage: `Email provider rejected request (${response.status})`,
      }).catch(() => undefined);
    }
    throw new MorroviaEmailDeliveryError("provider_rejected");
  }

  const payload = await response.json().catch(() => ({})) as { id?: string };
  if (reservation?.eventId && dependencies.finishDelivery) {
    await dependencies.finishDelivery({
      eventId: reservation.eventId,
      providerId: payload.id,
      status: "sent",
    }).catch(() => undefined);
  }
  return { id: payload.id, deduplicated: false as const };
}
