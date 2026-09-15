export type RuntimeHealthState = "ok" | "unhealthy";

export type RuntimeHealthCheck = {
  state: RuntimeHealthState;
  checks: {
    database: "ok" | "missing" | "unreachable" | "not_checked";
    auth: "ok" | "missing";
    applicationUrl: "ok" | "missing" | "invalid" | "mismatch";
  };
  deployment: {
    commit: string;
    context: "production" | "deploy-preview" | "branch-deploy" | "dev" | "preview" | "development" | "unknown";
  };
};

type Environment = Record<string, string | undefined>;

const commitShaPattern = /^[0-9a-f]{40}$/i;
const deploymentContexts = new Set<RuntimeHealthCheck["deployment"]["context"]>([
  "production",
  "deploy-preview",
  "branch-deploy",
  "dev",
  "preview",
  "development",
]);

/** Bounded build provenance only: raw hosting metadata is never returned. */
export function runtimeDeploymentProvenance(environment: Environment = process.env): RuntimeHealthCheck["deployment"] {
  const commit = [environment.MORROVIA_BUILD_COMMIT, environment.COMMIT_REF, environment.VERCEL_GIT_COMMIT_SHA]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value && commitShaPattern.test(value)))
    ?.toLowerCase() ?? "unknown";
  const contextValue = [environment.MORROVIA_BUILD_CONTEXT, environment.CONTEXT, environment.VERCEL_ENV]
    .map((value) => value?.trim().toLowerCase())
    .find((value): value is RuntimeHealthCheck["deployment"]["context"] => Boolean(value && deploymentContexts.has(value as RuntimeHealthCheck["deployment"]["context"])))
    ?? "unknown";
  return { commit, context: contextValue };
}

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
export function runtimeHealthConfiguration(environment: Environment = process.env): Pick<RuntimeHealthCheck, "state"> & { checks: Omit<RuntimeHealthCheck["checks"], "database"> } {
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
  const deployment = runtimeDeploymentProvenance(environment);
  if (configuration.state !== "ok") return { state: "unhealthy", checks: { ...configuration.checks, database: environment.DATABASE_URL ? "not_checked" : "missing" }, deployment };
  if (!environment.DATABASE_URL) return { state: "unhealthy", checks: { ...configuration.checks, database: "missing" }, deployment };
  try {
    await probeDatabase();
    return { state: "ok", checks: { ...configuration.checks, database: "ok" }, deployment };
  } catch {
    return { state: "unhealthy", checks: { ...configuration.checks, database: "unreachable" }, deployment };
  }
}
