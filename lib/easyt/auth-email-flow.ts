import { safeJourneyReturnTarget } from "./trip-continuity.ts";

export const ACKNOWLEDGED_EMAIL_VERIFICATION_TRIGGERS = {
  sendOnSignUp: false,
  sendOnSignIn: false,
} as const;

export type AuthClientFailure = {
  code?: string | null;
  message?: string | null;
};

type AuthClientResult<T> = {
  data?: T | null;
  error?: AuthClientFailure | null;
};

type VerificationRequest = {
  callbackURL: string;
  email: string;
};

type VerificationSender = (input: VerificationRequest) => Promise<AuthClientResult<{ status?: boolean }>>;

export type EmailAuthOutcome =
  | { kind: "signed-in" }
  | { kind: "verification-sent"; email: string }
  | { kind: "verification-delivery-error"; email: string }
  | { kind: "auth-error"; error?: AuthClientFailure };

function destinationEmail(submittedEmail: string, resultEmail?: string | null) {
  return resultEmail?.trim() || submittedEmail.trim();
}

export function isEmailNotVerifiedFailure(error?: AuthClientFailure | null) {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase().replaceAll("_", " ");
  return detail.includes("email not verified");
}

export async function requestAcknowledgedVerificationEmail(input: {
  callbackURL: string;
  email: string;
  sendVerificationEmail: VerificationSender;
}): Promise<EmailAuthOutcome> {
  try {
    const result = await input.sendVerificationEmail({
      callbackURL: safeJourneyReturnTarget(input.callbackURL),
      email: input.email,
    });
    if (result.error) return { kind: "verification-delivery-error", email: input.email };
    return { kind: "verification-sent", email: input.email };
  } catch {
    return { kind: "verification-delivery-error", email: input.email };
  }
}

export async function submitEmailSignUp(input: {
  callbackURL: string;
  email: string;
  emailVerificationRequired: boolean;
  name: string;
  password: string;
  sendVerificationEmail: VerificationSender;
  signUpEmail: (credentials: {
    callbackURL: string;
    email: string;
    name: string;
    password: string;
  }) => Promise<AuthClientResult<{ user?: { email?: string | null } }>>;
}): Promise<EmailAuthOutcome> {
  let result: AuthClientResult<{ user?: { email?: string | null } }>;
  try {
    result = await input.signUpEmail({
      callbackURL: safeJourneyReturnTarget(input.callbackURL),
      email: input.email,
      name: input.name,
      password: input.password,
    });
  } catch {
    return { kind: "auth-error" };
  }
  if (result.error) return { kind: "auth-error", error: result.error };
  if (!input.emailVerificationRequired) return { kind: "signed-in" };

  return requestAcknowledgedVerificationEmail({
    callbackURL: input.callbackURL,
    email: destinationEmail(input.email, result.data?.user?.email),
    sendVerificationEmail: input.sendVerificationEmail,
  });
}

export async function submitEmailSignIn(input: {
  callbackURL: string;
  email: string;
  password: string;
  sendVerificationEmail: VerificationSender;
  signInEmail: (credentials: {
    callbackURL: string;
    email: string;
    password: string;
  }) => Promise<AuthClientResult<unknown>>;
}): Promise<EmailAuthOutcome> {
  let result: AuthClientResult<unknown>;
  try {
    result = await input.signInEmail({
      callbackURL: safeJourneyReturnTarget(input.callbackURL),
      email: input.email,
      password: input.password,
    });
  } catch {
    return { kind: "auth-error" };
  }
  if (!result.error) return { kind: "signed-in" };
  if (!isEmailNotVerifiedFailure(result.error)) return { kind: "auth-error", error: result.error };

  return requestAcknowledgedVerificationEmail({
    callbackURL: input.callbackURL,
    email: input.email.trim(),
    sendVerificationEmail: input.sendVerificationEmail,
  });
}

export function emailVerificationStatePath(callbackURL: string, email: string) {
  const params = new URLSearchParams({
    next: safeJourneyReturnTarget(callbackURL),
    email,
    sent: "1",
  });
  return `/journey/login?${params.toString()}`;
}

export function signInEmailHandoffPath(callbackURL: string, email: string) {
  const params = new URLSearchParams({
    mode: "sign-in",
    next: safeJourneyReturnTarget(callbackURL),
    email,
  });
  return `/journey/login?${params.toString()}`;
}
