import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,cpSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {build} from 'esbuild';
import {buildReferenceSnapshot} from '../scripts/build-place-reference.mjs';
const require=createRequire(import.meta.url),cwd=process.cwd();
const header='id,ident,type,name,latitude_deg,longitude_deg,iso_country,municipality,scheduled_service,gps_code,iata_code,icao_code\n';
const city=(extra={})=>[2198148,'Suva','Suva','',-18.14161,178.44149,'P','PPLC','FJ','','','','','',77366,'','','Pacific/Fiji','2026-01-01'].map((v,i)=>extra[i]??v).join('\t')+'\n';
const airport=code=>header+`24,NFNA,medium_airport,Fixture Airport,-18,178,FJ,Suva,yes,NFNA,${code},NFNA\n`;
async function install(dir,geo,air,previous){writeFileSync(join(dir,'airports.csv'),air);writeFileSync(join(dir,'cities500.txt'),geo);const sha=s=>createHash('sha256').update(s).digest('hex');return buildReferenceSnapshot({airports:join(dir,'airports.csv'),settlements:join(dir,'cities500.txt'),output:join(dir,'data/place-reference'),previous,sourceManifest:{acquiredAt:'2026-10-09T00:00:00Z',sources:[{id:'ourairports',url:'https://ourairports.com/data/',sha256:sha(air),license:'Public domain',licenseUrl:'https://ourairports.com/data/'},{id:'geonames',url:'https://download.geonames.org/export/dump/',sha256:sha(geo),license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'}]}});}
async function readers(dir){
 const fixtureFiles=/data\/place-reference\/(country-seeds|retired-seeds|code-kinds|manifest)\.json$/;
 const bundle=await build({stdin:{resolveDir:cwd,loader:'ts',contents:`export {referencePlaceById,searchReferencePlaces,referenceSnapshotId} from './lib/easyt/place-reference.server.ts';export {acceptedGeographicPlace,geographicallyReady,stopGeographicPlace,guardTripRoutingGeometry} from './lib/easyt/geographic-binding.ts';export {requireReadableTripDocument} from './lib/easyt/trip-document.ts';export {mapRouteLegsFromTrip} from './lib/easyt/map-spatial-context.ts';export {canonicalRouteFixture} from './tests/fixtures/batch14-route-documents.ts';export {builderDocumentFingerprint} from './lib/easyt/trip-builder-document-commit.ts';`},bundle:true,write:false,format:'cjs',platform:'node',logLevel:'silent',plugins:[{name:'installed-reference-snapshot',setup(b){b.onLoad({filter:fixtureFiles},args=>({contents:readFileSync(join(dir,'data/place-reference',args.path.split('/').pop()),'utf8'),loader:'json'}));}}]});
 const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports);return module.exports;
}
test('installed rename/code/point/type/ISO/deletion snapshots cannot rebind or autosave saved reference occurrences',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'reference-refresh-'));try{
  await install(dir,city(),airport('SUV'));const previous=join(dir,'previous');cpSync(join(dir,'data/place-reference'),previous,{recursive:true});
  const initial=await readers(dir);process.chdir(dir);
  const record=initial.referencePlaceById('reference:geonames:2198148');assert.ok(record);
  const choice={name:record.canonicalName,country:'Fiji',canonicalPlaceId:record.canonicalPlaceId,providerId:record.providerId,coordinates:record.coordinates,placeType:record.placeType,routability:'direct_destination',referenceSnapshotId:initial.referenceSnapshotId()};
  const accepted=initial.acceptedGeographicPlace({name:'Suva',country:'Fiji',canonicalPlaceId:record.canonicalPlaceId},choice);assert.ok(accepted);
  const originRecord=initial.referencePlaceById('reference:ourairports:24');
  const origin=initial.acceptedGeographicPlace({name:originRecord.canonicalName,country:'Fiji',canonicalPlaceId:originRecord.canonicalPlaceId},{...originRecord,name:originRecord.canonicalName,country:'Fiji',routability:'direct_destination',referenceSnapshotId:initial.referenceSnapshotId()},'endpoint');assert.ok(origin);
  const saved=initial.requireReadableTripDocument(initial.canonicalRouteFixture());
  saved.brief.intent.hardConstraints.fixedCommitments=[{id:'fixed-meeting',label:'Meeting in Suva',date:'2026-10-11',stopId:saved.stops[0].id}];
  saved.brief.intent.route.origin=origin;saved.brief.origin=origin.name;saved.brief.originCountry=origin.country;saved.brief.originCanonicalPlaceId=origin.canonicalPlaceId;saved.brief.originProviderId=origin.providerId;saved.brief.originCoordinates=origin.coordinates;
  for(const stop of saved.stops.slice(0,2)){Object.assign(stop,{name:accepted.name,country:accepted.country,canonicalPlaceId:accepted.canonicalPlaceId,providerId:accepted.providerId,longitude:accepted.coordinates[0],latitude:accepted.coordinates[1],geographicBinding:accepted.geographicBinding});const intent=saved.brief.intent.route.destinations.find(i=>i.stopIds.includes(stop.id));intent.selectedPlace=accepted;}
  const serialized=JSON.stringify(initial.requireReadableTripDocument(saved)),fingerprint=initial.builderDocumentFingerprint(JSON.parse(serialized));
  const controls=[['rename',city({1:'Renamed Suva'}),airport('SUV')],['airport-code',city(),airport('NEW')],['point',city({5:178.5}),airport('SUV')],['type',city({7:'PPL'}),airport('SUV')],['ISO',city({8:'PF'}),airport('SUV')],['deletion','',airport('SUV')]];
  for(const [change,geo,air] of controls){
   process.chdir(cwd);await install(dir,geo,air,previous);const current=await readers(dir);process.chdir(dir);
   const found=current.referencePlaceById(record.canonicalPlaceId),search=current.searchReferencePlaces('Suva',{explicitCountryNames:['Fiji']});
   if(change==='airport-code'){assert.ok(found);assert.ok(search.some(c=>c.canonicalPlaceId===record.canonicalPlaceId));assert.ok(current.searchReferencePlaces('SUV').every(c=>c.canonicalPlaceId!==origin.canonicalPlaceId&&!c.matchedAirportCode));assert.equal(current.searchReferencePlaces('NEW')[0].canonicalPlaceId,origin.canonicalPlaceId);}
   else {assert.equal(found,undefined,change);assert.ok(search.every(c=>c.canonicalPlaceId!==record.canonicalPlaceId),change);}
   assert.notEqual(current.referenceSnapshotId(),initial.referenceSnapshotId());assert.equal(current.acceptedGeographicPlace(accepted,choice),undefined,'old response cannot create new evidence after refresh');
   const read=current.requireReadableTripDocument(JSON.parse(serialized));assert.equal(current.builderDocumentFingerprint(read),fingerprint);
   assert.equal(current.geographicallyReady(current.stopGeographicPlace(read.stops[0])),true);assert.equal(current.geographicallyReady(read.brief.intent.route.origin,'endpoint'),true);
   current.guardTripRoutingGeometry(read);current.mapRouteLegsFromTrip(read);
   assert.equal(JSON.stringify(read),serialized,change+' read/lookup/geometry must not save or rebind');
   assert.equal(read.brief.intent.route.orderAuthority,'manual');assert.equal(read.brief.intent.route.journeyEnd.mode,'unknown');
   assert.deepEqual(read.stops.map(s=>[s.id,s.canonicalPlaceId,s.providerId,s.longitude,s.latitude,s.nights,s.order]),JSON.parse(serialized).stops.map(s=>[s.id,s.canonicalPlaceId,s.providerId,s.longitude,s.latitude,s.nights,s.order]));
   assert.deepEqual(read.planItems,JSON.parse(serialized).planItems);assert.deepEqual(read.brief.intent.hardConstraints,JSON.parse(serialized).brief.intent.hardConstraints);
  }
 }finally{process.chdir(cwd);rmSync(dir,{recursive:true,force:true});}
});
