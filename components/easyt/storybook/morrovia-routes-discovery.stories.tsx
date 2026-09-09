import "maplibre-gl/dist/maplibre-gl.css";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import DiscoveryBrowser from "@/app/journey/discover/discovery-browser";
import { discoveryCatalogue, type DiscoveryRoute } from "@/lib/easyt/discovery-catalogue";
import { initialDiscoveryFilters } from "@/lib/easyt/route-discovery";
import styles from "@/app/journey/discover/discover.module.css";
const routes = discoveryCatalogue();
const japan = routes.find(r => r.key === "japan-slow")!;
// Structural QA specimens only. Never imported by the application or offered a valid handoff.
const names = ["Tokyo", "Kanazawa", "Takayama", "Kyoto", "Osaka", "Hiroshima", "Fukuoka", "Nagasaki"];
const coordinates: [number,number][] = [[139.69,35.68],[136.65,36.56],[137.25,36.14],[135.77,35.01],[135.50,34.69],[132.46,34.38],[130.40,33.59],[129.87,32.75]];
const specimen = (count: number): DiscoveryRoute => ({...japan,key:`layout-specimen-${count}`,title:`Japan · ${count}-stop layout specimen`,stops:names.slice(0,count).map((name,index)=>({id:`specimen-${index}`,name,country:"Japan",coordinates:coordinates[index],reason:"Structural layout fixture only; not a published route."})),href:"/journey/discover"});
const meta = {title:"Morrovia/05 Product Patterns/Routes Discovery",component:DiscoveryBrowser,parameters:{layout:"fullscreen",nextjs:{appDirectory:true,navigation:{pathname:"/journey/discover"}}},decorators:[(Story)=><main className={styles.page}><Story /></main>],args:{routes}} satisfies Meta<typeof DiscoveryBrowser>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Default: Story = {};
export const Selected: Story = {args:{initialSelected:japan.key}};
export const SearchAndFilters: Story = {args:{initialFilters:{...initialDiscoveryFilters,search:"Italy",region:"europe",multi:true}}};
export const NoResults: Story = {args:{initialFilters:{...initialDiscoveryFilters,search:"No matching destination"}}};
export const Unavailable: Story = {args:{routes:[],unavailable:true}};
export const EmptyCatalogue: Story = {args:{routes:[]}};
export const ImageUnavailable: Story = {args:{imageUnavailable:true}};
export const Map: Story = {args:{initialView:"map"}};
export const MultiCountry: Story = {args:{initialSelected:routes.find(r=>r.countries.length>1)!.key}};
export const FourStops: Story = {args:{routes:[specimen(4)],initialSelected:"layout-specimen-4"}};
export const FiveStops: Story = {args:{routes:[specimen(5)],initialSelected:"layout-specimen-5"}};
export const EightStops: Story = {args:{routes:[specimen(8)],initialSelected:"layout-specimen-8"}};
export const At390: Story = {globals:{viewport:{value:"morrovia390",isRotated:false}}};

// The same catalogue cards retain imagery and full identity in the Map rail.
export const MapAt390: Story = {args:{initialView:"map"},globals:{viewport:{value:"morrovia390",isRotated:false}}};
export const MapMultiCountry: Story = {args:{initialView:"map",initialFilters:{...initialDiscoveryFilters,multi:true}}};
export const MapImageUnavailable: Story = {args:{initialView:"map",imageUnavailable:true}};
