import type { RecoveryDomainDriver } from './durable-recovery-domain.ts';
import type { RecoveryEntryEnvelope, RecoveryEntryWrite } from './durable-entry-protocol.ts';
import type { StoredHomepageInput, PendingIntakeReceipt } from './home-trip-handoff.ts';
import {HOME_TRIP_DRAFT_KEY,readHomepageInput,pendingIntakeReceiptForOwner,pendingHomepageHandoffForOwner,
  homepageHandoffReceiptForOwner,homepageHandoffMatchesTrip,pendingReceiptStillCurrent,withHomepageReceiptLock,acknowledgePendingIntakeReceiptInStorage,
  type HomeTripDraft,type HomepageHandoffReceipt} from './home-trip-handoff.ts';
import {homepageInputStorageKey,homepageDraftStorageKey} from './private-browser-context.ts';
import {createRecoveryEntryStore} from './durable-entry-store.ts';
import {sameEntryHandle} from './durable-entry-protocol.ts';
import {recoveryErrorReason} from './durable-recovery-error.ts';
import {browserRecoveryDriver,browserRecoveryStorage,browserRecoveryGuard} from './browser-recovery-persistence.ts';
import {RECOVERY_DOMAIN_OVERFLOW_ENABLED,RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED} from './recovery-domain-policy.ts';
import {withPersistencePreparation,reportPersistenceOutcome,type PersistenceStage} from './persistence-outcome.ts';
import {prepareEntryWrite} from './durable-entry-store.ts';
import type {EasyTTrip} from './trip.ts';
import {readOwnerRecoveryClaimBarrier} from './recovery-domain-claim.ts';
export type HomepageStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type HomepageBundle = {version:1;inputRaw:string|null;draftRaw:string|null};
export type DurableHomepageState = {kind:'ready';storedInput:StoredHomepageInput|null;draft:unknown|null;inputRaw:string|null;draftRaw:string|null;
  raw:string;legacyRaw:string;envelope:RecoveryEntryEnvelope|null}|{kind:'protected'|'unavailable';reason:string};
