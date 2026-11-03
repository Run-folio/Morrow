import assert from 'node:assert/strict';
import test from 'node:test';
import { installStoryFetch } from '../components/easyt/storybook/story-fetch-fixture.ts';

test('story fixture handles its endpoint and forwards unmatched requests unchanged', async () => {
 const calls: unknown[][]=[];
 const native=async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push([input,init]);return new Response('native');};
 const host={fetch:native as typeof fetch};
 const cleanup=installStoryFetch(async(input,init,forward)=>String(input)==='/synthetic'?new Response('fixture'):forward(input,init),host);
 assert.equal(await (await host.fetch('/synthetic')).text(),'fixture');
 const options={method:'POST',body:'synthetic'};assert.equal(await (await host.fetch('/other',options)).text(),'native');
 assert.deepEqual(calls,[['/other',options]]);cleanup();assert.equal(host.fetch,native);
});
test('unmount cleanup restores native fetch exactly and is repeatable',async()=>{
 const native=async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response('native'),host={fetch:native as typeof fetch};
 const cleanup=installStoryFetch(async()=>new Response('fixture'),host);
 assert.notEqual(host.fetch,native);cleanup();cleanup();assert.equal(host.fetch,native);
 assert.equal(await(await host.fetch('/synthetic')).text(),'native');
});
test('cleanup cannot replace a newer fetch owner',()=>{
 const native=async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response('native'),later=async()=>new Response('later'),host={fetch:native as typeof fetch};
 const cleanup=installStoryFetch(async()=>new Response('fixture'),host);host.fetch=later;cleanup();assert.equal(host.fetch,later);
});
