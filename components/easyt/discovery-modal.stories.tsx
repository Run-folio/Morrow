import { buildDiscoveryReview } from "@/lib/easyt/discovery-review";
import { tripFromBuilder, type EasyTTrip } from "@/lib/easyt/trip";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { DiscoveryModal } from "./discovery-modal";
import { createDiscoveryDraft, reduceDiscoveryDraft, type DiscoveryDraft, type DiscoveryDraftAction } from "@/lib/easyt/discovery-draft";
import { projectDiscovery, type DiscoveryProjection } from "@/lib/easyt/discovery-projection";
import type { DiscoveryEntry } from "@/lib/easyt/discovery-entry";
import { resolvePlaceMentions, type ResolvedPlaceMention } from "@/lib/easyt/place-intelligence";

const mention = (name: string) => resolvePlaceMentions(name).mentions[0]!;
const initial = createDiscoveryDraft();
const projection = (name: string, draft = initial) => projectDiscovery({ mention: mention(name), draft, context: { interests: [], existingPlaceIds: [] } });
const australia = projection("Australia");
const africa = projection("Africa");
const japan = projection("Japan");
const tajikistan = projection("Tajikistan");
const philippines = projection("Philippines");
const taj = projection("Taj Mahal");
const australiaMention = mention("Australia");
const africaMention = mention("Africa");
const japanMention = mention("Japan");

type Scene = { entry: DiscoveryEntry; mention: ResolvedPlaceMention; projection: DiscoveryProjection; draft: DiscoveryDraft;
  canonicalTrip?: EasyTTrip; language?: "en" | "es"; existingPlaceIds?: string[]; note?: string; loading?: boolean; saveError?: string; timingDecoy?: boolean;
  actionSpy?: (action: DiscoveryDraftAction) => void; confirmSpy?: () => void; closeSpy?: () => void };

function SceneModal({ entry, mention: sceneMention, projection: sceneProjection, draft: initialDraft, language = "en", existingPlaceIds = [], note, loading, saveError, timingDecoy, actionSpy, confirmSpy, closeSpy, canonicalTrip }: Scene) {
  const [draft, setDraft] = useState(initialDraft);
  const [searchValue, setSearchValue] = useState("");
  const onAction = (action: DiscoveryDraftAction) => { actionSpy?.(action); setDraft(current => reduceDiscoveryDraft(current, action)); };
  return <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: 20 }}>
    <p style={{ maxWidth: 780, margin: 0 }}>{note ?? "Reviewed production evidence; no licensed image is currently assigned to these places."}</p>
    {timingDecoy ? <article data-discovery-card="true">Outside modal timing decoy</article> : null}
    <DiscoveryModal open entry={entry} mention={sceneMention} projection={sceneProjection} draft={draft} language={language} loading={loading} saveError={saveError}
      canonicalReview={canonicalTrip ? buildDiscoveryReview({ mention: sceneMention, draft, projection: sceneProjection, trip: canonicalTrip }) : undefined}
      existingPlaceIds={existingPlaceIds} onAction={onAction} onConfirm={() => confirmSpy?.()} onClose={() => closeSpy?.()}
      search={{ value: searchValue, onChange: setSearchValue, onSelect: () => {} }} />
  </main>;
}

const meta = { title: "Morrovia/05 Product Patterns/Visual Discovery", component: SceneModal,
  parameters: { layout: "fullscreen" } } satisfies Meta<typeof SceneModal>;
export default meta;
type Story = StoryObj<typeof meta>;

const countryEntry = { kind: "country", step: "directions" } as const;
const placesDraft = { ...initial, step: "places" as const };
const selectedDraft = { ...placesDraft, shortlistIds: australia.places.slice(0, 2).map(place => place.id) };

