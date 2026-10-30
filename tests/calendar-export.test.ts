import assert from "node:assert/strict";
import test from "node:test";
import { representativeTrip } from "./calendar-export-fixture.ts";
import { projectCalendarExport, calendarExportPayloadHash, validCalendarDate } from "../lib/easyt/calendar-export.ts";
test("export collapses repeated stays and bound bookings without mutating saved choices", () => {
    const trip = representativeTrip(), before = structuredClone(trip), result = projectCalendarExport(trip);
    assert.deepEqual(trip, before);
    assert.equal(result.items.filter(x => x.sourceKey === 'booking:stay-tokyo-first').length, 1);
    assert.deepEqual(result.items.find(x => x.sourceKey === 'booking:stay-tokyo-first')?.payload.end, { date: '2026-08-31' });
    assert.equal(result.items.filter(x => x.sourceKey === 'booking:transport-tokyo-kyoto').length, 1);
    assert.equal(new Set(result.items.map(x => x.sourceKey)).size, result.items.length);
    assert(result.items.some(x => x.sourceKey === 'activity:market'));
});
test("only real dates are exported; uncertain clock times and estimates are honest date-only events", () => {
    const trip = representativeTrip();
    const result = projectCalendarExport(trip);
    const dinner = result.items.find(x => x.sourceKey === 'activity:dinner')!;
    assert.deepEqual(dinner.payload.start, { date: '2026-09-01' });
    assert.match(dinner.payload.summary, /Time not set/);
    const arrival = result.items.find(x => x.sourceKey === 'transfer:arrival-tokyo-first')!;
    assert.equal(arrival.qualification, 'planning-estimate');
    assert.equal(arrival.payload.status, 'tentative');
    assert.equal(arrival.payload.transparency, 'transparent');
    trip.planItems.find(x => x.id === 'tokyo-day-2')!.date = '';
    const undated = projectCalendarExport(trip);
    assert(!undated.items.some(x => x.sourceKey === 'activity:market'));
    assert(undated.membershipKeys.includes('activity:market'));
    assert(undated.excluded.some(x => x.sourceKey === 'activity:market'));
});
test("private material and unscheduled ideas never leak into export", () => {
    const trip = representativeTrip();
    trip.brief.bookings![0]!.confirmation = 'SECRET-ABC';
    trip.brief.bookings![0]!.notes = ['PRIVATE'];
    trip.brief.bookings![0]!.url = 'https://example.com/manage/SECRET';
    trip.brief.itineraryIdeas!.push({ ...trip.brief.itineraryIdeas![0]!, id: 'unscheduled', dayId: undefined } as any);
    const result = projectCalendarExport(trip), json = JSON.stringify(result.items);
    assert.doesNotMatch(json, /SECRET|PRIVATE|confirmation|bookingUrl|sourceUrl/);
    assert(!result.items.some(x => x.sourceKey === 'activity:unscheduled'));
    assert(result.items.every(x => x.payload.visibility === 'private' && !('attendees' in x.payload)));
});
test("invalid and missing stay intervals are excluded, not inferred from stop nights", () => {
    const trip = representativeTrip();
    trip.brief.bookings![0]!.endDate = null;
    const r = projectCalendarExport(trip);
    assert(!r.items.some(x => x.sourceKey === 'booking:stay-tokyo-first'));
    assert(r.excluded.some(x => x.sourceKey === 'booking:stay-tokyo-first'));
    trip.brief.bookings![0]!.endDate = '2026-08-28';
    assert(projectCalendarExport(trip).blocked.some(x => x.sourceKey === 'booking:stay-tokyo-first'));
});
test("date math validates real dates and crosses month/leap boundaries without local timezone drift", () => {
    assert.equal(validCalendarDate('2026-02-30'), false);
    assert.equal(validCalendarDate('2028-02-29'), true);
    const trip = representativeTrip();
    trip.planItems.find(x => x.id === 'tokyo-day-2')!.date = '2028-02-29';
    assert.deepEqual(projectCalendarExport(trip).items.find(x => x.sourceKey === 'activity:market')?.payload.end, { date: '2028-03-01' });
});
test("canonical payload hashes ignore key ordering but change with content", () => {
    assert.equal(calendarExportPayloadHash({ b: 2, a: 1 } as any), calendarExportPayloadHash({ a: 1, b: 2 } as any));
    assert.notEqual(calendarExportPayloadHash({ a: 1 } as any), calendarExportPayloadHash({ a: 2 } as any));
});
test('repeated routes never collapse by display-only booking title or endpoint matching', () => { const trip = representativeTrip(); trip.legs.push({ ...structuredClone(trip.legs[1]!), id: 'another-occurrence' }); const r = projectCalendarExport(trip); const booked = r.items.find(x => x.sourceKey === 'booking:transport-tokyo-kyoto')!; assert.deepEqual(booked.aliases, ['transfer:tokyo-kyoto']); assert(r.items.some(x => x.sourceKey === 'transfer:another-occurrence')); });
test('export links point to the authenticated trip route and contain no share or booking credentials', () => { const trip = representativeTrip(); const r = projectCalendarExport(trip, 'https://morrovia.com'); assert(r.items.every(i => i.payload.description.includes('https://morrovia.com/journey/calendar-trip/itinerary'))); assert.doesNotMatch(JSON.stringify(r.items), /shareToken|confirmation|SECRET/); });
