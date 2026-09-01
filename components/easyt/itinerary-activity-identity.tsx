import { MapPin, Utensils } from "lucide-react";
import ResilientImage from "./resilient-image";
import styles from "./itinerary-activity-identity.module.css";

type ItineraryActivityIdentityProps = {
  title: string;
  category: "restaurant" | "activity" | "other";
  meta?: string | null;
  image?: string;
  compact?: boolean;
};

/** Shared identity used as a discovery suggestion becomes a planned activity. */
export default function ItineraryActivityIdentity({ title, category, meta, image, compact = false }: ItineraryActivityIdentityProps) {
  const Icon = category === "restaurant" ? Utensils : MapPin;
  return (
    <div className={`${styles.identity} ${compact ? styles.compact : ""}`}>
      {image ? <span className={styles.media}><ResilientImage src={image} alt="" fallback={<Icon aria-hidden="true" />} /></span> : <span className={styles.icon}><Icon aria-hidden="true" /></span>}
      <span className={styles.copy}>
        <strong>{title}</strong>
        {meta ? <small>{meta}</small> : null}
      </span>
    </div>
  );
}
