import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const script = (await build({ entryPoints: ['components/easyt/calendar-export-dialog.tsx'], bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', jsx: 'automatic', plugins: [{ name: 'calendar-lifecycle', setup(builder) {
  builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'hooks' }));
  builder.onLoad({ filter: /.*/, namespace: 'hooks' }, () => ({ contents: `export const forwardRef=f=>globalThis.__react.forwardRef(f); export const useState=v=>globalThis.__hooks.state(v); export const useRef=v=>globalThis.__hooks.ref(v); export const useEffect=(f,d)=>globalThis.__hooks.effect(f,d); export const useLayoutEffect=useEffect;export const useCallback=f=>f;export const useId=()=>"calendar";` }));
  builder.onResolve({ filter: /\.module\.css$/ }, args => ({ path: args.path, namespace: 'css' }));
  builder.onLoad({ filter: /.*/, namespace: 'css' }, () => ({ contents: 'export default new Proxy({}, {get:(_,key)=>String(key)});' }));
  builder.onResolve({ filter: /^@\/lib\/analytics$/ }, () => ({ path: 'analytics', namespace: 'analytics' }));
  builder.onLoad({ filter: /.*/, namespace: 'analytics' }, () => ({ contents: 'export const trackEvent=()=>{};' }));
} }] })).outputFiles[0].text;
function text(node) { return node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children); }
function elements(node) { return !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(elements) : [node, ...elements(node.props?.children)]; }
function mount(payload, ok = true) {
  let index = 0; const values = [], deps = [], pending = [], calls = []; let closed = false;
  const hooks = {
    state(initial) { const id = index++; if (!(id in values)) values[id] = typeof initial === 'function' ? initial() : initial; return [values[id], value => { values[id] = typeof value === 'function' ? value(values[id]) : value; }]; },
    ref(initial) { const id = index++; return values[id] ??= { current: initial }; },
    effect(effect, next) { const id = index++; if (!deps[id] || next.some((value, i) => !Object.is(value, deps[id][i]))) { deps[id] = next; pending.push(effect); } },
  };
  const sandbox = { module: { exports: {} }, exports: {}, require, __react: require('react'), __hooks: hooks, window: { location: { href: 'https://staging.morrovia.com/journey/trip/itinerary' } }, URL, fetch: async (url, options) => { calls.push({ url, options }); return { ok, json: async () => payload }; } };
  sandbox.exports = sandbox.module.exports; vm.runInNewContext(script, sandbox);
  const render = () => { index = 0; return sandbox.module.exports.CalendarExportDialog({ tripId: 'trip', ownerId: 'owner', savedRevision: 'revision', settled: true, onClose: () => { closed = true; } }); };
  return { render, calls, get closed() { return closed; }, async effects() { while (pending.length) pending.shift()(); await new Promise(resolve => setImmediate(resolve)); } };
}

test('unconfigured status without grant or binding lists stays in the dialog and makes no calendar writes', async () => {
  const app = mount({ configured: false }); app.render(); await app.effects();
  let tree; assert.doesNotThrow(() => { tree = app.render(); });
  assert.match(text(tree), /Calendar export is not available yet/);
  assert.doesNotMatch(text(tree), /Connect Google|Preview events|Create calendar and add events/);
  assert.equal(app.calls.length, 1); assert.equal(app.calls[0].options.method, 'GET');
  assert.equal(app.calls[0].options.headers['x-morrovia-expected-owner'], 'owner');
  elements(tree).find(node => text(node) === 'Close' && node.props?.onClick).props.onClick();
  assert.equal(app.closed, true);
});

test('configured status still offers consent without submitting or sending any event', async () => {
  const app = mount({ configured: true, savedRevision: 'revision', eligibleCount: 1, events: [], excluded: [], blocked: [], grants: [], bindings: [], hasPreviousSend: false }); app.render(); await app.effects();
  const tree = app.render(); assert.match(text(tree), /Connect Google/); assert.doesNotMatch(text(tree), /not available yet/);
  assert.equal(app.calls.length, 1); assert.equal(app.calls[0].options.method, 'GET');
});

test('owner rejection remains a recoverable dialog error and sends no calendar mutation', async () => {
  const app = mount({ code: 'UNAUTHORIZED' }, false); app.render(); await app.effects();
  const tree = app.render(); assert.match(text(tree), /Sign in and save this trip/);
  assert.equal(app.calls.length, 1); assert.equal(app.calls[0].options.method, 'GET');
});
