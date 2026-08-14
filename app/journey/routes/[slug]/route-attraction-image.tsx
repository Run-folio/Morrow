"use client";

import { useEffect, useState } from "react";
import { findRoutePhotos, readRoutePhoto, saveRoutePhoto, trackRoutePhoto, type CachedRoutePhoto } from "@/lib/easyt/route-photo-cache";
import styles from "./route-overview.module.css";

type RouteAttractionImageProps = { routeKey: string; attraction: string; stop: string; country: string; index: number };

export default function RouteAttractionImage({ routeKey, attraction, stop, country, index }: RouteAttractionImageProps) {
  const cacheKey = `${routeKey}:attraction:${index}`;
  const [photo, setPhoto] = useState<CachedRoutePhoto | null>(null);
  useEffect(() => {
    const cached = readRoutePhoto(cacheKey);
    if (cached) { setPhoto(cached); return; }
    const controller = new AbortController();
    void findRoutePhotos([`${attraction} ${country}`, `${stop} ${country} travel`], controller.signal).then(({ candidates }) => {
      const selected = candidates[0];
      if (!selected) return;
      setPhoto(selected); saveRoutePhoto(cacheKey, selected); trackRoutePhoto(selected);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [attraction, cacheKey, country, stop]);
  return <div className={`${styles.attractionImage} ${photo ? "" : styles.attractionImagePending}`} style={photo ? { backgroundImage: `url(${photo.src})` } : undefined}>
    {photo && <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.sourceLabel}</a>}
  </div>;
}
