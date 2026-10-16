import assert from 'node:assert/strict';
import test from 'node:test';
import * as handoff from '../lib/easyt/home-trip-handoff.ts';
import {selectedStopsHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {builderBrowserTestsEnabled,renderBuilder} from './helpers/builder-render.ts';
import {homepageInputStorageKey} from '../lib/easyt/private-browser-context.ts';

function input(text='') {
  const snapshot=selectedStopsHomepageInput(null,[['lima','Lima'],['bogota','Bogotá'],['cartagena','Cartagena']]);
  snapshot.origin={state:'selected',value:selectedTransferPlace('London Gatwick Airport','United Kingdom','reference:ourairports:2429','endpoint')};
  snapshot.tripType={state:'selected',value:'one_way'};
  snapshot.dates={state:'selected',value:{start:'2026-11-01',end:'2026-11-15'}};
  snapshot.entries.push({id:'unfinished-extra',text,selection:null});
  return JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
}

test('submit preparation discards only unselected draft occurrences and preserves exact selected order',()=>{
  assert.equal(typeof handoff.homepageSnapshotForStopSubmission,'function');
  const snapshot=input('  unfinished query  '),before=structuredClone(snapshot);
  snapshot.entries.splice(1,0,{id:'blank-middle',text:'',selection:null});
  snapshot.entries.push({...snapshot.entries[0],id:'repeated-lima'});
  const prepared=handoff.homepageSnapshotForStopSubmission(snapshot);
  assert.deepEqual(prepared.entries,snapshot.entries.filter(e=>e.selection));
  assert.deepEqual(prepared.entries.map(e=>e.id),['lima','bogota','cartagena','repeated-lima']);
  assert.deepEqual(prepared.origin,before.origin);
  assert.equal(snapshot.entries.length,6,'preparation never mutates editable input');
  assert.equal(handoff.homepagePreflightIssues(prepared).length,0);
  assert.equal(handoff.projectHomepageInput({snapshot:prepared,profile:null,handoffId:'test'}).ok,true);
});

test('submit preparation preserves Describe input and genuine unresolved-only destination/origin validation',()=>{
  assert.equal(typeof handoff.homepageSnapshotForStopSubmission,'function');
  const describe={...input('retain this draft'),mode:'describe' as const,prompt:'Lima for two weeks'};
  assert.equal(handoff.homepageSnapshotForStopSubmission(describe),describe);
  for(const entries of [[],[{id:'only',text:'',selection:null}],[{id:'only',text:'Unselected place',selection:null}]]) {
    const snapshot={...input(),entries};
    assert.equal(handoff.homepageSnapshotForStopSubmission(snapshot),snapshot);
    assert.ok(handoff.homepagePreflightIssues(snapshot).some(i=>i.field==='destinations'));
  }
  const unresolvedOrigin={...input(),origin:{state:'untouched' as const},originInput:'Unselected airport'};
  assert.ok(handoff.homepagePreflightIssues(handoff.homepageSnapshotForStopSubmission(unresolvedOrigin)).some(i=>i.field==='origin'));
  const confirmed={...input(),entries:input().entries.filter(e=>e.selection)};
  assert.equal(handoff.homepageSnapshotForStopSubmission(confirmed),confirmed);
});

for(const path of ['/','/journey/new']) for(const text of ['', 'Unselected optional city']) {
  test(`actual ${path} submit discards ${text?'typed':'blank'} optional stop while a provider response is pending`,{skip:!builderBrowserTestsEnabled,timeout:35000},async t=>{
    const snapshot=input(text),expected=snapshot.entries.filter(e=>e.selection);
    const h=await renderBuilder({path,storedInput:{snapshot},seedRecovery:false});
    let release=()=>{};let pending=false;
    try {
      if(text) {
        await h.page.route('**/api/journey-geocode?*',async (route:any)=>{
          if(new URL(route.request().url()).searchParams.get('place')!==text){await route.continue();return;}
          pending=true;await new Promise<void>(resolve=>{release=resolve});
          await route.fulfill({json:{candidates:[{canonicalPlaceId:'tokyo',name:'Tokyo',country:'Japan',coordinates:[139.6917,35.6895],kind:'city'}]}}).catch(()=>{});
        });
        const field=h.page.getByRole('combobox',{name:'Destination',exact:true});
        if(!await field.count())await h.page.locator('button[aria-controls$="-editor"]').click();
        await field.fill(text+'x');await field.fill(text);
        await assertEventually(()=>pending,'autocomplete request must actually be in flight');
      }
      await h.page.getByRole('button',{name:'Plan my trip',exact:true}).click();
      await h.page.locator('[data-builder-edit-session="active"]').waitFor({timeout:5000});
      release();
      await h.page.getByText('Saved on this device',{exact:true}).first().waitFor();
      const read=()=>h.page.evaluate((key:string)=>{
        const stored=JSON.parse(localStorage.getItem(key)??'null');
        const records=Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:v2:guest:')).map(k=>JSON.parse(localStorage.getItem(k)!));
        return {stored,records};
      },homepageInputStorageKey(null));
      const first=await read();
      assert.deepEqual(first.stored.snapshot.entries,expected);
      assert.deepEqual(first.stored.snapshot.origin,snapshot.origin);
      assert.ok(first.records.some((r:any)=>r.trip?.stops.length===3));
      assert.deepEqual(first.records.at(-1).trip.stops.map((s:any)=>s.name),expected.map(e=>e.selection!.name));
      // Let the cancelled provider continuation finish; it must not resurrect a draft or change the accepted route.
      await h.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const after=await read();assert.deepEqual(after.stored.snapshot.entries,expected);
      assert.equal(await h.page.getByText('Select each destination from the results.',{exact:true}).count(),0);
      assert.deepEqual(h.errors,[]);
    } catch(error) {t.diagnostic((await h.page.locator('body').innerText()).slice(-2500));throw error;}
    finally {release();await h.close();}
  });
}

async function assertEventually(predicate:()=>boolean,message:string) {
  for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.fail(message);
}
