import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { PlaceType } from "@/lib/easyt/place-intelligence";
import { BuilderClarificationDialog, BuilderClarificationResume } from "./builder-clarification-dialog";

const noop = () => undefined;
const bulgariaSearch = {
  label: "Search within Bulgaria",
  placeholder: "Search within Bulgaria",
  value: "",
  contextCountries: ["Bulgaria"],
  parentConstraint: { canonicalName: "Bulgaria", placeType: "country" as const, parentCountries: ["Bulgaria"] },
  allowedPlaceTypes: ["city", "town", "transport_gateway"] as PlaceType[],
  onChange: noop,
  onSelect: noop,
};

const meta = {
  title: "Morrovia/05 Product Patterns/Builder clarification",
  component: BuilderClarificationDialog,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: 24 }}><Story /></main>],
  args: {
    open: true,
    itemKey: "bulgaria",
    progress: "1 of 4",
    title: "Choose places in Bulgaria",
    description: "Add one or more places you would like Morrovia to plan around.",
    selectedPlaces: [],
    suggestions: [
      { id: "sofia", name: "Sofia", detail: "Bulgaria · A mountain-framed city pause." },
      { id: "plovdiv", name: "Plovdiv", detail: "Bulgaria · Old town, food and culture." },
    ],
    search: bulgariaSearch,
    doneLabel: "Done with Bulgaria",
    doneDisabled: true,
    doneDisabledReason: "Choose at least one place for Bulgaria before completing it.",
    finishLaterLabel: "Finish later",
    removeLabel: "Remove Bulgaria from trip",
    onDismiss: noop,
    onDone: noop,
    onRemoveItem: noop,
    onAddSuggestion: noop,
  },
} satisfies Meta<typeof BuilderClarificationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BroadAreaStep1Of4: Story = {};

export const OneSelectedPlaceNotComplete: Story = {
  args: {
    selectedPlaces: [{ id: "sofia", name: "Sofia", detail: "Bulgaria" }],
    suggestions: [{ id: "plovdiv", name: "Plovdiv", detail: "Bulgaria · Old town, food and culture." }],
    doneDisabled: false,
    onRemoveSelected: noop,
  },
};

export const SeveralSelectedPlaces: Story = {
  args: {
    selectedPlaces: [
      { id: "sofia", name: "Sofia", detail: "Bulgaria" },
      { id: "plovdiv", name: "Plovdiv", detail: "Bulgaria" },
    ],
    suggestions: [
      { id: "veliko-tarnovo", name: "Veliko Tarnovo", detail: "Bulgaria · Hilltop heritage city." },
      { id: "bansko", name: "Bansko", detail: "Bulgaria · Pirin Mountains base." },
    ],
    doneDisabled: false,
    onRemoveSelected: noop,
  },
};

export const ReviewedRouteShapeSuggestion: Story = {
  args: {
    itemKey: "albania",
    progress: "4 of 4",
    title: "Choose places in Albania",
    description: "Add one or more places you would like Morrovia to plan around.",
    routeShapes: [{
      id: "albania-north-to-capital",
      title: "Shkodër + Tirana",
      summary: "Coast · Nature · Culture",
      reason: "A flexible Adriatic route with mountain access and fewer predictable city breaks.",
      places: [
        { id: "shkoder", name: "Shkodër", detail: "Northern Albania" },
        { id: "tirana", name: "Tirana", detail: "Central Albania" },
      ],
    }],
    suggestions: [],
    search: {
      ...bulgariaSearch,
      label: "Search within Albania",
      placeholder: "Search within Albania",
      contextCountries: ["Albania"],
      parentConstraint: { canonicalName: "Albania", placeType: "country", parentCountries: ["Albania"] },
    },
    doneLabel: "Finish shaping route",
    doneDisabledReason: "Choose at least one place for Albania before completing it.",
    removeLabel: "Remove Albania from trip",
    onApplyShape: noop,
  },
  play: async ({ canvasElement }) => {
    Array.from(canvasElement.querySelectorAll("button")).find((button) => button.textContent?.includes("Shkodër + Tirana"))?.click();
  },
};

