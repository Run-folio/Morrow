import type {Meta,StoryObj} from '@storybook/nextjs-vite';
import {useState} from 'react';
import {CanonicalPlaceAutocomplete} from './canonical-place-autocomplete';
import {REFERENCE_SNAPSHOT_ID} from '@/lib/easyt/place-reference';
const meta={title:'Morrovia/02 Controls/Canonical place choices',component:CanonicalPlaceAutocomplete,parameters:{layout:'padded'},args:{label:'Start from',placeholder:'City or airport',value:'LHR',onChange:()=>{},onSelect:()=>{},revealSuggestionsKey:1,menuPlacement:'inline',includeNonRoutable:true},render:function Scene(args){const [value,setValue]=useState(args.value);return <div className="morrovia-editorial-page"><CanonicalPlaceAutocomplete {...args} value={value} onChange={setValue}/></div>;}} satisfies Meta<typeof CanonicalPlaceAutocomplete>;
export default meta;
type Story=StoryObj<typeof meta>;
// Thin fixture from the pinned OurAirports record; no world dataset enters Storybook.
const airport={canonicalPlaceId:'reference:ourairports:2434',name:'London Heathrow Airport',country:'United Kingdom',placeType:'transport_gateway',routability:'direct_destination',coordinates:[-0.459909,51.470748],providerId:`reference:ourairports:2434@${REFERENCE_SNAPSHOT_ID}:GB:transport_gateway:-0.459909:51.470748`,providerSourceLabel:'OurAirports',matchedAirportCode:'LHR',referenceSnapshotId:REFERENCE_SNAPSHOT_ID};
const localFixture=async()=>{const original=globalThis.fetch;globalThis.fetch=(async(input,init)=>String(input).startsWith('/api/journey-geocode?')?new Response(JSON.stringify({candidates:[airport]}),{headers:{'Content-Type':'application/json'}}):original(input,init)) as typeof fetch;return ()=>{globalThis.fetch=original;};};
export const AirportCode:Story={beforeEach:localFixture};
export const MetropolitanCity:Story={args:{value:'NYC'},beforeEach:async()=>{const original=globalThis.fetch;globalThis.fetch=(async(input,init)=>String(input).startsWith('/api/journey-geocode?')?new Response('{"candidates":[]}'):original(input,init)) as typeof fetch;return ()=>{globalThis.fetch=original;};}};
export const AirportMobile:Story={...AirportCode,globals:{viewport:{value:'morrovia390',isRotated:false}}};

const nonscheduled={canonicalPlaceId:'reference:ourairports:24',name:'Miramar Airport',country:'Argentina',placeType:'transport_gateway',routability:'direct_destination',coordinates:[-57.8697,-38.2271],providerId:`reference:ourairports:24@${REFERENCE_SNAPSHOT_ID}:AR:transport_gateway:-57.8697:-38.2271`,providerSourceLabel:'OurAirports',matchedAirportCode:'MJR',referenceSnapshotId:REFERENCE_SNAPSHOT_ID,scheduledService:false};
const nonscheduledFixture=async()=>{const original=globalThis.fetch;globalThis.fetch=(async(input,init)=>String(input).startsWith('/api/journey-geocode?')?new Response(JSON.stringify({candidates:[nonscheduled]}),{headers:{'Content-Type':'application/json'}}):original(input,init)) as typeof fetch;return ()=>{globalThis.fetch=original;};};
export const NonScheduledAirport:Story={args:{value:'MJR'},beforeEach:nonscheduledFixture};
export const NonScheduledAirportSpanish:Story={...NonScheduledAirport,args:{value:'MJR',language:'es'}};
export const NonScheduledAirportMobile:Story={...NonScheduledAirport,globals:{viewport:{value:'morrovia390',isRotated:false}}};

export const BroadPlanningArea:Story={...MetropolitanCity,args:{value:'Europe',label:'Destination',placeholder:'City, country or region',includeNonRoutable:true}};
const sameNamePoints:[string,[number,number]][]=[['1790630',[108.92861,34.25833]],['1790631',[111.05,28.46667]],['1790633',[112.28844,24.92056]],['2053185',[122.23481,40.92265]],['8527333',[129.60862,44.57568]]];
export const SameCountryNamesakes:Story={args:{value:'Xi’an',label:'Destination'},beforeEach:async()=>{
 const original=globalThis.fetch;
 const candidates=sameNamePoints.map(([id,coordinates])=>({canonicalPlaceId:`reference:geonames:${id}`,providerId:`reference:geonames:${id}@${REFERENCE_SNAPSHOT_ID}:CN:city:${coordinates.join(':')}`,referenceSnapshotId:REFERENCE_SNAPSHOT_ID,name:'Xi’an',country:'China',placeType:'city',routability:'direct_destination',coordinates}));
 globalThis.fetch=(async(input,init)=>String(input).startsWith('/api/journey-geocode?')?new Response(JSON.stringify({candidates})):original(input,init)) as typeof fetch;
 return ()=>{globalThis.fetch=original;};
}};
export const SameCountryNamesakesMobile:Story={...SameCountryNamesakes,globals:{viewport:{value:'morrovia390',isRotated:false}}};
export const VerifiedCityIdentity:Story={args:{value:'Manila',label:'Destination'},beforeEach:async()=>{
 const original=globalThis.fetch;
 const candidate={canonicalPlaceId:'reference:geonames:1701668',providerId:`reference:geonames:1701668@${REFERENCE_SNAPSHOT_ID}:PH:city:120.9822:14.6042`,referenceSnapshotId:REFERENCE_SNAPSHOT_ID,name:'Manila',country:'Philippines',placeType:'city',routability:'direct_destination',coordinates:[120.9822,14.6042]};
 globalThis.fetch=(async(input,init)=>String(input).startsWith('/api/journey-geocode?')?new Response(JSON.stringify({candidates:[candidate]})):original(input,init)) as typeof fetch;
 return ()=>{globalThis.fetch=original;};
}};
