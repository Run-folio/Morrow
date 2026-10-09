import type {Meta,StoryObj} from '@storybook/react';
import {MorroviaPlaceDataCredit} from './morrovia-place-data-credit';
const meta={title:'Morrovia/05 Product Patterns/Place data attribution',component:MorroviaPlaceDataCredit,args:{sources:['geonames'],language:'en'}} satisfies Meta<typeof MorroviaPlaceDataCredit>;
export default meta;
type Story=StoryObj<typeof meta>;
export const SettlementSource:Story={};
export const AirportSource:Story={args:{sources:['ourairports']}};
export const CombinedSources:Story={args:{sources:['geonames','ourairports','openstreetmap']}};
export const Spanish:Story={args:{sources:['geonames','ourairports','openstreetmap'],language:'es'}};
