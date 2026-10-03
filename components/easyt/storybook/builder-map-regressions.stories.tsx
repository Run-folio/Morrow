import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import builderStyles from '@/app/journey/new/trip-builder.module.css';
import { TripBuilderRouteWorkspace } from '@/app/journey/new/trip-builder-route-workspace';
import { tourTripFixture } from './tour-trip.fixture';
import type { EasyTTrip, TripLeg } from '@/lib/easyt/trip';

type Route = 'japan-korea' | 'peru';
const routeStops: Record<Route, Array<[string, string, number, number, number]>> = {
  'japan-korea': [['Tokyo','Japan',139.6917,35.6895,3],['Kanazawa','Japan',136.6562,36.5613,2],['Takayama','Japan',137.2522,36.1461,2],['Kyoto','Japan',135.7681,35.0116,4],['Osaka','Japan',135.5023,34.6937,2],['Seoul','South Korea',126.978,37.5665,3],['Busan','South Korea',129.0756,35.1796,2]],
  peru: [['Lima','Peru',-77.0428,-12.0464,2],['Cusco','Peru',-71.967,-13.532,1],['Aguas Calientes','Peru',-72.525,-13.154,1],['Cusco','Peru',-71.967,-13.532,4],['Arequipa','Peru',-71.536,-16.398,2],['Chivay','Peru',-71.604,-15.638,1],['Arequipa','Peru',-71.536,-16.398,3]],
};
export function regressionTrip(route: Route): EasyTTrip {
  const stops = routeStops[route].map(([name,country,longitude,latitude,nights],order)=>({id:`${route}-${order}`, name,country,longitude,latitude,nights,order,arrivalDate:null,departureDate:null}));
  const modes: TripLeg['mode'][] = route === 'peru' ? ['unknown','road','road','unknown','road','road'] : ['train','train','train','train','flight','train'];
  const legs = stops.slice(1).map((stop,index): TripLeg=>({id:`${route}-leg-${index}`, fromStopId:stops[index].id,toStopId:stop.id,mode:modes[index],distanceKm:modes[index]==='unknown'?null:289,durationMinutes:modes[index]==='unknown'?null:195,doorToDoorMinutes:modes[index]==='unknown'?null:225,headlineMinutes:modes[index]==='unknown'?null:195,provider:'Planning estimate',confidence:'medium',provenance:'planning_estimate',scheduleNeedsChecking:true,routeMetadata:{planningEstimate:true}}));
  return {...tourTripFixture,id:`regression-${route}`,stops,legs,planItems:[],brief:{...tourTripFixture.brief,bookings:[],itineraryIdeas:[],mapPins:[]}};
}
function MapRegression({route}: {route: Route}) {
 const [trip,setTrip] = useState(()=>regressionTrip(route));
 const [selected,setSelected]=useState(trip.stops[0].id);
 const allocated=trip.stops.reduce((sum,stop)=>sum+(stop.nights??0),0);
 return <div className={builderStyles.shellWide}><TripBuilderRouteWorkspace canonicalTrip={trip} previewStopIds={null} selectedStopId={selected} lockedStopIds={[]} fixedOrder={false} routeCheckProposalStopIds={null} nightStatus={{total:route==='peru'?14:18,allocated,complete:true,language:'en'}} onSelectStop={setSelected} onPreviewOrder={()=>{}} onCommitOrder={()=>false} onEditNights={(id,nights)=>setTrip(current=>({...current,stops:current.stops.map(stop=>stop.id===id?{...stop,nights}:stop)}))} onRemoveStop={()=>{}} onTransportChoiceChange={()=>{}} /></div>;
}
const meta = {title:'Morrovia/05 Product Patterns/Builder map regressions',component:MapRegression,args:{route:'japan-korea'},decorators:[(Story)=><main className="morrovia-editorial-page"><Story /></main>],parameters:{layout:'fullscreen'}} satisfies Meta<typeof MapRegression>;
export default meta;
type Story = StoryObj<typeof meta>;
export const JapanKorea: Story = {};
export const RepeatedPeru: Story = {args:{route:'peru'}};