export type HomepageWriteResult = {kind:'verified';backend:'local-storage'|'indexeddb-entry'}|{kind:'protected'|'unavailable'|'failure';reason:string;committed?:boolean;nativeFailure?:'quota'|'security'|'unavailable'|'unknown'};
export type RecoveryIntakeAcknowledgement={pending?:PendingIntakeReceipt;completed:HomepageHandoffReceipt;draft:HomeTripDraft;fromHomepage:boolean;resumedInputRaw?:string};
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
type InvalidHomepagePayloadReason='native-bundle-invalid'|'native-input-invalid'|'native-draft-invalid'|'native-foreign-pending-envelope';
export function decodeHomepageBundle(raw:string,ownerId:string|null,onInvalid?:(reason:InvalidHomepagePayloadReason)=>void) {
  const refuse=(reason:InvalidHomepagePayloadReason)=>{onInvalid?.(reason);return null;};
  let invalidReason:InvalidHomepagePayloadReason='native-bundle-invalid';
  try {
    const value:unknown=JSON.parse(raw);
    if(!object(value)||value.version!==1||Object.keys(value).sort().join(',')!=='draftRaw,inputRaw,version'
      ||![value.inputRaw,value.draftRaw].every(item=>item===null||typeof item==='string'))return refuse('native-bundle-invalid');
    const bundle=value as HomepageBundle;
    invalidReason='native-input-invalid';
    const storedInput=bundle.inputRaw===null?null:readHomepageInput(JSON.parse(bundle.inputRaw),ownerId);
    if(bundle.inputRaw!==null&&!storedInput)return refuse('native-input-invalid');
    invalidReason='native-draft-invalid';
    let draft:unknown=bundle.draftRaw===null?null:JSON.parse(bundle.draftRaw);
    if(draft!==null) {
      if(!object(draft))return refuse('native-draft-invalid');
      if(draft.version===2) {
        const receipt=pendingIntakeReceiptForOwner(draft.receipt,ownerId);
        if(!receipt||!pendingHomepageHandoffForOwner(draft,ownerId,receipt.handoffId)) {
          const foreignOwner=object(draft.receipt)?draft.receipt.ownerId:undefined;
          if(foreignOwner!==ownerId&&(foreignOwner===null||typeof foreignOwner==='string'&&foreignOwner.trim().length>0)) {
            const foreignReceipt=pendingIntakeReceiptForOwner(draft.receipt,foreignOwner);
            if(foreignReceipt&&pendingHomepageHandoffForOwner(draft,foreignOwner,foreignReceipt.handoffId)) {
              // The shared legacy slot is another owner's reservation. Retain
              // its exact raw bytes, but do not expose or redeem it here.
              draft=null;
            }else return refuse('native-draft-invalid');
          }else {
            return refuse('native-draft-invalid');
          }
        }
      }else if('homepage' in draft) {
        if(!homepageHandoffReceiptForOwner(draft as HomeTripDraft,ownerId)) {
          // HOME is a shared legacy slot. A valid completed draft for another
          // scope is not this owner's intake. Preserve its raw bytes in the
          // bundle/CAS witness, but never expose or consume it as owned input.
          const homepage=draft.homepage;
          if('version' in draft||!object(homepage)||(homepage.ownerId!==null&&(typeof homepage.ownerId!=='string'||!homepage.ownerId.trim()))
            ||homepage.ownerId===ownerId||!homepageHandoffReceiptForOwner(draft as HomeTripDraft,homepage.ownerId as string|null))return refuse('native-draft-invalid');
          draft=null;
        }
      }else {
        const legacyDraft=draft;
        if(ownerId!==null||!object(legacyDraft)||'version' in legacyDraft||!['brief','origin','destination','destinations','locationMentions'].some(key=>key in legacyDraft))return refuse('native-draft-invalid');
      }
    }
    return {bundle,storedInput,draft};
  }catch{return refuse(invalidReason);}
}
class NativeHomepageConflict extends Error {
  readonly reason:string;
  constructor(reason:string){super(reason);this.reason=reason;}
}
function draftOwnershipPreserved(decoded:NonNullable<ReturnType<typeof decodeHomepageBundle>>,previousRaw:string|null) {
  // Readers may retain a foreign legacy witness. Writers may carry that exact
  // witness forward, never introduce or replace someone else's handoff.
  return decoded.draft!==null||decoded.bundle.draftRaw===null||JSON.parse(decoded.bundle.draftRaw)===null||decoded.bundle.draftRaw===previousRaw;
}
/** Compare owner state, not the lifetime of a foreign shared reservation. A
 * matching pending envelope duplicates the exact frozen input receipt; older
 * readers may represent that same intake with input only. Physical bytes stay
 * retained in both native storage and entry witnesses. */
function nativeHomepageLineage(raw:string|null,ownerId:string|null) {
  const decoded=raw===null?null:decodeHomepageBundle(raw,ownerId);if(!decoded)return null;
  const pending=pendingIntakeReceiptForOwner(decoded.storedInput?.receipt,ownerId);
  const duplicate=pending&&decoded.bundle.draftRaw===JSON.stringify({version:2,phase:'pending-interpretation',receipt:pending})
    &&pendingReceiptStillCurrent({getItem:key=>key===homepageInputStorageKey(ownerId)?decoded.bundle.inputRaw:key===HOME_TRIP_DRAFT_KEY?decoded.bundle.draftRaw:null},pending,true);
  return JSON.stringify({...decoded.bundle,draftRaw:decoded.draft===null||duplicate?null:decoded.bundle.draftRaw});
}
function sameNativeHomepageLineage(left:string,right:string|null,ownerId:string|null) {
  const normalized=nativeHomepageLineage(left,ownerId);return normalized!==null&&normalized===nativeHomepageLineage(right,ownerId);
}
/** A scoped null is empty, not a competing handoff. A sole owned shared copy
 * remains visible to current and older clients. Two live owned copies or any
 * malformed slot stay protected without a winner, migration or deletion. */
