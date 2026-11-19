"use client";

import { useEffect, useState } from 'react';
import {
  advanceBuilderNotice, builderNoticeSuppressed, expireBuilderNotice, startBuilderNotice,
  type BuilderNoticeInput, type BuilderNoticeKind,
} from './builder-success-notice';

export function useBuilderSuccessNotice(input: BuilderNoticeInput): BuilderNoticeKind | null {
  const { scopeKey, save, route, saveKey, routeKey, blocked, undoActive } = input;
  const [state, setState] = useState(() => startBuilderNotice(input));

  useEffect(() => {
    const now = Date.now();
    setState(previous => advanceBuilderNotice(previous, { scopeKey, save, route, saveKey, routeKey, blocked, undoActive }, now));
  }, [scopeKey, save, route, saveKey, routeKey, blocked, undoActive]);

  const { notice } = state;
  useEffect(() => {
    if (!notice) return;
    let timer: number;
    const clearWhenDue = () => {
      const now = Date.now();
      if (now < notice.expiresAt) timer = window.setTimeout(clearWhenDue, notice.expiresAt - now);
      else setState(previous => expireBuilderNotice(previous, notice, now));
    };
    timer = window.setTimeout(clearWhenDue, Math.max(0, notice.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [notice]);

  return state.scopeKey === scopeKey && !builderNoticeSuppressed(input) ? notice?.kind ?? null : null;
}
