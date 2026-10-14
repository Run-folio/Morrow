import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { durableBuilderRecoveryUrl } from '../lib/easyt/builder-durable-url.ts';
import { EASYT_NEW_TRIP_INPUT_CHANGE_EVENT } from '../lib/easyt/storage.ts';
import type { NewTripNavigationRecoveryAcknowledgement } from '../lib/easyt/storage.ts';
type PreservationGuard = (acknowledgements?: readonly NewTripNavigationRecoveryAcknowledgement[]) => boolean;

type Surface = 'navigation' | 'route' | 'closing';
type Element = { type: unknown; props: Record<string, unknown> };
const surfaces = {
  navigation: 'app/journey/easyt-navigation.tsx',
  route: 'app/journey/routes/[slug]/route-plan-link.tsx',
  closing: 'app/journey/home/immersive/closing-chapter.tsx',
};
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve, reject };
}
function actualFunction(file: string, name: string, scope: Record<string, unknown>) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `Actual ${name} must exist`);
  for (const statement of tree.statements.filter(ts.isImportDeclaration)) {
    const clause = statement.importClause;
    if (clause?.name && !(clause.name.text in scope)) scope[clause.name.text] = clause.name.text;
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) if (!(element.name.text in scope)) scope[element.name.text] = element.name.text;
    }
  }
  const expression = declaration.getText(tree).replace(/^export (default )?/, '');
  const script = ts.transpileModule(`const actual = ${expression};`, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  return new Function('scope', `with(scope){${script}return actual;}`)(scope) as (...args: unknown[]) => unknown;
}
async function fixture(surface: Surface, preservation: (owner: string | null, guard?: PreservationGuard) => unknown,
  sourceHref = surface === 'navigation' ? 'https://synthetic.test/journey/new?trip=trip-a'
    : surface === 'route' ? 'https://synthetic.test/journey/routes/route-a' : 'https://synthetic.test/') {
  const slots: unknown[] = [], effects: Array<{ effect: () => void | (() => void); dependencies?: unknown[]; cleanup?: () => void }> = [];
  let cursor = 0, rememberedOwner: string | null = 'owner-a';
  let session = { user: { id: 'owner-a', name: 'Planner', email: 'synthetic@example.test' } };
  let props: Record<string, unknown> = surface === 'route'
    ? { draft: { routeKey: 'route-a', destinations: ['A', 'B'], durationDays: 4 }, placement: 'hero' }
    : surface === 'navigation' ? { current: 'new', storageOwnerId: 'owner-a' } : {};
  const initialProps = props;
  const calls: Array<{ owner: string | null; guard?: PreservationGuard }> = [], events: string[] = [], navigations: string[] = [];
  const target = Object.assign(new EventTarget(), { location: { href: sourceHref, assign(href: string) { navigations.push(href); events.push('navigate'); } } });
  const jsx = (type: unknown, elementProps: Record<string, unknown>): Element => ({ type, props: elementProps });
  const useEffect = (effect: () => void | (() => void), dependencies?: unknown[]) => {
    const slot = cursor++, old = effects[slot];
    if (!old || !dependencies || dependencies.some((value, index) => value !== old.dependencies?.[index])) {
      old?.cleanup?.(); effects[slot] = { effect, dependencies };
    }
  };
  const scope: Record<string, unknown> = {
    exports: {}, require: (name: string) => { assert.equal(name, 'react/jsx-runtime'); return { jsx, jsxs: jsx, Fragment: 'Fragment' }; },
    useRef: (initial: unknown) => { const slot = cursor++; return slots[slot] ??= { current: initial }; },
    useState: (initial: unknown) => { const slot = cursor++; slots[slot] ??= initial; return [slots[slot], (next: unknown) => { slots[slot] = typeof next === 'function' ? (next as (value: unknown) => unknown)(slots[slot]) : next; }]; },
    useMemo: (calculate: () => unknown) => { cursor++; return calculate(); }, useEffect, useLayoutEffect: useEffect,
    useNewTripNavigationScope: (...args: unknown[]) => actualFunction('app/journey/use-new-trip-navigation-scope.ts', 'useNewTripNavigationScope', scope)(...args),
    authClient: { useSession: () => ({ data: session, isPending: false }) }, useHomepageLanguage: () => 'en',
    loadRememberedOwner: async () => rememberedOwner,
    beginNewTripNavigation: (owner: string | null, _target: unknown, guard?: PreservationGuard) => { calls.push({ owner, guard }); events.push('preservation'); return preservation(owner, guard); },
    EASYT_NEW_TRIP_INPUT_CHANGE_EVENT,window: target, document: new EventTarget(),
    fetch: async () => ({ ok: true, json: async () => ({ isAdmin: false }) }),
    establishSessionLanguage: () => 'en', EASYT_LANGUAGE_CHANGE_EVENT: 'synthetic-language',
    easytCopy: { en: { nav: { newTrip: 'New trip' } } },
    styles: new Proxy({}, { get: () => 'synthetic-style' }),
    identifyAnalyticsUser() {}, rememberLastOwner() {}, trackEvent() { events.push('analytics'); },
  };
  const component = actualFunction(surfaces[surface], surface === 'navigation' ? 'EasyTNavigation' : surface === 'route' ? 'RoutePlanLink' : 'ClosingChapter', scope);
  let handler!: (event: ReturnType<typeof click>) => unknown;
  function findHandler(value: unknown): ((event: ReturnType<typeof click>) => unknown) | undefined {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const child of value) { const found = findHandler(child); if (found) return found; } return; }
    const element = value as Element;
    if (typeof element.props?.onClick === 'function' && (surface !== 'navigation' || element.props.href === '/journey/new')) return element.props.onClick as typeof handler;
    return findHandler(element.props?.children);
  }
  function render() {
    cursor = 0; const element = component(props); handler = findHandler(element)!; assert.equal(typeof handler, 'function');
    for (const entry of effects) if (entry && !entry.cleanup) { const cleanup = entry.effect(); entry.cleanup = typeof cleanup === 'function' ? cleanup : () => {}; }
  }
  render();
  await Promise.resolve();
  render();
  return { calls, events, navigations, target, click: (event = click()) => ({ result: handler(event), event }),
    unmount() { for (const entry of effects) entry?.cleanup?.(); },
    changeOwner(owner = 'owner-b') { rememberedOwner = owner; session = { user: { ...session.user, id: owner } }; render(); },
    changeIntent() { props = surface === 'route' ? { ...props, draft: { routeKey: 'route-b', destinations: ['C'], durationDays: 5 } }
      : { ...props, current: 'home' }; render(); },
    restoreIntent() { props = initialProps; render(); },
    changeRawInput() { target.dispatchEvent(new Event(EASYT_NEW_TRIP_INPUT_CHANGE_EVENT)); },
    changeDocument() { target.location.href = 'https://synthetic.test/journey/new?trip=trip-b'; },
  };
}
function click(changes: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button: number }> = {}) {
  return { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0, prevented: false,
    preventDefault() { this.prevented = true; }, ...changes };
}

