import assert from "node:assert/strict";
import test from "node:test";

import { itineraryPresentationImages } from "../lib/easyt/itinerary-presentation-images.ts";
import { mediaImagesForExactDestination } from "../lib/easyt/itinerary-media.ts";
import { routeDestinationPhoto } from "../lib/easyt/route-images.ts";
import type { EasyTTrip, PlanItem, TripStop } from "../lib/easyt/trip.ts";

function stop(id: string, name: string, country: string, order: number): TripStop {
  return { id, name, country, order, latitude: null, longitude: null, arrivalDate: null, departureDate: null, nights: 1 };
}

function day(id: string, stopId: string, dayNumber: number, image: string | null = null, sourceUrl: string | null = null): PlanItem {
  return { id, stopId, dayNumber, date: `2026-10-${String(dayNumber).padStart(2, "0")}`, type: "open", title: id, reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null, image, sourceUrl };
}

function trip(stops: TripStop[], planItems: PlanItem[]): EasyTTrip {
  return { schemaVersion: 1, id: "presentation", ownerId: null, title: "Presentation", status: "draft", startDate: "2026-10-01", endDate: "2026-10-12", travellers: 2, currency: "GBP", brief: { origin: "Home", mustDo: "", pace: "slow", hotelChanges: "some", budgetBand: "mid", selectedPlaces: {} }, stops, legs: [], planItems, recommendations: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}

test("explicit reviewed photo wins and carries its own licence and source", () => {
  const reviewed = routeDestinationPhoto("Tokyo", "Japan")!;
  const assigned = reviewed.variants.at(-1)!.src;
  const result = itineraryPresentationImages(trip([stop("tokyo", "Tokyo", "Japan", 0)], [day("day-1", "tokyo", 1, assigned)]));
  assert.equal(result.dayById["day-1"]?.src, assigned);
  assert.equal(result.stopById.tokyo?.src, assigned);
  assert.equal(result.dayById["day-1"]?.sourceUrl, reviewed.sourceUrl);
  assert.equal(result.dayById["day-1"]?.licenseUrl, reviewed.licenseUrl);
  assert.match(result.dayById["day-1"]?.fullCreditUrl ?? "", new RegExp(`#${reviewed.key}$`));
});

test("valid Tokyo alternatives precede duplicate stop and day imagery", () => {
  const input = trip([stop("tokyo-first", "Tokyo", "Japan", 0), stop("kyoto", "Kyoto", "Japan", 1), stop("tokyo-return", "Tokyo", "Japan", 2)], [day("day-1", "tokyo-first", 1), day("day-2", "tokyo-first", 2), day("day-3", "kyoto", 3), day("day-4", "tokyo-return", 4)]);
  const result = itineraryPresentationImages(input);
  assert.notEqual(result.stopById["tokyo-first"]?.src, result.stopById["tokyo-return"]?.src);
  assert.notEqual(result.dayById["day-1"]?.src, result.dayById["day-2"]?.src);
  assert.ok(result.dayById["day-4"]?.src);
  assert.deepEqual(Object.keys(result.stopById), ["tokyo-first", "kyoto", "tokyo-return"]);
  assert.deepEqual(Object.keys(result.dayById), ["day-1", "day-2", "day-3", "day-4"]);
});

test("single-source stop covers remain credited while day covers never repeat", () => {
  const input = trip([stop("one", "Kanazawa", "Japan", 0), stop("two", "Kanazawa", "Japan", 1)], [day("day-1", "one", 1), day("day-2", "two", 2)]);
  const result = itineraryPresentationImages(input,{reviewedOnly:true});
  assert.equal(result.stopById.one?.src, result.stopById.two?.src);
  assert.equal(result.stopById.one?.sourceUrl, routeDestinationPhoto("Kanazawa", "Japan")?.sourceUrl);
  assert.ok(result.dayById["day-1"]);
  assert.equal(result.dayById["day-2"],null);
});

test("unknown destination and substring-only match have no photo", () => {
  const input = trip([stop("unknown", "Example Uncovered Base", "Example Country", 0), stop("almost", "Tokyo Metropolitan", "Japan", 1)], [day("day-1", "unknown", 1), day("day-2", "almost", 2)]);
  assert.equal(mediaImagesForExactDestination("Tokyo Metropolitan").length, 0);
  const result = itineraryPresentationImages(input);
  assert.equal(result.stopById.unknown, null);
  assert.equal(result.stopById.almost, null);
  assert.equal(result.dayById["day-1"], null);
  assert.equal(result.dayById["day-2"], null);
});

test("uncredited assigned photo falls back; selection is stable without trip mutation", () => {
  const input = trip([stop("tokyo", "Tokyo", "Japan", 0)], [day("day-1", "tokyo", 1, "/unreviewed.jpg")]);
  const before = JSON.stringify(input);
  const first = itineraryPresentationImages(input);
  assert.notEqual(first.dayById["day-1"]?.src, "/unreviewed.jpg");
  assert.ok(first.dayById["day-1"]?.sourceUrl);
  assert.deepEqual(itineraryPresentationImages(input), first);
  assert.equal(JSON.stringify(input), before);
});

test('reviewed-only day photos reject arbitrary provider URLs without mutating saved content', () => {
  const input = trip([stop('kyoto', 'Kyoto', 'Japan', 0)], [day('day-1', 'kyoto', 1, 'https://provider.example/photo.jpg', 'https://provider.example/activity')]);
  const before = JSON.stringify(input);
  const images = itineraryPresentationImages(input, { reviewedOnly: true });
  assert.notEqual(images.dayById['day-1']?.src, 'https://provider.example/photo.jpg');
  assert.equal(images.dayById['day-1']?.sourceUrl, routeDestinationPhoto('Kyoto', 'Japan')?.sourceUrl);
  assert.ok(images.dayById['day-1']?.licenseUrl);
  assert.equal(JSON.stringify(input), before);
});

test('reviewed-only mode varies reviewed destination images and leaves uncovered places honest', () => {
  const input = trip([stop('kyoto', 'Kyoto', 'Japan', 0), stop('unknown', 'Uncovered Place', 'Japan', 1)], [day('a', 'kyoto', 1), day('b', 'kyoto', 2), day('c', 'unknown', 3)]);
  const images = itineraryPresentationImages(input, { reviewedOnly: true });
  assert.notEqual(images.dayById.a?.sourceUrl, images.dayById.b?.sourceUrl);
  assert.equal(images.dayById.c, null);
});

test('calendar retains a relevant image on every day, even when responsive variants share a source', async () => {
  const presentation = await import('../lib/easyt/itinerary-presentation-images.ts');
  assert.equal(typeof presentation.itineraryCalendarImages, 'function');
  const photo = routeDestinationPhoto('Tokyo', 'Japan')!;
  const input = trip([stop('tokyo', 'Tokyo', 'Japan', 0)], [day('one','tokyo',1,photo.variants[0].src),day('two','tokyo',2,photo.variants.at(-1)!.src)]);
  const selected = itineraryPresentationImages(input, {reviewedOnly:true});
  const before = JSON.stringify(input);
  const calendar = presentation.itineraryCalendarImages(input, selected.dayById);
  assert.equal(calendar.one?.sourceUrl, photo.sourceUrl);
  assert.ok(calendar.two?.sourceUrl);
  assert.equal(JSON.stringify(input), before);
  assert.ok(selected.dayById.two?.src, 'Selected-day photography remains available');
  assert.equal(input.planItems[1].image,photo.variants.at(-1)!.src,'Saved photo assignment is preserved');
});

test('calendar keeps distinct reviewed destination images and does not fill uncovered days with unrelated photos', async () => {
  const presentation = await import('../lib/easyt/itinerary-presentation-images.ts');
  assert.equal(typeof presentation.itineraryCalendarImages, 'function');
  const input = trip([stop('tokyo','Tokyo','Japan',0),stop('kyoto','Kyoto','Japan',1),stop('unknown','Uncovered Place','Japan',2)], [day('one','tokyo',1),day('two','tokyo',2),day('three','kyoto',3),day('four','unknown',4)]);
  const selected = itineraryPresentationImages(input, {reviewedOnly:true});
  const calendar = presentation.itineraryCalendarImages(input,selected.dayById);
  assert.ok(calendar.one?.licenseUrl);
  assert.ok(calendar.two?.sourceUrl);
  assert.ok(calendar.three?.licenseUrl);
  assert.notEqual(calendar.one?.sourceUrl,calendar.three?.sourceUrl);
  assert.equal(calendar.four,null);
});


test('reviewed activity photos win only on their scheduled day and stop; provider URLs do not establish rights', () => {
  const tokyo = routeDestinationPhoto('Tokyo','Japan')!;
  const kyoto = routeDestinationPhoto('Kyoto','Japan')!;
  const input = trip([stop('tokyo','Tokyo','Japan',0)], [day('one','tokyo',1),day('two','tokyo',2),day('three','tokyo',3)]);
  input.brief.itineraryIdeas = [
    {id:'valid',stopId:'tokyo',dayId:'two',placeId:'ginza',title:'Ginza walk',category:'activity',image:tokyo.variants[0].src,source:'destination-highlight',reasons:[]},
    {id:'foreign',stopId:'tokyo',dayId:'one',placeId:'foreign',title:'Wrong city',category:'activity',image:kyoto.variants[0].src,source:'destination-highlight',reasons:[]},
    {id:'provider',stopId:'tokyo',dayId:'three',placeId:'viator',title:'Tour',category:'activity',image:'https://media.tacdn.com/tour.jpg',sourceUrl:'https://viator.com/tour',source:'live-provider-inventory',provider:'viator',reasons:[]},
  ];
  const before=JSON.stringify(input);
  const result=itineraryPresentationImages(input,{reviewedOnly:true});
  assert.equal(result.dayById.two?.sourceUrl,tokyo.sourceUrl);
  assert.notEqual(result.dayById.one?.sourceUrl,kyoto.sourceUrl);
  assert.notEqual(result.dayById.three?.src,'https://media.tacdn.com/tour.jpg');
  assert.equal(JSON.stringify(input),before);
});

test('multi-day reviewed destination pools use distinct assets and stay empty after exhaustion', () => {
 const input=trip([stop('tokyo','Tokyo','Japan',0),stop('single-base','Kanazawa','Japan',1),stop('missing','Unknown Base','Japan',2)],Array.from({length:8},(_,i)=>day(String(i),'tokyo',i+1)));
 input.planItems.push(day('single','single-base',9),day('single2','single-base',10),day('none','missing',11));
 const result=itineraryPresentationImages(input,{reviewedOnly:true});
 const sources=input.planItems.slice(0,8).map(d=>result.dayById[d.id]?.sourceUrl);
 assert.ok(sources.every(Boolean));
 assert.ok(new Set(sources).size>=3,'Reviewed Tokyo pool provides real photographic variety');
 assert.equal(new Set(sources.slice(0,3)).size,3,'Different files, not responsive crops of one asset');
 const counts=[...new Set(sources)].map(src=>sources.filter(s=>s===src).length);
 assert.ok(counts.every(count=>count===1),'No destination photo repeats, including non-adjacent days');
 assert.ok(result.dayById.single?.sourceUrl);
 assert.equal(result.dayById.single2,null);
 assert.equal(result.dayById.none,null,'No unrelated destination is invented');
});


test('repeated saved day covers yield to unused reviewed alternatives without changing saved assignments',()=>{
 const cover=routeDestinationPhoto('Tokyo','Japan')!;
 const input=trip([stop('tokyo','Tokyo','Japan',0)],Array.from({length:6},(_,i)=>day(String(i),'tokyo',i+1,cover.variants[i%cover.variants.length].src)));
 const before=JSON.stringify(input);
 const images=itineraryPresentationImages(input,{reviewedOnly:true});
 assert.equal(new Set(input.planItems.slice(0,3).map(day=>images.dayById[day.id]?.sourceUrl)).size,3);
 assert.equal(JSON.stringify(input),before);
});
