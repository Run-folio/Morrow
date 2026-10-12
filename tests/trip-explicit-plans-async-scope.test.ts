import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function harness() {
  const states: any[] = [];
  let cursor = 0;
  const hooks = {
    useState(initial: any) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value: any) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef(value: any) { return states[cursor++] ??= { current: value }; },
    useMemo(factory: () => any) { return factory(); },
    useEffect() {},
  };
  const Button = () => null, Select = () => null, Dialog = () => null;
  const imports: Record<string, any> = {
    react: hooks, 'lucide-react': {}, '@/lib/easyt/trip-explicit-plans': {
      explicitVisitIntentsForTrip: () => [{ mentionId: 'same-visit-id', name: 'Museum visit', bases: [{ stop: { id: 'stop-a', name: 'Tokyo' } }] }],
      fixedCommitmentPlansForTrip: () => [],
      explicitVisitDayOptions: () => [{ day: { id: 'preferred-day', dayNumber: 1, stopId: 'stop-a' } }, { day: { id: 'selected-day', dayNumber: 2, stopId: 'stop-a' } }],
    },
    '@/lib/easyt/itinerary-ideas': { preferredItineraryIdeaDay: () => ({ id: 'preferred-day' }) },
    './easyt-controls': { EasyTButton: Button, EasyTSelect: Select, EasyTLinkButton: () => null },
    './morrovia-feedback': { MorroviaConfirmationDialog: Dialog }, './trip-explicit-plans.module.css': { default: {} },
  };
  const source = readFileSync('components/easyt/trip-explicit-plans.tsx', 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', js)((id: string) => id in imports ? imports[id] : require(id), module, module.exports);
  let trip = { id: 'trip-a', ownerId: 'owner-a', stops: [{ id: 'stop-a', name: 'Tokyo' }], planItems: [] };
  const requests: Array<{ ownerId: string; tripId: string; visitId: string }> = [];
  const render = () => {
    cursor = 0;
    const outgoing = { ...trip };
    return module.exports.default({ trip, variant: 'itinerary', onSchedule: () => true,
      onRemoveVisit: async (visitId: string) => { requests.push({ ownerId: outgoing.ownerId, tripId: outgoing.id, visitId }); return true; } });
  };
  function find(node: any, type: any): any {
    if (!node) return null;
    if (Array.isArray(node)) return node.map(child => find(child, type)).find(Boolean);
    if (node.type === type) return node;
    return find(node.props?.children, type);
  }
  const removeButton = (node: any): any => {
    if (!node) return null;
    if (Array.isArray(node)) return node.map(removeButton).find(Boolean);
    if (node.type === Button && node.props['aria-label'] === 'Remove requested visit Museum visit') return node;
    return removeButton(node.props?.children);
  };
  return { render, find, removeButton, Select, Dialog, requests,
    switchTrip: (change: { id?: string; ownerId?: string }) => { trip = { ...trip, ...change }; } };
}

for (const transition of [{ ownerId: 'owner-b' }, { id: 'trip-b' }]) {
  test(`explicit-plan intent and day selection belong to the exact ${transition.ownerId ? 'owner' : 'document'} that opened them`, async () => {
    const h = harness();
    h.find(h.render(), h.Select).props.onChange({ target: { value: 'selected-day' } });
    h.removeButton(h.render()).props.onClick();
    const oldConfirmation = h.find(h.render(), h.Dialog);
    assert.equal(oldConfirmation.props.open, true);
    h.switchTrip(transition);
    const switched = h.render();
    assert.equal(h.find(switched, h.Select).props.value, 'preferred-day', 'the old day choice is not reused in another scope');
    assert.equal(h.find(switched, h.Dialog).props.open, false, 'the old removal intent is not offered for the next trip');
    h.find(switched, h.Dialog).props.onConfirm();
    oldConfirmation.props.onConfirm();
    await tick();
    assert.equal(h.requests.length, 0, 'neither a current nor retained callback can reuse the obsolete confirmation');
    h.removeButton(h.render()).props.onClick();
    h.find(h.render(), h.Dialog).props.onConfirm();
    await tick();
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].ownerId, transition.ownerId ?? 'owner-a');
    assert.equal(h.requests[0].tripId, transition.id ?? 'trip-a');
  });
}

test('switching away and back cannot revive an earlier explicit-plan confirmation or day choice', async () => {
  const h = harness();
  h.find(h.render(), h.Select).props.onChange({ target: { value: 'selected-day' } });
  h.removeButton(h.render()).props.onClick();
  const old = h.find(h.render(), h.Dialog);
  h.switchTrip({ ownerId: 'owner-b' }); h.render();
  h.switchTrip({ ownerId: 'owner-a' });
  const returned = h.render();
  assert.equal(h.find(returned, h.Dialog).props.open, false);
  assert.equal(h.find(returned, h.Select).props.value, 'preferred-day');
  old.props.onConfirm(); await tick(); assert.deepEqual(h.requests, []);
});

test('a new confirm click cannot reuse an old removal intent against the next account document', async () => {
  const h = harness();
  h.removeButton(h.render()).props.onClick();
  h.switchTrip({ ownerId: 'owner-b', id: 'trip-b' });
  h.find(h.render(), h.Dialog).props.onConfirm();
  await tick();
  assert.equal(h.requests.length, 0, 'no request is authorized by the previous scope’s confirmation');
});
