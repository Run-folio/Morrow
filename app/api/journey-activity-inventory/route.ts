import { NextResponse } from "next/server";
import { readViatorPublicRequest, ViatorPublicInputError } from "@/lib/easyt/viator-public-request";
import { ViatorAffiliateClient, ViatorAffiliateError } from "@/lib/easyt/viator-affiliate.server";
import type {PlanningEvidenceState,PlanningFailureReason} from '@/lib/easyt/planning-evidence-state';
import {providerFailureAssessment} from '@/lib/easyt/planning-provider-assessment';

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const started=performance.now();
  const blocked=(reason:PlanningFailureReason,status:number)=>{
    const assessment:PlanningEvidenceState={retrieval:'blocked',evidence:reason==='auth_required'?'insufficient':'unqualified',reason,retryable:false,
      checkedAt:new Date().toISOString(),sourceCount:0,diagnostics:{attemptedSources:[],elapsedMs:performance.now()-started,cacheOutcome:'not-used',...(reason!=='auth_required'?{stage:'identity' as const}:{})}};
    return NextResponse.json({activities:[],assessment},{status,headers:{'cache-control':'no-store'}});
  };
  try {
    const input = await readViatorPublicRequest(request);
    const result = await new ViatorAffiliateClient().searchActivitiesWithDiagnostics(input);
    const assessment:PlanningEvidenceState={retrieval:'completed',evidence:result.activities.length?'conditional':'insufficient',retryable:false,
      ...(!result.activities.length&&result.counts?{reason:result.counts.raw?'filtered_empty' as const:'successful_empty' as const}:{}),
      checkedAt:new Date().toISOString(),sourceCount:result.activities.length,diagnostics:{attemptedSources:['commercial-inventory'],elapsedMs:performance.now()-started,cacheOutcome:result.cacheOutcome,stage:'evidence'}};
    return NextResponse.json({ assessment,...(result.counts?{counts:result.counts}:{}),activities: result.activities.map((activity) => ({
      ...activity,
      // Provider destination IDs remain an adapter concern; clients need only
      // Morrovia's canonical identity and Viator's truthful location label.
      destination: { canonicalPlaceId: activity.destination.canonicalPlaceId, label: activity.destination.label },
    })) },{headers:{'cache-control':'no-store'}});
  } catch (error) {
    if (error instanceof ViatorPublicInputError) return blocked(error.reason,error.status);
    if(error instanceof SyntaxError)return blocked('invalid_input',400);
    const assessment=providerFailureAssessment(error instanceof ViatorAffiliateError?error.category:'unavailable','commercial-inventory',performance.now()-started);
    if(error instanceof ViatorAffiliateError&&error.lookupAttempted===false)assessment.diagnostics!.attemptedSources=[];
    // A completed taxonomy lookup can require identity confirmation without
    // establishing stock or indicating missing provider configuration.
    return NextResponse.json({activities:[],assessment},
      {status:assessment.retrieval==='blocked'?400:error instanceof ViatorAffiliateError&&error.category==='rate_limited'?429:503,headers:{'cache-control':'no-store',...(error instanceof ViatorAffiliateError&&error.retryAfterSeconds?{'retry-after':String(Math.min(86_400,error.retryAfterSeconds))}:{})}});
  }
}
