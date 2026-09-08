import { ImageOff } from "lucide-react";
import ResilientImage from "@/components/easyt/resilient-image";
import type { RoutePhoto } from "./route-detail-presentation";
import styles from "./route-overview.module.css";

/** Only attributed canonical assets; an unavailable photo never becomes a different place. */
export default function RouteDetailPhoto({ photo, label, eager = false, landscape = false, className = "" }: {
  photo: RoutePhoto | null; label: string; eager?: boolean; landscape?: boolean; className?: string;
}) {
  return <figure className={`${styles.photo} ${className}`}>
    <ResilientImage key={photo?.key ?? label} src={photo?.variants[1]?.src}
      srcSet={photo?.variants.map(variant => `${variant.src} ${variant.width}w`).join(", ")}
      sizes={landscape ? "100vw" : "(max-width:700px) 100vw, (min-width:1700px) 700px, 50vw"}
      width={768} height={1024} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"}
      decoding="async" alt={photo?.alt ?? ""}
      fallback={<div className={styles.photoFallback}><ImageOff aria-hidden="true" /><span>{label}</span><small>Photography unavailable</small></div>} />
    {photo && <figcaption><a href={`/journey/immersive/credits.html#${photo.key}`} target="_blank" rel="noreferrer">{photo.author} · {photo.license}</a></figcaption>}
  </figure>;
}
