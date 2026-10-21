import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveSpreadsheetImportPlace, verifySpreadsheetImportBase, type ImportPlaceCandidate } from '../lib/easyt/spreadsheet-import-places.ts';
import type { PlanningParentConstraint } from '../lib/easyt/place-intelligence.ts';

// Only the external fetch boundary is controlled. Captured provider tuples
// exercise the real reference validation, ambiguity and geographic guards.
const recorded = JSON.parse(readFileSync(new URL('./fixtures/import-live-place-responses.json', import.meta.url), 'utf8')).responses;
const country: PlanningParentConstraint = { canonicalName: 'Philippines', placeType: 'country', parentCountries: ['Philippines'] };
const province: PlanningParentConstraint = { canonicalName: 'Siquijor', canonicalPlaceId: 'open-world:photon:R:3604058', placeType: 'region', parentCountries: ['Philippines'] };
const explicit = { mode: 'resolve' as const, parent: country };
const empty = { candidates: [] };
type Reply = { payload?: unknown; status?: number; error?: Error; beforeReply?: () => void; invalidJson?: boolean };

async function withFetch(replies: Reply[], run: (requests: URL[], signals: Array<AbortSignal | null | undefined>) => Promise<void>) {
  const original = globalThis.fetch;
  const requests: URL[] = [];
  const signals: Array<AbortSignal | null | undefined> = [];
  globalThis.fetch = async (input, init) => {
    const reply = replies[requests.length];
    requests.push(new URL(String(input), 'https://example.invalid'));
    signals.push(init?.signal);
    assert.ok(reply, 'no request beyond the bounded supplied responses');
    reply.beforeReply?.();
    if (reply.error) throw reply.error;
    return reply.invalidJson ? new Response('invalid json') : Response.json(reply.payload, { status: reply.status ?? 200 });
  };
  try { await run(requests, signals); } finally { globalThis.fetch = original; }
}

test('explicit empty qualified lookup retrieves a real city with the same country and parent constraints', async () => {
  await withFetch([{ payload: empty }, { payload: recorded.tagbilaranReference.payload }], async requests => {
    const result = await resolveSpreadsheetImportPlace('Tagbilaran', 'Philippines', 'stop', undefined, explicit);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.canonicalPlaceId, 'reference:geonames:1684497');
    assert.deepEqual(result.candidates[0]?.coordinates, [123.85219, 9.65556]);
    assert.equal(result.result, null, 'Tagbilaran is not an exact name decision for Tagbilaran City');
    assert.deepEqual(requests.map(url => Object.fromEntries(url.searchParams)), [
      { place: 'Tagbilaran, Philippines', candidates: '1', consumer: 'spreadsheet-import', country: 'Philippines', mode: 'resolve', parentName: 'Philippines', parentType: 'country', parentCountry: 'Philippines' },
      { place: 'Tagbilaran', candidates: '1', consumer: 'spreadsheet-import', country: 'Philippines', mode: 'resolve', parentName: 'Philippines', parentType: 'country', parentCountry: 'Philippines' },
    ]);
  });
});

test('fallback removes only a recognized trailing country and preserves the typed administrative qualifier', async () => {
  await withFetch([{ payload: empty }, { payload: empty }], async requests => {
    await resolveSpreadsheetImportPlace('El Nido, Palawan, Philippines', 'Philippines', 'stop', undefined, explicit);
    assert.deepEqual(requests.map(url => url.searchParams.get('place')), ['El Nido, Palawan, Philippines', 'El Nido, Palawan']);
    assert.ok(requests.every(url => url.searchParams.get('country') === 'Philippines'));
  });
});

test('successful real qualified province result does not switch to an unqualified reference identity', async () => {
  await withFetch([{ payload: recorded.siquijorProvince.payload }], async requests => {
    const result = await resolveSpreadsheetImportPlace('Siquijor', 'Philippines', 'stop', undefined, { mode: 'resolve', parent: province });
    const selected = await verifySpreadsheetImportBase(result.candidates[0]!, province);
    assert.equal(requests.length, 1);
    assert.equal(selected?.canonicalPlaceId, 'open-world:photon:R:3604064');
    assert.deepEqual(selected?.coordinates, [123.5138212, 9.2155864]);
    assert.equal(selected?.region, 'Siquijor');
    assert.ok(selected?.geographicBinding);
  });
});

test('island fallback retains its exact constraint and propagates unavailable physical verification', async () => {
  const island: PlanningParentConstraint = { canonicalName: 'Bohol', canonicalPlaceId: 'open-world:photon:R:3625899', placeType: 'island', parentCountries: ['Philippines'], bounds: { south: 9.5878967, west: 123.7813892, north: 10.1734079, east: 124.5973527 } };
  await withFetch([{ payload: empty }, { payload: { result: null }, status: 503 }], async requests => {
    await assert.rejects(resolveSpreadsheetImportPlace('Tagbilaran', 'Philippines', 'stop', undefined, { mode: 'resolve', parent: island }), /unavailable/);
    assert.equal(requests.length, 2);
    for (const url of requests) {
      assert.deepEqual(Object.fromEntries([...url.searchParams].filter(([key]) => key !== 'place')), {
        candidates: '1', consumer: 'spreadsheet-import', country: 'Philippines', mode: 'resolve', parentName: 'Bohol', parentType: 'island', parentId: 'open-world:photon:R:3625899', parentCountry: 'Philippines',
        parentSouth: '9.5878967', parentWest: '123.7813892', parentNorth: '10.1734079', parentEast: '124.5973527',
      });
    }
  });
});

