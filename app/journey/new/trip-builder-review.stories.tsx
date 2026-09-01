import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AlertTriangle, Check, CheckCircle2, ChevronRight, MapPin, X } from "lucide-react";
import { EasyTButton, EasyTField } from "@/components/easyt/easyt-controls";
import { TOUR_TRIP_ROUTE, tourTripFixture } from "@/components/easyt/storybook/tour-trip.fixture";
import styles from "./trip-builder.module.css";

type ReviewState = "unresolved" | "partial" | "resolved" | "inline-base" | "broad-area" | "route-shapes" | "route-shape-review" | "route-shape-applied" | "interest-guidance" | "low-knowledge" | "anchor-guidance" | "reorder" | "accepted" | "normal" | "compressed" | "unknown" | "arrival" | "tour";

const bases = [
  ["Belize", "Caye Caulker"],
  ["Tikal", "Flores"],
  ["Lake Atitlán", "San Pedro La Laguna"],
] as const;

function ConfirmedBases({ count = 3 }: { count?: number }) {
  return <section className={styles.resolvedPlaces} aria-label="Confirmed stay bases">
    <header><CheckCircle2 aria-hidden="true" /><span><strong>STAY BASES CONFIRMED</strong><small>Your requested destinations remain linked to these overnight bases.</small></span></header>
    <div>{bases.slice(0, count).map(([anchor, base]) => <article key={anchor} aria-label={`${anchor}, staying in ${base}`}>
      <Check aria-hidden="true" /><p><strong>{anchor}</strong><span>staying in {base}</span></p><EasyTButton variant="quiet" size="small">Change<span className="sr-only"> {anchor}</span></EasyTButton>
    </article>)}</div>
  </section>;
}

function GeographyReview({ resolved = 0 }: { resolved?: number }) {
  const pending = bases.slice(resolved);
  return <>
    {resolved > 0 && <ConfirmedBases count={resolved} />}
    {pending.length > 0 && <section className={styles.recognizedPlaces} aria-label="Shape your route">
      <header><strong>SHAPE YOUR ROUTE</strong><span>Choose concrete route places for the broad areas we recognised.</span></header>
      <div>{pending.map(([anchor, base]) => <article key={anchor} className={styles.recognizedPlaceNeedsAction}>
        <div className={styles.recognizedPlaceIdentity}><span><b>{anchor}</b><small>Choose where to stay</small></span></div>
        <p>Choose an overnight base so Morrovia can include {anchor} in the route.</p>
        <div className={styles.placeResolutionOptions}><EasyTButton variant="secondary" size="small" icon={MapPin}>{base}</EasyTButton></div>
      </article>)}</div>
    </section>}
  </>;
}

function InlineBaseClarification() {
  return <section className={styles.placesSection} aria-label="Add stop">
    <div className={styles.placesSectionHead}><strong>Stops</strong><EasyTButton variant="secondary" size="small">+ Add stop</EasyTButton></div>
    <div className={styles.stopEditor}>
      <div className={styles.inlinePlanningClarification}>
        <div className={styles.inlinePlanningIdentity} role="status"><strong>Scotland</strong><span>Region</span><p>Where in Scotland would you like to stay?</p></div>
        <div className={styles.inlinePlanningSearch}><div className={styles.placeAutocomplete}><input aria-label="Choose a base in Scotland" placeholder="Search cities and places in Scotland" /></div><button type="button">Cancel</button></div>
      </div>
    </div>
  </section>;
}

function BroadAreaGuidance() {
  return <section className={styles.recognizedPlaces} aria-label="Shape your route">
    <header><strong>SHAPE YOUR ROUTE</strong><span>Choose concrete route places for the broad areas we recognised.</span></header>
    <div><article className={styles.recognizedPlaceNeedsAction}>
      <div className={styles.recognizedPlaceIdentity}><span><b>Thailand</b><small>Country · Choose one or more places</small></span></div>
      <p>We recognised Thailand. Add one or more places to turn that broad idea into a route.</p>
      <div className={styles.guidedAreaSuggestions} aria-label="Suggestions for Thailand"><strong>SUGGESTED PLACES</strong><div>
        {["Bangkok", "Chiang Mai", "Phuket", "Ayutthaya"].map((place) => <EasyTButton type="button" variant="secondary" icon={MapPin} key={place}><span><b>{place}</b><small>Thailand · Reviewed route choice</small></span></EasyTButton>)}
      </div></div>
      <div className={styles.guidedAreaSelected} aria-live="polite"><strong>SELECTED</strong><div><span>Bangkok<EasyTButton type="button" variant="quiet" size="small" icon={X} iconOnly>Remove Bangkok</EasyTButton></span></div></div>
      <div className={styles.baseSelector}><EasyTField label="Have somewhere else in mind?" placeholder="Search within Thailand" /><EasyTButton variant="secondary" size="small" icon={Check}>Done adding places</EasyTButton></div>
    </article></div>
  </section>;
}

