import type {EasyTTrip} from './trip.ts';
import {prepareTripDocumentForWrite,readTripDocument} from './trip-document.ts';
import type {EasyTBrowserStorage} from './storage.ts';
import type {RecoveryDomainDriver} from './durable-recovery-domain.ts';
import {createTwoStoreEntryPersistence} from './two-store-entry-persistence.ts';
import {createTwoStoreTripPersistence,type TwoStoreContext} from './two-store-trip-persistence.ts';
import {createTripReceiptPersistence} from './trip-receipt-persistence.ts';
import {tripCreationStorageKey} from './private-browser-context.ts';
import {builderInputDraftKey} from './trip-builder-input-draft.ts';
import {decodeRawRecovery} from './durable-recovery-domain.ts';
import {tripBuildDocumentsCanonicalEquivalent} from './trip-promotion.ts';

const sources=['curated-route','spreadsheet-import','manual-builder'] as const;
export type TripCreationSource=typeof sources[number];
export type TripCreationToken=Readonly<{version:1;kind:'trip-creation';ownerId:string|null;tripId:string;
  operationId:string;initialWriteId:string;source:TripCreationSource;initialTripRaw:string}>;
type CreationReceipt={version:2;kind:'creation';ownerId:string|null;tripId:string;operationId:string;reservationRaw:string};
/** Obtained only after the explicit-save facade validates the server response.
 * Like TrustedAccountAck, this is a bound response, never a boolean permission. */
export type CreationReceiptRebind={guestReservationRaw:string;guestReceiptRaw:string;submittedRecoveryRaw:string;canonicalRaw:string};
export function validCreationReceiptRebind(binding:CreationReceiptRebind,receiptRaw:string,trip:EasyTTrip,ownerId:string|null):boolean {
  if(ownerId===null)return false;
  const token=decodeTripCreationToken(binding.guestReservationRaw,null,trip.id),receipt=decodeCreationReceipt(binding.guestReceiptRaw,null,trip.id);
  const source=decodeRawRecovery(binding.submittedRecoveryRaw,{ownerId:null,tripId:trip.id});
  try {
    const canonical=readTripDocument(JSON.parse(binding.canonicalRaw));
    return Boolean(token&&receipt?.reservationRaw===binding.guestReservationRaw&&source.kind==='readable'&&source.value.trip.ownerId===null
      &&canonical.kind==='readable'&&canonical.trip.ownerId===ownerId&&canonical.trip.id===trip.id
      &&JSON.stringify(prepareTripDocumentForWrite(trip))===binding.canonicalRaw
      &&tripBuildDocumentsCanonicalEquivalent(source.value.trip,canonical.trip,ownerId)
      &&creationReceiptRaw(token,ownerId)===receiptRaw);
  }catch{return false;}
}
const text=(value:unknown):value is string=>typeof value==='string'&&Boolean(value.trim());
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const exactKeys=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).sort().join('|')===keys.sort().join('|');

/** Called only by an explicit fresh producer; neither this object nor a receipt
 * is account authority. Storage must still prove the trip identity is unused. */
