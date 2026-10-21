"use client";

import { useCallback, useEffect, useState } from "react";
import type { EasyTTrip, TripStop } from "./trip";

const MAX_SECONDS = 86_400;
const MAX_DESTINATIONS = 256;
// Browser-memory only: workspace unmounts do not reset a provider's deadline.
const deadlines = new Map<string, number>();
const listeners = new Set<() => void>();
// At capacity, unknown keys fail closed until the overflow deadline. Never
// evict a live destination and accidentally permit an early request.
let overflowUntil = 0;

export function activityCooldownKey(trip: Pick<EasyTTrip, "id" | "ownerId">, stop: TripStop | null | undefined) {
  return stop ? JSON.stringify([trip.ownerId, trip.id, stop.canonicalPlaceId ?? stop.id, stop.providerId,
    stop.name, stop.country, stop.latitude, stop.longitude]) : null;
}

export function activityRetryDeadline(status: number, header: string | null, now = Date.now()) {
  if (status < 400) return 0;
  const value = header?.trim();
  const numeric = value && /^\d+$/.test(value) ? Math.min(MAX_SECONDS, Number(value)) : NaN;
  const date = value && /^[a-z]{3,},?\s/i.test(value) ? Date.parse(value) : NaN;
  let seconds = Number.isFinite(numeric) ? numeric : Number.isFinite(date) ? (date - now) / 1000 : NaN;
  if (!Number.isFinite(seconds)) {
    if (status !== 429) return 0;
    seconds = 60;
  }
  return now + Math.min(MAX_SECONDS, Math.max(1, Math.ceil(seconds))) * 1000;
}

export function activityCooldownUntil(key: string | null, now = Date.now()) {
  for (const [entry, until] of deadlines) if (until <= now) deadlines.delete(entry);
  if (overflowUntil <= now) overflowUntil = 0;
  return key ? deadlines.get(key) ?? overflowUntil : 0;
}

function recordCooldown(key: string | null, status: number, header: string | null) {
  if (!key) return;
  const until = activityRetryDeadline(status, header);
  const prior = activityCooldownUntil(key);
  if (!until || until <= prior) return;
  if (!deadlines.has(key) && deadlines.size >= MAX_DESTINATIONS) {
    overflowUntil = Math.max(overflowUntil, until);
  } else deadlines.set(key, until);
  for (const listener of listeners) listener();
}

/** Expiry only updates presentation. Request effects must depend on the key,
 * never on coolingDown, and check isCoolingDown at their fetch boundary. */
export function useActivityClientCooldown(key: string | null) {
  const [, refresh] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      refresh(value => value + 1);
      const until = activityCooldownUntil(key);
      if (until > Date.now()) timer = setTimeout(update, until - Date.now());
    };
    listeners.add(update);
    update();
    return () => { listeners.delete(update); clearTimeout(timer); };
  }, [key]);
  const isCoolingDown = useCallback(() => activityCooldownUntil(key) > Date.now(), [key]);
  const recordResponse = useCallback((response: Pick<Response, "status" | "headers">) => {
    recordCooldown(key, response.status, response.headers.get("retry-after"));
  }, [key]);
  return { coolingDown: isCoolingDown(), isCoolingDown, recordResponse };
}
