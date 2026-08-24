import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { getEasyTAuthSecret, isEasyTEmailVerificationRequired } from "@/lib/easyt/auth-environment";
import { passwordResetEmail, sendEasyTEmail, verificationEmail } from "@/lib/easyt/email";

const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

function createAuth(databaseUrl: string, secret: string) {
  return betterAuth({
    appName: "EasyT",
    baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    secret,
    database: new Pool({ connectionString: databaseUrl }),
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
          process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
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
        // Ask only for the identity data EasyT needs and let travellers choose
        // between their Google accounts instead of silently reusing one.
        scope: ["email", "profile"],
        prompt: "select_account",
      },
    } : {},
    trustedOrigins: [
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
  });
}

type EasyTAuth = ReturnType<typeof createAuth>;
let authInstance: EasyTAuth | undefined;

export function getAuth(): EasyTAuth {
  if (authInstance) return authInstance;

  const databaseUrl = process.env.DATABASE_URL;
  const secret = getEasyTAuthSecret();
  if (!databaseUrl || !secret) {
    throw new Error("EasyT authentication is not configured in this environment.");
  }

  authInstance = createAuth(databaseUrl, secret);

  return authInstance;
}