export function createTripCreationToken(trip:EasyTTrip,ownerId:string|null,source:TripCreationSource,operationId:string):TripCreationToken {
  const token:TripCreationToken={version:1,kind:'trip-creation',ownerId,tripId:trip.id,operationId,
    initialWriteId:`creation:${operationId}`,source,initialTripRaw:JSON.stringify(prepareTripDocumentForWrite(structuredClone(trip)))};
  if(!decodeTripCreationToken(JSON.stringify(token),ownerId,trip.id))throw new TypeError('Invalid creation intent');
  return Object.freeze(token);
}
export function decodeTripCreationToken(raw:string,ownerId:string|null,tripId:string):TripCreationToken|null {
  try {
    const value:unknown=JSON.parse(raw);
    if(!record(value)||!exactKeys(value,['version','kind','ownerId','tripId','operationId','initialWriteId','source','initialTripRaw'])
      ||value.version!==1||value.kind!=='trip-creation'||value.ownerId!==ownerId||value.tripId!==tripId
      ||!(ownerId===null||text(ownerId))||!text(tripId)||!text(value.operationId)
      ||value.initialWriteId!==`creation:${value.operationId}`||!sources.includes(value.source as TripCreationSource)
      ||typeof value.initialTripRaw!=='string')return null;
    const initial=readTripDocument(JSON.parse(value.initialTripRaw));
    if(initial.kind!=='readable'||initial.trip.id!==tripId||initial.trip.ownerId!==null&&initial.trip.ownerId!==ownerId
      ||JSON.stringify(prepareTripDocumentForWrite(initial.trip))!==value.initialTripRaw)return null;
    return Object.freeze(value as TripCreationToken);
  }catch{return null;}
}
export function creationReceiptRaw(token:TripCreationToken,ownerId:string|null):string {
  if(!decodeTripCreationToken(JSON.stringify(token),token.ownerId,token.tripId)
    ||token.ownerId!==null&&token.ownerId!==ownerId)throw new TypeError('Invalid creation binding');
  return JSON.stringify({version:2,kind:'creation',ownerId,tripId:token.tripId,operationId:token.operationId,reservationRaw:JSON.stringify(token)} satisfies CreationReceipt);
}
export function decodeCreationReceipt(raw:string,ownerId:string|null,tripId:string):CreationReceipt|null {
  try {
    const value:unknown=JSON.parse(raw);
    if(!record(value)||!exactKeys(value,['version','kind','ownerId','tripId','operationId','reservationRaw'])
      ||value.version!==2||value.kind!=='creation'||value.ownerId!==ownerId||value.tripId!==tripId||typeof value.reservationRaw!=='string')return null;
    const candidate=JSON.parse(value.reservationRaw) as {ownerId?:unknown};
    if(candidate.ownerId!==null&&candidate.ownerId!==ownerId)return null;
    const token=decodeTripCreationToken(value.reservationRaw,candidate.ownerId as string|null,tripId);
    return token&&token.operationId===value.operationId?value as CreationReceipt:null;
  }catch{return null;}
}
export function createTripCreationPersistence(storage:EasyTBrowserStorage,driver:RecoveryDomainDriver,context:TwoStoreContext&{tripId:string}) {
  return createTwoStoreEntryPersistence(storage,driver,{...context,scope:{ownerId:context.ownerId,tripId:context.tripId,kind:'trip-creation'},
    key:tripCreationStorageKey(context.ownerId,context.tripId),validate:raw=>raw===null||Boolean(decodeTripCreationToken(raw,context.ownerId,context.tripId))});
}

/** Reserve before the first body setter. An interrupted body is retryable only
 * under that exact reserved operation. Existing legacy trips never gain proof. */
export async function prepareTripCreationCheckpoint(storage:EasyTBrowserStorage,driver:RecoveryDomainDriver,context:TwoStoreContext,
  trip:EasyTTrip,token:TripCreationToken,onReserved?:()=>void) {
  const raw=JSON.stringify(token),checked=decodeTripCreationToken(raw,context.ownerId,trip.id);
  const refuse=()=>({ok:false as const,reason:'creation-protected'});
  if(!checked||JSON.stringify(prepareTripDocumentForWrite(trip))!==checked.initialTripRaw||!context.isCurrent())return refuse();
  const scope={...context,tripId:trip.id},reservations=createTripCreationPersistence(storage,driver,scope);
  const receipts=createTripReceiptPersistence(storage,driver,scope),trips=createTwoStoreTripPersistence(storage,driver,context);
  const before=await reservations.read(),body=await trips.read(trip.id),receipt=await receipts.read();
  if(before.kind!=='ready'||receipt.kind!=='ready'||before.raw!==null&&before.raw!==raw)return refuse();
  const exactInitial=()=>body.kind==='found'&&body.recovery?.writeId===checked.initialWriteId
    &&body.recovery.ownerId===context.ownerId&&JSON.stringify(prepareTripDocumentForWrite(body.trip))===checked.initialTripRaw;
  if(before.raw===null) {
    // Builder inputs or an account/cache/body already present make this an
    // existing identity, even when the caller still carries an overflow flag.
    const input=createTwoStoreEntryPersistence(storage,driver,{...context,scope:{ownerId:context.ownerId,tripId:trip.id,kind:'builder-input'},
      key:builderInputDraftKey(context.ownerId,trip.id),validate:raw=>raw===null||typeof raw==='string'});
    const inputBefore=await input.read();
    if(body.kind!=='missing'||receipt.raw!==null||inputBefore.kind!=='ready'||inputBefore.raw!==null)return refuse();
    const reserved=await reservations.save(raw,{allowInitialOverflow:true,writeId:`${checked.operationId}:reservation`});
    if(reserved.kind!=='verified')return refuse();
  } else if(body.kind!=='missing'&&!exactInitial())return refuse();
  // Record the exact continuation as soon as reservation durability is known,
  // even when a later preparation/readback fails before the first body write.
  if(!context.isCurrent())return refuse();
  onReserved?.();
  const after=await trips.read(trip.id),retained=await reservations.read();
  if(!context.isCurrent()||retained.kind!=='ready'||retained.raw!==raw
    ||after.kind!=='missing'&&!(after.kind==='found'&&after.recovery?.writeId===checked.initialWriteId
      &&JSON.stringify(prepareTripDocumentForWrite(after.trip))===checked.initialTripRaw))return refuse();
  const receiptRaw=creationReceiptRaw(checked,context.ownerId),completion=await receipts.prepare(receiptRaw,`${checked.operationId}:completion`);
  if(!completion.ok)return refuse();
  const reservation=await reservations.prepareForDomain(raw,`${checked.operationId}:paired-reservation`,retained);
  if(!('raw' in reservation))return refuse();
  return {ok:true as const,token:checked,entries:[reservation,completion.entry],receipt:completion.receipt,
    ...(after.kind==='found'?{replacement:after.recovery!,expectedRecoverySource:after.trip}:{})};
}

