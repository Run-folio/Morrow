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
