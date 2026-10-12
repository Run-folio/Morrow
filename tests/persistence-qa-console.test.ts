import assert from 'node:assert/strict';
import test from 'node:test';

const prefix = '[morrovia-persistence-qa] ';
let moduleNumber = 0;
const freshOutcomes = () => import(`../lib/easyt/persistence-outcome.ts?qa=${++moduleNumber}`) as Promise<typeof import('../lib/easyt/persistence-outcome.ts')>;
const freshConfig = () => import(`../next.config.ts?qa=${++moduleNumber}`) as Promise<typeof import('../next.config.ts')>;

async function fixture<T>(options: { enabled?: string; origin?: string; search?: string; throwingConsole?: boolean }, run: (logs: string[], events: unknown[]) => Promise<T>) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalInfo = console.info;
  const originalFetch = globalThis.fetch;
  const originalFlag = process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;
  const logs: string[] = [], events: unknown[] = [];
  const target = new EventTarget();
  let forbiddenAccesses = 0;
  for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(target, key, { get() { forbiddenAccesses++; throw new Error('synthetic forbidden storage'); } });
  globalThis.fetch = () => { forbiddenAccesses++; throw new Error('synthetic forbidden network'); };
  target.addEventListener('morrovia-persistence-outcome', event => events.push((event as CustomEvent).detail));
  Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(target, {
    location: { origin: options.origin ?? 'https://staging.morrovia.com', search: options.search ?? '' },
  }) });
  process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS = options.enabled ?? '1';
  console.info = (...args: unknown[]) => {
    if (options.throwingConsole) throw new Error('synthetic unavailable console');
    assert.equal(args.length, 1);
    logs.push(String(args[0]));
  };
  try { return await run(logs, events); }
  finally {
    console.info = originalInfo;
    globalThis.fetch = originalFetch;
    if (originalFlag === undefined) delete process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;
    else process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS = originalFlag;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    assert.equal(forbiddenAccesses, 0, 'diagnostics must not use storage or network');
  }
}

function packets(logs: string[]) {
  return logs.map(line => { assert.ok(line.startsWith(prefix)); return JSON.parse(line.slice(prefix.length)); });
}

test('QA capture has a pre-submit ready marker and preserves ordered outcome/probe/ACK events', async () => {
  await fixture({}, async (logs, events) => {
    const source = await freshOutcomes();
    assert.equal(packets(logs)[0]?.kind, 'ready');
    assert.equal(packets(logs)[0]?.buildMatch, true);
    source.reportPersistenceOutcome('builder-entry', { stored: false, phase: 'probe', writeAttempted: false, scopeMatches: true, receiptPresent: true });
    source.reportPersistenceOutcome('device-recovery', { stored: false, nativeFailure: 'security', writeAttempted: true, failureBoundary: 'recovery-write' });
    source.reportExactAccountAcknowledgement();
    const captured = packets(logs);
    assert.deepEqual(captured.map(value => value.kind), ['ready', 'outcome', 'outcome', 'outcome']);
    assert.deepEqual(captured.map(value => value.sequence), [0, 1, 2, 3]);
    assert.deepEqual(captured.slice(1).map(value => value.stage), ['builder-entry', 'device-recovery', 'account-ack']);
    assert.equal(captured[1].phase, 'probe');
    assert.equal(captured[2].outcome, 'native-write-failed');
    assert.equal(captured[2].nativeFailure, 'security');
    assert.equal(captured[3].accountAcknowledged, true);
    assert.equal(events.length, 3);
  });
});

test('logging is silent when disabled or outside the exact HTTPS staging origin; events remain unchanged', async () => {
  for (const options of [
    { enabled: '0' }, { enabled: 'true' }, { origin: 'https://morrovia.com' },
    { origin: 'http://staging.morrovia.com' }, { origin: 'https://staging.morrovia.com.evil.example' },
    { origin: 'https://staging.morrovia.com:444' }, { origin: 'http://localhost:3000' },
  ]) await fixture(options, async (logs, events) => {
    const source = await freshOutcomes();
    assert.equal(source.reportPersistenceOutcome('builder-entry', { stored: true }).outcome, 'device-confirmed');
    source.reportExactAccountAcknowledgement();
    assert.deepEqual(logs, []);
    assert.equal(events.length, 2);
  });
});