export const GenuineAmbiguity: Story = {
  args: {
    itemKey: "georgia-ambiguity",
    progress: "3 of 4",
    title: "Which Georgia did you mean?",
    description: "Choose the place that matches your trip. If you choose the country, you can add one or more places there next.",
    choices: [
      { id: "georgia-country", label: "Georgia", detail: "Country · Caucasus" },
      { id: "georgia-us", label: "Georgia", detail: "State · United States" },
    ],
    suggestions: [],
    search: undefined,
    doneLabel: undefined,
    doneDisabled: false,
    doneDisabledReason: undefined,
    removeLabel: "Remove Georgia from trip",
    onChoose: noop,
  },
};

export const AmbiguityResolvedToBroadCountry: Story = {
  args: {
    itemKey: "georgia-country-shaping",
    progress: "3 of 4",
    title: "Choose places in Georgia",
    description: "Georgia is confirmed as the country. Add one or more places you would like Morrovia to plan around.",
    choices: [],
    suggestions: [
      { id: "tbilisi", name: "Tbilisi", detail: "Georgia · Capital and cultural base." },
      { id: "kutaisi", name: "Kutaisi", detail: "Georgia · Western gateway." },
    ],
    search: {
      ...bulgariaSearch,
      label: "Search within Georgia",
      placeholder: "Search within Georgia",
      contextCountries: ["Georgia"],
      parentConstraint: { canonicalName: "Georgia", placeType: "country", parentCountries: ["Georgia"] },
    },
    doneLabel: "Done with Georgia",
    doneDisabled: true,
    doneDisabledReason: "Choose at least one place for Georgia before completing it.",
    removeLabel: "Remove Georgia from trip",
    onChoose: undefined,
  },
};

export const CompletedParentReopened: Story = {
  args: {
    itemKey: "bulgaria-reopened",
    progress: "1 of 1",
    title: "Choose places in Bulgaria",
    description: "Review the places already selected, then keep or change them.",
    selectedPlaces: [
      { id: "sofia", name: "Sofia", detail: "Bulgaria" },
      { id: "plovdiv", name: "Plovdiv", detail: "Bulgaria" },
    ],
    suggestions: [{ id: "bansko", name: "Bansko", detail: "Bulgaria · Pirin Mountains base." }],
    doneLabel: "Finish shaping route",
    doneDisabled: false,
    onRemoveSelected: noop,
  },
};

export const FinishLaterAvailable: Story = {
  args: {
    itemKey: "romania-finish-later",
    progress: "2 of 4",
    title: "Choose places in Romania",
    description: "Your current choices are preserved if you finish later.",
    selectedPlaces: [{ id: "brasov", name: "Brașov", detail: "Romania" }],
    doneDisabled: false,
    onRemoveSelected: noop,
  },
};

export const LandmarkBaseClarification: Story = {
  args: {
    itemKey: "serengeti-base",
    progress: "1 of 1",
    title: "Serengeti National Park",
    description: "Natural area · Your visit intent stays separate from route bases.",
    question: "Where would you like to stay around Serengeti National Park?",
    suggestionsLabel: "SUGGESTED NEARBY PLACES",
    suggestions: [
      { id: "karatu", name: "Karatu", detail: "Tanzania · 82 km from Serengeti National Park · Verified town" },
      { id: "mugumu", name: "Mugumu", detail: "Tanzania · 41 km from Serengeti National Park · Verified town" },
    ],
    search: {
      label: "Have somewhere else in mind?",
      placeholder: "Search around Serengeti National Park",
      value: "",
      contextCountries: ["Tanzania"],
      nearbyAnchor: { canonicalName: "Serengeti National Park", canonicalPlaceId: "serengeti", placeType: "natural_area", parentCountries: ["Tanzania"], coordinates: [34.8333, -2.3333] },
      allowedPlaceTypes: ["city", "town"] as PlaceType[],
      onChange: noop,
      onSelect: noop,
    },
    doneLabel: "Done with Serengeti National Park",
    doneDisabled: true,
    doneDisabledReason: "Choose at least one nearby base before completing it.",
    removeLabel: "Remove Serengeti from trip",
    onAddSuggestion: noop,
  },
};

