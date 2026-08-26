export type RuntimeHealthState = "ok" | "unhealthy";

export type RuntimeHealthCheck = {
  state: RuntimeHealthState;
  checks: {
    database: "ok" | "missing" | "unreachable" | "not_checked";
    auth: "ok" | "missing";
    applicationUrl: "ok" | "missing" | "invalid" | "mismatch";
  };
};

type Environment = Record<string, string | undefined>;

function normalisedHttpUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/** Pure critical-config boundary: it never returns values, hosts, or secrets. */
export function runtimeHealthConfiguration(environment: Environment = process.env): Omit<RuntimeHealthCheck, "checks"> & { checks: Omit<RuntimeHealthCheck["checks"], "database"> } {
  const publicUrl = environment.NEXT_PUBLIC_APP_URL;
  const authUrl = environment.BETTER_AUTH_URL;
  const normalizedPublicUrl = normalisedHttpUrl(publicUrl);
  const normalizedAuthUrl = normalisedHttpUrl(authUrl);
  const applicationUrl = !publicUrl || !authUrl
    ? "missing"
    : !normalizedPublicUrl || !normalizedAuthUrl
      ? "invalid"
      : normalizedPublicUrl !== normalizedAuthUrl ? "mismatch" : "ok";
  const auth = environment.BETTER_AUTH_SECRET || environment.NEON_AUTH_COOKIE_SECRET ? "ok" : "missing";
  return { state: applicationUrl === "ok" && auth === "ok" ? "ok" : "unhealthy", checks: { auth, applicationUrl } };
}

export async function checkRuntimeHealth(environment: Environment, probeDatabase: () => Promise<void>): Promise<RuntimeHealthCheck> {
  const configuration = runtimeHealthConfiguration(environment);
  if (configuration.state !== "ok") return { state: "unhealthy", checks: { ...configuration.checks, database: environment.DATABASE_URL ? "not_checked" : "missing" } };
  if (!environment.DATABASE_URL) return { state: "unhealthy", checks: { ...configuration.checks, database: "missing" } };
  try {
    await probeDatabase();
    return { state: "ok", checks: { ...configuration.checks, database: "ok" } };
  } catch {
    return { state: "unhealthy", checks: { ...configuration.checks, database: "unreachable" } };
  }
}
