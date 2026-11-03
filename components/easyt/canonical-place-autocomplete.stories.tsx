import {expect,fn,userEvent,waitFor,within} from "storybook/test";
import type {Meta,StoryObj} from '@storybook/nextjs-vite';
import {useState} from 'react';
import {CanonicalPlaceAutocomplete} from './canonical-place-autocomplete';
import {REFERENCE_SNAPSHOT_ID} from '@/lib/easyt/place-reference';
const meta={title:'Morrovia/02 Controls/Canonical place choices',component:CanonicalPlaceAutocomplete,parameters:{layout:'padded'},args:{label:'Start from',placeholder:'City or airport',value:'LHR',onChange:()=>{},onSelect:()=>{},revealSuggestionsKey:1,menuPlacement:'inline',includeNonRoutable:true},render:function Scene(args){const [value,setValue]=useState(args.value);return <div className="morrovia-editorial-page"><CanonicalPlaceAutocomplete {...args} value={value} onChange={setValue}/></div>;}} satisfies Meta<typeof CanonicalPlaceAutocomplete>;
export default meta;
type Story=StoryObj<typeof meta>;
// Thin fixture from the pinned OurAirports record; no world dataset enters Storybook.
const airport={canonicalPlaceId:'reference:ourairports:2434',name:'London Heathrow Airport',country:'United Kingdom',placeType:'transport_gateway',routability:'direct_destination',coordinates:[-0.459909,51.470748],providerId:`reference:ourairports:2434@${REFERENCE_SNAPSHOT_ID}:GB:transport_gateway:-0.459909:51.470748`,providerSourceLabel:'OurAirports',matchedAirportCode:'LHR',referenceSnapshotId:REFERENCE_SNAPSHOT_ID};
const localFixture=async()=>{const original=globalThis.fetch;globalThis.fetch=(async(input,init)=>String(input).startsWith('/api/journey-geocode?')?new Response(JSON.stringify({candidates:[airport]}),{headers:{'Content-Type':'application/json'}}):original(input,init)) as typeof fetch;return ()=>{globalThis.fetch=original;};};
export const AirportCode:Story={beforeEach:localFixture};
export const MetropolitanCity:Story={args:{value:'NYC'},beforeEach:async()=>{const original=globalThis.fetch;globalThis.fetch=(async(input,init)=>String(input).startsWith('/api/journey-geocode?')?new Response('{"candidates":[]}'):original(input,init)) as typeof fetch;return ()=>{globalThis.fetch=original;};}};
export const AirportMobile:Story={...AirportCode,globals:{viewport:{value:'morrovia390',isRotated:false}}};

const nonscheduled={canonicalPlaceId:'reference:ourairports:24',name:'Miramar Airport',country:'Argentina',placeType:'transport_gateway',routability:'direct_destination',coordinates:[-57.8697,-38.2271],providerId:`reference:ourairports:24@${REFERENCE_SNAPSHOT_ID}:AR:transport_gateway:-57.8697:-38.2271`,providerSourceLabel:'OurAirports',matchedAirportCode:'MJR',referenceSnapshotId:REFERENCE_SNAPSHOT_ID,scheduledService:false};
const nonscheduledFixture=async()=>{const original=globalThis.fetch;globalThis.fetch=(async(input,init)=>String(input).startsWith('/api/journey-geocode?')?new Response(JSON.stringify({candidates:[nonscheduled]}),{headers:{'Content-Type':'application/json'}}):original(input,init)) as typeof fetch;return ()=>{globalThis.fetch=original;};};
export const NonScheduledAirport:Story={args:{value:'MJR'},beforeEach:nonscheduledFixture};
export const NonScheduledAirportSpanish:Story={...NonScheduledAirport,args:{value:'MJR',language:'es'}};
export const NonScheduledAirportMobile:Story={...NonScheduledAirport,globals:{viewport:{value:'morrovia390',isRotated:false}}};

