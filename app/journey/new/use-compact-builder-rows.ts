"use client";

import {useLayoutEffect, type RefObject} from 'react';

/** Presentation only: match the selected compact-row hierarchy without clamping names. */
export function useCompactBuilderRows(rows: RefObject<Map<string, HTMLDivElement>>, identity: string) {
  useLayoutEffect(() => {
    let active = true;
    const mobile = window.matchMedia('(max-width: 700px)');
    const measure = () => {
      if (!active) return;
      for (const row of rows.current.values()) {
        row.removeAttribute('data-compact-stacked');
        if (!mobile.matches) continue;
        const title = row.querySelector<HTMLElement>('[data-builder-stop-name]');
        const nights = row.querySelector<HTMLElement>('[data-builder-nights]');
        if (!title || !nights) continue;
        const style = getComputedStyle(title);
        const line = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.25;
        const titleBox = title.getBoundingClientRect(), nightBox = nights.getBoundingClientRect();
        const review = row.querySelector('[data-builder-stop-review]');
        // Production can return an empty Fragment; an empty wrapper needs no extra space.
        const hasReview = Boolean(review?.textContent?.trim() || review?.querySelector('button, input, select, textarea, a, img, svg'));
        // Review controls/warnings get the full identity width rather than a narrow title column.
        if (titleBox.height > line * 2 + 1 || nightBox.left < titleBox.right + 4
          || hasReview) row.setAttribute('data-compact-stacked', 'true');
      }
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    // Reviews and night values can change while the 44px grip keeps row size fixed.
    // Observe content only: the layout attributes written above cannot trigger this observer.
    const content = typeof MutationObserver === 'undefined' ? null : new MutationObserver(measure);
    rows.current.forEach(row => { observer?.observe(row); content?.observe(row, {childList: true, subtree: true, characterData: true}); });
    window.addEventListener('resize', measure);
    mobile.addEventListener('change', measure);
    document.fonts?.ready.then(measure);
    return () => { active = false; observer?.disconnect(); content?.disconnect(); window.removeEventListener('resize', measure); mobile.removeEventListener('change', measure); };
  }, [rows, identity]);
}
