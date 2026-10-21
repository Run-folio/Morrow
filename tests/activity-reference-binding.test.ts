import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {countryCodeFor} from '../lib/easyt/country-registry.ts';
import {findCatalogPlaceById} from '../lib/easyt/place-catalog.ts';
import {discoveryPlaceForId} from '../lib/easyt/discovery-content.ts';
import {referencePlaceById} from '../lib/easyt/place-reference.server.ts';

// Execute the actual binding table and verifier with source records substituted
// in memory. No data files, saved trip documents or providers are changed.
const source=readFileSync('lib/easyt/place-reference.server.ts','utf8');
const ast=ts.createSourceFile('reference.ts',source,ts.ScriptTarget.Latest,true);
const table=ast.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(row=>row.name.getText(ast)==='activityReferenceBindings'));
const verifier=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='trustedPinnedActivityCentre');
assert(table);assert(verifier);
const js=ts.transpileModule(`${table.getText(ast)};${verifier.getText(ast).replace('export function','function')};return trustedPinnedActivityCentre;`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const make=new Function('countryCodeFor','normalized','referencePlaceById','findCatalogPlaceById','discoveryPlaceForId',js);
function harness() {
 const reference=structuredClone(referencePlaceById('reference:geonames:3413829')!);
 const catalog=structuredClone(findCatalogPlaceById('reykjavik')!);
 const discovery=structuredClone(discoveryPlaceForId('reykjavik')!);
 const normalize=(name:string)=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
 const verify=make(countryCodeFor,normalize,(id:string)=>id===reference.canonicalPlaceId?reference:null,
  (id:string)=>id===catalog.canonicalPlaceId?catalog:null,()=>discovery);
 const input={destination:'Reykjavík',requestedCountryCode:'Iceland',canonicalPlaceId:'reykjavik',providerId:reference.providerId};
 return {reference,catalog,discovery,input,verify};
}
test('observed authored/reference Reykjavík pair projects the pinned centre without rewriting either source',()=>{
 const h=harness(),before=JSON.stringify(h);
 assert.deepEqual(h.verify(h.input),{canonicalPlaceId:'reykjavik',source:'reference',sourceRecordKey:h.reference.providerId,countryCode:'IS',coordinates:[-21.89541,64.13548]});
 assert.equal(JSON.stringify(h),before);
});
for(const kind of ['reference point','catalog point','reference type','catalog type','reference country','catalog name','reference inactive','provider snapshot'] as const)
 test(`reviewed Reykjavík binding rejects ${kind} drift`,()=>{
  const h=harness();
  if(kind==='reference point')h.reference.coordinates=[h.reference.coordinates[0]+0.00001,h.reference.coordinates[1]];
  if(kind==='catalog point')h.discovery.coordinates=[h.discovery.coordinates[0]+0.00001,h.discovery.coordinates[1]];
  if(kind==='reference type')h.reference.placeType='town';
  if(kind==='catalog type')h.catalog.placeType='island';
  if(kind==='reference country')h.reference.countryCode='NO';
  if(kind==='catalog name')h.catalog.canonicalName='Reykjavík district';
  if(kind==='reference inactive')h.reference.status='quarantined';
  if(kind==='provider snapshot')h.input.providerId=h.input.providerId.replace('@699b595afdba9be6994e:', '@old-snapshot:');
  assert.equal(h.verify(h.input),null);
 });
