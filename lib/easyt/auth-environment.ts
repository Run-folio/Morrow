export const GOOGLE_AUTH_SCOPES = ["email", "profile"] as const;

export const GOOGLE_ACCOUNT_LINKING_POLICY = {
  enabled: true,
  disableImplicitLinking: false,
  // A matching email is not sufficient on its own. Better Auth must receive a
  // verified provider email and the existing local user must already be
  // verified before an implicit same-email link is allowed.
  trustedProviders: [] as string[],
  requireLocalEmailVerified: true,
  allowDifferentEmails: false,
  allowUnlinkingAll: false,
  updateUserInfoOnLink: false,
} as const;

const LOCAL_AUTH_ORIGIN = "http://localhost:3000";

function configuredOrigin(value: string | undefined, variableName: string) {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid absolute HTTP(S) origin.`);
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:")
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error(`${variableName} must be a valid absolute HTTP(S) origin.`);
  }
  return url.origin;
}

export function getMorroviaAuthBaseURL() {
  return configuredOrigin(process.env.BETTER_AUTH_URL, "BETTER_AUTH_URL")
    ?? configuredOrigin(process.env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL")
    ?? LOCAL_AUTH_ORIGIN;
}

export function getMorroviaAuthTrustedOrigins() {
  const origins = new Set<string>([getMorroviaAuthBaseURL()]);
  const publicOrigin = configuredOrigin(process.env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL");
  if (publicOrigin) origins.add(publicOrigin);
  if (process.env.NODE_ENV !== "production") {
    origins.add(LOCAL_AUTH_ORIGIN);
    origins.add("http://127.0.0.1:3000");
  }
  return [...origins];
}

export function isMorroviaGoogleAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getEasyTAuthSecret() {
  return process.env.BETTER_AUTH_SECRET || process.env.NEON_AUTH_COOKIE_SECRET;
}

export function isEasyTAuthConfigured() {
  return Boolean(process.env.DATABASE_URL && getEasyTAuthSecret());
}

export function isEasyTEmailVerificationRequired() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}
