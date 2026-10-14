import { builderInputDraftKey, readBuilderInputDraft, writeBuilderInputDraft, type BuilderInputDraft, type BuilderInputReadResult } from './trip-builder-input-draft.ts';
import { requireReadableTripDocument } from './trip-document.ts';
import type { CanonicalEasyTTrip } from './trip.ts';
import { createTwoStoreEntryPersistence } from './two-store-entry-persistence.ts';
import { browserRecoveryDriver, browserRecoveryStorage, browserRecoveryGuard } from './browser-recovery-persistence.ts';
import { RECOVERY_DOMAIN_OVERFLOW_ENABLED, RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED } from './recovery-domain-policy.ts';
import type { RecoveryDomainDriver } from './durable-recovery-domain.ts';
import type { EasyTBrowserStorage } from './storage.ts';
import { createTwoStoreTripPersistence } from './two-store-trip-persistence.ts';

export function createDurableBuilderInputPersistence(storage:EasyTBrowserStorage,driver:RecoveryDomainDriver,context:{
  trip:CanonicalEasyTTrip;ownerId:string|null;isCurrent:()=>boolean;overflowEnabled:boolean;accountOverflowQualified:boolean;
}) {
  const trip=requireReadableTripDocument(structuredClone(context.trip)),ownerId=context.ownerId,key=builderInputDraftKey(ownerId,trip.id);
  const entries=createTwoStoreEntryPersistence(storage,driver,{...context,scope:{ownerId,kind:'builder-input',tripId:trip.id},key,
    validate:raw=>raw===null||readBuilderInputDraft({getItem:()=>raw},trip,ownerId).kind==='readable'});
  const trips=createTwoStoreTripPersistence(storage,driver,context);
  async function barrier() {
    const state=await trips.read(trip.id);
    return state.kind==='protected'?{kind:'protected' as const,raw:''}:state.kind==='unavailable'?{kind:'error' as const,reason:'storage' as const}:null;
  }
  async function read():Promise<BuilderInputReadResult> {
    const refused=await barrier();if(refused)return refused;
    const result=await entries.read();
    if(result.kind==='protected')return {kind:'protected',raw:''};
    if(result.kind!=='ready')return {kind:'error',reason:'storage'};
    return readBuilderInputDraft({getItem:()=>result.raw},trip,ownerId);
  }
  async function serialize(input:BuilderInputDraft) {
    const draft=structuredClone(input),refused=await barrier();
    if(refused)return {ok:false as const,reason:refused.kind==='protected'?'protected' as const:'storage' as const};
    const observed=await entries.read();
    if(observed.kind!=='ready')return {ok:false as const,reason:observed.kind==='protected'?'protected' as const:'storage' as const};
    let raw=observed.raw;
    const result=writeBuilderInputDraft({getItem:()=>raw,setItem:(_,next)=>{raw=next}},trip,draft,ownerId);
    return result.ok&&raw!==null?{ok:true as const,raw,observed,inputRevision:draft.inputRevision}:{ok:false as const,reason:result.ok?'invalid' as const:result.reason};
  }
  return {
    read,
    async write(draft:BuilderInputDraft,options:{allowInitialOverflow?:boolean}={}):Promise<ReturnType<typeof writeBuilderInputDraft>> {
      // Raw edits on an existing trip are eligible only while the canonical
      // source is exactly the mounted same-scope document. The body command
      // independently proves its replacement/cache source before admission.
      const before = await trips.read(trip.id);
      const existingSource = before.kind === 'found'
        && (trip.ownerId === null || trip.ownerId === ownerId)
        && JSON.stringify(before.trip) === JSON.stringify(trip);
      const allowInitialOverflow=options.allowInitialOverflow===true || existingSource;
      const staged=await serialize(draft);if(!staged.ok)return staged;
      const writeId=globalThis.crypto.randomUUID(),entry=await entries.prepareForDomain(staged.raw,writeId,staged.observed);
      if(!('raw' in entry))return {ok:false,reason:entry.kind==='protected'?'protected':'storage'};
      const result=await entries.save(staged.raw,{allowInitialOverflow,writeId,expected:entry});
      const after = await trips.read(trip.id);
      return result.kind==='verified' && (!existingSource || after.kind==='found' && JSON.stringify(after.trip)===JSON.stringify(trip))?{ok:true}:{ok:false,reason:result.kind==='protected'?'protected':'storage'};
    },
    async prepare(draft:BuilderInputDraft,writeId:string) {
      const staged=await serialize(draft);if(!staged.ok)return staged;
      const entry=await entries.prepareForDomain(staged.raw,writeId,staged.observed);
      return 'raw' in entry?{ok:true as const,entry,input:{ownerId,tripId:trip.id,inputRevision:staged.inputRevision,raw:staged.raw}}:
        {ok:false as const,reason:entry.kind==='protected'?'protected' as const:'storage' as const};
    },
  };
}
async function browserInput(trip:CanonicalEasyTTrip,ownerId:string|null,guard?:()=>boolean) {
  const frozen=requireReadableTripDocument(structuredClone(trip)),isCurrent=browserRecoveryGuard(guard),storage=browserRecoveryStorage();
  return createDurableBuilderInputPersistence(storage,await browserRecoveryDriver(),{trip:frozen,ownerId,isCurrent,
    overflowEnabled:RECOVERY_DOMAIN_OVERFLOW_ENABLED,accountOverflowQualified:RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED});
}
export async function readDurableBuilderInputDraft(trip:CanonicalEasyTTrip,ownerId:string|null,guard?:()=>boolean):Promise<BuilderInputReadResult> {
  try { return await (await browserInput(trip,ownerId,guard)).read(); } catch { return {kind:'error',reason:'storage'}; }
}
export async function writeDurableBuilderInputDraft(trip:CanonicalEasyTTrip,draft:BuilderInputDraft,ownerId:string|null,guard?:()=>boolean,allowInitialOverflow=false):Promise<ReturnType<typeof writeBuilderInputDraft>> {
  const frozen=structuredClone(draft);
  try { return await (await browserInput(trip,ownerId,guard)).write(frozen,{allowInitialOverflow}); } catch { return {ok:false,reason:'storage'}; }
}