export const TikalNearbyBaseDiscovery: Story = {
  args: {
    itemKey: "tikal-nearby",
    progress: "1 of 2",
    title: "Tikal",
    description: "Landmark · Your visit intent stays separate from route bases.",
    question: "Where would you like to stay for Tikal?",
    suggestionsLabel: "SUGGESTED NEARBY PLACES",
    suggestions: [
      { id: "fixture-el-remate", name: "El Remate", detail: "Guatemala · 26 km from Tikal · Verified town" },
      { id: "fixture-san-jose", name: "San José", detail: "Guatemala · 48 km from Tikal · Verified town" },
    ],
    selectedPlaces: [{ id: "fixture-flores", name: "Flores", detail: "Guatemala" }],
    suggestionsActionLabel: "See more nearby places",
    search: {
      label: "Have somewhere else in mind?",
      placeholder: "Search near Tikal",
      value: "",
      contextCountries: ["Guatemala"],
      nearbyAnchor: { canonicalName: "Tikal", canonicalPlaceId: "tikal", placeType: "landmark", parentCountries: ["Guatemala"], parentRegionId: "peten", coordinates: [-89.6237, 17.222] },
      allowedPlaceTypes: ["city", "town"] as PlaceType[],
      onChange: noop,
      onSelect: noop,
    },
    doneLabel: "Done with Tikal",
    doneDisabled: false,
    doneDisabledReason: "Choose at least one nearby base before completing it.",
    removeLabel: "Remove Tikal from trip",
    onAddSuggestion: noop,
    onSuggestionsAction: noop,
  },
};

export const LakeAtitlanSeveralBases: Story = {
  args: {
    itemKey: "lake-atitlan-nearby",
    progress: "2 of 2",
    title: "Lake Atitlán",
    description: "Natural area · Your visit intent stays separate from route bases.",
    question: "Where would you like to stay around Lake Atitlán?",
    suggestionsLabel: "SUGGESTED NEARBY PLACES",
    suggestions: [
      { id: "fixture-san-marcos", name: "San Marcos La Laguna", detail: "Guatemala · 9 km from Lake Atitlán · Verified town" },
    ],
    selectedPlaces: [{ id: "fixture-san-pedro", name: "San Pedro La Laguna", detail: "Guatemala" }],
    search: {
      label: "Have somewhere else in mind?",
      placeholder: "Search around Lake Atitlán",
      value: "",
      contextCountries: ["Guatemala"],
      nearbyAnchor: { canonicalName: "Lake Atitlán", canonicalPlaceId: "lake-atitlan", placeType: "natural_area", parentCountries: ["Guatemala"], parentRegionId: "solola", coordinates: [-91.186, 14.69] },
      allowedPlaceTypes: ["city", "town"] as PlaceType[],
      onChange: noop,
      onSelect: noop,
    },
    doneLabel: "Finish shaping route",
    doneDisabled: false,
    removeLabel: "Remove Lake Atitlán from trip",
    onAddSuggestion: noop,
    onRemoveSelected: noop,
  },
};

export const NearbyDiscoveryFailure: Story = {
  args: {
    ...TikalNearbyBaseDiscovery.args,
    itemKey: "remote-anchor-failure",
    title: "Remote nature reserve",
    description: "Natural area · Your visit intent stays separate from route bases.",
    question: "Where would you like to stay around Remote nature reserve?",
    suggestions: [],
    suggestionsActionLabel: undefined,
    suggestionsStatus: "Morrovia could not confidently identify a nearby base. Remote nature reserve is preserved; search for a nearby place instead.",
    search: {
      ...TikalNearbyBaseDiscovery.args!.search!,
      placeholder: "Search around Remote nature reserve",
      nearbyAnchor: { canonicalName: "Remote nature reserve", canonicalPlaceId: "remote-reserve", placeType: "natural_area", parentCountries: ["Namibia"], coordinates: [15, -22] },
    },
    doneLabel: "Done with Remote nature reserve",
    removeLabel: "Remove Remote nature reserve from trip",
  },
};

export const NearbyDiscoveryMobile390: Story = {
  args: LakeAtitlanSeveralBases.args,
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};

