import type { MorroviaEmail } from "./email-template.ts";
import { emailDeliveryDecision, morroviaSender, normalizedEmailAddress } from "./email-policy.ts";

export const EMAIL_PROVIDER_TIMEOUT_MS = 8_000;

type Environment = Record<string, string | undefined>;

type DeliveryReservation = {
  duplicate: boolean;
  eventId?: string;
  providerId?: string | null;
};

export type EmailDeliveryDiagnostic = {
  operation: MorroviaEmail["template"];
  provider: "resend";
  category: "configuration" | "policy" | "provider_unavailable" | "provider_rejected";
  mode: string;
  senderConfigured: boolean;
  recipientAllowed: boolean;
  providerStatus: number | null;
  providerCode: string | null;
  providerReason: string | null;
  requestId: string | null;
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
  reportFailure?: (diagnostic: EmailDeliveryDiagnostic) => void;
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

function boundedProviderValue(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(value) ? value : null;
}

function providerReason(message: unknown) {
  if (typeof message !== "string") return null;
  const normalized = message.toLowerCase();
  if (normalized.includes("domain") && normalized.includes("not verified")) return "domain_not_verified";
  if (normalized.includes("only send") && normalized.includes("own email")) return "testing_recipient_restricted";
  if (normalized.includes("api key") && (normalized.includes("invalid") || normalized.includes("restricted"))) return "invalid_api_key";
  if (normalized.includes("from") && normalized.includes("required")) return "sender_missing";
  if (normalized.includes("rate limit") || normalized.includes("too many requests")) return "rate_limited";
  return null;
}

function safeRequestId(response: Response) {
  return boundedProviderValue(response.headers.get("x-resend-request-id") ?? response.headers.get("x-request-id"));
}

export async function deliverMorroviaEmail(email: MorroviaEmail, dependencies: DeliveryDependencies) {
  const { environment } = dependencies;
  const apiKey = environment.RESEND_API_KEY;
  const configuredFrom = environment.EMAIL_FROM;
  const recipient = normalizedEmailAddress(email.to);
  const decision = emailDeliveryDecision(environment, recipient);
  const diagnostic = (input: Partial<EmailDeliveryDiagnostic> & Pick<EmailDeliveryDiagnostic, "category">) => {
    dependencies.reportFailure?.({
      operation: email.template,
      provider: "resend",
      category: input.category,
      mode: decision.mode,
      senderConfigured: Boolean(configuredFrom),
      recipientAllowed: decision.allowed,
      providerStatus: input.providerStatus ?? null,
      providerCode: input.providerCode ?? null,
      providerReason: input.providerReason ?? null,
      requestId: input.requestId ?? null,
    });
  };
  if (!apiKey || !configuredFrom) {
    diagnostic({ category: "configuration", providerReason: !apiKey ? "credential_missing" : "sender_missing" });
    throw new MorroviaEmailDeliveryError("not_configured");
  }
  if (!decision.allowed) {
    diagnostic({ category: "policy", providerReason: decision.reason });
    throw new MorroviaEmailDeliveryError("recipient_blocked");
  }
  if (!validIdempotencyKey(email.idempotencyKey)) {
    diagnostic({ category: "configuration", providerReason: "invalid_idempotency_key" });
    throw new MorroviaEmailDeliveryError("not_configured");
  }

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
  } catch (error) {
    if (reservation?.eventId && dependencies.finishDelivery) {
      await dependencies.finishDelivery({
        eventId: reservation.eventId,
        status: "failed",
        errorMessage: "Email provider unavailable or timed out",
      }).catch(() => undefined);
    }
    diagnostic({
      category: "provider_unavailable",
      providerReason: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network_error",
    });
    throw new MorroviaEmailDeliveryError("provider_unavailable");
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    const providerPayload = (() => {
      try {
        return JSON.parse(responseText) as { code?: unknown; name?: unknown; message?: unknown };
      } catch {
        return {} as { code?: unknown; name?: unknown; message?: unknown };
      }
    })();
    const providerCode = boundedProviderValue(providerPayload.code) ?? boundedProviderValue(providerPayload.name);
    const reason = providerReason(providerPayload.message);
    if (reservation?.eventId && dependencies.finishDelivery) {
      await dependencies.finishDelivery({
        eventId: reservation.eventId,
        status: "failed",
        errorMessage: `Email provider rejected request (${response.status}${providerCode ? ` · ${providerCode}` : ""}${reason ? ` · ${reason}` : ""})`,
      }).catch(() => undefined);
    }
    diagnostic({
      category: "provider_rejected",
      providerStatus: response.status,
      providerCode,
      providerReason: reason,
      requestId: safeRequestId(response),
    });
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
