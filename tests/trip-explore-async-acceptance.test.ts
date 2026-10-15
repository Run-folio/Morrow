import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as explore from '../lib/easyt/explore.ts';
import * as ideas from '../lib/easyt/itinerary-ideas.ts';
import * as tripModel from '../lib/easyt/trip.ts';
import * as localPlace from '../lib/easyt/local-place.ts';
import * as addAnalytics from '../lib/easyt/itinerary-add-analytics.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import type { EasyTTrip } from '../lib/easyt/trip.ts';

const require = createRequire(import.meta.url);
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(queued = false) {
  let trip = requireReadableTripDocument(canonicalRouteFixture());
  const first = explore.exploreResultForPlace(trip.stops[0]!, {
    id: 'tokyo-museum', title: 'Tokyo museum', area: 'Tokyo', type: 'Culture', tags: ['Culture'],
    description: 'A deterministic museum fixture.', coordinates: [139.7, 35.7], qualityScore: 10,
  });
  const second = { ...first, identity: `${first.identity}-second`, sourceId: 'second-museum',
    idea: { ...first.idea, id: 'second-museum', placeId: 'second-museum', title: 'Second museum' }, title: 'Second museum' };
  const states: any[] = [], cleanup: Array<() => void> = [], mountEffects: Array<() => void | (() => void)> = [], queuedState: Array<() => void> = [];
  let deferState = false;
  let discoveryEffect: (() => void | (() => void)) | undefined;
  const sourceCallbacks: Array<(snapshot: explore.ExploreDiscoveryLaneSnapshot) => void> = [];
  let cursor = 0;
  const hooks = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value: any) => {
        const update = () => { states[index] = typeof value === 'function' ? value(states[index]) : value; };
        if (deferState) queuedState.push(update); else update();
      }];
    },
    useRef(value: any) { return states[cursor++] ??= { current: value }; },
    useMemo(factory: () => any) { return factory(); },
    useCallback(callback: any) { return callback; },
    useEffect(effect: () => void | (() => void), dependencies: unknown[]) {
      if (effect.toString().includes('Explore organic and commercial discovery')) discoveryEffect = effect;
      const index = cursor++;
      if (!(index in states)) {
        states[index] = true;
        // Only mount lifetime effects run. Discovery and browser effects stay inert.
        if (!dependencies.length) { mountEffects.push(effect); const dispose = effect(); if (dispose) cleanup.push(dispose); }
      }
    },
  };
  const Button = () => null, Detail = () => null, StopTrack = () => null, Select = () => null;
  const events: Array<{ name: string; data: Record<string, unknown> }> = [];
  let accepted = deferred<unknown>(); const updateGate = deferred<void>();
  const requests: Array<{ update: (current: EasyTTrip) => EasyTTrip; key: string }> = [];
  const mutation = {
    get trip() { return trip; }, error: '', isPending: () => false,
    async mutateTrip(update: (current: EasyTTrip) => EasyTTrip, key: string) {
      requests.push({ update, key });
      if (queued) await updateGate.promise;
      const next = update(structuredClone(trip));
      const changed = JSON.stringify(next) !== JSON.stringify(trip);
      const stored = await accepted.promise;
      if (stored === true && changed) trip = requireReadableTripDocument(next);
      // Preserve invalid dynamic results so the production acceptance guard is exercised.
      return stored === true ? changed : stored;
    },
  };
  const imports: Record<string, any> = {
    react: hooks, 'lucide-react': new Proxy({}, { get: () => () => null }),
    '@/lib/analytics': { trackEvent: (name: string, data: Record<string, unknown>) => events.push({ name, data }) },
    '@/lib/easyt/local-place': localPlace, '@/lib/easyt/trip': tripModel, '@/lib/easyt/explore': { ...explore,
      streamExploreDiscoveryLane: (_requests: unknown[], snapshot: (snapshot: explore.ExploreDiscoveryLaneSnapshot) => void) => {
        // Capture the real production snapshot continuation; never execute provider requests.
        sourceCallbacks.push(snapshot); return Promise.resolve();
      },
    }, '@/lib/easyt/itinerary-ideas': ideas,
    '@/lib/easyt/itinerary-add-analytics': addAnalytics,
    '@/components/journey-planner-strip': { JourneyRouteStopTrack: StopTrack },
    '@/lib/easyt/abortable-effect': { createAbortableEffectScope: () => {
      let active = true;
      return { signal: new AbortController().signal, commit: (apply: () => void) => { if (active) apply(); }, dispose: () => { active = false; } };
    } }, '@/lib/easyt/recommendation-performance': { recommendationDurationMs: (start: number, end: number) => end - start },
    '@/lib/easyt/planning-evidence-presentation': { planningLaneMessage: () => 'Provider unavailable', planningRequiresSignIn: () => false },
    '@/lib/easyt/trip-continuity': {}, '@/lib/easyt/recommendation-detail': { recommendationDetailForExploreResult: () => ({}) },
    '@/lib/easyt/trip-workspace-links': { itineraryWorkspaceHref: () => '/fixture/day', mapWorkspaceHref: () => '/fixture/map', exploreWorkspaceHref: () => '/fixture/explore' },
    '@/lib/easyt/map-result-selection': { mapResultSelectionId: () => 'selection', mapResultSelectionIdForIdea: () => 'selection', mapResultHandoffForExploreResult: () => ({}) },
    '@/lib/easyt/route-timeline': { routeTimelineStopsForTrip: () => [] },
    './affiliate-link': { MorroviaAffiliateLink: () => null },
    './easyt-controls': { EasyTButton: Button, EasyTLinkButton: () => null, EasyTSelect: Select },
    './itinerary-item-detail': { default: Detail }, './journey-local-place-photo': { useJourneyLocalPlacePhotos: () => ({}) },
    './morrovia-feedback': { MorroviaStatusBanner: () => null },
    './morrovia-loading-states': { MorroviaSectionStatus: () => null, MorroviaSkeleton: () => null },
    './resilient-image': { default: () => null }, './trip-shell-client': { useTripShellMutation: () => mutation },
    './trip-explore-workspace.module.css': { default: {} },
  };
  const source = readFileSync('components/easyt/trip-explore-workspace.tsx', 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', 'window', 'document', js)((id: string) => id in imports ? imports[id] : require(id), module, module.exports,
    { requestAnimationFrame: (callback: () => void) => callback() }, { getElementById: () => null });
  let requestedDayNumber: number | null = 2;
  let initialResults: explore.ExploreResult[] | undefined = [first, second];
  const render = () => {
    cursor = 0;
    return module.exports.default({ trip, initialResults, initialDestinationId: trip.stops[0]!.id, requestedDayNumber });
  };
  function findAll(node: any, predicate: (node: any) => boolean): any[] {
    if (!node) return [];
    if (Array.isArray(node)) return node.flatMap(child => findAll(child, predicate));
    if (typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...findAll(node.props?.children, predicate), ...findAll(node.props?.primaryActions, predicate)];
  }
  const button = (label: string, tree = render()) => {
    const found = findAll(tree, node => node.type === Button && (node.props['aria-label'] === label || node.props.children === label))[0];
    assert.ok(found, `production button ${label} exists`); return found;
  };
  const save = (tree = render()) => button(`Save ${first.title} for later`, tree).props.onClick;
  const schedule = (tree = render()) => button('Add to Day 2', tree).props.onClick;
  const notices = () => findAll(render(), node => node.props?.role === 'status');
  return { render, button, save, schedule, notices, accepted, updateGate, requests, events, first, second, Detail, StopTrack, findAll,
    trip: () => trip, switchTrip: (patch: Partial<EasyTTrip>) => { trip = requireReadableTripDocument({ ...trip, ...patch }); },
    setRequestedDay: (day: number | null) => { requestedDayNumber = day; },
    replaceSource: (next: explore.ExploreResult | null) => {
      const index = states.findIndex(value => Array.isArray(value) && value.some(item => item?.identity === first.identity));
      assert.ok(index >= 0); states[index] = next ? [next, second] : [second];
    },
    unmount: () => cleanup.forEach(dispose => dispose()),
    replayMount: () => { cleanup.forEach(dispose => dispose()); mountEffects.forEach(effect => { const dispose = effect(); if (dispose) cleanup.push(dispose); }); },
    useAcceptance: (gate: ReturnType<typeof deferred<unknown>>) => { accepted = gate; },
    deferState: () => { deferState = true; },
    flushState: () => { deferState = false; queuedState.splice(0).forEach(update => update()); },
    startSyntheticDiscovery: () => {
      initialResults = undefined; render(); assert.ok(discoveryEffect);
      const dispose = discoveryEffect(); if (dispose) cleanup.push(dispose);
      assert.equal(sourceCallbacks.length, 2);
      sourceCallbacks[0]!({ results: [first, second], status: 'ready', pendingCount: 0, failedCount: 0 }); render();
      events.length = 0;
    },
    sourceSnapshot: (results: explore.ExploreResult[], pendingCount = 0, failedCount = 0) => {
      sourceCallbacks[0]!({ results, status: failedCount ? 'degraded' : pendingCount ? 'loading' : 'ready', pendingCount, failedCount });
    },
  };
}

