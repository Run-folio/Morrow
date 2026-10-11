"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { dashboardTripCoverCandidate, dashboardTripPhotosForCards, dashboardPhotoFromResolved, dashboardPhotoAssetIdentity, type DashboardTripPhoto } from "@/lib/easyt/dashboard-trip-image";
import { discardFailedRoutePhoto, resolveDistinctRoutePhotoCandidates } from "@/lib/easyt/route-photo-cache";

/** Cover selection is presentation state; saved traveller content is never rewritten. */
export function useDashboardTripPhotos(trips: readonly EasyTTrip[]) {
  const [resolved, setResolved] = useState<Record<string, DashboardTripPhoto>>({});
  const resolvedRef = useRef<Record<string, DashboardTripPhoto>>({});
  const [failed, setFailed] = useState<Record<string, string[]>>({});
  const initial = useMemo(() => {
    const photos = dashboardTripPhotosForCards(trips);
    for (const trip of trips) {
      const photo = photos.get(trip.id);
      if (photo && failed[trip.id]?.includes(photo.src)) photos.delete(trip.id);
    }
    return photos;
  }, [trips, failed]);
  const candidates = useMemo(() => trips.flatMap(trip => {
    if (trip.status === "draft" || initial.has(trip.id) || (failed[trip.id]?.length ?? 0) >= 3) return [];
    const candidate = dashboardTripCoverCandidate(trip, failed[trip.id]);
    return candidate ? [candidate] : [];
  }), [trips, initial, failed]);

  useEffect(() => {
    const pending = candidates.filter(candidate => !resolvedRef.current[candidate.cacheKey]);
    if (!pending.length) return;
    const retained = candidates.flatMap(candidate => {
      const photo = resolvedRef.current[candidate.cacheKey];
      return photo ? [photo] : [];
    });
    const controller = new AbortController();
    void resolveDistinctRoutePhotoCandidates(pending, (candidate, selection) => {
      if (selection.kind === "empty") delete resolvedRef.current[candidate.cacheKey];
      else resolvedRef.current[candidate.cacheKey] = dashboardPhotoFromResolved(selection.photo, candidate.place);
      setResolved(current => {
        const next = { ...current };
        if (selection.kind === "empty") delete next[candidate.cacheKey];
        else next[candidate.cacheKey] = dashboardPhotoFromResolved(selection.photo, candidate.place);
        return next;
      });
    }, { signal: controller.signal, reservedSources: [...initial.values(), ...retained].flatMap(photo => [photo.src, dashboardPhotoAssetIdentity(photo), ...(photo.creditHref ? [photo.creditHref] : [])]) });
    return () => controller.abort();
  }, [candidates, initial]);

  const photos = useMemo(() => {
    const next = new Map(initial);
    for (const candidate of candidates) {
      const photo = resolved[candidate.cacheKey];
      const tripId = candidate.occurrenceIds[0];
      if (photo && tripId && !failed[tripId]?.includes(photo.src)) next.set(tripId, photo);
    }
    return next;
  }, [initial, candidates, resolved, failed]);
  const markFailed = useCallback((trip: EasyTTrip, src: string) => {
    const candidate = dashboardTripCoverCandidate(trip);
    if (candidate) {
      discardFailedRoutePhoto(candidate.cacheKey, src);
      if (resolvedRef.current[candidate.cacheKey]?.src === src) delete resolvedRef.current[candidate.cacheKey];
    }
    setFailed(current => ({ ...current, [trip.id]: [...new Set([...(current[trip.id] ?? []), src])] }));
  }, []);
  return { photos, markFailed };
}
