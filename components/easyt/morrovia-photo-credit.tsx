import { Camera } from "lucide-react";
import styles from "./morrovia-photo-credit.module.css";

export type MorroviaPhotoCreditProps = {
  credit: string;
  photoLabel?: string;
  sourceHref?: string | null;
  licenseHref?: string | null;
  fullCreditHref?: string | null;
  placement?: "top-right" | "bottom-right" | "bottom-left";
  className?: string;
};

/** Canonical disclosure for attributed editorial and product photography. */
export default function MorroviaPhotoCredit({
  credit,
  photoLabel,
  sourceHref,
  licenseHref,
  fullCreditHref,
  placement = "bottom-right",
  className = "",
}: MorroviaPhotoCreditProps) {
  const external = (href: string) => /^https?:\/\//.test(href);
  const linkProps = (href: string) => external(href) ? { target: "_blank" as const, rel: "noreferrer" } : {};
  return <details className={`${styles.root} ${className}`} data-placement={placement}>
    <summary aria-label={photoLabel ? `Photo credit: ${photoLabel}` : "Photo credit"}><Camera aria-hidden="true" /></summary>
    <div className={styles.panel}>
      {sourceHref ? <a href={sourceHref} {...linkProps(sourceHref)}>{credit}</a> : <span>{credit}</span>}
      {licenseHref ? <a href={licenseHref} {...linkProps(licenseHref)}>Licence details</a> : null}
      {fullCreditHref && fullCreditHref !== sourceHref ? <a href={fullCreditHref} {...linkProps(fullCreditHref)}>Full image credits</a> : null}
    </div>
  </details>;
}
