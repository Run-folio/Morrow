"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { BookingReadinessAction } from "@/lib/easyt/booking-readiness";
import { createAbortableEffectScope } from "@/lib/easyt/abortable-effect";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { tripIntentForTrip } from "@/lib/easyt/trip";
import { deriveTripPrepTasks } from "@/lib/easyt/trip-prep";
import { overviewPaidPreviewSurface, redactOverviewBookingLinks, redactOverviewReadinessLinks } from "@/lib/easyt/overview-paid-preview";
import { parseIsoDate } from "@/lib/easyt/trip-lifecycle";
import type { ReadinessCard } from "@/lib/easyt/travel-readiness";

export type TripPrepProviderStatus = "loading" | "available" | "unavailable";

type UseTripPrepReadinessInput = {
  trip: EasyTTrip;
  language?: "en" | "es";
  initialActions?: BookingReadinessAction[];
  initialReadinessCards?: ReadinessCard[];
  initialProviderStatus?: TripPrepProviderStatus;
  now?: string;
};

/**
 * Overview requests destination guidance only, without a traveller profile.
 */
export function useTripPrepReadiness({
  trip,
  language = "en",
  initialActions,
  initialReadinessCards,
  initialProviderStatus,
  now,
}: UseTripPrepReadinessInput) {
  const avoidDriving = tripIntentForTrip(trip).hardConstraints.avoidDriving;
  const [actions, setActions] = useState<BookingReadinessAction[]>(() => redactOverviewBookingLinks(initialActions ?? [], overviewPaidPreviewSurface));
  const [readinessCards, setReadinessCards] = useState<ReadinessCard[]>(() => redactOverviewReadinessLinks(initialReadinessCards ?? [], overviewPaidPreviewSurface));
  const [actionsStatus, setActionsStatus] = useState<TripPrepProviderStatus>(initialProviderStatus ?? (initialActions !== undefined ? "available" : "loading"));
  const [readinessStatus, setReadinessStatus] = useState<TripPrepProviderStatus>(initialProviderStatus ?? (initialReadinessCards !== undefined || !trip.stops.length ? "available" : "loading"));
  const [providerRetryVersion, setProviderRetryVersion] = useState(0);

  useEffect(() => {
    if (initialActions !== undefined || initialProviderStatus !== undefined) return;
    const scope = createAbortableEffectScope("Overview booking readiness request");
    setActionsStatus("loading");
    const resolve = async () => {
      try {
        const response = await fetch("/api/journey-booking-readiness", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trip, surface: overviewPaidPreviewSurface }),
          signal: scope.signal,
        });
        if (!response.ok) throw new Error("Booking readiness unavailable");
        const payload = await response.json() as { actions?: BookingReadinessAction[] };
        if (!Array.isArray(payload.actions)) throw new Error("Booking readiness response was incomplete");
        scope.commit(() => {
          setActions(redactOverviewBookingLinks(payload.actions ?? [], overviewPaidPreviewSurface));
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
          body: JSON.stringify({ countries: trip.stops.map((stop) => stop.country), startDate: trip.startDate, avoidDriving, language, surface: overviewPaidPreviewSurface }),
          signal: scope.signal,
        });
        if (!response.ok) throw new Error("Travel readiness unavailable");
        const payload = await response.json() as { cards?: ReadinessCard[] };
        if (!Array.isArray(payload.cards)) throw new Error("Travel readiness response was incomplete");
        scope.commit(() => {
          setReadinessCards(redactOverviewReadinessLinks(payload.cards ?? [], overviewPaidPreviewSurface));
          setReadinessStatus("available");
        });
      } catch (error) {
        if (!scope.isCancellation(error)) scope.commit(() => setReadinessStatus("unavailable"));
      }
    };
    void resolve();
    return scope.dispose;
  }, [avoidDriving, initialProviderStatus, initialReadinessCards, language, providerRetryVersion, trip.startDate, trip.stops]);

  const effectiveNow = useMemo(() => parseIsoDate(now) ?? new Date(), [now]);
  const tasks = useMemo(
    () => deriveTripPrepTasks({ trip, bookingActions: actions, readinessCards, now: effectiveNow }),
    [actions, effectiveNow, readinessCards, trip],
  );
  const retryProviders = useCallback(() => setProviderRetryVersion((current) => current + 1), []);
  const providersAvailable = actionsStatus === "available" && readinessStatus === "available";
  const providerUnavailable = actionsStatus === "unavailable" || readinessStatus === "unavailable";

  return {
    tasks,
    providersAvailable,
    providerUnavailable,
    retryProviders,
  };
}
