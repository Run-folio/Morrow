import assert from 'node:assert/strict';
import test from 'node:test';
import {photoLedItineraryTrip} from './fixtures/photo-led-itinerary.ts';
import {itineraryPresentationImages} from '../lib/easyt/itinerary-presentation-images.ts';
import {routeDestinationPhoto} from '../lib/easyt/route-images.ts';
import type {ItineraryIdea} from '../lib/easyt/trip.ts';

const product=(dayId:string,image:string):ItineraryIdea=>({id:`product-${dayId}`,stopId:'tokyo',dayId,placeId:'viator:28575P41',category:'activity',title:'Mt Fuji and Hakone 1-Day Bus Tour Return by Bullet Train',source:'live-provider-inventory',provider:'viator',providerProductId:'28575P41',sourceUrl:'https://shop.live.rc.viator.com/tours/Tokyo/Mt-Fuji-and-Hakone/d334-28575P41?pid=unchanged',image,reasons:[],providerMetadata:{provenance:{kind:'live_provider_search',provider:'viator',checkedAt:'2026-11-05T15:19:21.671Z'}}});

test('source identity deduplicates local responsive copies, Commons aliases and Viator CDN sizes',async()=>{
 const policy=await import('../lib/easyt/itinerary-image-policy.ts');
 const identity=policy.itineraryImageIdentity;
 const photo=routeDestinationPhoto('Tokyo','Japan')!;
 assert.equal(identity({src:photo.variants[0].src,alt:''}),identity({src:photo.variants.at(-1)!.src,alt:''}));
 assert.equal(identity({src:'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Shinjuku_Park_Tower_2018_from_MetGovBld.jpg/960px-Shinjuku_Park_Tower_2018_from_MetGovBld.jpg?utm_source=wiki',alt:''}),identity({src:'https://upload.wikimedia.org/wikipedia/commons/a/a9/Shinjuku_Park_Tower_2018_from_MetGovBld.jpg',alt:''}));
 assert.equal(identity({src:'https://hare-media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/10/26/8a/4c.jpg',alt:''}),identity({src:'https://media.tacdn.com/media/attractions-splice-spp-200x200/10/26/8a/4c.jpg',alt:''}));
});

test('unverified supplier permission withholds product imagery even with valid API provenance',()=>{
 const trip=photoLedItineraryTrip();
 const idea=product('day-2','https://hare-media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/10/26/8a/4c.jpg');
 trip.brief.itineraryIdeas=[idea];
 const before=JSON.stringify(trip);
 const selected=itineraryPresentationImages(trip,{reviewedOnly:true}).dayById['day-2'];
 assert.notEqual(selected?.src,idea.image);
 assert.notEqual(selected?.sourceUrl,idea.sourceUrl);
 assert.notEqual(selected?.sourceLabel,'Photo supplied via Viator');
 assert.ok(selected?.licenseUrl,'Use verified reusable place imagery instead');
 assert.equal(selected?.activityTitle,idea.title);
 assert.equal(JSON.stringify(trip),before);
});

test('activity images are reserved before generic days and never repeated on nonadjacent days',async()=>{
 const {itineraryImageIdentity}=await import('../lib/easyt/itinerary-image-policy.ts');
 const trip=photoLedItineraryTrip();
 const cover=routeDestinationPhoto('Tokyo','Japan')!;
 trip.brief.itineraryIdeas=[{...product('day-3',cover.variants[0].src),title:'Ginza walk',source:'destination-highlight',provider:undefined,providerMetadata:undefined}];
 const selected=itineraryPresentationImages(trip,{reviewedOnly:true}).dayById;
 assert.equal(selected['day-3']?.src,cover.variants[0].src);
 assert.notEqual(selected['day-1']?.sourceUrl,cover.sourceUrl,'Earlier generic day cannot consume later activity image');
 const identities=Object.values(selected).filter(Boolean).map(image=>itineraryImageIdentity(image!));
 assert.equal(new Set(identities).size,identities.length);
});

