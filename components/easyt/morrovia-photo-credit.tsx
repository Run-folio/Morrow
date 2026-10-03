"use client";

import { Camera } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import styles from "./morrovia-photo-credit.module.css";
import { describePhotoAttribution } from "@/lib/easyt/photo-attribution";

export type MorroviaPhotoCreditProps = {
  language?: "en" | "es";
  credit: string;
  photoLabel?: string;
  authorLabel?: string;
  sourceLabel?: string;
  licenseLabel?: string;
  authorHref?: string | null;
  sourceHref?: string | null;
  licenseHref?: string | null;
  fullCreditHref?: string | null;
  placement?: "top-right" | "bottom-right" | "bottom-left";
  size?: "compact" | "default";
  /** Only verified asset-level ownership suppresses the control. */
  ownership?: "morrovia" | "third-party" | "unknown";
  className?: string;
};

/** Canonical, camera-only disclosure for attributed photography. */
export default function MorroviaPhotoCredit({
  language = "en",
  credit,
  photoLabel,
  authorLabel: structuredAuthorLabel,
  sourceLabel,
  licenseLabel,
  authorHref,
  sourceHref,
  licenseHref,
  fullCreditHref,
  placement = "bottom-left",
  size = "default",
  ownership = "unknown",
  className = "",
}: MorroviaPhotoCreditProps) {
  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ left: number; top: number; width: number } | null>(null);
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const attribution = describePhotoAttribution({ credit, authorHref, sourceHref, licenseHref });

  useEffect(() => setPortalReady(true), []);

  const positionPanel = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const anchor = trigger.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 24);
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
    const panelHeight = panel.getBoundingClientRect().height;
    const above = anchor.top - panelHeight - 8;
    const top = above >= 12
      ? above
      : Math.min(window.innerHeight - panelHeight - 12, anchor.bottom + 8);
    setPanelStyle({ left, top: Math.max(12, top), width });
  }, []);

  useLayoutEffect(() => {
    if (!open || !portalReady) return;
    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, portalReady, positionPanel]);

  if (ownership === "morrovia" || !attribution) return null;

  const external = (href: string) => /^https?:\/\//.test(href);
  const linkProps = (href: string) => external(href) ? { target: "_blank" as const, rel: "noopener noreferrer" } : {};
  const authorLabel = structuredAuthorLabel ?? (attribution.kind === "unsplash" ? attribution.photographer : attribution.credit || photoLabel);
  const ariaLabel = authorLabel
    ? `${language === "es" ? "Créditos de la foto" : "Photo credit"}: ${authorLabel}${attribution.kind === "unsplash" ? " on Unsplash" : ""}`
    : language === "es" ? "Créditos de la foto" : "Photo credit";
  const hasStructuredMetadata = Boolean(structuredAuthorLabel || sourceLabel || licenseLabel);
  const links = hasStructuredMetadata ? <>
      {structuredAuthorLabel ? <>{authorHref ? <a href={authorHref} {...linkProps(authorHref)}>Photo by {structuredAuthorLabel}</a> : <span>Photo by {structuredAuthorLabel}</span>}</> : null}
      {sourceLabel ? <>{sourceHref ? <a href={sourceHref} {...linkProps(sourceHref)}>{sourceLabel}</a> : <span>{sourceLabel}</span>}</> : null}
      {licenseLabel ? <>{licenseHref ? <a href={licenseHref} {...linkProps(licenseHref)}>{licenseLabel}</a> : <span>{licenseLabel}</span>}</> : null}
      {!licenseLabel && licenseHref ? <a href={licenseHref} {...linkProps(licenseHref)}>{language === "es" ? "Detalles de la licencia" : "Licence details"}</a> : null}
    </> : attribution.kind === "unsplash"
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

  const root = <div className={`${styles.root} ${size === "compact" ? styles.compact : ""} ${className}`} data-placement={placement}>
    {/* morrovia-ui-audit-allow-next-line native-control -- The disclosure is an icon-only, 44px camera target with its own popover semantics, not a styled action button. */}
    <button ref={triggerRef} type="button" className={styles.trigger} aria-label={ariaLabel} aria-expanded={open} aria-haspopup="dialog" aria-controls={popoverId} onClick={(event) => {
      event.stopPropagation();
      setOpen((current) => !current);
    }}>
      <Camera className={styles.cameraGlyph} aria-hidden="true" />
    </button>
  </div>;

  const portal = portalReady && open ? createPortal(<div ref={panelRef} id={popoverId} role="dialog" aria-label={language === "es" ? "Información de la foto" : "Photo information"} className={styles.panel} style={panelStyle ? { left: panelStyle.left, top: panelStyle.top, width: panelStyle.width } : { left: 12, top: 12, width: "min(280px, calc(100vw - 24px))" }} onClick={(event) => event.stopPropagation()}>
    {links}
    {fullCreditLink}
  </div>, document.body) : null;

  return <>{root}{portal}</>;
}
