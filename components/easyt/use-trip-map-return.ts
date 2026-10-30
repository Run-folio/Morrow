"use client";

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { isTripMapPathname, mapWorkspaceReturnHref } from '@/lib/easyt/trip-workspace-links';

type MapReturn = { href: string; sourceHref: string; top: number; left: number; triggerId: string; triggerHref: string | null; entered: boolean };

/** Ephemeral navigation state only. The existing expanded map owns its UI and exit. */
export function useTripMapReturn(tripId: string, ownerId: string | null | undefined) {
  const pathname = usePathname();
  const snapshot = useRef<MapReturn | null>(null);
  const frame = useRef(0);
  const scope = `${tripId}:${ownerId ?? ''}`;
  const previousScope = useRef(scope);
  if (previousScope.current !== scope) { previousScope.current = scope; snapshot.current = null; }
  const rememberMapReturn = useCallback((trigger: Element | null) => {
    const currentHref = window.location.pathname + window.location.search + window.location.hash;
    const target = trigger?.closest('a');
    const requestedReturn = target ? new URL(target.href).searchParams.get('returnTo') : null;
    const href = requestedReturn ? mapWorkspaceReturnHref(tripId, requestedReturn) : currentHref;
    if (isTripMapPathname(window.location.pathname, tripId) || mapWorkspaceReturnHref(tripId, currentHref) !== currentHref) return;
    snapshot.current = { href, sourceHref: currentHref, top: window.scrollY, left: window.scrollX, triggerId: trigger?.id ?? '', triggerHref: trigger?.closest('a')?.getAttribute('href') ?? null, entered: false };
  }, [tripId]);
  const restoreMapReturn = useCallback(() => {
    const saved = snapshot.current;
    if (!saved?.entered || ![saved.href, saved.sourceHref].includes(window.location.pathname + window.location.search + window.location.hash)) return;
    window.cancelAnimationFrame(frame.current);
    let attempts = 0;
    const restore = () => {
      if (snapshot.current !== saved || ![saved.href, saved.sourceHref].includes(window.location.pathname + window.location.search + window.location.hash)) return;
      // A route can commit its loading boundary before its content has enough height.
      if (++attempts < 120 && (attempts < 3 || document.documentElement.scrollHeight - window.innerHeight < saved.top)) {
        frame.current = window.requestAnimationFrame(restore); return;
      }
      const trigger = saved.triggerId ? document.getElementById(saved.triggerId)
        : Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).find(a => a.getAttribute('href') === saved.triggerHref);
      trigger?.focus({ preventScroll: true });
      window.scrollTo({ top: saved.top, left: saved.left, behavior: 'instant' });
      saved.entered = false;
    };
    frame.current = window.requestAnimationFrame(restore);
  }, []);
  useEffect(() => {
    const captureLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (anchor && anchor.origin === window.location.origin && isTripMapPathname(anchor.pathname, tripId) && (!anchor.target || anchor.target === '_self')) rememberMapReturn(anchor);
    };
    document.addEventListener('click', captureLink, true);
    return () => { document.removeEventListener('click', captureLink, true); window.cancelAnimationFrame(frame.current); };
  }, [rememberMapReturn, tripId]);
  useEffect(() => {
    window.cancelAnimationFrame(frame.current);
    if (isTripMapPathname(pathname, tripId)) { if (snapshot.current) snapshot.current.entered = true; }
    else if (snapshot.current?.href.split(/[?#]/)[0] === pathname) restoreMapReturn();
    else snapshot.current = null;
  }, [pathname, scope, tripId, restoreMapReturn]);
  return { rememberMapReturn, restoreMapReturn };
}
