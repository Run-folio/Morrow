import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AlertTriangle, Check, CheckCircle2, ChevronRight, MapPin } from "lucide-react";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { TOUR_TRIP_ROUTE, tourTripFixture } from "@/components/easyt/storybook/tour-trip.fixture";
import styles from "./trip-builder.module.css";

type ReviewState = "unresolved" | "partial" | "resolved" | "inline-base" | "reorder" | "accepted" | "normal" | "compressed" | "unknown" | "arrival" | "tour";

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
    {pending.length > 0 && <section className={styles.recognizedPlaces} aria-label="Geography to review">
      <header><strong>GEOGRAPHY TO REVIEW</strong><span>Only places needing a decision appear here.</span></header>
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
export const RouteReorderSuggestion: Story = { args: { state: "reorder" } };
export const AcceptedRouteOrder: Story = { args: { state: "accepted" } };
export const TourCapture: Story = { args: { state: "tour" } };
export const NormalPacedTrip: Story = { args: { state: "normal" } };
export const HighlyCompressedTrip: Story = { args: { state: "compressed" } };
export const UnknownMajorTransfer: Story = { args: { state: "unknown" } };
export const LongArrival: Story = { args: { state: "arrival" } };
export const ClarificationAt390: Story = { args: { state: "partial" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const InlineBaseSelectionAt390: Story = { args: { state: "inline-base" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const CompressedWarningAt390: Story = { args: { state: "compressed" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const BuilderReviewAt768: Story = { args: { state: "resolved" }, globals: { viewport: { value: "morrovia768", isRotated: false } } };
