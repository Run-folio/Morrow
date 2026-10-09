import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildReferenceSnapshot} from '../scripts/build-place-reference.mjs';
const header='id,ident,type,name,latitude_deg,longitude_deg,iso_country,municipality,scheduled_service,gps_code,iata_code,icao_code\n';
const airport=(id=1,extra={})=>({id,ident:'MGGT',type:'medium_airport',name:'Fixture "airport", terminal\nNorth',latitude_deg:14.5,longitude_deg:-90.5,iso_country:'GT',municipality:'Fixture City',scheduled_service:'yes',gps_code:'MGGT',iata_code:'GUA',icao_code:'MGGT',...extra});
const csv=a=>header+a.map(row=>Object.values(row).map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n')+'\n';
const settlement=(id,code='PPLCD',country='PF',extra={})=>[id,'Fixture capital','Fixture capital','Capital,Capitale',-17.5,-149.5,'P',code,country,'','01','','','',1000,'','', 'Pacific/Tahiti','2026-01-01'].map((v,i)=>extra[i]??v).join('\t');
async function fixture(run){const dir=await mkdtemp(join(tmpdir(),'morrovia-reference-'));try{return await run(dir);}finally{await rm(dir,{recursive:true,force:true});}}
async function build(dir,air=csv([airport()]),geo=settlement(10)+'\n',previous){const airports=join(dir,'airports.csv'),settlements=join(dir,'cities500.txt');await writeFile(airports,air);await writeFile(settlements,geo);const digest=s=>createHash('sha256').update(s).digest('hex');return buildReferenceSnapshot({airports,settlements,output:join(dir,'out'),previous,sourceManifest:{acquiredAt:'2026-10-09T00:00:00Z',sources:[{id:'ourairports',url:'https://ourairports.com/data/',sha256:digest(air),license:'Public domain',licenseUrl:'https://ourairports.com/data/'},{id:'geonames',url:'https://download.geonames.org/export/dump/',sha256:digest(geo),license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'}]}});}
test('streamed quoted CSV and dependency-only PPLCD yield exact neutral source records and pre-filter counts',async()=>fixture(async dir=>{
 const result=await build(dir);const a=result.airports[0],g=result.settlements[0];
 assert.equal(a.sourceId,'1');assert.equal(a.canonicalPlaceId,'reference:ourairports:1');assert.equal(a.canonicalName,'Fixture "airport", terminal\nNorth');assert.deepEqual(a.coordinates,[-90.5,14.5]);assert.equal(a.iataCode,'GUA');assert.equal(a.icaoCode,'MGGT');
 assert.equal(g.sourceId,'10');assert.equal(g.countryCode,'PF');assert.equal(g.featureCode,'PPLCD');assert.deepEqual(g.coordinates,[-149.5,-17.5]);assert.equal(result.coverage.PF.preFilterByFeature.PPLCD,1);assert.equal(result.coverage.PF.eligible,1);assert.equal(result.countrySeeds.PF.length,1);assert.equal(result.countrySeeds.PF[0].canonicalPlaceId,g.canonicalPlaceId);assert.ok(!('stayEvidence' in g));assert.ok(!('recommendedNights' in g));
}));
test('invalid missing points, country and abandoned/facility types cannot become neutral choices',async()=>fixture(async dir=>{
 const r=await build(dir,csv([airport(1,{latitude_deg:''}),airport(2,{longitude_deg:181}),airport(3,{type:'heliport'}),airport(4,{type:'closed_airport'})]),[settlement(10,'PPLQ'),settlement(11,'PPLF'),settlement(12,'PPLCD','PF',{4:'NaN'}),settlement(13,'PPLC','XK'),settlement(14,'PPLCD','HK')].join('\n')+'\n');
 assert.equal(r.airports.length,1);assert.equal(r.airports[0].status,'closed');assert.equal(r.countrySeeds.PF.length,0);assert.equal(r.coverage.PF.preFilterByFeature.PPLCD,1);assert.equal(r.settlements.length,2);assert.equal(r.coverage.XK.eligible,1);assert.equal(r.coverage.HK.eligible,1);
}));
test('unknown eligible jurisdiction and duplicate source IDs block activation; bad source checksum cannot replace previous output',async()=>fixture(async dir=>{
 await assert.rejects(()=>build(dir,csv([airport()]),settlement(1,'PPLC','ZZ')),/unmapped.*jurisdiction/i);
 await assert.rejects(()=>build(dir,csv([airport(),airport()]),settlement(1)),/duplicate.*id/i);
}));
test('output digests reproduce and coordinate-changing refresh quarantines published seeds without historical replacement',async()=>fixture(async dir=>{
 const first=await build(dir);const bytes=await readFile(join(dir,'out','country-seeds.json'),'utf8');
 const second=await build(dir);assert.equal(first.manifest.snapshotId,second.manifest.snapshotId);assert.equal(bytes,await readFile(join(dir,'out','country-seeds.json'),'utf8'));
 const previous=join(dir,'previous');await (await import('node:fs/promises')).cp(join(dir,'out'),previous,{recursive:true});
 const changed=await build(dir,csv([airport()]),settlement(10,'PPLCD','PF',{5:-148})+'\n',previous);
 assert.equal(changed.countrySeeds.PF.length,0);assert.deepEqual(changed.retiredSeeds.find(s=>s.canonicalPlaceId==='reference:geonames:10').coordinates,[-149.5,-17.5]);assert.ok(changed.diff.quarantined.some(r=>r.canonicalPlaceId==='reference:geonames:10'));
}));
test('capital and dependency-capital ranking precedes populous ordinary settlement without tourism assertions',async()=>fixture(async dir=>{
 const r=await build(dir,csv([airport()]),[settlement(1,'PPL','PF',{14:999999}),settlement(2,'PPLC','PF',{14:100}),settlement(3,'PPLCD','PF',{14:100})].join('\n')+'\n');assert.deepEqual(r.countrySeeds.PF.map(s=>s.canonicalPlaceId),['reference:geonames:2','reference:geonames:3','reference:geonames:1']);
}));

test('out-of-universe airports without usable codes are not eligible and cannot block supported coverage',async()=>fixture(async dir=>{
 const r=await build(dir,csv([airport(1,{iso_country:'XP',iata_code:'',icao_code:''}),airport(2)]));assert.equal(r.airports.length,1);assert.equal(r.airports[0].sourceId,'2');assert.equal(r.rejected['airport-no-code'],1);
 await assert.rejects(()=>build(dir,csv([airport(1,{iso_country:'XP'})])),/unmapped.*jurisdiction/i);
}));
test('prefix index offsets decode the original exact settlement tuple without retaining parsed world records',async()=>fixture(async dir=>{
 await build(dir);const prefixes=JSON.parse(await readFile(join(dir,'out','settlement-prefixes.json'),'utf8'));const index=await readFile(join(dir,'out','settlement-prefixes.bin'));const data=await readFile(join(dir,'out','settlements.json'));const {offset,count}=prefixes.fi;assert.ok(count);const start=index.readUInt32LE(offset);const end=data.indexOf(10,start);const tuple=JSON.parse(data.subarray(start,end).toString('utf8').replace(/,$/,''));assert.equal(tuple[0],'10');assert.equal(tuple[1],'Fixture capital');assert.deepEqual(tuple.slice(3,5),[-149.5,-17.5]);
}));

test('bad source checksum leaves the previous snapshot byte-identical',async()=>fixture(async dir=>{
 const first=await build(dir);const before=await readFile(join(dir,'out','manifest.json'),'utf8');
 await assert.rejects(()=>buildReferenceSnapshot({airports:join(dir,'airports.csv'),settlements:join(dir,'cities500.txt'),output:join(dir,'out'),sourceManifest:{acquiredAt:first.manifest.generatedAt,sources:first.manifest.sources.map(s=>({...s,sha256:'wrong'}))}}),/checksum/);
 assert.equal(await readFile(join(dir,'out','manifest.json'),'utf8'),before);
}));

test('compact length index preserves ordered exact-ID tuple offsets',async()=>fixture(async dir=>{
 await build(dir,csv([airport()]),[settlement(10),settlement(20)].join('\n')+'\n');
 const lengths=await readFile(join(dir,'out','settlement-lengths.bin'));const body=await readFile(join(dir,'out','settlements.json'));
 assert.equal(lengths.length,4);let offset=2;for(let i=0;i<2;i++){assert.equal(JSON.parse(body.subarray(offset,body.indexOf(10,offset)).toString().replace(/,$/,'')).at(0),String((i+1)*10));offset+=lengths.readUInt16LE(i*2);}
}));