export const BelizeCountrySelection: Story = {
  args: {
    itemKey: "belize-country",
    progress: "1 of 1",
    title: "Choose places in Belize",
    description: "Add one or more places you would like Morrovia to plan around in Belize.",
    selectedPlaces: [
      { id: "caye-caulker", name: "Caye Caulker", detail: "Belize" },
      { id: "san-ignacio-belize", name: "San Ignacio", detail: "Belize" },
    ],
    suggestions: [{ id: "san-pedro-belize", name: "San Pedro Town", detail: "Belize · Island settlement" }],
    search: {
      ...bulgariaSearch,
      label: "Search within Belize",
      placeholder: "Search within Belize",
      contextCountries: ["Belize"],
      parentConstraint: { canonicalName: "Belize", placeType: "country", parentCountries: ["Belize"] },
    },
    doneLabel: "Finish shaping route",
    doneDisabled: false,
    onRemoveSelected: noop,
  },
};

export const TikalResolvedMobile320: Story = { ...TikalNearbyBaseDiscovery, globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const TikalResolvedMobile390: Story = { ...TikalNearbyBaseDiscovery, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const TikalResolvedTablet768: Story = { ...TikalNearbyBaseDiscovery, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const TikalResolvedDesktop1024: Story = { ...TikalNearbyBaseDiscovery, globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const LakeAtitlanResolvedMobile320: Story = { ...LakeAtitlanSeveralBases, globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const LakeAtitlanResolvedMobile390: Story = { ...LakeAtitlanSeveralBases, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const LakeAtitlanResolvedTablet768: Story = { ...LakeAtitlanSeveralBases, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const LakeAtitlanResolvedDesktop1024: Story = { ...LakeAtitlanSeveralBases, globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const BelizeCountryMobile320: Story = { ...BelizeCountrySelection, globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const BelizeCountryMobile390: Story = { ...BelizeCountrySelection, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const BelizeCountryTablet768: Story = { ...BelizeCountrySelection, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const BelizeCountryDesktop1024: Story = { ...BelizeCountrySelection, globals: { viewport: { value: "morrovia1024", isRotated: false } } };

export const FinishLaterCompactResume: Story = {
  render: () => <div style={{ maxWidth: 900, margin: "20vh auto 0" }}><BuilderClarificationResume
    ariaLabel="Route shaping to finish"
    label="3 areas still need shaping"
    itemNames={["Romania", "Georgia", "Albania"]}
    actionLabel="Continue shaping your route"
    onContinue={noop}
  /></div>,
};

export const FinalClarificationStep: Story = {
  args: {
    itemKey: "albania-final",
    progress: "4 of 4",
    title: "Choose places in Albania",
    selectedPlaces: [
      { id: "shkoder", name: "Shkodër", detail: "Albania" },
      { id: "tirana", name: "Tirana", detail: "Albania" },
    ],
    suggestions: [{ id: "berat", name: "Berat", detail: "Albania · Historic hillside city." }],
    search: {
      ...bulgariaSearch,
      label: "Search within Albania",
      placeholder: "Search within Albania",
      contextCountries: ["Albania"],
      parentConstraint: { canonicalName: "Albania", placeType: "country", parentCountries: ["Albania"] },
    },
    doneLabel: "Finish shaping route",
    doneDisabled: false,
    removeLabel: "Remove Albania from trip",
    onRemoveSelected: noop,
  },
};

export const MobileSheetAt390: Story = {
  args: SeveralSelectedPlaces.args,
  globals: { viewport: { value: "morrovia390", isRotated: false } },
};

export const LongPlaceNames: Story = {
  args: {
    itemKey: "long-names",
    progress: "2 of 4",
    title: "Choose places in Bosnia and Herzegovina",
    selectedPlaces: [{ id: "long", name: "Bosnia and Herzegovina Federation mountain region", detail: "Bosnia and Herzegovina" }],
    suggestions: [{ id: "long-suggestion", name: "Široki Brijeg and the West Herzegovina Canton", detail: "Bosnia and Herzegovina · Regional route base." }],
    search: {
      ...bulgariaSearch,
      label: "Search within Bosnia and Herzegovina",
      placeholder: "Search within Bosnia and Herzegovina",
      contextCountries: ["Bosnia and Herzegovina"],
      parentConstraint: { canonicalName: "Bosnia and Herzegovina", placeType: "country", parentCountries: ["Bosnia and Herzegovina"] },
    },
    doneDisabled: false,
    doneLabel: "Done with Bosnia and Herzegovina",
    removeLabel: "Remove Bosnia and Herzegovina from trip",
    onRemoveSelected: noop,
  },
};