function RouteShapeGuidance({ state = "initial" }: { state?: "initial" | "review" | "applied" }) {
  return <section className={styles.recognizedPlaces} aria-label="Shape your route">
    <header><strong>SHAPE YOUR ROUTE</strong><span>Choose concrete route places for the broad areas we recognised.</span></header>
    <div><article className={styles.recognizedPlaceNeedsAction}>
      <div className={styles.recognizedPlaceIdentity}><span><b>Thailand</b><small>Country · Choose one or more places</small></span></div>
      <p>We recognised Thailand. Add one or more places to turn that broad idea into a route.</p>
      {state !== "applied" && <div className={styles.guidedAreaShapes} aria-label="Ways to shape Thailand">
        <strong>WAYS YOU COULD SHAPE THIS</strong>
        <div><section className={state === "review" ? styles.guidedAreaShapeReviewing : undefined}>
          {/* morrovia-ui-audit-allow-next-line native-control -- Story mirrors the production route-shape disclosure's aria-expanded interaction. */}
          <button type="button" aria-expanded={state === "review"}><span><b>Bangkok + Chiang Mai</b><small>Food · Nature · Culture</small><em>Good match for Food + Culture.</em></span><ChevronRight aria-hidden="true" /></button>
          {state === "review" && <div className={styles.guidedAreaShapeReview}><p>Review the places before adding them. Nothing has changed yet.</p><ul><li>Bangkok<span>Thailand</span></li><li>Chiang Mai<span>Thailand</span></li></ul><div><EasyTButton size="small">Add these places</EasyTButton><EasyTButton variant="quiet" size="small">Cancel</EasyTButton></div></div>}
        </section></div>
        <EasyTButton type="button" variant="quiet" size="small" className={styles.guidedAreaMore}>See other places</EasyTButton>
      </div>}
      {state === "applied" && <div className={styles.guidedAreaSelected}><strong>SELECTED</strong><div><span>Bangkok<EasyTButton type="button" variant="quiet" size="small" icon={X} iconOnly>Remove Bangkok</EasyTButton></span><span>Chiang Mai<EasyTButton type="button" variant="quiet" size="small" icon={X} iconOnly>Remove Chiang Mai</EasyTButton></span></div><EasyTButton type="button" variant="quiet" size="small" className={styles.guidedAreaMore}>Explore another route</EasyTButton></div>}
      <div className={styles.baseSelector}><EasyTField label="Have somewhere else in mind?" placeholder="Search within Thailand" /><EasyTButton variant="secondary" size="small" icon={Check} disabled={state !== "applied"}>Done adding places</EasyTButton></div>
    </article></div>
  </section>;
}

function InterestGuidance() {
  return <section className={styles.recognizedPlaces} aria-label="Shape your route"><header><strong>SHAPE YOUR ROUTE</strong><span>Choose concrete route places for the broad areas we recognised.</span></header><div><article className={styles.recognizedPlaceNeedsAction}>
    <div className={styles.recognizedPlaceIdentity}><span><b>Panama</b><small>Country · Choose one or more places</small></span></div><p>We do not have a reviewed multi-place route shape here yet.</p>
    <div className={styles.guidedAreaQuestion}><strong>WHAT WOULD YOU LIKE MORE OF?</strong><div>{["Cities", "Beach", "Nature", "Food", "Culture", "Hiking"].map((interest) => <EasyTButton type="button" variant="secondary" size="small" key={interest}>{interest}</EasyTButton>)}</div><EasyTButton type="button" variant="quiet" size="small" className={styles.guidedAreaMore}>See places without choosing a preference</EasyTButton></div>
    <div className={styles.baseSelector}><EasyTField label="Have somewhere else in mind?" placeholder="Search within Panama" /></div>
  </article></div></section>;
}

