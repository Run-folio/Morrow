"use client";

import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { EasyTButton } from './easyt-controls';
import { MorroviaContentDialog } from './morrovia-feedback';
import styles from './trip-mobile-sheet.module.css';

/** Workspace composition of the existing modal; focus, Escape and Tab stay native. */
export function TripMobileSheet({ open, title, onClose, onReturnFocus, children }: {
  open: boolean; title: string; onClose: () => void; onReturnFocus?: () => void; children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const viewport = window.matchMedia('(min-width: 701px)');
    const closeOnDesktop = () => { if (viewport.matches) onClose(); };
    viewport.addEventListener('change', closeOnDesktop);
    return () => viewport.removeEventListener('change', closeOnDesktop);
  }, [open, onClose]);
  return <MorroviaContentDialog open={open} ariaLabel={title} className={styles.sheet} autoFocusSelector="[data-sheet-close]" onClose={onClose} onReturnFocus={onReturnFocus}>
    <div className={styles.body}>
      <header><h2>{title}</h2><EasyTButton data-sheet-close icon={X} iconOnly variant="quiet" aria-label={`Close ${title}`} onClick={onClose}>Close</EasyTButton></header>
      <div className={styles.content}>{children}</div>
    </div>
  </MorroviaContentDialog>;
}

export function useMobileTripWorkspace() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const update = () => setMobile(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}