export const AustraliaDirections: Story = { args: { entry: countryEntry, mention: australiaMention, projection: australia, draft: initial } };
export const AustraliaPlaces: Story = { args: { entry: countryEntry, mention: australiaMention, projection: australia, draft: placesDraft } };
export const MeasuredFirstCard: Story = { args: { ...AustraliaPlaces.args },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("heading", { name: "Airlie Beach" })).toBeVisible();
    await waitFor(() => expect(performance.getEntriesByName("discovery-mounted-to-first-card-paint")).toHaveLength(1), { timeout: 4000 });
    const measures = performance.getEntriesByName("discovery-mounted-to-first-card-paint");
    await expect(measures).toHaveLength(1);
    await expect(measures[0]!.duration).toBeGreaterThanOrEqual(0);
  } };
export const AustraliaMapCardPreview: Story = { args: { ...AustraliaPlaces.args, actionSpy: fn(), confirmSpy: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const place = australia.places[0]!;
    const card = canvas.getByRole("heading", { name: place.name }).closest("article")!;
    await userEvent.click(card);
    await expect(card).toHaveAttribute("data-highlighted", "true");
    await expect(args.actionSpy).not.toHaveBeenCalled();
    await expect(args.confirmSpy).not.toHaveBeenCalled();
  } };
const pinRevealProjection = { ...australia, visiblePlaceIds: australia.places.slice(0, 6).map(place => place.id) };
const offscreenPinPlace = australia.places[10]!;
export const AustraliaPinRevealsExactCard: Story = { args: { ...AustraliaPlaces.args, projection: pinRevealProjection, actionSpy: fn(), confirmSpy: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("heading", { name: offscreenPinPlace.name })).not.toBeInTheDocument();
    const pin = await canvas.findByRole("button", { name: `Show card for ${offscreenPinPlace.name}` });
    await userEvent.click(pin);
    const card = canvas.getByRole("heading", { name: offscreenPinPlace.name }).closest("article");
    await expect(card).toHaveFocus();
    await expect(card).toHaveAttribute("data-highlighted", "true");
    await expect(args.actionSpy).not.toHaveBeenCalled();
    await expect(args.confirmSpy).not.toHaveBeenCalled();
  } };
export const AustraliaShortlist: Story = { args: { entry: countryEntry, mention: australiaMention, projection: australia, draft: selectedDraft } };
export const DirectionToContainedPlacesInteraction: Story = { args: { ...AustraliaDirections.args, actionSpy: fn(), confirmSpy: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const explore = canvas.getAllByRole("button", { name: /Explore direction:/ })[0]!;
    await expect(explore).toHaveTextContent(/^Explore$/);
    await userEvent.click(explore);
    await expect(canvas.getByText("Australia")).toBeVisible();
    await expect(canvas.getByText("Shortlist")).toBeVisible();
    const contained = australia.places.find(place => australia.directions[0]!.placeIds.includes(place.id))!;
    const outside = australia.places.find(place => !australia.directions[0]!.placeIds.includes(place.id))!;
    await expect(canvas.getByRole("heading", { name: contained.name })).toBeVisible();
    await expect(canvas.queryByRole("heading", { name: outside.name })).not.toBeInTheDocument();
    await expect(args.actionSpy).toHaveBeenCalledWith({ type: "change-direction", directionId: australia.directions[0]!.id });
    await expect(args.actionSpy).toHaveBeenCalledWith({ type: "set-step", step: "places" });
    await expect(args.confirmSpy).not.toHaveBeenCalled();
  } };
export const ShortlistAddRemoveInteraction: Story = { args: { ...AustraliaPlaces.args, actionSpy: fn(), confirmSpy: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const add = canvas.getAllByRole("button", { name: /Add to shortlist:/ })[0]!;
    await expect(add).toHaveTextContent(/^Add$/);
    await userEvent.click(add);
    await expect(args.actionSpy).toHaveBeenCalledWith({ type: "add-shortlist", placeId: australia.places[0]!.id });
    await expect(within(canvas.getByRole("complementary", { name: "Shortlist places" })).getByText("1 place")).toBeVisible();
    const remove = canvas.getByRole("button", { name: /Remove from shortlist:/ });
    await expect(remove).toHaveTextContent(/^Remove$/);
    await userEvent.click(remove);
    await expect(args.actionSpy).toHaveBeenCalledWith({ type: "remove-shortlist", placeId: australia.places[0]!.id });
    await expect(within(canvas.getByRole("complementary", { name: "Shortlist places" })).getByText("0 places")).toBeVisible();
    await expect(args.confirmSpy).not.toHaveBeenCalled();
  } };
