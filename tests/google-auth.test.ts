import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { betterAuth } from "better-auth";

import {
  getMorroviaAuthBaseURL,
  getMorroviaAuthTrustedOrigins,
  GOOGLE_ACCOUNT_LINKING_POLICY,
  GOOGLE_AUTH_SCOPES,
} from "../lib/easyt/auth-environment.ts";
import { googleAuthCallbackErrorMessage } from "../lib/easyt/auth-feedback.ts";
import {
  googleSignInErrorPath,
  safeJourneyReturnTarget,
} from "../lib/easyt/trip-continuity.ts";

const BASE_URL = "http://localhost:3000";
const AUTH_SECRET = "test-only-better-auth-secret-that-is-long-enough";
const RAW_ACCESS_TOKEN = "provider-access-token-must-not-leak";
const RAW_REFRESH_TOKEN = "provider-refresh-token-must-not-leak";

type GoogleProfile = {
  id: string;
  name: string;
  email: string;
  image: string;
  emailVerified: boolean;
};

type AuthHarness = ReturnType<typeof createAuthHarness>;

function cookieHeader(response: Response) {
  const values = setCookieValues(response);
  return values
    .filter(Boolean)
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

function setCookieValues(response: Response) {
  return typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
}

function createAuthHarness(initialProfile?: Partial<GoogleProfile>, baseURL = BASE_URL) {
  const db: MemoryDB = { user: [], session: [], account: [], verification: [] };
  const logs: string[] = [];
  let tokenEndpointFails = false;
  let profile: GoogleProfile = {
    id: "google-subject-a",
    name: "Morrovia Traveller",
    email: "traveller@example.com",
    image: "https://images.example.test/profile.png",
    emailVerified: true,
    ...initialProfile,
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    assert.equal(url, "https://oauth2.googleapis.com/token");
    if (tokenEndpointFails) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    return Response.json({
      access_token: RAW_ACCESS_TOKEN,
      refresh_token: RAW_REFRESH_TOKEN,
      expires_in: 3600,
      token_type: "Bearer",
      scope: "openid email profile",
    });
  };

  const auth = betterAuth({
    appName: "Morrovia",
    baseURL,
    secret: AUTH_SECRET,
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    account: {
      encryptOAuthTokens: true,
      accountLinking: GOOGLE_ACCOUNT_LINKING_POLICY,
    },
    socialProviders: {
      google: {
        clientId: "mock-google-client-id",
        clientSecret: "mock-google-client-secret",
        scope: [...GOOGLE_AUTH_SCOPES],
        prompt: "select_account",
        getUserInfo: async () => ({ user: profile, data: profile }),
      },
    },
    trustedOrigins: [baseURL],
    onAPIError: { errorURL: `${baseURL}/journey/login?oauth=google` },
    logger: {
      level: "warn",
      log(level) {
        // Mirror production's bounded logger: never retain Better Auth's extra
        // error objects or provider request data.
        logs.push(level === "error" ? "Authentication request failed." : "Authentication request warning.");
      },
    },
    rateLimit: { enabled: false },
  });

  async function begin(callbackURL = "/journey/dashboard") {
    const errorCallbackURL = googleSignInErrorPath(callbackURL);
    const absoluteCallbackURL = new URL(callbackURL, baseURL).toString();
    const absoluteErrorCallbackURL = new URL(errorCallbackURL, baseURL).toString();
    const response = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify({ provider: "google", callbackURL: absoluteCallbackURL, errorCallbackURL: absoluteErrorCallbackURL }),
    }));
    assert.equal(response.status, 200);
    const data = await response.json() as { url: string; redirect: boolean };
    const providerURL = new URL(data.url);
    assert.equal(providerURL.origin, "https://accounts.google.com");
    assert.equal(providerURL.searchParams.get("redirect_uri"), `${baseURL}/api/auth/callback/google`);
    assert.deepEqual(new Set((providerURL.searchParams.get("scope") ?? "").split(" ")), new Set(["openid", "email", "profile"]));
    assert.equal(data.redirect, true);
    return {
      state: providerURL.searchParams.get("state")!,
      cookie: cookieHeader(response),
      setCookies: setCookieValues(response),
      callbackURL: absoluteCallbackURL,
      errorCallbackURL: absoluteErrorCallbackURL,
    };
  }

  async function callback(flow: Awaited<ReturnType<typeof begin>>, input: { code?: string; error?: string } = {}) {
    const search = new URLSearchParams({ state: flow.state });
    if (input.error) search.set("error", input.error);
    else search.set("code", input.code ?? "mock-authorization-code");
    return auth.handler(new Request(`${baseURL}/api/auth/callback/google?${search.toString()}`, {
      headers: { cookie: flow.cookie },
    }));
  }

  return {
    auth,
    db,
    logs,
    baseURL,
    begin,
    callback,
    setProfile(next: Partial<GoogleProfile>) { profile = { ...profile, ...next }; },
    setTokenEndpointFails(value: boolean) { tokenEndpointFails = value; },
    restore() { globalThis.fetch = originalFetch; },
  };
}