test('Explore saved feedback waits for durable true acceptance', async () => {
  const h = harness(), pending = h.save()();
  await tick(); assert.equal(h.events.length, 0); assert.equal(h.notices().length, 0);
  h.accepted.resolve(true); await pending;
  assert.deepEqual(h.events.map(event => event.name), ['explore_saved_for_later']);
  assert.equal(h.notices().length, 1);
  assert.equal(explore.exploreResultState(h.trip(), h.first).state, 'saved');
});

for (const action of ['save', 'schedule'] as const) {
  test(`Explore ${action} preserves feedback and ideas when durable storage refuses or rejects`, async () => {
    for (const rejection of [false, true]) {
      const h = harness(), pending = h[action]()();
      await tick(); assert.deepEqual(h.events, []); assert.equal(h.notices().length, 0);
      if (rejection) h.accepted.reject(new Error('fixture storage rejection')); else h.accepted.resolve(false);
      await pending;
      assert.deepEqual(h.events, []); assert.equal(h.notices().length, 0);
      assert.equal(explore.exploreResultState(h.trip(), h.first).state, 'available');
    }
  });
}

test('queued scheduling computes newly added analytics inside the actual delayed update', async () => {
  const h = harness(true), pending = h.schedule()();
  await tick(); assert.equal(h.events.length, 0);
  h.updateGate.resolve(); await tick(); assert.equal(h.events.length, 0); assert.equal(h.notices().length, 0);
  h.accepted.resolve(true); await pending;
  assert.deepEqual(h.events.map(event => event.name), ['itinerary_item_added', 'explore_added_to_day']);
  assert.equal(h.events[1]!.data.day_number, 2);
  const state = explore.exploreResultState(h.trip(), h.first);
  assert.equal(state.state, 'planned'); if (state.state === 'planned') assert.equal(state.day.dayNumber, 2);
  assert.equal(h.notices().length, 1);
});

