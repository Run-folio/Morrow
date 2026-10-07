import type {Meta,StoryObj} from '@storybook/nextjs-vite';
import {useState} from 'react';
import {Plus} from 'lucide-react';
import {EasyTButton,EasyTField} from './easyt-controls';
import {MorroviaDestinationField,MorroviaDestinationTag,destinationAddClassName} from './morrovia-destination-field';
const meta={title:'Morrovia/02 Controls/Destination field',component:MorroviaDestinationField,args:{label:'Places you want to visit',children:null},parameters:{layout:'padded'}} satisfies Meta<typeof MorroviaDestinationField>;
export default meta;type Story=StoryObj<typeof meta>;
function Field({es=false,long=false}:{es?:boolean;long?:boolean}){
 const [labels,setLabels]=useState(long?['San Pedro de Atacama','Ho Chi Minh City','Parque Nacional Torres del Paine']:['Japan','China','South Korea']);const [editing,setEditing]=useState<number|null>(null);
 return <MorroviaDestinationField label={es?'Lugares que quieres visitar':'Places you want to visit'} addAction={<EasyTButton className={destinationAddClassName} icon={Plus} variant="secondary" onClick={()=>{setLabels(v=>[...v,'']);setEditing(labels.length)}}>{es?'Añadir destino':'Add destination'}</EasyTButton>}>
 {labels.map((label,index)=><MorroviaDestinationTag key={index} id={String(index)} label={label||'Destination'} editLabel={`Edit ${label}`} removeLabel={`Remove ${label}`} onEdit={()=>setEditing(index)} onRemove={()=>setLabels(v=>v.filter((_,i)=>i!==index))} editor={editing===index?<EasyTField label={es?'Destino':'Destination'} value={label} onChange={e=>setLabels(v=>v.map((l,i)=>i===index?e.target.value:l))} onKeyDown={e=>{if(e.key==='Escape'||e.key==='Enter')setEditing(null)}}/>:undefined}/>)}
 </MorroviaDestinationField>;
}
export const Default:Story={render:()=> <Field/>};
export const SpanishLongNames390:Story={globals:{viewport:{value:'morrovia390',isRotated:false}},render:()=> <Field es long/>};