export const AustraliaBrowseOnly: Story = { args: { entry: countryEntry, mention: australiaMention,
  projection: { ...australia, places: australia.places.filter(place => place.actionability === "browse-only").slice(0, 2), visiblePlaceIds: australia.places.filter(place => place.actionability === "browse-only").slice(0, 2).map(place => place.id) }, draft: placesDraft } };
export const AustraliaExistingStop: Story = { args: { ...AustraliaPlaces.args, existingPlaceIds: [australia.places[0]!.id] } };
export const AustraliaNoPhoto: Story = { args: { ...AustraliaPlaces.args } };
export const AustraliaLoading: Story = { args: { ...AustraliaPlaces.args, loading: true } };
export const AustraliaSaveError: Story = { args: { ...AustraliaShortlist.args, saveError: "We couldn't save this choice. Your original idea is still available." } };
export const AustraliaLoadingInteraction: Story = { args: { ...AustraliaLoading.args, actionSpy: fn(), confirmSpy: fn(), closeSpy: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Finish later" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Add places" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Close Discovery" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.pointer({ keys: "[MouseLeft]", target: canvasElement.querySelector<HTMLElement>('[role="presentation"]')! });
    await expect(args.actionSpy).not.toHaveBeenCalled();
    await expect(args.confirmSpy).not.toHaveBeenCalled();
    await expect(args.closeSpy).not.toHaveBeenCalled();
  } };
export const AustraliaSpanish: Story = { args: { ...AustraliaPlaces.args, language: "es" } };
export const TajikistanSmallerCountry: Story = { args: { entry: { kind: "country", step: "places" }, mention: mention("Tajikistan"), projection: tajikistan, draft: placesDraft,
  note: "Production: three reviewed Tajikistan places, with no licensed images or verified overnight bases." } };

export const AfricaDirections: Story = { args: { entry: { kind: "continent", step: "directions" }, mention: africaMention, projection: africa, draft: initial,
  note: "Production directions derived from reviewed route families; choosing one only filters the places shown next." } };
export const AfricaPlacesAfterDirection: Story = { args: { entry: { kind: "continent", step: "directions" }, mention: africaMention, projection: africa,
  draft: { ...placesDraft, directionId: africa.directions[0]!.id }, note: "Production places for the selected reviewed route family." } };
export const JapanPlaces: Story = { args: { entry: { kind: "country", step: "places" }, mention: japanMention, projection: japan, draft: placesDraft } };
export const JapanThreeSelected: Story = { args: { ...JapanPlaces.args,
  draft: { ...placesDraft, shortlistIds: ["kanazawa", "kyoto", "osaka"] } } };
export const JapanNoPhotoCompactCards: Story = { args: { ...JapanPlaces.args,
  note: "No licensed image is assigned; media regions are omitted so these remain compact text cards." } };

export const TajLandmarkProductionSparse: Story = { args: { entry: { kind: "landmark", step: "bases" }, mention: mention("Taj Mahal"), projection: taj,
  draft: { ...initial, step: "bases" }, note: "Production: the reviewed Agra relationship resolves the landmark without turning Taj Mahal into an overnight stop." } };
export const ScopedTimingIgnoresOutsideCard: Story = { args: { ...TajLandmarkProductionSparse.args, timingDecoy: true },
  play: async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await expect(performance.getEntriesByName("discovery-mounted-to-first-card-paint")).toHaveLength(0);
  } };
