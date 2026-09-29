/** Request policy only. The Map workspace retains scoped results and selection ownership. */
export function googleNearbyRequestDecision(
  cachedStatus: "loading" | "ready" | "empty" | "unavailable" | undefined,
  lastAttemptedSequence: number | undefined,
  retrySequence: number,
): "fetch" | "reuse" {
  if (lastAttemptedSequence === undefined || retrySequence > lastAttemptedSequence) return "fetch";
  return cachedStatus === "loading" ? "fetch" : "reuse";
}

export type GooglePlaceFailureKind = "configuration" | "quota" | "offline" | "provider";
export function googlePlaceFailureKind(status?: number, offline = false): GooglePlaceFailureKind {
  if (offline) return "offline";
  if (status === 401 || status === 403) return "configuration";
  if (status === 429) return "quota";
  return "provider";
}
