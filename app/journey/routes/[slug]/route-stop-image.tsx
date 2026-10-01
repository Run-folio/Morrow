"use client";

import { useEffect, useRef, useState } from "react";
import { findRoutePhotos, readRoutePhoto, saveRoutePhoto, trackRoutePhoto, type CachedRoutePhoto } from "@/lib/easyt/route-photo-cache";
import { routeDestinationPhoto, routeImageCredit } from "@/lib/easyt/route-images";
import MorroviaPhotoCredit from "@/components/easyt/morrovia-photo-credit";
import styles from "./route-overview.module.css";

type RouteStopImageProps = { routeKey: string; stop: string; country: string; index: number; fallbackImage?: string };

/** A distinct image per base, cached independently from the attraction cards. */
export default function RouteStopImage({ routeKey, stop, country, index, fallbackImage }: RouteStopImageProps) {
  const canonicalImage = routeDestinationPhoto(stop, country)?.variants.at(-1)?.src;
  const canonicalPhoto = canonicalImage ? routeImageCredit(canonicalImage) : null;
  const subjectKey = stop.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || String(index);
  const cacheKey = `${routeKey}:stop:${subjectKey}`;
  const [photo, setPhoto] = useState<CachedRoutePhoto | null>(null);
  const [imageDisplayed, setImageDisplayed] = useState(false);
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
    if (canonicalImage || !shouldLoad) return;
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
  }, [cacheKey, country, shouldLoad, stop, canonicalImage]);

  const selectedPhoto = canonicalPhoto ?? photo;
  const displayedCredit = selectedPhoto ?? (fallbackImage ? routeImageCredit(fallbackImage) : null);
  const source = selectedPhoto?.src ?? fallbackImage;
  useEffect(() => {
    setImageDisplayed(false);
    if (!source) return;
    let active = true;
    const probe = new window.Image();
    probe.onload = () => { if (active) setImageDisplayed(true); };
    probe.onerror = () => { if (active) setImageDisplayed(false); };
    probe.src = source;
    return () => { active = false; };
  }, [source]);
  return <div ref={containerRef} className={`${styles.stopImage} ${source ? "" : styles.stopImagePending}`} style={source ? { backgroundImage: `url(${source})` } : undefined} role={source ? "img" : undefined} aria-label={source ? selectedPhoto?.alt ?? `${stop}, ${country}` : undefined}>
    {displayedCredit && imageDisplayed ? <MorroviaPhotoCredit ownership={"provenance" in displayedCredit && displayedCredit.provenance === "reviewed-morrovia-first-party" ? "morrovia" : "third-party"} photoLabel={displayedCredit.alt ?? `${stop}, ${country}`} credit={displayedCredit.sourceLabel} authorHref={"authorUrl" in displayedCredit ? displayedCredit.authorUrl : null} sourceHref={displayedCredit.sourceUrl} licenseHref={"licenseUrl" in displayedCredit ? displayedCredit.licenseUrl : null} fullCreditHref={"fullCreditUrl" in displayedCredit ? displayedCredit.fullCreditUrl : null} /> : null}
  </div>;
}
