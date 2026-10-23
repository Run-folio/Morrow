import {decodeCreationReceipt} from './trip-creation-provenance.ts';
import {decodeHomepageBundle} from './homepage-persistence.ts';
import {homepageSemanticInputFingerprint,homepageHandoffReceiptForOwner,reusableHomepageReceipt,type HomeTripDraft} from './home-trip-handoff.ts';
import {createTwoStoreEntryPersistence} from './two-store-entry-persistence.ts';
import {tripReceiptStorageKey} from './private-browser-context.ts';
import type {EasyTBrowserStorage} from './storage.ts';
import type {RecoveryDomainDriver} from './durable-recovery-domain.ts';
import type {TwoStoreContext} from './two-store-trip-persistence.ts';

/** Historical provenance only: this never grants an active intake or account ACK.
 * The original input can differ from the trip after later traveller edits. */
export function completedTripReceipt(raw:string,ownerId:string|null,tripId:string) {
  const decoded=decodeHomepageBundle(raw,ownerId),input=decoded?.storedInput,receipt=input?.receipt;
  if(!decoded||!input||input.review||receipt?.version!==1||receipt.ownerId!==ownerId||receipt.tripId!==tripId
    ||!receipt.semanticInputFingerprint||receipt.semanticInputFingerprint!==homepageSemanticInputFingerprint(input.snapshot))return null;
  if(decoded.bundle.draftRaw!==null) {
    const draft=decoded.draft as HomeTripDraft|null;
    const supporting=draft&&homepageHandoffReceiptForOwner(draft,ownerId);
    if(!draft||!supporting||!reusableHomepageReceipt(input,draft)
      ||supporting.version!==receipt.version||supporting.ownerId!==receipt.ownerId||supporting.tripId!==receipt.tripId
      ||supporting.handoffId!==receipt.handoffId||supporting.inputFingerprint!==receipt.inputFingerprint
      ||supporting.semanticInputFingerprint!==receipt.semanticInputFingerprint)return null;
  }
  return receipt;
}

/** Direct Builder intake preserves the shared Home draft. Its paired immutable
 * receipt instead retains the accepted projection. Only the exact same raw
 * input may connect those two entries; this grants no claim or account ACK. */
export function homepageInputMatchesTripReceipt(homeRaw:string,receiptRaw:string,ownerId:string|null,tripId:string) {
  if(!completedTripReceipt(receiptRaw,ownerId,tripId))return false;
  const home=decodeHomepageBundle(homeRaw,ownerId),receipt=decodeHomepageBundle(receiptRaw,ownerId);
  return Boolean(home&&receipt&&home.bundle.inputRaw!==null&&home.bundle.inputRaw===receipt.bundle.inputRaw);
}

/** Both variants prove historical creation only, never account authority. */
export function tripReceiptIdentity(raw:string,ownerId:string|null,tripId:string) {
  const home=completedTripReceipt(raw,ownerId,tripId);
  if(home)return {kind:'home' as const,operationId:home.handoffId};
  const creation=decodeCreationReceipt(raw,ownerId,tripId);
  return creation?{kind:'creation' as const,operationId:creation.operationId}:null;
}

export function createTripReceiptPersistence(storage:EasyTBrowserStorage,driver:RecoveryDomainDriver,context:TwoStoreContext&{tripId:string}) {
  const {ownerId,tripId}=context;
  const entries=createTwoStoreEntryPersistence(storage,driver,{...context,scope:{ownerId,tripId,kind:'trip-receipt'},key:tripReceiptStorageKey(ownerId,tripId),
    validate:raw=>raw===null||Boolean(tripReceiptIdentity(raw,ownerId,tripId))});
  return {
    read:entries.read,
    async prepare(raw:string,writeId:string) {
      const receipt=tripReceiptIdentity(raw,ownerId,tripId);
      if(!receipt)return {ok:false as const,reason:'payload'};
      const before=await entries.read();
      if(before.kind!=='ready')return {ok:false as const,reason:before.reason};
      // Completed provenance has one immutable meaning per trip. Another
      // handoff is not a newer winner; exact repeats are idempotent.
      if(before.raw!==null&&before.raw!==raw)return {ok:false as const,reason:'receipt-exists'};
      const entry=await entries.prepareForDomain(raw,writeId,before);
      if(!('raw' in entry))return {ok:false as const,reason:'reason'in entry?entry.reason:'preparation'};
      return {ok:true as const,entry,receipt:{ownerId,tripId,operationId:receipt.operationId,raw},before};
    },
  };
}
