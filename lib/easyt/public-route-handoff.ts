import type { PublicRoutePlanDraft } from "./public-route.ts";
import { mergeStructuredTripBrief } from "./structured-trip-brief.ts";

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Serializable handoff into the existing Builder draft boundary. */
export function routePlannerPayload(draft: PublicRoutePlanDraft, start = new Date()) {
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(0, draft.durationDays - 1));
  const startDate = localIsoDate(start);
  const endDate = localIsoDate(end);
  return {
    sourceRouteKey: draft.routeKey,
    origin: draft.origin,
    originCoordinates: draft.originCoordinates,
    destinations: draft.destinations,
    routeHints: draft.routeHints,
    regions: [] as string[],
    countries: draft.countries,
    startDate,
    endDate,
    datesExplicit: false,
    interests: draft.interests,
    brief: `${draft.routeTitle}.`,
    decisionSelections: { routeOrder: "entered" as const, transportByLeg: {} },
    structuredBrief: mergeStructuredTripBrief(draft.structuredBrief, {
      dates: { start: startDate, end: endDate, fixed: false },
    }),
    nightAllocations: draft.nightAllocations,
  };
}
