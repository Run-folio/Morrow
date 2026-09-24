import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DiscoveryModal } from "./discovery-modal";
import { createDiscoveryDraft, reduceDiscoveryDraft, type DiscoveryDraft, type DiscoveryDraftAction } from "@/lib/easyt/discovery-draft";
import { projectDiscovery, type DiscoveryProjection } from "@/lib/easyt/discovery-projection";
import type { DiscoveryPlace } from "@/lib/easyt/discovery-content";
import type { DiscoveryDirection } from "@/lib/easyt/discovery-directions";
import type { DiscoveryEntry } from "@/lib/easyt/discovery-entry";
import { resolvePlaceMentions, type ResolvedPlaceMention } from "@/lib/easyt/place-intelligence";

const mention = (name: string) => resolvePlaceMentions(name).mentions[0]!;
const initial = createDiscoveryDraft();
const projection = (name: string, draft = initial) => projectDiscovery({ mention: mention(name), draft, context: { interests: [], existingPlaceIds: [] } });
const australia = projection("Australia");
const tajikistan = projection("Tajikistan");
const philippines = projection("Philippines");
const taj = projection("Taj Mahal");
const australiaMention = mention("Australia");

type Scene = { entry: DiscoveryEntry; mention: ResolvedPlaceMention; projection: DiscoveryProjection; draft: DiscoveryDraft;
  language?: "en" | "es"; existingPlaceIds?: string[]; note?: string; loading?: boolean;
  actionSpy?: (action: DiscoveryDraftAction) => void; confirmSpy?: () => void; closeSpy?: () => void };

function SceneModal({ entry, mention: sceneMention, projection: sceneProjection, draft: initialDraft, language = "en", existingPlaceIds = [], note, loading, actionSpy, confirmSpy, closeSpy }: Scene) {
  const [draft, setDraft] = useState(initialDraft);
  const [searchValue, setSearchValue] = useState("");
  const onAction = (action: DiscoveryDraftAction) => { actionSpy?.(action); setDraft(current => reduceDiscoveryDraft(current, action)); };
  return <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: 20 }}>
    <p style={{ maxWidth: 780, margin: 0 }}>{note ?? "Reviewed production evidence; no licensed image is currently assigned to these places."}</p>
    <DiscoveryModal open entry={entry} mention={sceneMention} projection={sceneProjection} draft={draft} language={language} loading={loading}
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
export const AustraliaShortlist: Story = { args: { entry: countryEntry, mention: australiaMention, projection: australia, draft: selectedDraft } };
export const AustraliaReview: Story = { args: { entry: countryEntry, mention: australiaMention, projection: australia, draft: { ...selectedDraft, step: "review" } } };
const supportedBase = australia.places.find(place => place.actionability === "overnight-base")!;
const exploratoryVisit = australia.places.find(place => place.actionability === "visit")!;
const outsideDirection = australia.directions.find(direction => !direction.placeIds.includes(supportedBase.id))!;
export const AustraliaReviewMixed: Story = { args: { entry: countryEntry, mention: australiaMention, projection: australia,
  draft: { ...initial, step: "review", directionId: outsideDirection.id, shortlistIds: [supportedBase.id, exploratoryVisit.id],
    baseByIntentId: { [australiaMention.mentionId]: supportedBase.id } }, existingPlaceIds: [supportedBase.id] } };
