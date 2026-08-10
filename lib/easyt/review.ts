import type { EasyTTrip, TripChange, TripRecommendation } from "./trip";

const recommendation = (
  trip: EasyTTrip,
  input: Omit<TripRecommendation, "id" | "status" | "checkedAt">,
  index: number,
): TripRecommendation => ({
  ...input,
  id: `${trip.id}-review-${index + 1}-${input.rule}`,
  status: "open",
  checkedAt: new Date().toISOString(),
});

/**
 * Conservative, explainable checks for the saved-trip review surface.
 * These are planning signals, not live timetable, visa, or booking claims.
 */
export function reviewTrip(trip: EasyTTrip): TripRecommendation[] {
  const results: TripRecommendation[] = [];
  const longLeg = trip.legs
    .map((leg) => ({ leg, minutes: leg.durationMinutes ?? 0 }))
    .filter(({ leg, minutes }) => leg.mode === "road" && minutes >= 300)
    .sort((a, b) => b.minutes - a.minutes)[0];

  if (longLeg) {
    const affectedDays = trip.planItems
      .filter((item) => item.type === "arrival" || item.type === "transport")
      .filter((item) => item.stopId === longLeg.leg.toStopId)
      .map((item) => item.dayNumber);
    results.push(recommendation(trip, {
      rule: "driving-load",
      severity: longLeg.minutes >= 420 ? "critical" : "warning",
      message: `${Math.floor(longLeg.minutes / 60)}h ${longLeg.minutes % 60}m of estimated road travel may dominate this transfer day.`,
      evidence: `${longLeg.leg.provider ?? "Planning estimate"}; ${longLeg.leg.distanceKm ? `${longLeg.leg.distanceKm.toLocaleString()} km` : "distance not confirmed"}.`,
      affectedDays,
      confidence: "high",
      proposedChange: { action: "add-stopover-or-compare-rail", legId: longLeg.leg.id },
    }, results.length));
  }

  const oneNightStops = trip.stops.filter((stop) => stop.nights === 1);
  if (oneNightStops.length >= 3 || (trip.brief.pace === "slow" && oneNightStops.length >= 2)) {
    results.push(recommendation(trip, {
      rule: "trip-pace",
      severity: oneNightStops.length >= 4 ? "warning" : "info",
      message: `${oneNightStops.length} stops are currently one-night stays, which leaves little recovery time between transfers.`,
      evidence: oneNightStops.map((stop) => stop.name).join(", "),
      affectedDays: trip.planItems.filter((item) => oneNightStops.some((stop) => stop.id === item.stopId)).map((item) => item.dayNumber),
      confidence: "high",
      proposedChange: { action: "suggest-extra-night", stopIds: oneNightStops.map((stop) => stop.id) },
    }, results.length));
  }

  const unestimatedLeg = trip.legs.find((leg) => leg.durationMinutes === null || leg.distanceKm === null);
  if (unestimatedLeg) {
    results.push(recommendation(trip, {
      rule: "missing-logistics",
      severity: "info",
      message: "At least one connection still needs a confirmed route estimate before the plan is travel-ready.",
      evidence: unestimatedLeg.provider ?? "No distance or duration is stored for this leg.",
      affectedDays: trip.planItems.filter((item) => item.stopId === unestimatedLeg.toStopId).map((item) => item.dayNumber),
      confidence: "high",
      proposedChange: { action: "resolve-leg", legId: unestimatedLeg.id },
    }, results.length));
  }

  const unknownLeg = trip.legs.find((leg) => leg.mode === "unknown");
  if (unknownLeg) {
    const destination = trip.stops.find((stop) => stop.id === unknownLeg.toStopId)?.name ?? "the next stop";
    results.push(recommendation(trip, {
      rule: "connection-confidence",
      severity: "info",
      message: `The connection into ${destination} still needs a travel mode before EasyT can judge the day realistically.`,
      evidence: "No rail, road, ferry or flight mode has been confirmed for this leg.",
      affectedDays: trip.planItems.filter((item) => item.stopId === unknownLeg.toStopId).map((item) => item.dayNumber),
      confidence: "high",
      proposedChange: { action: "resolve-leg", legId: unknownLeg.id },
    }, results.length));
  }

  const transportDays = new Set(trip.planItems.filter((item) => item.type === "transport" || item.type === "arrival").map((item) => item.dayNumber));
  const consecutiveTransfers = [...transportDays].some((day) => transportDays.has(day + 1));
  if (consecutiveTransfers) {
    results.push(recommendation(trip, {
      rule: "recovery-time",
      severity: trip.brief.pace === "slow" ? "warning" : "info",
      message: "Two travel-heavy days sit back to back, leaving little room to arrive, recover and explore.",
      evidence: "EasyT found consecutive arrival or transport days in the current plan.",
      affectedDays: [...transportDays].sort((a, b) => a - b),
      confidence: "medium",
      proposedChange: { action: "suggest-extra-night", stopIds: trip.stops.filter((stop) => stop.nights === 1).map((stop) => stop.id) },
    }, results.length));
  }

  const plannedDays = trip.planItems.length;
  const totalDays = Math.max(1, Math.round((+new Date(`${trip.endDate}T00:00:00`) - +new Date(`${trip.startDate}T00:00:00`)) / 86400000) + 1);
  if (plannedDays < totalDays) {
    results.push(recommendation(trip, {
      rule: "plan-coverage",
      severity: "warning",
      message: `${totalDays - plannedDays} day${totalDays - plannedDays === 1 ? " is" : "s are"} not represented in the day-by-day plan.`,
      evidence: `${plannedDays} planned day${plannedDays === 1 ? "" : "s"} across a ${totalDays}-day trip.`,
      affectedDays: [],
      confidence: "high",
      proposedChange: { action: "add-open-days", count: totalDays - plannedDays },
    }, results.length));
  }

  const openDays = trip.planItems.filter((item) => item.type === "open").length;
  if (trip.brief.pace === "slow" && totalDays >= 5 && openDays === 0) {
    results.push(recommendation(trip, {
      rule: "flex-space",
      severity: "info",
      message: "This slow-paced trip has no deliberately open day or half-day to absorb weather, delays or a place worth lingering in.",
      evidence: `${totalDays} scheduled days and no open planning day currently recorded.`,
      affectedDays: [],
      confidence: "medium",
      proposedChange: { action: "add-open-days", count: 1 },
    }, results.length));
  }

  return results;
}

