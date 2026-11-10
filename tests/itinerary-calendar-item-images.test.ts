import assert from 'node:assert/strict';
import test from 'node:test';
import * as images from '../lib/easyt/itinerary-presentation-images.ts';
import { itineraryActivityPhotos } from '../lib/easyt/route-images.ts';
import type { ItineraryCalendarItem } from '../lib/easyt/itinerary-calendar.ts';
import type { TripStop } from '../lib/easyt/trip.ts';
const tokyo = {id:'tokyo-return',name:'Tokyo',country:'Japan'} as TripStop;
const activity = (title:string,image?:string) => ({kind:'activity',activity:{title,image}} as ItineraryCalendarItem);
test('calendar photos describe the exact activity and carry credit, never a generic day', () => {
 const subject=itineraryActivityPhotos('Asakusa & Senso-ji', 'Tokyo','Japan');
 assert.ok(subject.length);
 const image=images.itineraryCalendarItemImage(activity('Asakusa & Senso-ji'),tokyo);
 assert.ok(image); assert.ok(image.sourceUrl); assert.ok(image.sourceLabel);
 assert.equal(image.activityTitle,'Asakusa & Senso-ji');
 assert.equal(images.itineraryCalendarItemImage(activity('My unphotographed walk'),tokyo),null);
});
test('missing stop, wrong geography and unverified supplier photos do not get replacement photos',()=>{
 assert.equal(images.itineraryCalendarItemImage(activity('My walk','https://supplier.test/photo.jpg'),tokyo),null);
 assert.equal(images.itineraryCalendarItemImage(activity('Asakusa & Senso-ji'),null),null);
 assert.equal(images.itineraryCalendarItemImage(activity('Asakusa & Senso-ji'),{...tokyo,name:'Paris',country:'France'}),null);
});
test('booking and shortlist distinctions do not acquire invented hotel imagery',()=>{
 assert.equal(images.itineraryCalendarItemImage({kind:'accommodation',booking:{title:'A hotel'}} as ItineraryCalendarItem,tokyo),null);
 assert.equal(images.itineraryCalendarItemImage({kind:'booking'} as ItineraryCalendarItem,tokyo),null);
});

test('calendar and day rows share the same reviewed activity image policy',()=>{
 const item=activity('Asakusa & Senso-ji');
 if(item.kind!=='activity') throw new Error('activity fixture');
 assert.deepEqual(images.itineraryActivityImage(item.activity,tokyo),images.itineraryCalendarItemImage(item,tokyo));
});
