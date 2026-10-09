import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {build} from 'esbuild';
import {buildReferenceSnapshot} from '../scripts/build-place-reference.mjs';
const require=createRequire(import.meta.url),{NextRequest}=require('next/server');
test('generated duplicate IATA identities require clarification; unique code and country context still resolve',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'reference-code-')),cwd=process.cwd(),fetch=globalThis.fetch;
 try{
  const air='id,ident,type,name,latitude_deg,longitude_deg,iso_country,municipality,scheduled_service,gps_code,iata_code,icao_code\n1,MGGA,medium_airport,Airport One,14.5,-90.5,GT,City One,yes,MGGA,GUA,MGGA\n2,MGGB,medium_airport,Airport Two,14.6,-90.6,GT,City Two,yes,MGGB,GUA,MGGB\n3,MMGX,medium_airport,Airport Three,16,-91,MX,City Three,yes,MMGX,GUA,MMGX\n';
  writeFileSync(join(dir,'airports.csv'),air);writeFileSync(join(dir,'cities500.txt'),'');const sha=s=>createHash('sha256').update(s).digest('hex');
  await buildReferenceSnapshot({airports:join(dir,'airports.csv'),settlements:join(dir,'cities500.txt'),output:join(dir,'data/place-reference'),sourceManifest:{acquiredAt:'2026-10-09T00:00:00Z',sources:[{id:'ourairports',url:'https://ourairports.com/data/',sha256:sha(air),license:'Public domain',licenseUrl:'https://ourairports.com/data/'},{id:'geonames',url:'https://download.geonames.org/export/dump/',sha256:sha(''),license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'}]}});
  const bundle=await build({entryPoints:['app/api/journey-geocode/route.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['next/server'],logLevel:'silent'}),module={exports:{}};
  new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports);process.chdir(dir);globalThis.fetch=async()=>{throw new Error('offline fixture');};
  const get=async query=>(await module.exports.GET(new NextRequest(`http://fixture/api/journey-geocode?${query}`))).json();
  const options=await get('place=GUA&candidates=1&country=Guatemala');assert.equal(options.candidates.length,2);
  assert.equal((await get('place=GUA&country=Guatemala')).result,null);
  assert.equal((await get('place=GUA&country=Guatemala&nearLat=14.5&nearLon=-90.5')).result,null);
  assert.equal((await get('place=GUA&country=Mexico')).result.canonicalPlaceId,'reference:ourairports:3');
  assert.equal((await get('place=MGGA')).result.canonicalPlaceId,'reference:ourairports:1');
  assert.notDeepEqual(options.candidates[0].coordinates,options.candidates[1].coordinates);
 }finally{process.chdir(cwd);globalThis.fetch=fetch;rmSync(dir,{recursive:true,force:true});}
});