async function signUpEmail(harness: AuthHarness, email: string) {
  const result = await harness.auth.api.signUpEmail({
    body: { name: "Existing traveller", email, password: "safe-password-123" },
  });
  assert.ok(result.user.id);
  return result.user.id;
}

test("existing email authentication still resolves to its Better Auth user", async () => {
  const harness = createAuthHarness();
  try {
    const ownerId = await signUpEmail(harness, "email@example.com");
    const result = await harness.auth.api.signInEmail({
      body: { email: "email@example.com", password: "safe-password-123" },
    });
    assert.equal(result.user.id, ownerId);
    assert.equal(harness.db.user.length, 1);
  } finally {
    harness.restore();
  }
});

test("new and returning Google sign-in use one canonical Better Auth user", async () => {
  const harness = createAuthHarness();
  try {
    const target = "/journey/trip-123/map?day=4&panel=eat#finder";
    const first = await harness.callback(await harness.begin(target));
    assert.equal(first.status, 302);
    assert.equal(first.headers.get("location"), `${BASE_URL}${target}`);
    assert.equal(harness.db.user.length, 1);
    assert.equal(harness.db.account.length, 1);
    const canonicalOwnerId = harness.db.user[0].id;
    assert.equal(harness.db.account[0].userId, canonicalOwnerId);
    assert.equal(harness.db.account[0].providerId, "google");
    assert.notEqual(harness.db.account[0].accessToken, RAW_ACCESS_TOKEN);
    assert.notEqual(harness.db.account[0].refreshToken, RAW_REFRESH_TOKEN);

    const second = await harness.callback(await harness.begin("/journey/dashboard"));
    assert.equal(second.status, 302);
    assert.equal(harness.db.user.length, 1);
    assert.equal(harness.db.account.length, 1);
    assert.equal(harness.db.account[0].userId, canonicalOwnerId);
  } finally {
    harness.restore();
  }
});

test("a verified same-email Google identity links to the existing verified owner and preserves trips", async () => {
  const harness = createAuthHarness({ email: "same@example.com", id: "google-same-email" });
  try {
    const ownerId = await signUpEmail(harness, "same@example.com");
    harness.db.user[0].emailVerified = true;
    const savedTrips = [{ id: "trip-a", ownerId, title: "Existing saved trip" }];

    const response = await harness.callback(await harness.begin("/journey/trip-a/overview"));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), `${BASE_URL}/journey/trip-a/overview`);
    assert.equal(harness.db.user.length, 1);
    assert.equal(harness.db.user[0].id, ownerId);
    assert.deepEqual(new Set(harness.db.account.map((account) => account.providerId)), new Set(["credential", "google"]));
    assert.equal(harness.db.account.every((account) => account.userId === ownerId), true);
    assert.deepEqual(savedTrips.filter((trip) => trip.ownerId === harness.db.user[0].id), savedTrips);
  } finally {
    harness.restore();
  }
});