export function readNativeHomepageBundle(storage:Pick<Storage,'getItem'>,ownerId:string|null):HomepageBundle {
  let inputRaw=storage.getItem(homepageInputStorageKey(ownerId));
  // An older reader must not interpret an invisible scoped handoff as direct
  // input and abandon it. This lossless wrapper deliberately has no snapshot,
  // so old codecs refuse before mutation; no tab is reloaded or closed.
  if(inputRaw!==null) {
    let value:unknown;try{value=JSON.parse(inputRaw);}catch{throw new NativeHomepageConflict('native-input-invalid');}
    if(object(value)&&'ownerScopedHomepageInput' in value) {
      if(value.version!==1||Object.keys(value).sort().join(',')!=='ownerScopedHomepageInput,version'
        ||!(value.ownerScopedHomepageInput===null||typeof value.ownerScopedHomepageInput==='string')
        ||inputRaw!==JSON.stringify({version:1,ownerScopedHomepageInput:value.ownerScopedHomepageInput}))throw new NativeHomepageConflict('native-input-invalid');
      inputRaw=value.ownerScopedHomepageInput;
    }
  }
  const legacy=storage.getItem(HOME_TRIP_DRAFT_KEY),scoped=storage.getItem(homepageDraftStorageKey(ownerId));
  if(scoped!==null) {
    let ownedLegacy=false;
    for(const [raw,isScoped] of [[legacy,false],[scoped,true]] as const) {
      if(raw===null)continue;
      let reason:InvalidHomepagePayloadReason='native-draft-invalid';
      const decoded=decodeHomepageBundle(JSON.stringify({version:1,inputRaw:null,draftRaw:raw}),ownerId,value=>{reason=value;});
      if(!decoded)throw new NativeHomepageConflict(reason);
      if(!isScoped&&decoded.draft!==null)ownedLegacy=true;
      if(isScoped&&raw!=='null'&&decoded.draft===null)throw new NativeHomepageConflict('scope');
    }
    if(scoped==='null')return {version:1,inputRaw,draftRaw:ownedLegacy?legacy:null};
    if(ownedLegacy)throw new NativeHomepageConflict('native-divergence');
  }
  return {version:1,inputRaw,draftRaw:scoped!==null?(scoped==='null'?null:scoped):legacy};
}
export function createDurableHomepagePersistence(storage:HomepageStorage,driver:RecoveryDomainDriver,context:{ownerId:string|null;isCurrent:()=>boolean;overflowEnabled:boolean;accountOverflowQualified:boolean}) {
  const ownerId=context.ownerId,scope={ownerId,kind:'homepage' as const,tripId:null},inputKey=homepageInputStorageKey(ownerId),scopedDraftKey=homepageDraftStorageKey(ownerId);
  const active=()=>{try{return context.isCurrent()===true;}catch{return false;}};
  const entries=createRecoveryEntryStore(driver,{ownerId,isCurrent:active});
  const nativeRaw=()=>{
    const snapshot=()=>JSON.stringify(readNativeHomepageBundle(storage,ownerId));
    const raw=snapshot();if(raw!==snapshot())throw new Error('Homepage native snapshot changed');return raw;
  };
  async function read():Promise<DurableHomepageState> {
    if(!active())return {kind:'protected',reason:'operation-changed'};
    const result=await entries.read(scope);
    if(result.kind!=='ready')return {kind:result.kind==='protected-conflict'||result.kind==='failure'&&['schema','corrupt'].includes(result.reason)?'protected':'unavailable',reason:result.kind==='verified'?'unknown':result.reason};
    const claim=await readOwnerRecoveryClaimBarrier(driver,storage,{ownerId,isCurrent:active});if(claim.kind!=='ready')return claim;
    const current=await entries.read(scope);
    if(current.kind!=='ready')return {kind:'unavailable',reason:'entry-readback-unknown'};
    if(!active()||JSON.stringify(current.envelope)!==JSON.stringify(result.envelope))return {kind:'protected',reason:'entry-changed'};
    try {
      const legacyRaw=nativeRaw(),envelope=result.envelope;
      if(!active())return {kind:'protected',reason:'operation-changed'};
      let nativePayloadReason:InvalidHomepagePayloadReason='native-bundle-invalid';
      if(!decodeHomepageBundle(legacyRaw,ownerId,reason=>{nativePayloadReason=reason;}))return {kind:'protected',reason:nativePayloadReason};
      if(envelope&&!sameNativeHomepageLineage(legacyRaw,envelope.legacyRaw,ownerId)&&!sameNativeHomepageLineage(legacyRaw,envelope.raw,ownerId))return {kind:'protected',reason:'native-divergence'};
      const raw=envelope?envelope.raw:legacyRaw;
      const decoded=raw===null?null:decodeHomepageBundle(raw,ownerId);
      if(!decoded||raw===null)return {kind:'protected',reason:'payload'};
      return {kind:'ready',...decoded.bundle,storedInput:decoded.storedInput,draft:decoded.draft,raw,legacyRaw,envelope};
    }catch(error){return error instanceof NativeHomepageConflict?{kind:'protected',reason:error.reason}:{kind:'unavailable',reason:'native-read-unknown'};}
  }
  function entry(raw:string,writeId:string,before:Extract<DurableHomepageState,{kind:'ready'}>,legacyRaw=before.legacyRaw):RecoveryEntryWrite {
    const envelope:RecoveryEntryEnvelope={version:1,handle:{...scope,version:1,backend:'indexeddb-entry',writeId},parent:before.envelope?.handle??null,
      raw,legacyRaw,retainedPreviousRaw:before.raw};
    return {raw:JSON.stringify(envelope),expectedHead:envelope.parent,admission:envelope.parent?'existing-domain':'native-setter-quota'};
  }
  const virtual=(bundle:HomepageBundle):HomepageStorage=>({
    getItem(key){if(key===inputKey)return bundle.inputRaw;if(key===HOME_TRIP_DRAFT_KEY)return bundle.draftRaw;throw new Error('Foreign preparation key');},
    setItem(key,raw){if(key===inputKey)bundle.inputRaw=raw;else if(key===HOME_TRIP_DRAFT_KEY)bundle.draftRaw=raw;else throw new Error('Foreign preparation key');},
    removeItem(key){if(key===inputKey)bundle.inputRaw=null;else if(key===HOME_TRIP_DRAFT_KEY)bundle.draftRaw=null;else throw new Error('Foreign preparation key');},
  });
  return {
    read,
    async write(raw:string,options:{allowInitialOverflow?:boolean;writeId?:string;expected?:RecoveryEntryWrite}={}):Promise<HomepageWriteResult>{
      const decoded=decodeHomepageBundle(raw,ownerId);if(!decoded)return {kind:'protected',reason:'payload'};
      const writeId=options.writeId??globalThis.crypto.randomUUID(),allowInitialOverflow=options.allowInitialOverflow===true,expected=options.expected?structuredClone(options.expected):undefined;
      const before=await read();if(before.kind!=='ready')return before;
      if(!draftOwnershipPreserved(decoded,before.draftRaw))return {kind:'protected',reason:'scope'};
      if(expected) {
        const validated=prepareEntryWrite(expected,ownerId);if(validated.kind!=='prepared'||validated.scope.kind!=='homepage')return {kind:'protected',reason:'preparation'};
        const prepared=validated.envelope;
        if(prepared.raw!==raw||!sameEntryHandle(expected.expectedHead,before.envelope?.handle??null)
          ||prepared.legacyRaw!==before.legacyRaw||prepared.retainedPreviousRaw!==before.raw)return {kind:'protected',reason:'preparation-changed'};
      }
      let legacyRaw=before.legacyRaw,confirmedNativeFailure: 'quota'|'security'|'unavailable'|'unknown'|undefined;
      if(!before.envelope) {
        const previous=JSON.parse(before.legacyRaw) as HomepageBundle,target=decoded.bundle;
        const changes:Array<{field:'inputRaw'|'draftRaw';key:string;before:string|null;after:string|null;logicalAfter:string|null}>=[];
        // Continue a sole shared owned lineage through its existing key, even
        // beside an empty scoped slot. A live scoped copy or foreign shared
        // reservation requires the scoped key; never overwrite foreign bytes.
        let setterQuota=false;
        try {
          const shared=storage.getItem(HOME_TRIP_DRAFT_KEY),scoped=storage.getItem(scopedDraftKey);
          const sharedDecoded=decodeHomepageBundle(JSON.stringify({version:1,inputRaw:null,draftRaw:shared}),ownerId);
          const foreignShared=shared!==null&&sharedDecoded?.draft===null&&JSON.parse(shared)!==null;
          const draftKey=scoped!==null&&scoped!=='null'||foreignShared?scopedDraftKey:HOME_TRIP_DRAFT_KEY;
          const scopedInput=draftKey===scopedDraftKey&&decoded.draft!==null;
          // Fence before creating a scoped draft; retire that draft before
          // releasing the fence. Every interruption stays old-reader safe.
          const fields=scoped!==null&&scoped!=='null'&&!scopedInput
            ?[['draftRaw',draftKey],['inputRaw',inputKey]] as const:[['inputRaw',inputKey],['draftRaw',draftKey]] as const;
          for(const [field,key] of fields) {
            const old=previous[field],next=target[field],physicalBefore=storage.getItem(key);
            const physicalNext=field==='inputRaw'&&scopedInput?JSON.stringify({version:1,ownerScopedHomepageInput:next}):key===scopedDraftKey&&next===null?'null':next;
            if(old===next&&(field==='draftRaw'||physicalBefore===physicalNext))continue;
            if(!active()||nativeRaw()!==JSON.stringify({...previous,...Object.fromEntries(changes.map(change=>[change.field,change.logicalAfter]))}))return {kind:'protected',reason:'native-changed'};
            try {if(physicalNext===null)storage.removeItem(key);else storage.setItem(key,physicalNext);}
            catch(error){const reason=recoveryErrorReason(error);setterQuota=physicalNext!==null&&reason==='quota';
              if(physicalNext!==null)confirmedNativeFailure=reason==='quota'||reason==='security'||reason==='unavailable'?reason:'unknown';throw error;}
            changes.push({field,key,before:physicalBefore,after:physicalNext,logicalAfter:next});
            if(storage.getItem(key)!==physicalNext)throw new Error('Homepage native readback refused');
          }
          const after=await read();
          if(after.kind!=='ready')return after;
          return active()&&!after.envelope&&after.raw===raw?{kind:'verified',backend:'local-storage'}:{kind:'protected',reason:'native-readback'};
        }catch(error){
          // Compensate only bytes this operation still owns. Unknown competing
          // writes are never overwritten. New keys may be removed on rollback;
          // existing recovery-domain generations are never deleted.
          for(const change of [...changes].reverse()) {
            try {if(storage.getItem(change.key)!==change.after)return {kind:'protected',reason:'native-divergence'};
              if(change.before===null)storage.removeItem(change.key);else storage.setItem(change.key,change.before);}
            catch {
              // Inverse fence ordering is safe only after each restoration
              // succeeds. Do not release a fence while a live draft remains,
              // or restore a live draft after its fence restoration failed.
              break;
            }
          }
          if(!setterQuota||!allowInitialOverflow)return {kind:'failure',reason:recoveryErrorReason(error),...(confirmedNativeFailure?{nativeFailure:confirmedNativeFailure}:{})};
          try {
            legacyRaw=nativeRaw();const observed=JSON.parse(legacyRaw) as HomepageBundle;
            if(!decodeHomepageBundle(legacyRaw,ownerId)||!['inputRaw','draftRaw'].every(field=>observed[field as 'inputRaw'|'draftRaw']===previous[field as 'inputRaw'|'draftRaw']||observed[field as 'inputRaw'|'draftRaw']===target[field as 'inputRaw'|'draftRaw']))return {kind:'protected',reason:'native-divergence'};
          }catch{return {kind:'unavailable',reason:'native-read-unknown'};}
        }
      }
      if(!context.overflowEnabled||ownerId!==null&&!context.accountOverflowQualified)return {kind:'failure',reason:'overflow-held',...(confirmedNativeFailure?{nativeFailure:confirmedNativeFailure}:{})};
      const committed=await createRecoveryEntryStore(driver,{ownerId,isCurrent:()=>{try{return active()&&sameNativeHomepageLineage(nativeRaw(),legacyRaw,ownerId);}catch{return false;}}}).commit(entry(raw,writeId,before,legacyRaw));
      if(committed.kind!=='verified')return {kind:committed.kind==='protected-conflict'?'protected':'failure',reason:committed.kind==='ready'?'unknown':committed.reason,committed:'commitStatus' in committed&&committed.commitStatus==='committed'};
      const after=await read();if(after.kind!=='ready')return {...after,committed:true};
      return active()&&after.raw===raw&&after.envelope?.handle.writeId===writeId?{kind:'verified',backend:'indexeddb-entry'}:{kind:'protected',reason:'head-changed',committed:true};
    },
    async prepare<T>(work:(storage:HomepageStorage)=>Promise<T>,writeId:string):Promise<{kind:'prepared';value:T;raw:string;entry:RecoveryEntryWrite}|{kind:'protected'|'unavailable';reason:string}>{
      const before=await read();if(before.kind!=='ready')return before;
      const bundle=JSON.parse(before.raw) as HomepageBundle;
      try {
        const value=await work(virtual(bundle)),raw=JSON.stringify(bundle);
        if(!active())return {kind:'protected',reason:'operation-changed'};
        const decoded=decodeHomepageBundle(raw,ownerId);
        if(!decoded)return {kind:'protected',reason:'payload'};
        if(!draftOwnershipPreserved(decoded,before.draftRaw))return {kind:'protected',reason:'scope'};
        return {kind:'prepared',value,raw,entry:entry(raw,writeId,before)};
      }catch{return {kind:'protected',reason:'preparation'};}
    },
  };
}
export function isBrowserHomepageStorage(storage:Pick<Storage,'getItem'>) {
  try{return typeof window!=='undefined'&&storage===window.localStorage;}catch{return false;}
}
export function freezeHomepageTransition<T extends {storage:unknown}>(input:T):T {
  const frozen=Object.fromEntries(Object.entries(input).map(([key,value])=>[key,key==='storage'||typeof value==='function'?value:structuredClone(value)]));
  return frozen as T;
}
/** The real browser holds one receipt lock across preparation, native/domain
 * commit and exact readback. Injected pure adapters retain the legacy contract. */
