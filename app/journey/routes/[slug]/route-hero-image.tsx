"use client";

import { useEffect, useState } from "react";
import styles from "./route-overview.module.css";

type RouteHeroImageProps = {
  image: string;
  query: string;
  eyebrow: string;
  duration: string;
};

type LiveImage = { src: string; sourceUrl: string; sourceLabel: string };

export default function RouteHeroImage({ image, query, eyebrow, duration }: RouteHeroImageProps) {
  const [liveImage, setLiveImage] = useState<LiveImage | null>(null);
  const [status, setStatus] = useState<"loading" | "unavailable">(image ? "unavailable" : "loading");

  useEffect(() => {
    if (image) return;
    const controller = new AbortController();
    void fetch(`/api/journey-route-image?query=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { image?: LiveImage | null };
        if (!response.ok || !payload.image) throw new Error("No route image available");
        setLiveImage(payload.image);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("unavailable");
      });
    return () => controller.abort();
  }, [image, query]);

  const source = liveImage?.src ?? image;
  return <div className={`${styles.heroImage} ${!source ? styles.heroImagePending : ""}`} style={source ? { backgroundImage: `url(${source})` } : undefined}>
    <div>
      <p>{eyebrow}</p>
      <span>{duration}</span>
      {!source && <small>{status === "loading" ? "Finding a photograph…" : "Photography unavailable"}</small>}
    </div>
    {liveImage && <a className={styles.heroImageCredit} href={liveImage.sourceUrl} target="_blank" rel="noreferrer">{liveImage.sourceLabel}</a>}
  </div>;
}
