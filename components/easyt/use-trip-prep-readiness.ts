"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { BookingReadinessAction } from "@/lib/easyt/booking-readiness";
import { createAbortableEffectScope } from "@/lib/easyt/abortable-effect";
import { travelReadinessStorageKey } from "@/lib/easyt/private-browser-context";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { tripIntentForTrip } from "@/lib/easyt/trip";
import { deriveTripPrepTasks } from "@/lib/easyt/trip-prep";
import { parseIsoDate } from "@/lib/easyt/trip-lifecycle";
import {
  defaultTravelReadinessProfile,
  type ReadinessCard,
  type TravelReadinessProfile,
} from "@/lib/easyt/travel-readiness";

export type TripPrepProviderStatus = "loading" | "available" | "unavailable";

type UseTripPrepReadinessInput = {
  trip: EasyTTrip;
  language?: "en" | "es";
  initialActions?: BookingReadinessAction[];
  initialReadinessCards?: ReadinessCard[];
  initialProfile?: TravelReadinessProfile;
  initialProviderStatus?: TripPrepProviderStatus;
  now?: string;
};

/**
 * Canonical client lifecycle for Overview readiness. Provider and traveller
 * profile state stay in one projection instead of being re-derived by each
 * preparation section.
 */
export function useTripPrepReadiness({
  trip,
  language = "en",
  initialActions,
  initialReadinessCards,
  initialProfile,
  initialProviderStatus,
  now,
}: UseTripPrepReadinessInput) {
  const avoidDriving = tripIntentForTrip(trip).hardConstraints.avoidDriving;
  const [profile, setProfile] = useState<TravelReadinessProfile>(initialProfile ?? defaultTravelReadinessProfile);
  const [actions, setActions] = useState<BookingReadinessAction[]>(initialActions ?? []);
  const [readinessCards, setReadinessCards] = useState<ReadinessCard[]>(initialReadinessCards ?? []);
  const [actionsStatus, setActionsStatus] = useState<TripPrepProviderStatus>(initialProviderStatus ?? (initialActions !== undefined ? "available" : "loading"));
  const [readinessStatus, setReadinessStatus] = useState<TripPrepProviderStatus>(initialProviderStatus ?? (initialReadinessCards !== undefined || !trip.stops.length ? "available" : "loading"));
  const [providerRetryVersion, setProviderRetryVersion] = useState(0);

  useEffect(() => {
    if (initialProfile) {
      setProfile(initialProfile);
      return;
    }
    try {
      const stored = JSON.parse(window.localStorage.getItem(travelReadinessStorageKey(trip.ownerId)) ?? "null") as Partial<TravelReadinessProfile> | null;
      if (stored && Array.isArray(stored.nationalities)) setProfile({
        nationalities: stored.nationalities.filter((country): country is string => typeof country === "string"),
        residenceCountry: typeof stored.residenceCountry === "string" ? stored.residenceCountry : "",
        passportExpiryMonth: typeof stored.passportExpiryMonth === "string" ? stored.passportExpiryMonth : "",
      });
    } catch { /* Use the existing privacy-safe empty profile. */ }
  }, [initialProfile, trip.ownerId]);

  useEffect(() => {
    if (initialActions !== undefined || initialProviderStatus !== undefined) return;
    const scope = createAbortableEffectScope("Overview booking readiness request");
    setActionsStatus("loading");
    const resolve = async () => {
      try {
        const response = await fetch("/api/journey-booking-readiness", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trip }),
          signal: scope.signal,
        });
        if (!response.ok) throw new Error("Booking readiness unavailable");
        const payload = await response.json() as { actions?: BookingReadinessAction[] };
        if (!Array.isArray(payload.actions)) throw new Error("Booking readiness response was incomplete");
        scope.commit(() => {
          setActions(payload.actions ?? []);
          setActionsStatus("available");
        });
      } catch (error) {
        if (!scope.isCancellation(error)) scope.commit(() => setActionsStatus("unavailable"));
      }
    };
    void resolve();
    return scope.dispose;
  }, [initialActions, initialProviderStatus, providerRetryVersion, trip]);

  useEffect(() => {
    if (initialReadinessCards !== undefined || initialProviderStatus !== undefined) return;
    if (!trip.stops.length) {
      setReadinessCards([]);
      setReadinessStatus("available");
      return;
    }
    const scope = createAbortableEffectScope("Overview travel readiness request");
    setReadinessStatus("loading");
    const resolve = async () => {
      try {
        const response = await fetch("/api/journey-readiness", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ countries: trip.stops.map((stop) => stop.country), startDate: trip.startDate, avoidDriving, profile, language }),
          signal: scope.signal,
        });
        if (!response.ok) throw new Error("Travel readiness unavailable");
        const payload = await response.json() as { cards?: ReadinessCard[] };
        if (!Array.isArray(payload.cards)) throw new Error("Travel readiness response was incomplete");
        scope.commit(() => {
          setReadinessCards(payload.cards ?? []);
          setReadinessStatus("available");
        });
      } catch (error) {
        if (!scope.isCancellation(error)) scope.commit(() => setReadinessStatus("unavailable"));
      }
    };
    void resolve();
    return scope.dispose;
  }, [avoidDriving, initialProviderStatus, initialReadinessCards, language, profile, providerRetryVersion, trip.startDate, trip.stops]);

  const effectiveNow = useMemo(() => parseIsoDate(now) ?? new Date(), [now]);
  const tasks = useMemo(
    () => deriveTripPrepTasks({ trip, profile, bookingActions: actions, readinessCards, now: effectiveNow }),
    [actions, effectiveNow, profile, readinessCards, trip],
  );
  const retryProviders = useCallback(() => setProviderRetryVersion((current) => current + 1), []);
  const providersAvailable = actionsStatus === "available" && readinessStatus === "available";
  const providerUnavailable = actionsStatus === "unavailable" || readinessStatus === "unavailable";

  return {
    profile,
    setProfile,
    tasks,
    providersAvailable,
    providerUnavailable,
    retryProviders,
  };
}