test("same-email linking fails closed when either side lacks verified ownership", async () => {
  for (const scenario of [
    { localVerified: false, googleVerified: true },
    { localVerified: true, googleVerified: false },
  ]) {
    const harness = createAuthHarness({ email: "ambiguous@example.com", emailVerified: scenario.googleVerified });
    try {
      await signUpEmail(harness, "ambiguous@example.com");
      harness.db.user[0].emailVerified = scenario.localVerified;
      const response = await harness.callback(await harness.begin("/journey/dashboard"));
      assert.equal(response.status, 302);
      const location = new URL(response.headers.get("location")!, BASE_URL);
      assert.equal(location.pathname, "/journey/login");
      assert.equal(location.searchParams.get("error"), "account_not_linked");
      assert.equal(harness.db.user.length, 1);
      assert.deepEqual(harness.db.account.map((account) => account.providerId), ["credential"]);
    } finally {
      harness.restore();
    }
  }
});

test("Google cancellation and provider failure return bounded, recoverable errors", async () => {
  const cancellationHarness = createAuthHarness();
  try {
    const flow = await cancellationHarness.begin("/journey/plan?trip=draft&save=1");
    const response = await cancellationHarness.callback(flow, { error: "access_denied" });
    const location = new URL(response.headers.get("location")!, BASE_URL);
    assert.equal(location.pathname, "/journey/login");
    assert.equal(location.searchParams.get("next"), "/journey/plan?trip=draft&save=1");
    assert.equal(location.searchParams.get("error"), "access_denied");
    assert.match(googleAuthCallbackErrorMessage("access_denied"), /cancelled/i);
  } finally {
    cancellationHarness.restore();
  }

  const failureHarness = createAuthHarness({ email: "private@example.com" });
  try {
    failureHarness.setTokenEndpointFails(true);
    const response = await failureHarness.callback(await failureHarness.begin(), { code: "secret-auth-code" });
    const location = new URL(response.headers.get("location")!, BASE_URL);
    assert.equal(location.searchParams.get("error"), "invalid_code");
    const logs = failureHarness.logs.join(" ");
    for (const secret of ["secret-auth-code", RAW_ACCESS_TOKEN, RAW_REFRESH_TOKEN, "private@example.com", "mock-google-client-secret"]) {
      assert.equal(logs.includes(secret), false);
    }
  } finally {
    failureHarness.restore();
  }
});

test("stale OAuth state fails safely and Google logout invalidates the Better Auth session", async () => {
  const staleHarness = createAuthHarness();
  try {
    const flow = await staleHarness.begin("/journey/trip-a/overview");
    const stale = await staleHarness.auth.handler(new Request(`${BASE_URL}/api/auth/callback/google?state=stale-state&code=unused`, {
      headers: { cookie: flow.cookie },
    }));
    assert.equal(stale.status, 302);
    const location = new URL(stale.headers.get("location")!, BASE_URL);
    assert.equal(location.pathname, "/journey/login");
    assert.match(location.searchParams.get("error") ?? "", /state/);
    assert.equal(staleHarness.db.user.length, 0);
  } finally {
    staleHarness.restore();
  }

  const logoutHarness = createAuthHarness();
  try {
    const signedIn = await logoutHarness.callback(await logoutHarness.begin());
    const cookie = cookieHeader(signedIn);
    const session = await logoutHarness.auth.api.getSession({ headers: new Headers({ cookie }) });
    assert.equal(session?.user.id, logoutHarness.db.user[0].id);
    const signedOut = await logoutHarness.auth.handler(new Request(`${BASE_URL}/api/auth/sign-out`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: BASE_URL },
      body: "{}",
    }));
    assert.equal(signedOut.status, 200);
    assert.equal(logoutHarness.db.session.length, 0);
  } finally {
    logoutHarness.restore();
  }
});

