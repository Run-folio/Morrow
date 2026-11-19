import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceBuilderNotice, builderNoticeSuppressed, expireBuilderNotice, startBuilderNotice,
  type BuilderNoticeInput,
} from '../app/journey/new/builder-success-notice.ts';

const base = { scopeKey: 'owner:trip' };
function scenario(initial: BuilderNoticeInput = base) {
  let state = startBuilderNotice(initial);
  return {
    get state() { return state; },
    observe(change: Partial<BuilderNoticeInput>) {
      state = advanceBuilderNotice(state, { ...base, ...change }, Date.now());
      return state.notice?.kind ?? null;
    },
    expire(notice = state.notice) {
      if (notice) state = expireBuilderNotice(state, notice, Date.now());
      return state.notice?.kind ?? null;
    },
  };
}

test('first render and restored in-flight writes do not announce; only observed pending to success does', () => {
  const first = scenario({ ...base, save: 'success', saveKey: 1 });
  assert.equal(first.state.notice, null);
  assert.equal(first.observe({ save: 'pending', saveKey: 1 }), null);
  assert.equal(first.observe({ save: 'success', saveKey: 1 }), null, 'same committed revision is quiet');
  const restored = scenario({ ...base, save: 'pending', saveKey: 2 });
  assert.equal(restored.observe({ save: 'success', saveKey: 2 }), null);
  const next = scenario();
  assert.equal(next.observe({ save: 'success', saveKey: 1 }), null);
  next.observe({ save: 'pending', saveKey: 2 });
  assert.equal(next.observe({ save: 'success', saveKey: 2 }), 'save');
});

test('expires in exactly four seconds and same-key autosave cycles do not mint another notice', ({ mock }) => {
  mock.timers.enable({ apis: ['Date'], now: 10_000 });
  const flow = scenario();
  flow.observe({ save: 'pending', saveKey: 3 });
  assert.equal(flow.observe({ save: 'success', saveKey: 3 }), 'save');
  const original = flow.state.notice;
  mock.timers.tick(3_999);
  assert.equal(flow.observe({ save: 'success', saveKey: 3 }), 'save');
  assert.equal(flow.state.notice, original, 'rerender must not reset notice or expiry');
  assert.equal(flow.expire(), 'save');
  mock.timers.tick(1);
  assert.equal(flow.expire(), null);
  flow.observe({ save: 'pending', saveKey: 3 });
  assert.equal(flow.observe({ save: 'success', saveKey: 3 }), null);
  flow.observe({ save: 'pending', saveKey: 4 });
  assert.equal(flow.observe({ save: 'success', saveKey: 4 }), 'save');
});

test('pending and errors dismiss notices immediately; a stale timer cannot dismiss a replacement', ({ mock }) => {
  mock.timers.enable({ apis: ['Date'], now: 20_000 });
  const flow = scenario();
  flow.observe({ save: 'pending' });
  flow.observe({ save: 'success' });
  const old = flow.state.notice;
  mock.timers.tick(1_000);
  assert.equal(flow.observe({ route: 'pending' }), null);
  assert.equal(flow.observe({ route: 'success' }), 'route');
  mock.timers.tick(3_000);
  assert.equal(flow.expire(old), 'route');
  assert.equal(builderNoticeSuppressed({ ...base, save: 'error' }), true);
  assert.equal(flow.observe({ route: 'success', save: 'error' }), null);
  assert.equal(flow.observe({ route: 'success' }), null);
});

test('undo/recovery suppress and consume notice, including earlier in-flight operations', () => {
  const flow = scenario();
  flow.observe({ save: 'pending', saveKey: 2 });
  assert.equal(flow.observe({ save: 'success', saveKey: 2, undoActive: true }), null);
  assert.equal(flow.observe({ save: 'success', saveKey: 2 }), null);
  flow.observe({ save: 'pending', saveKey: 2 });
  assert.equal(flow.observe({ save: 'success', saveKey: 2 }), null);
  flow.observe({ route: 'pending', routeKey: 'A' });
  flow.observe({ route: 'pending', routeKey: 'A', blocked: true });
  flow.observe({ route: 'pending', routeKey: 'A' });
  assert.equal(flow.observe({ route: 'success', routeKey: 'A' }), null);
  flow.observe({ route: 'pending', routeKey: 'B' });
  assert.equal(flow.observe({ route: 'success', routeKey: 'B' }), 'route');
  assert.equal(flow.observe({ route: 'success', routeKey: 'B', undoActive: true }), null);
  assert.equal(flow.observe({ route: 'success', routeKey: 'B' }), null);
});

test('partial succeeds while another operation is pending or errored without later toast; new scope is clean', () => {
  const flow = scenario();
  flow.observe({ save: 'pending', route: 'pending' });
  assert.equal(flow.observe({ save: 'success', route: 'pending' }), null);
  assert.equal(flow.observe({ save: 'success', route: 'error' }), null);
  assert.equal(flow.observe({ save: 'success', route: 'idle' }), null);
  flow.observe({ route: 'pending', routeKey: 1 });
  assert.equal(flow.observe({ route: 'success', routeKey: 1 }), 'route');
  const other = { scopeKey: 'other-owner:trip' };
  assert.equal(flow.observe({ ...other, route: 'success', routeKey: 1 }), null);
  flow.observe({ ...other, route: 'pending', routeKey: 2 });
  assert.equal(flow.observe({ ...other, route: 'success', routeKey: 2 }), 'route');
});
