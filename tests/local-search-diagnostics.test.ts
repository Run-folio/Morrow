import assert from 'node:assert/strict';
import test from 'node:test';
import { localSearchProviderOutcome, providerResults } from '../lib/easyt/local-search-strategy.ts';

for (const [name, expected] of [['TimeoutError','timeout'],['AbortError','aborted'],['SyntaxError','malformed'],['TypeError','unavailable']] as const) {
  test(`sanitized ${expected} outcome retains timing without error/request material`, async () => {
    const records: unknown[] = []; let at = 10;
    const outcome = await localSearchProviderOutcome(async () => {
      at = 75; const error = new Error('SECRET bearer account-42 https://private.invalid?trip=personal'); error.name = name;
      Object.assign(error, { body: 'RAW RESPONSE', request: { credentials: 'SECRET' }, cause: new Error('nested secret') }); throw error;
    }, { provider: 'osm', now: () => at, record: value => records.push(value) });
    assert.deepEqual(outcome, {state: 'failed', places: []});
    assert.deepEqual(records, [{provider: 'osm', outcome: expected, durationMs: 65}]);
    assert.doesNotMatch(JSON.stringify(records), /SECRET|account|personal|RAW|private|cause|request/i);
  });
}
test('ready and completed empty diagnostics never include venue facts or counts', async () => {
  const records: unknown[] = [];
  const diagnostic = { provider: 'photon' as const, record: (value: unknown) => records.push(value), now: () => 0 };
  const place = { name: 'PRIVATE PLACE', coordinates: [12,34] };
  assert.deepEqual(await localSearchProviderOutcome(async () => [place], diagnostic), {state:'ready',places:[place]});
  assert.deepEqual(await localSearchProviderOutcome(async () => [], diagnostic), {state:'empty',places:[]});
  assert.deepEqual(records,[{provider:'photon',outcome:'ready',durationMs:0},{provider:'photon',outcome:'empty',durationMs:0}]);
});
test('malformed provider collection is classified without serializing the payload', async () => {
  const records: unknown[] = [];
  assert.equal((await localSearchProviderOutcome(async () => providerResults({error:'PRIVATE RESPONSE'}, 'elements'), {provider:'osm',record:value=>records.push(value),now:()=>0})).state,'failed');
  assert.deepEqual(records,[{provider:'osm',outcome:'malformed',durationMs:0}]);
});
test('a broken diagnostic sink cannot alter usable provider results or cause retries', async () => {
  let calls = 0;
  assert.deepEqual(await localSearchProviderOutcome(async()=>{calls++;return ['place'];},{provider:'photon',record:()=>{throw new Error('broken sink')},now:()=>0}),{state:'ready',places:['place']});
  assert.equal(calls,1);
});
test('existing caller without diagnostics retains the old result contract', async () => {
  assert.deepEqual(await localSearchProviderOutcome(async()=>[]),{state:'empty',places:[]});
});

test('HTTP classification captures numeric status without reading an error body', async () => {
  const { localSearchProviderJson, localSearchDiagnosticServerTiming } = await import('../lib/easyt/local-search-strategy.ts');
  let bodyReads = 0; const records: any[] = [];
  const outcome = await localSearchProviderOutcome(async()=>localSearchProviderJson({ok:false,status:429,json:async()=>{bodyReads++;throw new Error('PRIVATE BODY')}}).then(()=>[]),{provider:'osm',record:value=>records.push(value),now:()=>0});
  assert.equal(outcome.state,'failed'); assert.equal(bodyReads,0);
  assert.equal(localSearchDiagnosticServerTiming(records),'local-osm;dur=0;desc="http_error:429"');
});
test('header formatting rejects non-whitelisted fields and unsafe status/duration values', async () => {
  const { localSearchDiagnosticServerTiming } = await import('../lib/easyt/local-search-strategy.ts');
  const invalid = [
    {provider:'osm\r\nSecret: personal',outcome:'unavailable',durationMs:1},
    {provider:'osm',outcome:'SECRET BODY',durationMs:1},
    {provider:'osm',outcome:'ready',durationMs:NaN},
    {provider:'osm',outcome:'ready',durationMs:-1},
  ];
  assert.equal(localSearchDiagnosticServerTiming(invalid as any),'');
  assert.equal(localSearchDiagnosticServerTiming([{provider:'photon',outcome:'http_error',durationMs:3.5,status:999,request:'SECRET',body:'PRIVATE'}] as any),'local-photon;dur=4;desc="http_error"');
});
test('a diagnostic clock failure cannot prevent the provider request or change its result', async () => {
  let calls = 0; const records: unknown[] = [];
  assert.deepEqual(await localSearchProviderOutcome(async()=>{calls++;return ['place'];},{provider:'photon',record:value=>records.push(value),now:()=>{throw new Error('SECRET CLOCK')}}),{state:'ready',places:['place']});
  assert.equal(calls,1);assert.deepEqual(records,[{provider:'photon',outcome:'ready',durationMs:0}]);
});
