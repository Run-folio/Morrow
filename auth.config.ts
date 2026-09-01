import { betterAuth } from "better-auth";
import { Pool } from "pg";
import {
  getEasyTAuthSecret,
  getMorroviaAuthBaseURL,
  getMorroviaAuthTrustedOrigins,
  GOOGLE_ACCOUNT_LINKING_POLICY,
  GOOGLE_AUTH_SCOPES,
  isEasyTEmailVerificationRequired,
  isMorroviaGoogleAuthConfigured,
} from "@/lib/easyt/auth-environment";
import { passwordResetEmail, sendEasyTEmail, verificationEmail } from "@/lib/easyt/email";

function createAuth(databaseUrl: string, secret: string) {
  const baseURL = getMorroviaAuthBaseURL();
  const googleEnabled = isMorroviaGoogleAuthConfigured();
  return betterAuth({
    appName: "Morrovia",
    baseURL,
    secret,
    database: new Pool({ connectionString: databaseUrl }),
    account: {
      // Better Auth remains the sole account/linking owner. New and refreshed
      // OAuth token fields are encrypted with the Better Auth secret.
      encryptOAuthTokens: true,
      accountLinking: GOOGLE_ACCOUNT_LINKING_POLICY,
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: isEasyTEmailVerificationRequired(),
      sendResetPassword: async ({ user, token }) => {
        // Better Auth's generated URL targets the API endpoint directly. Send
        // travellers to Morrovia's reset form instead, which then submits the
        // token through authClient.resetPassword().
        const resetUrl = new URL(
          "/journey/reset-password",
          baseURL,
        );
        resetUrl.searchParams.set("token", token);
        await sendEasyTEmail({ to: user.email, ...passwordResetEmail(resetUrl.toString()) });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendEasyTEmail({ to: user.email, ...verificationEmail(url) });
      },
      sendOnSignUp: isEasyTEmailVerificationRequired(),
      // Existing accounts created before email delivery was configured need a
      // way to recover without a separate support flow. A blocked sign-in
      // sends a fresh one-time verification link.
      sendOnSignIn: isEasyTEmailVerificationRequired(),
      autoSignInAfterVerification: true,
    },
    socialProviders: googleEnabled ? {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        // Ask only for the identity data Morrovia needs and let travellers choose
        // between their Google accounts instead of silently reusing one.
        scope: [...GOOGLE_AUTH_SCOPES],
        prompt: "select_account",
      },
    } : {},
    trustedOrigins: getMorroviaAuthTrustedOrigins(),
    onAPIError: {
      // Invalid/stale OAuth state cannot safely recover a return URL. Bring the
      // traveller back to the normal auth surface with a bounded error code.
      errorURL: new URL("/journey/login?oauth=google", baseURL).toString(),
    },
    logger: {
      level: "warn",
      // Better Auth can pass provider/network error objects as extra logger
      // arguments. Deliberately omit them so codes, tokens and payloads cannot
      // enter application logs through this integration.
      log(level) {
        if (level === "error") console.error("[Better Auth] Authentication request failed.");
        else if (level === "warn") console.warn("[Better Auth] Authentication request warning.");
      },
    },
  });
}

type EasyTAuth = ReturnType<typeof createAuth>;
let authInstance: EasyTAuth | undefined;

export function getAuth(): EasyTAuth {
  if (authInstance) return authInstance;

  const databaseUrl = process.env.DATABASE_URL;
  const secret = getEasyTAuthSecret();
  if (!databaseUrl || !secret) {
    throw new Error("Morrovia authentication is not configured in this environment.");
  }

  authInstance = createAuth(databaseUrl, secret);

  return authInstance;
}
