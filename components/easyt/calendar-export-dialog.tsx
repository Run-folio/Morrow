'use client';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { EasyTButton, EasyTSelect } from './easyt-controls';
import { MorroviaContentDialog } from './morrovia-feedback';
import styles from './morrovia-feedback.module.css';
import { calendarExportCanSend, calendarExportErrorCopy, calendarExportCanManage, calendarExportDateLabel } from '@/lib/easyt/calendar-export-view';
import type { CalendarExportItem } from '@/lib/easyt/calendar-export';
import type { CalendarExportReview, CalendarExportRunResult, ExportOperation } from '@/lib/easyt/calendar-export-sync';
type Status = {
    configured: boolean;
    savedRevision: string;
    eligibleCount: number;
    events: CalendarExportItem[];
    excluded: {
        sourceKey: string;
        reason: string;
    }[];
    blocked: {
        sourceKey: string;
        reason: string;
    }[];
    grants: {
        id: string;
        label: string;
        connected: boolean;
        canExisting: boolean;
        canCreate: boolean;
    }[];
    bindings: {
        id: string;
        grantId: string;
        calendarId: string;
        label: string;
    }[];
    hasPreviousSend: boolean;
};
type Destination = {
    id: string;
    label: string;
};
export function CalendarExportReviewList({ operations, selected, onSelection, disabled = false }: {
    disabled?: boolean;
    operations: Pick<ExportOperation, 'id' | 'sourceKey' | 'action' | 'payload'>[];
    selected: string[];
    onSelection: (ids: string[]) => void;
}) {
    const group = (remove: boolean) => operations.filter(o => (o.action === 'remove') === remove);
    const section = (remove: boolean) => group(remove).length ? <section className={styles.dialogFields} aria-label={remove ? 'Remove from Google' : 'Date only — times not set'}><h3>{remove ? 'Remove from Google' : 'Date only — times not set'}</h3>{remove ? <p>Keep in Google unless selected below.</p> : null}{group(remove).map(o => <label key={o.id}><input type="checkbox" disabled={disabled} checked={selected.includes(o.id)} onChange={e => onSelection(e.target.checked ? [...selected, o.id] : selected.filter(id => id !== o.id))}/>{' '}{o.action === 'update' ? 'Update: ' : o.action === 'remove' ? 'Remove: ' : ''}{o.payload.summary} · {calendarExportDateLabel(o.payload.start.date, o.payload.end.date)}</label>)}</section> : null;
    return <>{section(false)}{section(true)}</>;
}
export function CalendarExportAction({ tripId, ownerId, savedRevision, settled }: {
    tripId: string;
    ownerId: string | null;
    savedRevision: string;
    settled: boolean;
}) {
    const [open, setOpen] = useState(false), [previous, setPrevious] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const close = () => { setOpen(false); window.requestAnimationFrame(() => triggerRef.current?.focus()); };
    useEffect(() => {
        const url = new URL(window.location.href);
        if (url.searchParams.get('calendarExport') === 'connected') {
            setOpen(true);
            url.searchParams.delete('calendarExport');
            window.history.replaceState(window.history.state, '', url);
        }
    }, []);
    return <><EasyTButton ref={triggerRef} size="small" variant="secondary" disabled={!ownerId || !settled} title={!ownerId || !settled ? 'Save your trip to your account first' : undefined} onClick={() => setOpen(true)}>{previous ? 'Send changes' : 'Add to calendar'}</EasyTButton>{open ? <CalendarExportDialog key={`${ownerId}:${tripId}`} tripId={tripId} ownerId={ownerId ?? ''} savedRevision={savedRevision} settled={settled} onClose={close} onPrevious={setPrevious}/> : null}</>;
}
export function CalendarExportDialog({ tripId, ownerId, savedRevision, settled, onClose, onPrevious = () => { } }: {
    tripId: string;
    ownerId: string;
    savedRevision: string;
    settled: boolean;
    onClose: () => void;
    onPrevious?: (value: boolean) => void;
}) {
    const [status, setStatus] = useState<Status | null>(null), [grantId, setGrantId] = useState(''), [calendarId, setCalendarId] = useState(''), [destinations, setDestinations] = useState<Destination[]>([]), [review, setReview] = useState<CalendarExportReview | null>(null), [bindingId, setBindingId] = useState(''), [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<CalendarExportRunResult | null>(null);
    const epoch = useRef(0), key = useRef('');
    const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
    const resultSummaryRef = useRef<HTMLParagraphElement>(null);
    useEffect(() => { if (result)
        resultSummaryRef.current?.focus(); }, [result]);
    useEffect(() => { if (review)
        reviewHeadingRef.current?.focus(); }, [review?.id]);
    // Safari's native Tab preference can skip buttons and leave a dynamic stage.
    // Keep the event-review form's ordered controls in the shared modal owner.
    const cycleStageFocus = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Tab' || event.defaultPrevented)
            return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])')).filter(element => element.getClientRects().length > 0);
        if (!controls.length)
            return;
        const active = document.activeElement;
        const index = controls.indexOf(active as HTMLElement);
        const relative = index < 0 ? controls.filter(element => Boolean((active?.compareDocumentPosition(element) ?? 0) & (event.shiftKey ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING))) : [];
        const target = index >= 0 ? controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length] : event.shiftKey ? (relative.at(-1) ?? controls.at(-1)) : (relative[0] ?? controls[0]);
        event.preventDefault();
        event.stopPropagation();
        target?.focus();
    };
    const endpoint = `/api/easyt/trips/${encodeURIComponent(tripId)}/calendar-export`;
    const grant = status?.grants.find(g => g.id === grantId), newCalendar = calendarId === '__new__';
    const api = async (path: string, body?: Record<string, unknown>, scope = epoch.current) => {
        const response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), 'x-morrovia-expected-owner': ownerId }, ...(body ? { body: JSON.stringify(body) } : {}) });
        const data = await response.json();
        if (scope !== epoch.current)
            throw Error('STALE_CONTEXT');
        if (!response.ok)
            throw Error(data.code ?? 'UNAVAILABLE');
        return data;
    };
    const run = async (work: (scope: number) => Promise<void>) => {
        const scope = epoch.current;
        setBusy(true);
        setError('');
        try {
            await work(scope);
        }
        catch (e) {
            if (scope === epoch.current)
                setError(calendarExportErrorCopy(e instanceof Error ? e.message : 'UNAVAILABLE'));
        }
        finally {
            if (scope === epoch.current)
                setBusy(false);
        }
    };
    useEffect(() => {
        const scope = ++epoch.current;
        setReview(null);
        setResult(null);
        setStatus(null);
        setBusy(true);
        setError('');
        void api(endpoint, undefined, scope).then((data: Status) => {
            setStatus(data);
            onPrevious(Boolean(data.hasPreviousSend));
            if (data.configured) {
                if (data.savedRevision !== savedRevision)
                    throw Error('STALE_REVIEW');
                const url = new URL(window.location.href), preferred = url.searchParams.get('calendarExportGrant') ?? data.bindings[0]?.grantId;
                const g = data.grants.find(x => x.id === preferred) ?? data.grants.find(x => x.connected) ?? data.grants[0];
                setGrantId(g?.id ?? '');
                if (url.searchParams.has('calendarExportGrant')) {
                    url.searchParams.delete('calendarExportGrant');
                    window.history.replaceState(window.history.state, '', url);
                }
            }
            else
                setError(calendarExportErrorCopy('NOT_CONFIGURED'));
        }).catch(e => {
            if (scope === epoch.current)
                setError(calendarExportErrorCopy(e.message));
        }).finally(() => {
            if (scope === epoch.current)
                setBusy(false);
        });
        return () => { epoch.current++; };
        // Only saved identity/revision determines the lifetime of this review.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tripId, ownerId, savedRevision]);
    useEffect(() => {
        setReview(null);
        setResult(null);
        setCalendarId('');
        setDestinations([]);
        if (!grant?.connected)
            return;
        const scope = ++epoch.current;
        setBusy(true);
        void api(`/api/easyt/calendar-export/destinations?grantId=${encodeURIComponent(grantId)}`, undefined, scope).then(data => { setDestinations(data.destinations); const remembered = status?.bindings.find(b => b.grantId === grantId); setCalendarId(data.destinations.some((d: Destination) => d.id === remembered?.calendarId) ? remembered!.calendarId : data.destinations[0]?.id ?? ''); }).catch(e => {
            if (scope === epoch.current)
                setError(calendarExportErrorCopy(e.message));
        }).finally(() => {
            if (scope === epoch.current)
                setBusy(false);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [grantId, grant?.connected]);
    const connect = (kind: 'existing-owned' | 'new-trip') => run(async (scope) => { const data = await api('/api/easyt/calendar-export/connect', { tripId, kind }, scope); window.location.assign(data.url); });
    const preview = () => run(async (scope) => {
        if (!settled || !status || status.savedRevision !== savedRevision)
            throw Error('STALE_REVIEW');
        setResult(null);
        key.current = crypto.randomUUID();
        if (newCalendar) {
            const ops = status.events.map(item => ({ id: item.sourceKey, sourceKey: item.sourceKey, action: 'add' as const, payload: item.payload, eventId: '', marker: '', etag: null, status: 'pending' as const }));
            setReview({ id: 'new', revision: savedRevision, expiresAt: Date.now() + 600000, destination: 'New trip calendar', operations: ops, issues: [], excluded: status.excluded, blocked: status.blocked, unchanged: 0 });
            setSelected(ops.map(o => o.id));
            return;
        }
        const data = await api(endpoint, { action: 'preview', expectedRevision: savedRevision, grantId, calendarId }, scope);
        setBindingId(data.bindingId);
        setReview(data.review);
        if (data.review.idempotencyKey)
            key.current = data.review.idempotencyKey;
        setSelected(data.review.selection ?? data.review.operations.filter((o: ExportOperation) => o.action !== 'remove').map((o: ExportOperation) => o.id));
    });
    const send = () => run(async (scope) => {
        if (!review || !settled || review.revision !== savedRevision)
            throw Error('STALE_REVIEW');
        const data = await api(endpoint, review.id === 'new' ? { action: 'create-and-send', grantId, expectedRevision: savedRevision, selectedSourceKeys: selected, idempotencyKey: key.current } : { action: 'send', grantId, bindingId, reviewId: review.id, selectedOperationIds: selected, idempotencyKey: key.current }, scope);
        setResult(data);
        onPrevious(data.counts.acknowledged > 0 || Boolean(status?.hasPreviousSend));
    });
    const retry = Boolean(result && (result.counts.uncertain + result.counts.failed + result.counts.pending > 0));
    const keepOnly = Boolean(review?.operations.some(o => o.action === 'remove') && selected.length === 0);
    const canSend = Boolean(review && (calendarExportCanSend({ savedRevision, reviewRevision: review.revision, selected: selected.length, busy }) || keepOnly && !busy && review.revision === savedRevision) && settled);
    const switching = status?.bindings.some(b => b.grantId !== grantId || b.calendarId !== calendarId);
    return <MorroviaContentDialog ariaLabel="Add trip events to Google Calendar" autoFocusSelector="button" open onClose={onClose}><div className={styles.dialogForm} onKeyDownCapture={cycleStageFocus}>
  <h2>{status?.hasPreviousSend ? 'Send calendar changes' : 'Add to calendar'}</h2><p className={styles.dialogDetail}>Review events before sending. Later trip changes are sent only when you choose.</p>
  {error ? <p role="alert" className={styles.dialogError}>{error}</p> : null}
  {busy ? <p role="status">Checking calendar…</p> : null}
  {status?.configured && !busy && !status.eligibleCount && !status.hasPreviousSend ? <p>No dated events to send. Add dates in your itinerary.</p> : null}
  {status?.configured && calendarExportCanManage(status) ? <div className={styles.dialogFields}>
   {status.grants.length ? <EasyTSelect label="Google account" value={grantId} disabled={busy} onChange={e => { setGrantId(e.target.value); setError(''); }}>{status.grants.map(g => <option key={g.id} value={g.id}>{g.label}{g.connected ? '' : ' — reconnect'}</option>)}</EasyTSelect> : null}
   <div className={styles.dialogActions}><EasyTButton variant="secondary" disabled={busy} onClick={() => connect('existing-owned')}>{grant?.connected ? 'Choose another Google account' : 'Connect Google'}</EasyTButton><EasyTButton variant="quiet" disabled={busy} onClick={() => connect('new-trip')}>Connect for a new trip calendar</EasyTButton></div>
   {grant?.connected ? <><EasyTSelect label="Calendar" value={calendarId} disabled={busy || Boolean(result)} onChange={e => { setCalendarId(e.target.value); setReview(null); setResult(null); }}><option value="">Choose calendar</option>{destinations.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}{grant.canCreate ? <option value="__new__">New trip calendar</option> : null}</EasyTSelect>
    <p>Choose a calendar you own. Shared calendars owned by someone else are not supported yet.</p>
    {switching ? <p>Copies in previously selected calendars will remain there.</p> : null}
    {!review ? <EasyTButton variant="secondary" disabled={busy || !calendarId || !settled} onClick={preview}>Preview events</EasyTButton> : null}
    <EasyTButton variant="quiet" disabled={busy} onClick={() => run(async (scope) => { await api('/api/easyt/calendar-export/disconnect', { grantId }, scope); setStatus(s => s ? { ...s, grants: s.grants.map(g => g.id === grantId ? { ...g, connected: false } : g) } : s); setReview(null); setResult(null); })}>Disconnect Google</EasyTButton>
   </> : null}
  </div> : null}
  {review ? <><EasyTButton variant="quiet" disabled={busy} onClick={() => { setReview(null); setResult(null); }}>Review current changes again</EasyTButton><h3 ref={reviewHeadingRef} tabIndex={-1}>{grant?.label} · {review.destination}</h3><CalendarExportReviewList operations={review.operations} selected={selected} disabled={busy || Boolean(result)} onSelection={result ? () => { } : setSelected}/>
   {review.unchanged ? <p>{review.unchanged} unchanged events</p> : null}
   {review.excluded.length + review.blocked.length > 0 ? <details><summary>{review.excluded.length + review.blocked.length} events need attention</summary><ul>{[...review.excluded, ...review.blocked].map(i => <li key={i.sourceKey}>{i.reason}</li>)}</ul></details> : null}
   {review.issues.map(i => <div key={i.sourceKey}><p role="status">{calendarExportErrorCopy(i.reason)}</p>{i.reason === 'GOOGLE_REMOVED' ? <EasyTButton variant="secondary" disabled={busy} onClick={() => run(async (scope) => { const data = await api(endpoint, { action: 'readd-preview', grantId, bindingId, sourceKey: i.sourceKey, expectedRevision: savedRevision }, scope); setReview(data.review); setBindingId(data.bindingId); setResult(null); key.current = crypto.randomUUID(); setSelected(data.review.operations.filter((o: ExportOperation) => o.action !== 'remove').map((o: ExportOperation) => o.id)); })}>Review adding again</EasyTButton> : null}</div>)}
  </> : null}
  {result?.outcomes.filter(o => o.error).map(o => <p key={o.id}>{calendarExportErrorCopy(o.error!)}</p>)}
  {result ? <p ref={resultSummaryRef} tabIndex={-1} role="status">{result.counts.acknowledged} changes confirmed · {result.counts.uncertain} need checking · {result.counts.failed + result.counts.pending} remaining · {result.counts.conflict} conflicts · {result.counts.skipped} skipped</p> : null}
  <div className={styles.dialogActions}><EasyTButton variant="secondary" onClick={onClose}>{result && !retry ? 'Done' : 'Close'}</EasyTButton>{review && (!result || retry) ? <EasyTButton disabled={!canSend} loading={busy} onClick={send}>{retry ? 'Retry remaining' : keepOnly ? 'Keep events in Google' : review.id === 'new' ? 'Create calendar and add events' : status?.hasPreviousSend ? 'Send changes' : 'Add events'}</EasyTButton> : null}</div>
 </div></MorroviaContentDialog>;
}