test('exhausted destinations produce honest empty choices instead of repeated covers',()=>{
 const trip=photoLedItineraryTrip();
 trip.stops=[{...trip.stops[0],name:'Delhi',country:'India',canonicalPlaceId:undefined,providerId:undefined}];
 trip.planItems=Array.from({length:29},(_,i)=>({...trip.planItems[0],id:`day-${i+1}`,stopId:trip.stops[0].id,dayNumber:i+1,image:undefined,notes:[]}));
 const selected=itineraryPresentationImages(trip,{reviewedOnly:true}).dayById;
 const covered=Object.values(selected).filter(Boolean).length;
 assert.ok(covered>=13,'Delhi retains broad reviewed coverage');
 assert.ok(covered<29,'The fixture still exercises exhausted coverage');
 assert.equal(Object.values(selected).filter(image=>image===null).length,29-covered);
});

test('verified exact activity subject may be an excursion outside the overnight city',()=>{
 const trip=photoLedItineraryTrip();
 trip.brief.itineraryIdeas=[{...product('day-4','https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9d/Shinjuku_Gyoen_National_Garden_-_sakura_3.JPG/960px-Shinjuku_Gyoen_National_Garden_-_sakura_3.JPG?utm_source=wiki'),stopId:'kyoto',title:'Shinjuku Gyo-en',source:'destination-highlight',provider:undefined,providerMetadata:undefined}];
 const image=itineraryPresentationImages(trip,{reviewedOnly:true}).dayById['day-4'];
 assert.equal(image?.activityTitle,'Shinjuku Gyo-en');
 assert.match(image?.sourceUrl??'',/Shinjuku_Gyoen_National_Garden_-_sakura_3/);
});

test('an unrelated reviewed subject is not relabelled as the scheduled activity',()=>{
 const trip=photoLedItineraryTrip();
 trip.brief.itineraryIdeas=[{...product('day-4','https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Shinjuku_Park_Tower_2018_from_MetGovBld.jpg/960px-Shinjuku_Park_Tower_2018_from_MetGovBld.jpg'),stopId:'kyoto',title:'Meiji Shrine',source:'destination-highlight',provider:undefined,providerMetadata:undefined}];
 const image=itineraryPresentationImages(trip,{reviewedOnly:true}).dayById['day-4'];
 assert.notEqual(image?.activityTitle,'Meiji Shrine');
 assert.doesNotMatch(image?.sourceUrl??'',/Shinjuku_Park_Tower/);
});

test('provider URLs need canonical provenance and the same original product identity',()=>{
 const base=product('day-2','https://hare-media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/10/26/8a/4c.jpg');
 for(const change of [{providerMetadata:undefined},{providerProductId:'different'},{image:'https://untrusted.example/photo.jpg'},{sourceUrl:'https://example.com/tours/28575P41'}]){
  const trip=photoLedItineraryTrip();trip.brief.itineraryIdeas=[{...base,...change}];
  const photo=itineraryPresentationImages(trip,{reviewedOnly:true}).dayById['day-2'];
  assert.notEqual(photo?.src,base.image);
  assert.notEqual(photo?.sourceLabel,'Photo supplied via Viator');
 }
});

test('different product rows and CDN sizes cannot repeat one supplier asset across days',async()=>{
 const {itineraryImageIdentity}=await import('../lib/easyt/itinerary-image-policy.ts');
 const trip=photoLedItineraryTrip();const first=product('day-2','https://hare-media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/10/26/8a/4c.jpg');
 const second=product('day-3','https://media.tacdn.com/media/attractions-splice-spp-200x200/10/26/8a/4c.jpg');
 trip.brief.itineraryIdeas=[first,second];const images=itineraryPresentationImages(trip,{reviewedOnly:true}).dayById;
 assert.notEqual(images['day-2']?.src,first.image,'Unverified supplier content remains withheld');
 assert.notEqual(itineraryImageIdentity(images['day-2']!),itineraryImageIdentity(images['day-3']!));
});


