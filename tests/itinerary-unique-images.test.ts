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

test('scheduled excursion product imagery leads its own day with original product link and supplier disclosure',()=>{
 const trip=photoLedItineraryTrip();
 const idea=product('day-2','https://hare-media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/10/26/8a/4c.jpg');
 trip.brief.itineraryIdeas=[idea];
 const before=JSON.stringify(trip);
 const selected=itineraryPresentationImages(trip,{reviewedOnly:true}).dayById['day-2'];
 assert.equal(selected?.src,idea.image);
 assert.equal(selected?.sourceUrl,idea.sourceUrl);
 assert.equal(selected?.sourceLabel,'Photo supplied via Viator');
 assert.equal(selected?.license,undefined,'No invented CC licence for supplier content');
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
 assert.equal(Object.values(selected).filter(Boolean).length,1);
 assert.equal(Object.values(selected).filter(image=>image===null).length,28);
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
 assert.equal(images['day-2']?.src,first.image);
 assert.notEqual(itineraryImageIdentity(images['day-2']!),itineraryImageIdentity(images['day-3']!));
});