function LowKnowledgeGuidance() {
  return <section className={styles.recognizedPlaces} aria-label="Shape your route"><header><strong>SHAPE YOUR ROUTE</strong><span>Choose concrete route places for the broad areas we recognised.</span></header><div><article className={styles.recognizedPlaceNeedsAction}>
    <div className={styles.recognizedPlaceIdentity}><span><b>Iran</b><small>Country · Choose one or more places</small></span></div><p>We recognised Iran, but do not have enough reviewed route knowledge to suggest a route shape.</p>
    <div className={styles.baseSelector}><EasyTField label="Choose a place in Iran" placeholder="Search within Iran" /></div>
  </article></div></section>;
}

function AnchorGuidance() {
  return <section className={styles.recognizedPlaces} aria-label="Shape your route"><header><strong>SHAPE YOUR ROUTE</strong><span>Choose concrete route places for the broad areas we recognised.</span></header><div><article className={styles.recognizedPlaceNeedsAction}>
    <div className={styles.recognizedPlaceIdentity}><span><b>Africa</b><small>Continent · Serengeti is shaping these ideas</small></span></div><p>We recognised Africa and kept your Serengeti request as the stronger signal.</p>
    <div className={styles.guidedAreaShapes}><strong>WAYS YOU COULD SHAPE THIS</strong><div><section>
      {/* morrovia-ui-audit-allow-next-line native-control -- Story mirrors the production route-shape disclosure's aria-expanded interaction. */}
      <button type="button" aria-expanded="false"><span><b>East Africa, wildlife with space</b><small>Nairobi + Maasai Mara + Zanzibar</small><em>Responds to your Serengeti request using reviewed route knowledge.</em></span><ChevronRight aria-hidden="true" /></button></section></div></div>
    <div className={styles.baseSelector}><EasyTField label="Have somewhere else in mind?" placeholder="Search within Africa" /></div>
  </article></div></section>;
}

function RouteReview({ accepted = false }: { accepted?: boolean }) {
  return <section className={styles.routeCheck} aria-live="polite">
    <div><p>ROUTE CHECK</p>{accepted
      ? <><h3>This order keeps the trip moving in a sensible direction.</h3><span>Cancún → Tulum → Caye Caulker → Flores → Antigua Guatemala → San Pedro La Laguna</span></>
      : <><h3>A cleaner order is available.</h3><span>Cancún → Tulum → Caye Caulker → Flores → Antigua Guatemala → San Pedro La Laguna</span><span className={styles.routeCheckReason}>It reduces unnecessary backtracking between your stops.</span></>}
    </div>
    {!accepted && <div className={styles.routeCheckActions}><EasyTButton size="small">Use this order</EasyTButton><EasyTButton size="small" variant="secondary">Keep my order</EasyTButton></div>}
  </section>;
}

function TourRouteReview() {
  return <div style={{ display: "grid", gap: 16, padding: 24 }}>
    <section className={styles.routeCheck} aria-label="Tour route review">
      <div><p>ROUTE CHECK</p><h3>This order keeps the trip moving in a sensible direction.</h3><span>{TOUR_TRIP_ROUTE}</span><span className={styles.routeCheckReason}>Seven nights, with the longest transfer protected as a travel day.</span></div>
    </section>
    <section className={styles.resolvedPlaces} aria-label="Confirmed stay structure">
      <header><CheckCircle2 aria-hidden="true" /><span><strong>STAY STRUCTURE CONFIRMED</strong><small>Each overnight base has enough time to support the route.</small></span></header>
      <div>{tourTripFixture.stops.map((stop) => <article key={stop.id} aria-label={`${stop.name}, ${stop.nights} nights`}><Check aria-hidden="true" /><p><strong>{stop.name}</strong><span>{stop.nights} nights</span></p></article>)}</div>
    </section>
  </div>;
}

