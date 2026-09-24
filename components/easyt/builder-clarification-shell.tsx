"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { EasyTButton } from "./easyt-controls";
import styles from "./builder-clarification-dialog.module.css";

/** One modal owner for legacy recovery and the adaptive Discovery step slot. */
export function BuilderClarificationShell({ open, itemKey, progress, title, description, closeLabel, onDismiss, children, footer, afterFooter, discovery = false, loading = false }: {
  open: boolean;
  itemKey: string;
  progress?: string;
  title: string;
  description: string;
  closeLabel: string;
  onDismiss: () => void;
  children: ReactNode;
  footer?: ReactNode;
  afterFooter?: ReactNode;
  discovery?: boolean;
  loading?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dismissRef = useRef(onDismiss);
  const loadingRef = useRef(loading);
  dismissRef.current = onDismiss;
  loadingRef.current = loading;

  useEffect(() => {
    if (!open) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])];
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (!loadingRef.current) dismissRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => titleRef.current?.focus());
  }, [itemKey, open]);

  if (!open) return null;
  return <div className={`${styles.overlay}${discovery ? ` ${styles.discoveryOverlay}` : ""}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onDismiss(); }}>
    <section ref={dialogRef} className={`${styles.dialog}${discovery ? ` ${styles.discoveryDialog}` : ""}`}
      role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
      data-builder-clarification-ui="true" onMouseDown={(event) => event.stopPropagation()}>
      <header className={styles.header}>
        {progress ? <p aria-live="polite">{progress}</p> : null}
        <EasyTButton icon={X} iconOnly variant="quiet" size="small" disabled={loading} onClick={onDismiss}>{closeLabel}</EasyTButton>
        <h2 ref={titleRef} id={titleId} tabIndex={-1}>{title}</h2>
        <span id={descriptionId}>{description}</span>
      </header>
      <div className={styles.body}>{children}</div>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      {afterFooter}
    </section>
  </div>;
}
