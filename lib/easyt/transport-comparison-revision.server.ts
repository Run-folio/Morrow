import 'server-only';
import {createHash} from 'node:crypto';
import type {MultimodalResolutionResult,TransferJourneyCandidate} from './multimodal-transfer-resolution.ts';
import {authoredContentKey} from './trip-retained-authored-content.ts';
import {supportedCandidateForLeg} from './transport-mode-choice.ts';
import {transportEndpointEvidenceKey} from './transport-comparison.ts';
import {transferEndpointGeographicallyReady} from './geographic-binding.ts';

const family='road:routed';
function finiteJsonNumbers(value:unknown):boolean {
  if(typeof value==='number')return Number.isFinite(value);
  if(Array.isArray(value))return value.every(finiteJsonNumbers);
  return !value||typeof value!=='object'||Object.values(value).every(finiteJsonNumbers);
}
/** Content identity only. Existing validation/currentness still authorize Use.
 * Automatic resolution and all persisted input snapshots remain unchanged. */
export function finalizeTransportComparisonRevisions(result:MultimodalResolutionResult):MultimodalResolutionResult {
  try {
    if(result.diagnostic.version!==1)return result;
    const candidates=result.diagnostic.candidates.map((candidate):TransferJourneyCandidate=>{
      if(candidate.id!==family||candidate.summaryMode!=='road'||candidate.evidence!=='routed_road'
        ||candidate.provenance!=='routing_engine'||candidate.connectionCount!==0||candidate.segments.length!==1
        ||candidate.segments[0].mode!=='road'||candidate.segments[0].provenance!=='routing_engine'
        ||!Number.isFinite(candidate.score)||!finiteJsonNumbers(candidate)||!supportedCandidateForLeg(result.leg,candidate)
        ||!['high','medium','low'].includes(candidate.confidence)||!Array.isArray(candidate.reasons)||!candidate.reasons.every(reason=>typeof reason==='string')
        ||candidate.distanceKm!==null&&(!Number.isFinite(candidate.distanceKm)||candidate.distanceKm<0)
        ||candidate.headlineMinutes!==undefined&&(!Number.isFinite(candidate.headlineMinutes)||candidate.headlineMinutes<0||candidate.headlineMinutes>candidate.totalDurationMinutes)
        ||candidate.segments[0].durationMinutes===null||candidate.segments[0].durationMinutes<0
        ||candidate.segments[0].distanceKm!==null&&(!Number.isFinite(candidate.segments[0].distanceKm)||candidate.segments[0].distanceKm<0)
        ||candidate.transferImpact&&!supportedCandidateForLeg(result.leg,candidate)?.transferImpact
        ||!transferEndpointGeographicallyReady(candidate.segments[0].fromEndpoint)||!transferEndpointGeographicallyReady(candidate.segments[0].toEndpoint)
        ||transportEndpointEvidenceKey(candidate.segments[0].fromEndpoint)!==transportEndpointEvidenceKey(result.leg.fromEndpoint)
        ||transportEndpointEvidenceKey(candidate.segments[0].toEndpoint)!==transportEndpointEvidenceKey(result.leg.toEndpoint))return candidate;
      // Match persisted JSON semantics (undefined object fields are not evidence).
      // Logical ID and domain/version are fixed; timestamps/request elapsed time
      // outside the candidate are deliberately not part of snapshot identity.
      const snapshot=JSON.parse(JSON.stringify(candidate));
      const digest=createHash('sha256').update(authoredContentKey({domain:'transport-comparison-road-revision',version:1,candidate:snapshot})).digest('hex');
      return {...candidate,id:`${family}:revision-v1:${digest}`};
    });
    const selected=candidates.find((candidate,index)=>result.diagnostic.candidates[index].id===result.diagnostic.selectedCandidateId);
    return {...result,diagnostic:{...result.diagnostic,candidates,...(selected?{selectedCandidateId:selected.id}:{})}};
  }catch{return result;}
}