test('pending Explore Save and Schedule share an immediate duplicate guard and existing disabled controls', async () => {
  const h = harness(), click = h.save(), pending = click();
  click(); h.schedule()(); await tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.button(`Save ${h.first.title} for later`).props.disabled, true);
  assert.equal(h.button('Add to Day 2').props.disabled, true);
  h.accepted.resolve(false); await pending;
  assert.equal(h.button(`Save ${h.first.title} for later`).props.disabled, false);
});

for (const transition of ['owner', 'document', 'day', 'destination', 'category', 'selection', 'source', 'unmount'] as const) {
  test(`a delayed Explore result cannot publish acceptance after ${transition} changes`, async () => {
    const h = harness(), pending = h.schedule()();
    if (transition === 'owner') h.switchTrip({ ownerId: 'owner-b' });
    if (transition === 'document') h.switchTrip({ id: 'other-trip' });
    if (transition === 'day') h.setRequestedDay(3);
    if (transition === 'destination') h.findAll(h.render(), node => node.type === h.StopTrack)[0].props.onSelectStop('kyoto');
    if (transition === 'category') h.button('Food').props.onClick();
    if (transition === 'selection') h.button(`Open details for ${h.second.title}`).props.onClick({ currentTarget: {} });
    if (transition === 'source') h.replaceSource({ ...h.first, idea: { ...h.first.idea, providerProductId: 'replacement-source' } });
    if (transition === 'unmount') h.unmount(); else h.render();
    const prior = [...h.events]; h.accepted.resolve(true); await pending;
    assert.deepEqual(h.events, prior, 'only the explicit navigation event may have been recorded');
    assert.equal(h.notices().length, 0);
  });
}

