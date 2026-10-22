import {createDurablePlaceResearchBudget} from './public-place-durable.server.ts';
import {PUBLIC_PLACE_NOTICE_VERSION} from './public-place-search-input.ts';
import {assertStagingConnectionTarget} from './staging-deployment-target.mjs';
/** No live adapter is configured. A flag alone cannot activate paid research. */
export const PLACE_RESEARCH_RESERVATION_MICRO_USD = 250_000;
const POLICY_VERSION = 'luna-place-v1';
export type PlaceResearchBudget = {
  kind: 'durable-reservation-v1';
  /** Must atomically enforce cross-instance global money/rate/concurrency limits.
   * Count the full worst case before dispatch; keep charges on uncertain outcomes.
   * No query, IP, user or trip data belongs in this shared budget record. */
  reserve(input: {operation:'public-place-research';policyVersion:string;maximumMicroUsd:number},signal:AbortSignal): Promise<
    {admitted:false} | {admitted:true;reservationId:string;reservedMicroUsd:number;policyVersion:string}>;
};
export type PlaceResearchControls = {
  activationRequested:boolean;privacyReviewed:boolean;noticeReviewed:boolean;abuseReviewed:boolean;spendReviewed:boolean;
  qualifiedUntil:number;budget?:PlaceResearchBudget;
};
export function defaultPlaceResearchControls(environment:Record<string,string|undefined>=process.env,now=Date.now()): PlaceResearchControls {
  const disabled:PlaceResearchControls={activationRequested:false,privacyReviewed:false,noticeReviewed:false,abuseReviewed:false,spendReviewed:false,qualifiedUntil:0};
  if(environment.MORROVIA_ENVIRONMENT!=='staging'||environment.MORROVIA_PLACE_RESEARCH_ENABLED!=='true')return disabled;
  try{
    assertStagingConnectionTarget(environment.DATABASE_URL);
    const raw=environment.MORROVIA_PLACE_RESEARCH_REVIEW??'';if(raw.length>1500)return disabled;
    const review=JSON.parse(raw) as Record<string,unknown>;
    const origin=new URL(environment.NEXT_PUBLIC_APP_URL??'');
    if(origin.protocol!=='https:'||['morrovia.com','www.morrovia.com'].includes(origin.hostname)||review.origin!==origin.origin
      ||review.scope!=='morrovia:place-research:staging'||typeof review.reviewReference!=='string'||!/^[-a-zA-Z0-9_:]{4,120}$/.test(review.reviewReference)
      ||review.privacyReviewed!==true||review.abuseReviewed!==true||review.spendReviewed!==true||review.noticeVersion!==PUBLIC_PLACE_NOTICE_VERSION)return disabled;
    const until=Date.parse(String(review.qualifiedUntil));if(!Number.isFinite(until)||until<=now||until>now+7*86400000)return disabled;
    return {activationRequested:true,privacyReviewed:true,noticeReviewed:true,abuseReviewed:true,spendReviewed:true,qualifiedUntil:until,
      budget:createDurablePlaceResearchBudget({scope:review.scope,reviewReference:review.reviewReference})};
  }catch{return disabled;}
}
export function publicPlaceResearchReady(controls: PlaceResearchControls, now=Date.now()) {
  return controls.activationRequested && controls.privacyReviewed && controls.noticeReviewed && controls.abuseReviewed
    && controls.spendReviewed && Number.isFinite(controls.qualifiedUntil) && controls.qualifiedUntil > now
    && controls.budget?.kind === 'durable-reservation-v1';
}
export async function runAdmittedPlaceResearch<T>(controls:PlaceResearchControls,signal:AbortSignal,upstream:()=>Promise<T>):Promise<T> {
  if (!publicPlaceResearchReady(controls) || signal.aborted) throw new Error('Place research unavailable');
  // A stalled admission must not leave a request hanging. A late claim is retained
  // conservatively; it can never dispatch a late upstream request from this code.
  const admissionSignal=AbortSignal.any([signal,AbortSignal.timeout(1000)]);
  let stop: (()=>void)|undefined;
  const aborted=new Promise<never>((_resolve,reject)=>{stop=()=>reject(new Error('Place research unavailable'));admissionSignal.addEventListener('abort',stop,{once:true});});
  try {
    const claim=await Promise.race([controls.budget!.reserve({operation:'public-place-research',policyVersion:POLICY_VERSION,maximumMicroUsd:PLACE_RESEARCH_RESERVATION_MICRO_USD},admissionSignal),aborted]);
    if (admissionSignal.aborted || !publicPlaceResearchReady(controls) || !claim || claim.admitted !== true
      || typeof claim.reservationId !== 'string' || !claim.reservationId || claim.reservationId.length>120
      || !Number.isSafeInteger(claim.reservedMicroUsd) || claim.reservedMicroUsd < PLACE_RESEARCH_RESERVATION_MICRO_USD
      || claim.policyVersion !== POLICY_VERSION) throw new Error('Place research unavailable');
    // No automatic refund/release/retry: errors after dispatch may have cost money.
    return await upstream();
  } finally { if(stop) admissionSignal.removeEventListener('abort',stop); }
}
