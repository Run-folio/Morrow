import type { ReactNode } from "react";
import { MapPin, Utensils } from "lucide-react";
import ResilientImage from "./resilient-image";
import styles from "./itinerary-activity-identity.module.css";

type ItineraryActivityIdentityProps = {
  title: string;
  category: "restaurant" | "activity" | "other";
  meta?: string | null;
  image?: string;
  compact?: boolean;
  card?: boolean;
  format?: "recommendation" | "rail";
  mediaAction?: ReactNode;
  id?: string;
};

/** Shared identity used as a discovery suggestion becomes a planned activity. */
export default function ItineraryActivityIdentity({ title, category, meta, image, compact = false, card = false, format, mediaAction, id }: ItineraryActivityIdentityProps) {
  const Icon = category === "restaurant" ? Utensils : MapPin;
  const media = image ? <ResilientImage src={image} alt="" draggable={false} fallback={<Icon aria-hidden="true" />} /> : <Icon aria-hidden="true" />;
  return (
    <div className={`${styles.identity} ${compact ? styles.compact : ""} ${card ? styles.card : ""} ${format ? styles[format] : ""}`}>
      <span className={image || format === "rail" ? styles.media : styles.icon}>{media}{mediaAction}</span>
      <span className={styles.copy} id={id}>
        <strong>{title}</strong>
        {meta ? <small>{meta}</small> : null}
      </span>
    </div>
  );
}