function TimingReview({ kind }: { kind: "normal" | "compressed" | "unknown" | "arrival" }) {
  const title = kind === "compressed" ? "6 stops in 7 days is very fast-paced."
    : kind === "unknown" ? "One major transfer still needs checking."
      : kind === "arrival" ? "The arrival journey takes most of the first day."
        : "This trip has a comfortable amount of time in each place.";
  const summary = kind === "compressed" ? "6 stops have one night or less, and one transfer still needs checking."
    : kind === "unknown" ? "Transfer to confirm · Mode and timing still need checking."
      : kind === "arrival" ? "From London · Keep the first evening light after arrival."
        : "All nights are allocated, with time protected around the known transfers.";
  return <div style={{ display: "grid", gap: 12 }}>
    <div className={styles.timeAllocationState}><span className={styles.allocationLabel}>NIGHTS ALLOCATED</span><p><CheckCircle2 aria-hidden="true" /><strong>6 nights total</strong><span aria-hidden="true">•</span><b>All nights allocated</b></p></div>
    <section className={`${styles.timingWarning} ${kind === "compressed" ? styles.timingWarningStrong : ""}`} role="status" aria-label={`${kind === "compressed" ? "Strong caution" : "Trip pacing"}: ${title}`}>
      <button type="button" className={styles.disclosureHead} aria-expanded="false"><AlertTriangle aria-hidden="true" /><span><strong>{title}</strong><small>{summary}</small></span><ChevronRight aria-hidden="true" /></button>
    </section>
  </div>;
}

function ReviewFixture({ state }: { state: ReviewState }) {
  return <main className="morrovia-editorial-page" style={{ width: "min(100%, 980px)", margin: "0 auto", padding: 16 }}>
    <section style={{ overflow: "hidden", border: "1px solid var(--morrovia-line)", borderRadius: 14, background: "#fff" }}>
      {state === "unresolved" && <GeographyReview />}
      {state === "partial" && <GeographyReview resolved={1} />}
      {state === "resolved" && <ConfirmedBases />}
      {state === "inline-base" && <InlineBaseClarification />}
      {state === "broad-area" && <BroadAreaGuidance />}
      {state === "route-shapes" && <RouteShapeGuidance />}
      {state === "route-shape-review" && <RouteShapeGuidance state="review" />}
      {state === "route-shape-applied" && <RouteShapeGuidance state="applied" />}
      {state === "interest-guidance" && <InterestGuidance />}
      {state === "low-knowledge" && <LowKnowledgeGuidance />}
      {state === "anchor-guidance" && <AnchorGuidance />}
      {state === "reorder" && <RouteReview />}
      {state === "accepted" && <RouteReview accepted />}
      {state === "tour" && <TourRouteReview />}
      {(["normal", "compressed", "unknown", "arrival"] as ReviewState[]).includes(state) && <div style={{ padding: 16 }}><TimingReview kind={state as "normal" | "compressed" | "unknown" | "arrival"} /></div>}
    </section>
  </main>;
}

const meta = {
  title: "Morrovia/05 Product Patterns/Builder review",
  component: ReviewFixture,
  args: { state: "resolved" },
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof ReviewFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnresolvedClarification: Story = { args: { state: "unresolved" } };
export const PartiallyResolvedClarification: Story = { args: { state: "partial" } };
export const AllClarificationsResolved: Story = { args: { state: "resolved" } };
export const InlinePlanningAreaBaseSelection: Story = { args: { state: "inline-base" } };
export const BroadAreaMultiPlaceGuidance: Story = { args: { state: "broad-area" } };
export const CountryWithReviewedRouteShapes: Story = { args: { state: "route-shapes" } };
export const RouteShapeReviewedNotApplied: Story = { args: { state: "route-shape-review" } };
export const MultipleShapePlacesAppliedParentOpen: Story = { args: { state: "route-shape-applied" } };
export const CountryInterestLedNarrowing: Story = { args: { state: "interest-guidance" } };
export const CountryWithoutReviewedRouteShape: Story = { args: { state: "low-knowledge" } };
export const ContinentWithStrongSpecificAnchor: Story = { args: { state: "anchor-guidance" } };
export const RouteReorderSuggestion: Story = { args: { state: "reorder" } };
export const AcceptedRouteOrder: Story = { args: { state: "accepted" } };
export const TourCapture: Story = { args: { state: "tour" } };
export const NormalPacedTrip: Story = { args: { state: "normal" } };
export const HighlyCompressedTrip: Story = { args: { state: "compressed" } };
export const UnknownMajorTransfer: Story = { args: { state: "unknown" } };
export const LongArrival: Story = { args: { state: "arrival" } };
export const ClarificationAt390: Story = { args: { state: "partial" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const InlineBaseSelectionAt390: Story = { args: { state: "inline-base" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const BroadAreaGuidanceAt390: Story = { args: { state: "broad-area" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const RouteShapeReviewAt390: Story = { args: { state: "route-shape-review" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const CompressedWarningAt390: Story = { args: { state: "compressed" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const BuilderReviewAt768: Story = { args: { state: "resolved" }, globals: { viewport: { value: "morrovia768", isRotated: false } } };
