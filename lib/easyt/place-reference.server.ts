import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {countryFor, countryCodeFor} from './country-registry.ts';
import {referenceRecordKey, referenceKnownCodeKind, type ReferencePlaceRecord, type ReferenceSnapshotManifest} from './place-reference.ts';
import type {PlaceProviderCandidate, PlaceResolutionContext} from './place-intelligence.ts';

type Tuple = [string,string,string,number,number,string,number|string,string[]|string,boolean,string];
type Prefix = {offset:number;count:number};
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
 const settlements=read('settlements.json'), prefixOffsets=read('settlement-prefixes.bin');
 const prefixes=JSON.parse(read('settlement-prefixes.json').toString()) as Record<string,Prefix>;
 const lengths=read('settlement-lengths.bin'), offsets=new Uint32Array(lengths.length/2);
 let offset=2;for(let i=0;i<offsets.length;i++){offsets[i]=offset;offset+=lengths.readUInt16LE(i*2);}
 return {manifest,airports,airportById,codes,settlements,prefixOffsets,prefixes,offsets};
}
const data=()=>loaded??(loaded=load());
function decode(t:Tuple,source:ReferencePlaceRecord['source'],snapshotId:string):ReferencePlaceRecord{
 const airport=source==='ourairports';
 const r:ReferencePlaceRecord={source,sourceId:t[0],canonicalPlaceId:`reference:${source}:${t[0]}`,providerId:'',canonicalName:t[1],countryCode:t[2],coordinates:[t[3],t[4]],placeType:airport?'transport_gateway':t[5]==='PPL'?'town':'city',aliases:airport?[]:t[7] as string[],status:airport&&t[5]==='closed_airport'?'closed':'active',...(airport?{airportType:t[5],iataCode:t[6] as string||undefined,icaoCode:t[7] as string||undefined,scheduledService:t[8],municipality:t[9]}:{featureCode:t[5],population:t[6] as number})};
 r.providerId=referenceRecordKey(r,snapshotId);return r;
}
function settlementAt(offset:number){const d=data();const end=d.settlements.indexOf(10,offset);return decode(JSON.parse(d.settlements.subarray(offset,end).toString().replace(/,$/,'')),'geonames',d.manifest.snapshotId);}
export function referencePlaceById(id:string):ReferencePlaceRecord|undefined{
 const d=data();if(id.startsWith('reference:ourairports:'))return d.airportById.get(id);
 const match=/^reference:geonames:(\d+)$/.exec(id);if(!match)return undefined;
 const wanted=Number(match[1]);let left=0,right=d.offsets.length-1;
 while(left<=right){const mid=(left+right)>>>1,r=settlementAt(d.offsets[mid]),value=Number(r.sourceId);if(value===wanted)return r;if(value<wanted)left=mid+1;else right=mid-1;}return undefined;
}
function candidate(r:ReferencePlaceRecord,score:number,code?:string):PlaceProviderCandidate{
 return {canonicalPlaceId:r.canonicalPlaceId,providerId:r.providerId,providerSourceId:r.source,providerSourceLabel:r.source==='geonames'?'GeoNames · filtered and adapted':`OurAirports${r.scheduledService?'':' · no scheduled passenger service recorded'}`,canonicalName:r.canonicalName,aliases:[...r.aliases],placeType:r.placeType,parentCountries:[countryFor(r.countryCode)!.name],coordinates:[...r.coordinates],routability:'direct_destination',matchQuality:score>=900?'exact':'partial',rankScore:score,...(code===r.iataCode?{matchedAirportCode:code}:{}),...(code===r.icaoCode?{matchedIcaoCode:code}:{}),...(r.source==='geonames'?{settlementKind:r.placeType as 'city'|'town',settlementPopulation:r.population}:{})};
}
export function searchReferencePlaces(query:string,context:PlaceResolutionContext={},options:{limit?:number}={}):PlaceProviderCandidate[]{
 const q=normalized(query);if(q.length<2)return [];
 const d=data(),code=query.trim().toUpperCase();
 const allowed=(r:ReferencePlaceRecord)=>r.status==='active'&&(!context.explicitCountryNames?.length||context.explicitCountryNames.some(c=>countryCodeFor(c)===r.countryCode))&&(!context.explicitPlaceTypes?.length||context.explicitPlaceTypes.includes(r.placeType));
 const limit=Math.min(12,Math.max(1,options.limit??12)),exact=referenceKnownCodeKind(query)==='metro'?[]:(d.codes.get(code)??[]).filter(allowed);
 // A collision is offered as explicit alternatives; never invent a unique code assignment.
 if(exact.length)return exact.map(r=>candidate(r,1200,code)).sort((a,b)=>a.providerId.localeCompare(b.providerId)).slice(0,limit);
 const matches:{r:ReferencePlaceRecord;score:number}[]=[];
 const score=(r:ReferencePlaceRecord)=>{const names=[r.canonicalName,...r.aliases].map(normalized);return names.includes(q)?1000:names.some(n=>n.startsWith(q))?700:names.some(n=>n.split(' ').some(w=>w.startsWith(q)))?500:0;};
 for(const r of d.airports){if(!r.scheduledService||!allowed(r))continue;const s=score(r);if(s)matches.push({r,score:s});}
 const prefix=d.prefixes[q.slice(0,2)];
 if(prefix)for(let i=0;i<prefix.count;i++){const r=settlementAt(d.prefixOffsets.readUInt32LE(prefix.offset+i*4));if(!allowed(r))continue;const s=score(r);if(s)matches.push({r,score:s});}
 return matches.sort((a,b)=>b.score-a.score||Number(b.r.countryCode===countryCodeFor(context.countryNames?.[0]))-Number(a.r.countryCode===countryCodeFor(context.countryNames?.[0]))||Number(a.r.sourceId)-Number(b.r.sourceId)).slice(0,limit).map(({r,score})=>candidate(r,score));
}
export const referenceSnapshotId=()=>data().manifest.snapshotId;
