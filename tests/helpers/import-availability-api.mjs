import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const repo=new URL('../../',import.meta.url).pathname;
const require=createRequire(repo+'/package.json'),{build}=require('esbuild');
const apiPromise=(async()=>{
 const built=await build({absWorkingDir:repo,entryPoints:['app/api/journey-geocode/route.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external'});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);return module.exports;
})();
export const qualified='El Nido, Palawan, Philippines';
export async function controlled(replies,run,options={}){
 const api=await apiPromise,original=globalThis.fetch,trace={api:[],photon:[],geometry:[],unexpected:[],pending:[]};
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,'http://127.0.0.1');
  if(url.origin==='http://127.0.0.1'&&url.pathname==='/api/journey-geocode'){
   trace.api.push(Object.fromEntries(url.searchParams));return api.GET({nextUrl:url,signal:init?.signal??new AbortController().signal});
  }
  if(url.origin==='https://photon.komoot.io'&&url.pathname==='/api/'){
   const supplied=replies[trace.photon.length],reply=typeof supplied==='string'?supplied:supplied?.kind;trace.photon.push({query:url.searchParams.get('q'),reply,cache:init?.cache,revalidate:init?.next?.revalidate});assert(reply,'no mock request beyond supplied responses');supplied?.beforeReply?.();
   if(reply==='timeout')throw new DOMException('Synthetic provider timeout','TimeoutError');
   if(reply==='503')return Response.json({error:'Synthetic upstream failure'},{status:503});
   if(reply==='bad-json')return new Response('invalid json',{status:200});
   if(reply==='missing-features')return Response.json({unexpected:'no feature collection'});
   if(reply==='empty')return Response.json({type:'FeatureCollection',features:[]});
   if(reply==='pending')return new Promise((resolve,reject)=>{trace.pending.push(()=>reject(new DOMException('Synthetic timeout cleanup','TimeoutError')));});
   if(reply==='el-nido')return Response.json({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'El Nido',country:'Philippines',state:'Palawan',osm_type:'R',osm_id:16029725,osm_key:'place',osm_value:'town'},geometry:{type:'Point',coordinates:[119.390496,11.1800395]}}]});
   if(reply==='uncovered-island')return Response.json({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'Uncovered Fixture Island',country:'Philippines',osm_type:'R',osm_id:999999999,osm_key:'place',osm_value:'island'},geometry:{type:'Point',coordinates:[120.9822,14.6042]}}]});
   throw Error('Unknown controlled reply');
  }
  if(['https://overpass-api.de','https://overpass.kumi.systems'].includes(url.origin)&&url.pathname==='/api/interpreter'&&options.geometry){
   trace.geometry.push({host:url.hostname,method:init?.method});assert(trace.geometry.length<=2,'no geometry retries beyond existing two sources');
   if(options.geometry==='503')return Response.json({error:'Synthetic geometry failure'},{status:503});
   if(options.geometry==='bad-json')return new Response('invalid geometry json');
   throw Error('Unknown controlled geometry reply');
  }
  trace.unexpected.push({host:url.hostname,path:url.pathname});throw Error('All real network requests are disabled');
 };
 const get=(query=qualified,extra={})=>fetch('/api/journey-geocode?'+new URLSearchParams({place:query,country:'Philippines',candidates:'1',...extra}));
 try{return await run({trace,get});}
 finally{for(const settle of trace.pending)settle();await Promise.resolve();globalThis.fetch=original;assert.deepEqual(trace.unexpected,[]);}
}
