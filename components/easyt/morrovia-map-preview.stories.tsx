import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { JourneyPlannerMap } from '@/components/journey-planner-map';
import type { JourneyStop } from '@/lib/journey';
import { mapRouteLegsFromTrip } from '@/lib/easyt/map-spatial-context';
import { itineraryDayMapContext } from '@/lib/easyt/itinerary-day-context';
import { itineraryWorkspaceHref, mapWorkspaceHref, stayWorkspaceHref, tripWorkspaceHref } from '@/lib/easyt/trip-workspace-links';
import { tourTripFixture } from './storybook/tour-trip.fixture';
import { MorroviaMapPreview } from './morrovia-map-preview';
import { DeferredJourneyPlannerMap } from './deferred-journey-planner-map';

function PreviewStory({context,deferred=false}: {context:'journey'|'stay'|'day'|'empty';deferred?:boolean}) {
  const [selected,setSelected] = useState('');
  const trip=tourTripFixture;
  const stops: JourneyStop[]=trip.stops.map(stop=>({id:stop.id,city:stop.name,country:stop.country,date:'',coordinates:[stop.longitude!,stop.latitude!],theme:'city',marker:'town',description:'',highlights:[],aiPrompt:''}));
  const dayContext=itineraryDayMapContext(trip,trip.planItems[1],null);
  const returnTo=context==='stay'?stayWorkspaceHref(trip.id,'cusco'):context==='day'?itineraryWorkspaceHref(trip.id,2):tripWorkspaceHref(trip.id);
  const MapContent=deferred?DeferredJourneyPlannerMap:JourneyPlannerMap;
  return <MorroviaMapPreview wholePreviewLink={context==='journey'} title={context==='stay'?'Stay map':context==='day'?'Day map':'Journey map'} size={context==='journey'?'large':'standard'} href={mapWorkspaceHref(trip.id,context==='journey'?null:'cusco',context==='stay'?'stay':'plan',context==='day'?2:null,null,null,returnTo)}>
   {context==='empty'?undefined:<MapContent stops={context==='journey'?stops:dayContext.stops} legs={context==='journey'?mapRouteLegsFromTrip(trip):dayContext.legs} selectedId={selected} plannerPins={dayContext.pins} focusCoordinates={context==='journey'?null:dayContext.focusCoordinates} draftPinCoordinates={null} pinPlacementMode={false} overviewMode={context==='journey'} surface={context==='journey'?{variant:'preview'}:{variant:'embedded',interaction:'selection-only'}} onMapPinDrop={()=>{}} onPlannerPinSelect={()=>{}} onSelect={setSelected} />}
  </MorroviaMapPreview>;
}
const meta={title:'Morrovia/05 Product Patterns/Map preview',component:PreviewStory,args:{context:'journey'},decorators:[(Story)=><main className="morrovia-editorial-page"><Story /></main>],parameters:{layout:'padded'}} satisfies Meta<typeof PreviewStory>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Journey: Story={};
export const Stay: Story={args:{context:'stay'}};
export const Day: Story={args:{context:'day'}};
export const Empty: Story={args:{context:'empty'}};
export const DeferredJourney: Story={args:{context:'journey',deferred:true}};
