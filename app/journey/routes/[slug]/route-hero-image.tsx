"use client";

import { useEffect, useState } from "react";
import { findRoutePhotos, readRoutePhoto, saveRoutePhoto, trackRoutePhoto, type CachedRoutePhoto } from "@/lib/easyt/route-photo-cache";
import { routeImageCredit } from "@/lib/easyt/route-images";
import MorroviaPhotoCredit from "@/components/easyt/morrovia-photo-credit";
import styles from "./route-overview.module.css";

type RouteHeroImageProps = {
  image: string;
  routeKey: string;
  query: string;
  fallbackQueries: string[];
  eyebrow: string;
  duration: string;
  alt: string;
};

export default function RouteHeroImage({ image, routeKey, query, fallbackQueries, eyebrow, duration, alt }: RouteHeroImageProps) {
  const [liveImage, setLiveImage] = useState<CachedRoutePhoto | null>(null);
  const [status, setStatus] = useState<"loading" | "unavailable">(image ? "unavailable" : "loading");

  useEffect(() => {
    if (image) return;
    const cached = readRoutePhoto(routeKey);
    if (cached) { setLiveImage(cached); return; }
    const controller = new AbortController();
    void findRoutePhotos([query, ...fallbackQueries], controller.signal)
      .then(({ candidates }) => {
        const photo = candidates[0];
        if (!photo) throw new Error("No route image available");
        setLiveImage(photo);
        saveRoutePhoto(routeKey, photo);
        trackRoutePhoto(photo);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("unavailable");
      });
    return () => controller.abort();
  }, [fallbackQueries, image, query, routeKey]);

  const source = liveImage?.src ?? image;
  const credit = liveImage ?? routeImageCredit(image);
  return <div className={`${styles.heroImage} ${!source ? styles.heroImagePending : ""}`} style={source ? { backgroundImage: `url(${source})` } : undefined} role={source ? "img" : undefined} aria-label={source ? liveImage?.alt ?? alt : undefined}>
    <div>
      <p>{eyebrow}</p>
      <span>{duration}</span>
      {!source && <small>{status === "loading" ? "Finding a photograph…" : "Photography unavailable"}</small>}
    </div>
    {credit ? <MorroviaPhotoCredit photoLabel={credit.alt ?? alt} credit={credit.sourceLabel} sourceHref={credit.sourceUrl} licenseHref={"licenseUrl" in credit ? credit.licenseUrl : null} fullCreditHref={"fullCreditUrl" in credit ? credit.fullCreditUrl : null} /> : null}
  </div>;
}
