import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument,prepareTripDocumentForWrite} from '../lib/easyt/trip-document.ts';
import {prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {itineraryCalendarDays} from '../lib/easyt/itinerary-calendar.ts';
import {homepageSearchDateIssue} from '../lib/easyt/search-dates.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
if (process.env.MORROVIA_CALENDAR_DATE_CHILD === '1') test('past Search is rejected independently of historical calendar date edit and reload across DST',()=>{
 const fixture=requireReadableTripDocument(canonicalRouteFixture());
 const before=structuredClone(fixture);
 const historic=fixture.planItems.find(x=>x.date)!;
 historic.bookingUrl='https://example.invalid/retained';
 const held=structuredClone(fixture);
 const start='2026-10-29',end='2026-11-07';
 assert.equal(homepageSearchDateIssue({...emptyHomepageInput(),dates:{state:'selected',value:{start,end}}},{},new Date('2026-11-09T00:30:00Z')),'past');
 const edit=prepareBuilderHandlerEdit(fixture,{kind:'dates',startDate:start,endDate:end},builderDocumentFingerprint(fixture));
 assert.ok(edit.ok,JSON.stringify(edit));
 const reopened=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(edit.trip))));
 const dates=Array.from({length:10},(_,i)=>new Date(Date.UTC(2026,9,29+i)).toISOString().slice(0,10));
 assert.deepEqual(itineraryCalendarDays(reopened).map(d=>d.day.date),dates);
 assert.ok(reopened.brief.retainedAuthoredContent?.entries.some(e=>e.days.some(d=>d.sourceDay.bookingUrl===historic.bookingUrl)));
 assert.deepEqual(fixture,held); assert.equal(before.planItems.find(d=>d.id===historic.id)?.bookingUrl,null);
});
else test('historical calendar dates survive edit and reopen on either side of UTC', () => {
 for (const TZ of ['America/New_York','Asia/Tokyo','Pacific/Kiritimati']) {
  const result=spawnSync(process.execPath,['--test',fileURLToPath(import.meta.url)],{encoding:'utf8',env:{...process.env,TZ,MORROVIA_CALENDAR_DATE_CHILD:'1'}});
  assert.equal(result.status,0,TZ+'\n'+result.stdout+result.stderr);
 }
});
