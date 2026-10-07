"use client";

import { useEffect, useRef, useState } from 'react';
import { createBuilderEditSession, type BuilderEditSession, type BuilderEditSessionOptions,
  type BuilderEditSessionSnapshot } from '@/lib/easyt/trip-builder-edit-session';

/** One hydrated scope owns one session; acknowledged CAS timestamps never remount it. */
export function useBuilderEditSession(options: BuilderEditSessionOptions | null, hydrationKey: string) {
  const scope = options ? JSON.stringify([hydrationKey, options.initialRecovery?.ownerId ?? options.initialTrip.ownerId, options.initialTrip.id]) : null;
  const current = useRef({ options, scope });
  current.current = { options, scope };
  const [mounted, setMounted] = useState<{ scope: string; session: BuilderEditSession; snapshot: BuilderEditSessionSnapshot } | null>(null);
  useEffect(() => {
    const initial = current.current.options;
    if (!initial || scope === null) return;
    const getOptions = () => {
      if (current.current.scope !== scope || !current.current.options) throw new Error('Builder hydration scope expired');
      return current.current.options;
    };
    const session = createBuilderEditSession({ ...initial,
      getOwnerId: () => current.current.scope === scope && current.current.options
        ? current.current.options.getOwnerId() : initial.initialTrip.ownerId === null ? 'detached-builder' : null,
      readDraft: (trip, ownerId) => getOptions().readDraft(trip, ownerId),
      writeDraft: (trip, draft, ownerId) => getOptions().writeDraft(trip, draft, ownerId),
      saveRecovery: (trip, recoveryOptions) => getOptions().saveRecovery(trip, recoveryOptions),
      acknowledgeRecovery: (reviewed, canonical, handle) => getOptions().acknowledgeRecovery(reviewed, canonical, handle),
      markRecoveryState: (handle, state) => getOptions().markRecoveryState?.(handle, state) ?? false,
      persistAccount: (trip, handle) => getOptions().persistAccount(trip, handle),
      reconcile: (request, signal) => getOptions().reconcile(request, signal),
      now: () => getOptions().now(),
      schedule: (callback, delay) => getOptions().schedule(callback, delay),
    });
    const publish = () => setMounted({ scope, session, snapshot: session.getSnapshot() });
    const unsubscribe = session.subscribe(publish);
    publish();
    return () => { unsubscribe(); session.dispose(); };
  }, [scope]);
  return mounted?.scope === scope ? mounted : null;
}
