"use client";

import { Camera } from "lucide-react";
import styles from "./morrovia-photo-credit.module.css";
import { describePhotoAttribution } from "@/lib/easyt/photo-attribution";

export type MorroviaPhotoCreditProps = {
  language?: "en" | "es";
  credit: string;
  photoLabel?: string;
  authorHref?: string | null;
  sourceHref?: string | null;
  licenseHref?: string | null;
  fullCreditHref?: string | null;
  placement?: "top-right" | "bottom-right" | "bottom-left";
  presentation?: "camera" | "inline";
  className?: string;
};

/** Canonical disclosure for attributed editorial and product photography. */
export default function MorroviaPhotoCredit({
  language = "en",
  credit,
  photoLabel,
  authorHref,
  sourceHref,
  licenseHref,
  fullCreditHref,
  placement = "bottom-left",
  presentation = "camera",
  className = "",
}: MorroviaPhotoCreditProps) {
  const external = (href: string) => /^https?:\/\//.test(href);
  const linkProps = (href: string) => external(href) ? { target: "_blank" as const, rel: "noopener noreferrer" } : {};
  const attribution = describePhotoAttribution({ credit, authorHref, sourceHref, licenseHref });
  if (!attribution) return null;
  const authorLabel = attribution.kind === "unsplash" ? attribution.photographer : attribution.credit || photoLabel;
  const ariaLabel = authorLabel
    ? `${language === "es" ? "Créditos de la foto" : "Photo credit"}: ${authorLabel}${attribution.kind === "unsplash" ? " on Unsplash" : ""}`
    : language === "es" ? "Créditos de la foto" : "Photo credit";
  const links = attribution.kind === "unsplash"
    ? <>
      <a href={attribution.photographerHref} {...linkProps(attribution.photographerHref)}>{language === "es" ? `Foto de ${attribution.photographer}` : `Photo by ${attribution.photographer}`}</a>
      <span>{language === "es" ? "en" : "on"}</span>
      <a href={attribution.sourceHref} {...linkProps(attribution.sourceHref)}>{attribution.sourceLabel}</a>
      {attribution.licenseHref ? <a href={attribution.licenseHref} {...linkProps(attribution.licenseHref)}>{language === "es" ? "Detalles de la licencia" : "Licence details"}</a> : null}
    </>
    : <>
      <a href={attribution.sourceHref} {...linkProps(attribution.sourceHref)}>{attribution.credit}</a>
      {attribution.licenseHref ? <a href={attribution.licenseHref} {...linkProps(attribution.licenseHref)}>{language === "es" ? "Detalles de la licencia" : "Licence details"}</a> : null}
    </>;
  const fullCreditLink = fullCreditHref && fullCreditHref !== sourceHref
    ? <a href={fullCreditHref} {...linkProps(fullCreditHref)}>{language === "es" ? "Créditos completos" : "Full image credits"}</a>
    : null;

  if (presentation === "inline") {
    return <span className={`${styles.inline} ${className}`} aria-label={ariaLabel}>
      {links}
      {fullCreditLink}
    </span>;
  }

  return <details className={`${styles.root} ${className}`} data-placement={placement} onClick={(event) => event.stopPropagation()} onBlur={(event) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    event.currentTarget.open = false;
  }} onKeyDown={(event) => {
    if (event.key !== "Escape" || !event.currentTarget.open) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.open = false;
    event.currentTarget.querySelector("summary")?.focus();
  }}>
    <summary aria-label={ariaLabel}><Camera aria-hidden="true" /></summary>
    <div className={styles.panel} aria-label={language === "es" ? "Información de la foto" : "Photo information"}>
      {links}
      {fullCreditLink}
    </div>
  </details>;
}
