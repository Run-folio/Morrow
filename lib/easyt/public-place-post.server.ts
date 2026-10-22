import { PUBLIC_PLACE_NOTICE_VERSION, publicPlaceQueryAllowed } from './public-place-search-input.ts';
import {countryCodeFor} from './country-registry.ts';
export class PlacePostError extends Error { constructor(public status:number){super('Invalid place search request');} }
/** Bounded streaming read: no body/query logs, max 1 KiB, one-second input deadline. */
export async function readCompletedPlacePost(request:Request):Promise<{place:string;country?:string;research:boolean}> {
  const contentType=request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if(contentType!=='application/json')throw new PlacePostError(415);
  const size=Number(request.headers.get('content-length'));
  if(Number.isFinite(size)&&size>1024)throw new PlacePostError(413);
  const reader=request.body?.getReader();if(!reader)throw new PlacePostError(400);
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(1000)]);
  const chunks:Uint8Array[]=[];let bytes=0;let stop:(()=>void)|undefined;
  const aborted=new Promise<never>((_resolve,reject)=>{stop=()=>{void reader.cancel().catch(()=>{});reject(new PlacePostError(408));};signal.addEventListener('abort',stop,{once:true});});
  try{
    if(signal.aborted)throw new PlacePostError(408);
    const reading=async()=>{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>1024)throw new PlacePostError(413);chunks.push(chunk.value);}return chunks;};
    await Promise.race([reading(),aborted]);
    const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
    let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}catch{throw new PlacePostError(400);}
    if(!value||typeof value!=='object'||Array.isArray(value))throw new PlacePostError(400);
    const body=value as Record<string,unknown>;
    if(Object.keys(body).some(key=>!['place','country','research','noticeVersion'].includes(key))
      ||typeof body.place!=='string'||!body.place.trim()||body.place.length>140
      ||body.country!==undefined&&(typeof body.country!=='string'||body.country.length>100||!countryCodeFor(body.country))
      ||body.research!==undefined&&typeof body.research!=='boolean')throw new PlacePostError(400);
    const place=body.place.trim(),country=typeof body.country==='string'?body.country:undefined,research=body.research===true;
    if(research&&(body.noticeVersion!==PUBLIC_PLACE_NOTICE_VERSION||!publicPlaceQueryAllowed(place,country)))throw new PlacePostError(400);
    if(!research&&body.noticeVersion!==undefined)throw new PlacePostError(400);
    return {place,country,research};
  }finally{if(stop)signal.removeEventListener('abort',stop);void reader.cancel().catch(()=>{});}
}
