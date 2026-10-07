import type {Meta,StoryObj} from '@storybook/nextjs-vite';
import {useState} from 'react';
import {TripBuilderRouteProposal} from './trip-builder-route-proposal';
import {EasyTButton} from '@/components/easyt/easyt-controls';
import {canonicalRouteFixture} from '../../../tests/fixtures/batch14-route-documents';
import {requireReadableTripDocument} from '@/lib/easyt/trip-document';
import {createBuilderOptimizationProposal} from '@/lib/easyt/trip-builder-route-proposal';
const meta={title:'Morrovia/05 Product Patterns/Builder route proposal',parameters:{layout:'padded'}} satisfies Meta;
export default meta;type Story=StoryObj<typeof meta>;
function Proposal({stale=false,es=false,repeated=false}:{stale?:boolean;es?:boolean;repeated?:boolean}){
 const [open,setOpen]=useState(false);const trip=requireReadableTripDocument(canonicalRouteFixture());trip.brief.bookings=[];
 if(repeated){Object.assign(trip.stops[2]!,{name:'Tokyo',canonicalPlaceId:trip.stops[0]!.canonicalPlaceId,longitude:trip.stops[0]!.longitude,latitude:trip.stops[0]!.latitude});Object.assign(trip.brief.intent.route.destinations[2]!,{sourceText:'Tokyo',selectedPlace:structuredClone(trip.brief.intent.route.destinations[0]!.selectedPlace)})}
 const result=createBuilderOptimizationProposal(trip,{ownerId:trip.ownerId,tripId:trip.id,inputRevision:0},['tokyo','hiroshima','kyoto'],'story');
 return <main className="morrovia-editorial-page"><EasyTButton onClick={()=>setOpen(true)}>{es?'Actualizar ruta':'Update route'}</EasyTButton><TripBuilderRouteProposal current={trip} proposal={open&&result.kind==='proposal'?result.proposal:null} language={es?'es':'en'} stale={stale} onKeep={()=>setOpen(false)} onAccept={()=>setOpen(false)}/></main>;
}
export const ProposedOrder:Story={render:()=> <Proposal/>};
export const NewerEdit:Story={render:()=> <Proposal stale/>};
export const RepeatedStopsSpanish:Story={render:()=> <Proposal es repeated/>,parameters:{viewport:{defaultViewport:'mobile1'}}};
