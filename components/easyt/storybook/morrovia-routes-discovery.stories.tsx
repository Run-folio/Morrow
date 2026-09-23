import "maplibre-gl/dist/maplibre-gl.css";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import DiscoveryBrowser from "@/app/journey/discover/discovery-browser";
import RoutePreview from "@/app/journey/discover/route-preview";
import { discoveryCatalogue, type DiscoveryRoute } from "@/lib/easyt/discovery-catalogue";
import { initialDiscoveryFilters } from "@/lib/easyt/route-discovery";
import { catalogueWithEditorialImages, routesOverviewEditorial } from "@/lib/easyt/routes-overview-editorial";
import styles from "@/app/journey/discover/discover.module.css";
const routes = discoveryCatalogue();
const japan = routes.find(r => r.key === "japan-slow")!;
const mexicoGuatemala = routes.find(r => r.key === "mexico-guatemala")!;
// Structural QA specimens only. Never imported by the application or offered a valid handoff.
const names = ["Tokyo", "Kanazawa", "Takayama", "Kyoto", "Osaka", "Hiroshima", "Fukuoka", "Nagasaki"];
const coordinates: [number,number][] = [[139.69,35.68],[136.65,36.56],[137.25,36.14],[135.77,35.01],[135.50,34.69],[132.46,34.38],[130.40,33.59],[129.87,32.75]];
const specimen = (count: number): DiscoveryRoute => ({...japan,key:`layout-specimen-${count}`,title:`Japan · ${count}-stop layout specimen`,stops:names.slice(0,count).map((name,index)=>({id:`specimen-${index}`,name,country:"Japan",coordinates:coordinates[index],reason:"Structural layout fixture only; not a published route."})),href:"/journey/discover"});
const repeatedTokyo = {...specimen(4),key:"layout-specimen-tokyo-return",title:"Tokyo return identity specimen",stops:[...specimen(4).stops,{...specimen(4).stops[0],id:"specimen-tokyo-return",reason:"Distinct return occurrence for stable-selection QA."}]};
const meta = {title:"Morrovia/05 Product Patterns/Routes Discovery",component:DiscoveryBrowser,parameters:{layout:"fullscreen",nextjs:{appDirectory:true,navigation:{pathname:"/journey/discover"}}},decorators:[(Story)=><main className={styles.page}><Story /></main>],args:{routes}} satisfies Meta<typeof DiscoveryBrowser>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Default: Story = { args: { routes: catalogueWithEditorialImages(routes, routesOverviewEditorial(routes)), editorial: routesOverviewEditorial(routes) } };
const editorial = routesOverviewEditorial(routes);
const editorialArgs = { routes: catalogueWithEditorialImages(routes, editorial), editorial };
export const EditorialCarousel: Story = { args: editorialArgs };
export const EditorialCarouselAt390: Story = { args: editorialArgs, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const EditorialImagesUnavailable: Story = { args: { ...editorialArgs, imageUnavailable: true } };
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

const preview = (route: DiscoveryRoute) => <RoutePreview route={route} onClose={() => undefined} />;
const selectStop = (name: string) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  [...canvasElement.ownerDocument.querySelectorAll<HTMLButtonElement>('[aria-label="Route stops in order"] button')].find((button) => button.textContent?.includes(name))?.click();
};
const selectStopOccurrence = (name: string, occurrence: number) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  [...canvasElement.ownerDocument.querySelectorAll<HTMLButtonElement>('[aria-label="Route stops in order"] button')].filter((button) => button.textContent?.includes(name))[occurrence]?.click();
};
export const SelectedFirst1440: Story = { render: () => preview(japan), globals:{viewport:{value:"morrovia1440",isRotated:false}} };
export const SelectedMiddle1024: Story = { render: () => preview(japan), globals:{viewport:{value:"morrovia1024",isRotated:false}}, play: selectStop("Takayama") };
export const SelectedLongName768: Story = { render: () => preview(mexicoGuatemala), globals:{viewport:{value:"morrovia768",isRotated:false}}, play: selectStop("San Cristóbal de las Casas") };
export const SelectedMiddle390: Story = { render: () => preview(japan), globals:{viewport:{value:"morrovia390",isRotated:false}}, play: selectStop("Takayama") };
export const SelectedFinal430: Story = { render: () => preview(japan), globals:{viewport:{value:"morrovia430",isRotated:false}}, play: selectStop(japan.stops.at(-1)!.name) };
export const RepeatedTokyoSecondOccurrence390: Story = { render: () => preview(repeatedTokyo), globals:{viewport:{value:"morrovia390",isRotated:false}}, play: selectStopOccurrence("Tokyo",1) };
export const MapAt320: Story = { args: { initialView: "map" }, globals: { viewport: { value: "morrovia320", isRotated: false } } };

// The same catalogue cards retain imagery and full identity in the Map rail.
export const MapAt390: Story = {args:{initialView:"map"},globals:{viewport:{value:"morrovia390",isRotated:false}}};
export const MapAt430: Story = { args: { initialView: "map" }, globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const MapAt768: Story = { args: { initialView: "map" }, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const MapAt1024: Story = { args: { initialView: "map" }, globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const MapAt1440: Story = { args: { initialView: "map" }, globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const MapMultiCountry: Story = {args:{initialView:"map",initialFilters:{...initialDiscoveryFilters,multi:true}}};
export const MapImageUnavailable: Story = {args:{initialView:"map",imageUnavailable:true}};
