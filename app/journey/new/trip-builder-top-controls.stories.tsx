import type {Meta,StoryObj} from '@storybook/nextjs-vite';
import {useState} from 'react';
import {TripBuilderTopControls} from './trip-builder-top-controls';
import {MorroviaSaveStatus,MorroviaStatusBanner} from '@/components/easyt/morrovia-feedback';
import {EasyTButton} from '@/components/easyt/easyt-controls';
import {canonicalRouteFixture} from '../../../tests/fixtures/batch14-route-documents';
import {requireReadableTripDocument} from '@/lib/easyt/trip-document';
import {createBuilderInputDraft,updateBuilderInputDraft} from '@/lib/easyt/trip-builder-input-draft';
import {prepareAcceptedBuilderEdit} from '@/lib/easyt/trip-builder-edit';
import {builderDocumentFingerprint} from '@/lib/easyt/trip-builder-document-commit';
const meta={title:'Morrovia/05 Product Patterns/Builder top controls',parameters:{layout:'padded'}} satisfies Meta;
export default meta;type Story=StoryObj<typeof meta>;
function Controls({es=false,type='return_to_start',provisional=false,area=false,raw=false,lookupFailed=false,datesSuggested=false,outcome,state='device'}:{es?:boolean;type?:'return_to_start'|'one_way'|'unknown_legacy';provisional?:boolean;area?:boolean;raw?:boolean;lookupFailed?:boolean;datesSuggested?:boolean;outcome?:'none'|'unavailable';state?:'device'|'saved'|'error'}){
 const [trip,setTrip]=useState(()=>{const t=requireReadableTripDocument(canonicalRouteFixture());t.brief.intent.route.tripType=type;t.brief.intent.route.journeyEnd=type==='return_to_start'?{mode:'same_as_start'}:{mode:'unknown'};t.brief.journeyEnd=t.brief.intent.route.journeyEnd;if(provisional)t.brief.intent.route.destinations[1]!.resolution='unavailable';if(area){const [a,b,c]=t.brief.intent.route.destinations;t.brief.intent.route.destinations=[{...a!,kind:'planning_area',sourceText:'Japan',selectedPlace:{name:'Japan',country:'Japan',canonicalPlaceId:'country:japan'},stopIds:[...a!.stopIds,...b!.stopIds]},c!]};return t});
 const [draft,setDraft]=useState(()=>{const d=createBuilderInputDraft(trip);return raw?updateBuilderInputDraft(d,trip,{kind:'origin'},'Hong Kong part'):d});
 const accept=(edit:Parameters<typeof prepareAcceptedBuilderEdit>[1])=>{const result=prepareAcceptedBuilderEdit(trip,edit,builderDocumentFingerprint(trip));if(result.ok)setTrip(result.trip)};
 return <main className="morrovia-editorial-page"><MorroviaSaveStatus state={state}/><TripBuilderTopControls trip={trip} draft={draft} language={es?'es':'en'}
 onType={type=>accept({kind:'type',tripType:type})} onOriginInput={raw=>setDraft(updateBuilderInputDraft(draft,trip,{kind:'origin'},raw))} onOriginSelect={()=>{}} onOriginClear={()=>accept({kind:'origin',place:null})}
 onDateInput={(field,raw)=>setDraft(updateBuilderInputDraft(draft,trip,{kind:'date',field},raw))} onDates={(startDate,endDate)=>accept({kind:'dates',startDate,endDate})} onTravellers={travellers=>accept({kind:'travellers',travellers})} onBudget={budget=>accept({kind:'budget',budget})}
 onAdd={()=>{}} onEditIntent={()=>true} onRemoveIntent={()=>{}} onRemoveStop={()=>{}} onIntentInput={(intentId,raw)=>setDraft(updateBuilderInputDraft(draft,trip,{kind:'destination',intentId},raw))} onIntentSelect={()=>false}
 onReorder={stopIds=>{const result=prepareAcceptedBuilderEdit(trip,{kind:'order',stopIds:[...stopIds],source:'drag'},builderDocumentFingerprint(trip));if(result.ok)setTrip(result.trip);return result.ok}}
 destinationReview={lookupFailed?<div><span role="status">{es?"No pudimos comprobar Kyoto.":"Couldn't check Kyoto."}</span><EasyTButton variant="quiet" size="small">{es?"Intentar de nuevo Kyoto":"Try again Kyoto"}</EasyTButton></div>:undefined}
 dateReview={datesSuggested?<div><p>{es?"Solo has elegido la fecha de inicio. La fecha final y la duración son una sugerencia.":"Only your start date is set. The end date and length are suggestions."}</p><EasyTButton variant="secondary">{es?"Aceptar fechas sugeridas":"Accept suggested dates"}</EasyTButton></div>:undefined}
 onUpdateRoute={()=>{}} updateRouteFeedback={outcome?<span role="status">{outcome==='unavailable'?'Route check unavailable':'No better order found'}</span>:undefined} />
 {state==='error'?<MorroviaStatusBanner tone="warning" title="Changes saved on this device" detail="Account sync needs attention." actions={<EasyTButton variant="secondary">Try again</EasyTButton>}/>:null}</main>;
}
export const Return:Story={render:()=> <Controls/>};export const OneWay:Story={render:()=> <Controls type="one_way"/>};
export const LegacyUnknown:Story={render:()=> <Controls type="unknown_legacy"/>};export const UnresolvedIntent:Story={render:()=> <Controls provisional/>};
export const AreaIntent:Story={render:()=> <Controls area/>};
export const PartialInput:Story={render:()=> <Controls raw/>};export const AccountSaved:Story={render:()=> <Controls state="saved"/>};export const SaveFailure:Story={render:()=> <Controls state="error"/>};
export const Spanish390:Story={globals:{viewport:{value:'morrovia390',isRotated:false}},render:()=> <Controls es/>};

export const DestinationLookupFailure:Story={render:()=> <Controls lookupFailed/>};
export const SuggestedDates:Story={render:()=> <Controls datesSuggested/>};

export const NoBetterOrder:Story={render:()=> <Controls outcome="none"/>};
export const OptimizationUnavailable:Story={render:()=> <Controls outcome="unavailable"/>};