test('retained callbacks reject exact owner or document changes before starting a request', async () => {
  for (const patch of [{ ownerId: 'owner-b' }, { id: 'other-trip' }]) {
    const h = harness(), oldSave = h.save();
    h.switchTrip(patch); h.render(); oldSave(); await tick();
    assert.equal(h.requests.length, 0);
  }
});

test('queued old source callbacks leave the canonical document untouched', async () => {
  const h = harness(true), before = JSON.stringify(h.trip()), pending = h.schedule()();
  h.replaceSource(null); h.render(); h.updateGate.resolve(); h.accepted.resolve(true); await pending;
  assert.equal(JSON.stringify(h.trip()), before); assert.deepEqual(h.events, []); assert.equal(h.notices().length, 0);
});

test('a duplicate canonical schedule emits no added-item analytics or accepted notice', async () => {
  const h = harness(), schedule = h.schedule();
  const trip = ideas.scheduleItineraryIdea(h.trip(), h.first.idea, 'japan-day-2', null);
  h.switchTrip(trip); h.accepted.resolve(true);
  h.render(); await schedule();
  assert.equal(h.requests.length, 1, 'the frozen source is still current, but the canonical helper refuses its duplicate');
  assert.deepEqual(h.events, []);
  assert.equal(h.notices().length, 0);
  assert.equal(explore.exploreResultState(h.trip(), h.first).state, 'planned');
});

test('Explore detail retains its selection and disables its existing actions until acceptance settles', async () => {
  const h = harness();
  h.button(`Open details for ${h.first.title}`).props.onClick({ currentTarget: {} });
  h.events.length = 0;
  const pending = h.button('Save for later').props.onClick();
  const tree = h.render(), detail = h.findAll(tree, node => node.type === h.Detail)[0];
  assert.equal(detail.props.pending, true);
  assert.equal(h.button('Save for later', tree).props.disabled, true);
  assert.equal(h.button('Add to Day 2', tree).props.disabled, true);
  h.accepted.reject(new Error('fixture storage rejection')); await pending;
  const retained = h.findAll(h.render(), node => node.type === h.Detail)[0];
  assert.ok(retained); assert.equal(retained.props.pending, false);
  assert.equal(h.button('Save for later').props.disabled, false);
  assert.equal(h.notices().length, 0); assert.deepEqual(h.events, []);
});

test('Explore removal awaits the durable result and blocks repeat removal while pending', async () => {
  for (const stored of [false, true]) {
    const h = harness();
    h.switchTrip(ideas.scheduleItineraryIdea(h.trip(), h.first.idea, 'japan-day-2', null));
    const before = JSON.stringify(h.trip()), remove = h.button('Remove').props.onClick, pending = remove();
    remove(); await tick();
    assert.equal(h.requests.length, 1); assert.equal(h.button('Remove').props.disabled, true);
    assert.equal(JSON.stringify(h.trip()), before);
    h.accepted.resolve(stored); assert.equal(await pending, stored);
    assert.equal(explore.exploreResultState(h.trip(), h.first).state, stored ? 'available' : 'planned');
    assert.equal(h.notices().length, 0); assert.deepEqual(h.events, []);
  }
});

test('returning to the same source or owner cannot revive an obsolete Explore callback', async () => {
  for (const transition of ['source', 'owner'] as const) {
    const h = harness(), oldSave = h.save();
    if (transition === 'source') h.replaceSource({ ...h.first, idea: { ...h.first.idea, placeId: 'changed-source' } });
    else h.switchTrip({ ownerId: 'owner-b' });
    h.render();
    if (transition === 'source') h.replaceSource(h.first); else h.switchTrip({ ownerId: 'owner-a' });
    h.render(); assert.equal(await oldSave(), false);
    assert.equal(h.requests.length, 0); assert.deepEqual(h.events, []);
    const pending = h.save()(); h.accepted.resolve(true); assert.equal(await pending, true);
    assert.equal(h.requests.length, 1, 'a fresh click in the returned scope remains available');
  }
});