export async function withBrowserHomepageStorage<T>(options:{storage:HomepageStorage;ownerId:string|null;isCurrent?:()=>boolean;
  lock?:<R>(key:string,work:()=>Promise<R>)=>Promise<R>;failure:T;stage?:PersistenceStage;
  preserve?:()=>boolean|Promise<boolean>;clearCurrentAfter?:boolean},work:(storage:HomepageStorage,lock?:<R>(key:string,work:()=>Promise<R>)=>Promise<R>)=>Promise<T>):Promise<T> {
  if(!isBrowserHomepageStorage(options.storage))return work(options.storage,options.lock);
  const guard=browserRecoveryGuard(options.isCurrent),ownerId=options.ownerId;
  try {
    return await withHomepageReceiptLock(ownerId,options.lock,async()=>{
      const store=await browserHomepage(ownerId,guard),writeId=globalThis.crypto.randomUUID();
      const prepared=await store.prepare(storage=>withPersistencePreparation(()=>work(storage,(_key,run)=>run())),writeId);
      if(prepared.kind!=='prepared'||!guard())return options.failure;
      const value=prepared.value;
      if(value===false||object(value)&&value.ok===false)return value;
      if(options.preserve&&(!await options.preserve()||!guard()))return {...(object(options.failure)?options.failure:{}),ok:false,reason:'preservation'} as T;
      const written=await store.write(prepared.raw,{allowInitialOverflow:true,writeId,expected:prepared.entry});
      const verified=written.kind==='verified'&&guard();
      reportPersistenceOutcome(options.stage??'homepage-input',{stored:verified,recoveryDurable:verified,readbackConfirmed:verified,
        ...(written.kind==='protected'?{blockedByExistingRecovery:true}:{}),
        ...(written.kind==='failure'&&written.nativeFailure?{nativeFailure:written.nativeFailure}:{})});
      if(!verified)return options.failure;
      if(options.clearCurrentAfter){
        const {clearActiveTrip}=await import('./storage.ts');
        if(!guard()||!await clearActiveTrip(ownerId)||!guard())return options.failure;
      }
      return value;
    });
  }catch{return options.failure;}
}
async function browserHomepage(ownerId:string|null,guard?:()=>boolean) {
  const isCurrent=browserRecoveryGuard(guard),storage=browserRecoveryStorage();
  return createDurableHomepagePersistence(storage,await browserRecoveryDriver(),{ownerId,isCurrent,
    overflowEnabled:RECOVERY_DOMAIN_OVERFLOW_ENABLED,accountOverflowQualified:RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED});
}
export async function readDurableHomepageState(ownerId:string|null,isCurrent?:()=>boolean):Promise<DurableHomepageState> {
  try{return await (await browserHomepage(ownerId,isCurrent)).read();}catch{return {kind:'unavailable',reason:'storage-access'};}
}
export async function pendingDurableReceiptStillCurrent(ownerId:string|null,receipt:PendingIntakeReceipt,fromHomepage:boolean,isCurrent?:()=>boolean) {
  const frozen=structuredClone(receipt),state=await readDurableHomepageState(ownerId,isCurrent);if(state.kind!=='ready')return false;
  return pendingReceiptStillCurrent({getItem:key=>key===homepageInputStorageKey(ownerId)?state.inputRaw:key===HOME_TRIP_DRAFT_KEY?state.draftRaw:null},frozen,fromHomepage);
}
/** Stage the existing receipt codec against exact retained bytes. The caller
 * commits this entry with the canonical generation; preparation is not an ACK. */
