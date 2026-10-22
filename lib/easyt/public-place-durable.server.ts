import {randomUUID} from 'node:crypto';
import type {PlaceResearchBudget} from './public-place-research-controls.server.ts';
import {PLACE_MAPPING_VERSION,type PublicPlaceMappingKey,type ReviewedPublicPlaceMapping,type ReviewedPublicPlaceMappingReader,placeMappingKey} from './reviewed-place-mapping-cache.ts';
import {countryCodeFor} from './country-registry.ts';
import {assertStagingConnectionTarget,assertStagingDeploymentMetadata,STAGING_METADATA_QUERY,STAGING_METADATA_SQL_PREDICATE} from './staging-deployment-target.mjs';
export type PlaceResearchQuery=(text:string,parameters:unknown[],signal:AbortSignal)=>Promise<Record<string,unknown>[]>;
type ResearchDatabase={query(text:string,parameters:unknown[],options:{fetchOptions:{signal:AbortSignal}}):Promise<Record<string,unknown>[]>};
export function createVerifiedStagingPlaceQuery(options:{environment?:Record<string,string|undefined>;getDatabase?:(connectionString:string)=>Promise<ResearchDatabase>}={}):PlaceResearchQuery {
 return async(text,parameters,signal)=>{
   if(signal.aborted)throw new Error('Place research unavailable');
   const connectionString=(options.environment??process.env).DATABASE_URL??'';
   assertStagingConnectionTarget(connectionString);
   // Construct from exactly the validated value, never a later environment reread.
   const database=options.getDatabase?await options.getDatabase(connectionString):(await import('@neondatabase/serverless')).neon(connectionString);
   const metadata=await database.query(STAGING_METADATA_QUERY,[],{fetchOptions:{signal}});
   assertStagingDeploymentMetadata(metadata);
   if(signal.aborted)throw new Error('Place research unavailable');
   return database.query(text,parameters,{fetchOptions:{signal}});
 };
}
const defaultQuery=createVerifiedStagingPlaceQuery();
export function createDurablePlaceResearchBudget(config:{scope:string;reviewReference:string},options:{query?:PlaceResearchQuery;reservationId?:()=>string}={}):PlaceResearchBudget {
  return {kind:'durable-reservation-v1',async reserve(input,signal){
    if(signal.aborted||!/^morrovia:place-research:staging(?::[a-z0-9-]+)?$/.test(config.scope)
      ||!/^[-a-zA-Z0-9_:]{4,120}$/.test(config.reviewReference)||input.policyVersion!=='luna-place-v1'||input.maximumMicroUsd!==250000)return {admitted:false};
    const id=(options.reservationId??randomUUID)();
    const rows=await (options.query??defaultQuery)('select admitted, reservation_id, reserved_micro_usd, policy_version from public.morrovia_place_research_claim($1,$2::uuid,$3,$4::bigint,$5)',[config.scope,id,input.policyVersion,input.maximumMicroUsd,config.reviewReference],signal);
    const row=rows.length===1?rows[0]:undefined;
    if(signal.aborted||row?.admitted!==true||row.reservation_id!==id||Number(row.reserved_micro_usd)!==250000||row.policy_version!==input.policyVersion)return {admitted:false};
    return {admitted:true,reservationId:id,reservedMicroUsd:250000,policyVersion:input.policyVersion};
  }};
}
function sourceUrl(value:unknown):value is string {
  if(typeof value!=='string'||value.length>500)return false;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)&&!/(^|\.)(localhost|local|internal|example|invalid|test)$/.test(url.hostname);}catch{return false;}
}
export function reviewedMappingRow(row:Record<string,unknown>,key:PublicPlaceMappingKey,now=Date.now()):ReviewedPublicPlaceMapping|undefined {
  const reviewed=Date.parse(String(row.reviewed_at)),expiry=Date.parse(String(row.expires_at));
  if(row.normalized_query!==key.normalizedQuery||row.country_context!==(key.countryContext??'')||row.intent!==key.intent||row.verification_version!==key.version||row.status!=='reviewed'
    ||typeof row.alternate_name!=='string'||row.alternate_name.length<2||row.alternate_name.length>80||!/^[\p{L}\p{M} .’'()\-]+$/u.test(row.alternate_name)
    ||typeof row.provider_id!=='string'||!/^photon:[NWR]:[1-9]\d*$/.test(row.provider_id)
    ||typeof row.provider_key!=='string'||typeof row.provider_kind!=='string'||typeof row.place_type!=='string'
    ||!['city','town','natural_area','landmark','island','mountain_range','valley'].includes(row.place_type)
    ||typeof row.country_code!=='string'||countryCodeFor(row.country_code)!==row.country_code||key.countryContext&&key.countryContext!==row.country_code
    ||!Array.isArray(row.source_urls)||row.source_urls.length<1||row.source_urls.length>4||!row.source_urls.every(sourceUrl)
    ||!Number.isFinite(reviewed)||reviewed>now||!Number.isFinite(expiry)||expiry<=now||expiry>reviewed+30*86400000)return;
  return {key,status:'reviewed',alternateName:row.alternate_name,providerId:row.provider_id,providerKey:row.provider_key,providerKind:row.provider_kind,placeType:row.place_type,countryCode:row.country_code,
    sourceUrls:row.source_urls,reviewedAt:new Date(reviewed).toISOString(),expiresAt:new Date(expiry).toISOString()};
}
export function createReviewedPlaceMappingReader(options:{query?:PlaceResearchQuery}={}):ReviewedPublicPlaceMappingReader {
  return {async read(key,signal){
    if(signal.aborted||key.version!==PLACE_MAPPING_VERSION||key.intent!=='route-stop')return [];
    const checked=placeMappingKey(key.normalizedQuery,key.countryContext??undefined);
    if(checked.normalizedQuery!==key.normalizedQuery||checked.countryContext!==key.countryContext)return [];
    const rows=await (options.query??defaultQuery)(`select normalized_query,country_context,intent,verification_version,status,alternate_name,provider_id,provider_key,provider_kind,place_type,country_code,source_urls,reviewed_at,expires_at from public.morrovia_reviewed_place_mappings where ${STAGING_METADATA_SQL_PREDICATE} and normalized_query=$1 and country_context=$2 and intent=$3 and verification_version=$4 order by provider_id limit 9`,[key.normalizedQuery,key.countryContext??'',key.intent,key.version],signal);
    if(signal.aborted)return [];
    if(rows.length>8)throw new Error('Reviewed mapping unavailable');
    return rows.map(row=>{const value=reviewedMappingRow(row,key);if(!value)throw new Error('Reviewed mapping unavailable');return value;});
  }};
}