test('cache-busting and image-transform URLs preserve reviewed underlying identity',async()=>{
 const {itineraryImageIdentity}=await import('../lib/easyt/itinerary-image-policy.ts');
 const {routeImageCredit}=await import('../lib/easyt/route-images.ts');
 const photo=routeDestinationPhoto('Tokyo','Japan')!;const base=photo.variants[0].src;
 const variants=[`${base}?v=2#view`,`${base}?cacheBust=123`, `https://staging.morrovia.com${base}?rev=5`, `/_next/image?url=${encodeURIComponent(base+'?cb=4')}&w=640&q=75`, `/.netlify/images?url=${encodeURIComponent(base)}&w=300`];
 const expected=itineraryImageIdentity({src:base,alt:''});
 for(const src of variants){assert.equal(itineraryImageIdentity({src,alt:''}),expected,src);assert.equal(routeImageCredit(src)?.sourceUrl,photo.sourceUrl);}
 assert.equal(routeImageCredit(`https://untrusted.example${base}?v=3`),null,'Remote path imitation does not acquire reviewed rights');
});

test('generic remote cache-busting variants deduplicate while content identifiers remain distinct',async()=>{
 const {itineraryImageIdentity}=await import('../lib/easyt/itinerary-image-policy.ts');
 const identity=(src:string)=>itineraryImageIdentity({src,alt:''});
 assert.equal(identity('https://cdn.example/photo.jpg?cb=1&utm_source=one'),identity('https://cdn.example/photo.jpg?cb=2&utm_source=two#preview'));
 assert.equal(identity('https://images.unsplash.com/photo-1582450724147-0ee17201a14c?w=384&q=70'),identity('https://images.unsplash.com/photo-1582450724147-0ee17201a14c?w=1280&q=80'));
 assert.notEqual(identity('https://cdn.example/image?id=1&cb=4'),identity('https://cdn.example/image?id=2&cb=5'));
 assert.equal(identity('https://images.unsplash.com/photo-1582450724147-0ee17201a14c?ixid=one&ixlib=1&w=384'),identity('https://images.unsplash.com/photo-1582450724147-0ee17201a14c?ixid=two&ixlib=2&w=1280'));
});


test('trusted image wrappers around Commons thumbnails preserve file identity',async()=>{
 const {itineraryImageIdentity}=await import('../lib/easyt/itinerary-image-policy.ts');
 const image='https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Shinjuku_Park_Tower_2018_from_MetGovBld.jpg/960px-Shinjuku_Park_Tower_2018_from_MetGovBld.jpg?cb=1';
 assert.equal(itineraryImageIdentity({src:`/_next/image?url=${encodeURIComponent(image)}&w=640&q=75`,alt:''}),itineraryImageIdentity({src:image,alt:''}));
});


test('legacy source-file attribution and reviewed derivatives share one identity without granting URL rights',async()=>{
 const {itineraryImageIdentity}=await import('../lib/easyt/itinerary-image-policy.ts');
 const {routeImageCredit}=await import('../lib/easyt/route-images.ts');
 const photo=routeDestinationPhoto('Tokyo','Japan')!;
 assert.equal(itineraryImageIdentity({src:'/journey/ginza-night.jpg?cb=3',sourceUrl:photo.sourceUrl,alt:''}),itineraryImageIdentity({src:photo.variants[0].src,alt:''}));
 assert.equal(routeImageCredit('/journey/ginza-night.jpg?cb=3'),null,'Source identity is not permission for an unreviewed URL');
});

test('unverified supplier day assignments remain withheld through default and legacy options',()=>{
 const trip=photoLedItineraryTrip();const idea=product('day-1','https://hare-media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/10/26/8a/4c.jpg');
 trip.planItems[0].sourceUrl=idea.sourceUrl;
 for(const assigned of [idea.image!,`/_next/image?url=${encodeURIComponent(idea.image!)}&w=384`,`https://staging.morrovia.com/.netlify/images?url=${encodeURIComponent(idea.image!)}&w=384`]){
  trip.planItems[0].image=assigned;
  for(const options of [undefined,{reviewedOnly:false},{reviewedOnly:true}])assert.notEqual(itineraryPresentationImages(trip,options).dayById['day-1']?.src,assigned);
 }
});
