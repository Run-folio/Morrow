import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { MorroviaMapPreview } from './morrovia-map-preview';
import { JourneyPlannerMap } from '../journey-planner-map';
import { EasyTButton } from './easyt-controls';
import { MorroviaRecoveryFeedback } from './morrovia-feedback';
import { builderHydrationFeedback } from '@/lib/easyt/builder-hydration-feedback';
import TripBuilder from '@/app/journey/new/trip-builder';
import type { JourneyStop } from '@/lib/journey';
const stops: JourneyStop[] = [
 {id:'synthetic-tokyo',city:'Tokyo',country:'Japan',date:'',coordinates:[139.6917,35.6895],theme:'city',marker:'town',description:'',highlights:[],aiPrompt:''},
 {id:'synthetic-kyoto',city:'Kyoto',country:'Japan',date:'',coordinates:[135.7681,35.0116],theme:'city',marker:'town',description:'',highlights:[],aiPrompt:''},
];
function RendererRig() {
 const [visible,setVisible]=useState(true),[selected,setSelected]=useState(stops[0].id),[nights,setNights]=useState(3),[selections,setSelections]=useState(0);
 return <main className="morrovia-editorial-page">
  <EasyTButton onClick={()=>setVisible(value=>!value)}>{visible?'Hide map':'Show map'}</EasyTButton>
  <EasyTButton onClick={()=>setNights(value=>value+1)}>Add a night</EasyTButton><p role="status">{nights} nights · {selected} · {selections} selections</p>
  <MorroviaMapPreview title="Synthetic route" href="#" size="large">{visible?<JourneyPlannerMap overviewMode surface={{variant:'workspace'}} stops={stops} legs={[]} selectedId={selected} plannerPins={[]} focusCoordinates={null} draftPinCoordinates={null} pinPlacementMode={false} onMapPinDrop={()=>{}} onPlannerPinSelect={()=>{}} onSelect={id=>{setSelected(id);setSelections(count=>count+1);}}/>:null}</MorroviaMapPreview>
 </main>;
}
const meta={title:'Morrovia/05 Product Patterns/Map renderer fallback',component:RendererRig,parameters:{layout:'fullscreen',nextjs:{appDirectory:true,navigation:{pathname:'/journey/new'}}}} satisfies Meta<typeof RendererRig>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Renderer: Story={};
export const BuilderEntry: Story={render:()=> <main className="morrovia-editorial-page"><TripBuilder /></main>};
export const StorageUnavailable: Story={render:()=> <MorroviaRecoveryFeedback {...builderHydrationFeedback('unavailable','en')}/>};
export const ProtectedCopies: Story={render:()=> <MorroviaRecoveryFeedback {...builderHydrationFeedback('protected','en')}/>};
