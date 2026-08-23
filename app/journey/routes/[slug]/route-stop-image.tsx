"use client";

import { useEffect, useRef, useState } from "react";
import { findRoutePhotos, readRoutePhoto, saveRoutePhoto, trackRoutePhoto, type CachedRoutePhoto } from "@/lib/easyt/route-photo-cache";
import styles from "./route-overview.module.css";

type RouteStopImageProps = { routeKey: string; stop: string; country: string; index: number; fallbackImage?: string };

/** A distinct image per base, cached independently from the attraction cards. */
export default function RouteStopImage({ routeKey, stop, country, index, fallbackImage }: RouteStopImageProps) {
  const subjectKey = stop.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || String(index);
  const cacheKey = `${routeKey}:stop:${subjectKey}`;
  const [photo, setPhoto] = useState<CachedRoutePhoto | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !("IntersectionObserver" in window)) { setShouldLoad(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "360px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad) return;
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
  }, [cacheKey, country, shouldLoad, stop]);

  const source = photo?.src ?? fallbackImage;
  return <div ref={containerRef} className={`${styles.stopImage} ${source ? "" : styles.stopImagePending}`} style={source ? { backgroundImage: `url(${source})` } : undefined} role={source ? "img" : undefined} aria-label={source ? photo?.alt ?? `${stop}, ${country}` : undefined}>
    {photo && <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.sourceLabel}</a>}
  </div>;
}
