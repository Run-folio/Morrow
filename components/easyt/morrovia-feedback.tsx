"use client";

import { AlertCircle, Check, Cloud, HardDrive, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, type FocusEvent, type ReactNode } from "react";
import { EasyTButton } from "./easyt-controls";
import styles from "./morrovia-feedback.module.css";

export type MorroviaSaveState = "idle" | "device" | "saving" | "saved" | "error";

const saveCopy: Record<MorroviaSaveState, string> = {
  idle: "No changes to save",
  device: "Changes saved on this device",
  saving: "Saving to your account…",
  saved: "Saved to your account",
  error: "Couldn't save to your account",
};

export function MorroviaSaveStatus({
  label,
  state,
}: {
  label?: string;
  state: MorroviaSaveState;
}) {
  const Icon = state === "saved" ? Cloud : state === "device" ? HardDrive : state === "saving" ? LoaderCircle : state === "error" ? AlertCircle : Check;
  return (
    <span
      className={styles.saveStatus}
      data-state={state}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy={state === "saving" || undefined}
    >
      <Icon aria-hidden="true" />
      {label ?? saveCopy[state]}
    </span>
  );
}

export function MorroviaBriefNotice({
  action,
  autoDismissMs,
  detail,
  onDismiss,
  title,
}: {
  action?: ReactNode;
  autoDismissMs?: number;
  detail?: string;
  onDismiss?: () => void;
  title: string;
}) {
  const timerRef = useRef<number | null>(null);
  const remainingRef = useRef(autoDismissMs ?? 0);
  const startedAtRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const resumeTimer = useCallback(() => {
    if (!onDismiss || !autoDismissMs || action || remainingRef.current <= 0) return;
    clearTimer();
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(onDismiss, remainingRef.current);
  }, [action, autoDismissMs, clearTimer, onDismiss]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current === null) return;
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
    clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    remainingRef.current = autoDismissMs ?? 0;
    resumeTimer();
    return clearTimer;
  }, [autoDismissMs, clearTimer, resumeTimer]);

  const resumeAfterFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resumeTimer();
  };

  return (
    <div
      className={styles.briefNotice}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      onFocusCapture={pauseTimer}
      onBlurCapture={resumeAfterFocus}
    >
      <Check aria-hidden="true" />
      <div><strong>{title}</strong>{detail ? <span>{detail}</span> : null}</div>
      {action}
      {onDismiss ? <button className={styles.dismiss} type="button" onClick={onDismiss} aria-label={`Dismiss ${title}`}><X aria-hidden="true" /></button> : null}
    </div>
  );
}

export function MorroviaRecoveryFeedback({
  actions,
  detail,
  onRetry,
  retryLabel = "Try again",
  safety,
  title,
}: {
  actions?: ReactNode;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  safety: string;
  title: string;
}) {
  return (
    <div className={styles.recovery} role="alert" aria-atomic="true">
      <AlertCircle aria-hidden="true" />
      <div><strong>{title}</strong>{detail ? <span>{detail}</span> : null}<p>{safety}</p></div>
      {actions ? <div className={styles.recoveryActions}>{actions}</div> : onRetry ? <EasyTButton icon={RotateCcw} variant="secondary" onClick={onRetry}>{retryLabel}</EasyTButton> : null}
    </div>
  );
}

export function MorroviaConfirmationDialog({
  cancelLabel = "Cancel",
  confirmLabel,
  confirming = false,
  consequences,
  detail,
  eyebrow = "PLEASE CONFIRM",
  error,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  cancelLabel?: string;
  confirmLabel: string;
  confirming?: boolean;
  consequences: string[];
  detail: string;
  eyebrow?: string;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const detailId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      window.requestAnimationFrame(() => cancelRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={detailId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}
      onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <div className={styles.dialogMark}><AlertCircle aria-hidden="true" /></div>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 id={titleId}>{title}</h2>
      <p id={detailId} className={styles.dialogDetail}>{detail}</p>
      <ul>{consequences.map((consequence) => <li key={consequence}>{consequence}</li>)}</ul>
      {error ? <p className={styles.dialogError} role="alert">{error}</p> : null}
      <div className={styles.dialogActions}>
        <EasyTButton ref={cancelRef} variant="secondary" disabled={confirming} onClick={onCancel}>{cancelLabel}</EasyTButton>
        <EasyTButton variant="danger" loading={confirming} onClick={onConfirm}>{confirmLabel}</EasyTButton>
      </div>
    </dialog>
  );
}
