"use client";

import { useEffect, useRef, useState } from 'react';
import { createAsyncBuilderEditSession, type AsyncBuilderEditSession, type AsyncBuilderEditSessionOptions } from '@/lib/easyt/trip-builder-async-edit-session';
import type { BuilderEditSessionSnapshot } from '@/lib/easyt/trip-builder-edit-session';

/** One hydrated scope owns one awaited session; acknowledged CAS timestamps never remount it. */
export function useBuilderEditSession(options: AsyncBuilderEditSessionOptions | null, hydrationKey: string,
  onInitializationError?: (cause: unknown) => void) {
  const scope = options ? JSON.stringify([hydrationKey, options.initialRecovery?.ownerId ?? options.getOwnerId(), options.initialTrip.id]) : null;
  const current = useRef({ options, scope, onInitializationError });
  current.current = { options, scope, onInitializationError };
  const [mounted, setMounted] = useState<{ scope: string; session: AsyncBuilderEditSession; snapshot: BuilderEditSessionSnapshot } | null>(null);
  useEffect(() => {
    const initial = current.current.options;
    if (!initial || scope === null) return;
    let active = true, session: AsyncBuilderEditSession | null = null, unsubscribe: (() => void) | null = null;
    const isCurrent = () => active && current.current.scope === scope && Boolean(current.current.options);
    const getOptions = () => {
      if (!isCurrent() || !current.current.options) throw new Error('Builder hydration scope expired');
      return current.current.options;
    };
    const detachedOwner = initial.getOwnerId() === null ? 'detached-builder' : null;
    void createAsyncBuilderEditSession({ ...initial,
      getOwnerId: () => isCurrent() ? getOptions().getOwnerId() : detachedOwner,
      readDraft: (trip, ownerId) => getOptions().readDraft(trip, ownerId),
      writeDraft: (trip, draft, ownerId, guard) => getOptions().writeDraft(trip, draft, ownerId,
        { isCurrent: () => isCurrent() && (guard?.isCurrent() ?? true) }),
      saveRecovery: (trip, recoveryOptions) => getOptions().saveRecovery(trip,
        { ...recoveryOptions, isCurrent: () => isCurrent() && recoveryOptions.isCurrent() }),
      acknowledgeRecovery: (reviewed, canonical, handle, guard) => getOptions().acknowledgeRecovery(reviewed, canonical, handle,
        { isCurrent: () => isCurrent() && (guard?.isCurrent() ?? true) }),
      markRecoveryState: (handle, state) => getOptions().markRecoveryState?.(handle, state) ?? false,
      persistAccount: (trip, handle) => getOptions().persistAccount(trip, handle),
      reconcile: (request, signal) => getOptions().reconcile(request, signal),
      now: () => getOptions().now(),
      schedule: (callback, delay) => getOptions().schedule(callback, delay),
    }).then(created => {
      if (!isCurrent()) { created.dispose(); return; }
      session = created;
      const publish = () => { if (isCurrent()) setMounted({ scope, session: created, snapshot: created.getSnapshot() }); };
      unsubscribe = created.subscribe(publish); publish();
    }).catch(cause => { if (isCurrent()) current.current.onInitializationError?.(cause); });
    return () => { active = false; unsubscribe?.(); session?.dispose(); };
  }, [scope]);
  return mounted?.scope === scope ? mounted : null;
}
