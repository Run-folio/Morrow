"use client";

import { Compass } from "lucide-react";
import ResilientImage from "@/components/easyt/resilient-image";
import type { DiscoveryImage, DiscoveryRoute } from "@/lib/easyt/discovery-catalogue";
import styles from "./discover.module.css";

export default function DiscoveryPhoto({ route, image = route.image, priority = false, sizes = "(max-width:700px) 100vw, 55vw", className = "", unavailable = false }: {
  route: DiscoveryRoute; image?: DiscoveryImage | null; priority?: boolean; sizes?: string; className?: string; unavailable?: boolean;
}) {
  const source = unavailable ? null : image?.variants.at(-1)?.src;
  const fallback = <div className={styles.fallback}><Compass aria-hidden="true" /><strong>{route.countries.join(" → ")}</strong><span>{route.stops.map((stop) => stop.name).join(" → ")}</span><small>Photography pending editorial review</small></div>;
  return <div className={`${styles.photoShell} ${className}`}>
    <ResilientImage key={source ?? route.key} src={source} fallback={fallback} className={styles.photo}
      srcSet={image?.variants.map((variant) => `${variant.src} ${variant.width}w`).join(", ")} sizes={sizes}
      width={image?.variants.at(-1)?.width ?? 768} height={image?.variants.at(-1)?.height ?? 512}
      alt={image?.alt ?? ""} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" />
    {source && <a className={styles.photoCredit} href={image?.sourceUrl} target="_blank" rel="noreferrer">{image?.credit}</a>}
  </div>;
}
