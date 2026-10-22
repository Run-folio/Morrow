import assert from 'node:assert/strict';import test from 'node:test';import {build} from 'esbuild';import {createRequire} from 'node:module';import {emptyServerMarkerPlugin} from './helpers/server-marker.mjs';
const require=createRequire(import.meta.url);const bundled=await build({entryPoints:['app/api/journey-geocode/route.ts'],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',plugins:[emptyServerMarkerPlugin]});const module={exports:{} as any};new Function('require','module','exports',bundled.outputFiles[0]!.text)(require,module,module.exports);const api=module.exports;
function request(body:unknown,options:{origin?:string;contentType?:string}={}){return Object.assign(new Request('http://fixture/api/journey-geocode',{method:'POST',headers:{'content-type':options.contentType??'application/json',...(options.origin===undefined?{origin:'http://fixture'}:options.origin?{origin:options.origin}:{})},body:JSON.stringify(body)}),{nextUrl:new URL('http://fixture/api/journey-geocode')});}
test('POST default-off blocks paid path; normal deterministic POST omits query strings and returns unavailable capability',async()=>{
 let fetches=0;const original=globalThis.fetch;globalThis.fetch=async()=>{fetches++;return new Response('{"features":[]}');};
 try{const blocked=await api.POST(request({place:'Yunomine hot spring village',research:true,noticeVersion:'public-place-alias-v3'}));assert.equal(blocked.status,503);assert.equal(fetches,0);
 const normal=await api.POST(request({place:'Yunomine hot spring village'}));assert.equal(normal.status,200);assert.equal((await normal.json()).publicResearchAvailable,false);assert.equal(normal.headers.get('cache-control'),'private, no-store');assert.equal(fetches,1);
 }finally{globalThis.fetch=original;}
});
test('GET cannot activate paid research',async()=>{const req=Object.assign(new Request('http://fixture/api/journey-geocode?place=Hirayu&research=public-place'),{nextUrl:new URL('http://fixture/api/journey-geocode?place=Hirayu&research=public-place')});assert.equal((await api.GET(req)).status,405);});
test('POST rejects foreign/missing origin, unsupported media, excess body, private shape and stale/missing notice acknowledgement',async()=>{
 const cases:[unknown,{origin?:string;contentType?:string},number][]=[
 [{place:'Hirayu'},{origin:'https://evil.invalid'},403],[{place:'Hirayu'},{origin:''},403],[{place:'Hirayu'},{contentType:'text/plain'},415],
 [{place:'x'.repeat(1500)},{},413],[{place:'Hirayu',trip:{private:'content'}},{},400],
 [{place:'Yunomine Onsen',country:'Japan',research:true,noticeVersion:'public-place-research-v1'},{},400],
 [{place:'my home address',research:true,noticeVersion:'public-place-alias-v3'},{},400],
 [{place:'Yunomine hot spring village',research:true},{},400],[{place:'Yunomine hot spring village',research:true,noticeVersion:'old'},{},400],
 ];
 for(const [body,options,status] of cases){const result=await api.POST(request(body,options));assert.equal(result.status,status);assert.equal(result.headers.get('cache-control'),'private, no-store');}
});
