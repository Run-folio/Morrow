import type {CanonicalRouteEndpoint} from './trip.ts';
import {transferEndpointGeographicallyReady} from './geographic-binding.ts';
import {REFERENCE_SNAPSHOT_ID} from './place-reference.ts';
import {haversineKm} from './planner.ts';
import {gatewayAccessPlanningMinutes,GATEWAY_ACCESS_RULE_SOURCE} from './gateway-access-policy.ts';

export type AccessDirection='town-to-gateway'|'gateway-to-town';
export type AccessEvidence={id:string;url:string;supports:'access';reviewedAt:string;expiresAt?:string;validFrom?:string;validUntil?:string;withdrawn?:boolean};
/** Trusted reviewed input only. This is not authority supplied by an API request. */
export type TownGatewayRelationship={version:1;referenceSnapshotId:string;id:string;status:'active'|'inactive'|'withdrawn';town:CanonicalRouteEndpoint;gateway:{kind:'airport'|'port';place:CanonicalRouteEndpoint};directions:readonly AccessDirection[];accessMode:'road'|'walk';relationship:'same-land'|'remote'|'explicit-crossing';evidence:AccessEvidence;crossingEvidence?:AccessEvidence;timingPolicy:'gateway-access-v1'|null};
const date=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const name=(s:string)=>s.normalize('NFKD').toLocaleLowerCase().trim();
function same(a:CanonicalRouteEndpoint,b:CanonicalRouteEndpoint){return transferEndpointGeographicallyReady(a)&&transferEndpointGeographicallyReady(b)&&a.canonicalPlaceId===b.canonicalPlaceId&&a.providerId===b.providerId&&name(a.name)===name(b.name)&&a.country===b.country&&a.geographicBinding?.placeType===b.geographicBinding?.placeType&&a.coordinates?.every((n,i)=>n===b.coordinates?.[i]);}
function source(e:AccessEvidence,c:{asOf:string;travelDate?:string}){
 if(!object(e)||typeof e.id!=='string'||!e.id.trim()||e.supports!=='access'||e.withdrawn!==undefined&&e.withdrawn!==false||!date(e.reviewedAt)||e.reviewedAt>c.asOf)return false;
 try{const url=new URL(e.url);if(url.protocol!=='https:'||url.username||url.password)return false;}catch{return false;}
 if(e.expiresAt!==undefined&&(!date(e.expiresAt)||e.expiresAt<c.asOf||e.expiresAt<e.reviewedAt))return false;
 if(e.validFrom!==undefined&&!date(e.validFrom)||e.validUntil!==undefined&&!date(e.validUntil)||e.validFrom&&e.validUntil&&e.validFrom>e.validUntil)return false;
 return !((e.validFrom||e.validUntil)&&(!c.travelDate||e.validFrom&&c.travelDate<e.validFrom||e.validUntil&&c.travelDate>e.validUntil));
}
/** Validates explicit access; never grants same-land continuity or onward service. */
export function qualifyTownGatewayAccess(record:TownGatewayRelationship,town:CanonicalRouteEndpoint,gateway:CanonicalRouteEndpoint,direction:AccessDirection,context:{asOf:string;travelDate?:string}){
 if(!object(record)||record.version!==1||record.referenceSnapshotId!==REFERENCE_SNAPSHOT_ID||typeof record.id!=='string'||!record.id.trim()||record.status!=='active'||!object(context)||!date(context.asOf)||context.travelDate!==undefined&&!date(context.travelDate))return null;
 if(!['town-to-gateway','gateway-to-town'].includes(direction)||!Array.isArray(record.directions)||!record.directions.length||record.directions.some(d=>!['town-to-gateway','gateway-to-town'].includes(d))||new Set(record.directions).size!==record.directions.length||!record.directions.includes(direction))return null;
 if(!object(record.town)||!object(record.gateway)||!object(record.gateway.place)||!object(town)||!object(gateway)||!same(record.town,town)||!same(record.gateway.place,gateway))return null;
 if(!['city','town'].includes(town.geographicBinding?.placeType??'')||gateway.geographicBinding?.placeType!=='transport_gateway'||!['airport','port'].includes(record.gateway.kind))return null;
 const airport=gateway.canonicalPlaceId?.startsWith('reference:ourairports:')===true;
 if((record.gateway.kind==='airport')!==airport||!['road','walk'].includes(record.accessMode)||!['same-land','remote','explicit-crossing'].includes(record.relationship)||!source(record.evidence,context))return null;
 if(record.relationship==='explicit-crossing'&&(!record.crossingEvidence||record.crossingEvidence.id===record.evidence.id||!source(record.crossingEvidence,context)))return null;
 if(record.timingPolicy!==null&&record.timingPolicy!=='gateway-access-v1'||record.timingPolicy==='gateway-access-v1'&&record.accessMode!=='road')return null;
 const distance=haversineKm(town.coordinates??undefined,gateway.coordinates??undefined);
 const planningMinutes=record.timingPolicy==='gateway-access-v1'&&distance!==null&&distance>=1&&distance<=700?gatewayAccessPlanningMinutes(distance):null;
 return {relationshipId:record.id,town:structuredClone(town),gateway:{kind:record.gateway.kind,place:structuredClone(gateway)},direction,accessMode:record.accessMode,planningMinutes,timing:planningMinutes===null?null:{minutes:planningMinutes,basis:'estimate' as const,scope:'access' as const,source:structuredClone(GATEWAY_ACCESS_RULE_SOURCE)},evidence:structuredClone(record.evidence),crossingEvidence:record.crossingEvidence?structuredClone(record.crossingEvidence):undefined};
}
