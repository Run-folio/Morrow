export type EmailDeliveryMode = "disabled" | "allowlist" | "live";

type Environment = Record<string, string | undefined>;

export type EmailDeliveryDecision =
  | { allowed: true; mode: "allowlist" | "live" }
  | { allowed: false; mode: EmailDeliveryMode; reason: "disabled" | "test" | "invalid_mode" | "recipient_not_allowed" | "unsafe_live_environment" };

const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

export function normalizedEmailAddress(value: string) {
  const address = value.trim().toLowerCase();
  if (!emailPattern.test(address) || /[\r\n]/.test(address)) throw new Error("Email address is invalid.");
  return address;
}

export function morroviaSender(configuredFrom: string) {
  if (/[\r\n]/.test(configuredFrom)) throw new Error("EMAIL_FROM is invalid.");
  const bracketed = configuredFrom.match(/<([^<>]+)>\s*$/)?.[1];
  const address = normalizedEmailAddress(bracketed ?? configuredFrom);
  return `Morrovia <${address}>`;
}

function configuredMode(environment: Environment): EmailDeliveryMode | "invalid" | "auto" {
  const value = environment.EMAIL_DELIVERY_MODE?.trim().toLowerCase();
  if (!value) return "auto";
  if (value === "disabled" || value === "allowlist" || value === "live") return value;
  return "invalid";
}

function configuredApplicationOrigin(environment: Environment) {
  const value = environment.NEXT_PUBLIC_APP_URL || environment.BETTER_AUTH_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function safeLiveEnvironment(environment: Environment) {
  const origin = configuredApplicationOrigin(environment);
  const context = environment.CONTEXT ?? environment.VERCEL_ENV;
  return environment.NODE_ENV === "production"
    && origin === "https://morrovia.com"
    && (!context || context === "production");
}

function allowedRecipients(environment: Environment) {
  return new Set((environment.EMAIL_ALLOWED_RECIPIENTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => emailPattern.test(value)));
}

export function emailDeliveryDecision(environment: Environment, recipient: string): EmailDeliveryDecision {
  const mode = configuredMode(environment);
  if (environment.NODE_ENV === "test") return { allowed: false, mode: mode === "live" || mode === "allowlist" ? mode : "disabled", reason: "test" };
  if (mode === "invalid") return { allowed: false, mode: "disabled", reason: "invalid_mode" };
  if (mode === "disabled") return { allowed: false, mode, reason: "disabled" };
  if (mode === "allowlist") {
    const normalized = normalizedEmailAddress(recipient);
    return allowedRecipients(environment).has(normalized)
      ? { allowed: true, mode }
      : { allowed: false, mode, reason: "recipient_not_allowed" };
  }
  if (mode === "live" || mode === "auto") {
    return safeLiveEnvironment(environment)
      ? { allowed: true, mode: "live" }
      : { allowed: false, mode: "disabled", reason: "unsafe_live_environment" };
  }
  return { allowed: false, mode: "disabled", reason: "disabled" };
}

export function isMorroviaEmailDeliveryConfigured(environment: Environment) {
  if (!environment.RESEND_API_KEY || !environment.EMAIL_FROM || environment.NODE_ENV === "test") return false;
  const mode = configuredMode(environment);
  if (mode === "allowlist") return allowedRecipients(environment).size > 0;
  if (mode === "live" || mode === "auto") return safeLiveEnvironment(environment);
  return false;
}
