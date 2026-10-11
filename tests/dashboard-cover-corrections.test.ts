import assert from 'node:assert/strict';
import test from 'node:test';
import * as cover from '../lib/easyt/dashboard-trip-image.ts';
import {routeDestinationPhoto} from '../lib/easyt/route-images.ts';
import type {EasyTTrip,TripStop} from '../lib/easyt/trip.ts';
const stop=(name:string,country:string,order:number):TripStop=>({id:`s-${order}`,name,country,order,longitude:null,latitude:null,arrivalDate:null,departureDate:null,nights:2});
const trip=(id:string,stops:TripStop[]):EasyTTrip=>({schemaVersion:1,id,ownerId:'cover-fixture',title:id,status:'planned',startDate:'2027-05-01',endDate:'2027-05-10',travellers:2,currency:'GBP',stops,planItems:[],legs:[],recommendations:[],brief:{origin:'Tokyo',mustDo:'',pace:'slow',hotelChanges:'few',budgetBand:'mid',selectedPlaces:{}},createdAt:'2026-09-01T10:00:00.000Z',updatedAt:'2026-09-01T10:00:00.000Z'});

test('dashboard rejects park-only Athens inventory and never substitutes a later destination',()=>{
 const input=trip('athens',[stop('Athens','Greece',0),stop('Lisbon','Portugal',1)]);
 assert.equal(cover.dashboardTripPhoto(input),null);assert.equal(cover.featuredDashboardTripPhoto(input),null);
});
test('stored media must belong to the first sorted overnight destination',()=>{
 const input=trip('stored',[stop('Unknown','Spain',0),stop('Lisbon','Portugal',1)]);
 const src=routeDestinationPhoto('Lisbon','Portugal')!.variants.at(-1)!.src;
 input.planItems=[{id:'later',stopId:'s-1',image:src,dayNumber:1,date:'2027-05-01',type:'activity',title:'Later destination activity',reason:'Fixture',notes:[],startsAt:null,endsAt:null,bookingUrl:null,latitude:null,longitude:null}];
 const before=structuredClone(input);
 assert.equal(cover.dashboardTripPhoto(input),null);assert.deepEqual(input,before);
 const sorted=trip('sorted',[stop('Tokyo','Japan',2),stop('Lisbon','Portugal',0)]);
 assert.equal(cover.dashboardTripPhoto(sorted)?.place,'Lisbon');assert.equal(cover.featuredDashboardTripPhoto(sorted)?.place,'Lisbon');
});
test('first-place covers reserve provider asset identity instead of duplicating or switching stops',()=>{
 const first=trip('one',[stop('Lisbon','Portugal',0),stop('Tokyo','Japan',1)]),second={...first,id:'two'};
 const selection=cover.dashboardTripPhotosForCards([first,second]);
 assert.equal(selection.get('one')?.place,'Lisbon');assert.equal(selection.has('two'),false);
 const selected=cover.dashboardTripPhoto(first)!;
 assert.equal(cover.dashboardTripPhotosForCards([first],[selected.creditHref!]).size,0);
});
test('live cover candidates retain canonical first-place context with independent stable cover cache keys',()=>{
 const destination={...stop('Santa Cruz de Tenerife','Spain',0),canonicalPlaceId:'reference:geonames:2511174',providerId:'geonames:2511174',region:'Canary Islands',administrativeHierarchy:['Canary Islands'],longitude:-16.25,latitude:28.46};
 const a=trip('a',[destination]),b={...a,id:'b'};
 const first=cover.dashboardTripCoverCandidate(a,['failed']),second=cover.dashboardTripCoverCandidate(b);
 assert.ok(first);assert.ok(second);assert.notEqual(first.cacheKey,second.cacheKey);assert.deepEqual(first.occurrenceIds,['a']);assert.deepEqual(first.excludedSources,['failed']);
 assert.equal(first.place?.name,destination.name);assert.equal(first.place?.canonicalPlaceId,destination.canonicalPlaceId);assert.equal(first.place?.country,'Spain');assert.deepEqual(first.place?.coordinates,[-16.25,28.46]);assert.deepEqual(first.place?.administrativeHierarchy,['Canary Islands']);
 assert.deepEqual(first,cover.dashboardTripCoverCandidate(a,['failed']));assert.equal(cover.dashboardTripCoverCandidate(trip('empty',[])),null);
});
test('resolved country illustrations preserve scope, canonical country, provider identity and complete credit',()=>{
 const resolved=cover.dashboardPhotoFromResolved({id:'File:Coast.jpg',provider:'wikimedia',scope:'country',country:'ES',src:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Coast.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:Coast.jpg',sourceLabel:'Author · CC BY 4.0',author:'Author',authorUrl:'https://example.test/author',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',alt:'Spain coast'}, {name:'Santa Cruz de Tenerife',country:'Spain'});
 assert.equal(resolved.scope,'country');assert.equal(resolved.country,'Spain');assert.equal(resolved.id,'File:Coast.jpg');assert.equal(resolved.provider,'wikimedia');assert.equal(resolved.creditLabel,'Author · CC BY 4.0');assert.equal(resolved.licenseHref,'https://creativecommons.org/licenses/by/4.0/');assert.equal(resolved.place,null);
});

test('explicit destination identity or administrative context cannot borrow unbound static or stored imagery',()=>{
 const plain=stop('La Fortuna','Costa Rica',0);
 assert.ok(cover.dashboardTripPhoto(trip('legacy',[plain])),'legacy reviewed name and country remain usable');
 const record=routeDestinationPhoto(plain.name,plain.country)!;
 for(const context of [{canonicalPlaceId:'photon:distinct-namesake'}, {providerId:'photon:distinct-namesake'}, {region:'Distinct region'}, {administrativeHierarchy:['Distinct region']}, {longitude:-84,latitude:8}, {canonicalPlaceId:'photon:distinct-namesake',region:'Distinct region',longitude:-84,latitude:8}]) {
  const input=trip('bound',[{...plain,...context}]);
  input.planItems=[{id:'stored',stopId:plain.id,image:record.variants.at(-1)!.src,dayNumber:1,date:'2027-05-01',type:'activity',title:'Saved activity',reason:'Fixture',notes:[],startsAt:null,endsAt:null,bookingUrl:null,latitude:null,longitude:null}];
  const before=structuredClone(input);
  assert.equal(cover.dashboardTripPhoto(input),null,JSON.stringify(context));assert.equal(cover.featuredDashboardTripPhoto(input),null);assert.deepEqual(cover.canonicalDashboardTripPhotos(input),[]);
  const candidate=cover.dashboardTripCoverCandidate(input);assert.ok(candidate,'unproven static context falls through to live lookup');assert.deepEqual(candidate.place,cover.dashboardTripCoverPlace(input));assert.deepEqual(input,before);
 }
});
test('static and live Unsplash covers share their actual provider asset identity across widths',async()=>{
 const record=routeDestinationPhoto('Lisbon','Portugal')!;
 const staticPhoto=cover.dashboardTripPhoto(trip('static',[stop('Lisbon','Portugal',0)]))!;
 const live=cover.dashboardPhotoFromResolved({id:'gOLCAOuc7iA',provider:'unsplash',src:record.variants[0]!.src,sourceUrl:'https://unsplash.com/photos/25-de-abril-bridge-in-lisbon-gOLCAOuc7iA?utm_source=other',sourceLabel:'Author · Unsplash License',alt:record.alt},{name:'Lisbon',country:'Portugal'});
 assert.equal(staticPhoto.id,'gOLCAOuc7iA');assert.equal(cover.dashboardPhotoAssetIdentity(staticPhoto),cover.dashboardPhotoAssetIdentity(live));
 const {routePhotoAssetIdentity}=await import('../lib/easyt/route-photo-cache.ts');
 assert.equal(cover.dashboardPhotoAssetIdentity(staticPhoto),routePhotoAssetIdentity({id:staticPhoto.id,provider:staticPhoto.provider,src:staticPhoto.src,sourceUrl:staticPhoto.creditHref!,sourceLabel:staticPhoto.creditLabel!}));
});
