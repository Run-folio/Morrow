import {gatewayAccessPlanningMinutes,GATEWAY_ACCESS_RULE_SOURCE} from './gateway-access-policy.ts';
import {haversineKm} from './planner.ts';
import {estimateTransferImpact,reviewedJourneyImpactMode,TRANSFER_IMPACT_RULE_SOURCE} from './transfer-impact.ts';
import {knownKnowledgeFact,unknownKnowledgeFact,type KnowledgeSource} from './destination-knowledge.ts';
import {transferEndpointGeographicallyReady} from './geographic-binding.ts';
import type {CanonicalRouteEndpoint,TripLeg,TransferSegment} from './trip.ts';
import type {TransferJourneyCandidate} from './multimodal-transfer-resolution.ts';

/** Internal reviewed evidence, never a client-request assertion of authority. */
export type JourneyEvidence={id:string;url:string;reviewedAt:string;expiresAt:string;supports:'directional-service'|'access'|'connection'|'planning-estimate'|'schedule';validFrom?:string;validUntil?:string;withdrawn?:boolean};
export type InternalPlanningRuleEvidence={kind:'internal-policy';id:'planner:transfer-impact-rules-v1'|'planner:gateway-access-v1';version:1;rule:'connection-buffer'|'gateway-access';supports:'planning-estimate'};
type TimingEvidence=JourneyEvidence|InternalPlanningRuleEvidence;
export type ReviewedJourneyComponent={id:string;kind:'access'|'service'|'connection'|'egress';mode:TransferSegment['mode'];from:CanonicalRouteEndpoint;to:CanonicalRouteEndpoint;evidence:JourneyEvidence;timing:{minutes:number;basis:'estimate'|'scheduled';scope:'component';covers:readonly ('movement'|'departure-processing'|'arrival-processing'|'connection-buffer')[];evidence:TimingEvidence}|null};
export type ReviewedJourneyTemplate={id:string;from:CanonicalRouteEndpoint;to:CanonicalRouteEndpoint;components:readonly ReviewedJourneyComponent[]};
export type ReviewedJourneyContext={asOf:string;travelDate:string};
export type ReviewedJourneyResult={id:string;status:'complete';candidate:TransferJourneyCandidate}|{id:string;status:'partial'|'unqualified';reasons:string[]};
const date=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
function same(a:CanonicalRouteEndpoint|undefined,b:CanonicalRouteEndpoint|undefined){
 return !!a&&!!b&&transferEndpointGeographicallyReady(a)&&transferEndpointGeographicallyReady(b)
  &&a.canonicalPlaceId===b.canonicalPlaceId&&a.providerId===b.providerId&&a.name===b.name&&a.country===b.country
  &&a.geographicBinding?.placeType===b.geographicBinding?.placeType&&a.geographicBinding?.source===b.geographicBinding?.source&&a.geographicBinding?.routability===b.geographicBinding?.routability
  &&a.coordinates?.[0]===b.coordinates?.[0]&&a.coordinates?.[1]===b.coordinates?.[1];
}
function evidence(e:JourneyEvidence|undefined,c:ReviewedJourneyContext,role:JourneyEvidence['supports']){
 if(!e||typeof e!=='object'||'kind' in e||e.withdrawn!==undefined&&e.withdrawn!==false||typeof e.id!=='string'||!e.id.trim()||e.supports!==role||!date(e.reviewedAt)||!date(e.expiresAt)||e.reviewedAt>c.asOf||e.expiresAt<c.asOf||e.expiresAt<e.reviewedAt)return false;
 try{if(new URL(e.url).protocol!=='https:')return false;}catch{return false;}
 return (e.validFrom===undefined||date(e.validFrom))&&(e.validUntil===undefined||date(e.validUntil))
  &&!(e.validFrom&&e.validUntil&&e.validFrom>e.validUntil);
}
const applies=(e:JourneyEvidence,c:ReviewedJourneyContext)=>!(e.validFrom&&c.travelDate<e.validFrom)&&!(e.validUntil&&c.travelDate>e.validUntil);
const internal=(e:TimingEvidence):e is InternalPlanningRuleEvidence=>!!e&&typeof e==='object'&&'kind' in e&&e.kind==='internal-policy';
function internalTimingApplies(p:ReviewedJourneyComponent,e:InternalPlanningRuleEvidence){
 if(e.id===GATEWAY_ACCESS_RULE_SOURCE.id&&e.rule==='gateway-access'){
  if(e.version!==1||e.supports!=='planning-estimate'||!['access','egress'].includes(p.kind)||p.mode!=='road'||p.timing?.basis!=='estimate'||![p.from,p.to].some(v=>v.geographicBinding?.placeType==='transport_gateway'))return false;
  const distance=haversineKm(p.from.coordinates??undefined,p.to.coordinates??undefined);
  return distance!==null&&distance>=1&&distance<=700&&p.timing.minutes===gatewayAccessPlanningMinutes(distance);
 }
 if(e.id!==TRANSFER_IMPACT_RULE_SOURCE.id||e.version!==1||e.rule!=='connection-buffer'||e.supports!=='planning-estimate'||p.kind!=='connection'||!same(p.from,p.to)||p.timing?.basis!=='estimate')return false;
 const timing=estimateTransferImpact({mode:'train',connectionCount:1}).components.find(c=>c.id==='connection-buffer')?.timing;
 return timing?.status==='known'&&p.timing.minutes===timing.value.planningMinutes;
}
const timingSource=(e:TimingEvidence):KnowledgeSource=>internal(e)?{...(e.rule==='gateway-access'?GATEWAY_ACCESS_RULE_SOURCE:TRANSFER_IMPACT_RULE_SOURCE),supports:`Version 1 ${e.rule}; existing Morrovia estimated allowance, not an operator timetable.`}:{id:e.id,label:'Reviewed journey component',kind:'curated',url:e.url,reviewedAt:e.reviewedAt,supports:e.supports};
/** Pure composition: no fetch, inference of new routes, saved-document mutation or identity rewriting. */
export function composeReviewedJourney(leg:TripLeg,t:ReviewedJourneyTemplate,c:ReviewedJourneyContext):ReviewedJourneyResult{
 const reject=(reason:string):ReviewedJourneyResult=>({id:t?.id??'invalid',status:'unqualified',reasons:[reason]});
 if(!t||typeof t.id!=='string'||!t.id.trim()||!c||!date(c.asOf)||!date(c.travelDate))return reject('Invalid review context.');
 if(!same(leg.fromEndpoint,t.from)||!same(leg.toEndpoint,t.to))return reject('Journey endpoints do not match admitted physical identities.');
 const parts=t.components;
 if(!Array.isArray(parts)||parts.length<1||parts.length>5||new Set(parts.map(p=>p?.id)).size!==parts.length)return reject('Invalid component set.');
 const pattern=parts.map(p=>p?.kind).join(',');
 if(!/^(access,)?service(,connection,service)?(,egress)?$/.test(pattern))return reject('Only one evidenced main-service connection is supported.');
 const reasons:string[]=[];const segments:TransferSegment[]=[];let minutes=0;
 const sources:string[]=[];
 for(let i=0;i<parts.length;i++){
  const p=parts[i];if(!p||typeof p.id!=='string'||!p.id.trim()||!['flight','train','road','ferry','walk'].includes(p.mode))return reject('Invalid component mode or identity.');
  if(p.kind!=='service'&&!['road','walk'].includes(p.mode))return reject('Access or connection mode is unsupported.');
  if(!same(p.from,i?parts[i-1].to:t.from)||!transferEndpointGeographicallyReady(p.to))return reject('Component endpoints are unqualified or discontinuous.');
  if(i>0&&(p.from.id!==parts[i-1].to.id||p.from.kind!==parts[i-1].to.kind))return reject('Internal endpoint occurrences are inconsistent.');
  if(p.kind==='connection'&&same(p.from,p.to)&&(p.from.id!==p.to.id||p.from.kind!==p.to.kind))return reject('Same-terminal connection occurrences are inconsistent.');
  if(p.kind==='service'&&same(p.from,p.to))return reject('A main service must connect distinct physical endpoints.');
  const role=p.kind==='service'?'directional-service':p.kind==='connection'?'connection':'access';
  if(!evidence(p.evidence,c,role))return reject('Component evidence is missing, malformed or stale.');
  if(!applies(p.evidence,c))reasons.push(`${p.id}: service evidence does not apply to the requested date.`);
  sources.push(p.evidence.url);
  if(!p.timing){reasons.push(`${p.id}: timing unconfirmed.`);continue;}
  const timing=p.timing;
  if(!['estimate','scheduled'].includes(timing.basis)||timing.scope!=='component'||!Number.isFinite(timing.minutes)||timing.minutes<=0)return reject('Component timing is invalid or contains a whole-journey allowance.');
  if(internal(timing.evidence)){
   if(!internalTimingApplies(p,timing.evidence))return reject('Internal timing policy is unsupported or inapplicable.');
  }else{
   if(!evidence(timing.evidence,c,timing.basis==='estimate'?'planning-estimate':'schedule'))return reject('Timing evidence is missing, malformed or stale.');
   if(!applies(timing.evidence,c)||timing.basis==='scheduled'&&(!timing.evidence.validFrom||!timing.evidence.validUntil))reasons.push(`${p.id}: timing is not applicable to the requested date.`);
  }
  const required=p.kind==='service'?['movement','departure-processing','arrival-processing']:p.kind==='connection'?(same(p.from,p.to)?['connection-buffer']:['movement','connection-buffer']):['movement'];
  const permitted=p.kind==='connection'?['movement','connection-buffer']:required;
  if(Array.isArray(timing.covers)&&(new Set(timing.covers).size!==timing.covers.length||timing.covers.some((role:string)=>!permitted.includes(role))))return reject('Timing coverage overlaps another component or has an unsupported role.');
  if(!Array.isArray(timing.covers)||!required.every(role=>timing.covers.includes(role as typeof timing.covers[number])))reasons.push(`${p.id}: required processing or movement allowance is unconfirmed.`);
  minutes+=timing.minutes;sources.push(internal(timing.evidence)?`Internal policy ${timing.evidence.id} (${timing.evidence.rule})`:timing.evidence.url);
  // A same-terminal connection allowance is not a fabricated walking service.
  if(p.kind==='connection'&&same(p.from,p.to))continue;
  segments.push({id:`reviewed:${t.id}:${p.id}`,mode:p.mode,fromEndpoint:structuredClone(p.from),toEndpoint:structuredClone(p.to),distanceKm:null,durationMinutes:timing.minutes,provider:`Reviewed ${p.kind}; ${p.evidence.url}. ${timing.basis==='estimate'?'Estimated planning time':'Published timing'}; check schedules and availability.`,provenance:'planning_estimate',confidence:'medium',scheduleNeedsChecking:true});
 }
 if(!same(parts.at(-1)?.to,t.to))return reject('Journey does not reach the requested destination.');
 if(reasons.length)return {id:t.id,status:'partial',reasons};
 if(!Number.isFinite(minutes)||minutes<=0||!segments.length)return reject('Invalid journey total.');
 segments[0].fromEndpoint=structuredClone(leg.fromEndpoint!);segments[segments.length-1].toEndpoint=structuredClone(leg.toEndpoint!);
 const modes=new Set(segments.map(s=>s.mode));const services=parts.filter(p=>p.kind==='service').length;
 const sourceFacts:KnowledgeSource[]=parts.flatMap(p=>[timingSource(p.evidence),timingSource(p.timing!.evidence)]);
 const summaryMode=modes.size===1?segments[0].mode:'mixed';
 const transferImpact=estimateTransferImpact({mode:reviewedJourneyImpactMode(summaryMode,segments.map(s=>s.mode)),knownTotalIsComponentSum:true,
  knownDoorToDoorMinutes:knownKnowledgeFact(minutes,'estimated',[sourceFacts[0]!,...sourceFacts.slice(1)]),
  knownDoorToDoorRange:unknownKnowledgeFact('Component evidence does not establish a total minimum/maximum interval.'),connectionCount:services-1});

 return {id:t.id,status:'complete',candidate:{id:`reviewed:${t.id}`,summaryMode,segments,transferImpact,totalDurationMinutes:minutes,distanceKm:null,confidence:'medium',provenance:'planning_estimate',evidence:'reviewed_composition',connectionCount:services-1,score:0,reasons:[`Qualified planning estimate; verify schedules and availability.`,...Array.from(new Set(sources)).map(s=>`Evidence: ${s}`)]}};
}
