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

export function createTripReceiptPersistence(storage:EasyTBrowserStorage,driver:RecoveryDomainDriver,context:TwoStoreContext&{tripId:string}) {
  const {ownerId,tripId}=context;
  const entries=createTwoStoreEntryPersistence(storage,driver,{...context,scope:{ownerId,tripId,kind:'trip-receipt'},key:tripReceiptStorageKey(ownerId,tripId),
    validate:raw=>raw===null||Boolean(completedTripReceipt(raw,ownerId,tripId))});
  return {
    read:entries.read,
    async prepare(raw:string,writeId:string) {
      const receipt=completedTripReceipt(raw,ownerId,tripId);
      if(!receipt)return {ok:false as const,reason:'payload'};
      const before=await entries.read();
      if(before.kind!=='ready')return {ok:false as const,reason:before.reason};
      // Completed provenance has one immutable meaning per trip. Another
      // handoff is not a newer winner; exact repeats are idempotent.
      if(before.raw!==null&&before.raw!==raw)return {ok:false as const,reason:'receipt-exists'};
      const entry=await entries.prepareForDomain(raw,writeId,before);
      if(!('raw' in entry))return {ok:false as const,reason:'reason'in entry?entry.reason:'preparation'};
      return {ok:true as const,entry,receipt:{ownerId,tripId,operationId:receipt.handoffId,raw},before};
    },
  };
}
