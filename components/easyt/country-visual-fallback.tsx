import { countryFor } from "@/lib/easyt/country-registry";
import styles from "./country-visual-fallback.module.css";

/** A place card can show its verified country without implying city photography. */
export default function CountryVisualFallback({ country }: { country?: string | null }) {
  const verified = countryFor(country);
  if (!verified) return <div className={styles.neutral} aria-hidden="true" />;
  return <div className={styles.flag} role="img" aria-label={`${verified.name} flag`}>
    <span className={styles.symbol} aria-hidden="true">{verified.flag}</span>
    <span className={styles.name}>{verified.name}</span>
  </div>;
}
