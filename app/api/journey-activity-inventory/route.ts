import { NextResponse } from "next/server";
import { requireEasyTOwner } from "@/lib/easyt/owner";
import { ViatorAffiliateClient, ViatorAffiliateError } from "@/lib/easyt/viator-affiliate.server";
import type {PlanningEvidenceState,PlanningFailureReason} from '@/lib/easyt/planning-evidence-state';
import {providerFailureAssessment} from '@/lib/easyt/planning-provider-assessment';

export const dynamic = "force-dynamic";

function optionalString(value: unknown, maximum: number) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : null;
}

export async function POST(request: Request) {
  const started=performance.now();
  const blocked=(reason:PlanningFailureReason,status:number)=>{
    const assessment:PlanningEvidenceState={retrieval:'blocked',evidence:reason==='auth_required'?'insufficient':'unqualified',reason,retryable:false,
      checkedAt:new Date().toISOString(),sourceCount:0,diagnostics:{attemptedSources:[],elapsedMs:performance.now()-started,cacheOutcome:'not-used',...(reason!=='auth_required'?{stage:'identity' as const}:{})}};
    return NextResponse.json({activities:[],assessment},{status,headers:{'cache-control':'no-store'}});
  };
  try {
    await requireEasyTOwner();
    const body = await request.json() as { workspace?: unknown; destination?: Record<string, unknown>; locale?: unknown; currency?: unknown };
    const workspace = body.workspace === "map" ? "map" : "itinerary";
    const canonicalPlaceId = typeof body.destination?.canonicalPlaceId === "string" ? body.destination.canonicalPlaceId.trim() : "";
    const name = typeof body.destination?.name === "string" ? body.destination.name.trim() : "";
    const country = optionalString(body.destination?.country, 80);
    const countryCode = optionalString(body.destination?.countryCode, 2);
    const region = optionalString(body.destination?.region, 120);
    const placeType = optionalString(body.destination?.placeType, 40);
    const aliases = body.destination?.aliases === undefined ? [] : Array.isArray(body.destination.aliases)
      ? body.destination.aliases.flatMap((alias) => typeof alias === "string" && alias.trim() && alias.trim().length <= 120 ? [alias.trim()] : []).slice(0, 16)
      : null;
    const rawCoordinates = body.destination?.coordinates;
    const coordinates = rawCoordinates && typeof rawCoordinates === "object"
      && typeof (rawCoordinates as { latitude?: unknown }).latitude === "number"
      && Number.isFinite((rawCoordinates as { latitude: number }).latitude)
      && Math.abs((rawCoordinates as { latitude: number }).latitude) <= 90
      && typeof (rawCoordinates as { longitude?: unknown }).longitude === "number"
      && Number.isFinite((rawCoordinates as { longitude: number }).longitude)
      && Math.abs((rawCoordinates as { longitude: number }).longitude) <= 180
      ? { latitude: (rawCoordinates as { latitude: number }).latitude, longitude: (rawCoordinates as { longitude: number }).longitude }
      : rawCoordinates === undefined ? undefined : null;
    if (!canonicalPlaceId || canonicalPlaceId.length > 160 || !name || name.length > 120 || !country || countryCode === null || region === null || placeType === null || aliases === null || coordinates === null) {
      return blocked(!canonicalPlaceId?'identity_required':'invalid_input',400);
    }
    const result = await new ViatorAffiliateClient().searchActivitiesWithDiagnostics({
      destination: {
        canonicalPlaceId,
        name,
        country,
        ...(countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? { countryCode: countryCode.toUpperCase() } : {}),
        ...(region ? { region } : {}),
        ...(placeType ? { placeType } : {}),
        ...(coordinates ? { coordinates } : {}),
        ...(aliases.length ? { aliases } : {}),
      },
      count: workspace === "map" ? 12 : 4,
      ...(typeof body.locale === "string" ? { locale: body.locale } : {}),
      ...(typeof body.currency === "string" ? { currency: body.currency } : {}),
    });
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
    if (error instanceof Error && error.message === "Unauthorized") return blocked('auth_required',401);
    if(error instanceof SyntaxError)return blocked('invalid_input',400);
    // Inventory enrichment is optional. Provider categories remain server-side
    // and the UI receives one calm, provider-neutral unavailable response.
    return NextResponse.json({activities:[],assessment:providerFailureAssessment(error instanceof ViatorAffiliateError?error.category:'unavailable','commercial-inventory',performance.now()-started)},
      {status:503,headers:{'cache-control':'no-store'}});
  }
}
