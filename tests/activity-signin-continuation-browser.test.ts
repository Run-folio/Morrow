import assert from 'node:assert/strict';
import test from 'node:test';
import {builderBrowserTestsEnabled,renderBuilder} from './helpers/builder-render.ts';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {tripSyncSignInPath} from '../lib/easyt/trip-continuity.ts';

test('actual signed-in legacy activity return waits for explicit Save, then guarded continuation retains guest bytes',
  {skip:!builderBrowserTestsEnabled,timeout:45000},async()=>{
  const fixture=homeRecoveryFixture(),guest={...fixture.trip,status:'planned' as const};
  const callback=new URL('http://fixture.invalid'+tripSyncSignInPath(guest.id)).searchParams.get('next')!;
  assert.equal(callback,`/journey/plan?trip=${guest.id}&save=1&recover=1`);
  let account:any=null;const writes:string[]=[];
  const h=await renderBuilder({path:'/journey/plan',query:callback.slice(callback.indexOf('?')),ownerId:'owner-a',
    initialTrip:guest,draft:fixture.draft,storedInput:{snapshot:fixture.snapshot,receipt:fixture.intake.completed},
    accountRequest:({method,trip})=>{
      if(method==='GET')return account?{status:200,body:{trip:account}}:{status:404,body:{error:'Trip not found'}};
      writes.push(method);account=canonicalTripForOwner('owner-a',trip as any);return{status:method==='POST'?201:200,body:{trip:account,outcome:'promoted'}};
    }});
  try {
    await h.page.getByText('This trip is still on this device',{exact:true}).waitFor();
    assert.equal(await h.page.getByRole('heading',{name:'This trip is unavailable',exact:true}).count(),0);
    assert.deepEqual(writes,[],'sign-in and legacy URL must not authorize an account write');
    const source=await h.page.evaluate(()=>Object.fromEntries(Object.keys(localStorage)
      .filter(k=>k.includes(':guest:')||k==='easyt-home-trip-draft')
      .map(k=>[k,localStorage.getItem(k)])));
    const save=h.page.getByRole('link',{name:'Save trip to my account',exact:true});
    assert.equal(await save.getAttribute('href'),`/journey/${guest.id}/explore?saved=1`);
    await save.click();
    await h.page.waitForURL((u:URL)=>u.pathname===`/journey/${guest.id}/explore`);
    await h.page.getByRole('region',{name:'Explore recommendations',exact:true}).waitFor();
    assert.ok(writes.some((method:string)=>method==='POST'),'only the explicit save action may invoke existing promotion');
    assert.equal(account.id,guest.id);assert.equal(account.ownerId,'owner-a');
    assert.deepEqual(account.stops.map((s:any)=>s.name),guest.stops.map(s=>s.name));
    const after=await h.page.evaluate((keys:string[])=>Object.fromEntries(keys.map((k:string)=>[k,localStorage.getItem(k)])),Object.keys(source));
    assert.deepEqual(after,source,'all original guest records and receipt remain unchanged');
    assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