test('queued Explore actions verify the actual canonical owner and day before mutation without requiring a render', async () => {
  for (const transition of ['owner', 'document', 'day'] as const) {
    const h = harness(true), pending = h.schedule()();
    if (transition === 'owner') h.switchTrip({ ownerId: 'owner-b' });
    if (transition === 'document') h.switchTrip({ id: 'other-trip' });
    if (transition === 'day') h.switchTrip({ planItems: h.trip().planItems.map(day => day.id === 'japan-day-2' ? { ...day, dayNumber: 3 } : day) });
    const before = JSON.stringify(h.trip());
    h.updateGate.resolve(); h.accepted.resolve(true); assert.equal(await pending, false);
    assert.equal(JSON.stringify(h.trip()), before); assert.deepEqual(h.events, []); assert.equal(h.notices().length, 0);
  }
});

test('Explore commits the frozen reviewed idea and preserves canonical bookings and route intent', async () => {
  const h = harness(true), before = structuredClone(h.trip()), reviewedTitle = h.first.idea.title;
  const pending = h.save()();
  h.first.idea.title = 'Late mutation of the shared provider object';
  h.updateGate.resolve(); h.accepted.resolve(true); await pending;
  const canonical = requireReadableTripDocument(JSON.parse(JSON.stringify(h.trip())));
  assert.equal(tripModel.legacyItineraryIdeas(canonical.brief.itineraryIdeas)[0]?.title, reviewedTitle);
  assert.deepEqual(canonical.brief.bookings, before.brief.bookings);
  assert.deepEqual(canonical.brief.intent, before.brief.intent);
  assert.deepEqual(canonical.planItems, before.planItems);
});

test('queued removal cannot remove an idea moved after the reviewed canonical document', async () => {
  const h = harness(true);
  h.switchTrip(ideas.scheduleItineraryIdea(h.trip(), h.first.idea, 'japan-day-2', null));
  const pending = h.button('Remove').props.onClick();
  h.switchTrip(ideas.scheduleItineraryIdea(h.trip(), h.first.idea, 'japan-day-3', null));
  const before = JSON.stringify(h.trip());
  h.updateGate.resolve(); h.accepted.resolve(true); assert.equal(await pending, false);
  assert.equal(JSON.stringify(h.trip()), before); assert.deepEqual(h.events, []);
});

for (const [label, value] of Object.entries({ object: { stored: true }, string: 'accepted', number: 1, undefined })) {
  for (const action of ['save', 'schedule', 'remove'] as const) {
    test(`Explore ${action} refuses a dynamic ${label} result instead of literal true`, async () => {
      const h = harness();
      if (action === 'remove') h.switchTrip(ideas.scheduleItineraryIdea(h.trip(), h.first.idea, 'japan-day-2', null));
      const before = JSON.stringify(h.trip());
      const pending = action === 'remove' ? h.button('Remove').props.onClick() : h[action]()();
      assert.equal(h.notices().length, 0); assert.equal(h.events.length, 0);
      h.accepted.resolve(value); assert.equal(await pending, false);
      assert.equal(JSON.stringify(h.trip()), before); assert.equal(h.notices().length, 0); assert.equal(h.events.length, 0);
    });
  }
}

test('pending Explore scheduling started before effect replay cannot publish acceptance after setup', async () => {
  const h = harness(), pending = h.schedule()(); h.replayMount(); h.accepted.resolve(true);
  assert.equal(await pending, false); assert.equal(h.events.length, 0); assert.equal(h.notices().length, 0);
});

test('a fresh Explore operation after replay retains pending state when the obsolete one finishes', async () => {
  const h = harness(), old = h.schedule()(); h.replayMount();
  const gate = deferred<unknown>(); h.useAcceptance(gate);
  const fresh = h.schedule()(); assert.equal(h.requests.length, 2);
  h.accepted.resolve(false); assert.equal(await old, false);
  assert.equal(h.button('Add to Day 2').props.disabled, true);
  gate.resolve(true); assert.equal(await fresh, true);
  assert.deepEqual(h.events.map(event => event.name), ['itinerary_item_added', 'explore_added_to_day']);
});

