import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { verifyJWT } from "better-auth/crypto";

import { safeJourneyReturnTarget } from "./trip-continuity.ts";

export const MORROVIA_EMAIL_VERIFICATION_IDENTIFIER_PREFIX = "morrovia-email-verification:";

export const MORROVIA_EMAIL_VERIFICATION_STORAGE = {
  storeIdentifier: {
    default: "plain" as const,
    overrides: {
      [MORROVIA_EMAIL_VERIFICATION_IDENTIFIER_PREFIX]: "hashed" as const,
    },
  },
};

type VerificationTokenPayload = {
  email?: string;
  exp?: number;
};

type ReservationInput = {
  identifier: string;
  value: string;
  expiresAt: Date;
};

type SingleUseOptions = {
  reserveCapability?: (input: ReservationInput) => Promise<boolean>;
};

function alreadyUsedSignInPath(callbackURL: string) {
  const query = new URLSearchParams({
    next: safeJourneyReturnTarget(callbackURL),
    verification: "already-used",
  });
  return `/journey/login?${query.toString()}`;
}

/**
 * Adds a one-time authentication boundary around Better Auth's stateless email
 * verification JWT. Better Auth remains responsible for validating the token,
 * verifying the user and creating the session; this hook only reserves a
 * hashed replay tombstone before the endpoint can mint that session.
 */
export function morroviaEmailVerificationSingleUse(options: SingleUseOptions = {}): BetterAuthPlugin {
  return {
    id: "morrovia-email-verification-single-use",
    hooks: {
      before: [{
        matcher: (context) => context.path === "/verify-email",
        handler: createAuthMiddleware(async (context) => {
          const token = typeof context.query?.token === "string" ? context.query.token : "";
          if (!token) return;

          const payload = await verifyJWT<VerificationTokenPayload>(token, context.context.secret);
          const expiresAt = typeof payload?.exp === "number" ? new Date(payload.exp * 1_000) : null;
          // Let Better Auth return its canonical invalid/expired-token response.
          if (!payload?.email || !expiresAt || expiresAt <= new Date()) return;

          const reservation = {
            identifier: `${MORROVIA_EMAIL_VERIFICATION_IDENTIFIER_PREFIX}${token}`,
            value: "consumed",
            expiresAt,
          };
          const reserved = options.reserveCapability
            ? await options.reserveCapability(reservation)
            : await context.context.internalAdapter.reserveVerificationValue(reservation);
          if (reserved) return;

          const callbackURL = safeJourneyReturnTarget(
            typeof context.query?.callbackURL === "string" ? context.query.callbackURL : undefined,
          );
          const activeSession = await getSessionFromCtx(context, { disableRefresh: true });
          throw context.redirect(activeSession ? callbackURL : alreadyUsedSignInPath(callbackURL));
        }),
      }],
    },
  };
}
