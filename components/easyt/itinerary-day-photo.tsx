"use client";

import { useCallback, useState } from "react";
import { MapPin } from "lucide-react";
import { routePhotoForSource } from "@/lib/easyt/route-images";
import type { OverviewPlaceImage } from "@/lib/easyt/trip-overview-imagery";
import ResilientImage from "./resilient-image";
import MorroviaPhotoCredit from "./morrovia-photo-credit";
import styles from "./itinerary-day-photo.module.css";

/** Non-blocking presentation of reviewed destination photography, never a new lookup. */
export default function ItineraryDayPhoto({ image, destination, language = "en", compact = false, className = "" }: {
  image: OverviewPlaceImage | null;
  destination: string;
  language?: "en" | "es";
  compact?: boolean;
  className?: string;
}) {
  const [displayedSource, setDisplayedSource] = useState<string | null>(null);
  const record = image ? routePhotoForSource(image.src) : null;
  const variants = record ? [...record.variants].sort((a, b) => a.width - b.width) : [];
  const source = variants.find(variant => variant.width >= (compact ? 320 : 768)) ?? variants.at(-1);
  const renderedSource = image ? source?.src ?? image.src : null;
  const onDisplayState = useCallback((displayed: boolean) => setDisplayedSource(displayed ? renderedSource : null), [renderedSource]);
  const fallback = <span className={styles.fallback} role="img" aria-label={`${language === "es" ? "Foto no disponible" : "Photo unavailable"} · ${destination}`}><MapPin aria-hidden="true" /><span>{destination}</span></span>;
  return <div className={`${styles.photo} ${compact ? styles.compact : ""} ${className}`} data-itinerary-photo={compact ? "calendar" : "day"}>
    <ResilientImage
      src={renderedSource}
      srcSet={variants.length > 1 ? variants.map(variant => `${variant.src} ${variant.width}w`).join(", ") : undefined}
      sizes={compact ? "(max-width: 1099px) 12vw, 9vw" : "(max-width: 760px) calc(100vw - 48px), (max-width: 1099px) 70vw, 380px"}
      width={source?.width ?? 768}
      height={source?.height ?? 512}
      alt={image?.alt ?? ""}
      loading="lazy"
      decoding="async"
      fallback={fallback}
      onDisplayState={onDisplayState}
    />
    {image?.sourceLabel && displayedSource === renderedSource ? <MorroviaPhotoCredit
      size="compact"
      language={language}
      credit={image.sourceLabel}
      photoLabel={image.alt}
      authorHref={image.authorUrl}
      sourceHref={image.sourceUrl}
      licenseHref={image.licenseUrl}
      fullCreditHref={image.fullCreditUrl}
    /> : null}
  </div>;
}