test('capture uses a closed schema, query presence only and unknown rather than invented evidence', async () => {
  await fixture({ search: '?trip=PRIVATE-TRIP&recover=PRIVATE-RECOVERY&homeDraft=1&handoff=PRIVATE-TOKEN&inspire=PRIVATE-ROUTE&unrelated=PRIVATE-EXTRA' }, async logs => {
    const source = await freshOutcomes();
    source.reportPersistenceOutcome('PRIVATE-STAGE' as never, {
      stored: false, nativeFailure: 'PRIVATE-EXCEPTION', acknowledgement: 'PRIVATE-ACK',
      writeAttempted: 'PRIVATE-ATTEMPT', readbackConfirmed: 'PRIVATE-READBACK',
      ownerId: 'PRIVATE-OWNER', trip: { title: 'PRIVATE-DOCUMENT' }, message: 'PRIVATE-MESSAGE',
      token: 'PRIVATE-SECRET', failureBoundary: 'PRIVATE-BOUNDARY', phase: 'PRIVATE-PHASE',
    } as never);
    const [ready, result] = packets(logs);
    assert.deepEqual(ready.queryKeys, { trip: true, recover: true, homeDraft: true, handoff: true, inspire: true });
    assert.deepEqual(result.queryKeys, ready.queryKeys);
    assert.equal(result.stage, 'unknown');
    assert.equal(result.nativeFailure, 'unknown');
    assert.equal(result.acknowledgement, null);
    for (const key of ['writeAttempted', 'writeAccepted', 'readbackConfirmed', 'deviceCopyVerified', 'pointerAcknowledged', 'scopeMatches', 'receiptPresent', 'receiptAcknowledged', 'accountQueueEntered', 'httpStatusClass', 'accountAcknowledged']) assert.equal(result[key], null, key);
    assert.deepEqual(Object.keys(result).sort(), ['version', 'kind', 'sequence', 'buildMatch', 'queryKeys', 'sessionClass', 'browserContextClass', 'stage', 'phase', 'outcome', 'failureBoundary', 'writeAttempted', 'writeAccepted', 'readbackConfirmed', 'deviceCopyVerified', 'pointerAcknowledged', 'nativeFailure', 'acknowledgement', 'scopeMatches', 'receiptPresent', 'receiptAcknowledged', 'accountQueueEntered', 'httpStatusClass', 'accountAcknowledged'].sort());
    assert.doesNotMatch(logs.join('\n'), /PRIVATE|https?:|ownerId|title|stack|cookie|unrelated/);
  });
});

test('a throwing console cannot change event dispatch, returned outcomes or ACK dispatch', async () => {
  await fixture({ throwingConsole: true }, async (_logs, events) => {
    const source = await freshOutcomes();
    assert.equal(source.reportPersistenceOutcome('device-recovery', { stored: true, readbackConfirmed: true, pointerAcknowledged: true }).outcome, 'device-confirmed');
    source.reportExactAccountAcknowledgement();
    assert.equal(events.length, 2);
  });
});

test('fresh document initialization can be captured as two ready-delimited sequences without storage', async () => {
  await fixture({}, async logs => {
    const first = await freshOutcomes();
    first.reportPersistenceOutcome('homepage-intake', { stored: true });
    const second = await freshOutcomes();
    second.reportPersistenceOutcome('builder-entry', { stored: true });
    assert.deepEqual(packets(logs).map(value => [value.kind, value.sequence]), [['ready', 0], ['outcome', 1], ['ready', 0], ['outcome', 1]]);
  });
});

test('build enables QA output only with explicit opt-in and an exact valid expected commit', async () => {
  const keys = ['MORROVIA_QA_PERSISTENCE_DIAGNOSTICS', 'MORROVIA_QA_EXPECTED_COMMIT', 'COMMIT_REF', 'VERCEL_GIT_COMMIT_SHA'] as const;
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const sha = 'a'.repeat(40);
  try {
    for (const [enabled, commit, expected, output] of [
      ['1', sha, sha, '1'], ['0', sha, sha, '0'], ['true', sha, sha, '0'],
      ['1', sha, 'b'.repeat(40), '0'], ['1', '', '', '0'], ['1', 'PRIVATE-INVALID', 'PRIVATE-INVALID', '0'],
    ]) {
      process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS = enabled;
      process.env.COMMIT_REF = commit;
      process.env.MORROVIA_QA_EXPECTED_COMMIT = expected;
      delete process.env.VERCEL_GIT_COMMIT_SHA;
      const config = (await freshConfig()).default;
      assert.equal(config.env?.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS, output);
      assert.equal(config.env?.MORROVIA_QA_EXPECTED_COMMIT, undefined);
    }
  } finally {
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
});