export async function prepareIntakeAcknowledgement(storage:HomepageStorage,driver:RecoveryDomainDriver,context:{ownerId:string|null;isCurrent:()=>boolean;overflowEnabled:boolean;accountOverflowQualified:boolean},
  intakeInput:RecoveryIntakeAcknowledgement,tripInput:EasyTTrip,writeId:string) {
  const intake=structuredClone(intakeInput),trip=structuredClone(tripInput),ownerId=context.ownerId;
  if(intake.completed.ownerId!==ownerId||!homepageHandoffMatchesTrip(intake.draft,trip))return {ok:false as const,reason:'protected' as const};
  const prepared=await createDurableHomepagePersistence(storage,driver,context).prepare(stage=>withPersistencePreparation(()=>acknowledgePendingIntakeReceiptInStorage({
    ...intake,storage:stage,isCurrent:context.isCurrent,lock:(_key,work)=>work(),
  })),writeId);
  if(prepared.kind!=='prepared')return {ok:false as const,reason:prepared.kind==='protected'?'protected' as const:'storage' as const};
  if(!prepared.value.ok)return {ok:false as const,reason:prepared.value.reason==='stale'?'protected' as const:'storage' as const};
  return {ok:true as const,entry:prepared.entry,receipt:{ownerId,tripId:trip.id,operationId:intake.completed.handoffId,raw:prepared.raw}};
}