test("HTTPS OAuth state and session cookies retain Better Auth security attributes", async () => {
  const harness = createAuthHarness(undefined, "https://morrovia.com");
  try {
    const flow = await harness.begin();
    const stateCookie = flow.setCookies.find((value) => value.includes("better-auth.state="));
    assert.ok(stateCookie);
    assert.match(stateCookie, /__Secure-better-auth\.state=/);
    assert.match(stateCookie, /HttpOnly/i);
    assert.match(stateCookie, /SameSite=Lax/i);
    assert.match(stateCookie, /Secure/i);

    const signedIn = await harness.callback(flow);
    const sessionSetCookie = setCookieValues(signedIn).find((value) => value.includes("session_token="));
    assert.ok(sessionSetCookie);
    assert.match(sessionSetCookie, /HttpOnly/i);
    assert.match(sessionSetCookie, /SameSite=Lax/i);
    assert.match(sessionSetCookie, /Secure/i);
    assert.match(sessionSetCookie, /__Secure-better-auth\.session_token=/);
  } finally {
    harness.restore();
  }
});

test("OAuth return targets preserve internal deep links and reject external or ambiguous URLs", () => {
  const target = "/journey/trip-a/itinerary?day=2#evening";
  assert.equal(safeJourneyReturnTarget(target), target);
  assert.equal(new URL(`${BASE_URL}${googleSignInErrorPath(target)}`).searchParams.get("next"), target);
  for (const unsafe of [
    "https://attacker.example/journey/trip-a",
    "//attacker.example/journey/trip-a",
    "/\\attacker.example/journey/trip-a",
    "/journey/\nLocation:https://attacker.example",
    "/not-journey",
  ]) {
    assert.equal(safeJourneyReturnTarget(unsafe), "/journey/dashboard");
  }
});

test("production auth config, logout, deletion and analytics keep provider secrets out of client boundaries", () => {
  const config = readFileSync("auth.config.ts", "utf8");
  const login = readFileSync("app/journey/login/login-form.tsx", "utf8");
  const navigation = readFileSync("app/journey/easyt-navigation.tsx", "utf8");
  const deletion = readFileSync("lib/easyt/admin-content.ts", "utf8");
  const analytics = readFileSync("lib/analytics.ts", "utf8");

  assert.match(config, /socialProviders:[\s\S]*google:/);
  assert.match(config, /accountLinking: GOOGLE_ACCOUNT_LINKING_POLICY/);
  assert.match(config, /encryptOAuthTokens: true/);
  assert.match(login, /signIn\.social\([\s\S]*provider: "google"/);
  assert.match(login, /errorCallbackURL: googleErrorCallbackURL/);
  assert.match(login, /googleSignInErrorPath\(callbackURL\)/);
  assert.doesNotMatch(login, /GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID/);
  assert.match(navigation, /await authClient\.signOut\(\)/);
  assert.match(deletion, /delete from account where "userId" = \$\{user\.id\}/);
  assert.match(deletion, /delete from "session" where "userId" = \$\{user\.id\}/);
  assert.doesNotMatch(analytics, /google.*(?:email|token|profile|subject)/i);
});

test("environment helpers keep production origins exact and credentials server-only", () => {
  const previous = {
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NODE_ENV: process.env.NODE_ENV,
  };
  try {
    process.env.BETTER_AUTH_URL = "https://staging.morrovia.com/";
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.morrovia.com";
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true, enumerable: true, writable: true });
    assert.equal(getMorroviaAuthBaseURL(), "https://staging.morrovia.com");
    assert.deepEqual(getMorroviaAuthTrustedOrigins(), ["https://staging.morrovia.com"]);
    process.env.BETTER_AUTH_URL = "https://morrovia.com/path";
    assert.throws(() => getMorroviaAuthBaseURL(), /absolute HTTP\(S\) origin/);

    const env = readFileSync(".env.example", "utf8");
    assert.match(env, /http:\/\/localhost:3000\/api\/auth\/callback\/google/);
    assert.match(env, /https:\/\/staging\.morrovia\.com\/api\/auth\/callback\/google/);
    assert.match(env, /https:\/\/morrovia\.com\/api\/auth\/callback\/google/);
    assert.doesNotMatch(env, /NEXT_PUBLIC_GOOGLE/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
