"use client";

import { useEffect, useState } from "react";
import { findRoutePhotos, readRoutePhoto, saveRoutePhoto, trackRoutePhoto, type CachedRoutePhoto } from "@/lib/easyt/route-photo-cache";
import styles from "./route-overview.module.css";

type RouteStopImageProps = { routeKey: string; stop: string; country: string; index: number };

/** A distinct image per base, cached independently from the attraction cards. */
export default function RouteStopImage({ routeKey, stop, country, index }: RouteStopImageProps) {
  const cacheKey = `${routeKey}:stop:${index}`;
  const [photo, setPhoto] = useState<CachedRoutePhoto | null>(null);

  useEffect(() => {
    const cached = readRoutePhoto(cacheKey);
    if (cached) { setPhoto(cached); return; }
    const controller = new AbortController();
    void findRoutePhotos([`${stop} ${country} travel`, `${stop} ${country} landmark`], controller.signal)
      .then(({ candidates }) => {
        const selected = candidates[0];
        if (!selected) return;
        setPhoto(selected);
        saveRoutePhoto(cacheKey, selected);
        trackRoutePhoto(selected);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [cacheKey, country, stop]);

  return <div className={`${styles.stopImage} ${photo ? "" : styles.stopImagePending}`} style={photo ? { backgroundImage: `url(${photo.src})` } : undefined}>
    {photo && <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.sourceLabel}</a>}
  </div>;
}
