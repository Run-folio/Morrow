// Production persistence facade and real IndexedDB adapter over a transaction
// model. No browser session, provider, account service or owner data is read.
import {createTripCreationToken,readReservedTripCreation} from '../lib/easyt/trip-creation-provenance.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { IndexedDbModel } from './helpers/recovery-indexeddb-model.ts';
import { homeRecoveryFixture } from './helpers/home-recovery-fixture.ts';
import { homepageReceiptForProjection, HOME_TRIP_DRAFT_KEY } from '../lib/easyt/home-trip-handoff.ts';
import { homepageInputStorageKey, tripReceiptStorageKey,tripCreationStorageKey } from '../lib/easyt/private-browser-context.ts';
import { saveTripRecovery, loadTripRecovery, saveExplicitGuestTripForOwner, currentTripStorageKey, tripRecoveryStorageKey } from '../lib/easyt/storage.ts';
import { canonicalTripForOwner } from '../lib/easyt/trip-promotion.ts';
import { prepareAcceptedBuilderEdit } from '../lib/easyt/trip-builder-edit.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
import { createBuilderInputDraft } from '../lib/easyt/trip-builder-input-draft.ts';
import { createDurableHomepagePersistence } from '../lib/easyt/homepage-persistence.ts';
import { browserRecoveryDriver } from '../lib/easyt/browser-recovery-persistence.ts';

