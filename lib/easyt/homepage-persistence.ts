import type { RecoveryDomainDriver } from './durable-recovery-domain.ts';
import type { RecoveryEntryEnvelope, RecoveryEntryWrite } from './durable-entry-protocol.ts';
import type { StoredHomepageInput, PendingIntakeReceipt } from './home-trip-handoff.ts';
import {HOME_TRIP_DRAFT_KEY,readHomepageInput,pendingIntakeReceiptForOwner,pendingHomepageHandoffForOwner,
  homepageHandoffReceiptForOwner,homepageHandoffMatchesTrip,pendingReceiptStillCurrent,withHomepageReceiptLock,acknowledgePendingIntakeReceiptInStorage,
  type HomeTripDraft,type HomepageHandoffReceipt} from './home-trip-handoff.ts';
import {homepageInputStorageKey} from './private-browser-context.ts';
import {createRecoveryEntryStore} from './durable-entry-store.ts';
import {sameEntryHandle} from './durable-entry-protocol.ts';
import {recoveryErrorReason} from './durable-recovery-error.ts';
import {browserRecoveryDriver,browserRecoveryStorage,browserRecoveryGuard} from './browser-recovery-persistence.ts';
import {RECOVERY_DOMAIN_OVERFLOW_ENABLED,RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED} from './recovery-domain-policy.ts';
import {withPersistencePreparation,reportPersistenceOutcome,type PersistenceStage} from './persistence-outcome.ts';
import {prepareEntryWrite} from './durable-entry-store.ts';
import type {EasyTTrip} from './trip.ts';
export type HomepageStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type HomepageBundle = {version:1;inputRaw:string|null;draftRaw:string|null};
export type DurableHomepageState = {kind:'ready';storedInput:StoredHomepageInput|null;draft:unknown|null;inputRaw:string|null;draftRaw:string|null;
  raw:string;legacyRaw:string;envelope:RecoveryEntryEnvelope|null}|{kind:'protected'|'unavailable';reason:string};
