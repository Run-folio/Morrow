import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { EasyTButton, EasyTLinkButton, EasyTField } from './easyt-controls';
import { EntryReveal, MotionButton } from './app-motion';
function Demo() {
 const [count,setCount]=useState(0);const [open,setOpen]=useState(false);const [query,setQuery]=useState('');
 return <div style={{maxWidth:600,display:'grid',gap:16}}>
  <EasyTButton fullWidth size="large" icon={Plus} onClick={()=>setCount(c=>c+1)}>Immediate action</EasyTButton>
  <EasyTButton iconOnly icon={Plus} aria-label="Icon action" onClick={()=>setCount(c=>c+1)}>Icon action</EasyTButton>
  <EasyTButton disabled onClick={()=>setCount(c=>c+1)}>Disabled action</EasyTButton>
  <EasyTLinkButton href="#motion-proof" fullWidth>Button link</EasyTLinkButton>
  <MotionButton motion={false} data-drag-handle>Excluded drag handle</MotionButton>
  <output aria-label="Actions">{count}</output>
  <EasyTButton onClick={()=>setOpen(v=>!v)}>Toggle reveal</EasyTButton>
  <div><EntryReveal active={open} ready={query.length>0} selector="[data-motion-result]" />
   {open?<><EasyTField label="Query" value={query} onChange={e=>setQuery(e.target.value)} />{query?<div data-motion-result>{query} result</div>:null}</>:null}
  </div>
 </div>;
}
const meta={title:'Morrovia/02 Controls/Shared motion',component:Demo,parameters:{layout:'padded'}} satisfies Meta<typeof Demo>;
export default meta;type Story=StoryObj<typeof meta>;
export const NativeActions:Story={play:async({canvasElement})=>{
 const c=within(canvasElement),action=c.getByRole('button',{name:'Immediate action'}),icon=c.getByRole('button',{name:'Icon action'});
 const before=action.getBoundingClientRect();
 await userEvent.click(action);await expect(c.getByLabelText('Actions')).toHaveTextContent('1');
 const after=action.getBoundingClientRect();await expect(after.width).toBe(before.width);await expect(after.height).toBe(before.height);
 await userEvent.click(icon);await expect(c.getByLabelText('Actions')).toHaveTextContent('2');
 await expect(icon.querySelector(':scope > svg')).not.toBeNull();
 await expect(action.querySelector(':scope > svg')).not.toBeNull();
 await userEvent.click(c.getByRole('button',{name:'Disabled action'}));await expect(c.getByLabelText('Actions')).toHaveTextContent('2');
 await userEvent.click(c.getByRole('button',{name:'Toggle reveal'}));await userEvent.type(c.getByRole('textbox',{name:'Query'}),'Paris');
 await expect(c.getByText('Paris result')).toBeVisible();
}};
