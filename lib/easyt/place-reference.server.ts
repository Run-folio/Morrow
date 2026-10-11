import {readFileSync,openSync,readSync,fstatSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {reviewedPhotoNameSupplement} from './place-photo-aliases.server.ts';
import {countryFor, countryCodeFor} from './country-registry.ts';
import {referenceRecordKey, referenceKnownCodeKind, type ReferencePlaceRecord, type ReferenceSnapshotManifest} from './place-reference.ts';
import type {PlaceProviderCandidate, PlaceResolutionContext} from './place-intelligence.ts';
import {PLACE_CATALOG,findCatalogPlaceById} from './place-catalog.ts';
import {discoveryPlaceForId} from './discovery-content.ts';

type Tuple = [string,string,string,number,number,string,number|string,string[]|string,boolean,string,string[]?,boolean?];
type AdminContext = {admin1:Record<string,string>;admin2:Record<string,string>};
type Prefix = {offset:number;count:number};
export type ReferenceSearchMatch={id:string;score:number;population?:number;canonicalExact?:boolean};
export function compareReferenceSearchMatches(a:ReferenceSearchMatch,b:ReferenceSearchMatch){return b.score-a.score||Number(Boolean(b.canonicalExact))-Number(Boolean(a.canonicalExact))||(b.population??0)-(a.population??0)||Number(a.id)-Number(b.id);}
const normalized=(name:string)=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
let loaded: ReturnType<typeof load> | undefined;
function load(){
 const root=resolve(process.cwd(),'data/place-reference');
 const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8')) as ReferenceSnapshotManifest;
 if(manifest.version!==1)throw new Error('Unsupported place reference snapshot');
 const read=(path:string)=>{const file=manifest.files.find(f=>f.path===path);const buffer=readFileSync(resolve(root,path));if(!file||file.bytes!==buffer.length||createHash('sha256').update(buffer).digest('hex')!==file.sha256)throw new Error(`Place reference integrity failure: ${path}`);return buffer;};
 const airports=(JSON.parse(read('airports.json').toString()) as Tuple[]).map(t=>decode(t,'ourairports',manifest.snapshotId));
 const airportById=new Map(airports.map(r=>[r.canonicalPlaceId,r]));
 const codes=new Map<string,ReferencePlaceRecord[]>();
 for(const r of airports)for(const code of [r.iataCode,r.icaoCode])if(code){const values=codes.get(code)??[];values.push(r);codes.set(code,values);}
 const settlementFile=manifest.files.find(f=>f.path==='settlements.json');
 const settlementFd=openSync(resolve(root,'settlements.json'),'r'),hash=createHash('sha256'),chunk=Buffer.allocUnsafe(64*1024);
 try{if(!settlementFile||fstatSync(settlementFd).size!==settlementFile.bytes)throw new Error('Settlement file size mismatch');let position=0,count;while((count=readSync(settlementFd,chunk,0,chunk.length,position))>0){hash.update(chunk.subarray(0,count));position+=count;}if(hash.digest('hex')!==settlementFile.sha256)throw new Error('Settlement integrity failure');}catch(error){closeSync(settlementFd);throw error;}
 try {
 const prefixOffsets=read('settlement-prefixes.bin');
 const prefixes=JSON.parse(gunzipSync(read('settlement-prefixes.json.gz')).toString()) as Record<string,Prefix>;
 const contextFile=manifest.files.some(f=>f.path==='admin-context.json.gz')?read('admin-context.json.gz'):null;
 const adminContext:AdminContext=contextFile?JSON.parse(gunzipSync(contextFile).toString()):{admin1:{},admin2:{}};
 const lengths=read('settlement-lengths.bin'), offsets=new Uint32Array(lengths.length/2);
 let offset=2;for(let i=0;i<offsets.length;i++){offsets[i]=offset;offset+=lengths.readUInt16LE(i*2);}
 const airportNames=new Map(airports.map(r=>[r.canonicalPlaceId,[r.canonicalName,...r.aliases].map(normalized)]));
 return {manifest,airports,airportNames,airportById,codes,settlementFd,recordBuffer:Buffer.allocUnsafe(65535),prefixOffsets,prefixes,offsets,lengths,adminContext};
 } catch(error) { closeSync(settlementFd); throw error; }
}
const data=()=>loaded??(loaded=load());
function decode(t:Tuple,source:ReferencePlaceRecord['source'],snapshotId:string):ReferencePlaceRecord{
 const airport=source==='ourairports';
 const r:ReferencePlaceRecord={source,sourceId:t[0],canonicalPlaceId:`reference:${source}:${t[0]}`,providerId:'',canonicalName:t[1],countryCode:t[2],coordinates:[t[3],t[4]],placeType:airport?'transport_gateway':t[5]==='PPL'?'town':'city',aliases:airport?[]:t[7] as string[],status:airport&&t[5]==='closed_airport'?'closed':'active',...(airport?{airportType:t[5],iataCode:t[6] as string||undefined,icaoCode:t[7] as string||undefined,scheduledService:t[8],municipality:t[9]}:{featureCode:t[5],population:t[6] as number,...(t[10]?{adminCodes:t[10]}:{}),...(t[11]?{photoRequiresCoordinates:true}:{})})};
 r.providerId=referenceRecordKey(r,snapshotId);return r;
}
function settlementTupleAt(offset:number):Tuple{const d=data();let left=0,right=d.offsets.length-1;while(left<=right){const mid=(left+right)>>>1,value=d.offsets[mid];if(value===offset){const length=d.lengths.readUInt16LE(mid*2)-2;const count=readSync(d.settlementFd,d.recordBuffer,0,length,offset);if(count!==length)throw new Error('Truncated settlement record');return JSON.parse(d.recordBuffer.toString('utf8',0,length));}if(value<offset)left=mid+1;else right=mid-1;}throw new Error('Invalid settlement index offset');}
function settlementAt(offset:number){return decode(settlementTupleAt(offset),'geonames',data().manifest.snapshotId);}
export function referencePlaceById(id:string):ReferencePlaceRecord|undefined{
 const d=data();if(id.startsWith('reference:ourairports:'))return d.airportById.get(id);
 const match=/^reference:geonames:(\d+)$/.exec(id);if(!match)return undefined;
 const wanted=Number(match[1]);let left=0,right=d.offsets.length-1;
 while(left<=right){const mid=(left+right)>>>1,r=settlementAt(d.offsets[mid]),value=Number(r.sourceId);if(value===wanted)return r;if(value<wanted)left=mid+1;else right=mid-1;}return undefined;
}
/** Resolve photo context from the stable selected ID and exact saved facts.
 * Historical provider version strings may rotate; identity and point may not. */
export function referencePhotoPlaceContext(input:{canonicalPlaceId?:string;name:string;country:string;coordinates?:readonly [number,number]|null}){
 if(!input.canonicalPlaceId?.startsWith('reference:'))return null;
 const record=referencePlaceById(input.canonicalPlaceId);
 const supplement=reviewedPhotoNameSupplement;
 const supplementMatches=record&&record.canonicalPlaceId===supplement.canonicalPlaceId&&record.canonicalName===supplement.canonicalName
  &&record.countryCode===supplement.countryCode&&record.placeType===supplement.placeType&&record.iataCode===supplement.iataCode&&record.icaoCode===supplement.icaoCode
  &&record.coordinates.every((value,index)=>value===supplement.coordinates[index]);
 const names=record?[record.canonicalName,...record.aliases,...(record.source==='ourairports'?[record.iataCode,record.icaoCode].filter((name):name is string=>Boolean(name)):[]),...(supplementMatches?supplement.aliases:[])]:[];
 if(!record||record.status!=='active'||!names.some(name=>normalized(name)===normalized(input.name))||record.countryCode!==countryCodeFor(input.country)
   ||!input.coordinates||!input.coordinates.every((value,index)=>Number.isFinite(value)&&value===record.coordinates[index]))
  return {valid:false as const};
 const admin=record.adminCodes;
 const region=admin&&data().adminContext.admin1[`${record.countryCode}.${admin[0]}`];
 const district=admin&&data().adminContext.admin2[`${record.countryCode}.${admin[0]}.${admin[1]}`];
 return {valid:true as const,canonicalName:record.canonicalName,placeType:record.placeType,...(region?{region}:{}),administrativeHierarchy:[region,district].filter((name):name is string=>Boolean(name)),
  requiresPhotoCoordinates:record.photoRequiresCoordinates===true};
}
function candidate(r:ReferencePlaceRecord,score:number,code?:string):PlaceProviderCandidate{
 const admin=r.adminCodes;
 const region=admin&&data().adminContext.admin1[`${r.countryCode}.${admin[0]}`];
 const district=admin&&data().adminContext.admin2[`${r.countryCode}.${admin[0]}.${admin[1]}`];
 return {canonicalPlaceId:r.canonicalPlaceId,providerId:r.providerId,providerSourceId:r.source,providerSourceLabel:r.source==='geonames'?'GeoNames · filtered and adapted':`OurAirports${r.scheduledService?'':' · no scheduled passenger service recorded'}`,canonicalName:r.canonicalName,aliases:[...r.aliases],placeType:r.placeType,parentCountries:[countryFor(r.countryCode)!.name],...(region?{parentRegionId:region}:{}),...(admin?{administrativeHierarchy:[region,district].filter((value):value is string=>Boolean(value))}:{}),coordinates:[...r.coordinates],routability:'direct_destination',matchQuality:score>=900?'exact':'partial',rankScore:score,...(code===r.iataCode?{matchedAirportCode:code}:{}),...(code===r.icaoCode?{matchedIcaoCode:code}:{}),...(r.source==='ourairports'?{scheduledService:r.scheduledService}:{}),...(r.source==='geonames'?{settlementKind:r.placeType as 'city'|'town',settlementPopulation:r.population}:{})};
}
export function searchReferencePlaces(query:string,context:PlaceResolutionContext={},options:{limit?:number}={}):PlaceProviderCandidate[]{
 const q=normalized(query);if(q.length<2)return [];
 const d=data(),code=query.trim().toUpperCase();
 const allowed=(r:ReferencePlaceRecord)=>r.status==='active'&&(!context.explicitCountryNames?.length||context.explicitCountryNames.some(c=>countryCodeFor(c)===r.countryCode))&&(!context.explicitPlaceTypes?.length||context.explicitPlaceTypes.includes(r.placeType));
 const limit=Math.min(12,Math.max(1,options.limit??12)),exact=referenceKnownCodeKind(query)==='metro'?[]:(d.codes.get(code)??[]).filter(allowed);
 // A collision is offered as explicit alternatives; never invent a unique code assignment.
 if(exact.length)return exact.map(r=>candidate(r,1200,code)).sort((a,b)=>a.providerId.localeCompare(b.providerId)).slice(0,limit);
 const matches:(ReferenceSearchMatch&{offset?:number;airport?:ReferencePlaceRecord})[]=[];
 const score=(names:string[])=>names.includes(q)?1000:names.some(n=>n.startsWith(q))?700:names.some(n=>n.split(' ').some(w=>w.startsWith(q)))?500:0;
 const contextual=(country:string)=>country===countryCodeFor(context.countryNames?.[0])?1:0;
 const insert=(item:typeof matches[number])=>{matches.push(item);matches.sort(compareReferenceSearchMatches);if(matches.length>limit)matches.pop();};
 for(const r of d.airports){if(!allowed(r))continue;const names=d.airportNames.get(r.canonicalPlaceId)!;const s=score(names);if(s&&(r.scheduledService||s===1000))insert({id:r.sourceId,airport:r,score:s+contextual(r.countryCode),canonicalExact:names[0]===q});}
 const prefix=d.prefixes[q.slice(0,2)];
 if(prefix)for(let i=0;i<prefix.count;i++){const offset=d.prefixOffsets.readUInt32LE(prefix.offset+i*4),t=settlementTupleAt(offset);
  if(context.explicitCountryNames?.length&&!context.explicitCountryNames.some(c=>countryCodeFor(c)===t[2]))continue;
  const type=t[5]==='PPL'?'town':'city';if(context.explicitPlaceTypes?.length&&!context.explicitPlaceTypes.includes(type))continue;
  const names=[t[1],...(t[7] as string[])].map(normalized);const s=score(names);if(s)insert({id:t[0],offset,score:s+contextual(t[2]),population:t[6] as number,canonicalExact:names[0]===q});}
 return matches.map(m=>candidate(m.airport??settlementAt(m.offset!),m.score));
}
export const referenceSnapshotId=()=>data().manifest.snapshotId;

/** Country proof comes from an exact trusted source tuple, never from reverse geocoding. */
export function trustedLocalActivityCentre(input:{destination:string;requestedCountryCode:string;coordinates:readonly [number,number];canonicalPlaceId?:string;providerId?:string}){
 const code=countryCodeFor(input.requestedCountryCode);if(!code||!input.coordinates.every(Number.isFinite))return null;
 const same=(name:string,country:string,point:readonly number[]|undefined)=>normalized(input.destination)===normalized(name)&&countryCodeFor(country)===code&&point?.length===2&&point.every((v,i)=>v===input.coordinates[i]);
 const catalogRecord=(id:string)=>{
  const e=findCatalogPlaceById(id);if(!e||e.captureMode==='explicit-only'||e.parentCountries.length!==1)return null;
  const point=e.coordinates??discoveryPlaceForId(id)?.coordinates;
  if(!same(e.canonicalName,e.parentCountries[0],point)||(input.providerId&&input.providerId!==e.provenance.id))return null;
  return {canonicalPlaceId:id,source:'catalog' as const,sourceRecordKey:e.provenance.id,countryCode:code,coordinates:[...point!] as [number,number]};
 };
 const referenceRecord=(id:string)=>{const r=referencePlaceById(id);if(!r||r.status!=='active'||!same(r.canonicalName,r.countryCode,r.coordinates)||(input.providerId&&input.providerId!==r.providerId))return null;
  return {canonicalPlaceId:id,source:'reference' as const,sourceRecordKey:r.providerId,countryCode:code,coordinates:[...r.coordinates] as [number,number]};};
 if(input.canonicalPlaceId)return input.canonicalPlaceId.startsWith('reference:')?referenceRecord(input.canonicalPlaceId):catalogRecord(input.canonicalPlaceId);
 const catalog=PLACE_CATALOG.filter(e=>e.captureMode!=='explicit-only').flatMap(e=>{const r=catalogRecord(e.canonicalPlaceId);return r?[r]:[];});
 // Existing authored exact identities retain ownership; reference results never rewrite them.
 if(catalog.length)return catalog.length===1?catalog[0]:null;
 const references=searchReferencePlaces(input.destination,{explicitCountryNames:[code]}).flatMap(c=>{const r=referenceRecord(c.canonicalPlaceId!);return r?[r]:[];});return references.length===1?references[0]:null;
}
