import assert from 'node:assert/strict';
import test from 'node:test';
import {photoLedItineraryTrip} from './fixtures/photo-led-itinerary.ts';
import {itineraryPresentationImages} from '../lib/easyt/itinerary-presentation-images.ts';
import {routeDestinationPhoto} from '../lib/easyt/route-images.ts';

test('a generic city photo cannot acquire an unrelated scheduled activity title',()=>{
 const trip=photoLedItineraryTrip();const photo=routeDestinationPhoto('Tokyo','Japan')!;
 assert.equal(photo.activitySubjects?.length??0,0);
 trip.brief.itineraryIdeas=[{id:'unrelated',stopId:'tokyo',dayId:'day-3',placeId:'synthetic',category:'activity',title:'Private sushi-making class',source:'destination-highlight',image:photo.variants[0].src,reasons:[]}];
 const image=itineraryPresentationImages(trip,{reviewedOnly:true}).dayById['day-3'];
 assert.notEqual(image?.activityTitle,'Private sushi-making class','The photographed city is not evidence of the scheduled activity');
});