export const BroadPlanningArea:Story={...MetropolitanCity,args:{value:'Europe',label:'Destination',placeholder:'City, country or region',includeNonRoutable:true}};
const sameNamePoints:[string,[number,number]][]=[['1790630',[108.92861,34.25833]],['1790631',[111.05,28.46667]],['1790633',[112.28844,24.92056]],['2053185',[122.23481,40.92265]],['8527333',[129.60862,44.57568]]];
export const SameCountryNamesakes:Story={args:{value:'Xi’an',label:'Destination'},beforeEach:async()=>{
 const original=globalThis.fetch;
 const candidates=sameNamePoints.map(([id,coordinates])=>({canonicalPlaceId:`reference:geonames:${id}`,providerId:`reference:geonames:${id}@${REFERENCE_SNAPSHOT_ID}:CN:city:${coordinates.join(':')}`,referenceSnapshotId:REFERENCE_SNAPSHOT_ID,name:'Xi’an',country:'China',placeType:'city',routability:'direct_destination',coordinates}));
 globalThis.fetch=(async(input,init)=>String(input).startsWith('/api/journey-geocode?')?new Response(JSON.stringify({candidates})):original(input,init)) as typeof fetch;
 return ()=>{globalThis.fetch=original;};
}};
export const SameCountryNamesakesMobile:Story={...SameCountryNamesakes,globals:{viewport:{value:'morrovia390',isRotated:false}}};
export const VerifiedCityIdentity:Story={args:{value:'Manila',label:'Destination'},beforeEach:async()=>{
 const original=globalThis.fetch;
 const candidate={canonicalPlaceId:'reference:geonames:1701668',providerId:`reference:geonames:1701668@${REFERENCE_SNAPSHOT_ID}:PH:city:120.9822:14.6042`,referenceSnapshotId:REFERENCE_SNAPSHOT_ID,name:'Manila',country:'Philippines',placeType:'city',routability:'direct_destination',coordinates:[120.9822,14.6042]};
 globalThis.fetch=(async(input,init)=>String(input).startsWith('/api/journey-geocode?')?new Response(JSON.stringify({candidates:[candidate]})):original(input,init)) as typeof fetch;
 return ()=>{globalThis.fetch=original;};
}};

// Offline catalog/reference collisions: no identity equivalence is inferred.
export const PublishedCityChoices:Story={...MetropolitanCity,args:{value:'Beijing',label:'Destination',placeholder:'City or area'}};
export const PublishedCityChoicesSpanish:Story={...PublishedCityChoices,args:{...PublishedCityChoices.args,language:'es'}};
export const PublishedCityChoicesMobile:Story={...PublishedCityChoices,globals:{viewport:{value:'morrovia390',isRotated:false}}};

// Offline interaction: press Enter for the deterministic miss, then explicitly
// search the public name. Selecting the result is still a separate action.
export const PublicPlaceResearch:Story={...MetropolitanCity,args:{value:'Yunomine hot spring village',label:'Destination',
  onFreeTextSearch:async()=>({suggestions:[],publicResearchAvailable:true}),onPublicPlaceSearch:async()=>[{
    canonicalPlaceId:'open-world:photon:N:2822838506',name:'Yunomine Onsen',country:'Japan',label:'Yunomine Onsen, Japan',
    placeType:'town',routability:'direct_destination',coordinates:[135.7575842,33.8288351],
    provenance:[{id:'photon:N:2822838506',kind:'provider',label:'Photon / OpenStreetMap',supports:'Recorded locality fixture; public-name research is mocked.'}],
  }]}};
export const PublicPlaceResearchMobile:Story={...PublicPlaceResearch,globals:{viewport:{value:'morrovia390',isRotated:false}}};
export const PublicPlaceResearchSpanish:Story={...PublicPlaceResearch,args:{...PublicPlaceResearch.args,language:'es'}};

