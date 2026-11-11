import {legacyItineraryIdeas} from '@/lib/easyt/trip';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import TripTodayWorkspace from './trip-today-workspace';
import { fixtureTrip } from './storybook/trip-today.fixture';
const now=new Date('2026-11-10T06:00:00Z');
const activeTrip=fixtureTrip();activeTrip.stops.push({...activeTrip.stops[0],id:'kyoto',name:'Kyoto',order:1,arrivalDate:'2026-11-12',departureDate:'2026-11-13'});activeTrip.planItems.push({...activeTrip.planItems[1],id:'d3',stopId:'kyoto',dayNumber:3,date:'2026-11-12'});activeTrip.legs.push({id:'tokyo-kyoto',fromStopId:'tokyo',toStopId:'kyoto',mode:'train',distanceKm:450,durationMinutes:150,provider:null,routeMetadata:{},scheduleNeedsChecking:true});
const meta={title:'Morrovia/05 Product Patterns/Today',component:TripTodayWorkspace,args:{trip:activeTrip,now},parameters:{layout:'padded'}} satisfies Meta<typeof TripTodayWorkspace>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Active:Story={};
export const Mobile320:Story={globals:{viewport:{value:'morrovia320',isRotated:false}}};
export const Mobile390:Story={globals:{viewport:{value:'morrovia390',isRotated:false}}};
export const Mobile430:Story={globals:{viewport:{value:'morrovia430',isRotated:false}}};
export const BookedStay:Story={args:{trip:{...fixtureTrip(),brief:{...fixtureTrip().brief,bookings:[{...fixtureTrip().brief.bookings![0],confirmation:'EXAMPLE'}]}}}};
export const EmptyDay:Story={args:{now:new Date('2026-11-11T06:00:00Z')}};
export const NoActiveTrip:Story={args:{trip:null}};
export const OutsideTrip:Story={args:{now:new Date('2026-12-01T06:00:00Z')}};
export const MissingDates:Story={args:{trip:{...fixtureTrip(),startDate:'',endDate:''}}};
export const UnknownTimezone:Story={args:{trip:{...fixtureTrip(),stops:fixtureTrip().stops.map(s=>({...s,name:'Springfield',country:'United States'}))}}};
export const Preview:Story={args:{now:new Date('2026-12-01T06:00:00Z'),previewDayId:'d1'}};
const overnight=fixtureTrip();overnight.brief.bookings=[];overnight.stops.push({...overnight.stops[0],id:'kyoto',name:'Kyoto',order:1,arrivalDate:'2026-11-11',departureDate:'2026-11-12'});overnight.legs.push({id:'night',fromStopId:'tokyo',toStopId:'kyoto',mode:'train',distanceKm:450,durationMinutes:600,provider:null,routeMetadata:{}});overnight.brief.bookings.push({id:'transport-night',type:'transport',title:'Night train',date:'2026-11-09',endDate:'2026-11-11',confirmation:'EXAMPLE',url:null,transportDetails:{mode:'train',from:'Tokyo',to:'Kyoto'}});
export const OvernightTransport:Story={args:{trip:overnight}};
export const SpanishMobile:Story={args:{language:'es'},globals:{viewport:{value:'morrovia390',isRotated:false}}};
export const LiveClock:Story={args:{now:undefined}};

export const NoItinerary:Story={args:{trip:{...fixtureTrip(),planItems:[]}}};

const fullDay=fixtureTrip();fullDay.brief.itineraryIdeas=[{...legacyItineraryIdeas(fullDay.brief.itineraryIdeas)[0],startsAt:'09:00',providerMetadata:{duration:{fixedMinutes:540},provenance:{kind:'live_provider_search',provider:'viator',checkedAt:'2026-11-10T00:00:00Z'}}}];
export const FullDayWithStartTime:Story={args:{trip:fullDay}};

export const Tablet768:Story={globals:{viewport:{value:'morrovia768',isRotated:false}}};
export const PreviewMobile:Story={...Preview,globals:{viewport:{value:'morrovia390',isRotated:false}}};
const noPhoto=fixtureTrip();noPhoto.stops[0]={...noPhoto.stops[0],name:'Springfield',country:'United States'};
export const MissingDestinationPhoto:Story={args:{trip:noPhoto,previewDayId:'d1'},globals:{viewport:{value:'morrovia390',isRotated:false}}};
const longContent=fixtureTrip();longContent.brief.bookings![0].title='Keio Plaza Hotel Tokyo · Shinjuku Premier Grand';longContent.stops.push({...longContent.stops[0],id:'next-stop',name:'Takayama and the Japanese Alps',order:1,arrivalDate:'2026-11-12',departureDate:'2026-11-13'});longContent.legs.push({id:'long-transfer',fromStopId:'tokyo',toStopId:'next-stop',mode:'train',distanceKm:450,durationMinutes:270,provider:null,routeMetadata:{},scheduleNeedsChecking:true});
export const LongContentMobile:Story={args:{trip:longContent},globals:{viewport:{value:'morrovia390',isRotated:false}}};
