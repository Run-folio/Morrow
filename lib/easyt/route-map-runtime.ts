export type RouteMapFailureCategory = "provider-resource" | "runtime";

export type RouteMapFailure = {
  category: RouteMapFailureCategory;
  error: Error;
  eventType: string | null;
};

function recordValue(value: unknown, key: string) {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function eventTypeFor(value: unknown) {
  const type = recordValue(value, "type");
  return typeof type === "string" && type.trim() ? type.trim() : null;
}

/**
 * MapLibre may wrap a browser resource Event inside its own error event. Keep
 * that provider signal structured and ensure no raw Event reaches React/Next.
 */
export function normalizeRouteMapFailure(value: unknown): RouteMapFailure {
  const nested = recordValue(value, "error");
  const candidate = nested ?? value;
  if (candidate instanceof Error) {
    const providerResource = /failed to fetch|could not load|networkerror|load failed|ajaxerror|worker|source|tile/i.test(candidate.message);
    return {
      category: providerResource ? "provider-resource" : "runtime",
      error: candidate,
      eventType: eventTypeFor(value),
    };
  }

  const eventType = eventTypeFor(candidate) ?? eventTypeFor(value);
  if (eventType) {
    return {
      category: "provider-resource",
      error: new Error(`The route map provider reported a resource event (${eventType}).`),
      eventType,
    };
  }

  return {
    category: "runtime",
    error: new Error("The route map reported an unknown runtime failure."),
    eventType: null,
  };
}