export function recommendationImpact(item: TripRecommendation) {
  const action = item.proposedChange?.action;
  if (action === "add-open-days") return "Adds open planning days so the day-by-day plan covers the full trip.";
  if (action === "suggest-extra-night") return "Flags the affected stops for an extra night; no bookings are changed automatically.";
  if (action === "add-stopover-or-compare-rail") return "Marks the transfer for a stopover or rail comparison; the route remains unchanged until you choose one.";
  if (action === "resolve-leg") return "Keeps the route in place while recording that this connection needs a confirmed estimate.";
  return "Records your decision without changing booked items.";
}

export function applyRecommendation(trip: EasyTTrip, recommendationId: string): EasyTTrip {
  const recommendation = trip.recommendations.find((item) => item.id === recommendationId) ?? reviewTrip(trip).find((item) => item.id === recommendationId);
  if (!recommendation) return trip;
  let nextItems = trip.planItems;
  let summary = recommendationImpact(recommendation);
  if (recommendation.proposedChange?.action === "add-open-days") {
    const count = Number(recommendation.proposedChange.count) || 0;
    const lastDay = trip.planItems.reduce((max, item) => Math.max(max, item.dayNumber), 0);
    const stopId = trip.stops[trip.stops.length - 1]?.id ?? "unassigned";
    const additions = Array.from({ length: count }, (_, index) => {
      const dayNumber = lastDay + index + 1;
      const date = new Date(`${trip.startDate}T00:00:00`);
      date.setDate(date.getDate() + dayNumber - 1);
      return { id: `${trip.id}-review-open-${dayNumber}`, stopId, dayNumber, date: date.toISOString().slice(0, 10), type: "open" as const, title: "Open planning day", reason: "Added by Plan Review to cover the full trip without inventing bookings.", notes: ["Keep this day flexible until the route is confirmed."], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null };
    });
    nextItems = [...trip.planItems, ...additions];
    summary = `Added ${count} open planning day${count === 1 ? "" : "s"}.`;
  }
  const change: TripChange = { id: `${recommendation.id}-${Date.now()}`, recommendationId: recommendation.id, action: "apply", summary, changedAt: new Date().toISOString() };
  const recommendations = trip.recommendations.some((item) => item.id === recommendation.id)
    ? trip.recommendations.map((item) => item.id === recommendation.id ? { ...item, status: "applied" as const } : item)
    : [...trip.recommendations, { ...recommendation, status: "applied" as const }];
  return { ...trip, planItems: nextItems, recommendations, changeHistory: [...(trip.changeHistory ?? []), change], updatedAt: new Date().toISOString() };
}

export function undoRecommendation(trip: EasyTTrip, recommendationId: string): EasyTTrip {
  const recommendation = trip.recommendations.find((item) => item.id === recommendationId);
  if (!recommendation) return trip;
  const planItems = recommendation.proposedChange?.action === "add-open-days" ? trip.planItems.filter((item) => !item.id.startsWith(`${trip.id}-review-open-`)) : trip.planItems;
  const change: TripChange = { id: `${recommendationId}-${Date.now()}`, recommendationId, action: "undo", summary: "Reopened this recommendation; no booked items were changed.", changedAt: new Date().toISOString() };
  return { ...trip, planItems, recommendations: trip.recommendations.map((item) => item.id === recommendationId ? { ...item, status: "open" } : item), changeHistory: [...(trip.changeHistory ?? []), change], updatedAt: new Date().toISOString() };
}
