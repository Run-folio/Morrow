import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EasyTButton, EasyTLinkButton } from './easyt-controls';
import { TripMobileSheet } from './trip-mobile-sheet';

const meta = { title: 'Morrovia/Trip workspace/Mobile sheet', component: TripMobileSheet, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof TripMobileSheet>;
export default meta;
type Story = StoryObj<typeof meta>;
function Example({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="morrovia-editorial-page"><EasyTButton onClick={() => setOpen(true)}>Open {title}</EasyTButton><TripMobileSheet title={title} open={open} onClose={() => setOpen(false)}>{children}</TripMobileSheet></div>;
}
export const MoreSections: Story = { args: {title:'More trip sections',open:false,onClose:()=>{},children:null}, render: () => <Example title="More trip sections"><EasyTLinkButton href="#explore" variant="quiet">Explore</EasyTLinkButton><EasyTLinkButton href="#stay" variant="quiet">Stays</EasyTLinkButton></Example> };
export const LongDayList: Story = { ...MoreSections, render: () => <Example title="Choose a day">{Array.from({length:30},(_,i)=><EasyTButton key={i} variant="quiet">Day {i+1} · {i<15?'Tokyo':'Kyoto'}</EasyTButton>)}</Example> };
