"use client";

import { useEffect, useRef, useState } from "react";
import { findRoutePhotos, readRoutePhoto, saveRoutePhoto, trackRoutePhoto, type CachedRoutePhoto } from "@/lib/easyt/route-photo-cache";
import styles from "./route-overview.module.css";

type RouteAttractionImageProps = { routeKey: string; attraction: string; stop?: string; country: string; index: number; fallbackImage?: string };

export default function RouteAttractionImage({ routeKey, attraction, stop, country, index, fallbackImage }: RouteAttractionImageProps) {
  const subjectKey = attraction.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || String(index);
  const cacheKey = `${routeKey}:attraction:${subjectKey}`;
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
    void findRoutePhotos([`${attraction} ${country}`, stop ? `${stop} ${country} travel` : ""], controller.signal).then(({ candidates }) => {
      const selected = candidates[0];
      if (!selected) return;
      setPhoto(selected); saveRoutePhoto(cacheKey, selected); trackRoutePhoto(selected);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [attraction, cacheKey, country, shouldLoad, stop]);
  const source = photo?.src ?? fallbackImage;
  return <div ref={containerRef} className={`${styles.attractionImage} ${source ? "" : styles.attractionImagePending}`} style={source ? { backgroundImage: `url(${source})` } : undefined} role={source ? "img" : undefined} aria-label={source ? photo?.alt ?? attraction : undefined}>
    {photo && <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.sourceLabel}</a>}
  </div>;
}