for (const intent of ['category', 'destination', 'detail-open', 'detail-close', 'day'] as const) {
  test(`Explore ${intent} intent retires pending acceptance before React applies its queued state`, async () => {
    const h = harness();
    let daySelect: any;
    if (intent === 'detail-close' || intent === 'day') {
      if (intent === 'day') h.setRequestedDay(null);
      h.button(`Open details for ${h.first.title}`).props.onClick({ currentTarget: { focus() {} } });
      if (intent === 'day') {
        daySelect = h.findAll(h.render(), node => node.props?.label === 'Choose a day')[0];
        daySelect.props.onChange({ target: { value: '2' } }); h.render();
      }
    }
    h.events.length = 0; const pending = h.schedule()(); h.deferState();
    if (intent === 'category') h.button('Food').props.onClick();
    if (intent === 'destination') h.findAll(h.render(), node => node.type === h.StopTrack)[0].props.onSelectStop('kyoto');
    if (intent === 'detail-open') h.button(`Open details for ${h.second.title}`).props.onClick({ currentTarget: { focus() {} } });
    if (intent === 'detail-close') h.findAll(h.render(), node => node.type === h.Detail)[0].props.onClose();
    if (intent === 'day') daySelect.props.onChange({ target: { value: '3' } });
    const events = [...h.events]; h.accepted.resolve(true); assert.equal(await pending, false);
    assert.deepEqual(h.events, events); h.flushState(); assert.equal(h.notices().length, 0);
  });
}

for (const intent of ['category', 'destination', 'detail', 'day'] as const) {
  test(`a no-op Explore ${intent} choice preserves valid pending acceptance`, async () => {
    const h = harness(); let daySelect: any;
    if (intent === 'detail' || intent === 'day') {
      if (intent === 'day') h.setRequestedDay(null);
      h.button(`Open details for ${h.first.title}`).props.onClick({ currentTarget: { focus() {} } });
      if (intent === 'day') { daySelect = h.findAll(h.render(), node => node.props?.label === 'Choose a day')[0]; daySelect.props.onChange({ target: { value: '2' } }); h.render(); }
    }
    h.events.length = 0; const pending = h.schedule()(); h.deferState();
    if (intent === 'category') h.button('For you').props.onClick();
    if (intent === 'destination') h.findAll(h.render(), node => node.type === h.StopTrack)[0].props.onSelectStop(h.first.stopId);
    if (intent === 'detail') h.button(`Open details for ${h.first.title}`).props.onClick({ currentTarget: { focus() {} } });
    if (intent === 'day') daySelect.props.onChange({ target: { value: '2' } });
    h.accepted.resolve(true); assert.equal(await pending, true); h.flushState();
    assert.equal(h.notices().length, 1); assert.equal(h.events.filter(event => event.name === 'explore_added_to_day').length, 1);
  });
}

test('a changed discovery source retires the actual queued update before React applies its snapshot', async () => {
  const h = harness(true); h.startSyntheticDiscovery();
  const before = JSON.stringify(h.trip()), pending = h.schedule()(); h.deferState();
  h.sourceSnapshot([{ ...h.first, idea: { ...h.first.idea, placeId: 'changed-provider-source' } }, h.second]);
  const events = [...h.events]; h.updateGate.resolve(); h.accepted.resolve(true); assert.equal(await pending, false);
  assert.equal(JSON.stringify(h.trip()), before); assert.deepEqual(h.events, events);
  h.flushState(); assert.equal(h.notices().length, 0);
});

for (const update of ['same', 'unrelated', 'failed-lane'] as const) {
  test(`a ${update} discovery snapshot preserves the exact source pending acceptance before render`, async () => {
    const h = harness(); h.startSyntheticDiscovery(); const pending = h.schedule()(); h.deferState();
    if (update === 'same') h.sourceSnapshot([h.first, h.second]);
    if (update === 'unrelated') h.sourceSnapshot([h.first, h.second, { ...h.second, identity: 'unrelated-source', sourceId: 'unrelated-source', idea: { ...h.second.idea, id: 'unrelated-source', placeId: 'unrelated-source' } }]);
    if (update === 'failed-lane') h.sourceSnapshot([], 0, 1);
    h.accepted.resolve(true); assert.equal(await pending, true); h.flushState();
    assert.equal(h.notices().length, 1); assert.equal(h.events.filter(event => event.name === 'explore_added_to_day').length, 1);
  });
}