// Offline Home action: Enter and Search use the same completed-search owner.
export const ExplicitCompletedSearch:Story={...MetropolitanCity,args:{value:'Yunomine hot spring village',label:'Destination',showSearchAction:true,
  onFreeTextSearch:async()=>[{
    canonicalPlaceId:'open-world:photon:N:2822838506',name:'Yunomine Onsen',country:'Japan',label:'Yunomine Onsen, Japan',
    placeType:'town',routability:'direct_destination',coordinates:[135.7575842,33.8288351],
    provenance:[{id:'photon:N:2822838506',kind:'provider',label:'Photon / OpenStreetMap',supports:'Recorded locality fixture; completed search is mocked.'}],
  }]}};
export const ExplicitCompletedSearchMobile:Story={...ExplicitCompletedSearch,globals:{viewport:{value:'morrovia390',isRotated:false}}};
export const ExplicitCompletedSearchDisabled:Story={...ExplicitCompletedSearch,args:{...ExplicitCompletedSearch.args,disabled:true}};
export const ExplicitCompletedSearchFailure:Story={...ExplicitCompletedSearch,args:{...ExplicitCompletedSearch.args,onFreeTextSearch:async()=>{throw new Error('Offline failure fixture');}}};

const accessibleControlPage: NonNullable<Story["decorators"]> = [(Story) => <main className="morrovia-editorial-page"><h1 className="sr-only">Destination search</h1><Story /></main>];
const strictPlaceParameters = { a11y: { test: "error" as const } };
export const AccessibleShortQuery: Story = {
  args: { value: "", label: "Destination" }, tags: ["current-ui"], decorators: accessibleControlPage, parameters: strictPlaceParameters,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), input = canvas.getByRole("combobox", { name: "Destination" });
    await userEvent.click(input);
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(input).not.toHaveAttribute("aria-controls");
    await userEvent.type(input, "L");
    await expect(input).not.toHaveAttribute("aria-controls");
    await expect(canvas.queryByRole("listbox")).toBeNull();
  },
};
export const AccessibleEmptyFeedback: Story = {
  ...MetropolitanCity, args: { value: "zzzzzz-unmatched-place", label: "Destination" }, tags: ["current-ui"], decorators: accessibleControlPage, parameters: strictPlaceParameters,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("No matching places found"), { timeout: 5000 });
    await expect(canvas.queryByRole("listbox")).toBeNull();
    await expect(canvas.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.getByRole("combobox")).not.toHaveAttribute("aria-controls");
  },
};
export const AccessibleFailureRetry: Story = {
  ...MetropolitanCity, args: { value: "zzzzzz-unmatched-place", label: "Destination", onFreeTextSearch: fn(async () => { throw new Error("Synthetic search failure"); }) }, tags: ["current-ui"], decorators: accessibleControlPage, parameters: strictPlaceParameters,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement), input = canvas.getByRole("combobox");
    input.focus(); await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(args.onFreeTextSearch).toHaveBeenCalledTimes(1), { timeout: 5000 });
    await expect(await canvas.findByRole("alert", {}, { timeout: 5000 })).toBeVisible();
    await expect(canvas.queryByRole("listbox")).toBeNull();
    await expect(input).not.toHaveAttribute("aria-controls");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(args.onFreeTextSearch).toHaveBeenCalledTimes(2), { timeout: 5000 });
    await expect(await canvas.findByRole("alert", {}, { timeout: 5000 })).toBeVisible();
  },
};
export const AccessibleKeyboardSelection: Story = {
  ...AirportCode, args: { onSelect: fn() }, tags: ["current-ui"], decorators: accessibleControlPage, parameters: strictPlaceParameters,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement), input = canvas.getByRole("combobox");
    await canvas.findAllByRole("option", {}, { timeout: 5000 }); input.focus(); await userEvent.keyboard("{ArrowDown}");
    let expectedName: string | null = null;
    await waitFor(() => {
      const activeId = input.getAttribute("aria-activedescendant");
      const option = activeId ? canvasElement.ownerDocument.getElementById(activeId) : null;
      expect(option).toHaveAttribute("role", "option"); expectedName = option?.querySelector("b")?.textContent ?? null;
    });
    await userEvent.keyboard("{Enter}");
    await expect(args.onSelect).toHaveBeenCalledTimes(1);
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: expectedName }));
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(input).not.toHaveAttribute("aria-controls");
  },
};