export const AustraliaReviewResolveInteraction: Story = { args: { ...AustraliaReviewMixed.args },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Confirm places" })).toBeDisabled();
    await expect(canvas.getByText("Some places aren’t ready to add yet.")).toBeVisible();
    await expect(canvas.getAllByText("Outside your selected direction")[0]).toBeVisible();
    const remove = canvas.getAllByRole("button", { name: /Remove from shortlist:/ })[1]!;
    await expect(remove).toHaveTextContent(/^Remove$/);
    await userEvent.click(remove);
    await expect(canvas.getByRole("button", { name: "Confirm places" })).toBeEnabled();
  } };
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
export const AustraliaLoadingInteraction: Story = { args: { ...AustraliaLoading.args, actionSpy: fn(), confirmSpy: fn(), closeSpy: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Back" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Finish later" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeDisabled();
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

// Layout fixture only: production Africa currently has one reviewed place and no supported direction pair.
// Fictional labels assert no travel facts and never enter the production content catalogue.
const fixtureSource = { id: "visual-fixture", label: "Layout fixture only", kind: "curated" as const,
  url: "https://example.com", reviewedAt: "2026-09-24", supports: "UI layout fixture; no visitor claim." };
const africaFixturePlaces: DiscoveryPlace[] = Array.from({ length: 6 }, (_, index) => ({
  ...australia.places[index]!, id: `fixture-africa-${index + 1}`, name: `Fixture location ${index + 1}`,
  country: "Africa layout fixture", group: index < 3 ? "fixture-a" : "fixture-b",
  groupIds: [index < 3 ? "fixture-a" : "fixture-b"], actionability: "browse-only" as const,
  imageKey: null, relevance: { en: "Layout fixture only; visitor evidence is not available.", es: "Solo maqueta; no hay datos revisados para visitantes.", sources: [fixtureSource] },
  stayEvidence: [], accessEvidence: [],
}));
const africaFixtureDirections: DiscoveryDirection[] = [
  { id: "fixture-a", titleKey: "fixture.direction.a", placeIds: africaFixturePlaces.slice(0, 3).map(place => place.id), imageKey: null },
  { id: "fixture-b", titleKey: "fixture.direction.b", placeIds: africaFixturePlaces.slice(3).map(place => place.id), imageKey: null },
];
const africaMention = { ...mention("Africa"), canonicalName: "Africa · layout fixture", sourceText: "Africa — layout fixture" };
const africaFixture = projectDiscovery({ mention: africaMention, draft: initial, context: { interests: [], existingPlaceIds: [] }, evidence: { places: africaFixturePlaces, directions: africaFixtureDirections } });
export const AfricaDirectionsFixture: Story = { args: { entry: { kind: "continent", step: "directions" }, mention: africaMention, projection: africaFixture, draft: initial,
  note: "LAYOUT FIXTURE: two direction groups and six placeholder locations. Production Africa has one reviewed place; these are not recommendations." } };

const tajFixtureBase: DiscoveryPlace = { ...australia.places[0]!, id: "fixture-taj-base", name: "Fixture base — not reviewed",
  country: "India layout fixture", group: "fixture", groupIds: [], imageKey: null, actionability: "overnight-base",
  relevance: { en: "Layout fixture only; base evidence is not available.", es: "Solo maqueta; no hay evidencia verificada de la base.", sources: [fixtureSource] },
  stayEvidence: [fixtureSource], accessEvidence: [] };
const tajFixtureProjection = { ...taj, places: [tajFixtureBase], visiblePlaceIds: [tajFixtureBase.id], counts: { source: 1, eligible: 1, ranked: 1, displayed: 1 } };
export const TajLandmarkBaseFixture: Story = { args: { entry: { kind: "landmark", step: "bases" }, mention: { ...mention("Taj Mahal"), canonicalName: "Taj Mahal · base layout fixture", sourceText: "Taj Mahal — base layout fixture" },
  projection: tajFixtureProjection, draft: { ...initial, step: "bases" },
  note: "LAYOUT FIXTURE: the base is a placeholder, not an evidenced Taj Mahal access or overnight recommendation." } };
export const TajLandmarkProductionSparse: Story = { args: { entry: { kind: "landmark", step: "bases" }, mention: mention("Taj Mahal"), projection: taj,
  draft: { ...initial, step: "bases" }, note: "Production: no reviewed Taj base in Discovery. Search or Finish later preserves the landmark intent." } };
export const SparsePhilippines: Story = { args: { entry: { kind: "country", step: "places" }, mention: mention("Philippines"),
  projection: { ...philippines, places: philippines.places.slice(0, 2), visiblePlaceIds: philippines.places.slice(0, 2).map(place => place.id) }, draft: placesDraft,
  note: "Real reviewed Philippine places, intentionally limited to two for the sparse layout state; no overnight claim." } };

export const Mobile390AustraliaDirections: Story = { ...AustraliaDirections, parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile390AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile390AustraliaShortlist: Story = { ...AustraliaShortlist, parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile390Sparse: Story = { ...SparsePhilippines, parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const Mobile320AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia320" } } };
export const Mobile430AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia430" } } };
export const Tablet768AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia768" } } };
export const Desktop1024AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia1024" } } };
export const Desktop1440AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia1440" } } };
export const Desktop1680AustraliaPlaces: Story = { ...AustraliaPlaces, parameters: { viewport: { defaultViewport: "morrovia1680" } } };