/** Read-only continuation classification. Missing proof stays legacy; it is
 * never repaired by inventing a creation event at reopen. */
export async function readTripCreationContinuation(storage:EasyTBrowserStorage,driver:RecoveryDomainDriver,context:TwoStoreContext,trip:EasyTTrip,writeId:string) {
  const reservation=await createTripCreationPersistence(storage,driver,{...context,tripId:trip.id}).read();
  const completed=await createTripReceiptPersistence(storage,driver,{...context,tripId:trip.id}).read();
  if(reservation.kind!=='ready'||completed.kind!=='ready')return {kind:'protected' as const};
  if(reservation.raw===null)return {kind:'none' as const};
  const token=decodeTripCreationToken(reservation.raw,context.ownerId,trip.id);
  if(!token)return {kind:'protected' as const};
  if(completed.raw!==null)return decodeCreationReceipt(completed.raw,context.ownerId,trip.id)?.reservationRaw===reservation.raw
    ?{kind:'complete' as const}:{kind:'protected' as const};
  if(writeId!==token.initialWriteId||JSON.stringify(prepareTripDocumentForWrite(trip))!==token.initialTripRaw)return {kind:'protected' as const};
  return {kind:'pending' as const,token};
}
export async function loadTripCreationContinuation(trip:EasyTTrip,writeId:string,ownerId:string|null,isCurrent:()=>boolean) {
  const {browserRecoveryDriver,browserRecoveryGuard,browserRecoveryStorage}=await import('./browser-recovery-persistence.ts');
  const {RECOVERY_DOMAIN_OVERFLOW_ENABLED,RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED}=await import('./recovery-domain-policy.ts');
  return readTripCreationContinuation(browserRecoveryStorage(),await browserRecoveryDriver(),{ownerId,isCurrent:browserRecoveryGuard(isCurrent),
    overflowEnabled:RECOVERY_DOMAIN_OVERFLOW_ENABLED,accountOverflowQualified:RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED},trip,writeId);
}

export async function readReservedTripCreation(storage:EasyTBrowserStorage,driver:RecoveryDomainDriver,context:TwoStoreContext,tripId:string,operationId:string) {
  const reservation=await createTripCreationPersistence(storage,driver,{...context,tripId}).read();
  if(reservation.kind!=='ready'||reservation.raw===null)return null;
  const token=decodeTripCreationToken(reservation.raw,context.ownerId,tripId);
  if(!token||token.operationId!==operationId)return null;
  const body=await createTwoStoreTripPersistence(storage,driver,context).read(tripId);
  if(!context.isCurrent())return null;
  if(body.kind==='missing')return {token,trip:prepareTripDocumentForWrite(JSON.parse(token.initialTripRaw))};
  if(body.kind!=='found'||!body.recovery)return null;
  const continuation=await readTripCreationContinuation(storage,driver,context,body.trip,body.recovery.writeId);
  // A retained reservation URL remains a useful way back after the checkpoint
  // completed too. It grants neither sign-in nor replacement of later edits.
  return context.isCurrent()&&(continuation.kind==='pending'||continuation.kind==='complete')?{token,trip:body.trip}:null;
}
export async function loadReservedTripCreation(tripId:string,operationId:string,ownerId:string|null,isCurrent:()=>boolean) {
  const {browserRecoveryDriver,browserRecoveryGuard,browserRecoveryStorage}=await import('./browser-recovery-persistence.ts');
  const {RECOVERY_DOMAIN_OVERFLOW_ENABLED,RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED}=await import('./recovery-domain-policy.ts');
  const context={ownerId,isCurrent:browserRecoveryGuard(isCurrent),overflowEnabled:RECOVERY_DOMAIN_OVERFLOW_ENABLED,accountOverflowQualified:RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED};
  const storage=browserRecoveryStorage(),driver=await browserRecoveryDriver();
  return readReservedTripCreation(storage,driver,context,tripId,operationId);
}