for (const [label, reply] of [
  ['HTTP failure', { payload: { result: null }, status: 503 }],
  ['network error', { error: new TypeError('network unavailable') }],
  ['timeout', { error: new DOMException('timed out', 'TimeoutError') }],
  ['abort', { error: new DOMException('aborted', 'AbortError') }],
  ['invalid JSON', { invalidJson: true }],
] as const) test(`explicit lookup never falls back after ${label}`, async () => {
  await withFetch([reply], async requests => {
    await assert.rejects(resolveSpreadsheetImportPlace('Tagbilaran', 'Philippines', 'stop', undefined, explicit));
    assert.equal(requests.length, 1);
  });
});

const noFallbackCases: Array<[string, NonNullable<Parameters<typeof resolveSpreadsheetImportPlace>[4]>, string]> = [
  ['initial automatic intake', {}, 'Philippines'],
  ['explicit place search without a selected parent', { mode: 'resolve' as const }, 'Philippines'],
  ['base search without a country constraint', { mode: 'resolve' as const, parent: { canonicalName: 'An area', placeType: 'region' as const, parentCountries: [] } }, ''],
];
for (const [label, options, mappedCountry] of noFallbackCases) test(`${label} cannot start the base-only fallback`, async () => {
  await withFetch([{ payload: empty }], async requests => {
    assert.deepEqual(await resolveSpreadsheetImportPlace('Tagbilaran', mappedCountry, 'stop', undefined, options), { result: null, candidates: [] });
    assert.equal(requests.length, 1);
  });
});

for (const [label, payload] of [['missing', { result: null }], ['null', { candidates: null }]] as const) test(`a ${label} candidate array is not a successful empty lookup`, async () => {
  await withFetch([{ payload }], async requests => {
    await assert.rejects(resolveSpreadsheetImportPlace('Tagbilaran', 'Philippines', 'stop', undefined, explicit), /unavailable/);
    assert.equal(requests.length, 1);
  });
});

for (const [label, candidates] of [['object', { length: 0 }], ['string', '']] as const) test(`a malformed ${label} candidate array cannot start a fallback`, async () => {
  await withFetch([{ payload: { candidates } }], async requests => {
    await assert.rejects(resolveSpreadsheetImportPlace('Tagbilaran', 'Philippines', 'stop', undefined, explicit));
    assert.equal(requests.length, 1);
  });
});

for (const [label, changes] of [['wrong country', { country: 'Indonesia' }], ['wrong region', { region: 'Another province' }]] as const) {
  for (const fallback of [false, true]) test(`${fallback ? 'fallback' : 'primary'} ${label} is refused without a further query`, async () => {
    const payload = { candidates: [{ ...recorded.siquijorProvince.payload.candidates[0], ...changes }] };
    await withFetch([...(fallback ? [{ payload: empty }] : []), { payload }], async requests => {
      assert.deepEqual(await resolveSpreadsheetImportPlace('Siquijor', 'Philippines', 'stop', undefined, { mode: 'resolve', parent: province }), { result: null, candidates: [] });
      assert.equal(requests.length, fallback ? 2 : 1);
    });
  });
}

test('distinct real settlement identities remain explicit choices after the fallback', async () => {
  const candidates: ImportPlaceCandidate[] = [...recorded.siquijorReference.payload.candidates, ...recorded.siquijorProvince.payload.candidates];
  await withFetch([{ payload: empty }, { payload: { candidates } }], async requests => {
    const result = await resolveSpreadsheetImportPlace('Siquijor', 'Philippines', 'stop', undefined, explicit);
    assert.equal(result.result, null);
    assert.equal(result.candidates.length, 2);
    const chosen = result.candidates.find(candidate => candidate.canonicalPlaceId === 'open-world:photon:R:3604064')!;
    const accepted = await verifySpreadsheetImportBase(chosen, country);
    assert.equal(accepted?.canonicalPlaceId, 'open-world:photon:R:3604064');
    assert.deepEqual(accepted?.coordinates, [123.5138212, 9.2155864]);
    assert.equal(requests.length, 2);
  });
});

test('an empty fallback is final and does not loop', async () => {
  await withFetch([{ payload: empty }, { payload: empty }], async requests => {
    assert.deepEqual(await resolveSpreadsheetImportPlace('Tagbilaran', 'Philippines', 'stop', undefined, explicit), { result: null, candidates: [] });
    assert.equal(requests.length, 2);
  });
});

for (const duringFallback of [false, true]) test(`cancellation during ${duringFallback ? 'fallback' : 'primary'} cannot adopt or launch more work`, async () => {
  const controller = new AbortController();
  await withFetch([...(duringFallback ? [{ payload: empty }] : []), { payload: recorded.tagbilaranReference.payload, beforeReply: () => controller.abort() }], async (requests, signals) => {
    await assert.rejects(resolveSpreadsheetImportPlace('Tagbilaran', 'Philippines', 'stop', controller.signal, explicit), { name: 'AbortError' });
    assert.equal(requests.length, duringFallback ? 2 : 1);
    assert.ok(signals.every(signal => signal === controller.signal));
  });
});

test('a cancelled empty primary response cannot launch the fallback', async () => {
  const controller = new AbortController();
  await withFetch([{ payload: empty, beforeReply: () => controller.abort() }], async requests => {
    await assert.rejects(resolveSpreadsheetImportPlace('Tagbilaran', 'Philippines', 'stop', controller.signal, explicit), { name: 'AbortError' });
    assert.equal(requests.length, 1);
  });
});

test('conflicting imported and mapped countries make no primary or fallback request', async () => {
  await withFetch([], async requests => {
    assert.deepEqual(await resolveSpreadsheetImportPlace('Tagbilaran, Philippines', 'Indonesia', 'stop', undefined, explicit), { result: null, candidates: [] });
    assert.equal(requests.length, 0);
  });
});
