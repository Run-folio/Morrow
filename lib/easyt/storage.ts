import { EasyTTrip, isEasyTTrip } from "./trip";

export const EASYT_ACTIVE_TRIP_KEY = "easyt:active-trip:v1";
const LEGACY_JOURNEY_PLAN_KEY = "journey:planned-trip";

export function loadActiveTrip(): EasyTTrip | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(EASYT_ACTIVE_TRIP_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isEasyTTrip(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveActiveTrip(trip: EasyTTrip) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EASYT_ACTIVE_TRIP_KEY, JSON.stringify(trip));
}

export async function saveTripToEasyT(trip: EasyTTrip): Promise<EasyTTrip> {
  const response = await fetch("/api/easyt/trips", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(trip),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Morrovia cloud save failed.");
  }
  const payload = await response.json() as { trip: EasyTTrip };
  return payload.trip;
}

export async function loadTripFromEasyT(tripId: string): Promise<EasyTTrip | null> {
  const response = await fetch(`/api/easyt/trips/${encodeURIComponent(tripId)}`, { cache: "no-store" });
  if (response.status === 404 || response.status === 401) return null;
  if (!response.ok) throw new Error("Morrovia cloud load failed.");
  const payload = await response.json() as { trip: EasyTTrip };
  return isEasyTTrip(payload.trip) ? payload.trip : null;
}

/** @deprecated New Map Plans read the canonical EasyT document directly. */
export function saveJourneyPlanBridge(trip: EasyTTrip) {
  if (typeof window === "undefined") return;
  const duration = Math.max(1, Math.round((+new Date(`${trip.endDate}T00:00:00`) - +new Date(`${trip.startDate}T00:00:00`)) / 86400000) + 1);
  const pickDetails = Object.fromEntries(trip.stops.map((stop) => [
    stop.id,
    trip.planItems
      .filter((item) => item.stopId === stop.id && item.type === "activity")
      .map((item) => ({
        id: item.id,
        title: item.title,
        area: stop.name,
        type: "Activity",
        duration: "Flexible",
        description: item.reason,
        country: stop.country,
      })),
  ]));
  const brief = {
    origin: trip.brief.origin,
    destinations: trip.stops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      country: stop.country,
      coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] : undefined,
      kind: "place",
    })),
    startDate: trip.startDate,
    duration: String(duration),
    travellers: String(trip.travellers),
    interests: [],
    picks: trip.brief.selectedPlaces,
    pickDetails,
  };
  window.localStorage.setItem(LEGACY_JOURNEY_PLAN_KEY, JSON.stringify({ brief }));
}

export function clearActiveTrip() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(EASYT_ACTIVE_TRIP_KEY);
}
