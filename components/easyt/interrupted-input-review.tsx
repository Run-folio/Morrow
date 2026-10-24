"use client";
import type {InterruptedBuilderInput} from '@/lib/easyt/interrupted-builder-input';
import {EasyTTextArea} from './easyt-controls';
import {MorroviaRecoveryFeedback} from './morrovia-feedback';

/** Read-only recovery. Reapplication always uses the ordinary editor's guarded controls. */
export function InterruptedInputReview({records,memoryOnly=false,unreadable=false,onRetry,language='en'}:{
 records:InterruptedBuilderInput[];memoryOnly?:boolean;unreadable?:boolean;onRetry?:()=>void;language?:string;
}) {
 const es=language==='es';
 if(!records.length&&!unreadable)return null;
 return <section aria-label={es?'Ediciones interrumpidas':'Interrupted edits'}>
  <MorroviaRecoveryFeedback
   title={memoryOnly?(es?'Estas ediciones solo están en esta pestaña':'These edits are only in this tab'):(es?'Ediciones interrumpidas en este dispositivo':'Interrupted edits on this device')}
   detail={es?'Revisa el texto y vuelve a introducir los cambios que quieras conservar.':'Review the text and re-enter the changes you want to keep.'}
   safety={memoryOnly?(es?'No se pudieron guardar. Mantén esta pestaña abierta.':'They could not be saved. Keep this tab open.'):(es?'El viaje y sus otras copias no se han modificado.':'Your trip and its other copies have not been changed.')}
   onRetry={memoryOnly?onRetry:undefined} retryLabel={es?'Guardar copia de recuperación':'Save recovery copy'} />
  {unreadable?<p role="alert">{es?'Algunas ediciones guardadas no se pudieron leer de forma segura. Siguen intactas.':'Some retained edits could not be read safely. They remain untouched.'}</p>:null}
  {records.map((record,index)=><details key={record.captureId}>
   <summary>{es?`Revisar edición ${index+1}`:`Review edit ${index+1}`}</summary>
   {record.draft.fields.map((field,i)=><EasyTTextArea key={i} readOnly value={field.raw}
    label={field.binding.kind==='origin'?(es?'Origen interrumpido':'Interrupted starting point'):
     field.binding.kind==='date'?(es?'Fecha interrumpida':'Interrupted date'):
     field.binding.kind==='nights'?(es?'Noches interrumpidas':'Interrupted nights'):
     field.binding.kind==='type'?(es?'Tipo de viaje interrumpido':'Interrupted trip type'):(es?'Destino interrumpido':'Interrupted destination')} />)}
  </details>)}
 </section>;
}