export type HomepageWriteResult = {kind:'verified';backend:'local-storage'|'indexeddb-entry'}|{kind:'protected'|'unavailable'|'failure';reason:string;committed?:boolean;nativeFailure?:'quota'|'security'|'unavailable'|'unknown'};
export type RecoveryIntakeAcknowledgement={pending?:PendingIntakeReceipt;completed:HomepageHandoffReceipt;draft:HomeTripDraft;fromHomepage:boolean};
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
export function decodeHomepageBundle(raw:string,ownerId:string|null) {
  try {
    const value:unknown=JSON.parse(raw);
    if(!object(value)||value.version!==1||Object.keys(value).sort().join(',')!=='draftRaw,inputRaw,version'
      ||![value.inputRaw,value.draftRaw].every(item=>item===null||typeof item==='string'))return null;
    const bundle=value as HomepageBundle;
    const storedInput=bundle.inputRaw===null?null:readHomepageInput(JSON.parse(bundle.inputRaw),ownerId);
    if(bundle.inputRaw!==null&&!storedInput)return null;
    const draft:unknown=bundle.draftRaw===null?null:JSON.parse(bundle.draftRaw);
    if(draft!==null) {
      if(!object(draft))return null;
      if(draft.version===2) {
        const receipt=pendingIntakeReceiptForOwner(draft.receipt,ownerId);
        if(!receipt||!pendingHomepageHandoffForOwner(draft,ownerId,receipt.handoffId))return null;
      }else if('homepage' in draft) {
        if(!homepageHandoffReceiptForOwner(draft as HomeTripDraft,ownerId))return null;
      }else if(ownerId!==null||'version' in draft||!['brief','origin','destination','destinations','locationMentions'].some(key=>key in draft))return null;
    }
    return {bundle,storedInput,draft};
  }catch{return null;}
}
export function createDurableHomepagePersistence(storage:HomepageStorage,driver:RecoveryDomainDriver,context:{ownerId:string|null;isCurrent:()=>boolean;overflowEnabled:boolean;accountOverflowQualified:boolean}) {
  const ownerId=context.ownerId,scope={ownerId,kind:'homepage' as const,tripId:null},inputKey=homepageInputStorageKey(ownerId);
  const active=()=>{try{return context.isCurrent()===true;}catch{return false;}};
  const entries=createRecoveryEntryStore(driver,{ownerId,isCurrent:active});
  const nativeRaw=()=>{
    const snapshot=()=>JSON.stringify({version:1,inputRaw:storage.getItem(inputKey),draftRaw:storage.getItem(HOME_TRIP_DRAFT_KEY)});
    const raw=snapshot();if(raw!==snapshot())throw new Error('Homepage native snapshot changed');return raw;
  };
  async function read():Promise<DurableHomepageState> {
    if(!active())return {kind:'protected',reason:'operation-changed'};
    const result=await entries.read(scope);
    if(result.kind!=='ready')return {kind:result.kind==='protected-conflict'||result.kind==='failure'&&['schema','corrupt'].includes(result.reason)?'protected':'unavailable',reason:result.kind==='verified'?'unknown':result.reason};
    try {
      const legacyRaw=nativeRaw(),envelope=result.envelope;
      if(!active())return {kind:'protected',reason:'operation-changed'};
      if(!decodeHomepageBundle(legacyRaw,ownerId))return {kind:'protected',reason:'native-payload'};
      if(envelope&&legacyRaw!==envelope.legacyRaw&&legacyRaw!==envelope.raw)return {kind:'protected',reason:'native-divergence'};
      const raw=envelope?envelope.raw:legacyRaw;
      const decoded=raw===null?null:decodeHomepageBundle(raw,ownerId);
      if(!decoded||raw===null)return {kind:'protected',reason:'payload'};
      return {kind:'ready',...decoded.bundle,storedInput:decoded.storedInput,draft:decoded.draft,raw,legacyRaw,envelope};
    }catch{return {kind:'unavailable',reason:'native-read-unknown'};}
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
      if(expected) {
        const validated=prepareEntryWrite(expected,ownerId);if(validated.kind!=='prepared'||validated.scope.kind!=='homepage')return {kind:'protected',reason:'preparation'};
        const prepared=validated.envelope;
        if(prepared.raw!==raw||!sameEntryHandle(expected.expectedHead,before.envelope?.handle??null)
          ||prepared.legacyRaw!==before.legacyRaw||prepared.retainedPreviousRaw!==before.raw)return {kind:'protected',reason:'preparation-changed'};
      }
      let legacyRaw=before.legacyRaw,confirmedNativeFailure: 'quota'|'security'|'unavailable'|'unknown'|undefined;
      if(!before.envelope) {
        const previous=JSON.parse(before.legacyRaw) as HomepageBundle,target=decoded.bundle;
        const changes:Array<{key:string;before:string|null;after:string|null}>=[];
        let setterQuota=false;
        try {
          for(const [field,key] of [['inputRaw',inputKey],['draftRaw',HOME_TRIP_DRAFT_KEY]] as const) {
            const old=previous[field],next=target[field];if(old===next)continue;
            if(!active()||nativeRaw()!==JSON.stringify({...previous,...Object.fromEntries(changes.map(change=>[change.key===inputKey?'inputRaw':'draftRaw',change.after]))}))return {kind:'protected',reason:'native-changed'};
            try {if(next===null)storage.removeItem(key);else storage.setItem(key,next);}
            catch(error){const reason=recoveryErrorReason(error);setterQuota=next!==null&&reason==='quota';
              if(next!==null)confirmedNativeFailure=reason==='quota'||reason==='security'||reason==='unavailable'?reason:'unknown';throw error;}
            changes.push({key,before:old,after:next});
            if(storage.getItem(key)!==next)throw new Error('Homepage native readback refused');
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
            catch {/* A confirmed setter quota may retain prior and partial bytes below. */}
          }
          if(!setterQuota||!allowInitialOverflow)return {kind:'failure',reason:recoveryErrorReason(error),...(confirmedNativeFailure?{nativeFailure:confirmedNativeFailure}:{})};
          try {
            legacyRaw=nativeRaw();const observed=JSON.parse(legacyRaw) as HomepageBundle;
            if(!decodeHomepageBundle(legacyRaw,ownerId)||!['inputRaw','draftRaw'].every(field=>observed[field as 'inputRaw'|'draftRaw']===previous[field as 'inputRaw'|'draftRaw']||observed[field as 'inputRaw'|'draftRaw']===target[field as 'inputRaw'|'draftRaw']))return {kind:'protected',reason:'native-divergence'};
          }catch{return {kind:'unavailable',reason:'native-read-unknown'};}
        }
      }
      if(!context.overflowEnabled||ownerId!==null&&!context.accountOverflowQualified)return {kind:'failure',reason:'overflow-held',...(confirmedNativeFailure?{nativeFailure:confirmedNativeFailure}:{})};
      const committed=await createRecoveryEntryStore(driver,{ownerId,isCurrent:()=>{try{return active()&&nativeRaw()===legacyRaw;}catch{return false;}}}).commit(entry(raw,writeId,before,legacyRaw));
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
        if(!decodeHomepageBundle(raw,ownerId))return {kind:'protected',reason:'payload'};
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