export const SparsePhilippines: Story = { args: { entry: { kind: "country", step: "places" }, mention: mention("Philippines"),
  projection: { ...philippines, places: philippines.places.slice(0, 2), visiblePlaceIds: philippines.places.slice(0, 2).map(place => place.id) }, draft: placesDraft,
  note: "Real reviewed Philippine places, intentionally limited to two for the sparse layout state; no overnight claim." } };

export const Mobile390AustraliaDirections: Story = { ...AustraliaDirections, parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile390AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile390MapOptional: Story = { args: { ...AustraliaPlaces.args, actionSpy: fn(), confirmSpy: fn() },
  parameters: { viewport: { defaultViewport: "morrovia390" } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const place = australia.places[0]!;
    await userEvent.click(canvas.getByRole("heading", { name: place.name }).closest("article")!);
    await userEvent.click(canvas.getByRole("button", { name: "Map" }));
    await expect(canvas.getByRole("button", { name: "Cards" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Cards" }));
    await expect(canvas.getByRole("heading", { name: place.name }).closest("article")).toHaveFocus();
    await expect(args.actionSpy).not.toHaveBeenCalled();
    await expect(args.confirmSpy).not.toHaveBeenCalled();
  } };
export const MobileMapPreservesCanvasAfterShortlist: Story = { args: { ...AustraliaPlaces.args },
  parameters: { viewport: { defaultViewport: "morrovia390" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Map" }));
    await canvas.findByRole("button", { name: "Show card for Airlie Beach" });
    const mapCanvas = canvasElement.querySelector(".maplibregl-canvas");
    await expect(mapCanvas).not.toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Add to shortlist: Airlie Beach" }));
    await expect(canvasElement.querySelector(".maplibregl-canvas")).toBe(mapCanvas);
    await userEvent.click(canvas.getByRole("button", { name: "Remove from shortlist: Airlie Beach" }));
    await expect(canvasElement.querySelector(".maplibregl-canvas")).toBe(mapCanvas);
  } };
export const Mobile390PinRevealsExactCard: Story = { ...AustraliaPinRevealsExactCard,
  globals: { viewport: { value: "morrovia390" } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Map" }));
    const pin = await canvas.findByRole("button", { name: `Show card for ${offscreenPinPlace.name}` });
    await userEvent.click(pin);
    const card = canvas.getByRole("heading", { name: offscreenPinPlace.name }).closest("article");
    await expect(card).toHaveFocus();
    await expect(card).toHaveAttribute("data-highlighted", "true");
    await expect(canvas.getByRole("button", { name: "Map" })).toHaveAttribute("aria-expanded", "false");
    await expect(args.actionSpy).not.toHaveBeenCalled();
    await expect(args.confirmSpy).not.toHaveBeenCalled();
  } };
export const Mobile390AustraliaShortlist: Story = { ...AustraliaShortlist, parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile390AfricaDirections: Story = { ...AfricaDirections, parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile390AfricaPlaces: Story = { ...AfricaPlacesAfterDirection, args: { ...AfricaPlacesAfterDirection.args, language: "es" },
  parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile390JapanPlaces: Story = { ...JapanPlaces, parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile390JapanSelected: Story = { ...JapanThreeSelected, parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile390Sparse: Story = { ...SparsePhilippines, parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile320AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia320" } } };
export const Mobile430AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia430" } } };
export const Tablet768AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia768" } } };
export const Desktop1024AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia1024" } } };
export const Desktop1440AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia1440" } } };
export const Desktop1680AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia1680" } } };

const commitTrip = tripFromBuilder({ id: "discovery-commit-story", origin: "London", stops: [],
  startDate: "2026-10-01", endDate: "2026-10-15", picks: {}, mustDo: "Japan", pace: "slow", hotels: "few", budget: "mid", draft: [] });
export const CanonicalCommitBoundary: Story = { args: { ...JapanThreeSelected.args, canonicalTrip: commitTrip } };
