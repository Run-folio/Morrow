import assert from 'node:assert/strict';
import test from 'node:test';
import {REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';
import {findCatalogPlaceById} from '../lib/easyt/place-catalog.ts';
import {mergeEquivalentPlaceSuggestions as merge} from '../lib/easyt/place-autocomplete.ts';
function suggestion(id:string){
 const e=findCatalogPlaceById(id)!; assert.ok(e);
 return {canonicalPlaceId:id,name:e.canonicalName,country:e.parentCountries[0],placeType:e.placeType,coordinates:e.coordinates?[...e.coordinates]:undefined};
}
const a=suggestion('manila'),r=suggestion('reference:geonames:1701668');
test('unsubstantiated differing Manila tuples remain separate',()=>{
 assert.notDeepEqual(a.coordinates,r.coordinates);assert.deepEqual(merge([a,r]),[a,r]);
});
for(const [label,patch] of Object.entries({zero:{coordinates:[0,0]},missing:{coordinates:undefined},short:{coordinates:[120.9822]},extra:{coordinates:[120.9822,14.6042,0]},nonfinite:{coordinates:[NaN,14.6042]},reversed:{coordinates:[14.6042,120.9822]},conflictingAdmin:{region:'Unrelated district',administrativeHierarchy:['Unrelated district']}}))test(`mapped ID preserves ${label} reference tuple`,()=>{
 const c={...r,...patch};assert.deepEqual(merge([a,c]),[a,c]);
});
test('altered authored coordinates remain separate',()=>{const c={...a,coordinates:[0,0]};assert.deepEqual(merge([c,r]),[c,r]);});
test('unknown provider identity cannot merge through copied facts',()=>{
 const c=suggestion('los-angeles'),f={...c,canonicalPlaceId:'reference:geonames:999999999'};assert.deepEqual(merge([c,f]),[c,f]);
});
test('subprecision point difference is not exact tuple equality',()=>{
 const c=suggestion('los-angeles'),f={...c,canonicalPlaceId:'reference:geonames:5368361',coordinates:[-118.243701,34.052201]};assert.deepEqual(merge([c,f]),[c,f]);
});
for(const type of ['region','island','transport_gateway'])test(`${type} is distinct from city`,()=>{const c={...r,placeType:type};assert.deepEqual(merge([a,c]),[a,c]);});
test('other jurisdiction is distinct',()=>{const c={...r,country:'Mexico'};assert.deepEqual(merge([a,c]),[a,c]);});
test('unchanged repeated canonical suggestion deduplicates',()=>assert.deepEqual(merge([a,{...a}]),[a]));

for (const patch of [{coordinates:[0,0]}, {region:'Conflicting province'}, {placeType:'region'}, {country:'Mexico'}]) test('same ID with conflicting published facts remains explicit: '+JSON.stringify(patch),()=>{
 const changed={...r,...patch};assert.deepEqual(merge([r,changed]),[r,changed]);
});

test('published same-label sources remain distinguishable without inventing admin facts',async()=>{
 const {placeSuggestionLocationDetail}=await import('../lib/easyt/place-autocomplete.ts');
 const labels=[a,r].map(item=>placeSuggestionLocationDetail(item,[a,r]));
 assert.equal(new Set(labels).size,2);
 assert.match(labels[0]!,/Morrovia curated place catalog/);
 assert.match(labels[1]!,/GeoNames/);
 assert(labels.every(label=>label.includes('Location to confirm')));
});

for (const patch of [{providerId:'different-source-tuple'}, {referenceSnapshotId:'different-snapshot'}, {administrativeHierarchy:['Conflicting province']}, {name:'Conflicting source name'}]) test('same ID never hides conflicting source evidence: '+JSON.stringify(patch),()=>{
 const changed={...r,...patch};assert.deepEqual(merge([r,changed]),[r,changed]);
});

for (const patch of [{featureCode:'PPLA'}, {providerSourceId:'other-namespace'}, {provenance:[{id:'different-provider-key'}]}]) test('same ID retains conflicting published feature/namespace/key: '+JSON.stringify(patch),()=>{
 const original={...r,featureCode:'PPLC',providerSourceId:'geonames',provenance:[{id:'published-provider-key'}]};
 const changed={...original,...patch};assert.deepEqual(merge([original,changed]),[original,changed]);
});
test('pinned source contains no documented positive equivalence mapping',async()=>{
 const {readFileSync}=await import('node:fs');
 const crosswalk=JSON.parse(readFileSync(new URL('../data/place-reference/crosswalk.json',import.meta.url),'utf8'));
 assert.deepEqual(crosswalk,{version:1,mappings:[]});
});

test('identical reference tuples still deduplicate within their own source',()=>{
 const source={...r,providerId:findCatalogPlaceById(r.canonicalPlaceId)!.referenceProviderId,referenceSnapshotId:REFERENCE_SNAPSHOT_ID,providerSourceId:'geonames',featureCode:'PPLC'};
 assert.deepEqual(merge([source,{...source,coordinates:[...source.coordinates!]}]),[source]);
});