test('guest intake provenance survives later route state and other guest intake', async t => {
  const originals = new Map(['window', 'CustomEvent', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map(), model = new IndexedDbModel(), accounts = new Map(), requests = [];
  let blockedPrefix = null, onAccountRequest = null, receiptFault = null, receiptWasWritten = false;
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem: key => {if(receiptFault?.key===key&&receiptFault.mode==='readback'&&receiptWasWritten)throw new DOMException('Synthetic readback refusal','SecurityError');return values.get(key)??null;}, setItem: (key, raw) => {
      if(receiptFault?.key===key){
        if(receiptFault.mode==='security')throw new DOMException('Synthetic setter refusal','SecurityError');
        if(receiptFault.mode==='silent')return;
        if(receiptFault.mode==='quota')throw new DOMException('Synthetic receipt quota','QuotaExceededError');
        receiptWasWritten=true;
      }
      if(blockedPrefix && key.startsWith(blockedPrefix)) throw new DOMException('Synthetic native quota', 'QuotaExceededError');
      values.set(key, raw);
    }, removeItem: key => { values.delete(key); } };
  globalThis.window = {localStorage: storage, indexedDB: model.factory(), addEventListener() {}, dispatchEvent() {return true;}};
  globalThis.CustomEvent = class {constructor(type, options) {this.type = type; this.detail = options?.detail;}};
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body), owner = new Headers(init.headers).get('x-morrovia-expected-owner');
    assert.equal(owner, 'synthetic-account'); requests.push(body.id);
    const canonical = canonicalTripForOwner(owner, body); accounts.set(canonical.id, canonical);
    if(onAccountRequest) {const callback = onAccountRequest; onAccountRequest = null; await callback();}
    return Response.json({trip: canonical, outcome: 'promoted'}, {status: 201});
  };
  let sequence = 0;
  async function createGuest({direct = false, describe = false, quota = false, fault = null} = {}) {
    const f = homeRecoveryFixture(), id = 'synthetic-lifetime-' + ++sequence;
    if(describe) {f.snapshot.mode = 'describe'; f.snapshot.prompt = 'Tokyo and Kyoto'; f.draft.homepage.mode = 'describe';}
    const receipt = homepageReceiptForProjection(f.snapshot, f.draft, id);
    const draft = {...f.draft, homepage: {...f.draft.homepage, receipt}};
    const trip = {...f.trip, id};
    const home = createDurableHomepagePersistence(storage, await browserRecoveryDriver(), {
      ownerId: null, isCurrent: () => true, overflowEnabled: true, accountOverflowQualified: true});
    const beforeHome = await home.read(); assert.equal(beforeHome.kind, 'ready');
    assert.equal((await home.write(JSON.stringify({version: 1, inputRaw: JSON.stringify({snapshot: f.snapshot, receipt}),
      draftRaw: direct ? beforeHome.draftRaw : JSON.stringify(draft)}), {allowInitialOverflow: true})).kind, 'verified');
    blockedPrefix = quota ? tripRecoveryStorageKey(null, id) : null;
    receiptFault=fault?{key:tripReceiptStorageKey(null,id),mode:fault}:null;receiptWasWritten=false;
    const before=new Map(values);
    const saved = await saveTripRecovery(trip, {ownerId: null, newTripOrClone: true,
      draft: createBuilderInputDraft(trip), intake: {completed: receipt, draft, fromHomepage: !direct}});
    blockedPrefix = null;receiptFault=null;
    if(fault&&fault!=='quota'){
      assert.equal(saved.stored,false,'interrupted initial receipt must not claim completion');
      assert.notEqual(saved.receiptAcknowledged,true);
      for(const [key,raw] of before)if(key!==currentTripStorageKey(null))assert.equal(values.get(key),raw,'initial failure preserves prior inputs and trips');
      assert.equal(JSON.parse(values.get(currentTripStorageKey(null))).tripId,id,'partial body is discoverable without claiming receipt completion');
      const recovery=await loadTripRecovery(id,null);assert.ok(recovery,'partial body remains recoverable');
      const retry=await saveTripRecovery(trip,{ownerId:null,replace:recovery,newTripOrClone:true,expectedRecoverySource:trip,
        draft:createBuilderInputDraft(trip),intake:{completed:receipt,draft,fromHomepage:!direct}});
      assert.equal(retry.stored,true,'exact source-aware retry finishes interrupted checkpoint');
      assert.equal(retry.receiptAcknowledged,true);
    }else assert.equal(saved.stored, true, 'actual intake checkpoint must complete');
    const recovery = await loadTripRecovery(id, null); assert.ok(recovery);
    return {trip, recovery, draft, receipt};
  }
  async function promotePreservingGuest(trip) {
    const before = new Map(values), start = requests.length;
    let result;
    try {result = await saveExplicitGuestTripForOwner(trip.id, 'synthetic-account', () => true);}
    catch (error) {
      assert.deepEqual(values, before, 'refused explicit save must preserve all input and trip bytes');
      assert.equal(requests.length, start, 'refusal happened before account dispatch');
      throw error;
    }
    assert.equal(result.accountAcknowledged, true); assert.equal(result.deviceComplete, true);
    assert.deepEqual(result.trip.stops.map(s => [s.id, s.name]), canonicalTripForOwner('synthetic-account', trip).stops.map(s => [s.id, s.name]));
    assert.ok(accounts.has(trip.id));
    for (const [key, raw] of before) if(key !== currentTripStorageKey('synthetic-account'))
      assert.equal(storage.getItem(key), raw, 'original guest and other trip bytes retained');
  }
  try {
    await t.test('accepted route reorder before first sign-in retains historical intake', async () => {
      const f = await createGuest();
      const edit = prepareAcceptedBuilderEdit(f.trip, {kind: 'order', stopIds: f.trip.stops.map(s => s.id).reverse(), source: 'move-menu'}, builderDocumentFingerprint(f.trip));
      assert.equal(edit.ok, true); assert.notDeepEqual(edit.trip.stops.map(s => s.id), f.trip.stops.map(s => s.id));
      const trip = {...edit.trip, status: 'planned'};
      const saved = await saveTripRecovery(trip, {ownerId: null, replace: f.recovery,
        canonicalBase: f.trip, expectedRecoverySource: f.trip, draft: createBuilderInputDraft(trip)});
      assert.equal(saved.stored, true); await promotePreservingGuest(trip);
    });
    await t.test('another completed guest intake cannot replace the first trip receipt on sign-in reload', async () => {
      const a = await createGuest(), b = await createGuest();
      assert.notEqual(a.trip.id, b.trip.id);
      await promotePreservingGuest(a.trip);
      assert.deepEqual((await loadTripRecovery(b.trip.id, null)).trip, JSON.parse(JSON.stringify(b.trip)));
      assert.equal(accounts.has(b.trip.id), false);
    });
    for(const source of ['curated-route','spreadsheet-import','manual-builder'])for(const quota of [false,true])await t.test(`explicit ${source} creation beside unrelated Home (${quota?'IDB':'native'})`,async()=>{
      const home=await createGuest(),trip={...home.trip,id:'synthetic-created-'+ ++sequence};
      const creation=createTripCreationToken(trip,null,source,'create-'+sequence);
      blockedPrefix=quota?tripRecoveryStorageKey(null,trip.id):null;
      let saved;try{saved=await saveTripRecovery(trip,{ownerId:null,newTripOrClone:true,creation});}finally{blockedPrefix=null;}
      assert.equal(saved.stored,true,'fresh body and provenance checkpoint');assert.equal(saved.receiptAcknowledged,true);
      const edited={...trip,title:'Later explicitly edited title'};
      const next=await saveTripRecovery(edited,{ownerId:null,replace:saved.handle,canonicalBase:trip});assert.equal(next.stored,true);
      await promotePreservingGuest(edited);
    });
    await t.test('no-intake source cannot borrow unrelated Home proof; refusal preserves every branch',async()=>{
      const home=await createGuest(),trip={...home.trip,id:'synthetic-no-intake-'+ ++sequence};
      assert.equal((await saveTripRecovery(trip,{ownerId:null,newTripOrClone:true})).stored,true);
      const before=new Map(values),calls=requests.length;
      await assert.rejects(saveExplicitGuestTripForOwner(trip.id,'synthetic-account',()=>true),error=>error.reason==='homepage-trip-mismatch');
      assert.equal(requests.length,calls);assert.deepEqual(values,before);
    });
    for(const slot of ['reservation','body','receipt'])for(const mode of ['security','silent','readback','quota'])await t.test(`creation ${slot} ${mode}: preserve, cold continuation, exact retry`,async()=>{
      const trip={...homeRecoveryFixture().trip,id:'fault-created-'+ ++sequence},creation=createTripCreationToken(trip,null,'spreadsheet-import','fault-'+sequence);
      const key=slot==='reservation'?tripCreationStorageKey(null,trip.id):slot==='receipt'?tripReceiptStorageKey(null,trip.id):tripRecoveryStorageKey(null,trip.id,creation.initialWriteId);
      receiptFault={key,mode};receiptWasWritten=false;
      const before=new Map(values);let first;
      try{first=await saveTripRecovery(trip,{ownerId:null,newTripOrClone:true,creation});}finally{receiptFault=null;}
      if(mode!=='quota')assert.equal(first.stored,false,'failed checkpoint must not report saved');
      for(const [key,raw] of before)if(key!==currentTripStorageKey(null))assert.equal(values.get(key),raw);
      const context={ownerId:null,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true};
      const reserved=await readReservedTripCreation(storage,await browserRecoveryDriver(),context,trip.id,creation.operationId);
      if(slot!=='reservation'||mode==='readback'||mode==='quota')assert.equal(reserved?.trip.id,trip.id,'exact reserved identity survives cold lookup');
      const retry=await saveTripRecovery(trip,{ownerId:null,newTripOrClone:true,creation});assert.equal(retry.stored,true);assert.equal(retry.receiptAcknowledged,true);
      await promotePreservingGuest(trip);
    });
    await t.test('creation source reservation changed during account response cannot complete local promotion',async()=>{
      const trip={...homeRecoveryFixture().trip,id:'changed-creation-'+ ++sequence},creation=createTripCreationToken(trip,null,'curated-route','changed-'+sequence);
      assert.equal((await saveTripRecovery(trip,{ownerId:null,newTripOrClone:true,creation})).stored,true);
      const key=tripCreationStorageKey(null,trip.id),before=new Map(values);
      onAccountRequest=()=>{values.set(key,'protected competing reservation');};
      const saved=await saveExplicitGuestTripForOwner(trip.id,'synthetic-account',()=>true);
      assert.equal(saved.accountAcknowledged,true);assert.equal(saved.deviceComplete,false);
      for(const [name,raw] of before)if(name!==key)assert.equal(values.get(name),raw);
    });
    await t.test('lost account ACK for explicit creation preserves source and retries the same identity',async()=>{
      const trip={...homeRecoveryFixture().trip,id:'lost-creation-'+ ++sequence},creation=createTripCreationToken(trip,null,'curated-route','lost-'+sequence);
      assert.equal((await saveTripRecovery(trip,{ownerId:null,newTripOrClone:true,creation})).stored,true);
      const before=new Map(values);onAccountRequest=()=>{throw new Error('Synthetic lost ACK after server commit');};
      await assert.rejects(saveExplicitGuestTripForOwner(trip.id,'synthetic-account',()=>true));
      assert.deepEqual(values,before);assert.equal(accounts.has(trip.id),true);
      await promotePreservingGuest(trip);
    });
    await t.test('a creation receipt without its retained reservation cannot dispatch account save',async()=>{
      const trip={...homeRecoveryFixture().trip,id:'missing-creation-'+ ++sequence},creation=createTripCreationToken(trip,null,'curated-route','missing-'+sequence);
      assert.equal((await saveTripRecovery(trip,{ownerId:null,newTripOrClone:true,creation})).stored,true);
      values.delete(tripCreationStorageKey(null,trip.id));const before=new Map(values),calls=requests.length;
      await assert.rejects(saveExplicitGuestTripForOwner(trip.id,'synthetic-account',()=>true),error=>error.reason==='homepage-receipt-mismatch');
      assert.equal(requests.length,calls);assert.deepEqual(values,before);
    });
    for(const quota of [false, true]) for(const describe of [false, true]) {
      await t.test(`direct ${describe ? 'Describe' : 'Stops'} intake retains its accepted projection beside older Home (${quota ? 'IDB' : 'native'})`, async () => {
        const priorHome = storage.getItem(HOME_TRIP_DRAFT_KEY);
        assert.ok(priorHome, 'an unrelated older Home draft must remain present');
        const guest = await createGuest({direct: true, describe, quota});
        assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), priorHome, 'direct entry preserves old Home');
        await promotePreservingGuest(guest.trip);
      });
    }
    await t.test('IDB input-only edits retain the accepted receipt through a cold explicit save', async () => {
      const f = await createGuest({quota: true});
      const edit = prepareAcceptedBuilderEdit(f.trip, {kind: 'order', stopIds: f.trip.stops.map(s => s.id).reverse()}, builderDocumentFingerprint(f.trip));
      assert.equal(edit.ok, true);
      const trip = {...edit.trip, status: 'planned'};
      assert.equal((await saveTripRecovery(trip, {ownerId: null, replace: f.recovery, canonicalBase: f.trip,
        expectedRecoverySource: f.trip, draft: createBuilderInputDraft(trip)})).stored, true);
      await promotePreservingGuest(trip);
    });
    for(const fault of ['security','silent','readback','quota'])await t.test(`initial ${fault} receipt failure never loses source; exact retry completes`,async()=>{
      const f=await createGuest({fault});await promotePreservingGuest(f.trip);
    });
    await t.test('tampered or foreign independent receipt never grants account dispatch', async () => {
      const f = await createGuest(), key = tripReceiptStorageKey(null, f.trip.id), raw = storage.getItem(key);
      assert.ok(raw);
      for(const change of ['malformed', 'foreign-owner', 'wrong-trip', 'semantic', 'missing-proof']) {
        const bundle = JSON.parse(raw), input = JSON.parse(bundle.inputRaw);
        if(change === 'foreign-owner') input.receipt.ownerId = 'other-account';
        if(change === 'wrong-trip') input.receipt.tripId = 'another-trip';
        if(change === 'semantic') input.snapshot.travellers = {state: 'selected', value: 4};
        if(change === 'missing-proof') delete input.receipt.semanticInputFingerprint;
        bundle.inputRaw = JSON.stringify(input); values.set(key, change === 'malformed' ? '{bad' : JSON.stringify(bundle));
        const before = new Map(values), calls = requests.length;
        await assert.rejects(saveExplicitGuestTripForOwner(f.trip.id, 'synthetic-account', () => true), error => error.reason === 'homepage-receipt-mismatch', change);
        assert.equal(requests.length, calls); assert.deepEqual(values, before);
      }
      values.set(key, raw);
    });
    await t.test('guest receipt mutation during account ACK cannot claim complete device persistence', async () => {
      const f = await createGuest(), key = tripReceiptStorageKey(null, f.trip.id), before = new Map(values);
      onAccountRequest = () => {values.set(key, 'protected concurrent receipt');};
      const result = await saveExplicitGuestTripForOwner(f.trip.id, 'synthetic-account', () => true);
      assert.equal(result.accountAcknowledged, true); assert.equal(result.deviceComplete, false);
      assert.equal(values.get(key), 'protected concurrent receipt');
      for(const [name, raw] of before) if(name !== key) assert.equal(values.get(name), raw);
    });
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
