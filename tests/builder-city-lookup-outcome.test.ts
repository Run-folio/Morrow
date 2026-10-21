import assert from 'node:assert/strict';
import test from 'node:test';
import {actualCallbackHarness,lima,region} from './helpers/builder-handoff-callback.ts';

test('healthy-empty lookup for a known city retains its route and exposes unavailable retry instead of identity ambiguity',async()=>{
 const h=actualCallbackHarness(),before=structuredClone(h.trip());await h.send([]);
 assert.equal(h.scope.lookupSession.statuses.get(h.mention.mentionId),'failed');assert.deepEqual(h.choices(),[]);
 assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),before);
});
test('region-only results cannot turn a known city into area planning',async()=>{
 const h=actualCallbackHarness(),before=structuredClone(h.trip());await h.send([region]);
 assert.equal(h.scope.lookupSession.statuses.get(h.mention.mentionId),'failed');assert.deepEqual(h.choices(),[]);assert.deepEqual(h.trip(),before);
});
test('genuine multiple compatible city identities still require explicit identity confirmation',async()=>{
 const h=actualCallbackHarness(),candidate=lima.choices.find((choice:any)=>choice.providerId===lima.expected.providerId);
 assert(candidate);await h.send([candidate,{...candidate,providerId:'fixture:second-compatible-city'}]);
 assert.equal(h.scope.lookupSession.statuses.get(h.mention.mentionId),'needs-confirmation');assert.equal(h.choices()[0]?.choices.length,2);assert.equal(h.accepted(),0);
});
