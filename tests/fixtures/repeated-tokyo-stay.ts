import assert from 'node:assert/strict';
import {tripFromBuilder} from '../../lib/easyt/trip.ts';
import {selectedTransferPlace} from './accepted-transfer-place.ts';
import {stopGeographicPlace} from '../../lib/easyt/geographic-binding.ts';
import {requireReadableTripDocument} from '../../lib/easyt/trip-document.ts';
import {markTransportLegBooked} from '../../lib/easyt/transport-booking.ts';
import {builderDocumentFingerprint} from '../../lib/easyt/trip-builder-document-commit.ts';
import {builderPlaceCommand,prepareBuilderHandlerEdit} from '../../lib/easyt/trip-builder-handler-contract.ts';

export function repeatedTokyoTrip(returnToStart=true){
 const origin=selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint');
 const places=[['tokyo','Tokyo','1850147'],['kyoto','Kyoto','1857910'],['hiroshima','Hiroshima','1862415']].map(([id,name,key])=>({id,...selectedTransferPlace(name,'Japan',`reference:geonames:${key}`,'stop')}));
 let trip=requireReadableTripDocument(tripFromBuilder({id:'synthetic-repeated-tokyo',origin:origin.name,originCountry:origin.country,originCanonicalPlaceId:origin.canonicalPlaceId,originProviderId:origin.providerId,originCoordinates:origin.coordinates,
  routeIntent:{version:1,origin,tripType:'one_way',journeyEnd:{mode:'unknown'},destinations:[],orderAuthority:'manual',explicitIntentIds:null,orderedStopIds:[],projectionInputKey:null},journeyEnd:{mode:'unknown'},
  stops:places.map(place=>({...place,country:place.country!})),startDate:'2026-12-10',endDate:'2026-12-19',picks:{},mustDo:'Synthetic repeated stay regression',pace:'slow',hotels:'few',budget:'mid',draft:[],nightAllocations:{tokyo:4,kyoto:3,hiroshima:2}}));
 trip.brief.bookings=[];trip.brief.scheduleLocks={stopIds:[],arrivalDates:{}};trip.brief.intent.hardConstraints.fixedCommitments=[];
 if(returnToStart){const back=prepareBuilderHandlerEdit(trip,{kind:'type',tripType:'return_to_start'},builderDocumentFingerprint(trip));assert.ok(back.ok);if(back.ok)trip=back.trip;}
 const first=trip.stops[0]!;
 const added=prepareBuilderHandlerEdit(trip,builderPlaceCommand(trip,{stopId:'tokyo-return-stay',place:stopGeographicPlace(first),requestedNights:0})!,builderDocumentFingerprint(trip));
 assert.ok(added.ok);if(!added.ok)throw Error('fixture addition');trip=added.trip;
 const flight=trip.legs.find(l=>l.toStopId===first.id)!;flight.mode='flight';
 const booked=markTransportLegBooked(trip,flight.id,{confirmation:'SYNTHETIC-OUTBOUND-KEEP'});
 // This resting saved-trip fixture has no outstanding worker job. Booking is
 // seeded directly, rather than pretending an earlier projection ACK is current.
 if(booked.brief.cascadeStatus)delete booked.brief.cascadeStatus.routeReconciliation;
 return requireReadableTripDocument(JSON.parse(JSON.stringify(booked)));
}
