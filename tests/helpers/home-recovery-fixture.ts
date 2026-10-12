import assert from 'node:assert/strict';
import {selectedStopsHomepageInput} from '../fixtures/homepage-dual-entry.ts';
import {projectHomepageInput,homepageReceiptForProjection,homepageHandoffMatchesTrip,HOME_TRIP_DRAFT_KEY,type HomeTripDraft} from '../../lib/easyt/home-trip-handoff.ts';
import {tripFromBuilder,defaultTripIntent} from '../../lib/easyt/trip.ts';
import {homepageInputStorageKey} from '../../lib/easyt/private-browser-context.ts';
import {prepareTripDocumentForWrite} from '../../lib/easyt/trip-document.ts';

/** Public catalogue and planner only. No providers, auth, browser or live data. */
export function homeRecoveryFixture(ownerId:string|null=null) {
  const snapshot=selectedStopsHomepageInput(ownerId);
  snapshot.dates={state:'selected',value:{start:'2026-10-15',end:'2026-10-21'}};
  const projected=projectHomepageInput({snapshot,profile:null,handoffId:'home-fixture'});assert.equal(projected.ok,true);
  if(!projected.ok)throw new Error('Synthetic projection expected');
  const completed=homepageReceiptForProjection(snapshot,projected.draft,'synthetic-home-trip');
  const draft:HomeTripDraft=JSON.parse(JSON.stringify({...projected.draft,homepage:{...projected.draft.homepage!,receipt:completed}}));
  const stops=draft.destinations??[];
  const trip=prepareTripDocumentForWrite({...tripFromBuilder({id:completed.tripId,origin:draft.origin??'',originCanonicalPlaceId:draft.originCanonicalPlaceId,
    originCountry:draft.originCountry,originProviderId:draft.originProviderId,originCoordinates:draft.originCoordinates,journeyEnd:draft.journeyEnd,routeIntent:draft.routeIntent,
    stops,startDate:draft.startDate!,endDate:draft.endDate!,picks:{},mustDo:draft.brief??'',pace:'slow',hotels:'few',budget:draft.budget??'mid',draft:[],
    intent:{...defaultTripIntent({travellers:draft.travellers,durationDays:7,stopIds:stops.map(stop=>stop.id),journeyEnd:draft.journeyEnd}),
      preferences:{...defaultTripIntent().preferences,interests:draft.interests??[]}},structuredBrief:draft.structuredBrief,decisionSelections:draft.decisionSelections}),ownerId});
  assert.equal(homepageHandoffMatchesTrip(draft,trip),true);
  return {snapshot,draft,trip,intake:{completed,draft,fromHomepage:true},native:[
    [homepageInputStorageKey(ownerId),JSON.stringify({snapshot,receipt:completed})],
    [HOME_TRIP_DRAFT_KEY,JSON.stringify(draft)],
  ] as Array<[string,string]>};
}