for (const surface of Object.keys(surfaces) as Surface[]) {
  for (const accepted of [false, true]) test(`${surface} actual handler waits for literal ${accepted} before navigation and analytics`, async () => {
    const gate = deferred<boolean>(), ui = await fixture(surface, () => gate.promise), invocation = ui.click();
    assert.equal(invocation.event.prevented, true, 'default navigation must stop synchronously');
    assert.deepEqual(ui.navigations, []); assert.deepEqual(ui.events, ['preservation']);
    gate.resolve(accepted); await invocation.result;
    assert.deepEqual(ui.navigations, accepted ? [surface === 'route' ? '/journey/new?inspire=route-a' : '/journey/new'] : []);
    assert.deepEqual(ui.events, accepted ? surface === 'route' ? ['preservation', 'analytics', 'navigate'] : ['preservation', 'navigate'] : ['preservation']);
  });
  test(`${surface} actual handler rejects truthy non-boolean preservation`, async () => {
    const ui = await fixture(surface, async () => ({ stored: true })); await ui.click().result;
    assert.deepEqual(ui.navigations, []); assert.deepEqual(ui.events, ['preservation']);
  });
  test(`${surface} actual handler catches rejection and permits a later retry`, async () => {
    let attempt = 0; const gate = deferred<boolean>(), ui = await fixture(surface, () => ++attempt === 1 ? gate.promise : Promise.resolve(true));
    const invocation = ui.click(); assert.deepEqual(ui.navigations, []); gate.reject(new Error('synthetic preservation refusal'));
    await assert.doesNotReject(async () => { await invocation.result; }); assert.deepEqual(ui.navigations, []);
    await ui.click().result; assert.equal(ui.calls.length, 2); assert.equal(ui.navigations.length, 1);
  });
  test(`${surface} actual handler shares one pending preservation across repeated clicks`, async () => {
    const gate = deferred<boolean>(), ui = await fixture(surface, () => gate.promise), first = ui.click(), second = ui.click();
    assert.equal(first.event.prevented, true); assert.equal(second.event.prevented, true); assert.equal(ui.calls.length, 1);
    assert.deepEqual(ui.navigations, []); gate.resolve(true); await Promise.all([first.result, second.result]); assert.equal(ui.navigations.length, 1);
  });
  test(`${surface} actual handler releases a refused request for retry`, async () => {
    let attempt = 0; const ui = await fixture(surface, async () => ++attempt === 1 ? false : true);
    await ui.click().result; assert.deepEqual(ui.navigations, []); await ui.click().result;
    assert.equal(ui.calls.length, 2); assert.equal(ui.navigations.length, 1);
  });
  test(`${surface} actual handler does not start preservation after unmount`, async () => {
    const ui = await fixture(surface, async () => true); ui.unmount(); await ui.click().result;
    assert.deepEqual(ui.calls, []); assert.deepEqual(ui.navigations, []);
  });
  test(`${surface} actual handler accepts its same-trip recovery marker during preservation`, async () => {
    const gate = deferred<boolean>(), ui = await fixture(surface, () => gate.promise, 'https://synthetic.test/journey/new?trip=trip-a'), invocation = ui.click();
    ui.target.location.href += '&recover=1'; assert.equal(ui.calls[0]?.guard?.(), true);
    assert.deepEqual(ui.navigations, []); gate.resolve(true); await invocation.result; assert.equal(ui.navigations.length, 1);
  });
  for (const metadata of ['acknowledged recovery', 'presentation step']) test(`${surface} actual handler retains its document across ${metadata} metadata`, async () => {
    const gate = deferred<boolean>(), ui = await fixture(surface, () => gate.promise,
      `https://synthetic.test/journey/new?trip=trip-a&${metadata === 'acknowledged recovery' ? 'recover=1' : 'step=places'}`), invocation = ui.click();
    ui.target.location.href = `https://synthetic.test/journey/new?trip=trip-a${metadata === 'presentation step' ? '&step=dates#dates' : ''}`;
    assert.equal(ui.calls[0]?.guard?.(), true); gate.resolve(true); await invocation.result; assert.equal(ui.navigations.length, 1);
  });
  for (const source of ['inspire=route-source', 'homeDraft=1']) test(`${surface} actual handler accepts its verified ${source} durable URL transition`, async () => {
    const sourceHref = `https://synthetic.test/journey/new?${source}&handoff=source-a`, gate = deferred<boolean>();
    const ui = await fixture(surface, async (_owner, guard) => { await gate.promise; guard?.([{ sourceHref, tripId: 'trip-a' }]); return true; }, sourceHref), invocation = ui.click();
    const durableUrl = durableBuilderRecoveryUrl(ui.target.location.href, 'trip-a'); assert.ok(durableUrl);
    ui.target.location.href = durableUrl.href; assert.equal(ui.calls[0]?.guard?.(), false, 'URL shape alone cannot authorize a trip');
    assert.deepEqual(ui.navigations, []); gate.resolve(true); await invocation.result; assert.equal(ui.navigations.length, 1);
  });
  for (const source of ['inspire=route-source', 'homeDraft=1']) for (const acknowledgement of ['missing', 'wrong-trip', 'wrong-source', 'conflicting']) {
    test(`${surface} actual handler rejects ${acknowledgement} acknowledgement for foreign ${source} promotion with the same handoff`, async () => {
      const sourceHref = `https://synthetic.test/journey/new?${source}&handoff=source-a`, gate = deferred<boolean>();
      const ui = await fixture(surface, async (_owner, guard) => {
        await gate.promise;
        if (acknowledgement !== 'missing') guard?.(acknowledgement === 'conflicting'
          ? [{ sourceHref, tripId: 'trip-a' }, { sourceHref, tripId: 'trip-b' }]
          : [{ sourceHref: acknowledgement === 'wrong-source' ? sourceHref + '-other' : sourceHref, tripId: 'trip-a' }]);
        return true;
      }, sourceHref), invocation = ui.click();
      const durableUrl = durableBuilderRecoveryUrl(ui.target.location.href, acknowledgement === 'conflicting' ? 'trip-a' : 'trip-b'); assert.ok(durableUrl);
      ui.target.location.href = durableUrl.href; gate.resolve(true); await invocation.result;
      assert.deepEqual(ui.navigations, []); assert.deepEqual(ui.events, ['preservation']);
    });
  }
  for (const nextSource of ['inspire=route-other', 'trip=trip-a&recover=1&handoff=other', 'trip=trip-a']) {
    test(`${surface} actual handler rejects unrelated source changes ${nextSource}`, async () => {
      const gate = deferred<boolean>(), ui = await fixture(surface, () => gate.promise, 'https://synthetic.test/journey/new?inspire=route-source&handoff=source-a'), invocation = ui.click();
      ui.target.location.href = `https://synthetic.test/journey/new?${nextSource}`;
      assert.equal(ui.calls[0]?.guard?.(), false); gate.resolve(true); await invocation.result;
      assert.deepEqual(ui.navigations, []); assert.deepEqual(ui.events, ['preservation']);
    });
  }
  for (const change of ['unmount', 'owner', 'document', ...(surface === 'closing' ? [] : ['intent'])]) {
    test(`${surface} actual handler preserves the replacement scope after ${change} during preservation`, async () => {
      const gate = deferred<boolean>(), ui = await fixture(surface, () => gate.promise), invocation = ui.click();
      assert.equal(ui.calls[0]?.guard?.(), true, 'the storage start guard must capture the live mounted source');
      if (change === 'unmount') ui.unmount(); if (change === 'owner') ui.changeOwner();
      if (change === 'document') ui.changeDocument(); if (change === 'intent') ui.changeIntent();
      assert.equal(ui.calls[0]?.guard?.(), false, 'storage must observe the invalidated caller scope before clearing current');
      gate.resolve(true); await invocation.result; assert.deepEqual(ui.navigations, []); assert.deepEqual(ui.events, ['preservation']);
    });
  }
  for (const cycle of ['owner', ...(surface === 'closing' ? [] : ['intent'])]) test(`${surface} actual rerender ${cycle} A to B to A cannot revive pending preservation`, async () => {
    const gate = deferred<boolean>(), ui = await fixture(surface, () => gate.promise), invocation = ui.click();
    if (cycle === 'owner') { ui.changeOwner(); ui.changeOwner('owner-a'); }
    else { ui.changeIntent(); ui.restoreIntent(); }
    assert.equal(ui.calls[0]?.guard?.(), false, 'a retired render scope stays retired after its values return');
    gate.resolve(true); await invocation.result; assert.deepEqual(ui.navigations, []); assert.deepEqual(ui.events, ['preservation']);
  });
  if (surface !== 'closing') for (const modification of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    test(`${surface} actual link retains native modified-click ${JSON.stringify(modification)}`, async () => {
      const ui = await fixture(surface, async () => true), invocation = ui.click(click(modification)); await invocation.result;
      assert.equal(invocation.event.prevented, false); assert.deepEqual(ui.calls, []); assert.deepEqual(ui.navigations, []);
    });
  }
}

test('New final navigation refuses child edit after ACK while another listener waits',async()=>{const gate=deferred<boolean>(),ui=await fixture('navigation',async(_owner,guard)=>{assert.equal(guard?.(),true);await gate.promise;return guard?.()===true;});const first=ui.click();ui.changeRawInput();gate.resolve(true);await first.result;assert.deepEqual(ui.navigations,[]);});
test('actual beginNewTripNavigation refuses child edit while pointer clear is pending',async()=>{const clear=deferred<void>(),reached=deferred<void>();const ui=await fixture('navigation',async(owner,guard)=>actualFunction('lib/easyt/storage.ts','beginNewTripNavigation',{browserRecoveryGuard:(g:unknown)=>g,collectNewTripNavigationPreservation:async()=>({accepted:true,acknowledgements:[]}),browserTripPersistence:async()=>({clearCurrent:async()=>{reached.resolve();await clear.promise;return true;}}),dispatchTripStorageChange(){}})(owner,ui.target,guard));const first=ui.click();await reached.promise;ui.changeRawInput();clear.resolve();await first.result;assert.deepEqual(ui.navigations,[]);});
