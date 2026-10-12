import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function callback(file: string, name: string, next: string, scope: Record<string, unknown>) {
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf(`  const ${name} =`), end = source.indexOf(`  const ${next} =`, start + 1);
  assert.ok(start >= 0 && end > start, `production ${name} callback exists`);
  const js = ts.transpileModule(source.slice(start, end) + `\nreturn ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('scope', `with(scope){${js}}`)(scope);
}
const itinerary = 'components/easyt/trip-itinerary-workspace.tsx';
function itineraryScope(gate: ReturnType<typeof deferred<boolean>>) {
  let current = true;
  const events: string[] = [];
  const trip = { id: 'trip-a', ownerId: 'owner-a', planItems: [{ id: 'day-a', dayNumber: 1 }] };
  const mutate = async (update: (trip: any) => any) => { update(trip); const accepted = await gate.promise; return accepted && current; };
  return { events, stale: () => { current = false; }, scope: {
    mutation: { mutateTrip: mutate }, mutateCurrentTrip: mutate,
    captureActionScope: () => () => current,
    addFlow: { kind: 'activity', dayNumber: 1, noteIndex: 0 }, addDraft: 'Typed activity',
    active: { id: 'day-a', dayNumber: 1, stopId: 'stop-a' }, workingTrip: trip, language: 'en',
    copy: { noteAdded: 'Note added', suggestionAdded: 'Added' },
    addItineraryActivityWithUndo: () => ({ trip, undo: { id: 'undo' } }), addItineraryDayNote: () => ({ trip }),
    setAddError: () => events.push('error'), setAddFlow: () => events.push('clear-flow'), setAddDraft: () => events.push('clear-input'),
    setNotice: () => events.push('notice'), setUndoReceipt: () => events.push('undo'), trackEvent: () => events.push('analytics'),
    addedToDayNotice: () => 'Added',
    activityDayPartFit: () => 'slot', preferredItineraryDayPart: () => 'morning', activityAllowsDayPart: () => true,
    scheduleItineraryIdeaWithUndo: () => ({ trip, undo: { id: 'undo' } }), newlyScheduledItineraryIdea: () => true,
    itineraryAddSourceForIdea: () => 'manual',
  } };
}

test('manual itinerary input and Undo wait for actual durable acceptance', async () => {
  const gate = deferred<boolean>(), h = itineraryScope(gate);
  const submit = callback(itinerary, 'submitAddFlow', 'submitRailNote', h.scope);
  const pending = submit(); await tick(); assert.equal(h.events.length, 0);
  gate.resolve(true); await pending;
  assert.ok(h.events.includes('clear-input')); assert.ok(h.events.includes('undo')); assert.ok(h.events.includes('analytics'));
});

test('refused itinerary storage preserves the typed input and never claims Undo or analytics', async () => {
  const gate = deferred<boolean>(), h = itineraryScope(gate);
  const submit = callback(itinerary, 'submitAddFlow', 'submitRailNote', h.scope);
  const pending = submit(); gate.resolve(false); await pending;
  assert.deepEqual(h.events, ['error']);
});

test('a stale itinerary continuation cannot clear the next owner or day input', async () => {
  const gate = deferred<boolean>(), h = itineraryScope(gate);
  const submit = callback(itinerary, 'submitAddFlow', 'submitRailNote', h.scope);
  const pending = submit(); h.stale(); gate.resolve(true); await pending;
  assert.deepEqual(h.events, [], 'stale UI receives neither acceptance nor rejection side effects');
});

test('scheduled ideas only emit analytics and Undo after verified storage', async () => {
  const gate = deferred<boolean>(), h = itineraryScope(gate);
  const schedule = callback(itinerary, 'scheduleIdea', 'beginPlannerDrag', h.scope);
  const pending = schedule({ id: 'idea', stopId: 'stop-a', category: 'activity' }, 'day-a');
  await tick(); assert.equal(h.events.length, 0);
  gate.resolve(true); assert.equal(await pending, true);
  assert.ok(h.events.includes('undo')); assert.ok(h.events.includes('analytics'));
});

test('choosing a stay waits for true acceptance before feedback and analytics', async () => {
  const gate = deferred<boolean>(), events: string[] = [];
  const choose = callback('components/easyt/trip-stay-workspace.tsx', 'chooseStay', 'removeStay', {
    mutation: { mutateTrip: () => gate.promise }, captureActionScope: () => () => true,
    selectMappedStayForStop: () => ({}), context: { stop: { id: 'stop-a', name: 'Tokyo' } }, workingTrip: { id: 'trip-a' },
    setNotice: () => events.push('notice'), trackEvent: () => events.push('analytics'),
  });
  const pending = choose({ id: 'stay-a', name: 'Ryokan' }); await tick(); assert.deepEqual(events, []);
  gate.resolve(true); await pending; assert.deepEqual(events, ['notice', 'analytics']);
});

test('day choice keeps its picker pending until true acceptance and retains it on refusal', async () => {
  for (const accepted of [true, false]) {
    const gate = deferred<boolean>(), events: string[] = [];
    const perform = callback(itinerary, 'performChoice', 'moveFocus', {
      pendingChoiceRef: { current: false }, pickerMountedRef: { current: true }, pending: false,
      capturePickerScope: () => () => true, setChoosing: (value: boolean) => events.push(value ? 'pending' : 'finished'),
      close: () => events.push('closed'), onChoose: () => gate.promise, onDefault: () => gate.promise,
    });
    const pending = perform(() => gate.promise, true); await tick();
    assert.deepEqual(events, ['pending']); gate.resolve(accepted);
    assert.equal(await pending, accepted);
    assert.equal(events.includes('closed'), accepted);
  }
});

test('explicit plan removal waits for confirmed acceptance and cannot close a newer owner scope', async () => {
  for (const stale of [false, true]) {
    const gate = deferred<boolean>(), events: string[] = [], target = { kind: 'visit', id: 'request-a' };
    const scope = { current: {} };
    const confirm = callback('components/easyt/trip-explicit-plans.tsx', 'confirmRemoval', 'content', {
      removeTarget: target, removeTargetRef: { current: target }, removalPendingRef: { current: false },
      removalScopeRef: scope, mountedRef: { current: true }, onRemoveVisit: () => gate.promise,
      renderScope: scope.current,
      onRemoveCommitment: () => gate.promise, setConfirming: (value: boolean) => events.push(value ? 'pending' : 'finished'),
      setRemovalError: (value: string) => { if (value) events.push('error'); }, setRemoveTarget: () => events.push('closed'),
    });
    const pending = confirm(); await tick(); assert.deepEqual(events, ['pending']);
    if (stale) scope.current = {};
    gate.resolve(true); await pending;
    assert.equal(events.includes('closed'), !stale);
  }
});

test('the mounted itinerary scope rejects owner or input cycles and unmount', () => {
  const source = readFileSync(itinerary, 'utf8');
  const start = source.indexOf('function useItineraryActionScope('), end = source.indexOf('\nconst itineraryDayPartLabels', start);
  const values: any[] = [];
  let index = 0, cleanup: (() => void) | undefined;
  const scope = {
    useRef: (value: any) => values[index++] ??= { current: value },
    useCallback: (callback: any) => callback,
    useEffect: (effect: () => () => void) => { cleanup ??= effect(); },
  };
  const js = ts.transpileModule(source.slice(start, end) + '\nreturn useItineraryActionScope;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const hook = new Function('scope', `with(scope){${js}}`)(scope);
  const render = (identity: string) => { index = 0; return hook(identity); };
  const old = render('owner-a:day-a:input-1')();
  assert.equal(old(), true); render('owner-b:day-b:input-1'); render('owner-a:day-a:input-1');
  assert.equal(old(), false, 'returning to the same labels cannot revive an earlier operation');
  const changedInput = render('owner-a:day-a:input-2')();
  assert.equal(changedInput(), true); cleanup?.(); assert.equal(changedInput(), false);
});
